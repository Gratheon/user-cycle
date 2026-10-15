import Anthropic from '@anthropic-ai/sdk';

import config from '../config/index';
import { logger } from '../logger';

type ClaudeGenerateOptions = {
	model?: string;
	systemInstruction?: string;
	maxTokens?: number;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
	if (client) return client;

	const apiKey = config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || '';
	if (!apiKey) {
		throw new Error('Anthropic API key is missing');
	}

	client = new Anthropic({ apiKey });
	return client;
}

export function translationModel(): string {
	return config.anthropic?.translationModel || process.env.ANTHROPIC_TRANSLATION_MODEL || 'claude-haiku-5-5';
}

export async function generateClaudeText(prompt: string, options: ClaudeGenerateOptions = {}): Promise<string> {
	const model = options.model || translationModel();

	let response: Anthropic.Message;
	try {
		response = await getClient().messages.create({
			model,
			// thinking tokens count toward max_tokens, leave room beyond the translation itself
			max_tokens: options.maxTokens ?? 16000,
			// translations are short and simple, low effort keeps latency and cost down
			output_config: { effort: 'low' },
			system: options.systemInstruction,
			messages: [{ role: 'user', content: prompt }],
		});
	} catch (error) {
		if (error instanceof Anthropic.APIError) {
			logger.error('Anthropic translation request failed', {
				status: error.status,
				message: error.message,
			});
		}
		throw error;
	}

	if (response.stop_reason === 'refusal') {
		logger.error('Anthropic declined translation request', { stop_details: response.stop_details });
		throw new Error('Anthropic declined the translation request');
	}

	// response can start with thinking blocks, so read text blocks by type
	const text = response.content
		.map((block) => (block.type === 'text' ? block.text : ''))
		.join('')
		.trim();

	if (!text) {
		throw new Error(`Anthropic returned empty response (stop_reason: ${response.stop_reason})`);
	}

	return text;
}
