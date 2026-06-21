jest.mock('../storage', () => ({
  storage: jest.fn(),
}));

jest.mock('sha1', () => jest.fn((value: string) => `sha1:${value}`));

import { passwordResetModel, PASSWORD_RESET_RATE_LIMIT_PER_DAY } from './password-reset';
import { storage } from '../storage';

const mockedStorage = storage as jest.Mock;

describe('passwordResetModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores only a token hash and sets an exact 1 hour expiration window', async () => {
    const queries: any[] = [];
    mockedStorage.mockReturnValue({
      query: jest.fn(async (query) => {
        queries.push(query);
        return [];
      }),
    });

    const before = Date.now();
    const result = await passwordResetModel.createResetToken(42);
    const after = Date.now();

    expect(result.token).toHaveLength(43);
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + 60 * 60 * 1000);
    expect(JSON.stringify(queries)).not.toContain(result.token);
  });

  it('enforces a 3 requests per day limit per identity', async () => {
    mockedStorage.mockReturnValue({
      tx: jest.fn(async (callback) => callback({
        query: jest.fn(async () => [{ requestCount: PASSWORD_RESET_RATE_LIMIT_PER_DAY }]),
      })),
    });

    await expect(passwordResetModel.isRateLimited(['user:1'])).resolves.toBe(true);
  });

  it('rejects used or expired reset tokens without updating the account password', async () => {
    const query = jest.fn(async () => []);
    mockedStorage.mockReturnValue({
      tx: jest.fn(async (callback) => callback({ query })),
    });

    await expect(passwordResetModel.resetPassword('token', 'secret123')).resolves.toBe('INVALID_TOKEN');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
