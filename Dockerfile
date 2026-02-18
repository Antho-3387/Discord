FROM node:18-alpine

WORKDIR /app

# Installer les dépendances de build pour sqlite3
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Copier les fichiers
COPY package*.json ./
COPY . .

# Installer les dépendances npm et compiler sqlite3 pour l'environnement Linux
RUN npm ci && npm rebuild sqlite3

# Exposer le port
EXPOSE 8080

# Variables d'environnement
ENV NODE_ENV=production
ENV PORT=8080

# Lancer le serveur
CMD ["node", "server.js"]
