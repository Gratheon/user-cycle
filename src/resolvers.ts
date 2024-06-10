// global dependencies
import Stripe from 'stripe';
import sign from 'jwt-encode';

// local dependencies
import config from './config/index';
import { sendWelcomeMail, sendAdminUserRegisteredMail } from './send-mail';
import { userModel } from './models/user';
import { tokenModel } from './models/tokens';
import { localeModel } from './models/locales';
import error_code from './error_code';
import { logger } from './logger';

const stripe = new Stripe(config.stripe.secret, {
	apiVersion: '2022-08-01'
});

function err(code) {
	return {
		__typename: 'Error',
		code
	};
}

const TRIAL_DAYS = 14; // should not affect free billing_plan

export const resolvers = {
	Query: {
		invoices: async (_, __, ctx) => {
			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

			return await userModel.getInvoices(ctx);
		},
		api_tokens: async (_, __, ctx) => {
			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

			return await tokenModel.getTokens(ctx);
		},
		user: async (_, __, ctx) => {
			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

			const user = await userModel.getById(ctx.uid)
			if (user) {
				user.hasSubscription = user.stripe_subscription !== null;
				delete user.stripe_subscription;
			}

			return {
				__typename: 'User',
				...user
			};
		},
		translate: async (_, { en, key, tc }, __, ctx) => {
			const result = (await localeModel.translate({ en, key, tc }));

			if (!result) return null;

			return {
				...result,
				__typename: 'Locale'
			}
		}
	},
	Mutation: {
		generateApiToken: async (_, __, ctx) => {
			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

			return await tokenModel.create(ctx.uid)
		},
		validateApiToken: async (_, args) => {
			const uid = tokenModel.getUserIDByToken(args.token)

			if (!uid) {
				return err(error_code.INVALID_TOKEN);
			}

			return {
				__typename: 'TokenUser',
				id: uid
			};

		},
		deleteUserSelf: async (_, __, ctx) => {
			try {
				if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

				await resolvers.Mutation.cancelSubscription(_, __, ctx);
				await userModel.deleteSelf(ctx.uid);
			} catch (e) {
				logger.error(e);
				return err(error_code.INTERNAL_ERROR);
			}
			return true;
		},
		cancelSubscription: async (_, __, ctx) => {
			try {
				if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

				const user = await userModel.getById(ctx.uid);

				if (!user.stripe_subscription) {
					return err(error_code.MISSING_SUBSCRIPTION);
				}
				stripe.subscriptions.del(user.stripe_subscription);

				await userModel.updateSubscription({
					subscription: null,
					email: user.email,
				})

				return await resolvers.Query.user(null, null, ctx);
			} catch (e) {
				logger.error(e);
				return err(error_code.INTERNAL_ERROR);
			}
		},
		createCheckoutSession: async (parent, args, ctx) => {
			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

			const appUrl = config.stripe.selfUrl;

			const user = await userModel.getById(ctx.uid);

			// Create new Checkout Session for the order
			// Other optional params include:
			// [billing_address_collection] - to display billing address details on the page
			// [customer] - if you have an existing Stripe Customer ID
			// [customer_email] - lets you prefill the email input in the form
			// [automatic_tax] - to automatically calculate sales tax, VAT and GST in the checkout page
			// For full details see https://stripe.com/docs/api/checkout/sessions/create
			try {
				const session = await stripe.checkout.sessions.create({
					customer_email: user.email,
					mode: "subscription",
					line_items: [
						{
							price: config.stripe.price,
							quantity: 1,
						},
					],
					// ?session_id={CHECKOUT_SESSION_ID} means the redirect will have the session ID set as a query param
					success_url: `${appUrl}/account/success`,
					// success_url: `${domainURL}/account/success?session_id={CHECKOUT_SESSION_ID}`,
					cancel_url: `${appUrl}/account/cancel`,
					// automatic_tax: { enabled: true }
				});

				return session.url;
			} catch (e) {
				logger.error(e);
				return null;
			}
		},

		updateUser: async (parent, { user }, ctx) => {
			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

			try {
				await userModel.update(user, ctx.uid);
				const result = await userModel.getById(ctx.uid);

				return {
					__typename: 'User',
					...result
				}

			} catch (e) {
				logger.error(e);
				return null;
			}
		},
		login: async (_, { email, password }) => {
			const id = await userModel.findForLogin(email, password)
			const user = await userModel.getById(id)

			if (!id) {
				await sleepForSecurity()
				logger.error(`Login - INVALID_USERNAME_PASSWORD`, {
					email
				})
				return err(error_code.INVALID_USERNAME_PASSWORD)
			}

			userModel.updateLastLogin(id)

			logger.info(`User logged in`, { user })
			const sessionKey = sign({
				'user_id': id
			}, config.JWT_KEY);

			return {
				__typename: 'UserSession',
				key: sessionKey,
				user: {
					__typename: 'User',
					...user
				}
			}
		},
		register: async (_, { first_name, last_name, email, password }) => {
			// try to login first
			let id = await userModel.findForLogin(email, password)

			if (!id) {
				const exID = await userModel.findEmailTaken(email)

				// wait for security
				await new Promise(resolve => setTimeout(resolve, 500));

				if (exID) {
					await sleepForSecurity()
					logger.warn(`Registration - EMAIL_TAKEN`, { email })
					return err(error_code.EMAIL_TAKEN);
				}

				const expirationDate = new Date();
				expirationDate.setDate(expirationDate.getDate() + TRIAL_DAYS);
				const expirationDateString = expirationDate.toISOString().substring(0, 19).replace('T', ' ');

				// register
				await userModel.create(first_name, last_name, email, password, expirationDateString);
				id = await userModel.findForLogin(email, password)

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
	}
}

async function sleepForSecurity() {
	// slow down API for security to slow down brute-force
	await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 5000));
}