// global dependencies
import stripe from 'stripe';
import fastifyRawBody from 'fastify-raw-body';

// local dependencies
import {logger} from './logger';
import config from './config/index';
import { sql, storage } from "./storage";
import { userModel } from './models/user';
import { billingHistoryModel } from './models/billingHistory';

// This is your Stripe CLI webhook secret for testing your endpoint locally.
const endpointSecret = config.stripe.webhook_secret;

export function registerStripe(app) {

	app.register(fastifyRawBody, {
		field: 'rawBody', // change the default request.rawBody property name
		global: false, // add the rawBody to every request. **Default true**
		encoding: 'utf8', // set it to false to set rawBody as a Buffer **Default utf8**
		runFirst: true, // get the body before any preParsing hook change/uncompress it. **Default false**
		routes: [] // array of routes, **`global`** will be ignored, wildcard routes not supported
	})

	app.post('/webhook', {
		config: {
			// add the rawBody to this route. if false, rawBody will be disabled when global is true
			rawBody: true
		},
		handler: async (request, response) => {
			const stripeSignature = request.headers['stripe-signature'];

			let event;

			const parsedBody = request.body;

			try {
				//@ts-ignore
				event = stripe.webhooks.constructEvent(request.rawBody, stripeSignature, endpointSecret);
			} catch (err) {
				logger.error(err);
				//@ts-ignore
				response.status(400).send(`Webhook Error: ${err.message}`);
				return;
			}
			try {
				// One transaction for the event row and every account/billing write it causes:
				// a crash or error mid-way rolls everything back, and Stripe's retry reprocesses it.
				await storage().tx(async (dbi) => {
				const session = event?.data?.object;
				// WHY sql``: the previous raw-string queries were rejected by @databases with
				// "Invalid query", so no webhook was ever processed.
				// ON CONFLICT DO NOTHING makes Stripe retries idempotent: an already stored event
				// is acknowledged without extending subscriptions or changing plans twice.
				const inserted = await dbi.query(
					sql`INSERT INTO stripe_events (id, user_id, "type", created, data)
					VALUES (
						${parsedBody.id},
						(SELECT id FROM account WHERE email=${session?.customer_email ?? null} LIMIT 1),
						${parsedBody.type},
						to_timestamp(${Number(parsedBody.created)}),
						${JSON.stringify(parsedBody.data)}
					)
					ON CONFLICT (id) DO NOTHING
					RETURNING id`
				);

				if (inserted.length === 0) {
					logger.info(`Stripe event ${parsedBody.id} was already processed, skipping`);
					return;
				}

					// Handle the event
					switch (event.type) {
						case 'checkout.session.completed':
							// Payment is successful and the checkout session is completed.
							// Provision subscription and billing tier if the session carries a known plan.
							if (session.subscription) {
								await userModel.updateSubscription({
									subscription: session.subscription,
									email: session.customer_email
								}, dbi);
							}

							{
								const sessionPlan = String(session?.metadata?.plan || '').toLowerCase();
								const sessionCycle = String(session?.metadata?.cycle || 'one-time').toLowerCase();
								const paidPlan = ['hobbyist', 'starter', 'professional'].includes(sessionPlan)
									? sessionPlan
									: null;

								if (paidPlan) {
									const userRows = await dbi.query(
										sql`SELECT id, billing_plan FROM account WHERE email=${session.customer_email} LIMIT 1`
									);

									if (userRows && userRows[0]?.id) {
										const userId = userRows[0].id;
										const previousPlan = userRows[0].billing_plan || 'free';

										await dbi.query(
											sql`UPDATE account SET billing_plan=${paidPlan} WHERE email=${session.customer_email}`
										);

										await billingHistoryModel.addSubscriptionCreated(
											userId,
											paidPlan,
											sessionCycle,
											dbi
										);

										if (previousPlan !== paidPlan) {
											await billingHistoryModel.addTierChanged(
												userId,
												paidPlan,
												`Checkout completed (${sessionCycle})`,
												dbi
											);
										}
									}
								}
							}
							break;
					case 'invoice.paid':
						// Continue to provision the subscription as payments continue to be made.
						// Store the status in your database and check when a user accesses your service.
						// This approach helps you avoid hitting rate limits.
						logger.info('Extending session for email', session.customer_email);
						await userModel.extendAccountExpirationByOneMonth({
							email: session.customer_email
						}, dbi);
						break;
					case 'invoice.payment_failed':
						logger.warn('Payment failed for email', session.customer_email);
						const userIdFailed = await dbi.query(
							sql`SELECT id, billing_plan FROM account WHERE email=${session.customer_email} LIMIT 1`
						);

						if (userIdFailed && userIdFailed[0]?.id) {
							const previousPlan = userIdFailed[0].billing_plan || 'hobbyist';

							await billingHistoryModel.addPaymentFailed(
								userIdFailed[0].id,
								previousPlan,
								'Payment method declined',
								dbi
							);

							await dbi.query(
								sql`UPDATE account SET billing_plan='free', stripe_subscription=NULL WHERE email=${session.customer_email}`
							);

							await billingHistoryModel.addSubscriptionExpired(
								userIdFailed[0].id,
								previousPlan,
								dbi
							);
						}
						break;

					// case 'customer.subscription.trial_will_end': break;
					// case 'customer.subscription.deleted': break;
					// case 'customer.subscription.created': break;
					// case 'customer.subscription.updated': break;
					// case 'charge.succeeded': break;
					// case 'payment_method.attached': break;
					// case 'customer.created': break;
					// case 'customer.updated': break;
					// case 'invoice.created': break;
					// case 'invoice.finalized': break;
					// case 'invoice.payment_succeeded': break;
					// case 'payment_intent.succeeded': break;
					// case 'payment_intent.created': break;

					default:
						logger.info(`Unhandled event type ${event.type}`);
				}
				});

			} catch (e) {
				logger.error(e);
				throw e;
			}

			// Return a 200 response to acknowledge receipt of the event
			response.send();
		}
	})
}
