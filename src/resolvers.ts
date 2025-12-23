// global dependencies
import Stripe from 'stripe';
import sign from 'jwt-encode';

// local dependencies
import config from './config/index';
import { userModel } from './models/user';
import { shareTokenModel, tokenModel } from './models/tokens';
import { localeModel } from './models/locales';
import { translationModel } from './models/translations';
import error_code, { err } from './error_code';
import { logger } from './logger';
import registerUser from './user-register';
import { sleepForSecurity } from './models/sleep';
import { sendAdminUserRegisteredMail, sendWelcomeMail } from './send-mail';
import { registrationNonceModel } from './models/registration-nonce';

const stripe = new Stripe(config.stripe.secret, {
	apiVersion: '2022-08-01'
});


export const resolvers = {
	Query: {
		registrationNonce: async () => {
			return registrationNonceModel.generateNonce();
		},
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
		},
		translateBatch: async (_, { requests }) => {
			const results = await localeModel.translateBatch(requests);
			return results.map(result => ({
				...result,
				__typename: 'Locale'
			}));
		},
		getTranslations: async (_, { keys }) => {
			logger.info(`[getTranslations] Received request for ${keys.length} keys:`, { keys });
			const results = [];

			// List of words that should have plural forms
			const pluralWords = ['hive', 'apiary', 'box', 'frame', 'bee', 'queen', 'worker', 'drone'];

			for (const key of keys) {
				logger.info(`[getTranslations] Processing key: "${key}"`);

				const translationId = await translationModel.getByKey(key);
				logger.info(`[getTranslations] Translation ID for "${key}":`, { translationId });

				if (!translationId) {
					logger.info(`[getTranslations] No existing translation for "${key}", creating new one`);

					// Check if this is a word that needs plural forms
					const needsPluralForms = pluralWords.some(word =>
						key.toLowerCase() === word || key.toLowerCase() === word + 's'
					);

					logger.info(`[getTranslations] Word "${key}" needs plural forms:`, { needsPluralForms });

					const [newTranslation] = await translationModel.translateBatch([
						{ key, isPlural: needsPluralForms }
					]);

					logger.info(`[getTranslations] Created new translation:`, {
						key,
						id: newTranslation.id,
						hasValues: !!newTranslation.values,
						hasPluralForms: !!newTranslation.plurals
					});
					results.push({
						...newTranslation,
						__typename: 'Translation'
					});
					continue;
				}

				const hasPluralForms = await translationModel.hasPluralForms(translationId);
				logger.info(`[getTranslations] Plural forms check for "${key}" (id: ${translationId}):`, { hasPluralForms });

				// If no plural forms but should have them (dev mode only), generate them
				if (!hasPluralForms && process.env.ENV_ID === 'dev') {
					const shouldHavePlurals = pluralWords.some(word =>
						key.toLowerCase() === word || key.toLowerCase() === word + 's'
					);

					if (shouldHavePlurals) {
						logger.info(`[getTranslations] Generating missing plural forms for "${key}" in dev mode`);

						// Generate plural forms for all languages
						for (const lang of Object.keys({ ru: 'russian', et: 'estonian', tr: 'turkish', pl: 'polish', de: 'german', fr: 'french' })) {
							const forms = await translationModel.getPluralRules(lang);
							const pluralData = await translationModel.generatePluralForms(key, lang, forms);
							await translationModel.setPluralForms(translationId, lang, pluralData);
							logger.info(`[getTranslations] Generated plural forms for "${key}" in ${lang}`);
						}
					}
				}

				// Re-check if we now have plural forms
				const hasPluralsNow = await translationModel.hasPluralForms(translationId);

				const [translation] = await translationModel.translateBatch([
					{ key, isPlural: hasPluralsNow }
				]);

				logger.info(`[getTranslations] Final translation for "${key}":`, {
					id: translation.id,
					key: translation.key,
					isPlural: translation.isPlural,
					hasValues: !!translation.values,
					hasPluralForms: !!translation.plurals,
					valueKeys: translation.values ? Object.keys(translation.values) : [],
					pluralKeys: translation.plurals ? Object.keys(translation.plurals) : []
				});

				results.push({
					...translation,
					__typename: 'Translation'
				});
			}

			logger.info(`[getTranslations] Returning ${results.length} translations`);
			return results;
		},
		getPluralRules: async (_, { lang }) => {
			const forms = await translationModel.getPluralRules(lang);
			return {
				lang,
				forms,
				__typename: 'PluralRules'
			};
		},
		validateShareToken: async (_, { token }) => {
			const details = await shareTokenModel.getTokenDetailsByToken(token);

			if (!details) {
				logger.warn("Invalid or expired share token provided", { token });
				// Add a small delay to mitigate timing attacks
				await sleepForSecurity();
				return { __typename: 'Error', code: error_code.INVALID_TOKEN };
			}

			logger.info("Validated share token", { tokenId: details.id, name: details.name });
			// Explicitly add __typename for the union type resolution
			return {
				__typename: 'ShareTokenDetails', // Ensure this is included
				id: details.id,
				name: details.name,
				scopes: details.scopes, // Return parsed scopes
				userId: details.userId, // Add userId
			};
		}
	},
	Mutation: {
		generateApiToken: async (_, __, ctx) => {
			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

			return await tokenModel.create(ctx.uid)
		},
		generateShareToken: async (_, {name, sourceUrl, scopes, scopeParams}, ctx) => {
			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

			return await shareTokenModel.create(ctx.uid, name, sourceUrl, scopes, scopeParams)
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

			await userModel.updateLastLogin(id)

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
