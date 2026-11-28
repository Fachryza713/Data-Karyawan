import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthUser } from '../../src/common/auth/auth-user.js';
import { parseDateOnly } from '../../src/common/validation/date-only.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { AttendanceService } from '../../src/modules/attendance/attendance.service.js';
import { GeoService } from '../../src/modules/attendance/geo.service.js';
import { auditContext } from '../../src/modules/audit/audit-context.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { ApprovedRemoteWorkPolicy } from '../../src/modules/leave/approved-remote-work.policy.js';
import { LeaveBalanceService } from '../../src/modules/leave/leave-balance.service.js';
import { LeaveRequestsService } from '../../src/modules/leave/leave-requests.service.js';
import { LeaveReviewService } from '../../src/modules/leave/leave-review.service.js';
import { LeaveAuditActions } from '../../src/modules/leave/leave.constants.js';
import { HolidayService } from '../../src/modules/settings/holiday.service.js';
import type { StorageService } from '../../src/modules/storage/storage.service.js';
import {
  type AppPrismaClient,
  createPrismaClient,
  type PrismaService,
} from '../../src/prisma/prisma.service.js';

/**
 * Approval cuti di PostgreSQL asli: race kuota, approve ganda, dan izin WFH
 * untuk absen di luar radius. Service dirakit langsung (tanpa HTTP) dengan
 * Prisma asli; hanya Clock yang diganti. Data dibuat dengan penanda unik
 * per run dan dihapus di afterAll.
 */
