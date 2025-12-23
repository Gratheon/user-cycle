import { localeModel } from '../locales';
import { storage } from '../../storage';
import { logger } from '../../logger';

jest.mock('../../storage');
jest.mock('../../logger');
jest.mock('clarifai-nodejs-grpc', () => ({
  ClarifaiStub: {
    grpc: jest.fn(() => ({
      PostModelOutputs: jest.fn((request, metadata, callback) => {
        callback(null, {
          status: { code: 10000 },
          outputs: [{ data: { text: { raw: 'mocked translation' } } }]
        });
      })
    }))
  },
  grpc: {
    Metadata: jest.fn(() => ({
      set: jest.fn()
    }))
  }
}));

const mockStorage = storage as jest.MockedFunction<typeof storage>;
const mockLogger = logger as jest.Mocked<typeof logger>;

mockLogger.debug = jest.fn();
mockLogger.info = jest.fn();
mockLogger.error = jest.fn();

describe('localeModel.translate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENV_ID = 'dev';
  });

  describe('basic translation lookup', () => {
    it('should find translation by key', async () => {
      const mockTranslation = {
        id: 1,
        key: 'save_button',
        en: 'Save',
        ru: 'Сохранить',
        et: 'Salvesta',
        tr: 'Kaydet',
        pl: 'Zapisz',
        de: 'Speichern',
        fr: 'Enregistrer'
      };

      mockStorage.mockReturnValue({
        query: jest.fn()
          .mockResolvedValueOnce([mockTranslation])
      } as any);

      const result = await localeModel.translate({
        en: 'Save',
        key: 'save_button',
        tc: ''
      });

      expect(result).toEqual(mockTranslation);
    });

    it('should find translation by en text when key is not provided', async () => {
      const mockTranslation = {
        id: 2,
        key: null,
        en: 'Account',
        ru: 'Настройки',
        et: 'Konto',
        tr: 'Hesap',
        pl: 'Konto',
        de: 'Konto',
        fr: 'Compte'
      };

      mockStorage.mockReturnValue({
        query: jest.fn()
          .mockResolvedValueOnce([mockTranslation])
      } as any);

      const result = await localeModel.translate({
        en: 'Account',
        key: null,
        tc: ''
      });

      expect(result).toEqual(mockTranslation);
    });

    it('should return null when translation not found in prod', async () => {
      process.env.ENV_ID = 'prod';

      mockStorage.mockReturnValue({
        query: jest.fn().mockResolvedValueOnce([])
      } as any);

      const result = await localeModel.translate({
        en: 'NonExistent',
        key: null,
        tc: ''
      });

      expect(result).toBeUndefined();
    });
  });

  describe('auto-creation in dev mode', () => {
    it('should create new translation entry if not found', async () => {
      const queryMock = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: 100,
          key: null,
          en: 'New Text',
          ru: null,
          et: null,
          tr: null,
          pl: null,
          de: null,
          fr: null
        }])
        .mockResolvedValueOnce([{
          id: 100,
          key: null,
          en: 'New Text',
          ru: 'mocked translation',
          et: null,
          tr: null,
          pl: null,
          de: null,
          fr: null
        }])
        .mockResolvedValueOnce([{
          id: 100,
          key: null,
          en: 'New Text',
          ru: 'mocked translation',
          et: 'mocked translation',
          tr: null,
          pl: null,
          de: null,
          fr: null
        }])
        .mockResolvedValueOnce([{
          id: 100,
          key: null,
          en: 'New Text',
          ru: 'mocked translation',
          et: 'mocked translation',
          tr: 'mocked translation',
          pl: null,
          de: null,
          fr: null
        }])
        .mockResolvedValueOnce([{
          id: 100,
          key: null,
          en: 'New Text',
          ru: 'mocked translation',
          et: 'mocked translation',
          tr: 'mocked translation',
          pl: 'mocked translation',
          de: null,
          fr: null
        }])
        .mockResolvedValueOnce([{
          id: 100,
          key: null,
          en: 'New Text',
          ru: 'mocked translation',
          et: 'mocked translation',
          tr: 'mocked translation',
          pl: 'mocked translation',
          de: 'mocked translation',
          fr: null
        }])
        .mockResolvedValueOnce([{
          id: 100,
          key: null,
          en: 'New Text',
          ru: 'mocked translation',
          et: 'mocked translation',
          tr: 'mocked translation',
          pl: 'mocked translation',
          de: 'mocked translation',
          fr: 'mocked translation'
        }])
        .mockResolvedValue([{
          id: 100,
          key: null,
          en: 'New Text',
          ru: 'mocked translation',
          et: 'mocked translation',
          tr: 'mocked translation',
          pl: 'mocked translation',
          de: 'mocked translation',
          fr: 'mocked translation'
        }]);

      mockStorage.mockReturnValue({
        query: queryMock
      } as any);

      const result = await localeModel.translate({
        en: 'New Text',
        key: null,
        tc: 'button label'
      });

      expect(result).toBeDefined();
      expect(result.en).toBe('New Text');
      expect(result.ru).toBe('mocked translation');
      expect(queryMock).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('INSERT INTO locales')
      }));
    });

    it('should create translation with composite key for plural forms', async () => {
      const queryMock = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: 101,
          key: 'hive__ctx__plural:many',
          en: 'hive',
          ru: null,
          et: null,
          tr: null,
          pl: null,
          de: null,
          fr: null
        }])
        .mockResolvedValue([{
          id: 101,
          key: 'hive__ctx__plural:many',
          en: 'hive',
          ru: 'mocked translation',
          et: 'mocked translation',
          tr: 'mocked translation',
          pl: 'mocked translation',
          de: 'mocked translation',
          fr: 'mocked translation'
        }]);

      mockStorage.mockReturnValue({
        query: queryMock
      } as any);

      const result = await localeModel.translate({
        en: 'hive',
        key: 'hive__ctx__plural:many',
        tc: 'plural:many (genitive plural - for counts like 5, 6, 7...)'
      });

      expect(result.key).toBe('hive__ctx__plural:many');
      expect(queryMock).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('INSERT INTO locales')
      }));
    });
  });

  describe('translation context handling', () => {
    it('should pass translation context to LLM', async () => {
      const queryMock = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue([{
          id: 102,
          key: null,
          en: 'Queen',
          ru: 'mocked translation',
          et: 'mocked translation',
          tr: 'mocked translation',
          pl: 'mocked translation',
          de: 'mocked translation',
          fr: 'mocked translation'
        }]);

      mockStorage.mockReturnValue({
        query: queryMock
      } as any);

      await localeModel.translate({
        en: 'Queen',
        key: null,
        tc: 'this is a form label for input of the bee queen race and year'
      });

      expect(queryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('INSERT INTO locales'),
          values: expect.arrayContaining([
            null,
            'this is a form label for input of the bee queen race and year',
            'Queen'
          ])
        })
      );
    });

    it('should include plural form hints in LLM prompt', async () => {
      const ClarifaiStub = require('clarifai-nodejs-grpc').ClarifaiStub;
      const mockGrpc = ClarifaiStub.grpc();

      const queryMock = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue([{
          id: 103,
          key: 'hive__ctx__plural:few',
          en: 'hive',
          ru: 'mocked translation',
          et: 'mocked translation',
          tr: 'mocked translation',
          pl: 'mocked translation',
          de: 'mocked translation',
          fr: 'mocked translation'
        }]);

      mockStorage.mockReturnValue({
        query: queryMock
      } as any);

      await localeModel.translate({
        en: 'hive',
        key: 'hive__ctx__plural:few',
        tc: 'plural:few (genitive singular - for counts like 2, 3, 4...)'
      });

      expect(mockGrpc.PostModelOutputs).toHaveBeenCalled();
      const callArgs = mockGrpc.PostModelOutputs.mock.calls[0];
      const requestData = callArgs[0];
      expect(requestData.inputs[0].data.text.raw).toContain('PLURAL FORM');
      expect(requestData.inputs[0].data.text.raw).toContain('genitive singular');
    });
  });
});

