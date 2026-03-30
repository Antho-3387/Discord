-- CreateTable categories
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable users
CREATE TABLE "users" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL UNIQUE,
    "password" TEXT,
    "profile_image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable channels
CREATE TABLE "channels" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "description" TEXT DEFAULT '',
    "categoryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channels_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable messages
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "channelId" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex channels_categoryId_idx
CREATE INDEX "channels_categoryId_idx" ON "channels"("categoryId");
