import {UserInputError} from 'apollo-server-fastify';
import validate from 'deep-email-validator'
import sign from 'jwt-encode';

import {TRIAL_DAYS, userModel} from './models/user';
import {sleepForSecurity} from './models/sleep';
import {logger} from './logger';
import error_code, {err} from './error_code';
import {tokenModel} from './models/tokens';
import {billingHistoryModel} from './models/billingHistory';
import config from './config';
import {sendAdminUserRegisteredMail, sendWelcomeMail} from "./send-mail";
import {registrationNonceModel} from './models/registration-nonce';

const containsNumber = (value?: string | null): boolean => /\p{Nd}/u.test(value || '');
const hasConsecutiveUppercase = (value: string): boolean => /\p{Lu}{2,}/u.test(value);

const isHashLikeName = (value?: string | null): boolean => {
  const letterTokens = (value || '').match(/\p{L}+/gu) || [];

  return letterTokens.some((token) => {
    if (token.length < 12 || !/^\p{Script=Latin}+$/u.test(token)) {
      return false;
    }

    const characters = Array.from(token);
    const uppercaseCount = characters.filter((character) => /\p{Lu}/u.test(character)).length;
    const lowercaseCount = characters.filter((character) => /\p{Ll}/u.test(character)).length;
    const caseSwitchCount = characters.slice(1).filter((character, index) => {
      const previousCharacter = characters[index];
      return /\p{Lu}/u.test(character) !== /\p{Lu}/u.test(previousCharacter);
    }).length;

    return uppercaseCount >= 4
      && lowercaseCount >= 4
      && uppercaseCount / characters.length >= 0.3
      && caseSwitchCount >= 6
      && hasConsecutiveUppercase(token);
  });
};

export default async function registerUser(_, { input }) {
  const { first_name, last_name, email, password, lang, locale, nonce, solution } = input;

  if (!nonce || !solution) {
    logger.warn(`Registration - MISSING_NONCE`, {email})
    return err(error_code.MISSING_NONCE);
  }

  if (!registrationNonceModel.verifyProofOfWork(nonce, solution)) {
    await sleepForSecurity()
    logger.warn(`Registration - INVALID_PROOF_OF_WORK`, {email})
    return err(error_code.INVALID_PROOF_OF_WORK);
  }

  if (containsNumber(first_name) || containsNumber(last_name) || isHashLikeName(first_name) || isHashLikeName(last_name)) {
    logger.warn(`Registration - BAD_USER_INPUT`, {email})
    throw new UserInputError('Bad input');
  }

  // try to login first
  let id = await userModel.findByEmailAndPass(email, password)

  if (!id) {
    if (password.length < 6) {
      logger.warn(`Registration - SIMPLE_PASSWORD`, {email})
      return err(error_code.SIMPLE_PASSWORD);
    }


    const exID = await userModel.findByEmail(email)

    // wait for security
    await new Promise(resolve => setTimeout(resolve, 500));

    if (exID) {
      await sleepForSecurity()
      logger.warn(`Registration - EMAIL_TAKEN`, {email})
      return err(error_code.EMAIL_TAKEN);
    }

    // validate email to check that its real
    const emailValidationResult = await validate({
      email,
      validateRegex: true,
      validateMx: true,
      validateTypo: true,
      validateDisposable: false, // its ok if its disposable
      validateSMTP: false,
    })

    if (!emailValidationResult?.valid) {
      logger.warn(`Registration - INVALID_EMAIL`, {email})
      return err(error_code.INVALID_EMAIL);
    }

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + TRIAL_DAYS);
    const expirationDateString = expirationDate.toISOString().substring(0, 19).replace('T', ' ');

    await userModel.create(first_name, last_name, email, password, lang || 'en', locale || null, expirationDateString, 'professional');
    id = await userModel.findByEmailAndPass(email, password)

    if (!id) {
      logger.error(`Registration - INCONSISTENT_STORAGE`)
      return err(error_code.INCONSISTENT_STORAGE);
    }
    logger.info(`Created user with id ${id}`, {email})

    await billingHistoryModel.addRegistration(id, 'professional');
    await billingHistoryModel.addTrialStarted(id, 'professional', TRIAL_DAYS);

    await tokenModel.create(id)

    try {
      await sendWelcomeMail({ email, lang });
    } catch (e) {
      logger.errorEnriched(`Failed to send welcome mail on first login`, e, { email });
    }

    try {
      await sendAdminUserRegisteredMail({email});
    } catch (e) {
      logger.errorEnriched(`Failed to send admin user registered mail`, e, {email});
    }
  }

  if (!id) {
    logger.error(`Registration - INCONSISTENT_STORAGE`, {email})
    return err(error_code.INCONSISTENT_STORAGE);
  }

  const sessionKey = sign({
    'user_id': id
  }, config.JWT_KEY);

  const user = await userModel.getById(id);

  return {
    __typename: 'UserSession',
    key: sessionKey,
    user
  }
}
