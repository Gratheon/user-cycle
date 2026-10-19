-- Postgres baseline for user-cycle.
-- WHY: the service moved from MySQL to Postgres. The previous 30 MySQL migrations relied on
-- MySQL-only features (PREPARE/SET @var, ON UPDATE CURRENT_TIMESTAMP, JSON_* data rewrites), so
-- they were replaced by this single schema that mirrors the final MySQL production schema.
-- Production data was copied by scripts/migrate-mysql-to-postgres.js.
-- Never edit this file after it is applied: add a new numbered migration instead.

-- Case-insensitive text keeps MySQL's *_ci collation behaviour for email logins and locale lookups
CREATE EXTENSION IF NOT EXISTS citext;

-- WHY a wrapper: generated columns need IMMUTABLE functions and convert_to() is only STABLE.
-- The database encoding is UTF8 and never changes, so the result is effectively immutable.
-- Returns the same lowercase hex as MySQL SHA2(text, 256) did for translations.key_hash.
CREATE OR REPLACE FUNCTION utf8_sha256_hex(input TEXT) RETURNS VARCHAR(64)
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$ SELECT encode(sha256(convert_to(input, 'UTF8')), 'hex') $$;

CREATE TABLE IF NOT EXISTS account (
  id SERIAL PRIMARY KEY,
  email CITEXT NOT NULL DEFAULT '',
  password VARCHAR(40) NOT NULL DEFAULT '',
  first_name VARCHAR(200) DEFAULT NULL,
  last_name VARCHAR(200) DEFAULT NULL,
  stripe_subscription VARCHAR(40) DEFAULT NULL,
  -- MySQL had ON UPDATE CURRENT_TIMESTAMP here by mistake; registration date must not change
  date_added TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_expiration TIMESTAMPTZ DEFAULT NULL,
  date_last_login TIMESTAMPTZ DEFAULT NULL,
  lang VARCHAR(2) NOT NULL DEFAULT 'en',
  locale VARCHAR(35) DEFAULT NULL,
  temperature_unit VARCHAR(16) NOT NULL DEFAULT 'celsius'
    CONSTRAINT account_temperature_unit_check CHECK (temperature_unit IN ('celsius', 'fahrenheit')),
  billing_plan VARCHAR(16) NOT NULL DEFAULT 'free'
    CONSTRAINT account_billing_plan_check CHECK (billing_plan IN ('free', 'hobbyist', 'starter', 'professional', 'addon', 'enterprise'))
);

-- login, password reset and Stripe webhooks all look accounts up by email
CREATE INDEX IF NOT EXISTS idx_account_email ON account (email);

