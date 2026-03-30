/**
 * Discord Clone - Backend Server
 * Serveur Express + Socket.io + PostgreSQL (Supabase) + Prisma ORM
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// Fallback pour DATABASE_URL si non définie
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./discord.db';
  console.log('⚠️ DATABASE_URL non définie, utilisant SQLite par défaut');
}

// Initialiser Prisma avec configuration de connexion augmentée
const prisma = new PrismaClient({
  errorFormat: 'colorless',
  log: ['error', 'warn'],
});

// Configuration sécurisée
const JWT_SECRET = process.env.JWT_SECRET || 'discord_clone_secret_key_' + Date.now();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 50 * 1024 * 1024 // 50MB pour les images
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'Public')));

// ===========================
// 🗄️  BASE DE DONNÉES - Prisma ORM
// ===========================

// Initialiser la base de données avec les données par défaut
async function initializeDatabase() {
  try {
    // Appliquer les migrations pour SQLite
    const { execSync } = require('child_process');
    console.log('⏳ Initialisation de la base de données...');
    execSync('npx prisma migrate deploy', { 
      stdio: 'pipe',
      env: process.env
    });
    console.log('✅ Base de données initialisée');
  } catch (err) {
    console.log('⚠️ Migrations échouées (normal si déjà appliquées):', err.message);
  }
}

// Initialiser au démarrage (toujours - important pour Render)
// Cette fonction ne doit pas bloquer le démarrage du serveur
initializeDatabase().then(() => {
  console.log('✅ Initialization DB thread completed');
}).catch(err => {
  console.warn('⚠️ Initialization DB thread failed:', err.message);
});

// ===========================
// 🌐 ROUTES EXPRESS
// ===========================

// Route racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// Health check with database status
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: new Date().toISOString() 
    });
  } catch (err) {
    console.error('Health check - DB error:', err.message);
    res.status(503).json({ 
      status: 'degraded',
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString() 
    });
  }
});

// Récupérer toutes les catégories avec leurs salons
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        channels: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { position: 'asc' }
    });

    res.json(categories);
  } catch (err) {
    console.error('Erreur API /categories:', err.message);
    if (err.message?.includes('Can\'t reach database')) {
      return res.status(503).json({ error: 'Base de données indisponible' });
    }
    res.status(500).json({ error: 'Erreur lors de la récupération des catégories' });
  }
});

// Récupérer tous les salons
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await prisma.channel.findMany({
      orderBy: { createdAt: 'asc' }
    });
    res.json(channels);
  } catch (err) {
    console.error('Erreur API /channels:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des salons' });
  }
});

// Récupérer les messages d'un salon
app.get('/api/messages/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const messages = await prisma.message.findMany({
      where: { channelId: parseInt(channelId) },
      orderBy: { timestamp: 'asc' },
      take: 50
    });
    res.json(messages);
  } catch (err) {
    console.error('Erreur API /messages:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des messages' });
  }
});

// Créer une nouvelle catégorie
app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Le nom de la catégorie est requis' });
    }

    // Trouver la position max
    const maxCategory = await prisma.category.findFirst({
      orderBy: { position: 'desc' },
      select: { position: true }
    });

    const position = (maxCategory?.position || -1) + 1;

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        position
      }
    });

    res.json({
      success: true,
      category: {
        ...category,
        channels: []
      }
    });
  } catch (err) {
    if (err.code === 'P2002') { // UNIQUE constraint
      return res.status(400).json({ error: 'Cette catégorie existe déjà' });
    }
    console.error('Erreur POST /categories:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier une catégorie
app.put('/api/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Le nom de la catégorie est requis' });
    }

    const category = await prisma.category.update({
      where: { id: parseInt(categoryId) },
      data: { name: name.trim() }
    });

    io.emit('category_updated', { id: category.id, name: category.name });
    console.log(`✏️  Catégorie modifiée: ${name}`);

    res.json({ success: true, category });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Cette catégorie existe déjà' });
    }
    if (err.code === 'P2025') { // Record not found
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }
    console.error('Erreur PUT /categories:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une catégorie
app.delete('/api/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await prisma.category.findUnique({
      where: { id: parseInt(categoryId) }
    });

    if (!category) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    const categoryName = category.name;

    // Supprimer la catégorie (les salons seront mis à NULL via ON DELETE SET NULL)
    await prisma.category.delete({
      where: { id: parseInt(categoryId) }
    });

    io.emit('category_deleted', { categoryId: parseInt(categoryId), categoryName });
    console.log(`🗑️  Catégorie supprimée: ${categoryName}`);

    res.json({ success: true, message: 'Catégorie supprimée avec succès' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }
    console.error('Erreur DELETE /categories:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un salon
app.delete('/api/channels/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;

    const channel = await prisma.channel.findUnique({
      where: { id: parseInt(channelId) }
    });

    if (!channel) {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }

    const channelName = channel.name;

    // Supprimer le salon (les messages seront supprimés via ON DELETE CASCADE)
    await prisma.channel.delete({
      where: { id: parseInt(channelId) }
    });

    io.emit('channel_deleted', { channelId: parseInt(channelId), channelName });
    console.log(`🗑️  Salon supprimé: ${channelName}`);

    res.json({ success: true, message: 'Salon supprimé avec succès' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }
    console.error('Erreur DELETE /channels:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier un salon
app.put('/api/channels/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Le nom du salon est requis' });
    }

    const channel = await prisma.channel.update({
      where: { id: parseInt(channelId) },
      data: {
        name: name.trim(),
        description: description || ''
      }
    });

    io.emit('channel_updated', channel);
    console.log(`✏️  Salon modifié: ${name}`);

    res.json({ success: true, channel });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Ce nom de salon existe déjà' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }
    console.error('Erreur PUT /channels:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===========================
// 🔐 AUTHENTIFICATION
// ===========================

// Middleware d'authentification JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requis' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
    req.user = user;
    next();
  });
}

// Inscription
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Le pseudo est requis' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 4 caractères' });
    }
    if (username.trim().length < 3) {
      return res.status(400).json({ error: 'Le pseudo doit contenir au moins 3 caractères' });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { username: username.trim() }
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Ce pseudo est déjà pris' });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insérer l'utilisateur
    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        password: hashedPassword
      }
    });

    // Générer un token JWT
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`✅ Nouvel utilisateur inscrit: ${username.trim()}`);
    res.json({
      success: true,
      username: user.username,
      token
    });
  } catch (err) {
    console.error('❌ Erreur inscription:', err.message || err);
    console.error('Code:', err.code);
    res.status(500).json({ error: 'Erreur serveur: ' + (err.message || 'Erreur inconnue') });
  }
});

// Connexion
app.post('/api/auth/login', async (req, res) => {
  console.log('🔐 Tentative de connexion:', req.body.username);
  try {
    const { username, password } = req.body;

    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Le pseudo est requis' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Le mot de passe est requis' });
    }

    // Récupérer l'utilisateur
    const user = await prisma.user.findUnique({
      where: { username: username.trim() }
    });

    if (!user) {
      return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect' });
    }

    // Vérifier le mot de passe
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect' });
    }

    // Générer un token JWT
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`✅ Connexion réussie: ${user.username}`);
    res.json({
      success: true,
      username: user.username,
      token
    });
  } catch (err) {
    console.error('❌ Erreur connexion:', err.message || err);
    console.error('Code:', err.code);
    res.status(500).json({ error: 'Erreur serveur: ' + (err.message || 'Erreur inconnue') });
  }
});

// Vérifier le token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ success: true, username: req.user.username });
});

// Récupérer le profil d'un utilisateur
app.get('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const user = await prisma.user.findUnique({
      where: { username },
      select: { username: true, profileImage: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json(user);
  } catch (err) {
    console.error('Erreur GET /users/:username:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Uploader l'image de profil
app.post('/api/users/:username/profile-image', async (req, res) => {
  try {
    const { username } = req.params;
    const { imageData } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'Image requise' });
    }

    // Limiter la taille à 2MB en base64
    if (imageData.length > 2097152) {
      console.error(`❌ Image trop grande: ${(imageData.length / 1024 / 1024).toFixed(2)}MB`);
      return res.status(400).json({ error: 'Image trop grande (max 2MB)' });
    }

    // Upsert l'image de profil
    const user = await prisma.user.upsert({
      where: { username },
      update: { profileImage: imageData },
      create: { username, profileImage: imageData }
    });

    io.emit('user_profile_updated', { username: user.username, imageData: user.profileImage });
    console.log(`🖼️  Image de profil mise à jour pour: ${username}`);

    res.json({ success: true, message: 'Image de profil mise à jour' });
  } catch (err) {
    console.error('Erreur POST /users/:username/profile-image:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===========================
// 🔌 SOCKET.IO - Événements temps réel
// ===========================

const connectedUsers = {};
const channelUsers = {};
const typingUsers = {};

io.on('connection', (socket) => {
  console.log('👤 Nouvel utilisateur connecté:', socket.id);

  // Un utilisateur rejoint
  socket.on('user_joined', (data) => {
    const { username, channelId } = data;

    connectedUsers[socket.id] = { username, channelId, socketId: socket.id };

    if (!channelUsers[channelId]) {
      channelUsers[channelId] = [];
    }
    if (!channelUsers[channelId].includes(username)) {
      channelUsers[channelId].push(username);
    }

    socket.join(`channel_${channelId}`);

    console.log(`📍 ${username} a rejoint le canal ${channelId}`);
    console.log(`👥 Utilisateurs en ligne: ${channelUsers[channelId].join(', ')}`);

    io.to(`channel_${channelId}`).emit('user_joined', {
      username,
      message: `${username} a rejoint le salon`
    });

    io.to(`channel_${channelId}`).emit('users_update', {
      channelId,
      users: channelUsers[channelId]
    });
  });

  // Envoyer un message
  socket.on('send_message', async (data) => {
    try {
      const { author, content, channelId, isImage } = data;

      if (!content || content.trim() === '') {
        console.warn('⚠️ Message vide reçu');
        return;
      }

      // Créer le message avec Prisma
      const message = await prisma.message.create({
        data: {
          channelId: parseInt(channelId),
          author,
          content
        }
      });

      const messageData = {
        id: message.id,
        channelId: message.channelId,
        author: message.author,
        content: message.content,
        timestamp: message.timestamp.toISOString()
      };

      socket.broadcast.to(`channel_${channelId}`).emit('new_message', messageData);
      socket.emit('message_confirmed', { tempId: data.tempId, message: messageData });

      if (isImage) {
        console.log(`🖼️  Image envoyée par ${author}`);
      } else {
        console.log(`💬 Message de ${author}`);
      }
    } catch (err) {
      console.error('Erreur send_message:', err);
      socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
    }
  });

  // Changer de canal
  socket.on('switch_channel', (data) => {
    const { channelId, username } = data;
    const user = connectedUsers[socket.id];

    if (!user) return;

    const oldChannelId = user.channelId;

    // Retirer du canal précédent
    if (channelUsers[oldChannelId]) {
      channelUsers[oldChannelId] = channelUsers[oldChannelId].filter(u => u !== username);
      io.to(`channel_${oldChannelId}`).emit('user_left', {
        username,
        message: `${username} a quitté le salon`
      });
      io.to(`channel_${oldChannelId}`).emit('users_update', {
        channelId: oldChannelId,
        users: channelUsers[oldChannelId]
      });
    }

    socket.leave(`channel_${oldChannelId}`);
    user.channelId = channelId;

    // Ajouter au nouveau canal
    if (!channelUsers[channelId]) {
      channelUsers[channelId] = [];
    }
    if (!channelUsers[channelId].includes(username)) {
      channelUsers[channelId].push(username);
    }

    socket.join(`channel_${channelId}`);

    io.to(`channel_${channelId}`).emit('user_joined', {
      username,
      message: `${username} a rejoint le salon`
    });

    io.to(`channel_${channelId}`).emit('users_update', {
      channelId,
      users: channelUsers[channelId]
    });

    console.log(`📍 ${username} a changé de canal vers ${channelId}`);
  });

  // Créer un nouveau canal
  socket.on('create_channel', async (data) => {
    try {
      const { channelName, categoryId } = data;

      const channel = await prisma.channel.create({
        data: {
          name: channelName,
          description: 'Canal créé par un utilisateur',
          categoryId: categoryId ? parseInt(categoryId) : null
        }
      });

      io.emit('channel_created', {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        categoryId: channel.categoryId,
        createdAt: channel.createdAt.toISOString()
      });

      console.log(`📢 Nouveau canal créé: ${channelName}`);
    } catch (err) {
      console.error('Erreur create_channel:', err);
      socket.emit('error', { message: 'Ce canal existe déjà' });
    }
  });

  // Créer une nouvelle catégorie
  socket.on('create_category', async (data) => {
    try {
      const { categoryName } = data;

      const maxCategory = await prisma.category.findFirst({
        orderBy: { position: 'desc' },
        select: { position: true }
      });

      const position = (maxCategory?.position || -1) + 1;

      const category = await prisma.category.create({
        data: {
          name: categoryName,
          position
        }
      });

      io.emit('category_created', {
        id: category.id,
        name: category.name,
        position: category.position,
        channels: []
      });

      console.log(`📁 Nouvelle catégorie créée: ${categoryName}`);
    } catch (err) {
      console.error('Erreur create_category:', err);
      socket.emit('error', { message: 'Cette catégorie existe déjà' });
    }
  });

  // Modifier une catégorie
  socket.on('update_category', async (data) => {
    try {
      const { categoryId, name } = data;

      if (!name || name.trim() === '') {
        socket.emit('error', { message: 'Le nom de la catégorie est requis' });
        return;
      }

      const category = await prisma.category.update({
        where: { id: parseInt(categoryId) },
        data: { name: name.trim() }
      });

      io.emit('category_updated', { id: category.id, name: category.name });
      console.log(`✏️  Catégorie modifiée: ${name}`);
    } catch (err) {
      console.error('Erreur update_category:', err);
      socket.emit('error', { message: 'Erreur lors de la modification' });
    }
  });

  // Supprimer une catégorie
  socket.on('delete_category', async (data) => {
    try {
      const { categoryId } = data;

      const category = await prisma.category.findUnique({
        where: { id: parseInt(categoryId) }
      });

      if (!category) {
        socket.emit('error', { message: 'Catégorie non trouvée' });
        return;
      }

      await prisma.category.delete({
        where: { id: parseInt(categoryId) }
      });

      io.emit('category_deleted', { categoryId: parseInt(categoryId), categoryName: category.name });
      console.log(`🗑️  Catégorie supprimée: ${category.name}`);
    } catch (err) {
      console.error('Erreur delete_category:', err);
      socket.emit('error', { message: 'Erreur lors de la suppression' });
    }
  });

  // Supprimer un canal
  socket.on('delete_channel', async (data) => {
    try {
      const { channelId } = data;

      const channel = await prisma.channel.findUnique({
        where: { id: parseInt(channelId) }
      });

      if (!channel) {
        socket.emit('error', { message: 'Salon non trouvé' });
        return;
      }

      await prisma.channel.delete({
        where: { id: parseInt(channelId) }
      });

      io.emit('channel_deleted', { channelId: parseInt(channelId), channelName: channel.name });
      console.log(`🗑️  Salon supprimé: ${channel.name}`);
    } catch (err) {
      console.error('Erreur delete_channel:', err);
      socket.emit('error', { message: 'Erreur lors de la suppression' });
    }
  });

  // Modifier un canal
  socket.on('update_channel', async (data) => {
    try {
      const { channelId, name, description } = data;

      if (!name || name.trim() === '') {
        socket.emit('error', { message: 'Le nom du salon est requis' });
        return;
      }

      const channel = await prisma.channel.update({
        where: { id: parseInt(channelId) },
        data: {
          name: name.trim(),
          description: description || ''
        }
      });

      io.emit('channel_updated', channel);
      console.log(`✏️  Salon modifié: ${name}`);
    } catch (err) {
      console.error('Erreur update_channel:', err);
      socket.emit('error', { message: 'Erreur lors de la modification' });
    }
  });

  // Déplacer un canal
  socket.on('move_channel', async (data) => {
    try {
      const { channelId, categoryId } = data;

      await prisma.channel.update({
        where: { id: parseInt(channelId) },
        data: { categoryId: categoryId ? parseInt(categoryId) : null }
      });

      io.emit('channel_moved', { channelId: parseInt(channelId), categoryId });
      console.log(`🚚 Salon ${channelId} déplacé vers catégorie ${categoryId || 'aucune'}`);
    } catch (err) {
      console.error('Erreur move_channel:', err);
      socket.emit('error', { message: 'Erreur lors du déplacement' });
    }
  });

  // Déconnexion
  socket.on('disconnect', () => {
    const user = connectedUsers[socket.id];
    if (user) {
      const { username, channelId } = user;

      if (channelUsers[channelId]) {
        channelUsers[channelId] = channelUsers[channelId].filter(u => u !== username);
      }

      if (typingUsers[channelId]) {
        typingUsers[channelId] = typingUsers[channelId].filter(u => u !== username);
      }

      io.to(`channel_${channelId}`).emit('user_left', {
        username,
        message: `${username} a quitté le salon`
      });

      io.to(`channel_${channelId}`).emit('users_update', {
        channelId,
        users: channelUsers[channelId] || []
      });

      console.log(`👋 ${username} s'est déconnecté`);
      delete connectedUsers[socket.id];
    }
  });

  // Typing indicators
  socket.on('typing', (data) => {
    const { username, channelId } = data;

    if (!typingUsers[channelId]) {
      typingUsers[channelId] = [];
    }

    if (!typingUsers[channelId].includes(username)) {
      typingUsers[channelId].push(username);
    }

    io.to(`channel_${channelId}`).emit('user_typing', { username, channelId });
  });

  socket.on('stop_typing', (data) => {
    const { username, channelId } = data;

    if (typingUsers[channelId]) {
      typingUsers[channelId] = typingUsers[channelId].filter(u => u !== username);
    }

    io.to(`channel_${channelId}`).emit('user_stopped_typing', { username, channelId });
  });

  // Gestion des erreurs
  socket.on('error', (error) => {
    console.error('Erreur Socket:', error);
  });
});

// ===========================
// 🚀 DÉMARRAGE DU SERVEUR
// ===========================

// Middleware de gestion des erreurs global
app.use((err, req, res, next) => {
  console.error('❌ Erreur:', err.message);
  
  if (err.message?.includes('Can\'t reach database')) {
    return res.status(503).json({ 
      error: 'Base de données indisponible',
      details: err.message 
    });
  }
  
  if (err.code === 'P2025') { // Prisma: Record not found
    return res.status(404).json({ error: 'Ressource non trouvée' });
  }
  
  if (err.code === 'P2002') { // Prisma: Unique constraint
    return res.status(400).json({ error: 'Cette valeur existe déjà' });
  }
  
  res.status(500).json({ error: err.message || 'Erreur serveur' });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════╗
║   Discord Clone - Server Running   ║
║   🌐 http://localhost:${PORT}      ║
║   📊 Database: PostgreSQL/Supabase ║
║   🔒 ORM: Prisma                   ║
║   🔐 SSL: Enabled                  ║
╚════════════════════════════════════╝
  `);
});

// Gestion des erreurs globales
process.on('unhandledRejection', (err) => {
  console.error('Erreur non gérée:', err);
});

process.on('SIGINT', () => {
  console.log('\n📴 Arrêt du serveur...');
  prisma.$disconnect();
  process.exit(0);
});
