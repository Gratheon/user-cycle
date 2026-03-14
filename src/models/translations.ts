import { sql } from "@databases/mysql";
import { storage } from "../storage";
import { logger } from "../logger";
import config from "../config/index";
import { generateGeminiText } from "./gemini";

function parsePositiveInteger(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.floor(parsed);
}

const translationCacheTtlMs = parsePositiveInteger(process.env.TRANSLATION_CACHE_TTL_MS, 5 * 60 * 1000);
const translationCacheMaxEntries = parsePositiveInteger(process.env.TRANSLATION_CACHE_MAX_ENTRIES, 10_000);

const languagesMap = {
	'ru': 'russian',
	'et': 'estonian',
	'tr': 'turkish',
	'pl': 'polish',
	'de': 'german',
	'fr': 'french',
	'zh': 'chinese',
	'hi': 'hindi',
	'es': 'spanish',
	'ar': 'arabic',
	'bn': 'bengali',
	'pt': 'portuguese',
	'ja': 'japanese',
}
const languageCodes = Object.keys(languagesMap);

type CacheEntry<T> = {
	value: T;
	expiresAt: number;
};

class BoundedTtlCache<T> {
	private store = new Map<string, CacheEntry<T>>();

	get(key: string): T | undefined {
		const entry = this.store.get(key);
		if (!entry) {
			return undefined;
		}

		if (entry.expiresAt <= Date.now()) {
			this.store.delete(key);
			return undefined;
		}

		// Keep hottest keys in the end of insertion order for simple LRU-style eviction.
		this.store.delete(key);
		this.store.set(key, entry);

		return entry.value;
	}

	set(key: string, value: T): void {
		const expiresAt = Date.now() + translationCacheTtlMs;
		this.store.set(key, { value, expiresAt });

		while (this.store.size > translationCacheMaxEntries) {
			const oldestKey = this.store.keys().next().value;
			if (!oldestKey) break;
			this.store.delete(oldestKey);
		}
	}

	delete(key: string): void {
		this.store.delete(key);
	}

	clear(): void {
		this.store.clear();
	}
}

const translationIdByKeyCache = new BoundedTtlCache<number | null>();
const hasPluralFormsCache = new BoundedTtlCache<boolean>();
const translationValueCache = new BoundedTtlCache<string | null>();
const pluralFormsCache = new BoundedTtlCache<any | null>();

function keyWithNamespace(key: string, namespace: string | null): string {
	return `${namespace ?? "__NULL__"}:${key}`;
}

