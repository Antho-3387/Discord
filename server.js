/**
 * Discord Clone - Backend Server
 * Tech: Express + Socket.io + PostgreSQL (pg driver)
 */

require('dotenv').config();

// 🔍 ENV CHECK
console.log('\n📌 Checking configuration...');
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL not set in .env');
  process.exit(1);
}
console.log('✅ DATABASE_URL loaded');

const JWT_SECRET = process.env.JWT_SECRET || 'discord_clone_secret_key_12345';

// 📦 IMPORTS
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// 🗄️ POSTGRESQL POOL
console.log('\n📌 Creating PostgreSQL Pool...');

let dbUrl = process.env.DATABASE_URL;
// Ne pas modifier les URLs pooling (elles ont déjà pgbouncer=true)
if (!dbUrl.includes('pgbouncer') && !dbUrl.includes('sslmode=')) {
  dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'sslmode=require';
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('❌ Pool error:', err.message);
});

console.log('✅ PostgreSQL Pool created');


// 🎨 EXPRESS + SOCKET.IO
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 50 * 1024 * 1024
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'Public')));

// 🗄️ DATABASE INITIALIZATION
async function initializeDatabase() {
  try {
    console.log('\n⏳ Initializing database...');
    
    // Drop and recreate (fresh start)
    await pool.query(`
      DROP TABLE IF EXISTS messages CASCADE;
      DROP TABLE IF EXISTS channels CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS categories CASCADE;
    `);
    
    await pool.query(`
      CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        profile_image TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE channels (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        "categoryId" INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE messages (
        id SERIAL PRIMARY KEY,
        "channelId" INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_messages_channelId ON messages("channelId");
      CREATE INDEX idx_channels_categoryId ON channels("categoryId");
      CREATE INDEX idx_users_username ON users(username);
    `);

    // Insert defaults if empty
    const catCount = await pool.query(`SELECT COUNT(*) FROM categories`);
    if (catCount.rows[0].count === '0') {
      await pool.query(`
        INSERT INTO categories (name) VALUES ('📋 Texte'), ('🎙️ Vocal');
      `);
      await pool.query(`
        INSERT INTO channels (name, description, "categoryId")
        VALUES ('general', 'Salon général', 1), ('random', 'Aléatoire', 1), ('aide', 'Aide', 1);
      `);
    }

    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
    throw err;
  }
}

// 🌐 API ROUTES

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await pool.query(`
      SELECT c.*,
        json_agg(json_build_object('id', ch.id, 'name', ch.name, 'description', ch.description)) FILTER (WHERE ch.id IS NOT NULL) as channels
      FROM categories c
      LEFT JOIN channels ch ON c.id = ch."categoryId"
      GROUP BY c.id
      ORDER BY c.id ASC
    `);
    res.json(categories.rows.map(cat => ({ ...cat, channels: cat.channels || [] })));
  } catch (err) {
    console.error('❌ GET /categories error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/channels', async (req, res) => {
  try {
    const channels = await pool.query(`SELECT * FROM channels ORDER BY "createdAt" ASC`);
    res.json(channels.rows);
  } catch (err) {
    console.error('❌ GET /channels error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages/:channelId', async (req, res) => {
  try {
    const messages = await pool.query(
      `SELECT * FROM messages WHERE "channelId" = $1 ORDER BY "timestamp" ASC LIMIT 50`,
      [parseInt(req.params.channelId)]
    );
    res.json(messages.rows);
  } catch (err) {
    console.error('❌ GET /messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const result = await pool.query(
      `INSERT INTO categories (name) VALUES ($1) RETURNING *`,
      [name]
    );
    res.json({ success: true, category: { ...result.rows[0], channels: [] } });
  } catch (err) {
    console.error('❌ POST /categories error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/channels', async (req, res) => {
  try {
    const { name, description, categoryId } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const result = await pool.query(
      `INSERT INTO channels (name, description, "categoryId") VALUES ($1, $2, $3) RETURNING *`,
      [name, description || '', categoryId || null]
    );
    res.json({ success: true, channel: result.rows[0] });
  } catch (err) {
    console.error('❌ POST /channels error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const userExists = await pool.query(`SELECT id FROM users WHERE username = $1`, [username]);
    if (userExists.rows.length > 0) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username`,
      [username, hashedPassword]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ success: true, user, token });
  } catch (err) {
    console.error('❌ POST /auth/register error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const result = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, user: { id: user.id, username: user.username }, token });
  } catch (err) {
    console.error('❌ POST /auth/login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/verify', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, user: decoded });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// 💬 SOCKET.IO
io.on('connection', (socket) => {
  console.log('✅ Socket connected:', socket.id);

  socket.on('message', async (data) => {
    try {
      const { channelId, author, content } = data;
      await pool.query(
        `INSERT INTO messages ("channelId", author, content) VALUES ($1, $2, $3)`,
        [channelId, author, content]
      );
      io.emit('newMessage', { channelId, author, content, timestamp: new Date() });
    } catch (err) {
      console.error('❌ Socket message error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected:', socket.id);
  });
});

// 🚀 START SERVER
async function start() {
  try {
    await initializeDatabase();
    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════╗
║   Discord Clone - Server Running   ║
║   🌐 http://localhost:${PORT}      ║
║   📊 PostgreSQL/Supabase (pg)      ║
║   ✅ READY !                       ║
╚════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error('❌ Start error:', err);
    process.exit(1);
  }
}

start();

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await pool.end();
  process.exit(0);
});
