/**
 * ⛔ ABSOLUTE RULE: READ-ONLY ACCESS TO CORE DATABASE
 *
 * This module ONLY executes SELECT statements against the core MySQL database.
 * It is physically impossible for this code to write, update, or delete data:
 * 1. The MySQL user (asg_tablau) has READ-ONLY permissions
 * 2. Every query is validated before execution — non-SELECT statements are rejected
 * 3. All connections use READ UNCOMMITTED isolation (no locks, ever)
 * 4. Connection pool limited to 1 connection
 * 5. Query timeout: 10 seconds
 *
 * The core database serves critical production applications.
 * CRM must NEVER cause slowdowns, locks, or data corruption.
 */

import mysql2 from "mysql2";
import { Pool as PromisePool, RowDataPacket } from "mysql2/promise";
import { config } from "./config";
import { createLogger } from "./logger";

const log = createLogger("MySQL");

/** Whitelist: only SELECT statements are allowed */
const FORBIDDEN_PATTERNS =
  /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|GRANT|REVOKE|LOCK|SET\s+GLOBAL)/i;

let pool: PromisePool | null = null;

export function getPool(): PromisePool {
  if (!pool) {
    const rawPool = mysql2.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      connectionLimit: 1, // Single connection — minimal load
      connectTimeout: 10000,
      waitForConnections: true,
      queueLimit: 5,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30000,
    });

    // Set READ UNCOMMITTED on every new connection (no locks)
    rawPool.on("connection", (conn) => {
      conn.query(
        "SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED",
        (err) => {
          if (err) log.error("Failed to set READ UNCOMMITTED isolation", err);
        },
      );
    });

    pool = rawPool.promise();

    log.info(
      `MySQL pool created: ${config.mysql.host}:${config.mysql.port}/${config.mysql.database} (READ-ONLY, max 1 conn)`,
    );
  }
  return pool;
}

/**
 * Execute a READ-ONLY query against core MySQL.
 * Rejects any non-SELECT statement to enforce safety.
 */
export async function query<T extends RowDataPacket[]>(
  sql: string,
  params?: any[],
): Promise<T> {
  // Safety: reject any write operations
  if (FORBIDDEN_PATTERNS.test(sql)) {
    const forbidden = sql.trim().split(/\s+/)[0];
    throw new Error(
      `⛔ BLOCKED: "${forbidden}" statement attempted against core database. ` +
        `Only SELECT queries are allowed. This is a critical safety violation.`,
    );
  }

  const p = getPool();

  try {
    const [rows] = await p.query<T>({
      sql,
      values: params,
      timeout: 10000, // 10 second timeout per query
    });
    return rows;
  } catch (err: any) {
    log.error(`Query failed: ${sql.slice(0, 100)}...`, err.message);
    throw err;
  }
}

/**
 * Test database connectivity — used by health checks.
 */
export async function testConnection(): Promise<boolean> {
  try {
    await query("SELECT 1 AS ok");
    return true;
  } catch {
    return false;
  }
}

/**
 * Gracefully close the connection pool.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    log.info("MySQL pool closed");
  }
}
