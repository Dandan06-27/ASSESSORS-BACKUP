#!/usr/bin/env node
const { Client } = require('pg');
(async () => {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'landbook',
    password: process.env.DB_PASSWORD || 'landbook_secret',
    database: process.env.DB_DATABASE || 'land_bookkeeping',
  });
  await client.connect();
  try {
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='tracer_tree'");
    console.log('Columns for tracer_tree:');
    res.rows.forEach(r => console.log('-', r.column_name, r.data_type));
  } catch (e) {
    console.error('Failed to inspect columns', e);
  } finally {
    await client.end();
  }
})();
