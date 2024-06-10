import axios from "axios";
import sign from 'jwt-encode';

import config from './config/index';
import { logger } from './logger'
import { TRIAL_DAYS, userModel } from "./models/user";
import { tokenModel } from "./models/tokens";
import { sendAdminUserRegisteredMail, sendWelcomeMail } from "./send-mail";

export function registerGoogle(app) {
	// Initiates the Google Login flow
	app.get('/auth/google', (req, res) => {
		const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.google_oauth.client_id}&redirect_uri=${config.google_oauth.redirect_url}&response_type=code&scope=profile email`;
		res.redirect(url);
	});

	// Callback URL for handling the Google Login response
	app.get('/auth/google/callback', async (req, res) => {
		//@ts-ignore
		const { code } = req.query;

		try {
			// Exchange authorization code for access token
			const { data } = await axios.post('https://oauth2.googleapis.com/token', {
				client_id: config.google_oauth.client_id,
				client_secret: config.google_oauth.client_secret,
				code,
				redirect_uri: config.google_oauth.redirect_url,
				grant_type: 'authorization_code',
			});

			const { access_token, id_token } = data;

			// Use access_token or id_token to fetch user profile
			const { data: profile } = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
				headers: { Authorization: `Bearer ${access_token}` },
			});

			logger.info('User authenticated successfully');
			logger.info(profile);

			if (!profile.verified_email) {
				logger.error('Email is not verified');
				return res.redirect(config.login_ui_url);
			}

			let id = await userModel.findByEmail(profile.email);

			// do login
			if (id) {
				logger.info('Google auth - user already exists, logging in');
				userModel.updateLastLogin(id)
			}

			// do registration
			else {
				logger.info('Google auth - user does not exist, registering');
				const expirationDate = new Date();
				expirationDate.setDate(expirationDate.getDate() + TRIAL_DAYS);
				const expirationDateString = expirationDate.toISOString().substring(0, 19).replace('T', ' ');

				// generate random password 
				const password = Math.random().toString(36).substring(2, 15);
				const email = profile.email;

				await userModel.create(profile.given_name, profile.family_name, email, password, expirationDateString);
				id = await userModel.findByEmailAndPass(email, password)

				if (!id) {
					logger.error(`Registration failure, inconsistent storage`, profile)
					return res.redirect(config.login_ui_url);
				}

				// add api token
				logger.info(`Created user, adding API token`, { id, email })
				await tokenModel.create(id)

				if (process.env.ENV_ID == 'prod') {
					logger.info(`Sending email`, { id, email })
					await sendWelcomeMail({ email });
					await sendAdminUserRegisteredMail({ email });
				}
			}

			// log in
			const sessionKey = sign({
				'user_id': id
			}, config.JWT_KEY);

			// write sessionKey to cookie

			logger.info('Google auth - setting cookie', {sessionKey});

			if (process.env.ENV_ID === 'dev') {
				res.cookie('token', sessionKey, { domain: 'localhost', path:'/' });
			} else {
				res.cookie('token', sessionKey, { domain: 'gratheon.com' });
			}

			// successful login - go to app
			res.redirect(config.app_ui_url);
		} catch (error) {
			console.log(error);
			logger.error("Failed to login with google", error);
			return res.redirect(config.login_ui_url);
		}
	});
}