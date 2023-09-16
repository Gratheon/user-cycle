// global dependencies
import Stripe from 'stripe';
import sign from 'jwt-encode';
import sha1 from 'sha1';
import { sql } from "@databases/mysql";

// local dependencies
import config from './config/index';
import { sendMail } from './send-mail';
import { storage } from './storage';
import { userModel } from './models/user';
import { tokenModel } from './models/tokens';

const stripe = new Stripe(config.stripe.secret, {
	apiVersion: '2022-08-01'
});

const TRIAL_DAYS = 14;
export const resolvers = {
	Query: {
		invoices: async (parent, args, ctx) => {
			if (!ctx.uid) throw new Error('Unauthorized');
			return await userModel.getInvoices(ctx);
		},
		api_tokens: async (parent, args, ctx) => {
			if (!ctx.uid) throw new Error('Unauthorized');
			return await tokenModel.getTokens(ctx);
		},
		user: async (_, __, ctx) => {
			if (!ctx.uid) throw new Error('Unauthorized');
			const user = await userModel.getById(ctx)
			if (user) {
				user.hasSubscription = user.stripe_subscription !== null;
				delete user.stripe_subscription;
			}

			return {
				__typename: 'User',
				...user
			};
		}
	},
	Mutation: {
		generateApiToken: async (_, __, ctx) => {
			return await tokenModel.create(ctx.uid)
		},
		validateApiToken: async (_, args) => {
			const uid = tokenModel.getUserIDByToken(args.token)

			if (!uid) {
				return {
					__typename: 'Error',
					code: "INVALID_TOKEN"
				};
			}

			return {
				__typename: 'TokenUser',
				id: uid
			};

		},
		cancelSubscription: async (_, __, ctx) => {
			try {
				if (!ctx.uid) throw new Error('Unauthorized');

				const user = await userModel.getById(ctx);

				if (!user.stripe_subscription) {
					return {
						__typename: 'Error',
						code: "MISSING_SUBSCRIPTION"
					};
				}
				stripe.subscriptions.del(user.stripe_subscription);

				await userModel.updateSubscription({
					subscription: null,
					email: user.email,
				})

				return await resolvers.Query.user(null, null, ctx);
			} catch (e) {
				console.error(e);
				return {
					__typename: 'Error',
					code: "INTERNAL_ERROR"
				};
			}
		},
		createCheckoutSession: async (parent, args, ctx) => {
			if (!ctx.uid) throw new Error('Unauthorized');

			const domainURL = config.stripe.selfUrl;

			const user = await userModel.getById(ctx);

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
					success_url: `${domainURL}/account/success`,
					// success_url: `${domainURL}/account/success?session_id={CHECKOUT_SESSION_ID}`,
					cancel_url: `${domainURL}/account/cancel`,
					// automatic_tax: { enabled: true }
				});

				return session.url;
			} catch (e) {
				console.error(e);
				return null;
			}
		},

		updateUser: async (parent, { user }, ctx) => {
			if (!ctx.uid) throw new Error('Unauthorized');
			
			await userModel.update(user, ctx.uid);
			const result = await userModel.getById(ctx);

			return {
				__typename: 'User',
				...result
			}
		},
		login: async (parent, { email, password }) => {

			const id = await userModel.findForLogin(email, password)

			if (!id) {
				return {
					__typename: 'Error',
					code: "INVALID"
				};
			}

			const sessionKey = sign({
				'user_id': id
			}, config.JWT_KEY);

			return {
				__typename: 'UserSession',
				key: sessionKey
			}
		},
		register: async (parent, { email, password }) => {
			const expirationDate = new Date();
			expirationDate.setDate(expirationDate.getDate() + TRIAL_DAYS);
			const expirationDateString = expirationDate.toISOString().substring(0, 19).replace('T', ' ');

			await userModel.create(email, password, expirationDateString);
			const id = await userModel.findForLogin(email, password)
			await tokenModel.create(id)

			await sendMail({
				email
			});

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
