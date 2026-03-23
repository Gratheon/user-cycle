// global dependencies
import Stripe from 'stripe';
import sign from 'jwt-encode';

// local dependencies
import config from './config/index';
import { userModel } from './models/user';
import { shareTokenModel, tokenModel } from './models/tokens';
import { localeModel } from './models/locales';
import { translationModel } from './models/translations';
import { billingHistoryModel } from './models/billingHistory';
import error_code, { err } from './error_code';
import { logger } from './logger';
import registerUser from './user-register';
import { sleepForSecurity } from './models/sleep';
import { sendAdminUserRegisteredMail, sendWelcomeMail } from './send-mail';
import { registrationNonceModel } from './models/registration-nonce';
import { wrapGraphqlResolversWithMetrics } from './metrics';
import DataLoader from 'dataloader';
import { translationRedisCache } from './cache/translationRedisCache';

const stripe = new Stripe(config.stripe.secret, {
	apiVersion: '2022-08-01'
});

const pluralWords = ['hive', 'apiary', 'box', 'frame', 'bee', 'queen', 'worker', 'drone'];
const pluralLanguages = Object.keys({
	ru: 'russian',
	et: 'estonian',
	tr: 'turkish',
	pl: 'polish',
	de: 'german',
	fr: 'french'
});
const supportedTranslationLangs = [
	'ru', 'et', 'tr', 'pl', 'de', 'fr', 'zh', 'hi', 'es', 'ar', 'bn', 'pt', 'ja'
];

function keyNeedsPluralForms(key: string): boolean {
	const normalized = key.toLowerCase();
	return pluralWords.some(word => normalized === word || normalized === `${word}s`);
}

function normalizeRequestedLangs(langs?: string[] | null): string[] | null {
	if (!langs || langs.length === 0) {
		return null;
	}

	const normalized = Array.from(new Set(
		langs
			.map((lang) => String(lang || '').toLowerCase().trim())
			.filter((lang) => supportedTranslationLangs.includes(lang))
	));

	if (normalized.length === 0) {
		return null;
	}

	return normalized;
}

