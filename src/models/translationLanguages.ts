export const languagesMap = {
	'ru': 'russian',
	'et': 'estonian',
	'tr': 'turkish',
	'pl': 'polish',
	'de': 'german',
	'fr': 'french',
	'lv': 'latvian',
	'lt': 'lithuanian',
	'hu': 'hungarian',
	'uk': 'ukrainian',
	'it': 'italian',
	'ro': 'romanian',
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
}

export const languageCodes = Object.keys(languagesMap);

export function normalizeTargetLangs(targetLangs?: string[] | null): string[] {
	if (!targetLangs || targetLangs.length === 0) {
		return [...languageCodes];
	}

	const normalized = targetLangs
		.map((lang) => String(lang || '').toLowerCase().trim())
		.filter((lang) => languagesMap[lang]);

	if (normalized.length === 0) {
		return [...languageCodes];
	}

	return Array.from(new Set(normalized));
}
