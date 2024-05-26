import { sql } from "@databases/mysql";
import sha1 from 'sha1';

import { storage } from "../storage";

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
				COALESCE(JSON_EXTRACT(data, "$.object.invoice_pdf"), '') as url, 
				COALESCE(JSON_EXTRACT(data, "$.object.total"), 0) as total, 
				COALESCE(JSON_EXTRACT(data, "$.object.currency"), '') as currency
			FROM stripe_events
			WHERE user_id=${ctx.uid} AND \`type\`='invoice.payment_succeeded'
			ORDER BY created DESC
			LIMIT 10`
		);

		return result;
	},

	getById: async function (id) {
		const result = await storage().query(
			sql`SELECT id, email, first_name, last_name, date_expiration, date_added, 
			stripe_subscription, lang,
			billing_plan as billingPlan,
			(date_expiration IS NOT NULL AND date_expiration < NOW()) as isSubscriptionExpired
			FROM account 
			WHERE id=${id}
			LIMIT 1`
		);

		return result[0];
	},

	deleteSelf: async function (uid) {
		await storage().query(
			sql`DELETE FROM \`account\` WHERE id=${uid}`
		);
	},

	update: async function (user, uid) {
		await storage().query(
			sql`UPDATE \`account\` 
			SET first_name=${user.first_name}, last_name=${user.last_name}, lang=${user.lang}
			WHERE id=${uid}`
		);
	},
	updateLastLogin: async function (uid) {
		await storage().query(sql`UPDATE \`account\` SET date_last_login=NOW() WHERE id=${uid}`);
	},

	create: async function (email, password, expirationDateString) {
		return await storage().query(
			sql`INSERT INTO account (email, password, date_expiration)
			VALUES(${email}, ${sha1(password)}, ${expirationDateString})`
		);
	},

	findForLogin: async function (email, password) {
		const rows = await storage().query(
			sql`SELECT id FROM account WHERE email=${email} AND password=${sha1(password)}`
		);

		if (!rows[0]) {
			return null
		}

		return rows[0].id;
	},

	findEmailTaken: async function (email) {
		const rows = await storage().query(
			sql`SELECT id FROM account WHERE email=${email}`
		);

		if (!rows[0]) {
			return null
		}

		return rows[0].id;
	}
}
