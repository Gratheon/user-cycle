import errorCode, { err } from './error_code';

describe('error_code', () => {
  it('exposes stable error codes', () => {
    expect(errorCode.AUTHENTICATION_REQUIRED).toBe('AUTHENTICATION_REQUIRED');
    expect(errorCode.INVALID_EMAIL).toBe('INVALID_EMAIL');
    expect(errorCode.MISSING_NONCE).toBe('MISSING_NONCE');
  });

  it('builds GraphQL error shape', () => {
    expect(err(errorCode.FORBIDDEN)).toEqual({
      __typename: 'Error',
      code: 'FORBIDDEN',
    });
  });
});
