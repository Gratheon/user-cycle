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

const stripe = new Stripe(config.stripe.secret, {
	apiVersion: '2022-08-01'
});

const TRIAL_DAYS = 14;
export const resolvers = {
	Query: {
		invoices: async (parent, args, ctx) => {
			return await userModel.getInvoices(ctx);
		},
		user: async (_, __, ctx) => {
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
		cancelSubscription: async (_, __, ctx) => {
			try {
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
			await userModel.update(user, ctx.uid);
			const result = await userModel.getById(ctx);

			return {
				__typename: 'User',
				...result
			}
		},
		login: async (parent, { email, password }) => {
			const rows = await storage().query(
				sql`SELECT id FROM account 
				WHERE email=${email} AND password=${sha1(password)}`
			);

			if (!rows || !rows[0]) {
				return {
					__typename: 'Error',
					code: "INVALID"
				};
			}

			const id = rows[0].id;

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

			await storage().query(
				sql`INSERT INTO account (email, password, date_expiration)
				VALUES(${email}, ${sha1(password)}, ${expirationDateString})`
			);

			const rows = await storage().query(
				sql`SELECT id FROM account WHERE email=${email} AND password=${sha1(password)}`
			);

			await sendMail({
				email
			});

			const id = rows[0].id;

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
