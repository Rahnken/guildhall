-- CreateTable
CREATE TABLE "CraftRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "spellId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "deliverTo" TEXT NOT NULL DEFAULT '',
    "hasMaterials" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "requesterId" TEXT NOT NULL,
    "askedId" TEXT,
    "crafterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CraftRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Member" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CraftRequest_askedId_fkey" FOREIGN KEY ("askedId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CraftRequest_crafterId_fkey" FOREIGN KEY ("crafterId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CraftRequest_status_idx" ON "CraftRequest"("status");