describe('localeModel.translateBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENV_ID = 'dev';
  });

  it('should handle empty request array', async () => {
    const result = await localeModel.translateBatch([]);
    expect(result).toEqual([]);
  });

  it('should fetch translations by key for plural forms', async () => {
    const mockTranslations = [
      {
        id: 1,
        key: 'hive__ctx__plural:one',
        en: 'hive',
        ru: 'улей',
        et: 'taru',
        tr: 'kovan',
        pl: 'ul',
        de: 'Bienenstock',
        fr: 'ruche'
      }
    ];

    mockStorage.mockReturnValue({
      query: jest.fn().mockResolvedValue(mockTranslations)
    } as any);

    const requests = [
      { en: 'hive', tc: 'plural:one', key: 'hive__ctx__plural:one' }
    ];

    const result = await localeModel.translateBatch(requests);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('hive__ctx__plural:one');
  });

  it('should fetch translations by en for regular translations', async () => {
    const mockTranslations = [
      {
        id: 2,
        key: null,
        en: 'Save',
        ru: 'Сохранить',
        et: 'Salvesta',
        tr: 'Kaydet',
        pl: 'Zapisz',
        de: 'Speichern',
        fr: 'Enregistrer'
      }
    ];

    mockStorage.mockReturnValue({
      query: jest.fn().mockResolvedValue(mockTranslations)
    } as any);

    const requests = [
      { en: 'Save', tc: '', key: undefined }
    ];

    const result = await localeModel.translateBatch(requests);

    expect(result).toHaveLength(1);
    expect(result[0].en).toBe('Save');
  });

  it('should handle mixed requests with keys and without keys', async () => {
    const queryMock = jest.fn()
      .mockResolvedValueOnce([
        { id: 1, key: 'hive__ctx__plural:one', en: 'hive', ru: 'улей', et: 'taru', tr: 'kovan', pl: 'ul', de: 'Bienenstock', fr: 'ruche' }
      ])
      .mockResolvedValueOnce([
        { id: 2, key: null, en: 'Save', ru: 'Сохранить', et: 'Salvesta', tr: 'Kaydet', pl: 'Zapisz', de: 'Speichern', fr: 'Enregistrer' }
      ])
      .mockResolvedValue([]);

    mockStorage.mockReturnValue({
      query: queryMock
    } as any);

    const requests = [
      { en: 'hive', tc: 'plural:one', key: 'hive__ctx__plural:one' },
      { en: 'Save', tc: '', key: undefined }
    ];

    const result = await localeModel.translateBatch(requests);

    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('hive__ctx__plural:one');
    expect(result[1].en).toBe('Save');
  });

  it('should deduplicate requests internally', async () => {
    const queryMock = jest.fn().mockResolvedValue([
      { id: 1, key: null, en: 'Save', ru: 'Сохранить', et: 'Salvesta', tr: 'Kaydet', pl: 'Zapisz', de: 'Speichern', fr: 'Enregistrer' }
    ]);

    mockStorage.mockReturnValue({
      query: queryMock
    } as any);

    const requests = [
      { en: 'Save', tc: '', key: undefined },
      { en: 'Save', tc: '', key: undefined },
      { en: 'Save', tc: '', key: undefined }
    ];

    const result = await localeModel.translateBatch(requests);

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('should create missing translations in dev mode', async () => {
    const queryMock = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { id: 100, key: null, en: 'New Text', ru: 'mocked translation', et: 'mocked translation', tr: 'mocked translation', pl: 'mocked translation', de: 'mocked translation', fr: 'mocked translation' }
      ]);

    mockStorage.mockReturnValue({
      query: queryMock
    } as any);

    const requests = [
      { en: 'New Text', tc: 'button', key: undefined }
    ];

    const result = await localeModel.translateBatch(requests);

    expect(queryMock).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('INSERT INTO locales')
    }));
  });
});

