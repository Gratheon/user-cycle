import { sql } from "@databases/mysql";
import { v4 as uuidv4 } from 'uuid';

import { storage } from "../storage";

export const tokenModel = {
	getTokens: async function (ctx) {
		const result = await storage().query(
			sql`SELECT *
			FROM api_tokens
			WHERE user_id=${ctx.uid} AND \`date_deleted\` IS NULL
			ORDER BY date_added DESC
			LIMIT 10`
		);

		return result;
	},
	getUserIDByToken: async function (token): Promise<number | boolean> {
		const result = await storage().query(
			sql`SELECT user_id
			FROM api_tokens
			WHERE token=${token} AND \`date_deleted\` IS NULL
			LIMIT 1`
		);

		if (!result[0]) {
			return false
		}

		return result[0]['user_id'];
	},

	softDelete: async function (ctx, token) {
		await storage().query(
			sql`UPDATE api_tokens
			SET date_deleted=NOW()
			WHERE token=${token} AND user_id=${ctx.uid}`
		);
	},

	create: async function (user_id) {
		const token: string = uuidv4();

		const result = await storage().query(
			sql`INSERT INTO api_tokens (token, user_id)
			VALUES(${token}, ${user_id})`
		);

		return {
			id: result.insertId,
			user_id,
			token
		}
	},
}

export const shareTokenModel = {
	getTokens: async function (ctx) {
		const result = await storage().query(
			sql`SELECT *, target_url as targetUrl
			FROM share_tokens
			WHERE user_id=${ctx.uid} AND \`date_deleted\` IS NULL
			ORDER BY date_added DESC
			LIMIT 10`
		);

		return result;
	},

	getUserIDByToken: async function (token): Promise<number | boolean> {
		const result = await storage().query(
			sql`SELECT user_id
			FROM share_tokens
			WHERE token=${token} AND \`date_deleted\` IS NULL
			LIMIT 1`
		);

		if (!result[0]) {
			return false
		}

		return result[0]['user_id'];
	},

	softDelete: async function (ctx, token) {
		await storage().query(
			sql`UPDATE share_tokens
			SET date_deleted=NOW()
			WHERE token=${token} AND user_id=${ctx.uid}`
		);
	},

	create: async function (user_id, name, sourceUrl, scopes) {
		const token: string = uuidv4();
		const targetUrl = sourceUrl + `/share/` + token;

		const result = await storage().query(
			sql`INSERT INTO share_tokens (token, user_id, name, target_url, scopes)
			VALUES(${token}, ${user_id}, ${name}, ${targetUrl}, ${JSON.stringify(scopes)})`
		);

		return {
			id: result.insertId,
			user_id,
			token,
			targetUrl
		}
	},
}