function translationLangKey(translationId: number, lang: string): string {
	return `${translationId}:${lang}`;
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
	async getByKey(key: string, namespace: string | null = null): Promise<number | null> {
		logger.debug(`[getByKey] Looking up translation with key: "${key}", namespace: "${namespace}"`);
		const cacheKey = keyWithNamespace(key, namespace);
		const cachedId = translationIdByKeyCache.get(cacheKey);
		if (cachedId !== undefined) {
			logger.debug(`[getByKey] Cache hit for "${key}", namespace "${namespace}":`, { translationId: cachedId });
			return cachedId;
		}

		let result = await storage().query(
			sql`SELECT id FROM translations
				WHERE key_hash = SHA2(${key}, 256)
				  AND \`key\` = ${key}
				  AND namespace <=> ${namespace}
				LIMIT 1`
		);

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

	async translateBatch(requests: Array<{ key: string, context?: string, isPlural?: boolean, namespace?: string }>) {
		if (requests.length === 0) return [];

		logger.info(`[translateBatch] Processing ${requests.length} requests`);

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

				for (const lang of languageCodes) {
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

				for (const lang of languageCodes) {
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

				for (const lang of languageCodes) {
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
		const language = languagesMap[targetLangCode];

		let RAW_TEXT = `You are an expert translator. You need to translate from English. Used in beekeeping and monitoring web app.`;

		if (context) {
			RAW_TEXT += ` The translation context is "${context}".`;
		}

		RAW_TEXT += ` Translate to ${language}.`;
		RAW_TEXT += ` Do not write anything else but the translation in the target language (no extra notes or other languages) of the following phrase: ${text}`;

		return this.callLLM(RAW_TEXT);
	},

	async generateTranslations(text: string, targetLangCodes: string[], context: string = null): Promise<Record<string, string>> {
		const validLangCodes = [...new Set(targetLangCodes)].filter((langCode) => languagesMap[langCode]);
		if (validLangCodes.length === 0) {
			return {};
		}

		let RAW_TEXT = `You are an expert translator. You need to translate from English. Used in beekeeping and monitoring web app.`;
		if (context) {
			RAW_TEXT += ` The translation context is "${context}".`;
		}

		const languageList = validLangCodes.map((code) => `${code} (${languagesMap[code]})`).join(', ');
		RAW_TEXT += ` Translate the phrase "${text}" to the following languages: ${languageList}.`;
		RAW_TEXT += ` Respond ONLY with a valid JSON object where keys are language codes and values are translations.`;
		RAW_TEXT += ` Example format: {"ru":"...","de":"..."}.`;

		const rawResponse = await this.callLLM(RAW_TEXT);
		const parsed = parseJsonObjectFromLlm(rawResponse);
		if (!parsed) {
			throw new Error('Failed to parse batched translations JSON from LLM response');
		}

		const translations: Record<string, string> = {};
		for (const langCode of validLangCodes) {
			const value = parsed[langCode];
			if (typeof value === 'string' && value.trim().length > 0) {
				translations[langCode] = value.trim();
			}
		}

		return translations;
	},

	async generatePluralForms(text: string, targetLangCode: string, forms: string[]): Promise<any> {
		const language = languagesMap[targetLangCode];
		const pluralData: any = {};

		for (const form of forms) {
			let RAW_TEXT = `You are an expert translator. You need to translate from English. Used in beekeeping and monitoring web app.`;

			RAW_TEXT += ` Translate the word "${text}" to ${language} in the ${form} plural form.`;

			if (targetLangCode === 'ru' || targetLangCode === 'pl') {
				if (form === 'one') {
					RAW_TEXT += ` Use the singular/nominative form (used with counts like 1, 21, 31...).`;
				} else if (form === 'few') {
					RAW_TEXT += ` Use the genitive singular form (used with counts like 2, 3, 4, 22, 23, 24...).`;
				} else if (form === 'many') {
					RAW_TEXT += ` Use the genitive plural form (used with counts like 5, 6, 7...20, 25, 26...).`;
				}
			} else {
				if (form === 'one') {
					RAW_TEXT += ` Use the singular form (used with count = 1).`;
				} else if (form === 'other') {
					RAW_TEXT += ` Use the plural form (used with count != 1).`;
				}
			}

			RAW_TEXT += ` Respond with ONLY the translated word, nothing else.`;

			pluralData[form] = await this.callLLM(RAW_TEXT);
			logger.debug(`[generatePluralForms] Generated ${targetLangCode}.${form}: "${pluralData[form]}" for "${text}"`);
		}

		return pluralData;
	},

	async generatePluralFormsForLanguages(text: string, formsByLanguage: Record<string, string[]>): Promise<Record<string, Record<string, string>>> {
		const validEntries = Object.entries(formsByLanguage)
			.filter(([langCode, forms]) => languagesMap[langCode] && Array.isArray(forms) && forms.length > 0);

		if (validEntries.length === 0) {
			return {};
		}

		let RAW_TEXT = `You are an expert translator. You need to translate from English. Used in beekeeping and monitoring web app.`;
		RAW_TEXT += ` Translate the word "${text}" for pluralization across multiple languages.`;
		RAW_TEXT += ` Respond ONLY with valid JSON in this format: {"ru":{"one":"...","few":"..."},"de":{"one":"...","other":"..."}}.`;
		RAW_TEXT += ` Do not include explanations.`;
		RAW_TEXT += ` Required plural forms: `;
		RAW_TEXT += validEntries
			.map(([langCode, forms]) => `${langCode} (${languagesMap[langCode]}): [${forms.join(', ')}]`)
			.join('; ');
		RAW_TEXT += ` Use linguistically correct forms for each plural category.`;

		const rawResponse = await this.callLLM(RAW_TEXT);
		const parsed = parseJsonObjectFromLlm(rawResponse);
		if (!parsed) {
			throw new Error('Failed to parse batched plural JSON from LLM response');
		}

		const pluralTranslations: Record<string, Record<string, string>> = {};
		for (const [langCode, forms] of validEntries) {
			const langValue = parsed[langCode];
			if (!langValue || typeof langValue !== 'object' || Array.isArray(langValue)) {
				continue;
			}
			for (const form of forms) {
				const value = langValue[form];
				if (typeof value === 'string' && value.trim().length > 0) {
					if (!pluralTranslations[langCode]) {
						pluralTranslations[langCode] = {};
					}
					pluralTranslations[langCode][form] = value.trim();
				}
			}
		}

		return pluralTranslations;
	},

	async callLLM(prompt: string): Promise<string> {
		return generateGeminiText(prompt, {
			model: config.gemini?.translationModel || process.env.GEMINI_TRANSLATION_MODEL || "gemini-2.5-pro",
			systemInstruction: "You are an expert translator for a beekeeping monitoring app. Reply only with translated text.",
			temperature: 0.05,
		});
	},
	clearCachesForTests(): void {
		translationIdByKeyCache.clear();
		hasPluralFormsCache.clear();
		translationValueCache.clear();
		pluralFormsCache.clear();
	}
};
