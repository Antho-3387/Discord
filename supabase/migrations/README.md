# 🗄️ Supabase Migrations

Cette fenêtre contient toutes les migrations SQL pour la base de données Supabase.

## Structure

```
supabase/
├── config.json                    # Configuration Supabase
└── migrations/
    └── 20260218_init_discord_tables.sql  # Migration initiale
```

## 🚀 Exécuter les migrations

### Option 1: Script Node (Recommandé - Sans Supabase CLI)

```bash
# Configuration: Ajouter DATABASE_URL à votre .env.local
echo "DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.zddpobiwlxwiogzuioog.supabase.co:5432/postgres" > .env.local

# Exécuter le script setup
node setup-database.js
```

**Avantage**: Fonctionne directement sans dépendances spéciales

### Option 2: SQL Editor Supabase (Manuel)

1. **Allez sur**: https://supabase.com/dashboard/project/zddpobiwlxwiogzuioog/sql/new
2. **Copiez** le contenu de `supabase/migrations/20260218_init_discord_tables.sql`
3. **Collez** dans l'éditeur SQL
4. **Cliquez** le bouton ▶️ **Run**

### Option 3: Supabase CLI (Avancé - Nécessite Node 20+)

```bash
# Installer Supabase CLI (Node 20+ requis)
npm install -g supabase

# Linker votre projet
supabase link --project-ref zddpobiwlxwiogzuioog

# Pousser les migrations
supabase db push
```

## ✅ Vérifier l'initialisation

Après l'exécution, vérifiez dans Supabase:

1. **Table Editor**: Vous devez voir 4 tables
   - ✓ `categories` (2 catégories)
   - ✓ `channels` (3 salons)
   - ✓ `users` (vide)
   - ✓ `messages` (vide)

2. **Données par défaut**:
   - 📋 Texte (Catégorie)
   - 🎙️ Vocal (Catégorie)
   - general, random, aide (Salons)

## 📝 Créer une nouvelle migration

Pour ajouter des migrations futures:

```bash
supabase migration new nom_de_migration
```

Puis modifiez le fichier SQL généré dans `supabase/migrations/`.

## 🔗 Ressources

- [Supabase Migrations Docs](https://supabase.com/docs/guides/cli/migrations)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Discord Clone API Docs](../README.md)