const baseResolvers = {
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

		billingHistory: async (_, __, ctx) => {
			if (!ctx.uid) {
				logger.warn("Authentication required for billingHistory resolver")
				return err(error_code.AUTHENTICATION_REQUIRED);
			}

			return await billingHistoryModel.getByUserId(ctx.uid);
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

			const expiredPlan = await userModel.expireToFreeIfNeeded(ctx.uid);
			if (expiredPlan) {
				await billingHistoryModel.addSubscriptionExpired(ctx.uid, expiredPlan);
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
		getTranslations: async (_, { inputs, langs }) => {
			logger.info(`[getTranslations] Received request for ${inputs.length} inputs`);
			if (inputs.length === 0) return [];
			const requestedLangs = normalizeRequestedLangs(langs);

			const normalizedInputs = inputs.map((input) => ({
				key: input.key,
				context: input.context || null,
				namespace: input.namespace || null,
				langs: requestedLangs,
			}));

			const results: any[] = new Array(normalizedInputs.length);
			const cachedEntries = await translationRedisCache.getMany(normalizedInputs);
			const cacheMissIndexes: number[] = [];

			for (let index = 0; index < normalizedInputs.length; index++) {
				const input = normalizedInputs[index];
					const cacheKey = translationRedisCache.buildCacheKey({
						key: input.key,
						namespace: input.namespace,
						langs: input.langs
					});
				const cachedTranslation = cachedEntries.get(cacheKey);
				if (!cachedTranslation) {
					cacheMissIndexes.push(index);
					continue;
				}

				results[index] = {
					...cachedTranslation,
					context: input.context,
					__typename: 'Translation'
				};
			}

			if (cacheMissIndexes.length === 0) {
				logger.info(`[getTranslations] Redis cache hit for all ${normalizedInputs.length} inputs`);
				return results;
			}

			const translationIdLoader = new DataLoader(
				async (keys: ReadonlyArray<{ key: string; namespace: string | null }>) =>
					translationModel.getByKeys(keys.map((entry) => ({ key: entry.key, namespace: entry.namespace }))),
				{
					cacheKeyFn: (entry) => `${entry.namespace ?? '__NULL__'}:${entry.key}`
				}
			);

			const hasPluralLoader = new DataLoader(
				async (translationIds: ReadonlyArray<number>) => translationModel.hasPluralFormsBatch(translationIds.map((id) => Number(id))),
				{
					cacheKeyFn: (id) => String(id)
				}
			);

			const translationIdsByIndex = new Map<number, number | null>();
			await Promise.all(cacheMissIndexes.map(async (index) => {
				const input = normalizedInputs[index];
				const translationId = await translationIdLoader.load({ key: input.key, namespace: input.namespace });
				translationIdsByIndex.set(index, translationId);
			}));

			const createIndexes = cacheMissIndexes.filter((index) => !translationIdsByIndex.get(index));
			const existingIndexes = cacheMissIndexes.filter((index) => !!translationIdsByIndex.get(index));

			if (createIndexes.length > 0) {
				const createRequests = createIndexes.map((index) => {
					const input = normalizedInputs[index];
					return {
						key: input.key,
						context: input.context,
						namespace: input.namespace,
						isPlural: keyNeedsPluralForms(input.key),
					};
				});

					const createdTranslations = await translationModel.translateBatch(createRequests, requestedLangs || undefined);
					const warmupEntries: Array<{ input: { key: string; namespace: string | null; langs?: string[] | null }; payload: any }> = [];

				for (let i = 0; i < createIndexes.length; i++) {
					const index = createIndexes[i];
					const input = normalizedInputs[index];
					const created = createdTranslations[i];
					results[index] = {
						...created,
						__typename: 'Translation'
					};
					warmupEntries.push({
							input: { key: input.key, namespace: input.namespace, langs: requestedLangs },
							payload: {
								...created,
								context: input.context
						}
					});
				}

				await translationRedisCache.setMany(warmupEntries);
			}

			if (existingIndexes.length > 0) {
				const hasPluralByIndex = new Map<number, boolean>();

				await Promise.all(existingIndexes.map(async (index) => {
					const translationId = Number(translationIdsByIndex.get(index));
					let hasPluralForms = await hasPluralLoader.load(translationId);

					if (!hasPluralForms && process.env.ENV_ID === 'dev' && keyNeedsPluralForms(normalizedInputs[index].key)) {
						for (const lang of pluralLanguages) {
							const forms = await translationModel.getPluralRules(lang);
							const pluralData = await translationModel.generatePluralForms(normalizedInputs[index].key, lang, forms);
							await translationModel.setPluralForms(translationId, lang, pluralData);
						}
						hasPluralForms = true;
						hasPluralLoader.clear(translationId).prime(translationId, true);
					}

					hasPluralByIndex.set(index, hasPluralForms);
				}));

				const fetchRequests = existingIndexes.map((index) => {
					const input = normalizedInputs[index];
					return {
						key: input.key,
						context: input.context,
						namespace: input.namespace,
						isPlural: hasPluralByIndex.get(index) || false,
					};
				});

					const fetchedTranslations = await translationModel.translateBatch(fetchRequests, requestedLangs || undefined);
					const warmupEntries: Array<{ input: { key: string; namespace: string | null; langs?: string[] | null }; payload: any }> = [];

				for (let i = 0; i < existingIndexes.length; i++) {
					const index = existingIndexes[i];
					const input = normalizedInputs[index];
					const translation = fetchedTranslations[i];
					results[index] = {
						...translation,
						__typename: 'Translation'
					};
					warmupEntries.push({
							input: { key: input.key, namespace: input.namespace, langs: requestedLangs },
							payload: {
								...translation,
							context: input.context
						}
					});
				}

				await translationRedisCache.setMany(warmupEntries);
			}

			logger.info(`[getTranslations] Returning ${results.length} translations (cache misses: ${cacheMissIndexes.length})`);
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

				await baseResolvers.Mutation.cancelSubscription(_, __, ctx);
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

				await billingHistoryModel.addSubscriptionCancelled(
					ctx.uid,
					user.billingPlan || 'hobbyist'
				);

				return await baseResolvers.Query.user(null, null, ctx);
			} catch (e) {
				logger.error(e);
				return err(error_code.INTERNAL_ERROR);
			}
		},
		createCheckoutSession: async (parent, args, ctx) => {
			logger.info(`createCheckoutSession called with args:`, args);

			const { plan = 'hobbyist', cycle = 'monthly' } = args;

			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

			const appUrl = config.stripe.selfUrl;
			const user = await userModel.getById(ctx.uid);

			let priceId: string;
			let mode: 'payment' | 'subscription';

			if (plan === 'addon') {
				priceId = config.stripe.plans.addon.oneTime;
				mode = 'payment';
			} else if (plan === 'hobbyist') {
				priceId = config.stripe.plans.hobbyist.monthly;
				mode = 'subscription';
			} else if (plan === 'starter') {
				priceId = cycle === 'yearly'
					? config.stripe.plans.starter.yearly
					: config.stripe.plans.starter.monthly;
				mode = 'subscription';
			} else if (plan === 'professional') {
				priceId = cycle === 'yearly'
					? config.stripe.plans.professional.yearly
					: config.stripe.plans.professional.monthly;
				mode = 'subscription';
			} else {
				logger.error(`Invalid plan: ${plan}`);
				return null;
			}

			logger.info(`Creating checkout session for user ${ctx.uid}: plan=${plan}, cycle=${cycle}, priceId=${priceId}`);

			try {
				const session = await stripe.checkout.sessions.create({
					customer_email: user.email,
					mode: mode,
					line_items: [
						{
							price: priceId,
							quantity: 1,
						},
					],
					success_url: `${appUrl}/account/success`,
					cancel_url: `${appUrl}/account/cancel`,
					metadata: {
						plan: plan,
						cycle: cycle || 'one-time'
					}
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

			if (!id) {
				await sleepForSecurity()
				logger.error(`Login - INVALID_USERNAME_PASSWORD`, {
					email
				})
				return err(error_code.INVALID_USERNAME_PASSWORD)
			}

			const expiredPlan = await userModel.expireToFreeIfNeeded(id);
			if (expiredPlan) {
				await billingHistoryModel.addSubscriptionExpired(id, expiredPlan);
			}

			const user = await userModel.getById(id)

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

		updateTranslationValue: async (_, { key, lang, value, namespace }, ctx) => {
			if (!ctx.uid) {
				logger.warn("Authentication required for updateTranslationValue");
				return err(error_code.AUTHENTICATION_REQUIRED);
			}

			if (process.env.ENV_ID !== 'dev') {
				logger.warn("updateTranslationValue only allowed in dev mode", { env: process.env.ENV_ID });
				return err(error_code.FORBIDDEN);
			}

			logger.info(`[updateTranslationValue] Updating translation`, { key, lang, value, namespace });

			const translationId = await translationModel.getOrCreate(key, null, namespace || null);
			await translationModel.setValue(translationId, lang, value);

			const translation = await translationModel.translateBatch([{ key, namespace: namespace || null }]);

			if (translation && translation.length > 0) {
				return {
					__typename: 'Translation',
					...translation[0]
				};
			}

			return null;
		},

		batchTranslateLanguage: async (_, { langCode }, ctx) => {
			if (!ctx.uid) {
				logger.warn("Authentication required for batchTranslateLanguage");
				return {
					success: false,
					total: 0,
					processed: 0,
					skipped: 0,
					errors: 0,
					message: "Authentication required"
				};
			}

			if (process.env.ENV_ID !== 'dev') {
				logger.warn("batchTranslateLanguage only allowed in dev mode", { env: process.env.ENV_ID });
				return {
					success: false,
					total: 0,
					processed: 0,
					skipped: 0,
					errors: 0,
					message: "This operation is only allowed in development mode"
				};
			}

			const languagesMap = {
				'ru': 'russian',
				'et': 'estonian',
				'tr': 'turkish',
				'pl': 'polish',
				'de': 'german',
				'fr': 'french',
				'zh': 'chinese',
				'hi': 'hindi',
				'es': 'spanish',
				'ar': 'arabic',
				'bn': 'bengali',
				'pt': 'portuguese',
				'ja': 'japanese',
			};

			if (!languagesMap[langCode]) {
				logger.warn("Unsupported language code", { langCode });
				return {
					success: false,
					total: 0,
					processed: 0,
					skipped: 0,
					errors: 0,
					message: `Unsupported language code: ${langCode}. Supported: ${Object.keys(languagesMap).join(', ')}`
				};
			}

			logger.info(`[batchTranslateLanguage] Starting batch translation for ${languagesMap[langCode]} (${langCode})`);

			const { storage } = require('./storage');
			const { sql } = require('@databases/mysql');

			try {
				const allTranslations = await storage().query(
					sql`SELECT id, \`key\`, context FROM translations ORDER BY id`
				);

				logger.info(`[batchTranslateLanguage] Found ${allTranslations.length} translation keys to process`);

				const translationsWithPlurals = await storage().query(
					sql`SELECT DISTINCT translation_id FROM plural_forms`
				);
				const pluralSet = new Set(translationsWithPlurals.map(row => row.translation_id));

				let processedCount = 0;
				let skippedCount = 0;
				let errorCount = 0;

				for (const translation of allTranslations) {
					const translationId = translation.id;
					const key = translation.key;
					const context = translation.context;
					const isPlural = pluralSet.has(translationId);

					try {
						if (isPlural) {
							const existingPlural = await translationModel.getPluralForms(translationId, langCode);
							if (existingPlural) {
								logger.debug(`[batchTranslateLanguage] Skipping plural "${key}" - already exists`);
								skippedCount++;
								continue;
							}

							logger.info(`[batchTranslateLanguage] Translating plural "${key}"...`);
							const forms = await translationModel.getPluralRules(langCode);
							const pluralData = await translationModel.generatePluralForms(key, langCode, forms);
							await translationModel.setPluralForms(translationId, langCode, pluralData);
							logger.info(`[batchTranslateLanguage] Plural "${key}": ${JSON.stringify(pluralData)}`);
							processedCount++;
						} else {
							const existingValue = await translationModel.getValue(translationId, langCode);
							if (existingValue) {
								logger.debug(`[batchTranslateLanguage] Skipping "${key}" - already exists`);
								skippedCount++;
								continue;
							}

							logger.info(`[batchTranslateLanguage] Translating "${key}"...`);
							const value = await translationModel.generateTranslation(key, langCode, context);
							await translationModel.setValue(translationId, langCode, value);
							logger.info(`[batchTranslateLanguage] "${key}" -> "${value}"`);
							processedCount++;
						}
					} catch (error) {
						logger.error(`[batchTranslateLanguage] Error translating "${key}":`, error);
						errorCount++;
					}
				}

				logger.info(`[batchTranslateLanguage] Complete. Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);

				return {
					success: true,
					total: allTranslations.length,
					processed: processedCount,
					skipped: skippedCount,
					errors: errorCount,
					message: `Successfully processed ${processedCount} translations for ${languagesMap[langCode]}`
				};

			} catch (error) {
				logger.error('[batchTranslateLanguage] Fatal error:', error);
				const errorMessage = error instanceof Error ? error.message : String(error);
				return {
					success: false,
					total: 0,
					processed: 0,
					skipped: 0,
					errors: 1,
					message: `Error: ${errorMessage}`
				};
			}
		},
	}
}

export const resolvers = wrapGraphqlResolversWithMetrics(baseResolvers);
