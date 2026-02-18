# Déploiement sur Render

## Instructions de déploiement

### 1. Préparer le dépôt Git
```bash
git add .
git commit -m "Préparer pour le déploiement sur Render"
git push
```

### 2. Créer un nouveau service Web sur Render
1. Allez sur [render.com](https://render.com)
2. Connectez-vous ou créez un compte
3. Cliquez sur **New +** > **Web Service**
4. Sélectionnez votre dépôt GitHub (discord-clone)
5. Configurez comme suit:
   - **Name**: discord-clone
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Starter/Free (gratuit)

### 3. Variables d'environnement
Render génère automatiquement:
- `JWT_SECRET` - Clé de signature JWT

Vous pouvez ajouter d'autres variables d'environnement depuis le dashboard Render si nécessaire.

### 4. Base de données
- La base de données SQLite (`discord.db`) est stockée localement sur l'instance
- ⚠️ Attention: Si vous redéployez, la base de données sera réinitialisée
- Pour une base persistante, envisagez d'utiliser PostgreSQL

### 5. Vérifier le déploiement
Une fois déployé, votre application sera accessible à:
```
https://discord-qfj8.onrender.com
```

## Configuration avancée

### Utiliser PostgreSQL pour la persistance
Si vous voulez conserver les données entre redéploiements:

1. Créez une base de données PostgreSQL sur Render
2. Installez `pip install pg8000` ou utilisez un driver PostgreSQL
3. Modifiez `server.js` pour utiliser PostgreSQL au lieu de SQLite

### Monitoring
- Accédez au dashboard pour voir les logs
- Les logs en temps réel sont disponibles dans la section "Logs" du service

## Ressources
- [Documentation Render](https://docs.render.com)
- [Node.js sur Render](https://docs.render.com/deploy-node)
- [Variables d'environnement](https://docs.render.com/environment-variables)
