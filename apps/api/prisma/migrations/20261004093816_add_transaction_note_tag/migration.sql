-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "noteId" UUID;

-- CreateIndex
CREATE INDEX "Transaction_userId_noteId_idx" ON "Transaction"("userId", "noteId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
