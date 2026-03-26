import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

class SqlFragment {
  constructor(public readonly value: string) {}
  toString() { return this.value; }
}

async function sqlTagged(strings: TemplateStringsArray, ...values: any[]) {
  let query = '';
  const params: any[] = [];
  let paramIndex = 0;

  strings.forEach((str, i) => {
    query += str;
    if (i < values.length) {
      const val = values[i];
      if (val instanceof SqlFragment) {
        query += val.value;
      } else {
        paramIndex++;
        query += `$${paramIndex}`;
        params.push(val);
      }
    }
  });

  const result = await pool.query(query, params);
  return result.rows;
}

sqlTagged.unsafe = function(rawSql: string): SqlFragment {
  return new SqlFragment(rawSql);
};

sqlTagged.raw = async function(query: string): Promise<any[]> {
  const result = await pool.query(query);
  return result.rows;
};

export const sql = sqlTagged as typeof sqlTagged & {
  unsafe: (rawSql: string) => SqlFragment;
  raw: (query: string) => Promise<any[]>;
};

export { pool };

export const DEFAULT_ORG_ID = 'org-1';
