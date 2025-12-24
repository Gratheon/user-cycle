import { sql } from "@databases/mysql";
import { storage } from "../storage";
import { logger } from "../logger";
import config from "../config/index";

const { ClarifaiStub, grpc } = require("clarifai-nodejs-grpc");

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
}

export const translationModel = {
	async getByKey(key: string): Promise<number | null> {
		logger.debug(`[getByKey] Looking up translation with key: "${key}"`);

		// Try exact match first
		let result = await storage().query(
			sql`SELECT id FROM translations WHERE \`key\` = ${key} LIMIT 1`
		);

		// If not found, try case-insensitive match
		if (result.length === 0) {
			logger.debug(`[getByKey] Exact match not found, trying case-insensitive for "${key}"`);
			result = await storage().query(
				sql`SELECT id FROM translations WHERE LOWER(\`key\`) = LOWER(${key}) LIMIT 1`
			);
			if (result.length > 0) {
				logger.debug(`[getByKey] Found case-insensitive match:`, { id: result[0].id });
			}
		}

		const translationId = result.length > 0 ? result[0].id : null;
		logger.debug(`[getByKey] Result for "${key}":`, { translationId });
		return translationId;
	},

	async hasPluralForms(translationId: number): Promise<boolean> {
		logger.debug(`[hasPluralForms] Checking plural forms for translationId: ${translationId}`);
		const result = await storage().query(
			sql`SELECT COUNT(*) as count FROM plural_forms WHERE translation_id = ${translationId} LIMIT 1`
		);

		const hasPlurals = result.length > 0 && result[0].count > 0;
		logger.debug(`[hasPluralForms] Result for translationId ${translationId}:`, {
			count: result[0]?.count || 0,
			hasPlurals
		});

		return hasPlurals;
	},

	async getOrCreate(key: string, context: string = null): Promise<number> {
		const existing = await storage().query(
			sql`SELECT id FROM translations WHERE \`key\` = ${key} LIMIT 1`
		);

		if (existing.length > 0) {
			return existing[0].id;
		}

		await storage().query(
			sql`INSERT INTO translations (\`key\`, context) VALUES (${key}, ${context})`
		);

		const result = await storage().query(
			sql`SELECT id FROM translations WHERE \`key\` = ${key} LIMIT 1`
		);

		return result[0].id;
	},

	async getValue(translationId: number, lang: string): Promise<string | null> {
		const result = await storage().query(
			sql`SELECT value FROM translation_values 
				WHERE translation_id = ${translationId} AND lang = ${lang} LIMIT 1`
		);

		return result.length > 0 ? result[0].value : null;
	},

	async setValue(translationId: number, lang: string, value: string): Promise<void> {
		await storage().query(
			sql`INSERT INTO translation_values (translation_id, lang, value) 
				VALUES (${translationId}, ${lang}, ${value})
				ON DUPLICATE KEY UPDATE value = ${value}, date_updated = NOW()`
		);
	},

	async getPluralForms(translationId: number, lang: string): Promise<any | null> {
		logger.debug(`[getPluralForms] Fetching for translationId: ${translationId}, lang: ${lang}`);
		const result = await storage().query(
			sql`SELECT plural_data FROM plural_forms 
				WHERE translation_id = ${translationId} AND lang = ${lang} LIMIT 1`
		);

		const pluralData = result.length > 0 ? result[0].plural_data : null;
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

	async translateBatch(requests: Array<{ key: string, context?: string, isPlural?: boolean }>) {
		if (requests.length === 0) return [];

		logger.info(`[translateBatch] Processing ${requests.length} requests`);

		const translations = [];

		for (const request of requests) {
			logger.info(`[translateBatch] Request:`, {
				key: request.key,
				context: request.context,
				isPlural: request.isPlural
			});

			const translationId = await this.getOrCreate(request.key, request.context || null);
			logger.info(`[translateBatch] Translation ID for "${request.key}": ${translationId}`);

			const translation: any = {
				id: translationId,
				key: request.key,
				context: request.context || null,
				isPlural: request.isPlural || false,
			};

			if (request.isPlural) {
				logger.info(`[translateBatch] Fetching plural forms for "${request.key}" (id: ${translationId})`);
				translation.plurals = {};

				for (const lang of Object.keys(languagesMap)) {
					let pluralForms = await this.getPluralForms(translationId, lang);
					logger.debug(`[translateBatch] Existing plural forms for ${lang}:`, { pluralForms });

					if (!pluralForms && process.env.ENV_ID === 'dev') {
						logger.info(`[translateBatch] No plural forms found for ${lang}, generating via LLM`);
						const forms = await this.getPluralRules(lang);
						pluralForms = await this.generatePluralForms(request.key, lang, forms);
						await this.setPluralForms(translationId, lang, pluralForms);
						logger.info(`[translateBatch] Generated and stored plural forms for ${lang}:`, { pluralForms });
					}

					if (pluralForms) {
						translation.plurals[lang] = pluralForms;
					} else {
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
				for (const lang of Object.keys(languagesMap)) {
					let value = await this.getValue(translationId, lang);
					if (!value && process.env.ENV_ID === 'dev') {
						logger.info(`[translateBatch] No value found for ${lang}, generating via LLM`);
						value = await this.generateTranslation(request.key, lang, request.context);
						await this.setValue(translationId, lang, value);
						logger.debug(`[translateBatch] Generated and stored value for ${lang}: "${value}"`);
					}
					if (value) {
						translation.values[lang] = value;
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

	async callLLM(prompt: string): Promise<string> {
		const PAT = config.clarifai.translation_PAT;
		const USER_ID = 'openai';
		const APP_ID = 'chat-completion';
		const MODEL_ID = 'gpt-oss-120b';
		const MODEL_VERSION_ID = '1d3ee440e48c4e7a94af6acac7d7cdfc';

		const stub = ClarifaiStub.grpc();
		const metadata = new grpc.Metadata();
		metadata.set("authorization", "Key " + PAT);

		return new Promise((resolve, reject) => {
			stub.PostModelOutputs(
				{
					user_app_id: {
						"user_id": USER_ID,
						"app_id": APP_ID
					},
					model_id: MODEL_ID,
					version_id: MODEL_VERSION_ID,
					inputs: [{
						"data": {
							"text": {
								"raw": prompt
							}
						}
					}]
				},
				metadata,
				(err, response) => {
					if (err) {
						logger.error("Translation error", { err });
						return reject(err);
					}

					if (response.status.code !== 10000) {
						logger.error("Translation error - status code not 10000", response);
						return reject("Post model outputs failed, status: " + response.status.description);
					}

					const output = response.outputs[0];
					resolve(output.data.text.raw);
				}
			);
		});
	}
};

