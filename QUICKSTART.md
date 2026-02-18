# 🚀 Quick Start - 5 Minutes

Démarrage rapide en **5 minutes chrono**!

## 1️⃣ Préparez votre mot de passe Supabase (1 min)

1. 🔗 **Allez sur**: https://supabase.com/dashboard/project/zddpobiwlxwiogzuioog
2. ⚙️ **Cliquez Settings** (gear icon en bas à gauche)
3. 📂 **Cliquez Database** (onglet)
4. 🔍 **Cherchez Connection strings** 
5. 📋 **Copiez le PASSWORD** (entre `:` et `@`)

Exemple de ce que vous verrez:
```
postgresql://postgres:YOUR_PASSWORD@db.zddpobiwlxwiogzuioog.supabase.co:5432/postgres
                      ^^^^^^^^^^^^ COPIEZ CETTE PARTIE
```

## 2️⃣ Exécutez Quick Start (2 min)

```bash
cd /root/Discord
./quickstart.sh
```

Ce script va:
- ✓ Installez les modules npm
- ✓ Vous demander le password
- ✓ Initialiser la base de données
- ✓ Générer une clé JWT sécurisée

## 3️⃣ Configurez Render (2 min)

1. 🌐 **Allez sur**: https://dashboard.render.com
2. 🔍 **Sélectionnez** votre service `discord-clone`
3. ⚙️ **Cliquez Environment** (onglet)
4. ➕ **Add Environment Variable** (2 fois):

```
Première variable:
Name: DATABASE_URL
Value: (copiez depuis .env.local après quickstart.sh)

Deuxième variable:
Name: JWT_SECRET
Value: (copiez depuis .env.local après quickstart.sh)
```

5. 🚀 **Cliquez "Clear build cache & Deploy"**
6. ⏳ **Attendez 2-3 minutes**

## 4️⃣ Testez! ✅

Votre app est en live! 🎉

- **URL**: https://discord-qfj8.onrender.com
- **Inscrivez-vous** et envoyez des messages
- **Créez des salons** et des catégories

---

## 🆘 Si ça ne marche pas

**Problème**: "password authentication failed"
- **Solution**: Vérifiez votre password Supabase (Settings → Database → Connection strings)

**Problème**: "Cannot find module"
- **Solution**: Exécutez `npm install` manuellement

**Problème**: Service ne se déploie pas sur Render
- **Solution**: Vérifiez les Environment Variables (DATABASE_URL + JWT_SECRET)

**Plus d'aide**: Lisez [INIT-DATABASE.md](INIT-DATABASE.md)

---

**C'est tout!** ✨ Votre Discord Clone est maintenant en ligne!
