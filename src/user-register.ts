import validate from 'deep-email-validator'
import sign from 'jwt-encode';

import {TRIAL_DAYS, userModel} from './models/user';
import {sleepForSecurity} from './models/sleep';
import {logger} from './logger';
import error_code, {err} from './error_code';
import {tokenModel} from './models/tokens';
import {billingHistoryModel} from './models/billingHistory';
import config from './config';
import {createGrafanaUser} from './models/grafana';
import {sendAdminUserRegisteredMail, sendWelcomeMail} from "./send-mail";
import {registrationNonceModel} from './models/registration-nonce';

export default async function registerUser(_, { input }) {
  const { first_name, last_name, email, password, lang, nonce, solution } = input;

  if (!nonce || !solution) {
    logger.warn(`Registration - MISSING_NONCE`, {email})
    return err(error_code.MISSING_NONCE);
  }

  if (!registrationNonceModel.verifyProofOfWork(nonce, solution)) {
    await sleepForSecurity()
    logger.warn(`Registration - INVALID_PROOF_OF_WORK`, {email})
    return err(error_code.INVALID_PROOF_OF_WORK);
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

    await userModel.create(first_name, last_name, email, password, lang || 'en', expirationDateString);
    id = await userModel.findByEmailAndPass(email, password)

    if (!id) {
      logger.error(`Registration - INCONSISTENT_STORAGE`)
      return err(error_code.INCONSISTENT_STORAGE);
    }
    logger.info(`Created user with id ${id}`, {email})

    await billingHistoryModel.addRegistration(id, 'free');

    await tokenModel.create(id)

    try {
      await sendWelcomeMail({ email });
    } catch (e) {
      logger.errorEnriched(`Failed to send welcome mail on first login`, e, { email });
    }

    try {
      await sendAdminUserRegisteredMail({email});
    } catch (e) {
      logger.errorEnriched(`Failed to send admin user registered mail`, e, {email});
    }

    try {
      await createGrafanaUser(email, password, `${first_name} ${last_name}`);
    } catch (e) {
      logger.errorEnriched(`Failed to create grafana user`, e, {email});
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
