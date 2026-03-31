/**
 * Discord Clone - Backend Server V2
 * Version ultra-robuste avec logs détaillés
 */

require('dotenv').config();

console.log('\n🚀 ========== STARTUP LOGS ==========');
console.log('Node Version:', process.version);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('PORT:', process.env.PORT || 8080);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);

// CHECK REQUIRED VARS
if (!process.env.DATABASE_URL) {
  console.error('❌ FATAL: DATABASE_URL not defined!');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.warn('⚠️ WARNING: JWT_SECRET not defined, using default');
}

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_key_change_me';

// ===== POOL SETUP =====
console.log('\n📌 Creating PostgreSQL Pool...');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  query_timeout: 5000,
});

pool.on('error', (err) => {
  console.error('❌ POOL ERROR:', err);
});

pool.on('connect', () => {
  console.log('✅ New connection established');
});

console.log('✅ PostgreSQL Pool created');

// ===== EXPRESS SETUP =====
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 50 * 1024 * 1024,
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'Public')));

// ===== UTILITY FUNCTIONS =====
async function testDatabaseConnection() {
  try {
    console.log('\n🔍 Testing database connection...');
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Database connection OK - Current time:', result.rows[0].current_time);
    return true;
  } catch (err) {
    console.error('❌ Database connection FAILED:', err.message);
    return false;
  }
}

async function checkTableExists(tableName) {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = $1
      );
    `, [tableName]);
    return result.rows[0].exists;
  } catch (err) {
    console.error(`❌ Error checking table ${tableName}:`, err.message);
    return false;
  }
}

async function initializeDatabase() {
  try {
    console.log('\n⏳ Initializing database...');
    
    // Test connection first
    const connected = await testDatabaseConnection();
    if (!connected) {
      console.error('❌ Cannot initialize - no database connection');
      return false;
    }

    // Create tables
    console.log('📝 Creating tables if not exist...');
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
    console.log('✅ Tables created');

    // Check and insert default data
    console.log('📝 Checking categories...');
    const categoryCount = await pool.query('SELECT COUNT(*) FROM categories');
    console.log(`   Found ${categoryCount.rows[0].count} categories`);

    if (categoryCount.rows[0].count === '0') {
      console.log('📝 Inserting default categories...');
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
      console.log('✅ Default data inserted');
    } else {
      console.log('✅ Default data already exists');
    }

    console.log('✅ Database initialization complete');
    return true;
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    console.error('Stack:', err.stack);
    return false;
  }
}

// ===== ROUTES =====

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// HEALTH CHECK
app.get('/api/health', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT NOW()');
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    
    res.json({
      status: 'ok',
      database: 'connected',
      db_time: dbTest.rows[0],
      users_count: userCount.rows[0].count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Health check error:', err.message);
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await pool.query(`
      SELECT c.*, 
        json_agg(json_build_object('id', ch.id, 'name', ch.name, 'description', ch.description)) FILTER (WHERE ch.id IS NOT NULL) as channels
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
    console.error('GET /categories error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/channels
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await pool.query(`SELECT * FROM channels ORDER BY "createdAt" ASC`);
    res.json(channels.rows);
  } catch (err) {
    console.error('GET /channels error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/:channelId
app.get('/api/messages/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const messages = await pool.query(
      `SELECT * FROM messages WHERE "channelId" = $1 ORDER BY "timestamp" ASC LIMIT 50`,
      [parseInt(channelId)]
    );
    res.json(messages.rows);
  } catch (err) {
    console.error('GET /messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categories
app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Category name required' });
    }

    const maxPos = await pool.query(`SELECT MAX(position) as max_pos FROM categories`);
    const position = (maxPos.rows[0].max_pos || -1) + 1;

    const result = await pool.query(
      `INSERT INTO categories (name, position) VALUES ($1, $2) RETURNING *`,
      [name.trim(), position]
    );

    res.json({ success: true, category: { ...result.rows[0], channels: [] } });
  } catch (err) {
    console.error('POST /categories error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/channels
app.post('/api/channels', async (req, res) => {
  try {
    const { name, description, categoryId } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Channel name required' });
    }

    const result = await pool.query(
      `INSERT INTO channels (name, description, "categoryId") VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), description || '', categoryId || null]
    );

    res.json({ success: true, channel: result.rows[0] });
  } catch (err) {
    console.error('POST /channels error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('📝 Register request:', { username: req.body.username });
    const { username, password } = req.body;
    
    if (!username || !password || username.trim() === '' || password.trim() === '') {
      console.log('❌ Register validation failed');
      return res.status(400).json({ error: 'Username and password required' });
    }

    console.log('🔍 Checking if user exists:', username);
    const userExists = await pool.query(
      `SELECT id FROM users WHERE username = $1`,
      [username]
    );

    if (userExists.rows.length > 0) {
      console.log('❌ User already exists:', username);
      return res.status(400).json({ error: 'User already exists' });
    }

    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    console.log('💾 Inserting user to database...');
    const result = await pool.query(
      `INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username, "createdAt"`,
      [username, hashedPassword]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    console.log('✅ User registered successfully:', username);
    res.json({ success: true, user, token });
  } catch (err) {
    console.error('❌ POST /auth/register error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: 'Registration error: ' + err.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('📝 Login request:', { username: req.body.username });
    const { username, password } = req.body;
    
    if (!username || !password) {
      console.log('❌ Login validation failed');
      return res.status(400).json({ error: 'Username and password required' });
    }

    console.log('🔍 Querying user from database:', username);
    const result = await pool.query(
      `SELECT * FROM users WHERE username = $1`,
      [username]
    );
    console.log('Query result rows:', result.rows.length);

    if (result.rows.length === 0) {
      console.log('❌ User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    console.log('🔐 Comparing passwords...');
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      console.log('❌ Invalid password for user:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    console.log('✅ Login successful:', username);
    res.json({ 
      success: true, 
      user: { id: user.id, username: user.username, profile_image: user.profile_image },
      token 
    });
  } catch (err) {
    console.error('❌ POST /auth/login error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: 'Login error: ' + err.message });
  }
});

// ===== SOCKET.IO =====
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
      console.error('Socket message error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected:', socket.id);
  });
});

// ===== START SERVER =====
async function startServer() {
  try {
    console.log('\n🚀 Starting server...');
    
    // Initialize database
    const dbOk = await initializeDatabase();
    if (!dbOk) {
      console.warn('⚠️ Database initialization had issues, but continuing...');
    }

    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════╗
║   Discord Clone - Server Running   ║
║   🌐 http://localhost:${PORT}      ║
║   📊 Database: PostgreSQL/Supabase ║
║   🔒 Direct pg Driver              ║
║   ✅ Ready!                        ║
╚════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error('❌ Server startup error:', err);
    process.exit(1);
  }
}

startServer();

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await pool.end();
  process.exit(0);
});
