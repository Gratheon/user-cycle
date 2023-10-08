import { sql } from "@databases/mysql";

import { storage } from "../storage";
import { logger } from "../logger";
import config from "../config/index";

const { ClarifaiStub, grpc } = require("clarifai-nodejs-grpc");

const languagesMap = {
	'ru': 'russian',
	'et': 'estonian',
}

export const localeModel = {
	translate: async function ({ en, key, tc }) {
		let result = await storage().query(sql`SELECT id, en, ru, et FROM locales WHERE en=${en} LIMIT 1`);

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

				await storage().query(sql`UPDATE locales SET et=${et} WHERE id=${translation.id}`);
			}
		}


		result = await storage().query(sql`SELECT id, en, ru, et FROM locales WHERE en=${en} LIMIT 1`);
		translation = result[0]

		return translation;
	},
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

	RAW_TEXT += `Do not write anything else but the translation of the following phrase: ${translation['en']}`;


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
					logger.error(err)
					return reject(err);
				}

				if (response.status.code !== 10000) {
					logger.error(response)
					return reject("Post model outputs failed, status: " + response.status.description);
				}

				// Since we have one input, one output will exist here.
				const output = response.outputs[0];

				logger.info("Translate result:\n");
				logger.info(output.data.text.raw);

				resolve(output.data.text.raw)
			}
		);
	})
}