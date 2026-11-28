/**
 * Data contoh untuk prisma/seed.ts. Semua orang dan nomor di sini fiktif.
 * Sumber: supabase/seed.sql dan supabase/seed-demo.sql (versi Supabase).
 */

export const DEPARTMENTS = [
  'Teknologi Informasi',
  'Human Capital',
  'Keuangan & Akuntansi',
  'Sales & Marketing',
  'Operasional',
  'Produk & Desain',
] as const;

export type DepartmentName = (typeof DEPARTMENTS)[number];

/** 18 jabatan, 3 per departemen. */
export const POSITIONS: ReadonlyArray<{
  name: string;
  department: DepartmentName;
}> = [
  { name: 'Frontend Developer', department: 'Teknologi Informasi' },
  { name: 'Backend Developer', department: 'Teknologi Informasi' },
  { name: 'IT Support', department: 'Teknologi Informasi' },
  { name: 'HR Manager', department: 'Human Capital' },
  { name: 'HR Generalist', department: 'Human Capital' },
  { name: 'Recruiter', department: 'Human Capital' },
  { name: 'Finance Manager', department: 'Keuangan & Akuntansi' },
  { name: 'Akuntan', department: 'Keuangan & Akuntansi' },
  { name: 'Staf Pajak', department: 'Keuangan & Akuntansi' },
  { name: 'Sales Executive', department: 'Sales & Marketing' },
  { name: 'Digital Marketing', department: 'Sales & Marketing' },
  { name: 'Account Manager', department: 'Sales & Marketing' },
  { name: 'Operations Manager', department: 'Operasional' },
  { name: 'Staf Administrasi', department: 'Operasional' },
  { name: 'Staf Logistik', department: 'Operasional' },
  { name: 'Product Manager', department: 'Produk & Desain' },
  { name: 'UI/UX Designer', department: 'Produk & Desain' },
  { name: 'QA Engineer', department: 'Produk & Desain' },
];

/** Koordinat contoh: kawasan Sudirman, Jakarta Selatan. */
export const HEAD_OFFICE = {
  name: 'Head Office Jakarta',
  latitude: '-6.224889',
  longitude: '106.809889',
  radiusM: 100,
} as const;

export const REGULAR_SHIFT = {
  name: 'Reguler',
  startTime: '08:30',
  endTime: '17:30',
  lateToleranceMin: 15,
} as const;

/**
 * Libur nasional 2026. Tanggal hari raya berbasis kalender Hijriah/lunar
 * adalah perkiraan: cocokkan dengan SKB 3 Menteri 2026 dan ubah lewat
 * aplikasi bila berbeda. Cuti bersama tidak dimasukkan.
 */
export const HOLIDAYS_2026: ReadonlyArray<{ date: string; name: string }> = [
  { date: '2026-01-01', name: 'Tahun Baru 2026 Masehi' },
  { date: '2026-01-16', name: 'Isra Mikraj Nabi Muhammad SAW' },
  { date: '2026-02-17', name: 'Tahun Baru Imlek 2577 Kongzili' },
  { date: '2026-03-19', name: 'Hari Suci Nyepi Tahun Baru Saka 1948' },
  { date: '2026-03-20', name: 'Hari Raya Idul Fitri 1447 H' },
  { date: '2026-03-21', name: 'Hari Raya Idul Fitri 1447 H' },
  { date: '2026-04-03', name: 'Wafat Yesus Kristus' },
  { date: '2026-04-05', name: 'Kebangkitan Yesus Kristus (Paskah)' },
  { date: '2026-05-01', name: 'Hari Buruh Internasional' },
  { date: '2026-05-14', name: 'Kenaikan Yesus Kristus' },
  { date: '2026-05-27', name: 'Hari Raya Idul Adha 1447 H' },
  { date: '2026-05-31', name: 'Hari Raya Waisak 2570 BE' },
  { date: '2026-06-01', name: 'Hari Lahir Pancasila' },
  { date: '2026-06-16', name: 'Tahun Baru Islam 1448 H' },
  { date: '2026-08-17', name: 'Hari Kemerdekaan Republik Indonesia' },
  { date: '2026-08-25', name: 'Maulid Nabi Muhammad SAW' },
  { date: '2026-12-25', name: 'Hari Raya Natal' },
];

