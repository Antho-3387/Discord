#!/usr/bin/env node

/**
 * Script d'initialisation Supabase Discord Clone
 * Exécute le SQL directement dans Supabase
 * 
 * Usage: node setup-database.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Charger les variables d'environnement depuis .env.local
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && !key.startsWith('#') && valueParts.length > 0) {
      const value = valueParts.join('=').trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERREUR: Variable DATABASE_URL manquante!');
  console.error('Ajoutez DATABASE_URL à votre .env.local ou en variable d\'environnement');
  console.error('Format: postgresql://postgres:PASSWORD@db.zddpobiwlxwiogzuioog.supabase.co:5432/postgres');
  process.exit(1);
}

async function setupDatabase() {
  const client = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🚀 Connexion à la base de données Supabase...');
    await client.connect();
    console.log('✅ Connecté!');

    // Lire le fichier SQL init
    const sqlPath = path.join(__dirname, 'supabase-init.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    console.log('\n⏳ Exécution des migrations...');
    await client.query(sqlContent);
    console.log('✅ Migrations exécutées avec succès!');

    // Vérifier les tables
    console.log('\n📊 Vérification des tables...');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n✅ Tables créées:');
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    // Vérifier les données par défaut
    const categories = await client.query('SELECT COUNT(*) FROM categories');
    const channels = await client.query('SELECT COUNT(*) FROM channels');
    const messages = await client.query('SELECT COUNT(*) FROM messages');
    const users = await client.query('SELECT COUNT(*) FROM users');

    console.log('\n📈 Données initiales:');
    console.log(`   - Catégories: ${categories.rows[0].count}`);
    console.log(`   - Salons: ${channels.rows[0].count}`);
    console.log(`   - Messages: ${messages.rows[0].count}`);
    console.log(`   - Utilisateurs: ${users.rows[0].count}`);

    console.log('\n🎉 Base de données initialisée avec succès!');
    console.log('\nProchaines étapes:');
    console.log('1. Configurez DATABASE_URL sur Render');
    console.log('2. Configurez JWT_SECRET sur Render');
    console.log('3. Déployez sur Render');
    console.log('4. Testez sur https://discord-qfj8.onrender.com');

  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Exécuter
setupDatabase();
