/**
 * Discord Clone - Backend Server
 * Serveur Express + Socket.io + PostgreSQL (Supabase) - Direct pg driver
 */

// 1️⃣ LOAD .env FIRST
require('dotenv').config();

// DEBUG
console.log('🔍 DATABASE_URL existe:', !!process.env.DATABASE_URL);
console.log('🔍 JWT_SECRET existe:', !!process.env.JWT_SECRET);

// 2️⃣ CHECK DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('❌ ERREUR: DATABASE_URL non définie!');
  process.exit(1);
}

console.log('✅ DATABASE_URL chargée:', process.env.DATABASE_URL.substring(0, 50) + '...');

// 3️⃣ IMPORTS
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// 4️⃣ POOL PostgreSQL CONNECTION
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('❌ Pool error:', err);
});

console.log('✅ PostgreSQL Pool créé avec succès');

// 5️⃣ EXPRESS SETUP
const JWT_SECRET = process.env.JWT_SECRET || 'discord_clone_secret_key';

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 50 * 1024 * 1024
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'Public')));

// 6️⃣ INITIALISER LA DATABASE
async function initializeDatabase() {
  try {
    console.log('⏳ Vérification de la base de données...');
    
    // Créer les tables si elles n'existent pas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        position INTEGER DEFAULT 0,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT,
        profile_image TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS channels (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        "categoryId" INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        "channelId" INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_messages_channelId ON messages("channelId");
      CREATE INDEX IF NOT EXISTS idx_channels_categoryId ON channels("categoryId");
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    // Insérer les données par défaut
    const categoryCheck = await pool.query(`SELECT COUNT(*) FROM categories`);
    if (categoryCheck.rows[0].count === '0') {
      await pool.query(`
        INSERT INTO categories (name, position) VALUES ('📋 Texte', 0), ('🎙️ Vocal', 1);
      `);
      
      await pool.query(`
        INSERT INTO channels (name, description, "categoryId") 
        VALUES 
          ('general', 'Salon général pour discuter', 1),
          ('random', 'Messages aléatoires', 1),
          ('aide', 'Besoin d''aide?', 1);
      `);
    }

    console.log('✅ Base de données initialisée');
  } catch (err) {
    console.warn('⚠️ Erreur lors de l\'initialisation:', err.message);
  }
}

initializeDatabase();

// ===========================
// 🌐 ROUTES EXPRESS
// ===========================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Health check - DB error:', err.message);
    res.status(503).json({ status: 'degraded', database: 'disconnected', error: err.message });
  }
});

// GET /api/categories - Récupérer toutes les catégories avec leurs salons
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await pool.query(`
      SELECT c.*, 
        json_agg(json_build_object('id', ch.id, 'name', ch.name, 'description', ch.description, 'categoryId', ch."categoryId", 'createdAt', ch."createdAt")) FILTER (WHERE ch.id IS NOT NULL) as channels
      FROM categories c
      LEFT JOIN channels ch ON c.id = ch."categoryId"
      GROUP BY c.id
      ORDER BY c.position ASC
    `);
    
    const result = categories.rows.map(cat => ({
      ...cat,
      channels: cat.channels || []
    }));
    
    res.json(result);
  } catch (err) {
    console.error('Erreur API /categories:', err.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des catégories' });
  }
});

// GET /api/channels - Récupérer tous les salons
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await pool.query(`SELECT * FROM channels ORDER BY "createdAt" ASC`);
    res.json(channels.rows);
  } catch (err) {
    console.error('Erreur API /channels:', err.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des salons' });
  }
});

// GET /api/messages/:channelId - Récupérer les messages d'un salon
app.get('/api/messages/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const messages = await pool.query(
      `SELECT * FROM messages WHERE "channelId" = $1 ORDER BY "timestamp" ASC LIMIT 50`,
      [parseInt(channelId)]
    );
    res.json(messages.rows);
  } catch (err) {
    console.error('Erreur API /messages:', err.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des messages' });
  }
});

// POST /api/categories - Créer une catégorie
app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Le nom de la catégorie est requis' });
    }

    const maxPos = await pool.query(`SELECT MAX(position) as max_pos FROM categories`);
    const position = (maxPos.rows[0].max_pos || -1) + 1;

    const result = await pool.query(
      `INSERT INTO categories (name, position) VALUES ($1, $2) RETURNING *`,
      [name.trim(), position]
    );

    res.json({ success: true, category: { ...result.rows[0], channels: [] } });
  } catch (err) {
    console.error('Erreur POST /categories:', err.message);
    res.status(500).json({ error: 'Erreur lors de la création de la catégorie' });
  }
});

