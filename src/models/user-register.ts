import validate from 'deep-email-validator'
import sign from 'jwt-encode';

import { sendWelcomeMail, sendAdminUserRegisteredMail } from '../send-mail';
import { TRIAL_DAYS, userModel } from './user';
import { sleepForSecurity } from './sleep';
import { logger } from '../logger';
import error_code, { err } from '../error_code';
import { tokenModel } from './tokens';
import config from '../config';

export default async function registerUser (_, { first_name, last_name, email, password }) {
	// try to login first
	let id = await userModel.findByEmailAndPass(email, password)

	if (!id) {
		const exID = await userModel.findByEmail(email)

		// wait for security
		await new Promise(resolve => setTimeout(resolve, 500));

		if (exID) {
			await sleepForSecurity()
			logger.warn(`Registration - EMAIL_TAKEN`, { email })
			return err(error_code.EMAIL_TAKEN);
		}

		// validate email to check that its real
		const emailValidationResult = await validate({
			email,
			validateRegex: true,
			validateMx: true,
			validateTypo: true,
			validateDisposable: false, // its ok if its disposable
			validateSMTP: true,
		  })

		if (!emailValidationResult?.valid) {
			logger.warn(`Registration - INVALID_EMAIL`, { email })
			return err(error_code.INVALID_EMAIL);
		}

		const expirationDate = new Date();
		expirationDate.setDate(expirationDate.getDate() + TRIAL_DAYS);
		const expirationDateString = expirationDate.toISOString().substring(0, 19).replace('T', ' ');

		// register
		await userModel.create(first_name, last_name, email, password, expirationDateString);
		id = await userModel.findByEmailAndPass(email, password)

		if (!id) {
			logger.error(`Registration - INCONSISTENT_STORAGE`)
			return err(error_code.INCONSISTENT_STORAGE);
		}
		logger.info(`Created user with id ${id}`, { email })

		// add api token
		await tokenModel.create(id)

		if (process.env.ENV_ID == 'prod') {
			await sendWelcomeMail({ email });
			await sendAdminUserRegisteredMail({ email });
		}
	}

	if (!id) {
		logger.error(`Registration - INCONSISTENT_STORAGE`, { email })
		return err(error_code.INCONSISTENT_STORAGE);
	}

	const sessionKey = sign({
		'user_id': id
	}, config.JWT_KEY);

	return {
		__typename: 'UserSession',
		key: sessionKey
	}
}