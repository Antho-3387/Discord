#!/usr/bin/env node

/**
 * Configuration Simple - Juste demander le password Supabase
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log(`
╔════════════════════════════════════════════════════╗
║   Discord Clone - Configuration Password           ║
║   Entrez votre password Supabase                   ║
╚════════════════════════════════════════════════════╝
  `);

  console.log(`
📍 Détails de connexion détectés:
   - Host: db.zddpobiwlxwiogzuioog.supabase.co
   - Port: 5432
   - Database: postgres
   - User: postgres
   
❓ Il manque juste: LE PASSWORD

Où le trouver?
1. Supabase Dashboard → Settings → Database
2. Cherchez "Connection strings" → copier le PASSWORD
3. C'est la valeur entre postgres: et @
  `);

  rl.question('\n🔐 Entrez votre PASSWORD Supabase: ', (password) => {
    if (!password || password.trim() === '') {
      console.error('\n❌ Erreur: Le password ne peut pas être vide');
      rl.close();
      process.exit(1);
    }

    // Construire la DATABASE_URL complète
    const dbUrl = `postgresql://postgres:${password}@db.zddpobiwlxwiogzuioog.supabase.co:5432/postgres`;
    
    // Vérifier si .env.local existe
    const envPath = path.join(__dirname, '.env.local');
    
    if (!fs.existsSync(envPath)) {
      console.error('\n❌ Erreur: Fichier .env.local non trouvé');
      rl.close();
      process.exit(1);
    }

    // Lire et modifier .env.local
    let envContent = fs.readFileSync(envPath, 'utf-8');
    envContent = envContent.replace(
      /DATABASE_URL=.*/,
      `DATABASE_URL=${dbUrl}`
    );

    // Sauvegarder
    fs.writeFileSync(envPath, envContent);

    console.log(`
✅ Configuration sauvegardée!

📝 Votre DATABASE_URL:
   ${dbUrl}

🚀 Prochaines étapes:

1️⃣  Initialisez la base de données:
    npm run setup-db

2️⃣  Configurez Render:
    https://dashboard.render.com
    → discord-clone (votre service)
    → Environment
    → Add 2 variables:
       - DATABASE_URL: (collez la valeur ci-dessus)
       - JWT_SECRET: (générez avec: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

3️⃣  Déployez:
    Clear build cache & Deploy

4️⃣  Testez:
    https://discord-qfj8.onrender.com

⚠️ IMPORTANT: Ne commitez PAS .env.local!
   Il contient votre password.
    `);

    rl.close();
  });
}

main().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
