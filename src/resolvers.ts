// global dependencies
import Stripe from 'stripe';
import sign from 'jwt-encode';

// local dependencies
import config from './config/index';
import { userModel } from './models/user';
import { shareTokenModel, tokenModel } from './models/tokens';
import { billingHistoryModel } from './models/billingHistory';
import { passwordResetModel } from './models/password-reset';
import error_code, { err } from './error_code';
import { logger } from './logger';
import registerUser from './user-register';
import { sleepForSecurity } from './models/sleep';
import { sendAdminUserRegisteredMail, sendPasswordResetMail, sendWelcomeMail } from './send-mail';
import { registrationNonceModel } from './models/registration-nonce';
import { wrapGraphqlResolversWithMetrics } from './metrics';
import { translationResolvers } from './resolvers/translations';

const stripe = new Stripe(config.stripe.secret, {
	apiVersion: '2022-08-01'
});


const baseResolvers = {
	Query: {
		...translationResolvers.Query,
		registrationNonce: async () => {
			return registrationNonceModel.generateNonce();
		},
		aiAdvisorUsage: async () => {
			// Usage accounting is not stored yet. Keep the GraphQL contract available
			// without returning misleading limits or counters.
			return null;
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
			if (!user) {
				logger.warn("Authenticated user record not found", { uid: ctx.uid });
				return err(error_code.USER_NOT_FOUND);
			}

			user.hasSubscription = user.stripe_subscription !== null;
			delete user.stripe_subscription;

			return {
				__typename: 'User',
				...user
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
			...translationResolvers.Mutation,
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
				priceId = cycle === 'yearly'
					? config.stripe.plans.hobbyist.yearly
					: config.stripe.plans.hobbyist.monthly;
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
		requestPasswordReset: async (_, { email }, ctx) => {
			const normalizedEmail = passwordResetModel.normalizeEmail(email);
			const account = await passwordResetModel.findAccountByEmail(normalizedEmail);
			const identities = [
				normalizedEmail,
				ctx?.ip ? `ip:${ctx.ip}` : '',
				account?.id ? `user:${account.id}` : '',
			].filter(Boolean);

			const isRateLimited = await passwordResetModel.isRateLimited(identities);
			if (isRateLimited || !account) {
				if (isRateLimited) {
					logger.warn('Password reset request rate-limited', { email: normalizedEmail, ip: ctx?.ip });
				}

				await sleepForSecurity();
				return {
					__typename: 'PasswordResetRequestResult',
					ok: true,
				};
			}

			try {
				const { token } = await passwordResetModel.createResetToken(account.id);
				const resetUrl = `${config.password_reset_ui_url}?token=${encodeURIComponent(token)}`;
				await sendPasswordResetMail({ email: account.email, resetUrl, lang: account.lang });
			} catch (e) {
				logger.errorEnriched('Failed to create or send password reset email', e, { email: normalizedEmail });
			}

			return {
				__typename: 'PasswordResetRequestResult',
				ok: true,
			};
		},

		resetPassword: async (_, { token, password }) => {
			const result = await passwordResetModel.resetPassword(token, password);

			if (result === 'SIMPLE_PASSWORD') {
				return err(error_code.SIMPLE_PASSWORD);
			}

			if (result === 'INVALID_TOKEN') {
				await sleepForSecurity();
				return err(error_code.INVALID_TOKEN);
			}

			return {
				__typename: 'PasswordResetRequestResult',
				ok: true,
			};
		},


		updateUser: async (parent, { user }, ctx) => {
			if (!ctx.uid) return err(error_code.AUTHENTICATION_REQUIRED);

			try {
				await userModel.update(user, ctx.uid);
				const result = await userModel.getById(ctx.uid);

				if (!result) {
					logger.warn("Updated user record could not be reloaded", { uid: ctx.uid });
					return err(error_code.USER_NOT_FOUND);
				}

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


	}
}

export const resolvers = wrapGraphqlResolversWithMetrics(baseResolvers);
