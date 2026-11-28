-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "leave_request_kind" AS ENUM ('LEAVE', 'WFH', 'BUSINESS_TRIP');

-- CreateEnum
CREATE TYPE "leave_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "annual_quota" INTEGER,
    "deducts_quota" BOOLEAN NOT NULL DEFAULT false,
    "attachment_required_after_days" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "quota" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" "leave_request_kind" NOT NULL,
    "leave_type_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "working_days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "destination" TEXT,
    "attachment_key" TEXT,
    "status" "leave_request_status" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_code_key" ON "leave_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employee_id_year_key" ON "leave_balances"("employee_id", "year");

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_start_date_idx" ON "leave_requests"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "leave_requests_status_start_date_idx" ON "leave_requests"("status", "start_date");

-- CreateIndex
CREATE INDEX "leave_requests_leave_type_id_idx" ON "leave_requests"("leave_type_id");

-- CreateIndex
CREATE INDEX "leave_requests_reviewed_by_id_idx" ON "leave_requests"("reviewed_by_id");

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK dan EXCLUDE constraint (ditambahkan manual lewat
-- `migrate dev --create-only`; Prisma Schema belum bisa menuliskannya).
-- Aturan utama ada di LeaveRequestsService; ini pengaman terakhir di database.
-- ---------------------------------------------------------------------------
ALTER TABLE "leave_types"
  ADD CONSTRAINT "leave_types_code_format_check" CHECK ("code" ~ '^[A-Z][A-Z_]{1,29}$'),
  ADD CONSTRAINT "leave_types_name_not_blank_check" CHECK (length(btrim("name")) BETWEEN 1 AND 100),
  ADD CONSTRAINT "leave_types_annual_quota_check" CHECK ("annual_quota" >= 0),
  ADD CONSTRAINT "leave_types_attachment_days_check" CHECK ("attachment_required_after_days" >= 0),
  -- Jenis yang mengurangi kuota harus punya kuota tahunan.
  ADD CONSTRAINT "leave_types_deducts_quota_check" CHECK (NOT "deducts_quota" OR "annual_quota" IS NOT NULL);

ALTER TABLE "leave_balances"
  ADD CONSTRAINT "leave_balances_year_check" CHECK ("year" BETWEEN 2000 AND 2100),
  ADD CONSTRAINT "leave_balances_quota_check" CHECK ("quota" >= 0),
  ADD CONSTRAINT "leave_balances_used_check" CHECK ("used" >= 0),
  -- Saldo tidak pernah minus, termasuk saat dua approve berjalan bersamaan.
  ADD CONSTRAINT "leave_balances_used_within_quota_check" CHECK ("used" <= "quota");

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_date_range_check" CHECK ("end_date" >= "start_date"),
  ADD CONSTRAINT "leave_requests_working_days_check" CHECK ("working_days" > 0),
  -- leave_type_id hanya dan wajib untuk kind LEAVE.
  ADD CONSTRAINT "leave_requests_leave_type_check" CHECK (("kind" = 'LEAVE') = ("leave_type_id" IS NOT NULL)),
  -- Tujuan hanya dan wajib untuk dinas luar.
  ADD CONSTRAINT "leave_requests_destination_check" CHECK (
    ("kind" = 'BUSINESS_TRIP') = ("destination" IS NOT NULL)
    AND ("destination" IS NULL OR length(btrim("destination")) BETWEEN 1 AND 200)
  ),
  -- Lampiran hanya untuk kind LEAVE.
  ADD CONSTRAINT "leave_requests_attachment_check" CHECK ("kind" = 'LEAVE' OR "attachment_key" IS NULL),
  ADD CONSTRAINT "leave_requests_reason_check" CHECK (length(btrim("reason")) BETWEEN 1 AND 500),
  -- APPROVED/REJECTED selalu punya peninjau dan waktu tinjau; status lain tidak.
  ADD CONSTRAINT "leave_requests_review_check" CHECK (
    ("status" IN ('APPROVED', 'REJECTED')) = ("reviewed_by_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)
  ),
  -- Penolakan wajib bercatatan.
  ADD CONSTRAINT "leave_requests_reject_note_check" CHECK ("status" <> 'REJECTED' OR "review_note" IS NOT NULL),
  ADD CONSTRAINT "leave_requests_review_note_check" CHECK (
    "review_note" IS NULL OR length(btrim("review_note")) BETWEEN 1 AND 500
  ),
  -- Pengajuan PENDING/APPROVED satu karyawan tidak boleh tumpang tindih
  -- (rentang tanggal inklusif). Menutup race dua submit bersamaan yang
  -- sama-sama lolos cek di service.
  ADD CONSTRAINT "leave_requests_no_overlap" EXCLUDE USING gist (
    "employee_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("status" IN ('PENDING', 'APPROVED'));

-- ---------------------------------------------------------------------------
-- Data awal jenis cuti (PRD 6.3). Ada di migrasi, bukan di seed, karena
-- dibutuhkan di semua lingkungan (seed menolak jalan di production).
-- ---------------------------------------------------------------------------
INSERT INTO "leave_types" ("id", "code", "name", "annual_quota", "deducts_quota", "attachment_required_after_days")
VALUES
  (gen_random_uuid(), 'ANNUAL', 'Cuti tahunan', 12, true, NULL),
  (gen_random_uuid(), 'SICK', 'Sakit', NULL, false, 1),
  (gen_random_uuid(), 'SPECIAL', 'Izin khusus', NULL, false, NULL)
ON CONFLICT ("code") DO NOTHING;

-- Saldo tahun berjalan (WIB) untuk karyawan aktif yang sudah ada. Karyawan
-- baru mendapat saldo saat dibuat; tahun berikutnya dibuat job 1 Januari.
INSERT INTO "leave_balances" ("id", "employee_id", "year", "quota")
SELECT gen_random_uuid(), e."id", extract(year FROM now() AT TIME ZONE 'Asia/Jakarta')::integer, lt."annual_quota"
FROM "employees" e
JOIN "users" u ON u."id" = e."user_id"
CROSS JOIN "leave_types" lt
WHERE lt."code" = 'ANNUAL' AND e."deleted_at" IS NULL AND u."is_active"
ON CONFLICT ("employee_id", "year") DO NOTHING;
