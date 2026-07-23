const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for SSL cloud connections like Neon
  }
});

pool.on('connect', () => {
  console.log('⚡ Connected to Live Cloud Database (Neon)');
});

pool.on('error', (err) => {
  console.error('Unexpected database connection error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};