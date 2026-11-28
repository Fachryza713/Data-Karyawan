-- CreateEnum
CREATE TYPE "slip_status" AS ENUM ('NONE', 'QUEUED', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "payroll_items" ADD COLUMN     "slip_error" TEXT,
ADD COLUMN     "slip_key" TEXT,
ADD COLUMN     "slip_status" "slip_status" NOT NULL DEFAULT 'NONE';

-- ---------------------------------------------------------------------------
-- Konsistensi status file PDF slip (ditulis worker queue "payslip-pdf").
-- ---------------------------------------------------------------------------
ALTER TABLE "payroll_items"
  -- READY selalu menunjuk object di storage.
  ADD CONSTRAINT "payroll_items_slip_ready_check" CHECK ("slip_status" <> 'READY' OR "slip_key" IS NOT NULL),
  -- Alasan gagal dipotong aplikasi menjadi maksimal 1000 karakter.
  ADD CONSTRAINT "payroll_items_slip_error_check" CHECK ("slip_error" IS NULL OR char_length("slip_error") <= 1000);
