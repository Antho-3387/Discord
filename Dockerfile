FROM node:18-alpine

WORKDIR /app

# Installer les dépendances de build pour pg (PostgreSQL)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl

# Copier les fichiers
COPY package*.json ./
COPY . .

# Installer les dépendances npm
RUN npm ci --only=production

# Exposer le port
EXPOSE 8080

# Variables d'environnement
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

# Lancer le serveur
CMD ["node", "server.js"]
