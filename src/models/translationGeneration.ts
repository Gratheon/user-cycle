import config from "../config/index";
import { generateGeminiText } from "./gemini";
import { languagesMap } from "./translationLanguages";
import { logger } from "../logger";

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

export async function callTranslationLLM(prompt: string): Promise<string> {
	return generateGeminiText(prompt, {
		model: config.gemini?.translationModel || process.env.GEMINI_TRANSLATION_MODEL || "gemini-2.5-pro",
		systemInstruction: "You are an expert translator for a beekeeping monitoring app. Reply only with translated text.",
		temperature: 0.05,
	});
}

export async function generateTranslation(text: string, targetLangCode: string, context: string = null): Promise<string> {
	const language = languagesMap[targetLangCode];

	let RAW_TEXT = `You are an expert translator. You need to translate from English. Used in beekeeping and monitoring web app.`;

	if (context) {
		RAW_TEXT += ` The translation context is "${context}".`;
	}

	RAW_TEXT += ` Translate to ${language}.`;
	RAW_TEXT += ` Do not write anything else but the translation in the target language (no extra notes or other languages) of the following phrase: ${text}`;

	return callTranslationLLM(RAW_TEXT);
}

export async function generateTranslations(text: string, targetLangCodes: string[], context: string = null): Promise<Record<string, string>> {
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

	const rawResponse = await callTranslationLLM(RAW_TEXT);
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
}

export async function generatePluralForms(text: string, targetLangCode: string, forms: string[]): Promise<any> {
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

		pluralData[form] = await callTranslationLLM(RAW_TEXT);
		logger.debug(`[generatePluralForms] Generated ${targetLangCode}.${form}: "${pluralData[form]}" for "${text}"`);
	}

	return pluralData;
}

export async function generatePluralFormsForLanguages(text: string, formsByLanguage: Record<string, string[]>): Promise<Record<string, Record<string, string>>> {
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

	const rawResponse = await callTranslationLLM(RAW_TEXT);
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
}
