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
		let result = await storage().query(sql`SELECT id, en, ru, et, tr, pl, de, fr FROM locales WHERE en=${en} LIMIT 1`);

		let translation = result[0]

		if (process.env.ENV_ID == 'dev') {
			if (!translation) {
				await storage().query(sql`INSERT INTO locales (translation_context, en) VALUES(${tc}, ${en})`);
			}

			if (!translation['ru']) {
				let ru = await translate('ru', translation, tc)
				translation['ru'] = ru

				await storage().query(sql`UPDATE locales SET ru=${ru} WHERE id=${translation.id}`);
			}

			if (!translation['et']) {
				let et = await translate('et', translation, tc)
				translation['et'] = et

				await storage().query(sql`UPDATE locales SET et=${et} WHERE id=${translation.id}`);
			}

			if (!translation['tr']) {
				let tr = await translate('tr', translation, tc)
				translation['tr'] = tr

				await storage().query(sql`UPDATE locales SET tr=${tr} WHERE id=${translation.id}`);
			}

			if (!translation['pl']) {
				let pl = await translate('pl', translation, tc)
				translation['pl'] = pl

				await storage().query(sql`UPDATE locales SET pl=${pl} WHERE id=${translation.id}`);
			}
			if (!translation['de']) {
				let de = await translate('de', translation, tc)
				translation['de'] = de
				await storage().query(sql`UPDATE locales SET de=${de} WHERE id=${translation.id}`);
			}

			if (!translation['fr']) {
				let fr = await translate('fr', translation, tc)
				translation['fr'] = fr
				await storage().query(sql`UPDATE locales SET fr=${fr} WHERE id=${translation.id}`);
			}

			result = await storage().query(sql`SELECT id, en, ru, et, tr, pl, de, fr FROM locales WHERE en=${en} LIMIT 1`);
			translation = result[0]
		}

		return translation;
	},

	translateBatch: async function (requests: Array<{ en: string, tc: string }>) {
		if (requests.length === 0) return [];

		const enTexts = requests.map(r => r.en);

		const results = await storage().query(
			sql`SELECT id, en, ru, et, tr, pl, de, fr FROM locales WHERE en IN (${enTexts})`
		);

		const translationMap = new Map();
		for (const result of results) {
			translationMap.set(result.en, result);
		}

		if (process.env.ENV_ID == 'dev') {
			const missingTranslations = [];

			for (const request of requests) {
				if (!translationMap.has(request.en)) {
					missingTranslations.push(request);
				}
			}

			for (const request of missingTranslations) {
				await storage().query(sql`INSERT INTO locales (translation_context, en) VALUES(${request.tc || ''}, ${request.en})`);
				const newResult = await storage().query(sql`SELECT id, en, ru, et, tr, pl, de, fr FROM locales WHERE en=${request.en} LIMIT 1`);
				if (newResult[0]) {
					translationMap.set(request.en, newResult[0]);
				}
			}

			const translationsToUpdate = [];
			for (const translation of translationMap.values()) {
				const request = requests.find(r => r.en === translation.en);
				const tc = request?.tc || '';

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
					updates['ru'] = await translate('ru', translation, needsUpdate.tc);
				}
				if (needsUpdate.et) {
					updates['et'] = await translate('et', translation, needsUpdate.tc);
				}
				if (needsUpdate.tr) {
					updates['tr'] = await translate('tr', translation, needsUpdate.tc);
				}
				if (needsUpdate.pl) {
					updates['pl'] = await translate('pl', translation, needsUpdate.tc);
				}
				if (needsUpdate.de) {
					updates['de'] = await translate('de', translation, needsUpdate.tc);
				}
				if (needsUpdate.fr) {
					updates['fr'] = await translate('fr', translation, needsUpdate.tc);
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

			const finalResults = await storage().query(
				sql`SELECT id, en, ru, et, tr, pl, de, fr FROM locales WHERE en IN (${enTexts})`
			);

			translationMap.clear();
			for (const result of finalResults) {
				translationMap.set(result.en, result);
			}
		}

		return requests.map(r => translationMap.get(r.en)).filter(Boolean);
	}
}


async function translate(targetLangCode, translation, tc) {
	const language = languagesMap[targetLangCode]

	let RAW_TEXT = `You are an expert translator. You need to translate from English. Used in beekeeping and monitoring web app.`
	if (tc) {
		RAW_TEXT += `The translation context is "${tc}"`
	}
	RAW_TEXT += `Translate to ${language}.`

	if (translation['ru']) {
		RAW_TEXT += `It is already translated in russian as "${translation['ru']}", you can use that as aid.`
	}

	RAW_TEXT += `Do not write anything else but the translation in the target language (no extra notes or other languages) of the following phrase: ${translation['en']}`;


	//-------------------
	// Your PAT (Personal Access Token) can be found in the portal under Authentification
	const PAT = config.clarifai.translation_PAT;
	// Specify the correct user_id/app_id pairings
	// Since you're making inferences outside your app's scope
	const USER_ID = 'openai';
	const APP_ID = 'chat-completion';
	// Change these to whatever model and text URL you want to use
	const MODEL_ID = 'GPT-3_5-turbo';
	const MODEL_VERSION_ID = '011eaadb8fc64aecac3a983b3c8c4b00';



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