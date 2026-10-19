#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const createConnectionPool = require("@databases/pg").default;
const { sql } = require("@databases/pg");

const DEFAULT_FILE = "translations/user-cycle-translations.json";

function loadAppConfigIfAvailable() {
  try {
    const appConfig = require("../app/config/index.js");
    if (appConfig && typeof appConfig === "object" && appConfig.default) {
      return appConfig.default;
    }
    return appConfig;
  } catch {
    return null;
  }
}

function resolveDbConfig() {
  const appConfig = loadAppConfigIfAvailable();
  const appDb = appConfig && appConfig.postgres ? appConfig.postgres : {};

  const host = process.env.DB_HOST || appDb.host || "127.0.0.1";
  const port = process.env.DB_PORT || appDb.port || "5432";
  const user = process.env.DB_USER || appDb.user || "test";
  const password = process.env.DB_PASSWORD || appDb.password || "test";
  const database = process.env.DB_NAME || appDb.database || "user_cycle";
  const ssl = process.env.DB_SSL || appDb.ssl || "prefer";

  return { host, port, user, password, database, ssl };
}

function resolveFilePath(inputPath) {
  const candidate = inputPath || DEFAULT_FILE;
  return path.isAbsolute(candidate)
    ? candidate
    : path.resolve(process.cwd(), candidate);
}

function buildDsn(cfg) {
  return `postgresql://${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}@${cfg.host}:${cfg.port}/${cfg.database}`;
}

function parseArgs() {
  const [, , command, fileArg] = process.argv;
  if (!command || (command !== "export" && command !== "import")) {
    console.error("Usage: node scripts/translation-sync.js <export|import> [file]");
    process.exit(1);
  }
  return { command, filePath: resolveFilePath(fileArg) };
}

function stringifyStable(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

async function exportSnapshot(db, filePath) {
  const translations = await db.query(
    sql`SELECT id, key, namespace, context
        FROM translations
        -- COLLATE "C": stable snapshot order regardless of the server collation
        ORDER BY namespace IS NULL DESC, namespace COLLATE "C", LOWER(key) COLLATE "C", key COLLATE "C"`
  );

  const values = await db.query(
    sql`SELECT translation_id, lang, value
        FROM translation_values
        ORDER BY translation_id, lang`
  );

  const pluralForms = await db.query(
    sql`SELECT translation_id, lang, plural_data
        FROM plural_forms
        ORDER BY translation_id, lang`
  );

  const translationById = new Map();
  for (const row of translations) {
    translationById.set(row.id, {
      key: row.key,
      namespace: row.namespace,
      context: row.context,
      values: {},
      plurals: {},
    });
  }

  for (const row of values) {
    const entry = translationById.get(row.translation_id);
    if (!entry) continue;
    entry.values[row.lang] = row.value;
  }

  for (const row of pluralForms) {
    const entry = translationById.get(row.translation_id);
    if (!entry) continue;
    entry.plurals[row.lang] = row.plural_data;
  }

  const snapshot = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    translations: Array.from(translationById.values()),
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stringifyStable(snapshot), "utf8");
  console.log(`Exported ${snapshot.translations.length} translations to ${filePath}`);
}

async function getTranslationId(db, key, namespace) {
  const rows = await db.query(
    sql`SELECT id FROM translations
        WHERE key_hash = utf8_sha256_hex(${key}) AND namespace IS NOT DISTINCT FROM ${namespace}
        LIMIT 1`
  );
  if (!rows.length) {
    throw new Error(`Translation not found after upsert (key="${key}", namespace="${namespace}")`);
  }
  return rows[0].id;
}

async function importSnapshot(db, filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`Snapshot file not found, skipping import: ${filePath}`);
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const snapshot = JSON.parse(raw);
  const items = Array.isArray(snapshot.translations) ? snapshot.translations : [];

  for (const item of items) {
    await db.query(
      // unique_key_namespace_hash is NULLS NOT DISTINCT, so NULL-namespace keys upsert too
      sql`INSERT INTO translations (key, namespace, context)
          VALUES (${item.key}, ${item.namespace ?? null}, ${item.context ?? null})
          ON CONFLICT (key_hash, namespace) DO UPDATE SET context = EXCLUDED.context`
    );

    const translationId = await getTranslationId(db, item.key, item.namespace ?? null);

    const values = item.values && typeof item.values === "object" ? item.values : {};
    for (const [lang, value] of Object.entries(values)) {
      await db.query(
        sql`INSERT INTO translation_values (translation_id, lang, value)
            VALUES (${translationId}, ${lang}, ${String(value)})
            ON CONFLICT (translation_id, lang) DO UPDATE
            SET value = EXCLUDED.value, date_updated = NOW()`
      );
    }

    const plurals = item.plurals && typeof item.plurals === "object" ? item.plurals : {};
    for (const [lang, pluralData] of Object.entries(plurals)) {
      await db.query(
        sql`INSERT INTO plural_forms (translation_id, lang, plural_data)
            VALUES (${translationId}, ${lang}, ${JSON.stringify(pluralData)})
            ON CONFLICT (translation_id, lang) DO UPDATE
            SET plural_data = EXCLUDED.plural_data, date_updated = NOW()`
      );
    }
  }

  console.log(`Imported ${items.length} translations from ${filePath}`);
}

async function main() {
  const { command, filePath } = parseArgs();
  const dbCfg = resolveDbConfig();
  const dsn = buildDsn(dbCfg);
  const db = createConnectionPool({ connectionString: dsn, ssl: dbCfg.ssl, bigIntMode: "number" });

  try {
    if (command === "export") {
      await exportSnapshot(db, filePath);
      return;
    }
    await importSnapshot(db, filePath);
  } finally {
    await db.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
