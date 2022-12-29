import { sql } from "@databases/mysql";

import { storage } from "../storage.js";

export const userModel = {
	extendAccountExpirationByOneMonth: async ({ email }) => {
		// extend subscriptions where date_expiration is in the future
		await storage().query(
			`UPDATE account
			SET date_expiration = DATE_ADD(date_expiration, INTERVAL 1 MONTH) 
			WHERE email=? AND date_expiration > NOW()`, [
			email
		]
		);

		// extend subscriptions where date_expiration is in the past
		await storage().query(
			`UPDATE account
			SET date_expiration = DATE_ADD(NOW(), INTERVAL 1 MONTH) 
			WHERE email=? AND date_expiration<NOW()`, [
			email
		]
		);
	},
	updateSubscription: async ({ subscription, email }) => {
		await storage().query(
			"UPDATE `account` SET stripe_subscription=? WHERE email=?", [
			subscription,
			email
		]
		);
	},

	getInvoices: async function (ctx) {
		const result = await storage().query(
			sql`SELECT created as \`date\`, 
				JSON_EXTRACT(data, "$.object.invoice_pdf") as url, 
				JSON_EXTRACT(data, "$.object.total") as total, 
				JSON_EXTRACT(data, "$.object.currency") as currency
			FROM stripe_events
			WHERE user_id=${ctx.uid} AND \`type\`='invoice.payment_succeeded'
			ORDER BY created DESC
			LIMIT 10`
		);

		return result;
	},

	getById: async function (ctx) {
		const result = await storage().query(
			sql`SELECT id, email, first_name, last_name, date_expiration, date_added, stripe_subscription, 
			(date_expiration IS NOT NULL AND date_expiration < NOW()) as isSubscriptionExpired
			FROM account 
			WHERE id=${ctx.uid}
			LIMIT 1`
		);

		return result[0];
	},

	update: async function (user, uid) {
		await storage().query(
			"UPDATE `account` SET first_name=?, last_name=? WHERE id=?", [
			user.first_name,
			user.last_name,
			uid,
		]
		);
	},
}
