import { sql } from "@databases/mysql";
import { storage } from "../storage";
import { logger } from "../logger";
import { clearTranslationCaches, hasPluralFormsCache, pluralFormsCache, translationIdByKeyCache, translationValueCache } from "./translationCache";
import { normalizeTargetLangs } from "./translationLanguages";
import * as translationGeneration from "./translationGeneration";

let supportsTranslationKeyHashLookup: boolean | null = null;

function keyWithNamespace(key: string, namespace: string | null): string {
	return `${namespace ?? "__NULL__"}:${key}`;
}

function translationLangKey(translationId: number, lang: string): string {
	return `${translationId}:${lang}`;
}

function buildKeyNamespaceWhereClause(pairs: Array<{ key: string; namespace: string | null }>, caseInsensitive: boolean): any {
	let whereClause = sql`FALSE`;

	for (const pair of pairs) {
		if (caseInsensitive) {
			whereClause = sql`${whereClause} OR (LOWER(\`key\`) = LOWER(${pair.key}) AND namespace <=> ${pair.namespace})`;
		} else {
			whereClause = sql`${whereClause} OR (\`key\` = ${pair.key} AND namespace <=> ${pair.namespace})`;
		}
	}

	return whereClause;
}

function isMissingKeyHashColumnError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const err = error as { code?: string; sqlMessage?: string };
	return err.code === 'ER_BAD_FIELD_ERROR' && err.sqlMessage?.includes('key_hash') === true;
}

function parseJsonObjectFromLlm(raw: string): Record<string, any> | null {
	if (!raw) return null;
	const trimmed = raw.trim();
	const withoutCodeFence = trimmed
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim();

	try {
		const parsed = JSON.parse(withoutCodeFence);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, any>;
		}
		return null;
	} catch {
		return null;
	}
}

