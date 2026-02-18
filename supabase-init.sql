-- ====================================
-- Discord Clone - Supabase SQL Init
-- ====================================
-- Exécutez ce script dans le SQL Editor de Supabase
-- https://supabase.com/dashboard/project/zddpobiwlxwiogzuioog/sql

-- Table des catégories
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  position INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT,
  profile_image TEXT,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des salons (channels)
CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  "categoryId" INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des messages
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  "channelId" INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- 🔍 INDEXES pour performance
-- ====================================
CREATE INDEX IF NOT EXISTS idx_messages_channelId ON messages("channelId");
CREATE INDEX IF NOT EXISTS idx_channels_categoryId ON channels("categoryId");
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ====================================
-- 📝 Catégories par défaut
-- ====================================
INSERT INTO categories (name, position) VALUES ('📋 Texte', 0) ON CONFLICT DO NOTHING;
INSERT INTO categories (name, position) VALUES ('🎙️ Vocal', 1) ON CONFLICT DO NOTHING;

-- ====================================
-- 🛤️ Salons par défaut
-- ====================================
INSERT INTO channels (name, description, "categoryId") 
VALUES (
  'general',
  'Salon général pour discuter',
  (SELECT id FROM categories WHERE name = '📋 Texte')
) ON CONFLICT DO NOTHING;

INSERT INTO channels (name, description, "categoryId") 
VALUES (
  'random',
  'Messages aléatoires',
  (SELECT id FROM categories WHERE name = '📋 Texte')
) ON CONFLICT DO NOTHING;

INSERT INTO channels (name, description, "categoryId") 
VALUES (
  'aide',
  'Besoin d''aide?',
  (SELECT id FROM categories WHERE name = '📋 Texte')
) ON CONFLICT DO NOTHING;

-- ====================================
-- ✅ Confirmation
-- ====================================
SELECT 'Tables créées avec succès ✅' as status;