describe('Approval cuti (integration, PostgreSQL asli)', () => {
  const RUN = randomUUID().slice(0, 8);
  let client: AppPrismaClient;
  let requests: LeaveRequestsService;
  let reviews: LeaveReviewService;
  let attendance: AttendanceService;
  let now = new Date('2027-02-01T03:00:00.000Z');

  const created = {
    userIds: [] as string[],
    employeeIds: [] as string[],
  };
  let org: {
    departmentId: string;
    positionId: string;
    officeLocationId: string;
    shiftId: string;
  };
  let hr: AuthUser;
  let annualTypeId: string;
  let nipSeq = Math.floor(Math.random() * 9000);

  /** Jalankan aksi di konteks audit seperti endpoint ber-@Audit. */
  const asActor = <T>(actorId: string, action: string, fn: () => Promise<T>) =>
    auditContext.run({ action, actorId, ip: null, userAgent: null }, fn);

  async function createUser(role: 'HR' | 'EMPLOYEE') {
    const user = await client.user.create({
      data: {
        email: `int-${RUN}-${created.userIds.length}@bluerose.test`,
        passwordHash: 'not-a-real-hash',
        role,
      },
      select: { id: true },
    });
    created.userIds.push(user.id);
    return user.id;
  }

  async function createEmployee() {
    const userId = await createUser('EMPLOYEE');
    nipSeq = (nipSeq + 1) % 10_000;
    const employee = await client.employee.create({
      data: {
        userId,
        nip: `BRT-2099-${String(nipSeq).padStart(4, '0')}`,
        fullName: `Integration ${RUN}`,
        joinDate: parseDateOnly('2024-01-02'),
        employmentStatus: 'PERMANENT',
        ...org,
      },
      select: { id: true },
    });
    created.employeeIds.push(employee.id);
    return { id: employee.id, userId };
  }

  const approve = (id: string) =>
    asActor(hr.id, LeaveAuditActions.approve, () => reviews.approve(id, hr));

  const submit = (
    userId: string,
    body: Parameters<LeaveRequestsService['submit']>[1],
  ) =>
    asActor(userId, LeaveAuditActions.submit, () =>
      requests.submit(userId, body),
    );

  beforeAll(async () => {
    // Sudah divalidasi global-setup.ts (database khusus test).
    client = createPrismaClient(process.env.TEST_DATABASE_URL!);
    const prisma = { client } as unknown as PrismaService;
    const clock = { now: () => now };
    const audit = new AuditService(prisma);
    const holidays = new HolidayService(prisma, audit);
    const balances = new LeaveBalanceService(prisma, clock);
    // Skenario di sini tanpa lampiran: storage tidak pernah dipanggil.
    const storage = {} as StorageService;
    requests = new LeaveRequestsService(
      prisma,
      holidays,
      storage,
      audit,
      balances,
      clock,
    );
    reviews = new LeaveReviewService(
      prisma,
      holidays,
      storage,
      audit,
      balances,
      clock,
    );
    attendance = new AttendanceService(
      prisma,
      holidays,
      new GeoService(),
      clock,
      new ApprovedRemoteWorkPolicy(prisma),
    );

    const department = await client.department.create({
      data: { name: `Integration ${RUN}` },
    });
    const position = await client.position.create({
      data: { name: 'Tester', departmentId: department.id },
    });
    const office = await client.officeLocation.create({
      data: {
        name: `Integration ${RUN}`,
        latitude: new Prisma.Decimal('-6.224889'),
        longitude: new Prisma.Decimal('106.809889'),
        radiusM: 100,
      },
    });
    const shift = await client.shift.create({
      data: {
        name: `Integration ${RUN}`,
        startTime: '08:30',
        endTime: '17:30',
        lateToleranceMin: 15,
      },
    });
    org = {
      departmentId: department.id,
      positionId: position.id,
      officeLocationId: office.id,
      shiftId: shift.id,
    };
    hr = { id: await createUser('HR'), role: 'HR', employeeId: null };
    const annual = await client.leaveType.findUniqueOrThrow({
      where: { code: 'ANNUAL' },
    });
    annualTypeId = annual.id;
  });

  afterAll(async () => {
    if (!client) return;
    const employeeId = { in: created.employeeIds };
    await client.auditLog.deleteMany({
      where: { actorId: { in: created.userIds } },
    });
    await client.attendance.deleteMany({ where: { employeeId } });
    await client.leaveRequest.deleteMany({ where: { employeeId } });
    await client.leaveBalance.deleteMany({ where: { employeeId } });
    await client.employee.deleteMany({ where: { id: employeeId } });
    await client.user.deleteMany({ where: { id: { in: created.userIds } } });
    if (org) {
      await client.position.delete({ where: { id: org.positionId } });
      await client.department.delete({ where: { id: org.departmentId } });
      await client.officeLocation.delete({
        where: { id: org.officeLocationId },
      });
      await client.shift.delete({ where: { id: org.shiftId } });
    }
    await client.$disconnect();
  });

  beforeEach(() => {
    // Senin 1 Feb 2027 10:00 WIB.
    now = new Date('2027-02-01T03:00:00.000Z');
  });

  it('dua approve paralel yang totalnya melebihi kuota: hanya satu berhasil, saldo tidak minus', async () => {
    // Diulang beberapa kali dengan karyawan baru supaya urutan commit bervariasi.
    for (let round = 0; round < 3; round++) {
      const employee = await createEmployee();
      const quota = 10;
      await client.leaveBalance.create({
        data: { employeeId: employee.id, year: 2027, quota },
      });

      // Masing-masing muat di sisa kuota, berdua tidak (7 + 7 > 10).
      const first = await submit(employee.userId, {
        kind: 'LEAVE',
        leaveTypeId: annualTypeId,
        startDate: '2027-03-01',
        endDate: '2027-03-09',
        reason: `Cuti A ${round}`,
      });
      const second = await submit(employee.userId, {
        kind: 'LEAVE',
        leaveTypeId: annualTypeId,
        startDate: '2027-03-15',
        endDate: '2027-03-23',
        reason: `Cuti B ${round}`,
      });
      expect(first.workingDays).toBeLessThanOrEqual(quota);
      expect(second.workingDays).toBeLessThanOrEqual(quota);
      expect(first.workingDays + second.workingDays).toBeGreaterThan(quota);

      const results = await Promise.allSettled([
        approve(first.id),
        approve(second.id),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const reason = rejected[0].reason as unknown;
      expect(reason).toBeInstanceOf(ConflictException);
      expect((reason as ConflictException).message).toBe(
        'Saldo cuti tidak cukup',
      );

      const winner = results[0].status === 'fulfilled' ? first : second;
      const loser = winner === first ? second : first;
      const balance = await client.leaveBalance.findUniqueOrThrow({
        where: { employeeId_year: { employeeId: employee.id, year: 2027 } },
      });
      expect(balance.used).toBe(winner.workingDays);
      expect(balance.used).toBeLessThanOrEqual(balance.quota);

      // Approve yang kalah di-rollback seluruhnya: status, presensi, audit.
      const statuses = await client.leaveRequest.findMany({
        where: { id: { in: [winner.id, loser.id] } },
        select: { id: true, status: true, reviewedById: true },
      });
      expect(statuses).toEqual(
        expect.arrayContaining([
          { id: winner.id, status: 'APPROVED', reviewedById: hr.id },
          { id: loser.id, status: 'PENDING', reviewedById: null },
        ]),
      );
      const leaveDays = await client.attendance.findMany({
        where: { employeeId: employee.id },
        select: { date: true, status: true },
        orderBy: { date: 'asc' },
      });
      expect(leaveDays).toHaveLength(winner.workingDays);
      expect(leaveDays.every((row) => row.status === 'LEAVE')).toBe(true);
      expect(
        await client.auditLog.count({
          where: {
            action: LeaveAuditActions.approve,
            entityId: { in: [winner.id, loser.id] },
          },
        }),
      ).toBe(1);
    }
  });

  it('CHECK constraint menolak used > quota walau ditulis langsung', async () => {
    const employee = await createEmployee();
    const balance = await client.leaveBalance.create({
      data: { employeeId: employee.id, year: 2027, quota: 2 },
    });

    await expect(
      client.leaveBalance.update({
        where: { id: balance.id },
        data: { used: 3 },
      }),
    ).rejects.toThrow(/leave_balances_used_within_quota_check/);
  });

  it('approve yang sama dua kali paralel: hanya berhasil satu kali', async () => {
    const employee = await createEmployee();
    const request = await submit(employee.userId, {
      kind: 'LEAVE',
      leaveTypeId: annualTypeId,
      startDate: '2027-04-05',
      endDate: '2027-04-07',
      reason: 'Approve ganda',
    });

    const results = await Promise.allSettled([
      approve(request.id),
      approve(request.id),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    // Saldo dipotong sekali, bukan dua kali; satu AuditLog approve.
    const balance = await client.leaveBalance.findUniqueOrThrow({
      where: { employeeId_year: { employeeId: employee.id, year: 2027 } },
    });
    expect(balance.used).toBe(request.workingDays);
    expect(
      await client.auditLog.count({
        where: { action: LeaveAuditActions.approve, entityId: request.id },
      }),
    ).toBe(1);
    expect(
      await client.attendance.count({ where: { employeeId: employee.id } }),
    ).toBe(request.workingDays);
  });

  it('pengajuan tumpang tindih ditolak database walau lolos cek service (EXCLUDE)', async () => {
    const employee = await createEmployee();
    const base = {
      employeeId: employee.id,
      kind: 'WFH' as const,
      workingDays: 2,
      reason: 'Langsung ke DB',
    };
    await client.leaveRequest.create({
      data: {
        ...base,
        startDate: parseDateOnly('2027-05-03'),
        endDate: parseDateOnly('2027-05-04'),
      },
    });

    await expect(
      client.leaveRequest.create({
        data: {
          ...base,
          startDate: parseDateOnly('2027-05-04'),
          endDate: parseDateOnly('2027-05-05'),
        },
      }),
    ).rejects.toThrow(/leave_requests_no_overlap/);
  });

  describe('absen di luar radius dengan izin WFH', () => {
    // Bandung, sekitar 120 km dari kantor uji.
    const farAway = { lat: -6.9175, lng: 107.6191, accuracy: 10 };

    async function wfhRequest() {
      const employee = await createEmployee();
      // Diajukan Senin 1 Feb untuk Selasa-Rabu 2-3 Feb (H-1).
      const request = await submit(employee.userId, {
        kind: 'WFH',
        startDate: '2027-02-02',
        endDate: '2027-02-03',
        reason: 'Renovasi rumah',
      });
      return { employee, request };
    }

    /** Selasa 2 Feb 2027 08:20 WIB. */
    const clockInMorning = () => {
      now = new Date('2027-02-02T01:20:00.000Z');
    };

    it('WFH APPROVED: absen di luar radius diterima dengan mode WFH', async () => {
      const { employee, request } = await wfhRequest();
      await approve(request.id);
      clockInMorning();

      const result = await attendance.clockIn(employee.userId, farAway);

      expect(result).toMatchObject({
        date: '2027-02-02',
        status: 'ON_TIME',
        mode: 'WFH',
      });
      expect(result.clockIn?.distanceM).toBeGreaterThan(100_000);
    });

    it('WFH masih PENDING: absen di luar radius tetap ditolak 422', async () => {
      const { employee } = await wfhRequest();
      clockInMorning();

      const error = await attendance
        .clockIn(employee.userId, farAway)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).message).toMatch(
        /di luar radius kantor/,
      );
      expect(
        await client.attendance.count({ where: { employeeId: employee.id } }),
      ).toBe(0);
    });
  });
});
