#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const builtPath = path.resolve(__dirname, '..', 'tracer_built.json');
  if (!fs.existsSync(builtPath)) {
    console.error('Built tracer file not found:', builtPath);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(builtPath, 'utf8'));

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'landbook',
    password: process.env.DB_PASSWORD || 'landbook_secret',
    database: process.env.DB_DATABASE || 'land_bookkeeping',
  });

  await client.connect();
  try {
    const q = `INSERT INTO tracer_tree (id, "treeData") VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET "treeData" = EXCLUDED."treeData";`;
    const vals = ['default', JSON.stringify(data)];
    await client.query(q, vals);
    console.log('Tracer tree upserted to DB successfully');
  } catch (e) {
    console.error('DB upsert failed', e);
  } finally {
    await client.end();
  }
}

if (require.main === module) main();
