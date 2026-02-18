#!/bin/bash

# Discord Clone - Quick Start Setup Script
# Ce script vous guide à travers l'initialisation complète

set -e

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   Discord Clone - Initialisation Rapide (Quick Start)     ║"
echo "║   🚀 Configurez et déployez en quelques minutes          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Étape 1: Vérifier les dépendances
echo "📦 Étape 1: Vérification des dépendances..."
if ! command -v node &> /dev/null; then
  echo "❌ Node.js n'est pas installé"
  exit 1
fi
echo "✅ Node.js installé ($(node --version))"

if ! command -v git &> /dev/null; then
  echo "❌ Git n'est pas installé"
  exit 1
fi
echo "✅ Git installé"

# Étape 2: Installer les modules
echo ""
echo "📦 Étape 2: Installation des modules npm..."
npm install --silent
echo "✅ Modules npm installés"

# Étape 3: Configuration Supabase
echo ""
echo "🔧 Étape 3: Configuration Supabase..."
echo ""
echo "📋 Rappel rapide:"
echo "   1. Allez sur: https://supabase.com/dashboard/project/zddpobiwlxwiogzuioog"
echo "   2. Settings → Database → Connection strings"
echo "   3. Cherchez: postgres:[PASSWORD]@"
echo "   4. Copiez le PASSWORD"
echo ""
node configure.js

# Étape 4: Initialiser la base de données
echo ""
echo "🗄️  Étape 4: Initialisation de la base de données..."
npm run setup-db

# Étape 5: Résumé et prochaines étapes
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   ✅ Configuration Locale Terminée!                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Statut:"
echo "   ✓ Modules Node.js installés"
echo "   ✓ Variables d'environnement configurées"
echo "   ✓ Base de données Supabase initialisée"
echo ""
echo "🚀 Prochaines étapes pour Render:"
echo ""
echo "1. Allez sur: https://dashboard.render.com"
echo "2. Sélectionnez votre service 'discord-clone'"
echo "3. Environment → Add Environment Variable"
echo ""
echo "   Ajoutez ces 2 variables:"
echo ""
echo "   DATABASE_URL"
echo "   (Récupérez-la depuis .env.local - même valeur)"
echo ""
echo "   JWT_SECRET"
echo "   (Récupérez-la depuis .env.local - même valeur)"
echo ""
echo "4. Cliquez 'Clear build cache & Deploy'"
echo "5. Attendez 2-3 minutes"
echo "6. Testez: https://discord-qfj8.onrender.com"
echo ""
echo "📚 Documentation complète: INIT-DATABASE.md"
echo ""
echo "❓ Besoin d'aide? Relisez les guides:"
echo "   - INIT-DATABASE.md (initialisation détaillée)"
echo "   - SUPABASE-SETUP.md (configuration Supabase)"
echo "   - README-RENDER.md (déploiement Render)"
echo ""
