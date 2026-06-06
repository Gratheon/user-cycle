jest.mock('deep-email-validator', () => jest.fn());

jest.mock('./models/user', () => ({
  TRIAL_DAYS: 14,
  userModel: {
    findByEmailAndPass: jest.fn(),
    findByEmail: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
  },
}));

jest.mock('./models/sleep', () => ({
  sleepForSecurity: jest.fn(),
}));

jest.mock('./logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    errorEnriched: jest.fn(),
  },
}));

jest.mock('./models/tokens', () => ({
  tokenModel: {
    create: jest.fn(),
  },
}));

jest.mock('./models/billingHistory', () => ({
  billingHistoryModel: {
    addRegistration: jest.fn(),
    addTrialStarted: jest.fn(),
  },
}));

jest.mock('./config', () => ({
  __esModule: true,
  default: {
    JWT_KEY: 'test-key',
  },
}));

jest.mock('./send-mail', () => ({
  sendAdminUserRegisteredMail: jest.fn(),
  sendWelcomeMail: jest.fn(),
}));

jest.mock('./models/registration-nonce', () => ({
  registrationNonceModel: {
    verifyProofOfWork: jest.fn(),
  },
}));

import registerUser from './user-register';
import { userModel } from './models/user';
import { registrationNonceModel } from './models/registration-nonce';

describe('registerUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (registrationNonceModel.verifyProofOfWork as jest.Mock).mockReturnValue(true);
  });

  it.each([
    [{ first_name: 'Spam1', last_name: 'User' }, 'first name'],
    [{ first_name: 'Spam', last_name: 'User1' }, 'last name'],
  ])('throws generic bad input when %s contains a number', async (names) => {
    await expect(registerUser(null, {
      input: {
        ...names,
        email: 'spam@example.com',
        password: 'Test1234',
        lang: 'en',
        nonce: 'nonce',
        solution: 'solution',
      },
    })).rejects.toMatchObject({
      message: 'Bad input',
      extensions: {
        code: 'BAD_USER_INPUT',
      },
    });

    expect(userModel.findByEmailAndPass).not.toHaveBeenCalled();
  });
});
