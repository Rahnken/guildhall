-- CreateTable
CREATE TABLE "Profession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "characterId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "skill" INTEGER NOT NULL,
    "maxSkill" INTEGER NOT NULL,
    "scannedAt" DATETIME NOT NULL,
    CONSTRAINT "Profession_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnownRecipe" (
    "professionId" INTEGER NOT NULL,
    "spellId" INTEGER NOT NULL,

    PRIMARY KEY ("professionId", "spellId"),
    CONSTRAINT "KnownRecipe_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "Profession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Profession_name_idx" ON "Profession"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Profession_characterId_name_key" ON "Profession"("characterId", "name");

-- CreateIndex
CREATE INDEX "KnownRecipe_spellId_idx" ON "KnownRecipe"("spellId");
