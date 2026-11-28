import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { HolidayService } from '../settings/holiday.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { CreateLeaveRequestDto } from './dto/leave-request.dto.js';
import type { LeaveBalanceService } from './leave-balance.service.js';
import { LeaveMessages } from './leave.constants.js';
import type { LeaveRequestRow } from './leave.mapper.js';
import { LeaveRequestsService } from './leave-requests.service.js';

const USER = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e11';
const EMPLOYEE = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10';
const REQUEST = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e60';
const ANNUAL = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e71';
const SICK = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e72';
const ATTACHMENT = `leave/${EMPLOYEE}/1b4e28ba-2fa1-41d2-883f-0016d3cca427`;
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

// Kamis 26 Nov 2026 10:00 WIB.
const NOW = new Date('2026-11-26T03:00:00.000Z');

const leaveTypes: Record<string, object> = {
  [ANNUAL]: {
    id: ANNUAL,
    code: 'ANNUAL',
    name: 'Cuti tahunan',
    annualQuota: 12,
    deductsQuota: true,
    attachmentRequiredAfterDays: null,
  },
  [SICK]: {
    id: SICK,
    code: 'SICK',
    name: 'Sakit',
    annualQuota: null,
    deductsQuota: false,
    attachmentRequiredAfterDays: 1,
  },
};

function requestRow(overrides: Partial<LeaveRequestRow> = {}): LeaveRequestRow {
  return {
    id: REQUEST,
    employeeId: EMPLOYEE,
    kind: 'LEAVE',
    startDate: day('2026-12-07'),
    endDate: day('2026-12-09'),
    workingDays: 3,
    reason: 'Acara keluarga',
    destination: null,
    attachmentKey: null,
    status: 'PENDING',
    reviewedAt: null,
    reviewNote: null,
    createdAt: NOW,
    updatedAt: NOW,
    leaveType: {
      id: ANNUAL,
      code: 'ANNUAL',
      name: 'Cuti tahunan',
      deductsQuota: true,
    },
    reviewedBy: null,
    ...overrides,
  };
}

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('prisma error', {
    code,
    clientVersion: Prisma.prismaVersion.client,
    meta,
  });
}

