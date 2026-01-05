import { sql } from "@databases/mysql";
import { storage } from "../storage";

export const billingHistoryModel = {
	getByUserId: async function (userId: number) {
		const result = await storage().query(
			sql`SELECT 
				id,
				event_type as eventType,
				billing_plan as billingPlan,
				details,
				created_at as createdAt
			FROM billing_history
			WHERE user_id=${userId}
			ORDER BY created_at DESC
			LIMIT 50`
		);

		return result;
	},

	addEvent: async function (userId: number, eventType: string, billingPlan: string | null, details: string | null) {
		await storage().query(
			sql`INSERT INTO billing_history (user_id, event_type, billing_plan, details)
			VALUES(${userId}, ${eventType}, ${billingPlan}, ${details})`
		);
	},

	addRegistration: async function (userId: number, billingPlan: string = 'free') {
		await this.addEvent(userId, 'registration', billingPlan, 'Account created');
	},

	addSubscriptionCreated: async function (userId: number, billingPlan: string, cycle: string) {
		const details = `Subscribed to ${billingPlan} (${cycle})`;
		await this.addEvent(userId, 'subscription_created', billingPlan, details);
	},

	addSubscriptionCancelled: async function (userId: number, billingPlan: string) {
		const details = `Cancelled ${billingPlan} subscription`;
		await this.addEvent(userId, 'subscription_cancelled', billingPlan, details);
	},

	addSubscriptionExpired: async function (userId: number, previousPlan: string) {
		const details = `Subscription expired, moved to free tier`;
		await this.addEvent(userId, 'subscription_expired', 'free', details);
	},

	addTierChanged: async function (userId: number, newPlan: string, reason: string = 'Manual change') {
		await this.addEvent(userId, 'tier_changed', newPlan, reason);
	},

	addPaymentSucceeded: async function (userId: number, billingPlan: string, amount: number, currency: string) {
		const details = `Payment succeeded: ${amount} ${currency}`;
		await this.addEvent(userId, 'payment_succeeded', billingPlan, details);
	},

	addPaymentFailed: async function (userId: number, billingPlan: string, reason: string = 'Payment failed') {
		await this.addEvent(userId, 'payment_failed', billingPlan, reason);
	}
};

