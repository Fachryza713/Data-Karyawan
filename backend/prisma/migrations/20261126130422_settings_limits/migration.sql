-- ---------------------------------------------------------------------------
-- Batas pengaturan HR (lokasi kantor, shift, kontak bantuan).
-- Migrasi SQL saja (dibuat dengan `migrate dev --create-only`): Prisma Schema
-- belum bisa menuliskan CHECK constraint. Validasi utama tetap di DTO
-- (src/modules/settings/dto); ini pengaman terakhir di database.
-- ---------------------------------------------------------------------------

-- Radius presensi 25-1000 meter (sebelumnya hanya > 0).
ALTER TABLE "office_locations"
  DROP CONSTRAINT "office_locations_radius_m_check",
  ADD CONSTRAINT "office_locations_radius_m_check" CHECK ("radius_m" BETWEEN 25 AND 1000);

-- Toleransi terlambat 0-120 menit (sebelumnya hanya >= 0).
ALTER TABLE "shifts"
  DROP CONSTRAINT "shifts_late_tolerance_min_check",
  ADD CONSTRAINT "shifts_late_tolerance_min_check" CHECK ("late_tolerance_min" BETWEEN 0 AND 120);

-- Kontak di halaman Bantuan: {"email", "whatsapp", "hours"} lengkap dan
-- berformat benar, apa pun jalur penulisannya. Sama dengan CHECK
-- company_settings_contact_valid di versi Supabase. Key lain tidak dibatasi.
ALTER TABLE "company_settings"
  ADD CONSTRAINT "company_settings_contact_valid_check" CHECK (
    "key" NOT IN ('hr_contact', 'admin_contact') OR (
      jsonb_typeof("value") = 'object'
      AND coalesce("value" ->> 'email', '') ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
      AND length("value" ->> 'email') <= 254
      AND coalesce("value" ->> 'whatsapp', '') ~ '^62[1-9][0-9]{7,11}$'
      AND length(btrim(coalesce("value" ->> 'hours', ''))) BETWEEN 1 AND 100
    )
  );
