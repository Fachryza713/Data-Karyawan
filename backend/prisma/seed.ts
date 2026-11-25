/**
 * Seed data awal: master organisasi, libur 2026, akun demo, dan 30 karyawan
 * fiktif. Jalankan dengan `npm run db:seed` (= `npx prisma db seed`).
 *
 * Idempotent: setiap baris memakai upsert dengan key alami (nama, tanggal,
 * email, NIP) dan `update: {}`, jadi menjalankan ulang tidak menggandakan
 * data dan tidak menimpa perubahan yang dibuat lewat aplikasi.
 *
 * Akun demo (password dari SEED_DEMO_PASSWORD, default di bawah):
 *   hr@bluerose.test        role HR
 *   karyawan@bluerose.test  role EMPLOYEE
 * Karyawan fiktif lain mendapat password acak yang tidak dicetak.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';
import {
  isValidNip,
  isValidShiftWindow,
  normalizeEmail,
} from '../src/common/validation/formats.js';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import {
  DEPARTMENTS,
  EMPLOYEES,
  HEAD_OFFICE,
  HOLIDAYS_2026,
  HR_CONTACT,
  officeEmail,
  POSITIONS,
  REGULAR_SHIFT,
  type SeedEmployee,
} from './seed-data.js';

const DEFAULT_DEMO_PASSWORD = 'BlueRose#2026';

/** Tanggal kalender "YYYY-MM-DD" untuk kolom @db.Date. */
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const hashPassword = (plain: string) => hash(plain, { type: argon2id });

function assertSeedDataValid(): void {
  const nips = new Set<string>();
  const emails = new Set<string>();
  for (const employee of EMPLOYEES) {
    if (!isValidNip(employee.nip)) {
      throw new Error(`NIP tidak valid: ${employee.nip}`);
    }
    const email = normalizeEmail(officeEmail(employee));
    if (nips.has(employee.nip) || emails.has(email)) {
      throw new Error(`NIP/email ganda: ${employee.nip} ${email}`);
    }
    nips.add(employee.nip);
    emails.add(email);
  }
  if (!isValidShiftWindow(REGULAR_SHIFT.startTime, REGULAR_SHIFT.endTime)) {
    throw new Error('Jam shift Reguler tidak valid');
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Seed membuat akun demo dengan password yang diketahui; tidak boleh dijalankan di production.',
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL belum diisi (lihat .env.example).');
  }
  const demoPassword = process.env.SEED_DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;
  if (demoPassword.length < 8) {
    throw new Error('SEED_DEMO_PASSWORD minimal 8 karakter.');
  }

  assertSeedDataValid();

  // Hash di luar transaksi: argon2 sengaja lambat (~0,1 detik per hash).
  const demoHash = await hashPassword(demoPassword);
  const passwordHashes = new Map<SeedEmployee, string>();
  for (const employee of EMPLOYEES) {
    passwordHashes.set(
      employee,
      employee.demoEmail
        ? demoHash
        : await hashPassword(randomBytes(24).toString('base64url')),
    );
  }

  // PrismaClient polos (tanpa extension soft delete): seed perlu melihat
  // dan meng-upsert karyawan yang sudah dihapus juga.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    await prisma.$transaction(
      async (tx) => {
        const departmentIds = new Map<string, string>();
        for (const name of DEPARTMENTS) {
          const department = await tx.department.upsert({
            where: { name },
            update: {},
            create: { name },
          });
          departmentIds.set(name, department.id);
        }

        const positionIds = new Map<string, string>();
        for (const { name, department } of POSITIONS) {
          const departmentId = departmentIds.get(department)!;
          const position = await tx.position.upsert({
            where: { departmentId_name: { departmentId, name } },
            update: {},
            create: { name, departmentId },
          });
          positionIds.set(`${department}/${name}`, position.id);
        }

        const office = await tx.officeLocation.upsert({
          where: { name: HEAD_OFFICE.name },
          update: {},
          create: {
            name: HEAD_OFFICE.name,
            latitude: new Prisma.Decimal(HEAD_OFFICE.latitude),
            longitude: new Prisma.Decimal(HEAD_OFFICE.longitude),
            radiusM: HEAD_OFFICE.radiusM,
          },
        });

        const shift = await tx.shift.upsert({
          where: { name: REGULAR_SHIFT.name },
          update: {},
          create: { ...REGULAR_SHIFT },
        });

        for (const holiday of HOLIDAYS_2026) {
          await tx.holiday.upsert({
            where: { date: day(holiday.date) },
            update: {},
            create: { date: day(holiday.date), name: holiday.name },
          });
        }

        for (const employee of EMPLOYEES) {
          const positionId = positionIds.get(
            `${employee.department}/${employee.position}`,
          );
          if (!positionId) {
            throw new Error(
              `Jabatan ${employee.position} tidak ada di ${employee.department}`,
            );
          }
          const deletedAt = employee.deletedAt
            ? new Date(employee.deletedAt)
            : null;

          const user = await tx.user.upsert({
            where: { email: normalizeEmail(officeEmail(employee)) },
            update: {},
            create: {
              email: normalizeEmail(officeEmail(employee)),
              passwordHash: passwordHashes.get(employee)!,
              role: employee.role ?? 'EMPLOYEE',
              // Karyawan yang sudah keluar tidak bisa login.
              isActive: deletedAt === null,
            },
          });

          await tx.employee.upsert({
            where: { nip: employee.nip },
            update: {},
            create: {
              userId: user.id,
              nip: employee.nip,
              fullName: employee.fullName,
              phone: employee.phone ?? null,
              gender: employee.gender,
              birthDate: day(employee.birthDate),
              departmentId: departmentIds.get(employee.department)!,
              positionId,
              officeLocationId: office.id,
              shiftId: shift.id,
              joinDate: day(employee.joinDate),
              employmentStatus: employee.status,
              deletedAt,
            },
          });
        }

        await tx.companySetting.upsert({
          where: { key: 'hr_contact' },
          update: {},
          create: { key: 'hr_contact', value: HR_CONTACT },
        });
      },
      { timeout: 60_000 },
    );

    const [departments, positions, holidays, users, employees, active] =
      await Promise.all([
        prisma.department.count(),
        prisma.position.count(),
        prisma.holiday.count(),
        prisma.user.count(),
        prisma.employee.count(),
        prisma.employee.count({ where: { deletedAt: null } }),
      ]);
    console.info(
      `Seed selesai: ${departments} departemen, ${positions} jabatan, ` +
        `${holidays} hari libur, ${users} akun, ${employees} karyawan ` +
        `(${active} aktif).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