/** Kontak HR untuk halaman Bantuan karyawan. */
export const HR_CONTACT = {
  email: 'hr@bluerose.test',
  whatsapp: '6281200000000',
  hours: 'Senin-Jumat 08:30-17:30 WIB',
} as const;

/** Kontak admin sistem untuk halaman Bantuan HR. */
export const ADMIN_CONTACT = {
  email: 'it@bluerose.test',
  whatsapp: '6281200000001',
  hours: 'Senin-Jumat 09:00-17:00 WIB',
} as const;

export type SeedEmployee = {
  nip: string;
  fullName: string;
  gender: 'MALE' | 'FEMALE';
  birthDate: string;
  department: DepartmentName;
  position: string;
  joinDate: string;
  status: 'PERMANENT' | 'CONTRACT';
  /** Akun demo: email tetap dan password dari SEED_DEMO_PASSWORD. */
  demoEmail?: string;
  role?: 'HR' | 'EMPLOYEE';
  phone?: string;
  /** Tanggal nonaktif (soft delete), untuk contoh karyawan keluar. */
  deletedAt?: string;
};

// prettier-ignore
const FICTIONAL_ROWS = [
  // NIP, nama, gender, lahir, departemen, jabatan, masuk, status
  ['BRT-2022-0101', 'Andika Saputra', 'MALE', '1993-04-12', 'Teknologi Informasi', 'Backend Developer', '2022-02-14', 'PERMANENT'],
  ['BRT-2023-0102', 'Nadia Putri Rahmawati', 'FEMALE', '1996-08-23', 'Teknologi Informasi', 'Backend Developer', '2023-06-05', 'PERMANENT'],
  ['BRT-2021-0103', 'Fajar Nugroho', 'MALE', '1994-01-30', 'Teknologi Informasi', 'IT Support', '2021-09-01', 'PERMANENT'],
  ['BRT-2024-0104', 'Citra Ayu Lestari', 'FEMALE', '1999-11-05', 'Teknologi Informasi', 'Frontend Developer', '2024-08-19', 'CONTRACT'],
  ['BRT-2025-0105', 'Rizky Firmansyah', 'MALE', '2000-06-17', 'Teknologi Informasi', 'IT Support', '2025-01-06', 'CONTRACT'],
  ['BRT-2020-0106', 'Sari Wulandari', 'FEMALE', '1991-02-08', 'Human Capital', 'HR Generalist', '2020-03-02', 'PERMANENT'],
  ['BRT-2023-0107', 'Yoga Prasetyo', 'MALE', '1995-10-19', 'Human Capital', 'Recruiter', '2023-01-16', 'PERMANENT'],
  ['BRT-2024-0108', 'Melati Anggraini', 'FEMALE', '1998-03-27', 'Human Capital', 'HR Generalist', '2024-04-01', 'CONTRACT'],
  ['BRT-2018-0109', 'Hendra Wijaya', 'MALE', '1984-07-14', 'Keuangan & Akuntansi', 'Finance Manager', '2018-11-12', 'PERMANENT'],
  ['BRT-2019-0110', 'Ratna Sari Dewi', 'FEMALE', '1990-12-02', 'Keuangan & Akuntansi', 'Akuntan', '2019-07-01', 'PERMANENT'],
  ['BRT-2022-0111', 'Agus Setiawan', 'MALE', '1993-05-25', 'Keuangan & Akuntansi', 'Akuntan', '2022-10-03', 'PERMANENT'],
  ['BRT-2021-0112', 'Lina Marlina', 'FEMALE', '1992-09-09', 'Keuangan & Akuntansi', 'Staf Pajak', '2021-05-17', 'PERMANENT'],
  ['BRT-2024-0113', 'Taufik Hidayat', 'MALE', '1999-04-04', 'Keuangan & Akuntansi', 'Staf Pajak', '2024-02-12', 'CONTRACT'],
  ['BRT-2022-0114', 'Bayu Aditya', 'MALE', '1995-01-21', 'Sales & Marketing', 'Sales Executive', '2022-01-10', 'PERMANENT'],
  ['BRT-2023-0115', 'Intan Permatasari', 'FEMALE', '1997-07-07', 'Sales & Marketing', 'Sales Executive', '2023-03-20', 'PERMANENT'],
  ['BRT-2020-0116', 'Galih Ramadhan', 'MALE', '1990-03-15', 'Sales & Marketing', 'Account Manager', '2020-08-03', 'PERMANENT'],
  ['BRT-2023-0117', 'Putri Maharani', 'FEMALE', '1998-12-12', 'Sales & Marketing', 'Digital Marketing', '2023-09-11', 'PERMANENT'],
  ['BRT-2025-0118', 'Dimas Kurniawan', 'MALE', '2001-02-28', 'Sales & Marketing', 'Digital Marketing', '2025-02-03', 'CONTRACT'],
  ['BRT-2017-0119', 'Wahyu Hidayatullah', 'MALE', '1983-10-30', 'Operasional', 'Operations Manager', '2017-04-10', 'PERMANENT'],
  ['BRT-2021-0120', 'Siti Aminah', 'FEMALE', '1993-06-06', 'Operasional', 'Staf Administrasi', '2021-02-01', 'PERMANENT'],
  ['BRT-2019-0121', 'Joko Susilo', 'MALE', '1988-08-18', 'Operasional', 'Staf Logistik', '2019-12-02', 'PERMANENT'],
  ['BRT-2024-0122', 'Rina Kartika', 'FEMALE', '2000-01-14', 'Operasional', 'Staf Administrasi', '2024-06-03', 'CONTRACT'],
  ['BRT-2022-0123', 'Arif Rahman Hakim', 'MALE', '1994-11-11', 'Operasional', 'Staf Logistik', '2022-07-18', 'PERMANENT'],
  ['BRT-2019-0124', 'Maya Sari Puspita', 'FEMALE', '1987-05-03', 'Produk & Desain', 'Product Manager', '2019-03-04', 'PERMANENT'],
  ['BRT-2022-0125', 'Kevin Santoso', 'MALE', '1996-09-21', 'Produk & Desain', 'UI/UX Designer', '2022-05-09', 'PERMANENT'],
  ['BRT-2023-0126', 'Anisa Fitriani', 'FEMALE', '1998-02-16', 'Produk & Desain', 'UI/UX Designer', '2023-11-06', 'PERMANENT'],
  ['BRT-2021-0127', 'Reza Mahendra', 'MALE', '1992-04-29', 'Produk & Desain', 'QA Engineer', '2021-11-15', 'PERMANENT'],
  ['BRT-2024-0128', 'Dewi Kusumawati', 'FEMALE', '1999-08-08', 'Produk & Desain', 'QA Engineer', '2024-10-07', 'CONTRACT'],
] as const satisfies ReadonlyArray<
  readonly [string, string, SeedEmployee['gender'], string, DepartmentName, string, string, SeedEmployee['status']]
