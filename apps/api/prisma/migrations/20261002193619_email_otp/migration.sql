-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'PASSWORD_RESET';

-- AlterTable
ALTER TABLE "OtpCode" ADD COLUMN     "email" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "OtpCode_email_purpose_createdAt_idx" ON "OtpCode"("email", "purpose", "createdAt");
