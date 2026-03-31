/**
 * Discord Clone - Backend Server
 * Tech: Express + Socket.io + Fichier JSON (LOCAL DEV)
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'discord_clone_secret_key_12345';
const DB_FILE = './db.json';

// 🗄️ DATABASE - Simple JSON file
let db = {
  categories: [],
  users: [],
  channels: [],
  messages: []
};

function initializeDatabase() {
  console.log('\n⏳ Initializing database...');
  
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    // Default data
    db.categories = [
      { id: 1, name: '📋 Texte', createdAt: new Date().toISOString() },
      { id: 2, name: '🎙️ Vocal', createdAt: new Date().toISOString() }
    ];
    
    db.channels = [
      { id: 1, name: 'general', description: 'Salon général pour discuter', categoryId: 1, createdAt: new Date().toISOString() },
      { id: 2, name: 'random', description: 'Messages aléatoires', categoryId: 1, createdAt: new Date().toISOString() },
      { id: 3, name: 'aide', description: 'Besoin d\'aide?', categoryId: 1, createdAt: new Date().toISOString() }
    ];
    
    db.users = [];
    db.messages = [];
    
    saveDatabase();
  }
  
  console.log('✅ Database initialized');
}

function saveDatabase() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getNextId(type) {
  if (db[type].length === 0) return 1;
  return Math.max(...db[type].map(item => item.id)) + 1;
}

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

initializeDatabase();

// ===========================
// 🌐 ROUTES EXPRESS
// ===========================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
});

app.get('/api/categories', (req, res) => {
  try {
    const categories = db.categories.map(cat => ({
      ...cat,
      channels: db.channels.filter(ch => ch.categoryId === cat.id)
    }));
    res.json(categories);
  } catch (err) {
    console.error('Erreur API /categories:', err.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des catégories' });
  }
});

app.get('/api/channels', (req, res) => {
  try {
    res.json(db.channels);
  } catch (err) {
    console.error('Erreur API /channels:', err.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des salons' });
  }
});

app.get('/api/messages/:channelId', (req, res) => {
  try {
    const { channelId } = req.params;
    const messages = db.messages
      .filter(m => m.channelId === parseInt(channelId))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-50);
    res.json(messages);
  } catch (err) {
    console.error('Erreur API /messages:', err.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des messages' });
  }
});

app.get('/api/users/:username', (req, res) => {
  try {
    const { username } = req.params;
    const user = db.users.find(u => u.username === username);
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (err) {
    console.error('Erreur API /users/:username:', err.message);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'utilisateur' });
  }
});

app.post('/api/categories', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Le nom de la catégorie est requis' });
    }

    const category = {
      id: getNextId('categories'),
      name: name.trim(),
      createdAt: new Date().toISOString()
    };
    
    db.categories.push(category);
    saveDatabase();

    res.json({ success: true, category: { ...category, channels: [] } });
  } catch (err) {
    console.error('Erreur POST /categories:', err.message);
    res.status(500).json({ error: 'Erreur lors de la création de la catégorie' });
  }
});

app.post('/api/channels', (req, res) => {
  try {
    const { name, description, categoryId } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Le nom du salon est requis' });
    }

    const channel = {
      id: getNextId('channels'),
      name: name.trim(),
      description: description || '',
      categoryId: categoryId || null,
      createdAt: new Date().toISOString()
    };
    
    db.channels.push(channel);
    saveDatabase();

    res.json({ success: true, channel });
  } catch (err) {
    console.error('Erreur POST /channels:', err.message);
    res.status(500).json({ error: 'Erreur lors de la création du salon' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password || username.trim() === '' || password.trim() === '') {
      return res.status(400).json({ error: 'Username et password sont requis' });
    }

    if (db.users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Cet utilisateur existe déjà' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: getNextId('users'),
      username,
      password: hashedPassword,
      profile_image: null,
      createdAt: new Date().toISOString()
    };
    
    db.users.push(user);
    saveDatabase();

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...userWithoutPassword } = user;

    res.json({ success: true, user: userWithoutPassword, token });
  } catch (err) {
    console.error('Erreur POST /auth/register:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username et password sont requis' });
    }

    const user = db.users.find(u => u.username === username);

    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

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

app.post('/api/auth/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = db.users.find(u => u.id === decoded.userId);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({ success: true, user: { id: user.id, username: user.username, profile_image: user.profile_image } });
  } catch (err) {
    console.error('Erreur POST /auth/verify:', err.message);
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.put('/api/users/:userId/profile', (req, res) => {
  try {
    const { userId } = req.params;
    const { profile_image } = req.body;

    const user = db.users.find(u => u.id === parseInt(userId));
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    user.profile_image = profile_image;
    saveDatabase();

    res.json({ success: true, user: { id: user.id, username: user.username, profile_image: user.profile_image } });
  } catch (err) {
    console.error('Erreur PUT /users/:userId/profile:', err.message);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du profil' });
  }
});

// ===========================
// 💬 SOCKET.IO - Temps réel
// ===========================

io.on('connection', (socket) => {
  console.log('✅ Socket connected:', socket.id);

  socket.on('message', (data) => {
    try {
      const { channelId, author, content } = data;

      const message = {
        id: getNextId('messages'),
        channelId,
        author,
        content,
        timestamp: new Date().toISOString()
      };

      db.messages.push(message);
      saveDatabase();

      io.emit('newMessage', message);
    } catch (err) {
      console.error('❌ Socket message error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected:', socket.id);
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
║   📊 Database: JSON (Local Dev)    ║
║   ✅ Ready!                        ║
╚════════════════════════════════════╝
  `);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});
