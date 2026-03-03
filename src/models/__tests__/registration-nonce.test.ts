import crypto from 'crypto';
import { registrationNonceModel } from '../registration-nonce';

jest.mock('../../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function solvePow(challenge: string, difficulty: number): string {
  const prefix = '0'.repeat(difficulty);
  for (let i = 0; i < 1_000_000; i++) {
    const solution = i.toString(16);
    const hash = crypto
      .createHash('sha256')
      .update(challenge + solution)
      .digest('hex');

    if (hash.startsWith(prefix)) {
      return solution;
    }
  }

  throw new Error(`Could not solve proof of work for challenge: ${challenge}`);
}

describe('registrationNonceModel', () => {
  it('generates nonce payload and verifies valid proof-of-work', () => {
    const { nonce, challenge, difficulty } = registrationNonceModel.generateNonce();

    expect(typeof nonce).toBe('string');
    expect(challenge).toHaveLength(32);
    expect(difficulty).toBe(4);

    const solution = solvePow(challenge, difficulty);
    expect(registrationNonceModel.verifyProofOfWork(nonce, solution)).toBe(true);
  });

  it('rejects invalid nonce format', () => {
    expect(registrationNonceModel.verifyProofOfWork('broken', 'abc')).toBe(false);
  });

  it('rejects invalid proof solution', () => {
    const { nonce } = registrationNonceModel.generateNonce();
    expect(registrationNonceModel.verifyProofOfWork(nonce, 'not-valid')).toBe(false);
  });
});