>;

/** 2 akun demo + 28 karyawan fiktif = 30 karyawan. */
export const EMPLOYEES: readonly SeedEmployee[] = [
  {
    nip: 'BRT-2021-0001',
    fullName: 'Dian Lestari',
    gender: 'FEMALE',
    birthDate: '1990-09-02',
    department: 'Human Capital',
    position: 'HR Manager',
    joinDate: '2021-07-01',
    status: 'PERMANENT',
    demoEmail: 'hr@bluerose.test',
    role: 'HR',
    phone: '081200000002',
  },
  {
    nip: 'BRT-2024-0001',
    fullName: 'Raditya Pratama',
    gender: 'MALE',
    birthDate: '1997-05-14',
    department: 'Teknologi Informasi',
    position: 'Frontend Developer',
    joinDate: '2024-03-01',
    status: 'PERMANENT',
    demoEmail: 'karyawan@bluerose.test',
    role: 'EMPLOYEE',
    phone: '081200000001',
  },
  ...FICTIONAL_ROWS.map(
    (
      [
        nip,
        fullName,
        gender,
        birthDate,
        department,
        position,
        joinDate,
        status,
      ],
      i,
    ): SeedEmployee => ({
      nip,
      fullName,
      gender,
      birthDate,
      department,
      position,
      joinDate,
      status,
      phone: `08121000${String(i + 1).padStart(4, '0')}`,
      // Contoh karyawan yang sudah keluar (soft delete).
      ...(nip === 'BRT-2022-0123' && {
        deletedAt: '2026-01-31T17:00:00+07:00',
      }),
    }),
  ),
];

