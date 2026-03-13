import { translationModel } from '../translations';
import { storage } from '../../storage';
import { logger } from '../../logger';
import { generateGeminiText } from '../gemini';

jest.mock('../../storage');
jest.mock('../../logger');
jest.mock('../gemini', () => ({
	generateGeminiText: jest.fn(),
}));
jest.mock('clarifai-nodejs-grpc', () => ({
	ClarifaiStub: {
		grpc: jest.fn(() => ({
			PostModelOutputs: jest.fn(),
		})),
	},
	grpc: {
		Metadata: jest.fn(() => ({
			set: jest.fn(),
		})),
	},
}));

const mockStorage = storage as jest.MockedFunction<typeof storage>;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockGenerateGeminiText = generateGeminiText as jest.MockedFunction<typeof generateGeminiText>;

mockLogger.debug = jest.fn();
mockLogger.info = jest.fn();
mockLogger.warn = jest.fn();
mockLogger.error = jest.fn();

describe('translationModel caching', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		translationModel.clearCachesForTests();
	});

	it('caches getValue lookups', async () => {
		const query = jest.fn().mockResolvedValue([{ value: 'Hola' }]);
		mockStorage.mockReturnValue({ query } as any);

		const first = await translationModel.getValue(10, 'es');
		const second = await translationModel.getValue(10, 'es');

		expect(first).toBe('Hola');
		expect(second).toBe('Hola');
		expect(query).toHaveBeenCalledTimes(1);
	});

	it('updates getValue cache on setValue', async () => {
		const query = jest.fn()
			.mockResolvedValueOnce([{ value: 'Old value' }])
			.mockResolvedValueOnce([]);
		mockStorage.mockReturnValue({ query } as any);

		const before = await translationModel.getValue(11, 'de');
		await translationModel.setValue(11, 'de', 'Neuer Wert');
		const after = await translationModel.getValue(11, 'de');

		expect(before).toBe('Old value');
		expect(after).toBe('Neuer Wert');
		expect(query).toHaveBeenCalledTimes(2);
	});

	it('caches getPluralForms lookups', async () => {
		const query = jest.fn().mockResolvedValue([{ plural_data: { one: 'bee', other: 'bees' } }]);
		mockStorage.mockReturnValue({ query } as any);

		const first = await translationModel.getPluralForms(12, 'en');
		const second = await translationModel.getPluralForms(12, 'en');

		expect(first).toEqual({ one: 'bee', other: 'bees' });
		expect(second).toEqual({ one: 'bee', other: 'bees' });
		expect(query).toHaveBeenCalledTimes(1);
	});

	it('updates hasPluralForms cache after setPluralForms', async () => {
		const query = jest.fn()
			.mockResolvedValueOnce([{ count: 0 }])
			.mockResolvedValueOnce([]);
		mockStorage.mockReturnValue({ query } as any);

		const before = await translationModel.hasPluralForms(13);
		await translationModel.setPluralForms(13, 'fr', { one: 'ruche', other: 'ruches' });
		const after = await translationModel.hasPluralForms(13);

		expect(before).toBe(false);
		expect(after).toBe(true);
		expect(query).toHaveBeenCalledTimes(2);
	});

	it('generates multiple language translations from one LLM call', async () => {
		mockGenerateGeminiText.mockResolvedValueOnce(JSON.stringify({
			ru: 'Улей',
			de: 'Bienenstock',
		}));

		const result = await translationModel.generateTranslations('hive', ['ru', 'de']);

		expect(result).toEqual({
			ru: 'Улей',
			de: 'Bienenstock',
		});
		expect(mockGenerateGeminiText).toHaveBeenCalledTimes(1);
	});

	it('generates plural forms for multiple languages from one LLM call', async () => {
		mockGenerateGeminiText.mockResolvedValueOnce(JSON.stringify({
			ru: { one: 'улей', few: 'улья', many: 'ульев' },
			de: { one: 'Bienenstock', other: 'Bienenstöcke' }
		}));

		const result = await translationModel.generatePluralFormsForLanguages('hive', {
			ru: ['one', 'few', 'many'],
			de: ['one', 'other'],
		});

		expect(result).toEqual({
			ru: { one: 'улей', few: 'улья', many: 'ульев' },
			de: { one: 'Bienenstock', other: 'Bienenstöcke' }
		});
		expect(mockGenerateGeminiText).toHaveBeenCalledTimes(1);
	});
});
