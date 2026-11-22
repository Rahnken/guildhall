-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SiteSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "inviteUrl" TEXT NOT NULL DEFAULT '',
    "colorBackground" TEXT NOT NULL DEFAULT '',
    "colorBorder" TEXT NOT NULL DEFAULT '',
    "colorEmblem" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_SiteSettings" ("description", "id", "inviteUrl", "name") SELECT "description", "id", "inviteUrl", "name" FROM "SiteSettings";
DROP TABLE "SiteSettings";
ALTER TABLE "new_SiteSettings" RENAME TO "SiteSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
