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

			if (!translation['ru']) {
				let ru = await translate('ru', translation, tc) as string
				logger.debug(`[translate] Generated RU translation: "${ru}" (${ru?.length} chars) for en="${translation.en}"`);
				translation['ru'] = ru

				await storage().query(sql`UPDATE locales SET ru=${ru} WHERE id=${translation.id}`);
			}

			if (!translation['et']) {
				let et = await translate('et', translation, tc) as string
				logger.debug(`[translate] Generated ET translation: "${et}" (${et?.length} chars)`);
				translation['et'] = et

				await storage().query(sql`UPDATE locales SET et=${et} WHERE id=${translation.id}`);
			}

			if (!translation['tr']) {
				let tr = await translate('tr', translation, tc) as string
				logger.debug(`[translate] Generated TR translation: "${tr}" (${tr?.length} chars)`);
				translation['tr'] = tr

				await storage().query(sql`UPDATE locales SET tr=${tr} WHERE id=${translation.id}`);
			}

			if (!translation['pl']) {
				let pl = await translate('pl', translation, tc) as string
				logger.debug(`[translate] Generated PL translation: "${pl}" (${pl?.length} chars)`);
				translation['pl'] = pl

				await storage().query(sql`UPDATE locales SET pl=${pl} WHERE id=${translation.id}`);
			}
			if (!translation['de']) {
				let de = await translate('de', translation, tc) as string
				logger.debug(`[translate] Generated DE translation: "${de}" (${de?.length} chars)`);
				translation['de'] = de
				await storage().query(sql`UPDATE locales SET de=${de} WHERE id=${translation.id}`);
			}

			if (!translation['fr']) {
				let fr = await translate('fr', translation, tc) as string
				logger.debug(`[translate] Generated FR translation: "${fr}" (${fr?.length} chars)`);
				translation['fr'] = fr
				await storage().query(sql`UPDATE locales SET fr=${fr} WHERE id=${translation.id}`);
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

				if (needsUpdate.ru) {
					updates['ru'] = await translate('ru', translation, needsUpdate.tc) as string;
					logger.debug(`[translateBatch] Generated RU: "${updates['ru']}" (${updates['ru']?.length} chars) for en="${translation.en}"`);
				}
				if (needsUpdate.et) {
					updates['et'] = await translate('et', translation, needsUpdate.tc) as string;
					logger.debug(`[translateBatch] Generated ET: "${updates['et']}" (${updates['et']?.length} chars)`);
				}
				if (needsUpdate.tr) {
					updates['tr'] = await translate('tr', translation, needsUpdate.tc) as string;
					logger.debug(`[translateBatch] Generated TR: "${updates['tr']}" (${updates['tr']?.length} chars)`);
				}
				if (needsUpdate.pl) {
					updates['pl'] = await translate('pl', translation, needsUpdate.tc) as string;
					logger.debug(`[translateBatch] Generated PL: "${updates['pl']}" (${updates['pl']?.length} chars)`);
				}
				if (needsUpdate.de) {
					updates['de'] = await translate('de', translation, needsUpdate.tc) as string;
					logger.debug(`[translateBatch] Generated DE: "${updates['de']}" (${updates['de']?.length} chars)`);
				}
				if (needsUpdate.fr) {
					updates['fr'] = await translate('fr', translation, needsUpdate.tc) as string;
					logger.debug(`[translateBatch] Generated FR: "${updates['fr']}" (${updates['fr']?.length} chars)`);
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



	const PAT = config.clarifai.translation_PAT;
	const USER_ID = 'openai';
	const APP_ID = 'chat-completion';
	const MODEL_ID = 'gpt-oss-120b';
	const MODEL_VERSION_ID = '1d3ee440e48c4e7a94af6acac7d7cdfc';



	const stub = ClarifaiStub.grpc();

	// This will be used by every Clarifai endpoint call
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
				version_id: MODEL_VERSION_ID, // This is optional. Defaults to the latest model version.
				inputs: [
					{
						"data": {
							"text": {
								"raw": RAW_TEXT
								// url: TEXT_URL, allow_duplicate_url: true 
								// raw: fileBytes
							}
						}
					}
				]
			},
			metadata,
			(err, response) => {
				if (err) {
					logger.error("Translation error", {err})
					return reject(err);
				}

				if (response.status.code !== 10000) {
					logger.error("Translation error - status code not 10000", response)
					return reject("Post model outputs failed, status: " + response.status.description);
				}

				// Since we have one input, one output will exist here.
				const output = response.outputs[0];

				resolve(output.data.text.raw)
			}
		);
	})
}