/**
 * Gaji contoh per NIP (rupiah sebagai teks, bukan number): gaji pokok,
 * tunjangan tetap, bank, 4 digit terakhir rekening, jumlah tanggungan.
 * Angka 28 karyawan fiktif sama dengan supabase/seed-demo.sql.
 */
export type SeedSalary = readonly [
  baseSalary: string,
  fixedAllowance: string,
  bankName: string,
  bankAccountLast4: string,
  dependents: number,
];

// prettier-ignore
export const SALARIES: Readonly<Record<string, SeedSalary>> = {
  'BRT-2021-0001': ['17500000', '2500000', 'Mandiri', '4410', 1],
  'BRT-2024-0001': ['12000000', '3850000', 'BCA', '8821', 2],
  'BRT-2022-0101': ['13500000', '1500000', 'BCA', '7919', 2],
  'BRT-2023-0102': ['12000000', '1500000', 'Mandiri', '5838', 0],
  'BRT-2021-0103': ['7500000', '1000000', 'BNI', '3757', 1],
  'BRT-2024-0104': ['10500000', '1250000', 'BCA', '1676', 0],
  'BRT-2025-0105': ['6500000', '750000', 'BRI', '9595', 0],
  'BRT-2020-0106': ['8500000', '1000000', 'Mandiri', '7514', 2],
  'BRT-2023-0107': ['7800000', '1000000', 'BCA', '5433', 1],
  'BRT-2024-0108': ['7000000', '750000', 'BNI', '3352', 0],
  'BRT-2018-0109': ['23000000', '3000000', 'BCA', '1271', 3],
  'BRT-2019-0110': ['9500000', '1000000', 'Mandiri', '9190', 2],
  'BRT-2022-0111': ['8800000', '1000000', 'BRI', '7109', 1],
  'BRT-2021-0112': ['8200000', '1000000', 'BCA', '5028', 1],
  'BRT-2024-0113': ['6800000', '750000', 'BNI', '2947', 0],
  'BRT-2022-0114': ['8000000', '1500000', 'BCA', '0866', 1],
  'BRT-2023-0115': ['7600000', '1500000', 'Mandiri', '8785', 0],
  'BRT-2020-0116': ['14000000', '2000000', 'BCA', '6704', 2],
  'BRT-2023-0117': ['8500000', '1000000', 'BRI', '4623', 0],
  'BRT-2025-0118': ['6800000', '750000', 'BNI', '2542', 0],
  'BRT-2017-0119': ['21000000', '3000000', 'Mandiri', '0461', 3],
  'BRT-2021-0120': ['6500000', '750000', 'BRI', '8380', 2],
  'BRT-2019-0121': ['6800000', '750000', 'BRI', '6299', 2],
  'BRT-2024-0122': ['5800000', '500000', 'BCA', '4218', 0],
  'BRT-2022-0123': ['6500000', '750000', 'Mandiri', '2137', 1],
  'BRT-2019-0124': ['22000000', '3000000', 'BCA', '0056', 2],
  'BRT-2022-0125': ['11000000', '1250000', 'BNI', '7975', 0],
  'BRT-2023-0126': ['10000000', '1250000', 'Mandiri', '5894', 0],
  'BRT-2021-0127': ['11500000', '1250000', 'BCA', '3813', 1],
  'BRT-2024-0128': ['9000000', '1000000', 'BRI', '1732', 0],
};

/** Email kantor fiktif: dua kata pertama nama, huruf kecil. */
export function officeEmail(employee: SeedEmployee): string {
  if (employee.demoEmail) return employee.demoEmail;
  const [first, second] = employee.fullName.toLowerCase().split(/\s+/);
  return `${first}.${second}@bluerose.test`;
}
