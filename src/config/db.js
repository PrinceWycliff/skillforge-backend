const { Pool } = require('pg');

// Retrieve database connection URL from environment variables
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is missing.');
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: process.env.NODE_ENV === 'production' || connectionString?.includes('render.com') 
    ? { rejectUnauthorized: false } 
    : false,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database.');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database pool error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};