// POST /api/channels - Créer un salon
app.post('/api/channels', async (req, res) => {
  try {
    const { name, description, categoryId } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Le nom du salon est requis' });
    }

    const result = await pool.query(
      `INSERT INTO channels (name, description, "categoryId") VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), description || '', categoryId || null]
    );

    res.json({ success: true, channel: result.rows[0] });
  } catch (err) {
    console.error('Erreur POST /channels:', err.message);
    res.status(500).json({ error: 'Erreur lors de la création du salon' });
  }
});

// PUT /api/channels/:channelId - Modifier un salon
app.put('/api/channels/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Le nom du salon est requis' });
    }

    const result = await pool.query(
      `UPDATE channels SET name = $1, description = $2 WHERE id = $3 RETURNING *`,
      [name.trim(), description || '', parseInt(channelId)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }

    io.emit('channel_updated', result.rows[0]);
    res.json({ success: true, channel: result.rows[0] });
  } catch (err) {
    console.error('Erreur PUT /channels:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/channels/:channelId - Supprimer un salon
app.delete('/api/channels/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;

    const channel = await pool.query(
      `SELECT * FROM channels WHERE id = $1`,
      [parseInt(channelId)]
    );

    if (channel.rows.length === 0) {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }

    const channelName = channel.rows[0].name;

    await pool.query(
      `DELETE FROM channels WHERE id = $1`,
      [parseInt(channelId)]
    );

    io.emit('channel_deleted', { channelId: parseInt(channelId), channelName });
    res.json({ success: true, message: 'Salon supprimé avec succès' });
  } catch (err) {
    console.error('Erreur DELETE /channels:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/categories/:categoryId - Modifier une catégorie
app.put('/api/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Le nom de la catégorie est requis' });
    }

    const result = await pool.query(
      `UPDATE categories SET name = $1 WHERE id = $2 RETURNING *`,
      [name.trim(), parseInt(categoryId)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    io.emit('category_updated', result.rows[0]);
    res.json({ success: true, category: result.rows[0] });
  } catch (err) {
    console.error('Erreur PUT /categories:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/categories/:categoryId - Supprimer une catégorie
app.delete('/api/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await pool.query(
      `SELECT * FROM categories WHERE id = $1`,
      [parseInt(categoryId)]
    );

    if (category.rows.length === 0) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    const categoryName = category.rows[0].name;

    await pool.query(
      `DELETE FROM categories WHERE id = $1`,
      [parseInt(categoryId)]
    );

    io.emit('category_deleted', { categoryId: parseInt(categoryId), categoryName });
    res.json({ success: true, message: 'Catégorie supprimée avec succès' });
  } catch (err) {
    console.error('Erreur DELETE /categories:', err.message);
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

// POST /api/auth/register - Inscription
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password || username.trim() === '' || password.trim() === '') {
      return res.status(400).json({ error: 'Username et password sont requis' });
    }

    // Vérifier si l'utilisateur existe déjà
    const userExists = await pool.query(
      `SELECT id FROM users WHERE username = $1`,
      [username]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Cet utilisateur existe déjà' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username, "createdAt"`,
      [username, hashedPassword]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    console.log(`✅ Nouvel utilisateur inscrit: ${username}`);
    res.json({ success: true, user, token });
  } catch (err) {
    console.error('Erreur POST /auth/register:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

// POST /api/auth/login - Connexion
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username et password sont requis' });
    }

    const result = await pool.query(
      `SELECT * FROM users WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    console.log(`✅ Connexion réussie: ${username}`);
    res.json({ 
      success: true, 
      user: { id: user.id, username: user.username, profile_image: user.profile_image },
      token 
    });
  } catch (err) {
    console.error('Erreur POST /auth/login:', err.message);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

// GET /api/auth/verify - Vérifier le token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ success: true, username: req.user.username });
});

// ===========================
// 💬 SOCKET.IO - Messages en temps réel
// ===========================

io.on('connection', (socket) => {
  console.log('✅ Utilisateur connecté:', socket.id);

  socket.on('message', async (data) => {
    try {
      const { channelId, author, content } = data;

      // Sauvegarder le message
      await pool.query(
        `INSERT INTO messages ("channelId", author, content) VALUES ($1, $2, $3)`,
        [channelId, author, content]
      );

      // Envoyer à tous les clients
      io.emit('newMessage', { channelId, author, content, timestamp: new Date() });
    } catch (err) {
      console.error('Erreur socket message:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Utilisateur déconnecté:', socket.id);
  });
});

// ===========================
// 🚀 DÉMARRER LE SERVEUR
// ===========================

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║   Discord Clone - Server Running   ║
║   🌐 http://localhost:${PORT}      ║
║   📊 Database: PostgreSQL/Supabase ║
║   🔒 Direct Driver (pg)            ║
║   🔐 SSL: Enabled                  ║
╚════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Arrêt du serveur...');
  await pool.end();
  process.exit(0);
});
