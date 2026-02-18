# 🚀 Guide Complet: Initialiser la Base de Données Supabase

Vous avez **3 façons** d'initialiser votre base de données. Choisissez la plus appropriée:

## ✅ Option 1: Script Node automatique (RECOMMANDÉ - PLUS FACILE)

**Avantages**:
- ✓ Pas de CLI à installer
- ✓ Fonctionne avec Node 18+
- ✓ Vérifie automatiquement que tout est bien créé
- ✓ Une seule commande

**Étapes**:

### 1️⃣ Ajouter votre connexion Supabase

Créez un fichier `.env.local` à la racine:

```bash
cat > .env.local << 'EOF'
DATABASE_URL=postgresql://postgres:[VOTRE_PASSWORD]@db.zddpobiwlxwiogzuioog.supabase.co:5432/postgres
EOF
```

**Où obtenir votre password?**
1. Allez sur: https://supabase.com/dashboard/project/zddpobiwlxwiogzuioog
2. Cliquez **Settings** (gear icon en bas)
3. → **Database** → **Connection strings**
4. Cherchez la ligne avec postgres : `postgres:[PASSWORD]`
5. Remplacez `[VOTRE_PASSWORD]` par le PASSWORD

### 2️⃣ Exécuter le script setup

```bash
npm run setup-db
```

**Output attendu**:
```
🚀 Connexion à la base de données Supabase...
✅ Connecté!

⏳ Exécution des migrations...
✅ Migrations exécutées avec succès!

📊 Vérification des tables...
✅ Tables créées:
   - categories
   - channels
   - messages
   - users

📈 Données initiales:
   - Catégories: 2
   - Salons: 3
   - Messages: 0
   - Utilisateurs: 0

🎉 Base de données initialisée avec succès!
```

✅ **Vous êtes prêt!** Passez à l'étape finale.

---

## Option 2: SQL Editor Supabase (Interface Web)

**Avantages**:
- ✓ Interface visuelle
- ✓ Pas de terminal nécessaire
- ✓ Idéal pour les débutants

**Étapes**:

### 1️⃣ Ouvrez le SQL Editor

Allez sur: https://supabase.com/dashboard/project/zddpobiwlxwiogzuioog/sql/new

### 2️⃣ Copiez le SQL

Ouvrez le fichier `supabase/migrations/20260218_init_discord_tables.sql` et copiez **TOUT** le contenu.

### 3️⃣ Collez et exécutez

1. Collez dans l'éditeur SQL Supabase
2. Cliquez le bouton ▶️ **Run** (en haut à droite)
3. Attendez la confirmation

✅ **Vous êtes prêt!** Passez à l'étape finale.

---

## Option 3: Supabase CLI (Avancé - Nécessite Node 20+)

**Avantages**:
- ✓ Workflow professionnel
- ✓ Versionne les migrations
- ✓ Scalable pour équipes

**Prérequis**: Node 20+ (vous avez Node 18)

```bash
# ❌ N'est PAS compatible avec votre version Node actuelle
# Si vous voulez l'utiliser, installez Node 20+
```

---

## 🎯 Étape Finale: Configurer Render

Une fois la base de données initialisée:

### 1️⃣ Allez sur Render Dashboard

https://dashboard.render.com

### 2️⃣ Sélectionnez votre service `discord-clone`

### 3️⃣ Allez dans **Environment** (onglet)

### 4️⃣ Ajoutez-ajoutez ces variables:

```
DATABASE_URL
postgresql://postgres:[VOTRE_PASSWORD]@db.zddpobiwlxwiogzuioog.supabase.co:5432/postgres

JWT_SECRET
(générez une clé forte)
```

**Générer JWT_SECRET en local**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Puis copiez la sortie et collez-la dans Render.

### 5️⃣ Déployez

Cliquez **"Clear build cache & Deploy"** dans Render.

### 6️⃣ Testez

Attendez 2-3 minutes, puis testez sur:
https://discord-qfj8.onrender.com

---

## ✅ Vérifier que tout fonctionne

### Dans Supabase (Table Editor):
- ✓ Votre avez 4 tables (categories, users, channels, messages)
- ✓ 2 catégories par défaut
- ✓ 3 salons par défaut

### Sur Render:
- ✓ Service en status "Live"
- ✓ Pas d'erreurs dans les logs

### Sur l'app:
- ✓ Page se charge
- ✓ Vous pouvez vous inscrire
- ✓ Vous pouvez chatter

---

## 🆘 Dépannage

### "ERROR: password authentication failed"

**Cause**: Le password est incorrect

**Solution**:
1. Supabase Dashboard → Settings → Database
2. Copiez la **Connection string** complète
3. Vérifiez le password entre les `:` et `@`
4. Mettez à jour `.env.local`

### "ERROR: Table already exists"

**Cause**: Les tables ont déjà été créées

**Solution**: C'est normal! Rien à faire. Le script utilise `CREATE TABLE IF NOT EXISTS`

### "Cannot find module 'pg'"

**Cause**: Le driver PostgreSQL n'est pas installé

**Solution**:
```bash
npm install pg
```

### Erreur sur Render avec DATABASE_URL

**Cause**: Variable d'environnement mal configurée

**Solution**:
1. Vérifiez la syntaxe exacte
2. Pas de caractères spéciaux non échappés
3. Le password ne doit pas contenir `@` (sinon échappez-le)

---

## 🔗 Ressources

- [Supabase Docs](https://supabase.com/docs)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Render Docs](https://render.com/docs)
- [Migrations Supabase](supabase/migrations/README.md)
