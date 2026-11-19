-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "inviteUrl" TEXT NOT NULL DEFAULT ''
);
