import DataLoader from 'dataloader';

import error_code, { err } from '../error_code';
import { logger } from '../logger';
import { localeModel } from '../models/locales';
import { sleepForSecurity } from '../models/sleep';
import { translationModel } from '../models/translations';
import { translationRedisCache } from '../cache/translationRedisCache';

const pluralWords = ['hive', 'apiary', 'box', 'frame', 'bee', 'queen', 'worker', 'drone'];
const pluralLanguages = Object.keys({
	ru: 'russian',
	et: 'estonian',
	tr: 'turkish',
	pl: 'polish',
	de: 'german',
	fr: 'french',
	lv: 'latvian',
	lt: 'lithuanian',
	hu: 'hungarian',
	uk: 'ukrainian',
	it: 'italian',
	ro: 'romanian',
	he: 'hebrew',
	ko: 'korean',
	nl: 'dutch'
});
const supportedTranslationLangs = [
	'ru', 'et', 'tr', 'pl', 'de', 'fr', 'lv', 'lt', 'hu', 'uk', 'it', 'ro', 'zh', 'hi', 'es', 'ar', 'bn', 'pt', 'ja', 'he', 'ko', 'nl'
];

function keyNeedsPluralForms(key: string): boolean {
	const normalized = key.toLowerCase();
	return pluralWords.some(word => normalized === word || normalized === `${word}s`);
}

function normalizeRequestedLangs(langs?: string[] | null): string[] | null {
	if (!langs || langs.length === 0) {
		return null;
	}

	const normalized = Array.from(new Set(
		langs
			.map((lang) => String(lang || '').toLowerCase().trim())
			.filter((lang) => supportedTranslationLangs.includes(lang))
	));

	if (normalized.length === 0) {
		return null;
	}

	return normalized;
}

