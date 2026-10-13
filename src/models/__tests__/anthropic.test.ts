const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
	class APIError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.status = status;
		}
	}
	const Anthropic = jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } }));
	(Anthropic as any).APIError = APIError;
	return { __esModule: true, default: Anthropic };
});
jest.mock('../../logger');
jest.mock('../../config/index', () => ({
	__esModule: true,
	default: { anthropic: { apiKey: 'test-key', translationModel: 'claude-haiku-5-5' } },
}));

import Anthropic from '@anthropic-ai/sdk';
import { generateClaudeText, translationModel } from '../anthropic';

describe('generateClaudeText', () => {
	beforeEach(() => {
		mockCreate.mockReset();
	});

	it('sends the prompt to the translation model and joins text blocks', async () => {
		mockCreate.mockResolvedValueOnce({
			stop_reason: 'end_turn',
			content: [
				{ type: 'thinking', thinking: '', signature: 'sig' },
				{ type: 'text', text: ' Пчела ' },
			],
		});

		const result = await generateClaudeText('Translate bee', { systemInstruction: 'Translator' });

		expect(result).toBe('Пчела');
		expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'test-key' });
		expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
			model: 'claude-haiku-5-5',
			system: 'Translator',
			output_config: { effort: 'low' },
			messages: [{ role: 'user', content: 'Translate bee' }],
		}));
		expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('temperature');
	});

	it('uses the configured translation model by default', () => {
		expect(translationModel()).toBe('claude-haiku-5-5');
	});

	it('throws when the model refuses', async () => {
		mockCreate.mockResolvedValueOnce({ stop_reason: 'refusal', stop_details: null, content: [] });

		await expect(generateClaudeText('x')).rejects.toThrow('declined');
	});

	it('throws on an empty response', async () => {
		mockCreate.mockResolvedValueOnce({ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '', signature: 's' }] });

		await expect(generateClaudeText('x')).rejects.toThrow('empty response');
	});

	it('rethrows API errors', async () => {
		mockCreate.mockRejectedValueOnce(new (Anthropic as any).APIError(429, 'rate limited'));

		await expect(generateClaudeText('x')).rejects.toThrow('rate limited');
	});
});
