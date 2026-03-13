#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const createConnectionPool = require("@databases/mysql").default;
const { sql } = require("@databases/mysql");

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
  const appMysql = appConfig && appConfig.mysql ? appConfig.mysql : {};

  const host = process.env.MYSQL_HOST || appMysql.host || "127.0.0.1";
  const port = process.env.MYSQL_PORT || appMysql.port || "5100";
  const user = process.env.MYSQL_USER || appMysql.user || "test";
  const password = process.env.MYSQL_PASSWORD || appMysql.password || "test";
  const database = process.env.MYSQL_DATABASE || appMysql.database || "user-cycle";

  return { host, port, user, password, database };
}

function resolveFilePath(inputPath) {
  const candidate = inputPath || DEFAULT_FILE;
  return path.isAbsolute(candidate)
    ? candidate
    : path.resolve(process.cwd(), candidate);
}

function buildDsn(cfg) {
  return `mysql://${cfg.user}:${cfg.password}@${cfg.host}:${cfg.port}/${cfg.database}?connectionLimit=3&waitForConnections=true`;
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
    sql`SELECT id, \`key\`, namespace, context
        FROM translations
        ORDER BY namespace IS NULL DESC, namespace, \`key\``
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
    sql`SELECT id FROM translations WHERE \`key\` = ${key} AND namespace <=> ${namespace} LIMIT 1`
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
      sql`INSERT INTO translations (\`key\`, namespace, context)
          VALUES (${item.key}, ${item.namespace ?? null}, ${item.context ?? null})
          ON DUPLICATE KEY UPDATE context = VALUES(context)`
    );

    const translationId = await getTranslationId(db, item.key, item.namespace ?? null);

    const values = item.values && typeof item.values === "object" ? item.values : {};
    for (const [lang, value] of Object.entries(values)) {
      await db.query(
        sql`INSERT INTO translation_values (translation_id, lang, value)
            VALUES (${translationId}, ${lang}, ${String(value)})
            ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW()`
      );
    }

    const plurals = item.plurals && typeof item.plurals === "object" ? item.plurals : {};
    for (const [lang, pluralData] of Object.entries(plurals)) {
      await db.query(
        sql`INSERT INTO plural_forms (translation_id, lang, plural_data)
            VALUES (${translationId}, ${lang}, ${JSON.stringify(pluralData)})
            ON DUPLICATE KEY UPDATE plural_data = VALUES(plural_data), date_updated = NOW()`
      );
    }
  }

  console.log(`Imported ${items.length} translations from ${filePath}`);
}

async function main() {
  const { command, filePath } = parseArgs();
  const dbCfg = resolveDbConfig();
  const dsn = buildDsn(dbCfg);
  const db = createConnectionPool({ connectionString: dsn, bigIntMode: "number" });

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
