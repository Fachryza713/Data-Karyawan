export const SettingsAuditActions = {
  officeLocationCreate: 'office_location.create',
  officeLocationUpdate: 'office_location.update',
  officeLocationDelete: 'office_location.delete',
  shiftCreate: 'shift.create',
  shiftUpdate: 'shift.update',
  shiftDelete: 'shift.delete',
  holidayCreate: 'holiday.create',
  holidayDelete: 'holiday.delete',
  companySettingUpdate: 'company_setting.update',
} as const;

export const SettingsMessages = {
  officeLocationNotFound: 'Lokasi kantor tidak ditemukan',
  officeLocationNameTaken: 'Lokasi kantor dengan nama ini sudah ada',
  shiftNotFound: 'Shift tidak ditemukan',
  shiftNameTaken: 'Shift dengan nama ini sudah ada',
  shiftWindowInvalid:
    'Jam pulang harus setelah jam masuk (shift lintas tengah malam belum didukung)',
  holidayNotFound: 'Hari libur tidak ditemukan',
} as const;

/** Batas radius presensi GPS (meter). */
export const RADIUS_MIN_M = 25;
export const RADIUS_MAX_M = 1000;

/** Presisi koordinat yang disimpan (kolom Decimal(9, 6), sekitar 0,1 meter). */
export const COORDINATE_DECIMAL_PLACES = 6;

/** Batas toleransi terlambat shift (menit). */
export const LATE_TOLERANCE_MAX_MIN = 120;

/** Rentang tahun filter GET /holidays. */
export const HOLIDAY_YEAR_MIN = 2000;
export const HOLIDAY_YEAR_MAX = 2100;

/** Key CompanySetting untuk kontak di halaman Bantuan. */
export const ContactSettingKey = {
  /** Kontak HR, dilihat karyawan. */
  hr: 'hr_contact',
  /** Kontak admin sistem, dilihat HR. */
  admin: 'admin_contact',
} as const;

export type ContactSettingKey =
  (typeof ContactSettingKey)[keyof typeof ContactSettingKey];

export const CONTACT_LABELS: Record<ContactSettingKey, string> = {
  hr_contact: 'Kontak HR',
  admin_contact: 'Kontak admin sistem',
};

export const CONTACT_HOURS_MAX_LENGTH = 100;
