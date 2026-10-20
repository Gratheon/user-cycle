import config from '../config/index';
import { logger } from '../logger';

type GenerateOptions = {
	model?: string;
	systemInstruction?: string;
	maxTokens?: number;
}

const DEFAULT_MODEL = 'gpt-6-luna';

export function translationModel(): string {
	return config.openai?.translationModel || process.env.OPENAI_TRANSLATION_MODEL || DEFAULT_MODEL;
}

// plain fetch against the Chat Completions API, avoids adding an SDK dependency
export async function generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
	const apiKey = config.openai?.apiKey || process.env.OPENAI_API_KEY || '';
	if (!apiKey) {
		throw new Error('OpenAI API key is missing');
	}

	const messages: { role: string; content: string }[] = [];
	if (options.systemInstruction) {
		messages.push({ role: 'system', content: options.systemInstruction });
	}
	messages.push({ role: 'user', content: prompt });

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: options.model || translationModel(),
			// reasoning tokens count toward this limit, leave room beyond the translation itself
			max_completion_tokens: options.maxTokens ?? 16000,
			messages,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		logger.error('OpenAI translation request failed', { status: response.status, message: body });
		throw new Error(`OpenAI request failed (${response.status}): ${body}`);
	}

	const data: any = await response.json();
	const choice = data?.choices?.[0];

	if (choice?.message?.refusal) {
		logger.error('OpenAI declined translation request', { refusal: choice.message.refusal });
		throw new Error('OpenAI declined the translation request');
	}

	const text = (choice?.message?.content || '').trim();
	if (!text) {
		throw new Error(`OpenAI returned empty response (finish_reason: ${choice?.finish_reason})`);
	}

	return text;
}
