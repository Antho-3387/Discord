#!/usr/bin/env node

/**
 * Configuration Interactive Supabase Discord Clone
 * Aide à configurer le password Supabase facilement
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════╗
║   Configuration Supabase - Discord Clone           ║
║   🔧 Configurez facilement votre DATABASE_URL      ║
╚════════════════════════════════════════════════════╝
  `);

  console.log(`
📋 Avant de continuer, obtenez votre mot de passe:

1. Allez sur: https://supabase.com/dashboard/project/zddpobiwlxwiogzuioog
2. Cliquez Settings (⚙️ gear en bas à gauche)
3. Cliquez Database
4. Cherchez "Connection strings" (onglet "URI")
5. Cherchez la ligne avec: postgres:[PASSWORD]@
6. Copiez le PASSWORD (entre : et @)

Exemple: postgresql://postgres:abcd1234@db...
                            ^^^^^^^^^ C'est ce que vous copiez
  `);

  const password = await question('\n🔐 Entrez votre mot de passe Supabase: ');
  
  if (!password || password.trim() === '') {
    console.error('\n❌ Erreur: Le mot de passe ne peut pas être vide');
    rl.close();
    process.exit(1);
  }

  const jwtSecretResponse = await question('\n🔑 Générer un JWT_SECRET sécurisé? (y/n): ');
  
  let jwtSecret = 'your-secret-key-here-minimum-32-characters';
  if (jwtSecretResponse.toLowerCase() === 'y') {
    const crypto = require('crypto');
    jwtSecret = crypto.randomBytes(32).toString('hex');
    console.log(`✅ JWT_SECRET généré: ${jwtSecret.substring(0, 20)}...`);
  }

  // Lire le fichier actuel
  const envPath = path.join(__dirname, '.env.local');
  let envContent = fs.readFileSync(envPath, 'utf-8');

  // Remplacer le password
  const dbUrl = `postgresql://postgres:${password}@db.zddpobiwlxwiogzuioog.supabase.co:5432/postgres`;
  envContent = envContent.replace(
    /DATABASE_URL=.*/,
    `DATABASE_URL=${dbUrl}`
  );

  // Remplacer le JWT_SECRET
  envContent = envContent.replace(
    /JWT_SECRET=.*/,
    `JWT_SECRET=${jwtSecret}`
  );

  // Sauvegarder
  fs.writeFileSync(envPath, envContent);

  console.log(`
✅ Configuration sauvegardée!

📝 Votre fichier .env.local a été mis à jour avec:
   - DATABASE_URL: ✓
   - JWT_SECRET: ✓

🚀 Prochaines étapes:

1. Exécutez l'initialisation de la base de données:
   npm run setup-db

2. Configurez Render Dashboard:
   https://dashboard.render.com
   - Environment Variables
   - DATABASE_URL (la même valeur)
   - JWT_SECRET (la même valeur)

3. Déployez:
   Clear build cache & Deploy

4. Testez:
   https://discord-qfj8.onrender.com

⚠️ IMPORTANT: Ne commitez PAS .env.local avec git!
   Il contient des informations sensibles.
  `);

  rl.close();
}

main().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
