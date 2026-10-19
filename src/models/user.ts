import { sql } from "@databases/pg";
import sha1 from 'sha1';

import { storage } from "../storage";
export const TRIAL_DAYS = 14; // should not affect free billing_plan

let supportsAccountLocaleColumn: boolean | null = null;
let supportsAccountTemperatureUnitColumn: boolean | null = null;

function isMissingColumnError(error: unknown, columnName: string): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const err = error as { code?: string; sqlMessage?: string };
	return err.code === 'ER_BAD_FIELD_ERROR' && err.sqlMessage?.includes(columnName) === true;
}

function isMissingLocaleColumnError(error: unknown): boolean {
	return isMissingColumnError(error, 'locale');
}

function isMissingTemperatureUnitColumnError(error: unknown): boolean {
	return isMissingColumnError(error, 'temperature_unit');
}

function normalizeTemperatureUnit(unit?: string | null): 'celsius' | 'fahrenheit' {
	return unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
}

export const userModel = {
	expireToFreeIfNeeded: async function (uid: number): Promise<string | null> {
		const result = await storage().tx(async (dbi) => {
			const rows = await dbi.query(
				sql`SELECT id, billing_plan as "billingPlan"
				FROM account
				WHERE id=${uid}
					AND billing_plan <> 'free'
					AND stripe_subscription IS NULL
					AND date_expiration IS NOT NULL
					AND date_expiration < NOW()
				LIMIT 1
				FOR UPDATE`
			);

			if (!rows[0]?.billingPlan) {
				return null;
			}

			const previousPlan = rows[0].billingPlan;

			await dbi.query(
				sql`UPDATE account
				SET billing_plan='free'
				WHERE id=${uid}`
			);

			return previousPlan;
		});

		return result;
	},
	// db: pass a transaction connection to make the update part of a larger unit of work
	extendAccountExpirationByOneMonth: async ({ email }, db = storage()) => {
		// extend subscriptions where date_expiration is in the future
		// WHY sql``: the previous raw-string queries were rejected by @databases with
		// "Invalid query", so Stripe invoice.paid never extended subscriptions
		await db.query(
			sql`UPDATE account
			SET date_expiration = date_expiration + INTERVAL '1 month'
			WHERE email=${email} AND date_expiration > NOW()`
		);

		// extend subscriptions where date_expiration is in the past
		await db.query(
			sql`UPDATE account
			SET date_expiration = NOW() + INTERVAL '1 month'
			WHERE email=${email} AND date_expiration < NOW()`
		);
	},
	updateSubscription: async ({ subscription, email }, db = storage()) => {
		await db.query(
			sql`UPDATE account SET stripe_subscription=${subscription} WHERE email=${email}`
		);
	},

	getInvoices: async function (ctx) {
		const result = await storage().query(
			sql`SELECT created as "date",
				COALESCE(data->'object'->>'invoice_pdf', '') as url,
				COALESCE(data->'object'->>'total', '0') as total,
				COALESCE(data->'object'->>'currency', '') as currency
			FROM stripe_events
			WHERE user_id=${ctx.uid} AND "type"='invoice.payment_succeeded'
			ORDER BY created DESC
			LIMIT 10`
		);

		return result;
	},

	getById: async function (id) {
		let result: any[] = [];

		if (supportsAccountLocaleColumn !== false && supportsAccountTemperatureUnitColumn !== false) {
			try {
				result = await storage().query(
					sql`SELECT id, email, first_name, last_name, date_expiration, date_added,
					stripe_subscription, lang, locale, temperature_unit as "temperatureUnit",
					billing_plan as "billingPlan",
					(date_expiration IS NOT NULL AND date_expiration < NOW()) as "isSubscriptionExpired"
					FROM account
					WHERE id=${id}
					LIMIT 1`
				);
				supportsAccountLocaleColumn = true;
				supportsAccountTemperatureUnitColumn = true;
			} catch (error) {
				if (isMissingTemperatureUnitColumnError(error)) {
					supportsAccountTemperatureUnitColumn = false;
				} else if (isMissingLocaleColumnError(error)) {
					supportsAccountLocaleColumn = false;
					supportsAccountTemperatureUnitColumn = false;
				} else {
					throw error;
				}
			}
		}

		if (result.length === 0 && supportsAccountLocaleColumn !== false) {
			try {
				result = await storage().query(
					sql`SELECT id, email, first_name, last_name, date_expiration, date_added,
					stripe_subscription, lang, locale, 'celsius' as "temperatureUnit",
					billing_plan as "billingPlan",
					(date_expiration IS NOT NULL AND date_expiration < NOW()) as "isSubscriptionExpired"
					FROM account
					WHERE id=${id}
					LIMIT 1`
				);
				supportsAccountLocaleColumn = true;
			} catch (error) {
				if (!isMissingLocaleColumnError(error)) {
					throw error;
				}
				supportsAccountLocaleColumn = false;
				supportsAccountTemperatureUnitColumn = false;
			}
		}

		if (supportsAccountLocaleColumn === false) {
			result = await storage().query(
				sql`SELECT id, email, first_name, last_name, date_expiration, date_added,
				stripe_subscription, lang, NULL as locale, 'celsius' as "temperatureUnit",
				billing_plan as "billingPlan",
				(date_expiration IS NOT NULL AND date_expiration < NOW()) as "isSubscriptionExpired"
				FROM account
				WHERE id=${id}
				LIMIT 1`
			);
		}

		return result[0];
	},

	deleteSelf: async function (uid) {
		await storage().query(
			sql`DELETE FROM account WHERE id=${uid}`
		);
	},

	update: async function (user, uid) {
		const temperatureUnit = normalizeTemperatureUnit(user.temperatureUnit);

		if (supportsAccountLocaleColumn === false) {
			await storage().query(
				sql`UPDATE account
				SET first_name=${user.first_name}, last_name=${user.last_name}, lang=${user.lang}
				WHERE id=${uid}`
			);
			return;
		}

		if (supportsAccountTemperatureUnitColumn === false) {
			await storage().query(
				sql`UPDATE account
				SET first_name=${user.first_name}, last_name=${user.last_name}, lang=${user.lang},
				locale=COALESCE(${user.locale}, locale)
				WHERE id=${uid}`
			);
			return;
		}

		try {
			await storage().query(
				sql`UPDATE account
				SET first_name=${user.first_name}, last_name=${user.last_name}, lang=${user.lang},
				locale=COALESCE(${user.locale}, locale), temperature_unit=${temperatureUnit}
				WHERE id=${uid}`
			);
			supportsAccountLocaleColumn = true;
			supportsAccountTemperatureUnitColumn = true;
		} catch (error) {
			if (isMissingTemperatureUnitColumnError(error)) {
				supportsAccountTemperatureUnitColumn = false;
				await storage().query(
					sql`UPDATE account
					SET first_name=${user.first_name}, last_name=${user.last_name}, lang=${user.lang},
					locale=COALESCE(${user.locale}, locale)
					WHERE id=${uid}`
				);
				return;
			}

			if (!isMissingLocaleColumnError(error)) {
				throw error;
			}

			supportsAccountLocaleColumn = false;
			supportsAccountTemperatureUnitColumn = false;
			await storage().query(
				sql`UPDATE account
				SET first_name=${user.first_name}, last_name=${user.last_name}, lang=${user.lang}
				WHERE id=${uid}`
			);
		}
	},
	updateLastLogin: async function (uid) {
		await storage().query(sql`UPDATE account SET date_last_login=NOW() WHERE id=${uid}`);
	},

	isFirstLogin: async function (uid) {
		const result = await storage().query(
			sql`SELECT date_last_login FROM account WHERE id=${uid}`
		);

		return !result[0] || result[0].date_last_login === null;
	},

	create: async function (first_name, last_name, email, password, lang, locale, expirationDateString, billingPlan = 'professional') {
		if (supportsAccountLocaleColumn === false) {
			return await storage().query(
				sql`INSERT INTO account (first_name, last_name, email, password, lang, date_expiration, billing_plan)
				VALUES(${first_name}, ${last_name}, ${email}, ${sha1(password)}, ${lang}, ${expirationDateString}, ${billingPlan})`
			);
		}

		try {
			const created = await storage().query(
				sql`INSERT INTO account (first_name, last_name, email, password, lang, locale, date_expiration, billing_plan)
				VALUES(${first_name}, ${last_name}, ${email}, ${sha1(password)}, ${lang}, ${locale}, ${expirationDateString}, ${billingPlan})`
			);
			supportsAccountLocaleColumn = true;
			return created;
		} catch (error) {
			if (!isMissingLocaleColumnError(error)) {
				throw error;
			}
			supportsAccountLocaleColumn = false;
			return await storage().query(
				sql`INSERT INTO account (first_name, last_name, email, password, lang, date_expiration, billing_plan)
				VALUES(${first_name}, ${last_name}, ${email}, ${sha1(password)}, ${lang}, ${expirationDateString}, ${billingPlan})`
			);
		}
	},

	findByEmailAndPass: async function (email, password) {
		const rows = await storage().query(
			sql`SELECT id FROM account WHERE email=${email} AND password=${sha1(password)}`
		);

		if (!rows[0]) {
			return null
		}

		return rows[0].id;
	},

	findByEmail: async function (email) {
		const rows = await storage().query(
			sql`SELECT id FROM account WHERE email=${email}`
		);

		if (!rows[0]) {
			return null
		}

		return rows[0].id;
	}
}
