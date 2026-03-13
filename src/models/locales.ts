import { sql } from "@databases/mysql";

import { storage } from "../storage";
import { logger } from "../logger";
import config from "../config/index";
import { generateGeminiText } from "./gemini";

const languagesMap = {
	'ru': 'russian',
	'et': 'estonian',
	'tr': 'turkish',
	'pl': 'polish',
	'de': 'german',
	'fr': 'french',
}
const languageCodes = Object.keys(languagesMap);

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

export const localeModel = {
	translate: async function ({ en, key, tc }) {
		logger.debug(`[translate] Request: en="${en}" (${en?.length} chars), key="${key}" (${key?.length} chars), tc="${tc}" (${tc?.length} chars)`);

		let result;

		if (key) {
			result = await storage().query(sql`SELECT id, \`key\`, en, ru, et, tr, pl, de, fr FROM locales WHERE \`key\`=${key} LIMIT 1`);
		} else {
			result = await storage().query(sql`SELECT id, \`key\`, en, ru, et, tr, pl, de, fr FROM locales WHERE en=${en} LIMIT 1`);
		}

		let translation = result[0]

			if (process.env.ENV_ID == 'dev') {
				if (!translation) {
				logger.info(`[translate] Creating new translation entry: key="${key}" (${key?.length} chars), en="${en}"`);
				await storage().query(sql`INSERT INTO locales (\`key\`, translation_context, en) VALUES(${key}, ${tc}, ${en})`);

				if (key) {
					result = await storage().query(sql`SELECT id, \`key\`, en, ru, et, tr, pl, de, fr FROM locales WHERE \`key\`=${key} LIMIT 1`);
				} else {
					result = await storage().query(sql`SELECT id, \`key\`, en, ru, et, tr, pl, de, fr FROM locales WHERE en=${en} LIMIT 1`);
				}
					translation = result[0]
				}

				const missingLangCodes = languageCodes.filter((langCode) => !translation[langCode]);
				if (missingLangCodes.length > 0) {
					const updates: Record<string, string> = {};

					try {
						const batched = await translateMany(missingLangCodes, translation, tc);
						for (const langCode of missingLangCodes) {
							const value = batched[langCode];
							if (value) {
								updates[langCode] = value;
							}
						}
					} catch (error) {
						logger.warn('[translate] Batched translation failed, using per-language fallback', { error });
					}

					for (const langCode of missingLangCodes) {
						if (!updates[langCode]) {
							updates[langCode] = await translate(langCode, translation, tc) as string;
						}
					}

					for (const [langCode, value] of Object.entries(updates)) {
						translation[langCode] = value;
						logger.debug(`[translate] Generated ${langCode.toUpperCase()} translation: "${value}" (${value?.length} chars)`);
						if (langCode === 'ru') await storage().query(sql`UPDATE locales SET ru=${value} WHERE id=${translation.id}`);
						if (langCode === 'et') await storage().query(sql`UPDATE locales SET et=${value} WHERE id=${translation.id}`);
						if (langCode === 'tr') await storage().query(sql`UPDATE locales SET tr=${value} WHERE id=${translation.id}`);
						if (langCode === 'pl') await storage().query(sql`UPDATE locales SET pl=${value} WHERE id=${translation.id}`);
						if (langCode === 'de') await storage().query(sql`UPDATE locales SET de=${value} WHERE id=${translation.id}`);
						if (langCode === 'fr') await storage().query(sql`UPDATE locales SET fr=${value} WHERE id=${translation.id}`);
					}
				}

			if (key) {
				result = await storage().query(sql`SELECT id, \`key\`, en, ru, et, tr, pl, de, fr FROM locales WHERE \`key\`=${key} LIMIT 1`);
			} else {
				result = await storage().query(sql`SELECT id, \`key\`, en, ru, et, tr, pl, de, fr FROM locales WHERE en=${en} LIMIT 1`);
			}
			translation = result[0]
		}

		return translation;
	},

	translateBatch: async function (requests: Array<{ en: string, tc: string, key?: string }>) {
		if (requests.length === 0) return [];

		logger.info(`[translateBatch] Processing ${requests.length} requests`);
		requests.forEach((req, i) => {
			logger.debug(`[translateBatch] Request ${i}: en="${req.en}" (${req.en?.length} chars), key="${req.key}" (${req.key?.length} chars), tc="${req.tc}" (${req.tc?.length} chars)`);
		});

		// Separate requests by whether they have a key or not
		const keyRequests = requests.filter(r => r.key);
		const enRequests = requests.filter(r => !r.key);

		logger.debug(`[translateBatch] ${keyRequests.length} requests with key, ${enRequests.length} without key`);

		const results = [];

		// Fetch by key
		if (keyRequests.length > 0) {
			const keys = keyRequests.map(r => r.key);
			const keyResults = await storage().query(
				sql`SELECT id, \`key\`, en, ru, et, tr, pl, de, fr FROM locales WHERE \`key\` IN (${keys})`
			);
			results.push(...keyResults);
		}

		// Fetch by en
		if (enRequests.length > 0) {
			const enTexts = enRequests.map(r => r.en);
			const enResults = await storage().query(
				sql`SELECT id, \`key\`, en, ru, et, tr, pl, de, fr FROM locales WHERE en IN (${enTexts})`
			);
			results.push(...enResults);
		}

		// Build translation map - index by both key and en for lookup
		const translationMap = new Map();
		for (const result of results) {
			if (result.key) {
				translationMap.set(`key:${result.key}`, result);
			}
			translationMap.set(`en:${result.en}`, result);
		}

		if (process.env.ENV_ID == 'dev') {
			const missingTranslations = [];

			for (const request of requests) {
				const lookupKey = request.key ? `key:${request.key}` : `en:${request.en}`;

				if (!translationMap.has(lookupKey)) {
					logger.info(`[translateBatch] Missing translation for: en="${request.en}", key="${request.key}" (${request.key?.length} chars)`);
					missingTranslations.push(request);
				}
			}

			for (const request of missingTranslations) {
				logger.info(`[translateBatch] Creating new entry: key="${request.key || null}" (${request.key?.length} chars), en="${request.en}"`);
				await storage().query(sql`INSERT INTO locales (\`key\`, translation_context, en) VALUES(${request.key || null}, ${request.tc || ''}, ${request.en})`);

				let newResult;
				if (request.key) {
					newResult = await storage().query(sql`SELECT id, \`key\`, en, ru, et, tr, pl, de, fr FROM locales WHERE \`key\`=${request.key} LIMIT 1`);
				} else {
					newResult = await storage().query(sql`SELECT id, \`key\`, en, ru, et, tr, pl, de, fr FROM locales WHERE en=${request.en} LIMIT 1`);
				}

				if (newResult[0]) {
					const result = newResult[0];
					if (result.key) {
						translationMap.set(`key:${result.key}`, result);
					}
					translationMap.set(`en:${result.en}`, result);
				}
			}

			const translationsToUpdate = [];
			for (const request of requests) {
				const lookupKey = request.key ? `key:${request.key}` : `en:${request.en}`;
				const translation = translationMap.get(lookupKey);

				if (!translation) continue;

				const tc = request.tc || '';

				const needsUpdate = {
					id: translation.id,
					en: translation.en,
					ru: !translation.ru,
					et: !translation.et,
					tr: !translation.tr,
					pl: !translation.pl,
					de: !translation.de,
					fr: !translation.fr,
					tc
				};

				if (needsUpdate.ru || needsUpdate.et || needsUpdate.tr || needsUpdate.pl || needsUpdate.de || needsUpdate.fr) {
					translationsToUpdate.push({ translation, needsUpdate });
				}
			}

			for (const { translation, needsUpdate } of translationsToUpdate) {
				const updates: any = {};
				const missingLangCodes = languageCodes.filter((langCode) => needsUpdate[langCode]);

				if (missingLangCodes.length > 0) {
					try {
						const batched = await translateMany(missingLangCodes, translation, needsUpdate.tc);
						for (const langCode of missingLangCodes) {
							const value = batched[langCode];
							if (value) {
								updates[langCode] = value;
							}
						}
					} catch (error) {
						logger.warn('[translateBatch] Batched translation failed, using per-language fallback', { error });
					}

					for (const langCode of missingLangCodes) {
						if (!updates[langCode]) {
							updates[langCode] = await translate(langCode, translation, needsUpdate.tc) as string;
						}
					}
				}

				if (Object.keys(updates).length > 0) {
					if (updates['ru']) {
						await storage().query(sql`UPDATE locales SET ru=${updates['ru']} WHERE id=${translation.id}`);
					}
					if (updates['et']) {
						await storage().query(sql`UPDATE locales SET et=${updates['et']} WHERE id=${translation.id}`);
					}
					if (updates['tr']) {
						await storage().query(sql`UPDATE locales SET tr=${updates['tr']} WHERE id=${translation.id}`);
					}
					if (updates['pl']) {
						await storage().query(sql`UPDATE locales SET pl=${updates['pl']} WHERE id=${translation.id}`);
					}
					if (updates['de']) {
						await storage().query(sql`UPDATE locales SET de=${updates['de']} WHERE id=${translation.id}`);
					}
					if (updates['fr']) {
						await storage().query(sql`UPDATE locales SET fr=${updates['fr']} WHERE id=${translation.id}`);
					}

					Object.assign(translation, updates);
				}
			}

			// Refresh the translation map
			const finalResults = [];

			if (keyRequests.length > 0) {
				const keys = keyRequests.map(r => r.key);
				const keyResults = await storage().query(
					sql`SELECT id, \`key\`, en, ru, et, tr, pl, de, fr FROM locales WHERE \`key\` IN (${keys})`
				);
				finalResults.push(...keyResults);
			}

			if (enRequests.length > 0) {
				const enTexts = enRequests.map(r => r.en);
				const enResults = await storage().query(
					sql`SELECT id, \`key\`, en, ru, et, tr, pl, de, fr FROM locales WHERE en IN (${enTexts})`
				);
				finalResults.push(...enResults);
			}

			translationMap.clear();
			for (const result of finalResults) {
				if (result.key) {
					translationMap.set(`key:${result.key}`, result);
				}
				translationMap.set(`en:${result.en}`, result);
			}
		}

		return requests.map(r => {
			const lookupKey = r.key ? `key:${r.key}` : `en:${r.en}`;
			return translationMap.get(lookupKey);
		}).filter(Boolean);
	}
}


