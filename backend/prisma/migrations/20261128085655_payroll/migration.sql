-- CreateEnum
CREATE TYPE "payroll_config_key" AS ENUM ('BPJS_KES', 'JHT', 'JP', 'JKK', 'JKM');

-- CreateEnum
CREATE TYPE "payroll_period_status" AS ENUM ('DRAFT', 'FINAL', 'PAID');

-- CreateEnum
CREATE TYPE "benefit_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "base_salary" DECIMAL(15,2) NOT NULL,
    "fixed_allowance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "bank_name" TEXT NOT NULL,
    "bank_account_last4" CHAR(4) NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefits" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "program" TEXT,
    "card_no" TEXT,
    "class" TEXT,
    "dependents" INTEGER NOT NULL DEFAULT 0,
    "status" "benefit_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_configs" (
    "id" UUID NOT NULL,
    "key" "payroll_config_key" NOT NULL,
    "employee_rate" DECIMAL(7,4) NOT NULL,
    "employer_rate" DECIMAL(7,4) NOT NULL,
    "wage_cap" DECIMAL(15,2),
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" UUID NOT NULL,
    "period" CHAR(7) NOT NULL,
    "status" "payroll_period_status" NOT NULL DEFAULT 'DRAFT',
    "finalized_by_id" UUID,
    "finalized_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employee_name" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "department_name" TEXT NOT NULL,
    "position_name" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "bank_account_last4" CHAR(4) NOT NULL,
    "base_salary" DECIMAL(15,2) NOT NULL,
    "fixed_allowance" DECIMAL(15,2) NOT NULL,
    "bonus" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "gross" DECIMAL(15,2) NOT NULL,
    "bpjs_kes" DECIMAL(15,2) NOT NULL,
    "bpjs_jht" DECIMAL(15,2) NOT NULL,
    "bpjs_jp" DECIMAL(15,2) NOT NULL,
    "pph21" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "other_deductions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(15,2) NOT NULL,
    "employer_contributions" JSONB NOT NULL,
    "config_snapshot" JSONB NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_structures_employee_id_effective_from_idx" ON "salary_structures"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "benefits_employee_id_idx" ON "benefits"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_configs_key_effective_from_key" ON "payroll_configs"("key", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_period_key" ON "payroll_periods"("period");

-- CreateIndex
CREATE INDEX "payroll_periods_finalized_by_id_idx" ON "payroll_periods"("finalized_by_id");

-- CreateIndex
CREATE INDEX "payroll_items_employee_id_idx" ON "payroll_items"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_period_id_employee_id_key" ON "payroll_items"("period_id", "employee_id");

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefits" ADD CONSTRAINT "benefits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_finalized_by_id_fkey" FOREIGN KEY ("finalized_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK constraint (ditambahkan manual lewat `migrate dev --create-only`;
-- Prisma Schema belum bisa menuliskannya). Aturan utama ada di service dan
-- PayrollCalculator; ini pengaman terakhir di database.
-- ---------------------------------------------------------------------------
ALTER TABLE "salary_structures"
  ADD CONSTRAINT "salary_structures_base_salary_check" CHECK ("base_salary" >= 0),
  ADD CONSTRAINT "salary_structures_fixed_allowance_check" CHECK ("fixed_allowance" >= 0),
  ADD CONSTRAINT "salary_structures_bank_name_check" CHECK (length(btrim("bank_name")) BETWEEN 1 AND 100),
  ADD CONSTRAINT "salary_structures_bank_last4_check" CHECK ("bank_account_last4" ~ '^[0-9]{4}$');

ALTER TABLE "benefits"
  ADD CONSTRAINT "benefits_provider_check" CHECK (length(btrim("provider")) BETWEEN 1 AND 100),
  ADD CONSTRAINT "benefits_program_check" CHECK ("program" IS NULL OR length(btrim("program")) BETWEEN 1 AND 100),
  ADD CONSTRAINT "benefits_card_no_check" CHECK ("card_no" IS NULL OR length(btrim("card_no")) BETWEEN 1 AND 50),
  ADD CONSTRAINT "benefits_class_check" CHECK ("class" IS NULL OR length(btrim("class")) BETWEEN 1 AND 50),
  ADD CONSTRAINT "benefits_dependents_check" CHECK ("dependents" BETWEEN 0 AND 20);

ALTER TABLE "payroll_configs"
  ADD CONSTRAINT "payroll_configs_employee_rate_check" CHECK ("employee_rate" BETWEEN 0 AND 1),
  ADD CONSTRAINT "payroll_configs_employer_rate_check" CHECK ("employer_rate" BETWEEN 0 AND 1),
  ADD CONSTRAINT "payroll_configs_wage_cap_check" CHECK ("wage_cap" > 0),
  -- JKK dan JKM ditanggung penuh perusahaan; slip tidak punya kolom potongannya.
  ADD CONSTRAINT "payroll_configs_employer_only_check" CHECK ("key" NOT IN ('JKK', 'JKM') OR "employee_rate" = 0);

ALTER TABLE "payroll_periods"
  ADD CONSTRAINT "payroll_periods_period_format_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- DRAFT belum difinalisasi; FINAL dan PAID sudah.
  ADD CONSTRAINT "payroll_periods_finalized_check" CHECK (
    ("status" = 'DRAFT') = ("finalized_at" IS NULL AND "finalized_by_id" IS NULL)
  ),
  ADD CONSTRAINT "payroll_periods_paid_check" CHECK (("status" = 'PAID') = ("paid_at" IS NOT NULL));

ALTER TABLE "payroll_items"
  ADD CONSTRAINT "payroll_items_amounts_check" CHECK (
    "base_salary" >= 0 AND "fixed_allowance" >= 0 AND "bonus" >= 0 AND "gross" >= 0
    AND "bpjs_kes" >= 0 AND "bpjs_jht" >= 0 AND "bpjs_jp" >= 0
    AND "pph21" >= 0 AND "other_deductions" >= 0
  ),
  -- Bruto dan take home pay selalu konsisten dengan komponennya (PRD 6.4).
  -- net boleh negatif di DRAFT (ditolak saat PATCH dan finalize).
  ADD CONSTRAINT "payroll_items_gross_check" CHECK ("gross" = "base_salary" + "fixed_allowance" + "bonus"),
  ADD CONSTRAINT "payroll_items_net_check" CHECK (
    "net" = "gross" - "bpjs_kes" - "bpjs_jht" - "bpjs_jp" - "pph21" - "other_deductions"
  ),
  ADD CONSTRAINT "payroll_items_bank_last4_check" CHECK ("bank_account_last4" ~ '^[0-9]{4}$'),
  ADD CONSTRAINT "payroll_items_note_check" CHECK ("note" IS NULL OR length(btrim("note")) BETWEEN 1 AND 300);

-- ---------------------------------------------------------------------------
-- Tarif BPJS awal (PRD 6.4), berlaku sejak Maret 2025 (batas upah JP
-- Rp10.547.400). Ada di migrasi karena dibutuhkan di semua lingkungan.
-- Perubahan berikutnya lewat PUT /payroll-configs (baris baru).
-- ---------------------------------------------------------------------------
INSERT INTO "payroll_configs" ("id", "key", "employee_rate", "employer_rate", "wage_cap", "effective_from")
VALUES
  (gen_random_uuid(), 'BPJS_KES', 0.0100, 0.0400, 12000000.00, '2025-03-01'),
  (gen_random_uuid(), 'JHT',      0.0200, 0.0370, NULL,        '2025-03-01'),
  (gen_random_uuid(), 'JP',       0.0100, 0.0200, 10547400.00, '2025-03-01'),
  (gen_random_uuid(), 'JKK',      0.0000, 0.0024, NULL,        '2025-03-01'),
  (gen_random_uuid(), 'JKM',      0.0000, 0.0030, NULL,        '2025-03-01')
ON CONFLICT ("key", "effective_from") DO NOTHING;