export const translationModel = {
	async getByKeys(inputs: Array<{ key: string; namespace: string | null }>): Promise<Array<number | null>> {
		if (inputs.length === 0) return [];

		const results: Array<number | null> = new Array(inputs.length).fill(null);
		const uniqueInputByCacheKey = new Map<string, { key: string; namespace: string | null }>();
		const inputIndexesByCacheKey = new Map<string, number[]>();

		for (let index = 0; index < inputs.length; index++) {
			const input = inputs[index];
			const cacheKey = keyWithNamespace(input.key, input.namespace);
			const cachedId = translationIdByKeyCache.get(cacheKey);
			if (cachedId !== undefined) {
				results[index] = cachedId;
				continue;
			}

			if (!uniqueInputByCacheKey.has(cacheKey)) {
				uniqueInputByCacheKey.set(cacheKey, input);
			}

			const indexes = inputIndexesByCacheKey.get(cacheKey) || [];
			indexes.push(index);
			inputIndexesByCacheKey.set(cacheKey, indexes);
		}

		const missingInputs = Array.from(uniqueInputByCacheKey.values());
		if (missingInputs.length === 0) {
			return results;
		}

		const exactWhereClause = buildKeyNamespaceWhereClause(missingInputs, false);
		const exactMatches = await storage().query(
			sql`SELECT id, \`key\`, namespace FROM translations WHERE ${exactWhereClause}`
		);

		const foundIdsByCacheKey = new Map<string, number>();
		for (const row of exactMatches) {
			const cacheKey = keyWithNamespace(row.key, row.namespace ?? null);
			if (!foundIdsByCacheKey.has(cacheKey)) {
				foundIdsByCacheKey.set(cacheKey, row.id);
			}
		}

		const unresolved = missingInputs.filter((input) => !foundIdsByCacheKey.has(keyWithNamespace(input.key, input.namespace)));

		if (unresolved.length > 0) {
			const caseInsensitiveWhereClause = buildKeyNamespaceWhereClause(unresolved, true);
			const caseInsensitiveMatches = await storage().query(
				sql`SELECT id, \`key\`, namespace FROM translations WHERE ${caseInsensitiveWhereClause}`
			);

			for (const row of caseInsensitiveMatches) {
				const matchedInput = unresolved.find(
					(input) => input.namespace === (row.namespace ?? null) && input.key.toLowerCase() === String(row.key).toLowerCase()
				);

				if (!matchedInput) continue;
				const cacheKey = keyWithNamespace(matchedInput.key, matchedInput.namespace);
				if (!foundIdsByCacheKey.has(cacheKey)) {
					foundIdsByCacheKey.set(cacheKey, row.id);
				}
			}
		}

		for (const input of missingInputs) {
			const cacheKey = keyWithNamespace(input.key, input.namespace);
			const translationId = foundIdsByCacheKey.get(cacheKey) ?? null;
			translationIdByKeyCache.set(cacheKey, translationId);

			const indexes = inputIndexesByCacheKey.get(cacheKey) || [];
			for (const index of indexes) {
				results[index] = translationId;
			}
		}

		return results;
	},

	async getByKey(key: string, namespace: string | null = null): Promise<number | null> {
		logger.debug(`[getByKey] Looking up translation with key: "${key}", namespace: "${namespace}"`);
		const cacheKey = keyWithNamespace(key, namespace);
		const cachedId = translationIdByKeyCache.get(cacheKey);
		if (cachedId !== undefined) {
			logger.debug(`[getByKey] Cache hit for "${key}", namespace "${namespace}":`, { translationId: cachedId });
			return cachedId;
		}

		let result: Array<{ id: number }> = [];

		if (supportsTranslationKeyHashLookup !== false) {
			try {
				result = await storage().query(
					sql`SELECT id FROM translations
						WHERE key_hash = SHA2(${key}, 256)
						  AND \`key\` = ${key}
						  AND namespace <=> ${namespace}
						LIMIT 1`
				);
				supportsTranslationKeyHashLookup = true;
			} catch (error) {
				if (!isMissingKeyHashColumnError(error)) {
					throw error;
				}

				supportsTranslationKeyHashLookup = false;
				logger.warn('[getByKey] key_hash column missing, falling back to key lookup');
			}
		}

		if (result.length === 0 && supportsTranslationKeyHashLookup === false) {
			result = await storage().query(
				sql`SELECT id FROM translations
					WHERE \`key\` = ${key}
					  AND namespace <=> ${namespace}
					LIMIT 1`
			);
		}

		if (result.length === 0) {
			logger.debug(`[getByKey] Exact match not found, trying case-insensitive for "${key}"`);
			result = await storage().query(
				sql`SELECT id FROM translations WHERE LOWER(\`key\`) = LOWER(${key}) AND namespace <=> ${namespace} LIMIT 1`
			);
			if (result.length > 0) {
				logger.debug(`[getByKey] Found case-insensitive match:`, { id: result[0].id });
			}
		}

		const translationId = result.length > 0 ? result[0].id : null;
		translationIdByKeyCache.set(cacheKey, translationId);
		logger.debug(`[getByKey] Result for "${key}", namespace "${namespace}":`, { translationId });
		return translationId;
	},

	async hasPluralFormsBatch(translationIds: number[]): Promise<boolean[]> {
		if (translationIds.length === 0) return [];

		const results: boolean[] = new Array(translationIds.length).fill(false);
		const missingIds = new Set<number>();
		const indexById = new Map<number, number[]>();

		for (let index = 0; index < translationIds.length; index++) {
			const translationId = translationIds[index];
			const cacheKey = String(translationId);
			const cached = hasPluralFormsCache.get(cacheKey);
			if (cached !== undefined) {
				results[index] = cached;
				continue;
			}

			missingIds.add(translationId);
			const indexes = indexById.get(translationId) || [];
			indexes.push(index);
			indexById.set(translationId, indexes);
		}

		if (missingIds.size === 0) {
			return results;
		}

		let whereClause = sql`FALSE`;
		for (const translationId of missingIds) {
			whereClause = sql`${whereClause} OR translation_id = ${translationId}`;
		}

		const pluralRows = await storage().query(
			sql`SELECT translation_id, COUNT(*) as count FROM plural_forms WHERE ${whereClause} GROUP BY translation_id`
		);

		const countByTranslationId = new Map<number, number>();
		for (const row of pluralRows) {
			countByTranslationId.set(row.translation_id, row.count);
		}

		for (const translationId of missingIds) {
			const hasPlurals = (countByTranslationId.get(translationId) || 0) > 0;
			hasPluralFormsCache.set(String(translationId), hasPlurals);
			const indexes = indexById.get(translationId) || [];
			for (const index of indexes) {
				results[index] = hasPlurals;
			}
		}

		return results;
	},

	async hasPluralForms(translationId: number): Promise<boolean> {
		logger.debug(`[hasPluralForms] Checking plural forms for translationId: ${translationId}`);
		const cacheKey = String(translationId);
		const cachedHasPlurals = hasPluralFormsCache.get(cacheKey);
		if (cachedHasPlurals !== undefined) {
			return cachedHasPlurals;
		}

		const result = await storage().query(
			sql`SELECT COUNT(*) as count FROM plural_forms WHERE translation_id = ${translationId} LIMIT 1`
		);

		const hasPlurals = result.length > 0 && result[0].count > 0;
		hasPluralFormsCache.set(cacheKey, hasPlurals);
		logger.debug(`[hasPluralForms] Result for translationId ${translationId}:`, {
			count: result[0]?.count || 0,
			hasPlurals
		});

		return hasPlurals;
	},

	async getOrCreate(key: string, context: string = null, namespace: string = null): Promise<number> {
		const cacheKey = keyWithNamespace(key, namespace);
		const cachedId = translationIdByKeyCache.get(cacheKey);
		if (cachedId !== undefined && cachedId !== null) {
			return cachedId;
		}

		const existingId = await this.getByKey(key, namespace);
		if (existingId !== null) {
			return existingId;
		}

		try {
			await storage().query(
				sql`INSERT INTO translations (\`key\`, namespace, context) VALUES (${key}, ${namespace}, ${context})`
			);
		} catch (error) {
			if ((error as any)?.code === 'ER_DUP_ENTRY') {
				const duplicatedId = await this.getByKey(key, namespace);
				if (duplicatedId !== null) {
					return duplicatedId;
				}
			}
			throw error;
		}

		translationIdByKeyCache.delete(cacheKey);
		const createdId = await this.getByKey(key, namespace);
		if (createdId === null) {
			throw new Error(`Failed to create translation key "${key}" in namespace "${namespace}"`);
		}

		return createdId;
	},

	async getValue(translationId: number, lang: string): Promise<string | null> {
		const cacheKey = translationLangKey(translationId, lang);
		const cachedValue = translationValueCache.get(cacheKey);
		if (cachedValue !== undefined) {
			return cachedValue;
		}

		const result = await storage().query(
			sql`SELECT value FROM translation_values 
				WHERE translation_id = ${translationId} AND lang = ${lang} LIMIT 1`
		);

		const value = result.length > 0 ? result[0].value : null;
		translationValueCache.set(cacheKey, value);
		return value;
	},

	async setValue(translationId: number, lang: string, value: string): Promise<void> {
		await storage().query(
			sql`INSERT INTO translation_values (translation_id, lang, value) 
				VALUES (${translationId}, ${lang}, ${value})
				ON DUPLICATE KEY UPDATE value = ${value}, date_updated = NOW()`
		);
		translationValueCache.set(translationLangKey(translationId, lang), value);
	},

	async getPluralForms(translationId: number, lang: string): Promise<any | null> {
		logger.debug(`[getPluralForms] Fetching for translationId: ${translationId}, lang: ${lang}`);
		const cacheKey = translationLangKey(translationId, lang);
		const cachedPluralData = pluralFormsCache.get(cacheKey);
		if (cachedPluralData !== undefined) {
			return cachedPluralData;
		}

		const result = await storage().query(
			sql`SELECT plural_data FROM plural_forms 
				WHERE translation_id = ${translationId} AND lang = ${lang} LIMIT 1`
		);

		const pluralData = result.length > 0 ? result[0].plural_data : null;
		pluralFormsCache.set(cacheKey, pluralData);
		logger.debug(`[getPluralForms] Result for translationId ${translationId}, lang ${lang}:`, {
			found: !!pluralData,
			data: pluralData
		});
		return pluralData;
	},

	async setPluralForms(translationId: number, lang: string, pluralData: any): Promise<void> {
		const jsonData = JSON.stringify(pluralData);
		await storage().query(
			sql`INSERT INTO plural_forms (translation_id, lang, plural_data) 
				VALUES (${translationId}, ${lang}, ${jsonData})
				ON DUPLICATE KEY UPDATE plural_data = ${jsonData}, date_updated = NOW()`
		);
		pluralFormsCache.set(translationLangKey(translationId, lang), pluralData);
		hasPluralFormsCache.set(String(translationId), true);
	},

	async getPluralRules(lang: string): Promise<string[]> {
		const result = await storage().query(
			sql`SELECT forms FROM plural_rules WHERE lang = ${lang} LIMIT 1`
		);

		if (result.length === 0) {
			return ['one', 'other'];
		}

		return result[0].forms;
	},

	async translateBatch(
		requests: Array<{ key: string, context?: string, isPlural?: boolean, namespace?: string }>,
		targetLangs?: string[]
	) {
		if (requests.length === 0) return [];

		const selectedLangCodes = normalizeTargetLangs(targetLangs);
		logger.info(`[translateBatch] Processing ${requests.length} requests`, {
			targetLangs: selectedLangCodes
		});

		const translations = [];

		for (const request of requests) {
			logger.info(`[translateBatch] Request:`, {
				key: request.key,
				context: request.context,
				isPlural: request.isPlural,
				namespace: request.namespace
			});

			const translationId = await this.getOrCreate(request.key, request.context || null, request.namespace || null);
			logger.info(`[translateBatch] Translation ID for "${request.key}" (namespace: ${request.namespace}): ${translationId}`);

			const translation: any = {
				id: translationId,
				key: request.key,
				namespace: request.namespace || null,
				context: request.context || null,
				isPlural: request.isPlural || false,
			};

			if (request.isPlural) {
				logger.info(`[translateBatch] Fetching plural forms for "${request.key}" (id: ${translationId})`);
				translation.plurals = {};
				const missingPluralRules: Record<string, string[]> = {};

					for (const lang of selectedLangCodes) {
						let pluralForms = await this.getPluralForms(translationId, lang);
						logger.debug(`[translateBatch] Existing plural forms for ${lang}:`, { pluralForms });

					if (!pluralForms && process.env.ENV_ID === 'dev') {
						missingPluralRules[lang] = await this.getPluralRules(lang);
					}

					if (pluralForms) {
						translation.plurals[lang] = pluralForms;
					}
				}

				if (process.env.ENV_ID === 'dev' && Object.keys(missingPluralRules).length > 0) {
					let batchedPluralForms: Record<string, Record<string, string>> = {};
					try {
						batchedPluralForms = await this.generatePluralFormsForLanguages(request.key, missingPluralRules);
					} catch (error) {
						logger.warn('[translateBatch] Batched plural generation failed, falling back to per-language', { error });
					}

					for (const [lang, forms] of Object.entries(missingPluralRules)) {
						let pluralForms = batchedPluralForms[lang] || null;
						if (!pluralForms) {
							logger.info(`[translateBatch] Falling back to per-language plural generation for ${lang}`);
							pluralForms = await this.generatePluralForms(request.key, lang, forms);
						}
						if (pluralForms) {
							await this.setPluralForms(translationId, lang, pluralForms);
							translation.plurals[lang] = pluralForms;
							logger.info(`[translateBatch] Generated and stored plural forms for ${lang}:`, { pluralForms });
						}
					}
				}

					for (const lang of selectedLangCodes) {
						if (!translation.plurals[lang]) {
							logger.warn(`[translateBatch] No plural forms available for ${lang}`);
						}
				}

				logger.info(`[translateBatch] Total plural languages for "${request.key}":`, {
					count: Object.keys(translation.plurals).length,
					languages: Object.keys(translation.plurals)
				});
			} else {
				logger.info(`[translateBatch] Fetching regular values for "${request.key}" (id: ${translationId})`);
				translation.values = {};
				const missingLangs: string[] = [];

					for (const lang of selectedLangCodes) {
						let value = await this.getValue(translationId, lang);
						if (!value && process.env.ENV_ID === 'dev') {
						missingLangs.push(lang);
					}
					if (value) {
						translation.values[lang] = value;
					}
				}

				if (process.env.ENV_ID === 'dev' && missingLangs.length > 0) {
					let batchedValues: Record<string, string> = {};
					try {
						batchedValues = await this.generateTranslations(request.key, missingLangs, request.context);
					} catch (error) {
						logger.warn('[translateBatch] Batched translation generation failed, falling back to per-language', { error });
					}

					for (const lang of missingLangs) {
						let value = batchedValues[lang] || null;
						if (!value) {
							logger.info(`[translateBatch] Falling back to per-language generation for ${lang}`);
							value = await this.generateTranslation(request.key, lang, request.context);
						}
						if (value) {
							await this.setValue(translationId, lang, value);
							translation.values[lang] = value;
							logger.debug(`[translateBatch] Generated and stored value for ${lang}: "${value}"`);
						}
					}
				}

				logger.info(`[translateBatch] Total value languages for "${request.key}":`, {
					count: Object.keys(translation.values).length,
					languages: Object.keys(translation.values)
				});
			}

			translations.push(translation);
		}

		logger.info(`[translateBatch] Completed, returning ${translations.length} translations`);
		return translations;
	},

	async generateTranslation(text: string, targetLangCode: string, context: string = null): Promise<string> {
		return translationGeneration.generateTranslation(text, targetLangCode, context);
	},

	async generateTranslations(text: string, targetLangCodes: string[], context: string = null): Promise<Record<string, string>> {
		return translationGeneration.generateTranslations(text, targetLangCodes, context);
	},

	async generatePluralForms(text: string, targetLangCode: string, forms: string[]): Promise<any> {
		return translationGeneration.generatePluralForms(text, targetLangCode, forms);
	},

	async generatePluralFormsForLanguages(text: string, formsByLanguage: Record<string, string[]>): Promise<Record<string, Record<string, string>>> {
		return translationGeneration.generatePluralFormsForLanguages(text, formsByLanguage);
	},

	async callLLM(prompt: string): Promise<string> {
		return translationGeneration.callTranslationLLM(prompt);
	},
	clearCachesForTests(): void {
		clearTranslationCaches();
		supportsTranslationKeyHashLookup = null;
	}
};
