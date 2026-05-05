import { Pool } from 'pg';

// DATABASE_URL must be a string. If it is undefined (e.g. .env file is missing
// or dotenv was not loaded before this module), pg will try to authenticate with
// an undefined password and throw:
//   "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string"
// The fix: always load dotenv/config as the very first import in the entry point
// (src/index.ts) so that process.env is populated before any module runs.

// Temporary debug log – remove after confirming the value is correct.
// The password is masked so credentials are never written to plain logs.
const safeDbUrl = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/:([^@:]+)@/, ':***@')
  : '(not set)';
console.log('DB URL:', safeDbUrl);

// Fail fast: crash immediately with a clear message if the variable is missing
// instead of getting a cryptic SASL error from pg later.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing from environment variables');
}

// PostgreSQL connection pool using the connection string from the environment.
// The password inside DATABASE_URL must be a non-empty string; pg does not
// accept undefined or numeric values.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;
