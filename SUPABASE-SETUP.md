# 🗄️ Guide: Initialisation Supabase PostgreSQL

## 1️⃣ Accédez au SQL Editor de Supabase

1. Allez sur: https://supabase.com/dashboard/project/zddpobiwlxwiogzuioog
2. Cliquez sur **"SQL Editor"** (dans le menu gauche)
3. Cliquez sur **"New Query"** ou **"New SQL snippet"**

## 2️⃣ Copiez et exécutez le script SQL

1. Ouvrez le fichier `supabase-init.sql` dans ce dossier
2. Copiez **TOUT** le contenu
3. Collez-le dans l'éditeur SQL de Supabase
4. Cliquez sur le bouton ▶️ **"Run"** (en haut à droite)

Vous devriez voir le message: **"Tables créées avec succès ✅"**

## 3️⃣ Vérifiez les tables

Dans Supabase:
1. Allez dans **"Table Editor"** (menu gauche)
2. Vous devez voir:
   - `categories` (2 catégories par défaut)
   - `users` (vide)
   - `channels` (3 salons par défaut: general, random, aide)
   - `messages` (vide)

## 4️⃣ Configurez les variables d'environnement sur Render

1. Allez sur: https://dashboard.render.com
2. Sélectionnez votre service `discord-clone`
3. Allez dans **"Environment"** (onglet)
4. Cliquez sur **"Add Environment Variable"** et ajoutez:

```
Variable Name: DATABASE_URL
Value: postgresql://postgres:[VOTRE_PASSWORD]@db.zddpobiwlxwiogzuioog.supabase.co:5432/postgres
```

⚠️ **Remplacez `[VOTRE_PASSWORD]` par votre vrai mot de passe Supabase!**

Récupérez-le:
1. Supabase Dashboard → **"Settings"** (gear icon)
2. → **"Database"** → **"Connection string"**
3. Copiez la chaîne avec votre mot de passe

```
Variable Name: JWT_SECRET
Value: (Générez une clé: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

## 5️⃣ Déployez

1. Dans Render Dashboard, cliquez **"Clear build cache & Deploy"**
2. Attendez 2-3 minutes
3. Testez sur https://discord-qfj8.onrender.com

## ✅ Vous êtes prêt!

Si vous avez des erreurs, vérifiez:
- ✓ DATABASE_URL est correct (avec le bon password)
- ✓ Le script SQL s'est exécuté sans erreur
- ✓ Les tables existant dans Supabase
