#!/usr/bin/env node

/**
 * Configuration Supabase - PASSWORD UNIQUEMENT
 * Ultra simple: juste le password, rien d'autre
 */

const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(`
╔════════════════════════════════════════════════════╗
║        Discord Clone - Configuration              ║
║     TAPEZ VOTRE PASSWORD SUPABASE CI-DESSOUS      ║
╚════════════════════════════════════════════════════╝
`);

rl.question('🔐 PASSWORD: ', (password) => {
  if (!password || password.trim() === '') {
    console.error('❌ Erreur: Password vide');
    rl.close();
    process.exit(1);
  }

  // Créer la DATABASE_URL
  const dbUrl = `postgresql://postgres:${password}@db.zddpobiwlxwiogzuioog.supabase.co:5432/postgres`;
  
  // Créer le contenu .env.local
  const envContent = `# Configuration Discord Clone - Supabase

# BASE DE DONNÉES
DATABASE_URL=${dbUrl}

# SÉCURITÉ
JWT_SECRET=your-secret-key-here-minimum-32-characters

# SERVEUR
PORT=8080
NODE_ENV=production
`;

  // Sauvegarder
  fs.writeFileSync('/root/Discord/.env.local', envContent);

  console.log(`
✅ Configuration sauvegardée!

🔗 DATABASE_URL configurée

Prochaines étapes:
1. npm run setup-db
2. Puis configurez Render (DATABASE_URL + JWT_SECRET)
3. Déployez!
`);

  rl.close();
});
