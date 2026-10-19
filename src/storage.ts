import createConnectionPool, {sql, SQLQuery} from "@databases/pg";
import * as fs from "fs";
import * as crypto from "crypto";
import config from "./config";

export { sql };

let db;
let isConnected = false;
let reconnectInterval: NodeJS.Timeout | null = null;

export function storage() {
  return db;
}

export function isStorageConnected(): boolean {
  return isConnected;
}

async function tryConnect(logger): Promise<boolean> {
  try {
    const { user, password, host, port, database, ssl } = config.postgres;

    // WHY: unlike MySQL, Postgres has no CREATE DATABASE IF NOT EXISTS, and the prod
    // database lives on a managed cluster where it is provisioned manually.
    const startTimes = new Map<SQLQuery, number>();
    let connectionsCount = 0;

    db = createConnectionPool({
      connectionString: `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`,
      // DigitalOcean managed Postgres requires TLS; "prefer" also works with a local container without TLS
      ssl: ssl as any,
      bigIntMode: 'number',
      poolSize: 5,
      maxUses: 7500,
      idleTimeoutMilliseconds: 30_000,
      queueTimeoutMilliseconds: 60_000,
      onError: (err) => {
        logger.error(`Postgres connection pool error: ${err.message}`);
      },
      onQueryError: (query, { text }, err) => {
        startTimes.delete(query);
        logger.error(
          `DB error ${text} - ${err.message}`
        );
      },

      onQueryStart: (query) => {
        startTimes.set(query, Date.now());
      },
      onQueryResults: (query, {text}, results) => {
        const start = startTimes.get(query);
        startTimes.delete(query);

        if (start) {
          logger.debug(`${text.replace(/\n/g," ").replace(/\s+/g, ' ')} - ${Date.now() - start}ms`);
        } else {
          logger.debug(`${text.replace(/\n/g," ").replace(/\s+/g, ' ')}`);
        }
      },
      onConnectionOpened: () => {
        logger.debug(
            `Opened connection. Active connections = ${++connectionsCount}`,
        );
      },
      onConnectionClosed: () => {
        logger.debug(
            `Closed connection. Active connections = ${--connectionsCount}`,
        );
      },
    });

    process.once('SIGTERM', () => {
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
      }
      db.dispose().catch((ex) => {
        console.error(ex);
      });
    });

    await migrate(logger);

    isConnected = true;
    logger.info('Postgres connection established successfully');

    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to connect to Postgres: ${errorMessage}`);
    isConnected = false;
    // Drop the half-initialised pool so periodic retries do not leak connections
    await db?.dispose().catch(() => {});
    db = undefined;
    return false;
  }
}

export async function initStorage(logger) {
  const connected = await tryConnect(logger);

  if (!connected) {
    logger.warn('Initial Postgres connection failed. Will retry every 10 seconds...');

    reconnectInterval = setInterval(async () => {
      logger.info('Attempting to reconnect to Postgres...');
      await tryConnect(logger);
    }, 10000);
  }
}

async function migrate(logger) {
  await db.query(sql`CREATE TABLE IF NOT EXISTS _db_migrations (
    hash VARCHAR(255),
    filename VARCHAR(255),
    execution_time TIMESTAMPTZ
  );`);

  const files = await fs.promises.readdir("./migrations");

  // Sorted so that migrations run in a deterministic order (readdir order is not guaranteed)
  const sqlFiles = files
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of sqlFiles) {
    logger.info(`Processing DB migration ${file}`);
    const sqlStatement = await fs.promises.readFile(`./migrations/${file}`, "utf8");

    const hash = crypto
      .createHash("sha256")
      .update(sqlStatement)
      .digest("hex");

    // Matched by filename too: editing an applied migration does NOT re-run it, add a new file instead
    const rows = await db.query(
      sql`SELECT * FROM _db_migrations WHERE filename = ${file} OR hash = ${hash} LIMIT 1`
    );

    if (rows.length === 0) {
      // Postgres supports transactional DDL, so a failed migration leaves no partial schema behind
      await db.tx(async (dbi) => {
        await dbi.query(sql.file(`./migrations/${file}`));
        await dbi.query(
          sql`INSERT INTO _db_migrations (hash, filename, execution_time) VALUES (${hash}, ${file}, NOW())`
        );
      });

      logger.info(`Successfully executed SQL from ${file}.`);
    } else {
      logger.info(`SQL from ${file} has already been executed. Skipping.`);
    }
  }
  // Errors propagate to tryConnect(): the service reports the DB as disconnected and retries,
  // instead of serving requests against a half-migrated schema
}
