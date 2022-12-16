// global dependencies
import stripe from 'stripe';
import fastifyRawBody from 'fastify-raw-body';

// local dependencies
import config from './../config/config.js';
import { storage } from "./storage.js";
import { userModel } from './models/user.js';

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
				// console.log('webhook body', request.body)
				event = stripe.webhooks.constructEvent(request.rawBody, stripeSignature, endpointSecret);
			} catch (err) {
				console.error(err);
				response.status(400).send(`Webhook Error: ${err.message}`);
				return;
			}
			try {
				const session = event?.data?.object;
				await storage().query(
					"INSERT INTO `stripe_events` (`id`, `user_id`, `type`, `created`, `data`) " +
					"VALUES (?, (SELECT id FROM `account` WHERE `email`=?), ?, FROM_UNIXTIME(?), ?)", [
					parsedBody.id,
					session?.customer_email,
					parsedBody.type,
					parsedBody.created,
					JSON.stringify(parsedBody.data),
				]
				);

				// Handle the event
				switch (event.type) {
					case 'checkout.session.completed':
						// Payment is successful and the subscription is created.
						// You should provision the subscription and save the customer ID to your database.
						await userModel.updateSubscription({
							subscription: session.subscription,
							email: session.customer_email
						});
						break;
					case 'invoice.paid':
						// Continue to provision the subscription as payments continue to be made.
						// Store the status in your database and check when a user accesses your service.
						// This approach helps you avoid hitting rate limits.
						console.log('Extending session for email', session.customer_email);
						await userModel.extendAccountExpirationByOneMonth({
							email: session.customer_email
						});
						break;
					case 'invoice.payment_failed':
						// The payment failed or the customer does not have a valid payment method.
						// The subscription becomes past_due. Notify your customer and send them to the
						// customer portal to update their payment information.
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
						console.log(`Unhandled event type ${event.type}`);
				}

			} catch (e) {
				console.error(e);
				throw e;
			}

			// Return a 200 response to acknowledge receipt of the event
			response.send();
		}
	})
}