function setup() {
  const client = {
    employee: { findUnique: queryMock().mockResolvedValue({ id: EMPLOYEE }) },
    leaveType: {
      findUnique: queryMock().mockImplementation((args) =>
        Promise.resolve(leaveTypes[args.where!.id as string] ?? null),
      ),
      findMany: queryMock().mockResolvedValue(Object.values(leaveTypes)),
    },
    leaveRequest: {
      findFirst: queryMock().mockResolvedValue(null),
      findMany: queryMock().mockResolvedValue([]),
      count: queryMock().mockResolvedValue(0),
      create: queryMock().mockImplementation((args) =>
        Promise.resolve(
          requestRow({
            ...(args.data as Partial<LeaveRequestRow>),
          }),
        ),
      ),
      updateMany: queryMock().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: queryMock().mockResolvedValue(
        requestRow({ status: 'CANCELLED' }),
      ),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn(client),
    ),
  };
  const holidays = {
    workingDaysBetween: jest
      .fn<HolidayService['workingDaysBetween']>()
      .mockResolvedValue(3),
  };
  const storage = {
    stat: jest
      .fn<StorageService['stat']>()
      .mockResolvedValue({ size: 150_000, contentType: 'application/pdf' }),
    createPresignedUpload: jest
      .fn<StorageService['createPresignedUpload']>()
      .mockImplementation((key, _type, maxBytes) =>
        Promise.resolve({
          key,
          url: 'https://storage.test/hris-files',
          fields: { key },
          maxBytes,
          expiresAt: new Date('2026-11-26T03:05:00.000Z'),
        }),
      ),
  };
  const audit = {
    recordChange: jest
      .fn<AuditService['recordChange']>()
      .mockResolvedValue(undefined),
  };
  const balances = {
    findQuotaType: jest
      .fn<LeaveBalanceService['findQuotaType']>()
      .mockResolvedValue({ id: ANNUAL, annualQuota: 12 }),
    snapshot: jest
      .fn<LeaveBalanceService['snapshot']>()
      .mockResolvedValue({ year: 2026, quota: 12, used: 4 }),
  };
  const service = new LeaveRequestsService(
    { client } as unknown as PrismaService,
    holidays as unknown as HolidayService,
    storage as unknown as StorageService,
    audit as unknown as AuditService,
    balances as unknown as LeaveBalanceService,
    { now: () => NOW },
  );
  return { service, client, holidays, storage, audit, balances };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

const annualDto = (
  overrides: Partial<CreateLeaveRequestDto> = {},
): CreateLeaveRequestDto => ({
  kind: 'LEAVE',
  leaveTypeId: ANNUAL,
  startDate: '2026-12-07',
  endDate: '2026-12-09',
  reason: 'Acara keluarga',
  ...overrides,
});

describe('LeaveRequestsService.submit', () => {
  it('cuti tahunan valid: dibuat PENDING dengan workingDays dari server, audit di transaksi', async () => {
    const { service, client, audit, holidays } = setup();

    const result = await service.submit(USER, annualDto());

    expect(client.employee.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER } }),
    );
    expect(holidays.workingDaysBetween).toHaveBeenCalledWith(
      '2026-12-07',
      '2026-12-09',
    );
    expect(firstArgs(client.leaveRequest.create).data).toEqual({
      employeeId: EMPLOYEE,
      kind: 'LEAVE',
      leaveTypeId: ANNUAL,
      startDate: day('2026-12-07'),
      endDate: day('2026-12-09'),
      workingDays: 3,
      reason: 'Acara keluarga',
      destination: null,
      attachmentKey: null,
    });
    const [change, tx] = audit.recordChange.mock.calls[0];
    expect(tx).toBe(client);
    expect(change).toMatchObject({
      entity: 'LeaveRequest',
      entityId: REQUEST,
      after: { status: 'PENDING', workingDays: 3, startDate: '2026-12-07' },
    });
    expect(result).toMatchObject({
      id: REQUEST,
      status: 'PENDING',
      startDate: '2026-12-07',
      hasAttachment: false,
    });
  });

  it('start setelah end: 400 tanpa query lain', async () => {
    const { service, client } = setup();

    await expect(
      service.submit(
        USER,
        annualDto({ startDate: '2026-12-09', endDate: '2026-12-07' }),
      ),
    ).rejects.toThrow(new BadRequestException(LeaveMessages.invalidRange));
    expect(client.leaveRequest.create).not.toHaveBeenCalled();
  });

  it('akun tanpa data karyawan: 404', async () => {
    const { service, client } = setup();
    client.employee.findUnique.mockResolvedValue(null);

    await expect(service.submit(USER, annualDto())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('jenis cuti tidak ada: 400', async () => {
    const { service } = setup();

    await expect(
      service.submit(
        USER,
        annualDto({ leaveTypeId: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9eff' }),
      ),
    ).rejects.toThrow(new BadRequestException(LeaveMessages.leaveTypeNotFound));
  });

  it('rentang tanpa hari kerja (akhir pekan/libur): 422', async () => {
    const { service, holidays } = setup();
    holidays.workingDaysBetween.mockResolvedValue(0);

    await expect(
      service.submit(
        USER,
        annualDto({ startDate: '2026-12-05', endDate: '2026-12-06' }),
      ),
    ).rejects.toThrow(
      new UnprocessableEntityException(LeaveMessages.noWorkingDays),
    );
  });

  describe('kuota cuti tahunan', () => {
    it('melebihi sisa kuota (quota - used): 422, saldo tahun tanggal mulai', async () => {
      const { service, client, balances, holidays } = setup();
      holidays.workingDaysBetween.mockResolvedValue(9);

      await expect(service.submit(USER, annualDto())).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(balances.snapshot).toHaveBeenCalledWith(EMPLOYEE, 2026, {
        id: ANNUAL,
        annualQuota: 12,
      });
      expect(client.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('tepat sama dengan sisa kuota diterima', async () => {
      const { service, holidays } = setup();
      holidays.workingDaysBetween.mockResolvedValue(8);

      await expect(service.submit(USER, annualDto())).resolves.toMatchObject({
        status: 'PENDING',
      });
    });

    it('lintas tahun: 422 sebelum cek saldo', async () => {
      const { service, balances } = setup();

      await expect(
        service.submit(
          USER,
          annualDto({ startDate: '2026-12-30', endDate: '2027-01-04' }),
        ),
      ).rejects.toThrow(
        new UnprocessableEntityException(LeaveMessages.crossYear),
      );
      expect(balances.snapshot).not.toHaveBeenCalled();
    });

    it('sakit tidak memotong kuota: saldo tidak dicek', async () => {
      const { service, balances, holidays } = setup();
      holidays.workingDaysBetween.mockResolvedValue(1);

      await service.submit(USER, annualDto({ leaveTypeId: SICK }));

      expect(balances.snapshot).not.toHaveBeenCalled();
    });
  });

  describe('lampiran', () => {
    it('sakit lebih dari 1 hari kerja tanpa lampiran: 422', async () => {
      const { service, client, holidays } = setup();
      holidays.workingDaysBetween.mockResolvedValue(2);

      await expect(
        service.submit(USER, annualDto({ leaveTypeId: SICK })),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(client.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('sakit 2 hari dengan lampiran milik sendiri yang ada di storage: diterima', async () => {
      const { service, client, storage, holidays } = setup();
      holidays.workingDaysBetween.mockResolvedValue(2);

      await service.submit(
        USER,
        annualDto({ leaveTypeId: SICK, attachmentKey: ATTACHMENT }),
      );

      expect(storage.stat).toHaveBeenCalledWith(ATTACHMENT);
      expect(firstArgs(client.leaveRequest.create).data).toMatchObject({
        attachmentKey: ATTACHMENT,
      });
    });

    it.each([
      [
        'milik karyawan lain',
        `leave/0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e99/1b4e28ba-2fa1-41d2-883f-0016d3cca427`,
      ],
      [
        'folder lain',
        `employees/${EMPLOYEE}/avatar-1b4e28ba-2fa1-41d2-883f-0016d3cca427`,
      ],
      [
        'path traversal',
        `leave/${EMPLOYEE}/../x/1b4e28ba-2fa1-41d2-883f-0016d3cca427`,
      ],
    ])('key %s: 400 tanpa HeadObject', async (_label, key) => {
      const { service, storage } = setup();

      await expect(
        service.submit(
          USER,
          annualDto({ leaveTypeId: SICK, attachmentKey: key }),
        ),
      ).rejects.toThrow(
        new BadRequestException(LeaveMessages.invalidAttachmentKey),
      );
      expect(storage.stat).not.toHaveBeenCalled();
    });

    it('object belum diunggah (HeadObject 404): 400', async () => {
      const { service, storage } = setup();
      storage.stat.mockResolvedValue(null);

      await expect(
        service.submit(
          USER,
          annualDto({ leaveTypeId: SICK, attachmentKey: ATTACHMENT }),
        ),
      ).rejects.toThrow(
        new BadRequestException(LeaveMessages.attachmentNotUploaded),
      );
    });

    it.each([
      [{ size: 2 * 1024 * 1024 + 1, contentType: 'application/pdf' }],
      [{ size: 1000, contentType: 'text/html' }],
      [{ size: 1000, contentType: null }],
    ])('object di storage tidak sesuai policy (%o): 400', async (object) => {
      const { service, storage } = setup();
      storage.stat.mockResolvedValue(object);

      await expect(
        service.submit(
          USER,
          annualDto({ leaveTypeId: SICK, attachmentKey: ATTACHMENT }),
        ),
      ).rejects.toThrow(
        new BadRequestException(LeaveMessages.invalidAttachmentFile),
      );
    });
  });

  describe('WFH dan dinas luar', () => {
    it('WFH mulai hari ini: 422 (aturan H-1)', async () => {
      const { service, client } = setup();

      await expect(
        service.submit(USER, {
          kind: 'WFH',
          startDate: '2026-11-26',
          endDate: '2026-11-27',
          reason: 'Renovasi rumah',
        }),
      ).rejects.toThrow(
        new UnprocessableEntityException(LeaveMessages.remoteNoticeH1),
      );
      expect(client.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('WFH mulai besok: dibuat tanpa leaveTypeId dan tanpa cek saldo', async () => {
      const { service, client, balances } = setup();

      await service.submit(USER, {
        kind: 'WFH',
        startDate: '2026-11-27',
        endDate: '2026-11-27',
        reason: 'Renovasi rumah',
      });

      expect(firstArgs(client.leaveRequest.create).data).toMatchObject({
        kind: 'WFH',
        leaveTypeId: null,
        destination: null,
      });
      expect(balances.snapshot).not.toHaveBeenCalled();
    });

    it('dinas luar tanpa destination: 400', async () => {
      const { service } = setup();

      await expect(
        service.submit(USER, {
          kind: 'BUSINESS_TRIP',
          startDate: '2026-11-30',
          endDate: '2026-12-02',
          reason: 'Visit klien',
        }),
      ).rejects.toThrow(
        new BadRequestException(LeaveMessages.destinationRequired),
      );
    });

    it('dinas luar dengan destination: disimpan', async () => {
      const { service, client } = setup();

      await service.submit(USER, {
        kind: 'BUSINESS_TRIP',
        startDate: '2026-11-30',
        endDate: '2026-12-02',
        reason: 'Visit klien',
        destination: 'Surabaya',
      });

      expect(firstArgs(client.leaveRequest.create).data).toMatchObject({
        kind: 'BUSINESS_TRIP',
        destination: 'Surabaya',
      });
    });
  });

  describe('tumpang tindih', () => {
    it('beririsan dengan pengajuan PENDING/APPROVED: 409 dengan details', async () => {
      const { service, client } = setup();
      client.leaveRequest.findFirst.mockResolvedValue({
        id: REQUEST,
        kind: 'WFH',
        status: 'APPROVED',
        startDate: day('2026-12-09'),
        endDate: day('2026-12-10'),
      });

      const error = await service
        .submit(USER, annualDto())
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        message: LeaveMessages.overlap,
        details: {
          requestId: REQUEST,
          status: 'APPROVED',
          startDate: '2026-12-09',
          endDate: '2026-12-10',
        },
      });
      expect(firstArgs(client.leaveRequest.findFirst).where).toEqual({
        employeeId: EMPLOYEE,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: day('2026-12-09') },
        endDate: { gte: day('2026-12-07') },
      });
      expect(client.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('race dua submit: EXCLUDE constraint (23P01) menjadi 409', async () => {
      const { service, client } = setup();
      client.leaveRequest.create.mockRejectedValue(
        knownError('P2039', {
          driverAdapterError: { cause: { originalCode: '23P01' } },
        }),
      );

      await expect(service.submit(USER, annualDto())).rejects.toThrow(
        new ConflictException(LeaveMessages.overlap),
      );
    });

    it('error database lain diteruskan apa adanya', async () => {
      const { service, client } = setup();
      const boom = knownError('P1001');
      client.leaveRequest.create.mockRejectedValue(boom);

      await expect(service.submit(USER, annualDto())).rejects.toBe(boom);
    });
  });
});

describe('LeaveRequestsService.createAttachmentUpload', () => {
  it('PDF 2 MB: presigned POST dengan key leave/<employeeId>/<uuid>', async () => {
    const { service, storage } = setup();

    const result = await service.createAttachmentUpload(USER, {
      contentType: 'application/pdf',
      size: 2 * 1024 * 1024,
    });

    const [key, contentType, maxBytes] =
      storage.createPresignedUpload.mock.calls[0];
    expect(key).toMatch(
      new RegExp(
        `^leave/${EMPLOYEE}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
      ),
    );
    expect([contentType, maxBytes]).toEqual([
      'application/pdf',
      2 * 1024 * 1024,
    ]);
    expect(result).toMatchObject({ key, method: 'POST', maxBytes });
  });

  it('tipe lain atau lebih dari 2 MB: 400 tanpa presigned URL', async () => {
    const { service, storage } = setup();

    await expect(
      service.createAttachmentUpload(USER, {
        contentType: 'image/gif',
        size: 10,
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createAttachmentUpload(USER, {
        contentType: 'image/png',
        size: 2 * 1024 * 1024 + 1,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(storage.createPresignedUpload).not.toHaveBeenCalled();
  });
});

describe('LeaveRequestsService.listMine', () => {
  it('hanya milik sendiri, filter status/kind, terbaru dulu, pagination', async () => {
    const { service, client } = setup();
    client.leaveRequest.findMany.mockResolvedValue([requestRow()]);
    client.leaveRequest.count.mockResolvedValue(21);

    const result = await service.listMine(USER, {
      page: 2,
      limit: 20,
      status: 'PENDING',
      kind: 'LEAVE',
    });

    const args = firstArgs(client.leaveRequest.findMany);
    expect(args.where).toEqual({
      employeeId: EMPLOYEE,
      status: 'PENDING',
      kind: 'LEAVE',
    });
    expect([args.skip, args.take]).toEqual([20, 20]);
    expect(result.meta).toEqual({
      page: 2,
      limit: 20,
      total: 21,
      totalPages: 2,
    });
    expect(result.data[0]).toMatchObject({
      id: REQUEST,
      endDate: '2026-12-09',
    });
  });
});

describe('LeaveRequestsService.cancel', () => {
  it('PENDING milik sendiri: updateMany bersyarat status PENDING, audit', async () => {
    const { service, client, audit } = setup();
    client.leaveRequest.findFirst.mockResolvedValue({ status: 'PENDING' });

    const result = await service.cancel(USER, REQUEST);

    expect(firstArgs(client.leaveRequest.updateMany)).toEqual({
      where: { id: REQUEST, employeeId: EMPLOYEE, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    expect(audit.recordChange.mock.calls[0][0]).toEqual({
      entity: 'LeaveRequest',
      entityId: REQUEST,
      before: { status: 'PENDING' },
      after: { status: 'CANCELLED' },
    });
    expect(result.status).toBe('CANCELLED');
  });

  it('pengajuan orang lain atau tidak ada: 404', async () => {
    const { service, client } = setup();
    client.leaveRequest.findFirst.mockResolvedValue(null);

    await expect(service.cancel(USER, REQUEST)).rejects.toThrow(
      new NotFoundException(LeaveMessages.notFound),
    );
    expect(firstArgs(client.leaveRequest.findFirst).where).toEqual({
      id: REQUEST,
      employeeId: EMPLOYEE,
    });
    expect(client.leaveRequest.updateMany).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'REJECTED', 'CANCELLED'] as const)(
    'status final %s: 409 tanpa update',
    async (status) => {
      const { service, client } = setup();
      client.leaveRequest.findFirst.mockResolvedValue({ status });

      await expect(service.cancel(USER, REQUEST)).rejects.toThrow(
        ConflictException,
      );
      expect(client.leaveRequest.updateMany).not.toHaveBeenCalled();
    },
  );

  it('HR memproses di antara cek dan update (count 0): 409, tanpa audit', async () => {
    const { service, client, audit } = setup();
    client.leaveRequest.findFirst.mockResolvedValue({ status: 'PENDING' });
    client.leaveRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancel(USER, REQUEST)).rejects.toThrow(
      new ConflictException(LeaveMessages.alreadyProcessed),
    );
    expect(audit.recordChange).not.toHaveBeenCalled();
  });
});

describe('LeaveRequestsService.listLeaveTypes', () => {
  it('semua jenis cuti urut kode', async () => {
    const { service, client } = setup();

    await expect(service.listLeaveTypes()).resolves.toHaveLength(2);
    expect(firstArgs(client.leaveType.findMany).orderBy).toEqual({
      code: 'asc',
    });
  });
});
