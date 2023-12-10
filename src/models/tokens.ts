import { sql } from "@databases/mysql";
import { v4 as uuidv4 } from 'uuid';

import { storage } from "../storage";

export const tokenModel = {
	getTokens: async function (ctx) {
		const result = await storage().query(
			sql`SELECT *
			FROM api_tokens
			WHERE user_id=${ctx.uid} AND \`deleted\` IS NULL
			ORDER BY date_added DESC
			LIMIT 10`
		);

		return result;
	},
	getUserIDByToken: async function (token) : Promise<number|boolean> {
		const result = await storage().query(
			sql`SELECT user_id
			FROM api_tokens
			WHERE token=${token} AND \`deleted\` IS NULL
			LIMIT 1`
		);

		if (!result[0]) {
			return false
		}

		return result[0]['user_id'];
	},

	deleteByUID: async function(uid){
		await storage().query(
			sql`DELETE FROM \`api_tokens\` WHERE user_id=${uid}`
		);
	},
	
	create: async function(user_id){
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
