// global dependencies
import Stripe from 'stripe';
import sign from 'jwt-encode';

// local dependencies
import config from './config/index';
import { userModel } from './models/user';
import { shareTokenModel, tokenModel } from './models/tokens';
import { localeModel } from './models/locales';
import error_code, { err } from './error_code';
import { logger } from './logger';
import registerUser from './user-register';
import { sleepForSecurity } from './models/sleep';

const stripe = new Stripe(config.stripe.secret, {
	apiVersion: '2022-08-01'
});


export const resolvers = {
	Query: {
		invoices: async (_, __, ctx) => {
			if (!ctx.uid) {
				logger.warn("Authentication required for invoices resolver")
				return err(error_code.AUTHENTICATION_REQUIRED);
			}

			return await userModel.getInvoices(ctx);
		},
		apiTokens: async (_, __, ctx) => {
			if (!ctx.uid) {
				logger.warn("Authentication required for apiTokens resolver")
				return err(error_code.AUTHENTICATION_REQUIRED);
			}

			return await tokenModel.getTokens(ctx);
		},
		shareTokens: async (_, __, ctx) => {
			if (!ctx.uid) {
				logger.warn("Authentication required for apiTokens resolver")
				return err(error_code.AUTHENTICATION_REQUIRED);
			}

			return await shareTokenModel.getTokens(ctx);
		},
		user: async (_, __, ctx) => {
			if (!ctx.uid) {
				logger.warn("Authentication required for user resolver")
				return err(error_code.AUTHENTICATION_REQUIRED);
			}

			const user = await userModel.getById(ctx.uid)
			logger.info("user", user)
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
		generateShareToken: async (_, {name, sourceUrl, scopes}, ctx) => {
			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);
			
			return await shareTokenModel.create(ctx.uid, name, sourceUrl, scopes)
		},
		revokeApiToken: async (_, { token }, ctx) => {
			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

			await tokenModel.softDelete(ctx, token)
		},
		revokeShareToken: async (_, { token }, ctx) => {
			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

			await shareTokenModel.softDelete(ctx, token)
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
			const id = await userModel.findByEmailAndPass(email, password)
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
		register: registerUser,
	}
}