async function translate(targetLangCode, translation, tc) {
	const language = languagesMap[targetLangCode]

	let RAW_TEXT = `You are an expert translator. You need to translate from English. Used in beekeeping and monitoring web app.`

	if (tc) {
		RAW_TEXT += ` The translation context is "${tc}".`

		// Add specific instructions for plural forms
		if (tc.includes('plural:')) {
			RAW_TEXT += ` This is a PLURAL FORM translation. Translate the word to match the grammatical form used with the counts specified in the context.`

			if (targetLangCode === 'ru' || targetLangCode === 'pl') {
				if (tc.includes('plural:one')) {
					RAW_TEXT += ` Use the singular/nominative form (like Russian "улей" for 1, 21, 31...).`
				} else if (tc.includes('plural:few')) {
					RAW_TEXT += ` Use the genitive singular form (like Russian "улья" for 2, 3, 4, 22, 23, 24...).`
				} else if (tc.includes('plural:many')) {
					RAW_TEXT += ` Use the genitive plural form (like Russian "ульев" for 5, 6, 7...20, 25, 26...).`
				}
			}
		}
	}

	RAW_TEXT += ` Translate to ${language}.`

	if (translation['ru'] && targetLangCode !== 'ru') {
		RAW_TEXT += ` It is already translated in russian as "${translation['ru']}", you can use that as aid.`
	}

	RAW_TEXT += ` Do not write anything else but the translation in the target language (no extra notes or other languages) of the following phrase: ${translation['en']}`;

	return generateGeminiText(RAW_TEXT, {
		model: config.gemini?.translationModel || process.env.GEMINI_TRANSLATION_MODEL || "gemini-2.5-pro",
		systemInstruction: "You are an expert translator for a beekeeping monitoring app. Reply only with translated text.",
		temperature: 0.05,
	});
}

