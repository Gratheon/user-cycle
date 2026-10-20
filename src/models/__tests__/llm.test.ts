jest.mock('../../logger');
jest.mock('../../config/index', () => ({
	__esModule: true,
	default: { openai: { apiKey: 'test-key', translationModel: 'gpt-6-luna' } },
}));

import { generateText, translationModel } from '../llm';

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function ok(message: any, finish_reason = 'stop') {
	return { ok: true, status: 200, json: async () => ({ choices: [{ message, finish_reason }] }) };
}

describe('generateText', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it('sends the prompt to the translation model and trims the result', async () => {
		mockFetch.mockResolvedValueOnce(ok({ content: ' Пчела ' }));

		const result = await generateText('Translate bee', { systemInstruction: 'Translator' });

		expect(result).toBe('Пчела');
		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe('https://api.openai.com/v1/chat/completions');
		expect(init.headers.Authorization).toBe('Bearer test-key');
		expect(JSON.parse(init.body)).toEqual(expect.objectContaining({
			model: 'gpt-6-luna',
			messages: [
				{ role: 'system', content: 'Translator' },
				{ role: 'user', content: 'Translate bee' },
			],
		}));
	});

	it('uses the configured translation model by default', () => {
		expect(translationModel()).toBe('gpt-6-luna');
	});

	it('throws when the model refuses', async () => {
		mockFetch.mockResolvedValueOnce(ok({ content: null, refusal: 'no' }));

		await expect(generateText('x')).rejects.toThrow('declined');
	});

	it('throws on an empty response', async () => {
		mockFetch.mockResolvedValueOnce(ok({ content: '' }, 'length'));

		await expect(generateText('x')).rejects.toThrow('empty response');
	});

	it('throws on HTTP errors', async () => {
		mockFetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' });

		await expect(generateText('x')).rejects.toThrow('rate limited');
	});
});
