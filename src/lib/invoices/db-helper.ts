/**
 * Database Helper for Invoicing Module
 *
 * Provides a SQLite-like API wrapper around Neon's sql tagged template.
 * Note: Neon's sql is a tagged template literal function.
 */

import { sql } from '../db';

/**
 * Execute a raw SQL statement (CREATE TABLE, etc.)
 */
export async function exec(query: string): Promise<void> {
  try {
    await sql.raw(query);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '';
    if (
      query.includes('CREATE TABLE IF NOT EXISTS') ||
      query.includes('CREATE INDEX IF NOT EXISTS') ||
      errorMessage.includes('already exists')
    ) {
      if (process.env.NODE_ENV !== 'production') console.log('[DB Helper] Table/index already exists or created');
      return;
    }
    throw error;
  }
}

/**
 * Run a query with parameters (INSERT, UPDATE, DELETE)
 */
export async function run(
  query: string,
  params: unknown[] = []
): Promise<{ changes?: number; lastRowId?: number }> {
  const result = await executeQuery(query, params);
  return { changes: result.length };
}

/**
 * Get a single row
 */
export async function get<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const results = await executeQuery<T>(query, params);
  return results[0];
}

/**
 * Get all matching rows
 */
export async function all<T = Record<string, unknown>[]>(
  query: string,
  params: unknown[] = []
): Promise<T> {
  const results = await executeQuery(query, params);
  return results as T;
}

/**
 * Helper to execute parameterized queries using Neon's tagged template syntax
 * We need to convert ? placeholders to $n and execute the query
 */
async function executeQuery<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  // Replace ? placeholders with $1, $2, etc. for PostgreSQL
  let paramIndex = 0;
  const pgQuery = query.replace(/\?/g, () => `$${++paramIndex}`);

  let finalQuery = pgQuery;
  params.forEach((param, index) => {
    const placeholder = `$${index + 1}`;
    const value = formatValueForSql(param);
    finalQuery = finalQuery.replace(placeholder, value);
  });

  const result = await sql.raw(finalQuery);
  return result as unknown as T[];
}

/**
 * Format a value for safe SQL interpolation
 */
function formatValueForSql(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'string') {
    // Escape single quotes by doubling them
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

export const db = {
  exec,
  run,
  get,
  all,
};

export default db;
