-- CreateTable
CREATE TABLE "Guild" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "name" TEXT NOT NULL,
    "realm" TEXT NOT NULL,
    "faction" TEXT NOT NULL DEFAULT '',
    "rosterAt" DATETIME,
    "rosterBy" TEXT NOT NULL DEFAULT '',
    "bankCopper" BIGINT
);

-- CreateTable
CREATE TABLE "Character" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "rank" TEXT NOT NULL DEFAULT '',
    "rankIndex" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "classToken" TEXT NOT NULL DEFAULT '',
    "zone" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastOnlineHours" INTEGER,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BankTab" (
    "index" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "scannedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BankItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tabIndex" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    CONSTRAINT "BankItem_tabIndex_fkey" FOREIGN KEY ("tabIndex") REFERENCES "BankTab" ("index") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT NOT NULL,
    "summary" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Character_name_key" ON "Character"("name");

-- CreateIndex
CREATE INDEX "BankItem_name_idx" ON "BankItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BankItem_tabIndex_slot_key" ON "BankItem"("tabIndex", "slot");
