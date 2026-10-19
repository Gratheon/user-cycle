#!/usr/bin/env node
/*
 * One-off copy of user-cycle data from MySQL to Postgres.
 *
 * WHY: the service switched its storage from MySQL to Postgres. Data volume is small
 * (tens of thousands of rows), so a read-all / batch-insert copy is simpler and more
 * predictable than pgloader (which would create its own schema and types).
 *
 * WHAT it does:
 *   1. applies ./migrations/*.sql to Postgres and records them in _db_migrations
 *      exactly like src/storage.ts does, so the service skips them on boot
 *   2. in ONE transaction: truncates target tables, copies every row with its original id
 *      (parents before children, so foreign keys hold), resets SERIAL sequences,
 *      verifies row counts and translations.key_hash, and rolls back on any mismatch
 *
 * Data cleanup done on the way: translations rows with a NULL namespace that duplicate an
 * older row with the same key_hash are skipped. MySQL's UNIQUE (key_hash, namespace) let
 * translation-sync insert such a copy on every deploy; values and plural forms only ever
 * point at the oldest row, which the script verifies before skipping anything.
 *
 * MySQL is only read, so it stays intact as a rollback target.
 * All connection settings come from env variables; nothing environment specific lives here.
 *
 * Run (from the repo root, deps are installed into a throwaway dir):
 *   docker run --rm --network host -v "$PWD":/repo -w /repo \
 *     -e MYSQL_HOST -e MYSQL_PORT -e MYSQL_USER -e MYSQL_PASSWORD -e MYSQL_DATABASE \
 *     -e PG_HOST -e PG_PORT -e PG_USER -e PG_PASSWORD -e PG_DATABASE -e PG_SSL -e DRY_RUN -e FORCE \
 *     node:24-slim sh -c 'npm i --prefix /tmp/deps mysql2@3 pg@8 >/dev/null && NODE_PATH=/tmp/deps/node_modules node scripts/migrate-mysql-to-postgres.js'
 *
 * DRY_RUN=1 performs the full copy and verification, then rolls the data copy back.
 * FORCE=1 is required when Postgres tables already contain rows (e.g. a second rehearsal),
 * so that a re-run after cutover cannot silently wipe data written by the new service.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const { Client } = require("pg");

// Parents first: account and translations are referenced by foreign keys
const TABLES = [
  "account",
  "translations",
  "api_tokens",
  "share_tokens",
  "billing_history",
  "stripe_events",
  "password_reset_token",
  "password_reset_request_limit",
  "locales",
  "translation_values",
  "plural_forms",
  "plural_rules",
];
// Generated in Postgres, must not be inserted explicitly
const SKIP_COLUMNS = { translations: new Set(["key_hash"]) };
const JSON_COLUMNS = new Set(["scopes", "data", "plural_data", "forms"]);

// Oldest row per NULL-namespace key_hash is the one the app and translation-sync resolve to
const DUPLICATE_TRANSLATIONS_SQL = `
  SELECT t.id FROM translations t
  JOIN (SELECT key_hash, MIN(id) AS keep_id FROM translations WHERE namespace IS NULL GROUP BY key_hash) k
    ON k.key_hash = t.key_hash
  WHERE t.namespace IS NULL AND t.id <> k.keep_id`;

const BATCH_SIZE = 500;
const DRY_RUN = process.env.DRY_RUN === "1";
const FORCE = process.env.FORCE === "1";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

function convertValue(column, value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (JSON_COLUMNS.has(column)) {
    // mysql2 already parses JSON columns; stringify explicitly because node-pg would
    // turn a JS array (e.g. plural_rules.forms) into a Postgres array literal
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  // MySQL zero dates have no Postgres equivalent
  if (typeof value === "string" && value.startsWith("0000-00-00")) {
    return null;
  }
  return value;
}

async function applyMigrations(pg) {
  await pg.query(`CREATE TABLE IF NOT EXISTS _db_migrations (
    hash VARCHAR(255),
    filename VARCHAR(255),
    execution_time TIMESTAMPTZ
  );`);

  const dir = path.join(process.cwd(), "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), "utf8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const { rows } = await pg.query(
      "SELECT 1 FROM _db_migrations WHERE filename = $1 OR hash = $2 LIMIT 1",
      [file, hash]
    );
    if (rows.length > 0) {
      console.log(`migration ${file}: already applied`);
      continue;
    }
    await pg.query("BEGIN");
    try {
      await pg.query(content);
      await pg.query(
        "INSERT INTO _db_migrations (hash, filename, execution_time) VALUES ($1, $2, NOW())",
        [hash, file]
      );
      await pg.query("COMMIT");
      console.log(`migration ${file}: applied`);
    } catch (err) {
      await pg.query("ROLLBACK");
      throw err;
    }
  }
}

async function pgColumns(pg, table) {
  const { rows } = await pg.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position",
    [table]
  );
  return rows.map((r) => r.column_name);
}

async function copyTable(my, pg, table, skipIds) {
  const [allRows] = await my.query(`SELECT * FROM \`${table}\` ORDER BY 1`);
  const sourceRows = skipIds ? allRows.filter((row) => !skipIds.has(row.id)) : allRows;
  const targetColumns = await pgColumns(pg, table);
  const skip = SKIP_COLUMNS[table] || new Set();
  const sourceColumns = (allRows.length > 0 ? Object.keys(allRows[0]) : targetColumns).filter((c) => !skip.has(c));

  // Fail loudly instead of silently dropping data if schemas drifted
  const missing = sourceColumns.filter((c) => !targetColumns.includes(c));
  if (missing.length > 0) {
    throw new Error(`${table}: columns missing in Postgres: ${missing.join(", ")}`);
  }

  const columnList = sourceColumns.map((c) => `"${c}"`).join(", ");

  for (let offset = 0; offset < sourceRows.length; offset += BATCH_SIZE) {
    const batch = sourceRows.slice(offset, offset + BATCH_SIZE);
    const params = [];
    const tuples = batch.map((row) => {
      const placeholders = sourceColumns.map((column) => {
        params.push(convertValue(column, row[column]));
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await pg.query(`INSERT INTO "${table}" (${columnList}) VALUES ${tuples.join(", ")}`, params);
  }

  return { mysqlCount: allRows.length, expected: sourceRows.length };
}

async function verifyKeyHashes(my, pg, skipIds) {
  // Postgres recomputes key_hash with utf8_sha256_hex(); it must equal MySQL's SHA2(key, 256)
  const [rows] = await my.query("SELECT id, key_hash FROM translations");
  const { rows: pgRows } = await pg.query("SELECT id, key_hash FROM translations");
  const pgHashById = new Map(pgRows.map((r) => [r.id, r.key_hash]));
  const mismatched = rows.filter((r) => !skipIds.has(r.id) && pgHashById.get(r.id) !== r.key_hash);
  if (mismatched.length > 0) {
    throw new Error(`translations.key_hash differs for ${mismatched.length} rows, e.g. id=${mismatched[0].id}`);
  }
}

async function main() {
  const my = await mysql.createConnection({
    host: requireEnv("MYSQL_HOST"),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: requireEnv("MYSQL_USER"),
    password: requireEnv("MYSQL_PASSWORD"),
    database: requireEnv("MYSQL_DATABASE"),
    // Keep DATETIME/TIMESTAMP/DATE as raw strings: no JS timezone conversion on the way through
    dateStrings: true,
    timezone: "Z",
    supportBigNumbers: true,
    charset: "utf8mb4",
  });

  const pg = new Client({
    host: requireEnv("PG_HOST"),
    port: Number(process.env.PG_PORT || 5432),
    user: requireEnv("PG_USER"),
    password: requireEnv("PG_PASSWORD"),
    database: requireEnv("PG_DATABASE"),
    // Managed Postgres needs TLS; its CA is not in the default trust store
    ssl: process.env.PG_SSL === "disable" ? false : { rejectUnauthorized: false },
  });
  await pg.connect();

  try {
    // DATETIME has no zone and TIMESTAMP is returned in the session zone: reading both as UTC
    // is only correct if the MySQL zone is UTC. Abort instead of shifting data.
    const [[tz]] = await my.query("SELECT @@session.time_zone AS session_tz, @@system_time_zone AS system_tz");
    console.log(`MySQL time zone: session=${tz.session_tz} system=${tz.system_tz}`);
    const isUtc = (zone) => ["UTC", "+00:00", "Etc/UTC"].includes(zone);
    if (!(isUtc(tz.session_tz) || (tz.session_tz === "SYSTEM" && isUtc(tz.system_tz)))) {
      throw new Error("MySQL session time zone is not UTC; date values would be shifted");
    }
    await pg.query("SET TIME ZONE 'UTC'");

    await applyMigrations(pg);

    const [duplicateRows] = await my.query(DUPLICATE_TRANSLATIONS_SQL);
    const skipTranslationIds = new Set(duplicateRows.map((r) => r.id));
    const [[orphans]] = await my.query(
      `SELECT
        (SELECT COUNT(*) FROM translation_values WHERE translation_id IN (SELECT id FROM (${DUPLICATE_TRANSLATIONS_SQL}) d)) AS vals,
        (SELECT COUNT(*) FROM plural_forms WHERE translation_id IN (SELECT id FROM (${DUPLICATE_TRANSLATIONS_SQL}) d)) AS plurals`
    );
    if (Number(orphans.vals) > 0 || Number(orphans.plurals) > 0) {
      throw new Error(`Duplicate translations have dependent rows (values=${orphans.vals}, plurals=${orphans.plurals}); refusing to drop them`);
    }
    console.log(`Skipping ${skipTranslationIds.size} duplicate NULL-namespace translations rows`);

    const existing = [];
    // plural_rules is filled by the 002 seed migration and never written by the service
    for (const table of TABLES.filter((t) => t !== "plural_rules")) {
      const { rows } = await pg.query(`SELECT COUNT(*)::int AS cnt FROM "${table}"`);
      if (rows[0].cnt > 0) {
        existing.push(`${table}=${rows[0].cnt}`);
      }
    }
    if (existing.length > 0) {
      console.log(`Postgres already has rows: ${existing.join(", ")}`);
      if (!FORCE) {
        throw new Error("Refusing to truncate non-empty Postgres tables without FORCE=1");
      }
    }

    await pg.query("BEGIN");
    // Seed migrations (plural_rules) put rows in; they are replaced by the production copy
    await pg.query(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY`);

    const summary = [];
    for (const table of TABLES) {
      const { mysqlCount, expected } = await copyTable(my, pg, table, table === "translations" ? skipTranslationIds : null);
      const { rows } = await pg.query(`SELECT COUNT(*)::int AS cnt FROM "${table}"`);
      summary.push({ table, mysqlCount, expected, pgCount: rows[0].cnt });

      // setval is not transactional, so a dry run must not touch sequences
      const { rows: seqRows } = await pg.query("SELECT pg_get_serial_sequence($1, 'id') AS seq", [table]);
      if (seqRows[0].seq && !DRY_RUN) {
        await pg.query(
          `SELECT setval($1, COALESCE((SELECT MAX(id) FROM "${table}"), 1), (SELECT MAX(id) IS NOT NULL FROM "${table}"))`,
          [seqRows[0].seq]
        );
      }
    }

    console.table(summary);
    const mismatches = summary.filter((s) => s.expected !== s.pgCount);
    if (mismatches.length > 0) {
      throw new Error(`Row count mismatch: ${mismatches.map((m) => m.table).join(", ")}`);
    }
    await verifyKeyHashes(my, pg, skipTranslationIds);
    console.log("translations.key_hash matches MySQL for all copied rows");

    if (DRY_RUN) {
      await pg.query("ROLLBACK");
      console.log("DRY_RUN=1: copy verified and rolled back (schema migrations stay applied)");
    } else {
      await pg.query("COMMIT");
      console.log("Data copy committed");
    }
  } catch (err) {
    await pg.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await my.end();
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
