import fetch from 'cross-fetch';

import config from '../config/index';
import { logger } from '../logger';

type GeminiGenerateOptions = {
	model?: string;
	systemInstruction?: string;
	temperature?: number;
}

export async function generateGeminiText(prompt: string, options: GeminiGenerateOptions = {}): Promise<string> {
	const apiKey = config.gemini?.apiKey || process.env.GEMINI_API_KEY || '';
	const model = options.model || config.gemini?.translationModel || process.env.GEMINI_TRANSLATION_MODEL || 'gemini-2.5-pro';

	if (!apiKey) {
		throw new Error('Gemini API key is missing');
	}

	const body = {
		system_instruction: options.systemInstruction
			? { parts: [{ text: options.systemInstruction }] }
			: undefined,
		contents: [
			{
				role: 'user',
				parts: [{ text: prompt }],
			},
		],
		generationConfig: {
			temperature: options.temperature ?? 0.1,
		},
	};

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
			},
			body: JSON.stringify(body),
		}
	);

	const data = await response.json();

	if (!response.ok || data?.error) {
		logger.error('Gemini translation request failed', {
			status: response.status,
			body: data,
		});
		throw new Error(`Gemini request failed with status ${response.status}`);
	}

	const text = data?.candidates?.[0]?.content?.parts
		?.map((part) => part?.text || '')
		.join('')
		.trim();

	if (!text) {
		throw new Error('Gemini returned empty response');
	}

	return text;
}
