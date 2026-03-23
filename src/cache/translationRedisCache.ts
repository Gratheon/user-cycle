import { createClient } from 'redis';
import { logger } from '../logger';

type TranslationCacheInput = {
	key: string;
	namespace?: string | null;
};

type CachedTranslationPayload = {
	id: number;
	key: string;
	namespace: string | null;
	context: string | null;
	values?: Record<string, string>;
	plurals?: Record<string, Record<string, string>>;
	isPlural: boolean;
};

const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
const redisUsername = process.env.REDIS_USERNAME;
const redisPassword = process.env.REDIS_PASSWORD;
const redisEnabled = process.env.TRANSLATION_REDIS_ENABLED !== 'false';
const redisKeyPrefix = process.env.TRANSLATION_REDIS_KEY_PREFIX || 'user-cycle:translation:v1:';
const ttlSeconds = Math.max(1, Number(process.env.TRANSLATION_REDIS_TTL_SECONDS || 3600));

let redisClient: any = null;
let redisConnectPromise: Promise<any | null> | null = null;

function serializeError(error: unknown): Record<string, unknown> {
	if (!error) {
		return { message: 'Unknown error' };
	}

	if (error instanceof Error) {
		const err = error as Error & { code?: string; cause?: unknown };
		return {
			name: err.name,
			message: err.message,
			code: err.code,
			stack: err.stack,
			cause: err.cause
		};
	}

	if (typeof error === 'object') {
		return { ...error as Record<string, unknown> };
	}

	return { message: String(error) };
}

async function resetClient(): Promise<void> {
	if (!redisClient) return;

	const client = redisClient;
	redisClient = null;
	try {
		await client.quit();
	} catch {
		// Ignore close errors; client is already being replaced.
	}
}

function encodePart(value: string): string {
	return encodeURIComponent(value);
}

function parseRedisConnection() {
	const parsed = new URL(redisUrl);
	const protocol = parsed.protocol || 'redis:';
	const host = parsed.hostname || 'redis';
	const port = parsed.port ? Number(parsed.port) : 6379;
	const dbFromPath = parsed.pathname?.replace('/', '');
	const database = dbFromPath ? Number(dbFromPath) : 0;

	const usernameFromUrl = parsed.username ? decodeURIComponent(parsed.username) : undefined;
	const passwordFromUrl = parsed.password ? decodeURIComponent(parsed.password) : undefined;

	const username = redisUsername ?? usernameFromUrl;
	const password = redisPassword ?? passwordFromUrl;

	const endpointForLogs = `${protocol}//${host}:${port}/${Number.isFinite(database) ? database : 0}`;

	return {
		host,
		port,
		database: Number.isFinite(database) ? database : 0,
		tls: protocol === 'rediss:',
		username,
		password,
		endpointForLogs,
	};
}

function buildKey(input: TranslationCacheInput): string {
	const namespace = input.namespace ?? '__NULL__';
	return `${redisKeyPrefix}${encodePart(namespace)}:${encodePart(input.key)}`;
}

function parsePayload(value: string | null): CachedTranslationPayload | null {
	if (!value) return null;

	try {
		const parsed = JSON.parse(value);
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed as CachedTranslationPayload;
	} catch (error) {
		logger.warn('[translationRedisCache] Failed to parse cached payload, ignoring cache entry', { error: serializeError(error) });
		return null;
	}
}

async function getClient(): Promise<any | null> {
	if (!redisEnabled) return null;
	if (redisClient?.isReady) return redisClient;
	if (redisConnectPromise) return redisConnectPromise;

		redisConnectPromise = (async () => {
		try {
			const connection = parseRedisConnection();
			const socketOptions: any = {
				host: connection.host,
				port: connection.port,
			};
			if (connection.tls) {
				socketOptions.tls = true;
			}

			const client = createClient({
				socket: socketOptions,
				database: connection.database,
				...(connection.username ? { username: connection.username } : {}),
				...(connection.password ? { password: connection.password } : {}),
			});
			client.on('error', (error) => {
				logger.warn('[translationRedisCache] Redis client error', { error: serializeError(error) });
			});
			await client.connect();

			// Force explicit auth/select to avoid environment-specific implicit auth mismatches.
			if (connection.password) {
				if (connection.username) {
					await client.sendCommand(['AUTH', connection.username, connection.password]);
				} else {
					await client.sendCommand(['AUTH', connection.password]);
				}
			}

			if (connection.database && connection.database > 0) {
				await client.sendCommand(['SELECT', String(connection.database)]);
			}

			await client.ping();

			redisClient = client;
			logger.info('[translationRedisCache] Redis cache connected', {
				endpoint: connection.endpointForLogs,
				authConfigured: !!connection.password
			});
			return redisClient;
		} catch (error) {
			logger.warn('[translationRedisCache] Redis unavailable, continuing without distributed cache', { error: serializeError(error), redisUrl });
			return null;
		} finally {
			redisConnectPromise = null;
		}
	})();

	return redisConnectPromise;
}

export const translationRedisCache = {
	buildCacheKey(input: TranslationCacheInput): string {
		return buildKey(input);
	},

	async getMany(inputs: TranslationCacheInput[]): Promise<Map<string, CachedTranslationPayload>> {
		if (inputs.length === 0) return new Map();
		const client = await getClient();
		if (!client) return new Map();

		const keys = inputs.map((input) => buildKey(input));

		try {
			const values = await client.mGet(keys);
			const cached = new Map<string, CachedTranslationPayload>();

			for (let index = 0; index < values.length; index++) {
				const rawValue = values[index];
				const payload = parsePayload(typeof rawValue === 'string' ? rawValue : null);
				if (!payload) continue;
				cached.set(keys[index], payload);
			}

			return cached;
		} catch (error) {
			logger.warn('[translationRedisCache] mGet failed', { error: serializeError(error), keyCount: keys.length });
			await resetClient();
			return new Map();
		}
	},

	async setMany(entries: Array<{ input: TranslationCacheInput; payload: CachedTranslationPayload }>): Promise<void> {
		if (entries.length === 0) return;
		const client = await getClient();
		if (!client) return;

		try {
			const multi = client.multi();
			for (const entry of entries) {
				multi.set(buildKey(entry.input), JSON.stringify(entry.payload), { EX: ttlSeconds });
			}
			await multi.exec();
		} catch (error) {
			logger.warn('[translationRedisCache] setMany failed', { error: serializeError(error), entryCount: entries.length });
			await resetClient();
		}
	},

	async disconnectForTests(): Promise<void> {
		if (redisClient) {
			await redisClient.quit();
			redisClient = null;
		}
	}
};

export type { CachedTranslationPayload, TranslationCacheInput };
