import crypto from 'crypto';
import sha1 from 'sha1';

import { sql } from '@databases/mysql';
import { storage } from '../storage';

export const PASSWORD_RESET_TOKEN_BYTES = 32;
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const PASSWORD_RESET_RATE_LIMIT_PER_DAY = 3;

function normalizeEmail(email?: string | null): string {
	return String(email || '').trim().toLowerCase();
}

function sha256(value: string): string {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function createIdentityHash(identity: string): string {
	return sha256(identity.trim().toLowerCase());
}

function createTokenHash(token: string): string {
	return sha256(token);
}

function createToken(): string {
	return crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
}

export type PasswordResetAccount = {
	id: number;
	email: string;
	lang?: string | null;
};

export const passwordResetModel = {
	normalizeEmail,
	createTokenHash,
	createIdentityHash,

	findAccountByEmail: async function (email: string): Promise<PasswordResetAccount | null> {
		const rows = await storage().query(
			sql`SELECT id, email, lang
			FROM account
			WHERE email=${normalizeEmail(email)}
			LIMIT 1`
		);

		return rows[0] || null;
	},

	isRateLimited: async function (identities: string[]): Promise<boolean> {
		const uniqueIdentityHashes = Array.from(new Set(
			identities
				.map((identity) => String(identity || '').trim().toLowerCase())
				.filter(Boolean)
				.map(createIdentityHash)
		));

		if (uniqueIdentityHashes.length === 0) {
			return true;
		}

		return await storage().tx(async (dbi) => {
			for (const identityHash of uniqueIdentityHashes) {
				const rows = await dbi.query(
					sql`SELECT request_count as requestCount
					FROM password_reset_request_limit
					WHERE identity_hash=${identityHash} AND request_date=UTC_DATE()
					LIMIT 1
					FOR UPDATE`
				);

				if ((rows[0]?.requestCount || 0) >= PASSWORD_RESET_RATE_LIMIT_PER_DAY) {
					return true;
				}
			}

			for (const identityHash of uniqueIdentityHashes) {
				await dbi.query(
					sql`INSERT INTO password_reset_request_limit (identity_hash, request_date, request_count)
					VALUES (${identityHash}, UTC_DATE(), 1)
					ON DUPLICATE KEY UPDATE request_count=request_count + 1`
				);
			}

			return false;
		});
	},

	createResetToken: async function (userId: number): Promise<{ token: string; expiresAt: Date }> {
		const token = createToken();
		const tokenHash = createTokenHash(token);
		const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
		const expiresAtSql = expiresAt.toISOString().substring(0, 19).replace('T', ' ');

		await storage().query(
			sql`INSERT INTO password_reset_token (user_id, token_hash, expires_at)
			VALUES (${userId}, ${tokenHash}, ${expiresAtSql})`
		);

		return { token, expiresAt };
	},

	resetPassword: async function (token: string, newPassword: string): Promise<'OK' | 'INVALID_TOKEN' | 'SIMPLE_PASSWORD'> {
		if (!token || typeof token !== 'string') {
			return 'INVALID_TOKEN';
		}

		if (!newPassword || newPassword.length < 6) {
			return 'SIMPLE_PASSWORD';
		}

		const tokenHash = createTokenHash(token);

		return await storage().tx(async (dbi) => {
			const rows = await dbi.query(
				sql`SELECT id, user_id as userId
				FROM password_reset_token
				WHERE token_hash=${tokenHash}
					AND used_at IS NULL
					AND expires_at > UTC_TIMESTAMP()
				LIMIT 1
				FOR UPDATE`
			);

			const resetToken = rows[0];
			if (!resetToken) {
				return 'INVALID_TOKEN';
			}

			await dbi.query(
				sql`UPDATE account
				SET password=${sha1(newPassword)}
				WHERE id=${resetToken.userId}`
			);

			await dbi.query(
				sql`UPDATE password_reset_token
				SET used_at=UTC_TIMESTAMP()
				WHERE id=${resetToken.id}`
			);

			return 'OK';
		});
	},
};
