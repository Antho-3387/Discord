/**
 * Discord Clone - Backend Server
 * Serveur Express + Socket.io + SQLite
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Clé secrète pour les tokens JWT
const JWT_SECRET = 'discord_clone_secret_key_' + Date.now();

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
// 🗄️  BASE DE DONNÉES SQLite
// ===========================

// Initialiser la base de données
const db = new sqlite3.Database('./discord.db', (err) => {
  if (err) {
    console.error('Erreur connexion DB:', err);
  } else {
    console.log('✅ Connecté à SQLite');
    db.configure('busyTimeout', 5000);
    db.serialize(() => {
      initializeDatabase();
    });
  }
});

// Initialiser les tables
function initializeDatabase() {
  // Table des catégories
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      position INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Table des utilisateurs
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      profile_image TEXT DEFAULT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Erreur création users:', err);
    } else {
      // Migrations: ajouter les colonnes manquantes
      db.run(`ALTER TABLE users ADD COLUMN profile_image TEXT DEFAULT NULL`, (migErr) => {
        if (!migErr) console.log('✅ Colonne profile_image ajoutée');
      });
      db.run(`ALTER TABLE users ADD COLUMN password TEXT DEFAULT NULL`, (migErr) => {
        if (!migErr) console.log('✅ Colonne password ajoutée');
      });
    }
  });

  // Table des salons (channels)
  db.run(`
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      categoryId INTEGER DEFAULT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (categoryId) REFERENCES categories(id)
    )
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Erreur création channels:', err);
    }
    // Ajouter la colonne categoryId si elle n'existe pas
    db.run(`
      ALTER TABLE channels ADD COLUMN categoryId INTEGER DEFAULT NULL
    `, (migErr) => {
      if (migErr && migErr.message.includes('duplicate column')) {
        console.log('✅ Colonne categoryId déjà présente');
      }
    });
  });

  // Table des messages
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channelId INTEGER NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channelId) REFERENCES channels(id)
    )
  `);

  // Insérer les catégories par défaut
  db.run("INSERT OR IGNORE INTO categories (name, position) VALUES (?, ?)", 
    ['📋 Texte', 0]
  );
  db.run("INSERT OR IGNORE INTO categories (name, position) VALUES (?, ?)", 
    ['🎙️ Vocal', 1]
  );

  // Insérer des salons par défaut avec catégories
  db.get("SELECT id FROM categories WHERE name = '📋 Texte'", (err, textCat) => {
    if (textCat) {
      db.run("INSERT OR IGNORE INTO channels (name, description, categoryId) VALUES (?, ?, ?)", 
        ['general', 'Salon général pour discuter', textCat.id]
      );
      db.run("INSERT OR IGNORE INTO channels (name, description, categoryId) VALUES (?, ?, ?)", 
        ['random', 'Messages aléatoires', textCat.id]
      );
      db.run("INSERT OR IGNORE INTO channels (name, description, categoryId) VALUES (?, ?, ?)", 
        ['aide', 'Besoin d\'aide?', textCat.id]
      );
    }
  });

  console.log('✅ Tables initialisées');
}

// ===========================
// 🌐 ROUTES EXPRESS
// ===========================

// Route racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// Récupérer toutes les catégories avec leurs salons
app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM categories ORDER BY position', (err, categories) => {
    if (err) {
      res.status(500).json({ error: 'Erreur lors de la récupération des catégories' });
      return;
    }

    // Pour chaque catégorie, récupérer ses salons
    const result = [];
    let processed = 0;

    if (categories.length === 0) {
      res.json([]);
      return;
    }

    categories.forEach(category => {
      db.all('SELECT * FROM channels WHERE categoryId = ? ORDER BY createdAt', [category.id], (chanErr, channels) => {
        result.push({
          ...category,
          channels: channels || []
        });
        processed++;

        if (processed === categories.length) {
          res.json(result);
        }
      });
    });
  });
});

// Récupérer tous les salons (sans catégories, pour la compatibilité)
app.get('/api/channels', (req, res) => {
  db.all('SELECT * FROM channels ORDER BY createdAt', (err, channels) => {
    if (err) {
      res.status(500).json({ error: 'Erreur lors de la récupération des salons' });
    } else {
      res.json(channels);
    }
  });
});

// Récupérer les messages d'un salon
app.get('/api/messages/:channelId', (req, res) => {
  const { channelId } = req.params;
  db.all(
    'SELECT * FROM messages WHERE channelId = ? ORDER BY timestamp ASC',
    [channelId],
    (err, messages) => {
      if (err) {
        res.status(500).json({ error: 'Erreur lors de la récupération des messages' });
      } else {
        res.json(messages);
      }
    }
  );
});

// Créer une nouvelle catégorie
app.post('/api/categories', (req, res) => {
  const { name } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Le nom de la catégorie est requis' });
  }

  // Obtenir le plus grand position actuel
  db.get('SELECT MAX(position) as maxPos FROM categories', (err, row) => {
    const position = (row?.maxPos ?? -1) + 1;
    
    db.run(
      'INSERT INTO categories (name, position) VALUES (?, ?)',
      [name.trim(), position],
      function(err) {
        if (err) {
          res.status(400).json({ error: 'Cette catégorie existe déjà' });
        } else {
          res.json({ 
            success: true, 
            category: {
              id: this.lastID,
              name: name.trim(),
              position: position,
              channels: []
            }
          });
        }
      }
    );
  });
});

// Modifier une catégorie
app.put('/api/categories/:categoryId', (req, res) => {
  const { categoryId } = req.params;
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Le nom de la catégorie est requis' });
  }

  db.run(
    'UPDATE categories SET name = ? WHERE id = ?',
    [name.trim(), categoryId],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          res.status(400).json({ error: 'Cette catégorie existe déjà' });
        } else {
          res.status(500).json({ error: 'Erreur lors de la modification' });
        }
      } else {
        const updatedCategory = {
          id: categoryId,
          name: name.trim()
        };

        // Notifier tous les clients
        io.emit('category_updated', updatedCategory);
        console.log(`✏️  Catégorie modifiée: ${name}`);

        res.json({ success: true, category: updatedCategory });
      }
    }
  );
});

// Supprimer une catégorie
app.delete('/api/categories/:categoryId', (req, res) => {
  const { categoryId } = req.params;

  db.get('SELECT name FROM categories WHERE id = ?', [categoryId], (err, category) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la suppression' });
    }

    if (!category) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    // Supprimer d'abord tous les salons de la catégorie (ou les mettre en null)
    db.run('UPDATE channels SET categoryId = NULL WHERE categoryId = ?', [categoryId], (updateErr) => {
      if (updateErr) {
        return res.status(500).json({ error: 'Erreur lors de la mise à jour des salons' });
      }

      // Puis supprimer la catégorie
      db.run('DELETE FROM categories WHERE id = ?', [categoryId], (deleteCategoryErr) => {
        if (deleteCategoryErr) {
          return res.status(500).json({ error: 'Erreur lors de la suppression de la catégorie' });
        }

        // Notifier tous les clients via Socket.io
        io.emit('category_deleted', { categoryId, categoryName: category.name });
        console.log(`🗑️  Catégorie supprimée: ${category.name}`);
        
        res.json({ success: true, message: 'Catégorie supprimée avec succès' });
      });
    });
  });
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

  try {
    // Vérifier si l'utilisateur existe déjà
    db.get('SELECT id FROM users WHERE username = ?', [username.trim()], async (err, existingUser) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
      }
      if (existingUser) {
        return res.status(409).json({ error: 'Ce pseudo est déjà pris' });
      }

      // Hasher le mot de passe
      const hashedPassword = await bcrypt.hash(password, 10);

      db.run(
        'INSERT INTO users (username, password) VALUES (?, ?)',
        [username.trim(), hashedPassword],
        function(insertErr) {
          if (insertErr) {
            console.error('Erreur inscription:', insertErr);
            return res.status(500).json({ error: 'Erreur lors de l\'inscription' });
          }

          // Générer un token JWT
          const token = jwt.sign(
            { id: this.lastID, username: username.trim() },
            JWT_SECRET,
            { expiresIn: '7d' }
          );

          console.log(`✅ Nouvel utilisateur inscrit: ${username.trim()}`);
          res.json({
            success: true,
            username: username.trim(),
            token
          });
        }
      );
    });
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Connexion
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Le pseudo est requis' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Le mot de passe est requis' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username.trim()], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect' });
    }

    // Si l'utilisateur n'a pas de mot de passe (ancien compte), lui en attribuer un
    if (!user.password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);
      console.log(`🔄 Mot de passe défini pour ancien compte: ${username.trim()}`);
    } else {
      // Vérifier le mot de passe
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect' });
      }
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
  });
});

// Vérifier le token (auto-login)
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ success: true, username: req.user.username });
});

// Route legacy pour compatibilité (redirige vers login)
app.post('/api/users', (req, res) => {
  res.status(410).json({ error: 'Utilisez /api/auth/register ou /api/auth/login' });
});

// Récupérer le profil d'un utilisateur
app.get('/api/users/:username', (req, res) => {
  const { username } = req.params;
  
  db.get(
    'SELECT username, profile_image FROM users WHERE username = ?',
    [username],
    (err, user) => {
      if (err) {
        res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
      } else if (!user) {
        res.status(404).json({ error: 'Utilisateur non trouvé' });
      } else {
        res.json(user);
      }
    }
  );
});

// Uploader l'image de profil
app.post('/api/users/:username/profile-image', (req, res) => {
  const { username } = req.params;
  const { imageData } = req.body;

  if (!imageData) {
    return res.status(400).json({ error: 'Image requise' });
  }

  // Limiter la taille à 2MB en base64 (après compression côté client)
  if (imageData.length > 2097152) {
    console.error(`❌ Image trop grande: ${(imageData.length / 1024 / 1024).toFixed(2)}MB`);
    return res.status(400).json({ error: 'Image trop grande (max 2MB)' });
  }

  // D'abord, s'assurer que l'utilisateur existe
  db.run(
    'INSERT OR IGNORE INTO users (username) VALUES (?)',
    [username],
    (insertErr) => {
      if (insertErr) {
        console.error('Erreur insertion utilisateur:', insertErr);
        return res.status(500).json({ error: 'Erreur création utilisateur' });
      }

      // Ensuite, mettre à jour l'image de profil
      db.run(
        'UPDATE users SET profile_image = ? WHERE username = ?',
        [imageData, username],
        function(err) {
          if (err) {
            console.error('Erreur update profil:', err);
            res.status(500).json({ error: 'Erreur lors de la sauvegarde: ' + err.message });
          } else {
            // Notifier tous les clients via Socket.io
            io.emit('user_profile_updated', { username, imageData });
            console.log(`🖼️  Image de profil mise à jour pour: ${username}`);
            
            res.json({ success: true, message: 'Image de profil mise à jour' });
          }
        }
      );
    }
  );
});

// Supprimer un salon
app.delete('/api/channels/:channelId', (req, res) => {
  const { channelId } = req.params;

  // Empêcher la suppression des salons par défaut
  db.get('SELECT name FROM channels WHERE id = ?', [channelId], (err, channel) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la suppression' });
    }

    if (!channel) {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }

    // Supprimer d'abord tous les messages du salon
    db.run('DELETE FROM messages WHERE channelId = ?', [channelId], (deleteMessagesErr) => {
      if (deleteMessagesErr) {
        return res.status(500).json({ error: 'Erreur lors de la suppression des messages' });
      }

      // Puis supprimer le salon
      db.run('DELETE FROM channels WHERE id = ?', [channelId], (deleteSalonErr) => {
        if (deleteSalonErr) {
          return res.status(500).json({ error: 'Erreur lors de la suppression du salon' });
        }

        // Notifier tous les clients via Socket.io
        io.emit('channel_deleted', { channelId, channelName: channel.name });
        console.log(`🗑️  Salon supprimé: ${channel.name}`);
        
        res.json({ success: true, message: 'Salon supprimé avec succès' });
      });
    });
  });
});

// Modifier un salon
app.put('/api/channels/:channelId', (req, res) => {
  const { channelId } = req.params;
  const { name, description } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Le nom du salon est requis' });
  }

  db.run(
    'UPDATE channels SET name = ?, description = ? WHERE id = ?',
    [name.trim(), description || '', channelId],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Ce nom de salon existe déjà' });
        }
        return res.status(500).json({ error: 'Erreur lors de la modification' });
      }

      const updatedChannel = {
        id: channelId,
        name: name.trim(),
        description: description || ''
      };

      // Notifier tous les clients
      io.emit('channel_updated', updatedChannel);
      console.log(`✏️  Salon modifié: ${name}`);

      res.json({ success: true, channel: updatedChannel });
    }
  );
});

// ===========================
// 🔌 SOCKET.IO - Événements temps réel
// ===========================

// Stocker les utilisateurs connectés avec leurs informations
const connectedUsers = {};
const channelUsers = {}; // Utilisateurs par canal: { channelId: [username1, username2] }
const typingUsers = {}; // Utilisateurs en train de taper: { channelId: [username1] }

io.on('connection', (socket) => {
  console.log('👤 Nouvel utilisateur connecté:', socket.id);

  // Un utilisateur rejoint
  socket.on('user_joined', (data) => {
    const { username, channelId } = data;
    
    // Enregistrer l'utilisateur
    connectedUsers[socket.id] = {
      username,
      channelId,
      socketId: socket.id
    };

    // Ajouter l'utilisateur à la liste du canal
    if (!channelUsers[channelId]) {
      channelUsers[channelId] = [];
    }
    if (!channelUsers[channelId].includes(username)) {
      channelUsers[channelId].push(username);
    }

    // Rejoindre la room du canal
    socket.join(`channel_${channelId}`);

    console.log(`📍 ${username} a rejoint le canal ${channelId}`);
    console.log(`👥 Utilisateurs en ligne: ${channelUsers[channelId].join(', ')}`);

    // Notifier les autres utilisateurs
    io.to(`channel_${channelId}`).emit('user_joined', {
      username,
      message: `${username} a rejoint le salon`
    });

    // Envoyer la liste des utilisateurs à jour
    io.to(`channel_${channelId}`).emit('users_update', {
      channelId,
      users: channelUsers[channelId]
    });
  });

  // Envoyer un message
  socket.on('send_message', (data) => {
    const { author, content, channelId, isImage } = data;

    // Vérifier que le contenu n'est pas vide
    if (!content || content.trim() === '') {
      console.warn('⚠️ Message vide reçu');
      return;
    }

    // Vérifier le nombre de messages dans le canal
    db.get(
      'SELECT COUNT(*) as count FROM messages WHERE channelId = ?',
      [channelId],
      function(err, row) {
        if (err) {
          console.error('Erreur vérification messages:', err);
          return;
        }

        // Fonction pour insérer le message
        const insertNewMessage = () => {
          db.run(
            'INSERT INTO messages (channelId, author, content) VALUES (?, ?, ?)',
            [channelId, author, content],
            function(insertErr) {
              if (insertErr) {
                console.error('Erreur sauvegarde message:', insertErr);
              } else {
                // Diffuser le message à tous les utilisateurs du canal
                const messageData = {
                  id: this.lastID,
                  channelId,
                  author,
                  content,
                  timestamp: new Date().toISOString()
                };

                // Envoyer aux AUTRES utilisateurs du canal (le sender a déjà l'optimistic update)
                socket.broadcast.to(`channel_${channelId}`).emit('new_message', messageData);
                
                // Confirmer au sender que le message a été sauvegardé
                socket.emit('message_confirmed', { tempId: data.tempId, message: messageData });
                
                if (isImage) {
                  console.log(`🖼️  Image envoyée par ${author} dans canal ${channelId}`);
                } else {
                  console.log(`💬 Message de ${author} dans canal ${channelId}`);
                }
              }
            }
          );
        };

        // Si déjà 50 messages, supprimer le plus ancien D'ABORD, puis insérer
        if (row.count >= 50) {
          db.run(
            'DELETE FROM messages WHERE id = (SELECT id FROM messages WHERE channelId = ? ORDER BY timestamp ASC LIMIT 1)',
            [channelId],
            (deleteErr) => {
              if (deleteErr) {
                console.error('Erreur suppression ancien message:', deleteErr);
              }
              // Insérer APRÈS la suppression
              insertNewMessage();
            }
          );
        } else {
          // Si moins de 50, insérer directement
          insertNewMessage();
        }
      }
    );
  });

  // Changer de canal
  socket.on('switch_channel', (data) => {
    const { channelId, username } = data;
    const user = connectedUsers[socket.id];

    if (user) {
      const oldChannelId = user.channelId;

      // Retirer l'utilisateur de l'ancien canal
      if (channelUsers[oldChannelId]) {
        channelUsers[oldChannelId] = channelUsers[oldChannelId].filter(u => u !== username);
        
        // Notifier le départ
        io.to(`channel_${oldChannelId}`).emit('user_left', {
          username,
          message: `${username} a quitté le salon`
        });

        // Envoyer la liste mise à jour
        io.to(`channel_${oldChannelId}`).emit('users_update', {
          channelId: oldChannelId,
          users: channelUsers[oldChannelId]
        });
      }

      // Quitter l'ancienne room
      socket.leave(`channel_${oldChannelId}`);

      // Mettre à jour le canal actuel
      user.channelId = channelId;
      
      // Ajouter l'utilisateur au nouveau canal
      if (!channelUsers[channelId]) {
        channelUsers[channelId] = [];
      }
      if (!channelUsers[channelId].includes(username)) {
        channelUsers[channelId].push(username);
      }

      // Rejoindre la nouvelle room
      socket.join(`channel_${channelId}`);

      // Notifier l'arrivée
      io.to(`channel_${channelId}`).emit('user_joined', {
        username,
        message: `${username} a rejoint le salon`
      });

      // Envoyer la liste mise à jour
      io.to(`channel_${channelId}`).emit('users_update', {
        channelId,
        users: channelUsers[channelId]
      });

      console.log(`📍 ${username} a changé de canal vers ${channelId}`);
      console.log(`👥 Utilisateurs en ligne: ${channelUsers[channelId].join(', ')}`);
    }
  });

  // Créer un nouveau canal
  socket.on('create_channel', (data) => {
    const { channelName, categoryId } = data;

    db.run(
      'INSERT INTO channels (name, description, categoryId) VALUES (?, ?, ?)',
      [channelName, `Canal créé par un utilisateur`, categoryId || null],
      function(err) {
        if (err) {
          socket.emit('error', { message: 'Ce canal existe déjà' });
        } else {
          const newChannel = {
            id: this.lastID,
            name: channelName,
            description: 'Canal créé par un utilisateur',
            categoryId: categoryId || null,
            createdAt: new Date().toISOString()
          };

          // Notifier tous les utilisateurs du nouveau canal
          io.emit('channel_created', newChannel);
          console.log(`📢 Nouveau canal créé: ${channelName}`);
        }
      }
    );
  });

  // Créer une nouvelle catégorie
  socket.on('create_category', (data) => {
    const { categoryName } = data;

    // Obtenir le plus grand position actuel
    db.get('SELECT MAX(position) as maxPos FROM categories', (err, row) => {
      const position = (row?.maxPos ?? -1) + 1;
      
      db.run(
        'INSERT INTO categories (name, position) VALUES (?, ?)',
        [categoryName, position],
        function(err) {
          if (err) {
            socket.emit('error', { message: 'Cette catégorie existe déjà' });
          } else {
            const newCategory = {
              id: this.lastID,
              name: categoryName,
              position: position,
              channels: []
            };

            // Notifier tous les utilisateurs
            io.emit('category_created', newCategory);
            console.log(`📁 Nouvelle catégorie créée: ${categoryName}`);
          }
        }
      );
    });
  });

  // Modifier une catégorie
  socket.on('update_category', (data) => {
    const { categoryId, name } = data;

    if (!name || name.trim() === '') {
      socket.emit('error', { message: 'Le nom de la catégorie est requis' });
      return;
    }

    db.run(
      'UPDATE categories SET name = ? WHERE id = ?',
      [name.trim(), categoryId],
      function(err) {
        if (err) {
          socket.emit('error', { message: 'Erreur lors de la modification' });
        } else {
          const updatedCategory = {
            id: categoryId,
            name: name.trim()
          };

          // Notifier tous les utilisateurs
          io.emit('category_updated', updatedCategory);
          console.log(`✏️  Catégorie modifiée: ${name}`);
        }
      }
    );
  });

  // Supprimer une catégorie
  socket.on('delete_category', (data) => {
    const { categoryId } = data;

    db.get('SELECT name FROM categories WHERE id = ?', [categoryId], (err, category) => {
      if (err || !category) {
        socket.emit('error', { message: 'Catégorie non trouvée' });
        return;
      }

      // Mettre les salons de la catégorie en null
      db.run('UPDATE channels SET categoryId = NULL WHERE categoryId = ?', [categoryId], (updateErr) => {
        if (updateErr) {
          socket.emit('error', { message: 'Erreur lors de la mise à jour' });
          return;
        }

        // Supprimer la catégorie
        db.run('DELETE FROM categories WHERE id = ?', [categoryId], (deleteCategoryErr) => {
          if (deleteCategoryErr) {
            socket.emit('error', { message: 'Erreur lors de la suppression' });
            return;
          }

          // Notifier tous les utilisateurs
          io.emit('category_deleted', { categoryId, categoryName: category.name });
          console.log(`🗑️  Catégorie supprimée: ${category.name}`);
        });
      });
    });
  });

  // Supprimer un canal
  socket.on('delete_channel', (data) => {
    const { channelId } = data;

    db.get('SELECT name FROM channels WHERE id = ?', [channelId], (err, channel) => {
      if (err || !channel) {
        socket.emit('error', { message: 'Salon non trouvé' });
        return;
      }

      // Supprimer tous les messages du canal
      db.run('DELETE FROM messages WHERE channelId = ?', [channelId], (deleteMessagesErr) => {
        if (deleteMessagesErr) {
          socket.emit('error', { message: 'Erreur lors de la suppression' });
          return;
        }

        // Supprimer le salon
        db.run('DELETE FROM channels WHERE id = ?', [channelId], (deleteSalonErr) => {
          if (deleteSalonErr) {
            socket.emit('error', { message: 'Erreur lors de la suppression' });
            return;
          }

          // Notifier tous les clients
          io.emit('channel_deleted', { channelId, channelName: channel.name });
          console.log(`🗑️  Salon supprimé: ${channel.name}`);
        });
      });
    });
  });

  // Modifier un canal
  socket.on('update_channel', (data) => {
    const { channelId, name, description } = data;

    if (!name || name.trim() === '') {
      socket.emit('error', { message: 'Le nom du salon est requis' });
      return;
    }

    db.run(
      'UPDATE channels SET name = ?, description = ? WHERE id = ?',
      [name.trim(), description || '', channelId],
      function(err) {
        if (err) {
          socket.emit('error', { message: 'Erreur lors de la modification' });
          return;
        }

        const updatedChannel = {
          id: channelId,
          name: name.trim(),
          description: description || ''
        };

        // Notifier tous les clients
        io.emit('channel_updated', updatedChannel);
        console.log(`✏️  Salon modifié: ${name.trim()}`);
      }
    );
  });

  // Déplacer un canal vers une catégorie
  socket.on('move_channel', (data) => {
    const { channelId, categoryId } = data;

    db.run(
      'UPDATE channels SET categoryId = ? WHERE id = ?',
      [categoryId, channelId],
      function(err) {
        if (err) {
          socket.emit('error', { message: 'Erreur lors du déplacement du salon' });
          console.error('Erreur déplacement:', err);
          return;
        }

        // Notifier tous les clients
        io.emit('channel_moved', { channelId, categoryId });
        console.log(`🚚 Salon ${channelId} déplacé vers catégorie ${categoryId || 'aucune'}`);
      }
    );
  });

  // Un utilisateur se déconnecte
  socket.on('disconnect', () => {
    const user = connectedUsers[socket.id];
    if (user) {
      const { username, channelId } = user;

      // Retirer l'utilisateur de son canal
      if (channelUsers[channelId]) {
        channelUsers[channelId] = channelUsers[channelId].filter(u => u !== username);
      }

      // Retirer l'utilisateur de la liste typing
      if (typingUsers[channelId]) {
        typingUsers[channelId] = typingUsers[channelId].filter(u => u !== username);
      }

      // Notifier les autres utilisateurs
      io.to(`channel_${channelId}`).emit('user_left', {
        username,
        message: `${username} a quitté le salon`
      });

      // Envoyer la liste mise à jour
      io.to(`channel_${channelId}`).emit('users_update', {
        channelId,
        users: channelUsers[channelId] || []
      });

      console.log(`👋 ${username} s'est déconnecté`);
      delete connectedUsers[socket.id];
    }
  });

  // Gestion des erreurs
  socket.on('error', (error) => {
    console.error('Erreur Socket:', error);
  });

  // Utilisateur en train de taper
  socket.on('typing', (data) => {
    const { username, channelId } = data;
    
    if (!typingUsers[channelId]) {
      typingUsers[channelId] = [];
    }
    
    if (!typingUsers[channelId].includes(username)) {
      typingUsers[channelId].push(username);
    }

    // Notifier les autres utilisateurs du canal
    io.to(`channel_${channelId}`).emit('user_typing', {
      username,
      channelId
    });
  });

  // Utilisateur a arrêté de taper
  socket.on('stop_typing', (data) => {
    const { username, channelId } = data;
    
    if (typingUsers[channelId]) {
      typingUsers[channelId] = typingUsers[channelId].filter(u => u !== username);
    }

    // Notifier les autres utilisateurs du canal
    io.to(`channel_${channelId}`).emit('user_stopped_typing', {
      username,
      channelId
    });
  });
});

// ===========================
// 🚀 DÉMARRAGE DU SERVEUR
// ===========================

const PORT = process.env.PORT || 8080;
server.listen(PORT, 'localhost', () => {
  console.log(`
╔════════════════════════════════════╗
║   Discord Clone - Server Running   ║
║   🌐 http://localhost:${PORT}      ║
╚════════════════════════════════════╝
  `);
});

// Gestion des erreurs globales
process.on('unhandledRejection', (err) => {
  console.error('Erreur non gérée:', err);
});

process.on('SIGINT', () => {
  console.log('\n📴 Arrêt du serveur...');
  db.close();
  process.exit(0);
});
