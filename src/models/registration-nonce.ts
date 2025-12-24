import * as crypto from 'crypto';
import { logger } from '../logger';
import config from '../config';

const NONCE_EXPIRATION_MS = 60 * 60 * 1000;
const DIFFICULTY = 4;
const SECRET = config.JWT_KEY;

interface NoncePayload {
  challenge: string;
  expiresAt: number;
}

function encodeNonce(payload: NoncePayload): string {
  const jsonPayload = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(jsonPayload)
    .digest('hex');

  const combined = `${Buffer.from(jsonPayload).toString('base64')}.${signature}`;
  return combined;
}

function decodeNonce(nonce: string): NoncePayload | null {
  try {
    const [encodedPayload, signature] = nonce.split('.');

    if (!encodedPayload || !signature) {
      return null;
    }

    const jsonPayload = Buffer.from(encodedPayload, 'base64').toString('utf-8');

    const expectedSignature = crypto
      .createHmac('sha256', SECRET)
      .update(jsonPayload)
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.warn('Nonce signature verification failed');
      return null;
    }

    return JSON.parse(jsonPayload);
  } catch (e) {
    logger.warn('Failed to decode nonce', { error: e });
    return null;
  }
}

export const registrationNonceModel = {
  generateNonce(): { nonce: string; challenge: string; difficulty: number } {
    const challenge = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + NONCE_EXPIRATION_MS;

    const nonce = encodeNonce({ challenge, expiresAt });

    logger.info('Generated registration nonce');

    return { nonce, challenge, difficulty: DIFFICULTY };
  },

  verifyProofOfWork(nonce: string, solution: string): boolean {
    const payload = decodeNonce(nonce);

    if (!payload) {
      logger.warn('Invalid nonce format or signature');
      return false;
    }

    if (Date.now() > payload.expiresAt) {
      logger.warn('Nonce expired');
      return false;
    }

    const hash = crypto
      .createHash('sha256')
      .update(payload.challenge + solution)
      .digest('hex');

    const isValid = hash.startsWith('0'.repeat(DIFFICULTY));

    if (isValid) {
      logger.info('Proof-of-work verified successfully');
    } else {
      logger.warn('Invalid proof-of-work solution', { hash });
    }

    return isValid;
  },
};
