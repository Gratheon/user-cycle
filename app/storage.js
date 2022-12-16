import * as fs from "fs";
import * as crypto from "crypto";
import createConnectionPool, { sql } from "@databases/mysql";

import config from "../config/config.js";

let db;
export function storage() {
  return db;
}

export async function initStorage() {
  db = createConnectionPool(
    `mysql://${config.mysql.user}:${config.mysql.password}@${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`
  );

  await migrate();
}

async function migrate() {
  try {
    await db.query(sql`
	CREATE TABLE IF NOT EXISTS _db_migrations (
		hash VARCHAR(255),
		filename VARCHAR(255),
		executionTime DATETIME
  );
`);

    // List the directory containing the .sql files
    const files = await fs.promises.readdir("./migrations");

    // Filter the array to only include .sql files
    const sqlFiles = files.filter((file) => file.endsWith(".sql"));

    // Read each .sql file and execute the SQL statements
    for (const file of sqlFiles) {
      const sqlStatement = await fs.promises.readFile(
        `./migrations/${file}`,
        "utf8"
      );

      // Hash the SQL statements
      const hash = crypto
        .createHash("sha256")
        .update(sqlStatement)
        .digest("hex");

      // Check if the SQL has already been executed by checking the hashes in the dedicated table
      const rows = await db.query(sql`
	  		SELECT * FROM _db_migrations WHERE hash = ${hash}`);


      // If the hash is not in the table, execute the SQL and store the hash in the table
      if (rows.length === 0) {
        await db.query(sql.file(`./migrations/${file}`));

        console.log(`Successfully executed SQL from ${file}.`);

        // Store the hash in the dedicated table
        await db.query(sql`INSERT INTO _db_migrations (hash, filename, executionTime) VALUES (${hash}, ${file}, NOW())`);
        console.log(`Successfully stored hash in executed_sql_hashes table.`);
      } else {
        console.log(`SQL from ${file} has already been executed. Skipping.`);
      }
    }
  } catch (err) {
    console.error(err);
  }
}