async function translateMany(targetLangCodes: string[], translation: any, tc: string): Promise<Record<string, string>> {
	const validLangCodes = [...new Set(targetLangCodes)].filter((langCode) => languagesMap[langCode]);
	if (validLangCodes.length === 0) {
		return {};
	}

	let RAW_TEXT = `You are an expert translator. You need to translate from English. Used in beekeeping and monitoring web app.`;

	if (tc) {
		RAW_TEXT += ` The translation context is "${tc}".`;
		if (tc.includes('plural:')) {
			RAW_TEXT += ` This is a PLURAL FORM translation. Translate each target language to match the grammatical form used with the counts specified in the context.`;
			if (tc.includes('plural:one')) {
				RAW_TEXT += ` Use singular-equivalent form for each language where count = 1.`;
			} else if (tc.includes('plural:few')) {
				RAW_TEXT += ` For languages like Russian/Polish, use genitive singular-equivalent form for counts like 2, 3, 4.`;
			} else if (tc.includes('plural:many')) {
				RAW_TEXT += ` For languages like Russian/Polish, use genitive plural-equivalent form for counts like 5 and above.`;
			}
		}
	}

	RAW_TEXT += ` Translate phrase "${translation['en']}" to these languages: `;
	RAW_TEXT += validLangCodes.map((langCode) => `${langCode} (${languagesMap[langCode]})`).join(', ');
	RAW_TEXT += `. Respond ONLY with valid JSON object where keys are language codes and values are translations.`;
	RAW_TEXT += ` Example: {"ru":"...","et":"..."}.`;

	const rawResponse = await generateGeminiText(RAW_TEXT, {
		model: config.gemini?.translationModel || process.env.GEMINI_TRANSLATION_MODEL || "gemini-2.5-pro",
		systemInstruction: "You are an expert translator for a beekeeping monitoring app. Reply only with translated text.",
		temperature: 0.05,
	});

	const parsed = parseJsonObjectFromLlm(rawResponse);
	if (!parsed) {
		throw new Error('Failed to parse batched translation JSON from LLM response');
	}

	const translations: Record<string, string> = {};
	for (const langCode of validLangCodes) {
		const value = parsed[langCode];
		if (typeof value === 'string' && value.trim().length > 0) {
			translations[langCode] = value.trim();
		}
	}
	return translations;
}
