-- CreateEnum
CREATE TYPE "attendance_mode" AS ENUM ('OFFICE', 'WFH', 'BUSINESS_TRIP');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('ON_TIME', 'LATE', 'EARLY_LEAVE', 'LEAVE', 'SICK', 'PERMIT', 'ABSENT');

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "clock_in_at" TIMESTAMPTZ(3),
    "clock_in_lat" DECIMAL(9,6),
    "clock_in_lng" DECIMAL(9,6),
    "clock_in_distance_m" INTEGER,
    "clock_in_accuracy_m" DECIMAL(6,1),
    "clock_out_at" TIMESTAMPTZ(3),
    "clock_out_lat" DECIMAL(9,6),
    "clock_out_lng" DECIMAL(9,6),
    "clock_out_distance_m" INTEGER,
    "clock_out_accuracy_m" DECIMAL(6,1),
    "mode" "attendance_mode",
    "status" "attendance_status" NOT NULL,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendances_date_status_idx" ON "attendances"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_employee_id_date_key" ON "attendances"("employee_id", "date");

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK constraint (ditambahkan manual lewat `migrate dev --create-only`;
-- Prisma Schema belum bisa menuliskannya). Aturan utama ada di
-- AttendanceService; ini pengaman terakhir di database.
-- ---------------------------------------------------------------------------
ALTER TABLE "attendances"
  -- Data lokasi masuk/pulang lengkap atau kosong semua.
  ADD CONSTRAINT "attendances_clock_in_complete_check" CHECK (
    num_nulls("clock_in_at", "clock_in_lat", "clock_in_lng", "clock_in_distance_m", "clock_in_accuracy_m") IN (0, 5)
  ),
  ADD CONSTRAINT "attendances_clock_out_complete_check" CHECK (
    num_nulls("clock_out_at", "clock_out_lat", "clock_out_lng", "clock_out_distance_m", "clock_out_accuracy_m") IN (0, 5)
  ),
  -- Pulang hanya setelah masuk.
  ADD CONSTRAINT "attendances_clock_out_after_in_check" CHECK (
    "clock_out_at" IS NULL OR ("clock_in_at" IS NOT NULL AND "clock_out_at" >= "clock_in_at")
  ),
  -- Status hadir (ON_TIME/LATE/EARLY_LEAVE) dan mode hanya untuk baris yang absen masuk.
  ADD CONSTRAINT "attendances_status_presence_check" CHECK (
    ("clock_in_at" IS NOT NULL) = ("status" IN ('ON_TIME', 'LATE', 'EARLY_LEAVE'))
  ),
  ADD CONSTRAINT "attendances_mode_presence_check" CHECK (
    ("clock_in_at" IS NOT NULL) = ("mode" IS NOT NULL)
  ),
  ADD CONSTRAINT "attendances_early_leave_check" CHECK (
    "status" <> 'EARLY_LEAVE' OR "clock_out_at" IS NOT NULL
  ),
  ADD CONSTRAINT "attendances_clock_in_lat_check" CHECK ("clock_in_lat" BETWEEN -90 AND 90),
  ADD CONSTRAINT "attendances_clock_in_lng_check" CHECK ("clock_in_lng" BETWEEN -180 AND 180),
  ADD CONSTRAINT "attendances_clock_out_lat_check" CHECK ("clock_out_lat" BETWEEN -90 AND 90),
  ADD CONSTRAINT "attendances_clock_out_lng_check" CHECK ("clock_out_lng" BETWEEN -180 AND 180),
  ADD CONSTRAINT "attendances_distance_check" CHECK ("clock_in_distance_m" >= 0 AND "clock_out_distance_m" >= 0),
  ADD CONSTRAINT "attendances_accuracy_check" CHECK ("clock_in_accuracy_m" >= 0 AND "clock_out_accuracy_m" >= 0),
  ADD CONSTRAINT "attendances_late_minutes_check" CHECK ("late_minutes" >= 0);
