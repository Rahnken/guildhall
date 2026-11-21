-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Character" (
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
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memberId" TEXT,
    "main" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Character_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Character" ("classToken", "firstSeen", "id", "lastOnlineHours", "level", "name", "note", "online", "rank", "rankIndex", "zone") SELECT "classToken", "firstSeen", "id", "lastOnlineHours", "level", "name", "note", "online", "rank", "rankIndex", "zone" FROM "Character";
DROP TABLE "Character";
ALTER TABLE "new_Character" RENAME TO "Character";
CREATE UNIQUE INDEX "Character_name_key" ON "Character"("name");
CREATE INDEX "Character_memberId_idx" ON "Character"("memberId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
