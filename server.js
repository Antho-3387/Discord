/**
 * Discord Clone - Backend Server
 * Serveur Express + Socket.io + PostgreSQL (Supabase)
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Configuration sécurisée
const JWT_SECRET = process.env.JWT_SECRET || 'discord_clone_secret_key_' + Date.now();
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL && process.env.NODE_ENV === 'production') {
  console.error('❌ ERREUR: Variable d\'environnement DATABASE_URL manquante!');
  process.exit(1);
}

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
// 🗄️  BASE DE DONNÉES PostgreSQL (Supabase)
// ===========================

// Pool de connexions PostgreSQL avec SSL pour sécurité
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Supabase requiert SSL
  },
  max: 20, // Nombre max de connexions
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Gérer les erreurs de connexion
pool.on('error', (err) => {
  console.error('Erreur pool PostgreSQL:', err);
});

// Initialiser la base de données
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    console.log('⏳ Initialisation de la base de données...');
    
    // Table des catégories
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        position INTEGER DEFAULT 0,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des utilisateurs
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT,
        profile_image TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des salons (channels)
    await client.query(`
      CREATE TABLE IF NOT EXISTS channels (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        "categoryId" INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des messages
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        "channelId" INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Créer les index pour performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_channelId ON messages("channelId")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_channels_categoryId ON channels("categoryId")
    `);

    console.log('✅ Tables créées avec succès');

    // Insérer les catégories par défaut
    await client.query(
      `INSERT INTO categories (name, position) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      ['📋 Texte', 0]
    );
    await client.query(
      `INSERT INTO categories (name, position) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      ['🎙️ Vocal', 1]
    );

    // Récupérer l'ID de la catégorie "Texte"
    const catResult = await client.query(
      `SELECT id FROM categories WHERE name = $1`,
      ['📋 Texte']
    );

    if (catResult.rows.length > 0) {
      const textCatId = catResult.rows[0].id;

      // Insérer des salons par défaut
      await client.query(
        `INSERT INTO channels (name, description, "categoryId") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        ['general', 'Salon général pour discuter', textCatId]
      );
      await client.query(
        `INSERT INTO channels (name, description, "categoryId") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        ['random', 'Messages aléatoires', textCatId]
      );
      await client.query(
        `INSERT INTO channels (name, description, "categoryId") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        ['aide', 'Besoin d\'aide?', textCatId]
      );
    }

    console.log('✅ Données par défaut insérées');
  } catch (err) {
    console.error('❌ Erreur initialisation DB:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Initialiser au démarrage
initializeDatabase().catch(err => {
  console.error('Impossible d\'initialiser la base de données:', err);
  process.exit(1);
});

// ===========================
// 🌐 ROUTES EXPRESS
// ===========================

// Route racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Récupérer toutes les catégories avec leurs salons
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await pool.query(
      `SELECT * FROM categories ORDER BY position ASC`
    );

    const result = [];
    for (const category of categories.rows) {
      const channels = await pool.query(
        `SELECT * FROM channels WHERE "categoryId" = $1 ORDER BY "createdAt" ASC`,
        [category.id]
      );

      result.push({
        ...category,
        channels: channels.rows
      });
    }

    res.json(result);
  } catch (err) {
    console.error('Erreur API /categories:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des catégories' });
  }
});

// Récupérer tous les salons
app.get('/api/channels', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM channels ORDER BY "createdAt" ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur API /channels:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des salons' });
  }
});

// Récupérer les messages d'un salon
app.get('/api/messages/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const result = await pool.query(
      `SELECT * FROM messages WHERE "channelId" = $1 ORDER BY "timestamp" ASC LIMIT 50`,
      [channelId]
    );
    res.json(result.rows);
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

    const posResult = await pool.query(
      `SELECT MAX(position) as maxPos FROM categories`
    );
    const position = (posResult.rows[0].maxpos || -1) + 1;

    const result = await pool.query(
      `INSERT INTO categories (name, position) VALUES ($1, $2) RETURNING *`,
      [name.trim(), position]
    );

    const category = result.rows[0];
    res.json({
      success: true,
      category: {
        id: category.id,
        name: category.name,
        position: category.position,
        channels: []
      }
    });
  } catch (err) {
    if (err.code === '23505') { // UNIQUE constraint
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

    const result = await pool.query(
      `UPDATE categories SET name = $1 WHERE id = $2 RETURNING *`,
      [name.trim(), categoryId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    const category = result.rows[0];
    io.emit('category_updated', { id: category.id, name: category.name });
    console.log(`✏️  Catégorie modifiée: ${name}`);

    res.json({ success: true, category });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Cette catégorie existe déjà' });
    }
    console.error('Erreur PUT /categories:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une catégorie
app.delete('/api/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;

    const catResult = await pool.query(
      `SELECT name FROM categories WHERE id = $1`,
      [categoryId]
    );

    if (catResult.rows.length === 0) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    const categoryName = catResult.rows[0].name;

    // Supprimer la catégorie (les salons seront mis à NULL via ON DELETE SET NULL)
    await pool.query(
      `DELETE FROM categories WHERE id = $1`,
      [categoryId]
    );

    io.emit('category_deleted', { categoryId, categoryName });
    console.log(`🗑️  Catégorie supprimée: ${categoryName}`);

    res.json({ success: true, message: 'Catégorie supprimée avec succès' });
  } catch (err) {
    console.error('Erreur DELETE /categories:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un salon
app.delete('/api/channels/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;

    const chanResult = await pool.query(
      `SELECT name FROM channels WHERE id = $1`,
      [channelId]
    );

    if (chanResult.rows.length === 0) {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }

    const channelName = chanResult.rows[0].name;

    // Supprimer le salon (les messages seront supprimés via ON DELETE CASCADE)
    await pool.query(
      `DELETE FROM channels WHERE id = $1`,
      [channelId]
    );

    io.emit('channel_deleted', { channelId, channelName });
    console.log(`🗑️  Salon supprimé: ${channelName}`);

    res.json({ success: true, message: 'Salon supprimé avec succès' });
  } catch (err) {
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

    const result = await pool.query(
      `UPDATE channels SET name = $1, description = $2 WHERE id = $3 RETURNING *`,
      [name.trim(), description || '', channelId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }

    const channel = result.rows[0];
    io.emit('channel_updated', channel);
    console.log(`✏️  Salon modifié: ${name}`);

    res.json({ success: true, channel });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ce nom de salon existe déjà' });
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
    const existingUser = await pool.query(
      `SELECT id FROM users WHERE username = $1`,
      [username.trim()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Ce pseudo est déjà pris' });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insérer l'utilisateur
    const result = await pool.query(
      `INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username`,
      [username.trim(), hashedPassword]
    );

    const user = result.rows[0];

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
    console.error('Erreur inscription:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Connexion
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Le pseudo est requis' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Le mot de passe est requis' });
    }

    // Récupérer l'utilisateur
    const result = await pool.query(
      `SELECT * FROM users WHERE username = $1`,
      [username.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect' });
    }

    const user = result.rows[0];

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
    console.error('Erreur connexion:', err);
    res.status(500).json({ error: 'Erreur serveur' });
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
    const result = await pool.query(
      `SELECT username, profile_image FROM users WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json(result.rows[0]);
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

    // Insérer ou mettre à jour l'utilisateur
    const result = await pool.query(
      `INSERT INTO users (username, profile_image) VALUES ($1, $2) 
       ON CONFLICT (username) DO UPDATE SET profile_image = EXCLUDED.profile_image
       RETURNING username, profile_image`,
      [username, imageData]
    );

    const user = result.rows[0];
    io.emit('user_profile_updated', { username: user.username, imageData: user.profile_image });
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

      // Insérer le message avec prepared statement
      const result = await pool.query(
        `INSERT INTO messages ("channelId", author, content) VALUES ($1, $2, $3) RETURNING *`,
        [channelId, author, content]
      );

      const message = result.rows[0];

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

      const result = await pool.query(
        `INSERT INTO channels (name, description, "categoryId") VALUES ($1, $2, $3) RETURNING *`,
        [channelName, 'Canal créé par un utilisateur', categoryId || null]
      );

      const channel = result.rows[0];
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

      const posResult = await pool.query(
        `SELECT MAX(position) as maxPos FROM categories`
      );
      const position = (posResult.rows[0].maxpos || -1) + 1;

      const result = await pool.query(
        `INSERT INTO categories (name, position) VALUES ($1, $2) RETURNING *`,
        [categoryName, position]
      );

      const category = result.rows[0];
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

      const result = await pool.query(
        `UPDATE categories SET name = $1 WHERE id = $2 RETURNING *`,
        [name.trim(), categoryId]
      );

      if (result.rows.length > 0) {
        const category = result.rows[0];
        io.emit('category_updated', { id: category.id, name: category.name });
        console.log(`✏️  Catégorie modifiée: ${name}`);
      }
    } catch (err) {
      console.error('Erreur update_category:', err);
      socket.emit('error', { message: 'Erreur lors de la modification' });
    }
  });

  // Supprimer une catégorie
  socket.on('delete_category', async (data) => {
    try {
      const { categoryId } = data;

      const catResult = await pool.query(
        `SELECT name FROM categories WHERE id = $1`,
        [categoryId]
      );

      if (catResult.rows.length === 0) {
        socket.emit('error', { message: 'Catégorie non trouvée' });
        return;
      }

      const categoryName = catResult.rows[0].name;

      await pool.query(
        `DELETE FROM categories WHERE id = $1`,
        [categoryId]
      );

      io.emit('category_deleted', { categoryId, categoryName });
      console.log(`🗑️  Catégorie supprimée: ${categoryName}`);
    } catch (err) {
      console.error('Erreur delete_category:', err);
      socket.emit('error', { message: 'Erreur lors de la suppression' });
    }
  });

  // Supprimer un canal
  socket.on('delete_channel', async (data) => {
    try {
      const { channelId } = data;

      const chanResult = await pool.query(
        `SELECT name FROM channels WHERE id = $1`,
        [channelId]
      );

      if (chanResult.rows.length === 0) {
        socket.emit('error', { message: 'Salon non trouvé' });
        return;
      }

      const channelName = chanResult.rows[0].name;

      await pool.query(
        `DELETE FROM channels WHERE id = $1`,
        [channelId]
      );

      io.emit('channel_deleted', { channelId, channelName });
      console.log(`🗑️  Salon supprimé: ${channelName}`);
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

      const result = await pool.query(
        `UPDATE channels SET name = $1, description = $2 WHERE id = $3 RETURNING *`,
        [name.trim(), description || '', channelId]
      );

      if (result.rows.length > 0) {
        const channel = result.rows[0];
        io.emit('channel_updated', channel);
        console.log(`✏️  Salon modifié: ${name}`);
      }
    } catch (err) {
      console.error('Erreur update_channel:', err);
      socket.emit('error', { message: 'Erreur lors de la modification' });
    }
  });

  // Déplacer un canal
  socket.on('move_channel', async (data) => {
    try {
      const { channelId, categoryId } = data;

      await pool.query(
        `UPDATE channels SET "categoryId" = $1 WHERE id = $2`,
        [categoryId, channelId]
      );

      io.emit('channel_moved', { channelId, categoryId });
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

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════╗
║   Discord Clone - Server Running   ║
║   🌐 http://localhost:${PORT}      ║
║   📊 Database: PostgreSQL/Supabase ║
║   🔒 SSL: Enabled                  ║
╚════════════════════════════════════╝
  `);
});

// Gestion des erreurs globales
process.on('unhandledRejection', (err) => {
  console.error('Erreur non gérée:', err);
});

process.on('SIGINT', () => {
  console.log('\n📴 Arrêt du serveur...');
  pool.end();
  process.exit(0);
});
