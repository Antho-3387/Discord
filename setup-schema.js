#!/usr/bin/env node
/**
 * Script pour changer le provider du schema Prisma
 * En dev (local): SQLite
 * En prod (Render): PostgreSQL
 */

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf-8');

// Si on est sur Render et que DATABASE_URL est PostgreSQL
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql')) {
  console.log('🔄 Switching schema to PostgreSQL...');
  schema = schema.replace('provider = "sqlite"', 'provider = "postgresql"');
  fs.writeFileSync(schemaPath, schema);
  console.log('✅ Schema switched to PostgreSQL');
} else {
  console.log('✅ Using SQLite schema');
}
