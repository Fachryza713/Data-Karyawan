import { randomUUID } from 'node:crypto';
import { parseDateOnly } from '../../src/common/validation/date-only.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { auditContext } from '../../src/modules/audit/audit-context.js';
import {
  type AppPrismaClient,
  createPrismaClient,
  type PrismaService,
} from '../../src/prisma/prisma.service.js';

/**
 * Data uji untuk integration test: organisasi, akun, dan karyawan dengan
 * penanda unik per run. cleanup() menghapus semuanya (urut foreign key).
 */
export class IntegrationFixtures {
  readonly run = randomUUID().slice(0, 8);
  readonly client: AppPrismaClient;
  readonly prisma: PrismaService;
  readonly userIds: string[] = [];
  readonly employeeIds: string[] = [];
  private org?: {
    departmentId: string;
    positionId: string;
    officeLocationId: string;
    shiftId: string;
  };
  private nipSeq = Math.floor(Math.random() * 9000);

  constructor() {
    // Sudah divalidasi global-setup.ts (database khusus test).
    this.client = createPrismaClient(process.env.TEST_DATABASE_URL!);
    this.prisma = { client: this.client } as unknown as PrismaService;
  }

  async createOrg(): Promise<void> {
    const name = `Integration ${this.run}`;
    const department = await this.client.department.create({ data: { name } });
    const position = await this.client.position.create({
      data: { name: 'Tester', departmentId: department.id },
    });
    const office = await this.client.officeLocation.create({
      data: {
        name,
        latitude: new Prisma.Decimal('-6.224889'),
        longitude: new Prisma.Decimal('106.809889'),
        radiusM: 100,
      },
    });
    const shift = await this.client.shift.create({
      data: { name, startTime: '08:30', endTime: '17:30' },
    });
    this.org = {
      departmentId: department.id,
      positionId: position.id,
      officeLocationId: office.id,
      shiftId: shift.id,
    };
  }

  async createUser(role: 'HR' | 'EMPLOYEE'): Promise<string> {
    const user = await this.client.user.create({
      data: {
        email: `int-${this.run}-${this.userIds.length}@bluerose.test`,
        passwordHash: 'not-a-real-hash',
        role,
      },
      select: { id: true },
    });
    this.userIds.push(user.id);
    return user.id;
  }

  async createEmployee(
    options: { fullName?: string; joinDate?: string } = {},
  ): Promise<{ id: string; userId: string }> {
    if (!this.org) {
      throw new Error('Panggil createOrg() dulu');
    }
    const userId = await this.createUser('EMPLOYEE');
    this.nipSeq = (this.nipSeq + 1) % 10_000;
    const employee = await this.client.employee.create({
      data: {
        userId,
        nip: `BRT-2099-${String(this.nipSeq).padStart(4, '0')}`,
        fullName: options.fullName ?? `Integration ${this.run}`,
        joinDate: parseDateOnly(options.joinDate ?? '2024-01-02'),
        employmentStatus: 'PERMANENT',
        ...this.org,
      },
      select: { id: true },
    });
    this.employeeIds.push(employee.id);
    return { id: employee.id, userId };
  }

  /** Jalankan aksi di konteks audit seperti endpoint ber-@Audit. */
  asActor<T>(actorId: string, action: string, fn: () => Promise<T>) {
    return auditContext.run({ action, actorId, ip: null, userAgent: null }, fn);
  }

  async cleanup(extra?: (client: AppPrismaClient) => Promise<void>) {
    const employeeId = { in: this.employeeIds };
    await this.client.auditLog.deleteMany({
      where: { actorId: { in: this.userIds } },
    });
    await extra?.(this.client);
    await this.client.payrollItem.deleteMany({ where: { employeeId } });
    await this.client.salaryStructure.deleteMany({ where: { employeeId } });
    await this.client.benefit.deleteMany({ where: { employeeId } });
    await this.client.attendance.deleteMany({ where: { employeeId } });
    await this.client.leaveRequest.deleteMany({ where: { employeeId } });
    await this.client.leaveBalance.deleteMany({ where: { employeeId } });
    await this.client.employee.deleteMany({ where: { id: employeeId } });
    await this.client.user.deleteMany({ where: { id: { in: this.userIds } } });
    if (this.org) {
      await this.client.position.delete({ where: { id: this.org.positionId } });
      await this.client.department.delete({
        where: { id: this.org.departmentId },
      });
      await this.client.officeLocation.delete({
        where: { id: this.org.officeLocationId },
      });
      await this.client.shift.delete({ where: { id: this.org.shiftId } });
    }
    await this.client.$disconnect();
  }
}
