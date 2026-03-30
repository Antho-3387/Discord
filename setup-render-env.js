#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Créer .env pour Render au build time
const envContent = `DATABASE_URL="file:./discord.db"
JWT_SECRET=${process.env.JWT_SECRET || 'a8eed1b9e00168fdc2d1e4d1d789bc24b2c80f9dc73272405160da4c73f179bc'}
PORT=8080
NODE_ENV=production
`;

const envPath = path.join(__dirname, '.env');

if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Created .env for build');
} else {
  console.log('✅ .env already exists');
}
