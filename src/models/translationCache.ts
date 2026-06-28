type CacheEntry<T> = {
	value: T;
	expiresAt: number;
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.floor(parsed);
}

const translationCacheTtlMs = parsePositiveInteger(process.env.TRANSLATION_CACHE_TTL_MS, 5 * 60 * 1000);
const translationCacheMaxEntries = parsePositiveInteger(process.env.TRANSLATION_CACHE_MAX_ENTRIES, 10_000);

class BoundedTtlCache<T> {
	private store = new Map<string, CacheEntry<T>>();

	get(key: string): T | undefined {
		const entry = this.store.get(key);
		if (!entry) {
			return undefined;
		}

		if (entry.expiresAt <= Date.now()) {
			this.store.delete(key);
			return undefined;
		}

		// Keep hottest keys in the end of insertion order for simple LRU-style eviction.
		this.store.delete(key);
		this.store.set(key, entry);

		return entry.value;
	}

	set(key: string, value: T): void {
		const expiresAt = Date.now() + translationCacheTtlMs;
		this.store.set(key, { value, expiresAt });

		while (this.store.size > translationCacheMaxEntries) {
			const oldestKey = this.store.keys().next().value;
			if (!oldestKey) break;
			this.store.delete(oldestKey);
		}
	}

	delete(key: string): void {
		this.store.delete(key);
	}

	clear(): void {
		this.store.clear();
	}
}

export const translationIdByKeyCache = new BoundedTtlCache<number | null>();
export const hasPluralFormsCache = new BoundedTtlCache<boolean>();
export const translationValueCache = new BoundedTtlCache<string | null>();
export const pluralFormsCache = new BoundedTtlCache<any | null>();

export function clearTranslationCaches(): void {
	translationIdByKeyCache.clear();
	hasPluralFormsCache.clear();
	translationValueCache.clear();
	pluralFormsCache.clear();
}