-- VARCHAR instead of MySQL CHAR(n): Postgres CHAR pads values with spaces when reading them back
CREATE TABLE IF NOT EXISTS api_tokens (
  id SERIAL PRIMARY KEY,
  token VARCHAR(40) NOT NULL DEFAULT '' CONSTRAINT api_tokens_token_unique UNIQUE,
  user_id INTEGER DEFAULT NULL REFERENCES account (id) ON DELETE CASCADE,
  deleted INTEGER DEFAULT NULL,
  date_added TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_deleted TIMESTAMPTZ DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens (user_id);

CREATE TABLE IF NOT EXISTS share_tokens (
  id SERIAL PRIMARY KEY,
  name VARCHAR(60) DEFAULT NULL,
  target_url VARCHAR(255) DEFAULT NULL,
  token VARCHAR(40) NOT NULL DEFAULT '' CONSTRAINT share_tokens_token_unique UNIQUE,
  user_id INTEGER DEFAULT NULL REFERENCES account (id) ON DELETE CASCADE,
  scopes JSONB DEFAULT NULL,
  date_deleted TIMESTAMPTZ DEFAULT NULL,
  date_added TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_share_tokens_user_id ON share_tokens (user_id);

CREATE TABLE IF NOT EXISTS billing_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  event_type VARCHAR(32) NOT NULL
    CONSTRAINT billing_history_event_type_check CHECK (event_type IN ('registration', 'subscription_created', 'subscription_cancelled', 'subscription_expired', 'tier_changed', 'payment_succeeded', 'payment_failed')),
  billing_plan VARCHAR(16) DEFAULT NULL
    CONSTRAINT billing_history_billing_plan_check CHECK (billing_plan IN ('free', 'hobbyist', 'starter', 'professional', 'addon', 'enterprise')),
  details VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_history_user_id ON billing_history (user_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_created_at ON billing_history (created_at);

CREATE TABLE IF NOT EXISTS stripe_events (
  id VARCHAR(50) PRIMARY KEY DEFAULT '',
  user_id INTEGER DEFAULT NULL,
  type VARCHAR(60) DEFAULT NULL,
  created TIMESTAMPTZ DEFAULT NULL,
  data JSONB DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_token (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL CONSTRAINT password_reset_token_hash_unique UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_reset_token_user_id_idx ON password_reset_token (user_id);
CREATE INDEX IF NOT EXISTS password_reset_token_expires_at_idx ON password_reset_token (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_request_limit (
  id SERIAL PRIMARY KEY,
  identity_hash VARCHAR(64) NOT NULL,
  request_date DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT password_reset_request_limit_identity_date_unique UNIQUE (identity_hash, request_date)
);

-- Legacy single-table translations, still used by the locales resolvers
CREATE TABLE IF NOT EXISTS locales (
  id SERIAL PRIMARY KEY,
  key CITEXT DEFAULT NULL,
  en CITEXT DEFAULT NULL,
  ru VARCHAR(250) DEFAULT NULL,
  et VARCHAR(250) DEFAULT NULL,
  tr VARCHAR(250) DEFAULT NULL,
  pl VARCHAR(250) DEFAULT NULL,
  fr VARCHAR(250) DEFAULT NULL,
  lv VARCHAR(250) DEFAULT NULL,
  lt VARCHAR(250) DEFAULT NULL,
  hu VARCHAR(250) DEFAULT NULL,
  uk VARCHAR(250) DEFAULT NULL,
  it VARCHAR(250) DEFAULT NULL,
  ro VARCHAR(250) DEFAULT NULL,
  he VARCHAR(250) DEFAULT NULL,
  ko VARCHAR(250) DEFAULT NULL,
  nl VARCHAR(250) DEFAULT NULL,
  de VARCHAR(250) DEFAULT NULL,
  translation_context TEXT,
  date_added TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT locales_key_unique UNIQUE (key),
  CONSTRAINT locales_key_en_unique UNIQUE (key, en)
);
CREATE INDEX IF NOT EXISTS idx_locales_en ON locales (en);

CREATE TABLE IF NOT EXISTS translations (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  key_hash VARCHAR(64) GENERATED ALWAYS AS (utf8_sha256_hex(key)) STORED,
  namespace VARCHAR(50) DEFAULT NULL,
  context VARCHAR(500) DEFAULT NULL,
  date_added TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULLS NOT DISTINCT: in MySQL a NULL namespace never conflicted, so translation-sync
  -- inserted a duplicate row for every NULL-namespace key on each deploy
  CONSTRAINT unique_key_namespace_hash UNIQUE NULLS NOT DISTINCT (key_hash, namespace)
);
CREATE INDEX IF NOT EXISTS idx_translations_namespace ON translations (namespace);
-- case-insensitive fallback lookup in translationModel.getByKey(s)
CREATE INDEX IF NOT EXISTS idx_translations_lower_key_namespace ON translations (LOWER(key), namespace);

CREATE TABLE IF NOT EXISTS translation_values (
  id SERIAL PRIMARY KEY,
  translation_id INTEGER NOT NULL REFERENCES translations (id) ON DELETE CASCADE,
  lang VARCHAR(2) NOT NULL,
  value VARCHAR(500) NOT NULL,
  date_added TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_updated TIMESTAMPTZ DEFAULT NULL,
  CONSTRAINT unique_translation_lang UNIQUE (translation_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_translation_values_lang ON translation_values (lang);

CREATE TABLE IF NOT EXISTS plural_forms (
  id SERIAL PRIMARY KEY,
  translation_id INTEGER NOT NULL REFERENCES translations (id) ON DELETE CASCADE,
  lang VARCHAR(2) NOT NULL,
  plural_data JSONB NOT NULL,
  date_added TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_updated TIMESTAMPTZ DEFAULT NULL,
  CONSTRAINT unique_translation_plural_lang UNIQUE (translation_id, lang)
);

CREATE TABLE IF NOT EXISTS plural_rules (
  id SERIAL PRIMARY KEY,
  lang VARCHAR(2) NOT NULL CONSTRAINT unique_lang UNIQUE,
  forms JSONB NOT NULL,
  date_added TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