export const translationResolvers = {
	Query: {
		translate: async (_, { en, key, tc }, __, ctx) => {
			const result = (await localeModel.translate({ en, key, tc }));

			if (!result) return null;

			return {
				...result,
				__typename: 'Locale'
			}
		},
		translateBatch: async (_, { requests }) => {
			const results = await localeModel.translateBatch(requests);
			return results.map(result => ({
				...result,
				__typename: 'Locale'
			}));
		},
		getTranslations: async (_, { inputs, langs }) => {
			logger.info(`[getTranslations] Received request for ${inputs.length} inputs`);
			if (inputs.length === 0) return [];
			const requestedLangs = normalizeRequestedLangs(langs);

			const normalizedInputs = inputs.map((input) => ({
				key: input.key,
				context: input.context || null,
				namespace: input.namespace || null,
				langs: requestedLangs,
			}));

			const results: any[] = new Array(normalizedInputs.length);
			const cachedEntries = await translationRedisCache.getMany(normalizedInputs);
			const cacheMissIndexes: number[] = [];

			for (let index = 0; index < normalizedInputs.length; index++) {
				const input = normalizedInputs[index];
					const cacheKey = translationRedisCache.buildCacheKey({
						key: input.key,
						namespace: input.namespace,
						langs: input.langs
					});
				const cachedTranslation = cachedEntries.get(cacheKey);
				if (!cachedTranslation) {
					cacheMissIndexes.push(index);
					continue;
				}

				results[index] = {
					...cachedTranslation,
					context: input.context,
					__typename: 'Translation'
				};
			}

			if (cacheMissIndexes.length === 0) {
				logger.info(`[getTranslations] Redis cache hit for all ${normalizedInputs.length} inputs`);
				return results;
			}

			const translationIdLoader = new DataLoader(
				async (keys: ReadonlyArray<{ key: string; namespace: string | null }>) =>
					translationModel.getByKeys(keys.map((entry) => ({ key: entry.key, namespace: entry.namespace }))),
				{
					cacheKeyFn: (entry) => `${entry.namespace ?? '__NULL__'}:${entry.key}`
				}
			);

			const hasPluralLoader = new DataLoader(
				async (translationIds: ReadonlyArray<number>) => translationModel.hasPluralFormsBatch(translationIds.map((id) => Number(id))),
				{
					cacheKeyFn: (id) => String(id)
				}
			);

			const translationIdsByIndex = new Map<number, number | null>();
			await Promise.all(cacheMissIndexes.map(async (index) => {
				const input = normalizedInputs[index];
				const translationId = await translationIdLoader.load({ key: input.key, namespace: input.namespace });
				translationIdsByIndex.set(index, translationId);
			}));

			const createIndexes = cacheMissIndexes.filter((index) => !translationIdsByIndex.get(index));
			const existingIndexes = cacheMissIndexes.filter((index) => !!translationIdsByIndex.get(index));

			if (createIndexes.length > 0) {
				const createRequests = createIndexes.map((index) => {
					const input = normalizedInputs[index];
					return {
						key: input.key,
						context: input.context,
						namespace: input.namespace,
						isPlural: keyNeedsPluralForms(input.key),
					};
				});

					const createdTranslations = await translationModel.translateBatch(createRequests, requestedLangs || undefined);
					const warmupEntries: Array<{ input: { key: string; namespace: string | null; langs?: string[] | null }; payload: any }> = [];

				for (let i = 0; i < createIndexes.length; i++) {
					const index = createIndexes[i];
					const input = normalizedInputs[index];
					const created = createdTranslations[i];
					results[index] = {
						...created,
						__typename: 'Translation'
					};
					warmupEntries.push({
							input: { key: input.key, namespace: input.namespace, langs: requestedLangs },
							payload: {
								...created,
								context: input.context
						}
					});
				}

				await translationRedisCache.setMany(warmupEntries);
			}

			if (existingIndexes.length > 0) {
				const hasPluralByIndex = new Map<number, boolean>();

				await Promise.all(existingIndexes.map(async (index) => {
					const translationId = Number(translationIdsByIndex.get(index));
					let hasPluralForms = await hasPluralLoader.load(translationId);

					if (!hasPluralForms && process.env.ENV_ID === 'dev' && keyNeedsPluralForms(normalizedInputs[index].key)) {
						for (const lang of pluralLanguages) {
							const forms = await translationModel.getPluralRules(lang);
							const pluralData = await translationModel.generatePluralForms(normalizedInputs[index].key, lang, forms);
							await translationModel.setPluralForms(translationId, lang, pluralData);
						}
						hasPluralForms = true;
						hasPluralLoader.clear(translationId).prime(translationId, true);
					}

					hasPluralByIndex.set(index, hasPluralForms);
				}));

				const fetchRequests = existingIndexes.map((index) => {
					const input = normalizedInputs[index];
					return {
						key: input.key,
						context: input.context,
						namespace: input.namespace,
						isPlural: hasPluralByIndex.get(index) || false,
					};
				});

					const fetchedTranslations = await translationModel.translateBatch(fetchRequests, requestedLangs || undefined);
					const warmupEntries: Array<{ input: { key: string; namespace: string | null; langs?: string[] | null }; payload: any }> = [];

				for (let i = 0; i < existingIndexes.length; i++) {
					const index = existingIndexes[i];
					const input = normalizedInputs[index];
					const translation = fetchedTranslations[i];
					results[index] = {
						...translation,
						__typename: 'Translation'
					};
					warmupEntries.push({
							input: { key: input.key, namespace: input.namespace, langs: requestedLangs },
							payload: {
								...translation,
							context: input.context
						}
					});
				}

				await translationRedisCache.setMany(warmupEntries);
			}

			logger.info(`[getTranslations] Returning ${results.length} translations (cache misses: ${cacheMissIndexes.length})`);
			return results;
		},
		getPluralRules: async (_, { lang }) => {
			const forms = await translationModel.getPluralRules(lang);
			return {
				lang,
				forms,
				__typename: 'PluralRules'
			};
		},
	},
	Mutation: {
		updateTranslationValue: async (_, { key, lang, value, namespace }, ctx) => {
			if (!ctx.uid) {
				logger.warn("Authentication required for updateTranslationValue");
				return err(error_code.AUTHENTICATION_REQUIRED);
			}

			if (process.env.ENV_ID !== 'dev') {
				logger.warn("updateTranslationValue only allowed in dev mode", { env: process.env.ENV_ID });
				return err(error_code.FORBIDDEN);
			}

			logger.info(`[updateTranslationValue] Updating translation`, { key, lang, value, namespace });

			const translationId = await translationModel.getOrCreate(key, null, namespace || null);
			await translationModel.setValue(translationId, lang, value);

			const translation = await translationModel.translateBatch([{ key, namespace: namespace || null }]);

			if (translation && translation.length > 0) {
				return {
					__typename: 'Translation',
					...translation[0]
				};
			}

			return null;
		},

		batchTranslateLanguage: async (_, { langCode }, ctx) => {
			if (!ctx.uid) {
				logger.warn("Authentication required for batchTranslateLanguage");
				return {
					success: false,
					total: 0,
					processed: 0,
					skipped: 0,
					errors: 0,
					message: "Authentication required"
				};
			}

			if (process.env.ENV_ID !== 'dev') {
				logger.warn("batchTranslateLanguage only allowed in dev mode", { env: process.env.ENV_ID });
				return {
					success: false,
					total: 0,
					processed: 0,
					skipped: 0,
					errors: 0,
					message: "This operation is only allowed in development mode"
				};
			}

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
					'he': 'hebrew',
					'ko': 'korean',
					'nl': 'dutch',
				'he': 'hebrew',
				'ko': 'korean',
				'nl': 'dutch',
			};

			if (!languagesMap[langCode]) {
				logger.warn("Unsupported language code", { langCode });
				return {
					success: false,
					total: 0,
					processed: 0,
					skipped: 0,
					errors: 0,
					message: `Unsupported language code: ${langCode}. Supported: ${Object.keys(languagesMap).join(', ')}`
				};
			}

			logger.info(`[batchTranslateLanguage] Starting batch translation for ${languagesMap[langCode]} (${langCode})`);

			const { storage } = require('../storage');
			const { sql } = require('@databases/mysql');

			try {
				const allTranslations = await storage().query(
					sql`SELECT id, \`key\`, context FROM translations ORDER BY id`
				);

				logger.info(`[batchTranslateLanguage] Found ${allTranslations.length} translation keys to process`);

				const translationsWithPlurals = await storage().query(
					sql`SELECT DISTINCT translation_id FROM plural_forms`
				);
				const pluralSet = new Set(translationsWithPlurals.map(row => row.translation_id));

				let processedCount = 0;
				let skippedCount = 0;
				let errorCount = 0;

				for (const translation of allTranslations) {
					const translationId = translation.id;
					const key = translation.key;
					const context = translation.context;
					const isPlural = pluralSet.has(translationId);

					try {
						if (isPlural) {
							const existingPlural = await translationModel.getPluralForms(translationId, langCode);
							if (existingPlural) {
								logger.debug(`[batchTranslateLanguage] Skipping plural "${key}" - already exists`);
								skippedCount++;
								continue;
							}

							logger.info(`[batchTranslateLanguage] Translating plural "${key}"...`);
							const forms = await translationModel.getPluralRules(langCode);
							const pluralData = await translationModel.generatePluralForms(key, langCode, forms);
							await translationModel.setPluralForms(translationId, langCode, pluralData);
							logger.info(`[batchTranslateLanguage] Plural "${key}": ${JSON.stringify(pluralData)}`);
							processedCount++;
						} else {
							const existingValue = await translationModel.getValue(translationId, langCode);
							if (existingValue) {
								logger.debug(`[batchTranslateLanguage] Skipping "${key}" - already exists`);
								skippedCount++;
								continue;
							}

							logger.info(`[batchTranslateLanguage] Translating "${key}"...`);
							const value = await translationModel.generateTranslation(key, langCode, context);
							await translationModel.setValue(translationId, langCode, value);
							logger.info(`[batchTranslateLanguage] "${key}" -> "${value}"`);
							processedCount++;
						}
					} catch (error) {
						logger.error(`[batchTranslateLanguage] Error translating "${key}":`, error);
						errorCount++;
					}
				}

				logger.info(`[batchTranslateLanguage] Complete. Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);

				return {
					success: true,
					total: allTranslations.length,
					processed: processedCount,
					skipped: skippedCount,
					errors: errorCount,
					message: `Successfully processed ${processedCount} translations for ${languagesMap[langCode]}`
				};

			} catch (error) {
				logger.error('[batchTranslateLanguage] Fatal error:', error);
				const errorMessage = error instanceof Error ? error.message : String(error);
				return {
					success: false,
					total: 0,
					processed: 0,
					skipped: 0,
					errors: 1,
					message: `Error: ${errorMessage}`
				};
			}
		},
	}
};

