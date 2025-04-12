import { sql } from "@databases/mysql";
import { v4 as uuidv4 } from 'uuid';

import { storage } from "../storage";
import config from '../config/index'; // Import config

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

	// Updated to accept scopeParams and construct correct URL
	create: async function (user_id, name, sourceUrl, scopes, scopeParams) {
		const token: string = uuidv4();

		// Extract IDs from scopeParams (add validation if needed)
		const apiaryId = scopeParams?.apiaryId;
		const hiveId = scopeParams?.hiveId;
		const inspectionId = scopeParams?.inspectionId;

		// Handle cases where IDs might be missing in scopeParams
		if (!apiaryId || !hiveId || !inspectionId) {
			console.error("Missing required IDs in scopeParams for share token creation:", scopeParams);
			// Consider throwing an error or returning a specific error object
			throw new Error("Missing required IDs in scopeParams");
		}

		// Construct the correct relative path using the extracted IDs
		const relativePath = `/apiaries/${apiaryId}/hives/${hiveId}/inspections/${inspectionId}/share/${token}`;
		// Prepend the web-app base URL (assuming config.stripe.selfUrl is correct, adjust if needed)
		// Ensure no double slashes if selfUrl already has a trailing slash
		const webAppBaseUrl = config.stripe.selfUrl.replace(/\/$/, '');
		const targetUrl = webAppBaseUrl + relativePath;
		console.log("Constructed share targetUrl:", targetUrl); // Add log

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

	// Correctly placed function - Updated to return userId
	getTokenDetailsByToken: async function (token: string): Promise<{ id: number; name: string; scopes: any; userId: number } | null> { // Added userId to return type
		console.log(`shareTokenModel.getTokenDetailsByToken: Validating token: ${token}`); // Log received token
		const result = await storage().query(
			sql`SELECT id, name, scopes, user_id as userId
			FROM share_tokens
			WHERE token=${token} AND \`date_deleted\` IS NULL
			LIMIT 1`
		);
		console.log(`shareTokenModel.getTokenDetailsByToken: DB query result for token ${token}:`, result); // Log DB result

		if (!result[0]) {
			console.warn(`shareTokenModel.getTokenDetailsByToken: Token not found in DB: ${token}`);
			return null;
		}

		try {
			// The database driver likely already parsed the JSON string.
			// Remove the redundant JSON.parse() call.
			const scopes = result[0]['scopes'];
			// Add a check to ensure scopes is actually an object after retrieval
			if (typeof scopes !== 'object' || scopes === null) {
				console.error("Scopes retrieved from DB is not an object:", scopes);
				return null; // Treat invalid scopes structure as an invalid token
			}
			const retrievedUserId = result[0]['userId']; // Explicitly get userId
			console.log(`shareTokenModel.getTokenDetailsByToken: Successfully retrieved details for token ${token}:`, {id: result[0]['id'], name: result[0]['name'], userId: retrievedUserId, scopes: scopes}); // Log the retrieved value
			return {
				id: result[0]['id'],
				name: result[0]['name'],
				scopes: scopes,
				userId: retrievedUserId, // Return the retrieved value
			};
		} catch (e) {
			console.error("Failed to parse scopes JSON for share token:", token, e);
			// Treat invalid scopes as an invalid token
			return null;
		}
	},
}
