import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ApproveLeaveRequestDto,
  AttachmentUploadUrlDto,
  CreateLeaveRequestDto,
  LeaveBalanceQueryDto,
  ListLeaveRequestsQueryDto,
  RejectLeaveRequestDto,
} from './leave-request.dto.js';

/** Sama dengan ValidationPipe global (app.setup.ts). */
async function check<T extends object>(cls: new () => T, body: object) {
  const instance = plainToInstance(cls, body);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return {
    instance,
    properties: errors.map((error) => error.property),
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

const validLeave = {
  kind: 'LEAVE',
  leaveTypeId: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e71',
  startDate: '2026-12-07',
  endDate: '2026-12-09',
  reason: '  Acara keluarga  ',
};

describe('CreateLeaveRequestDto', () => {
  it('menerima body valid; reason di-trim', async () => {
    const { properties, instance } = await check(
      CreateLeaveRequestDto,
      validLeave,
    );
    expect(properties).toEqual([]);
    expect(instance.reason).toBe('Acara keluarga');
  });

  it('employeeId, status, atau workingDays dari client ditolak', async () => {
    const { properties } = await check(CreateLeaveRequestDto, {
      ...validLeave,
      employeeId: '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10',
      status: 'APPROVED',
      workingDays: 1,
    });
    expect(properties.sort()).toEqual(['employeeId', 'status', 'workingDays']);
  });

  it('kind, tanggal, dan reason divalidasi', async () => {
    const { properties } = await check(CreateLeaveRequestDto, {
      kind: 'HOLIDAY',
      startDate: '2026-02-30',
      endDate: '07-12-2026',
      reason: '   ',
    });
    expect(properties.sort()).toEqual([
      'endDate',
      'kind',
      'reason',
      'startDate',
    ]);
  });

  it('field opsional tidak boleh null; reason/destination maksimal panjangnya', async () => {
    const { properties } = await check(CreateLeaveRequestDto, {
      ...validLeave,
      leaveTypeId: null,
      attachmentKey: null,
      reason: 'x'.repeat(501),
      destination: 'y'.repeat(201),
    });
    expect(properties.sort()).toEqual([
      'attachmentKey',
      'destination',
      'leaveTypeId',
      'reason',
    ]);
  });
});

describe('AttachmentUploadUrlDto', () => {
  it('contentType dirapikan ke huruf kecil; size bilangan bulat >= 1', async () => {
    const ok = await check(AttachmentUploadUrlDto, {
      contentType: ' Application/PDF ',
      size: 1024,
    });
    expect(ok.properties).toEqual([]);
    expect(ok.instance.contentType).toBe('application/pdf');

    const bad = await check(AttachmentUploadUrlDto, {
      contentType: 'application/pdf',
      size: 1.5,
    });
    expect(bad.properties).toEqual(['size']);
  });
});

describe('Approve/Reject DTO', () => {
  it('reject wajib note (bukan spasi)', async () => {
    expect((await check(RejectLeaveRequestDto, {})).properties).toEqual([
      'note',
    ]);
    expect(
      (await check(RejectLeaveRequestDto, { note: '   ' })).properties,
    ).toEqual(['note']);
    expect(
      (await check(RejectLeaveRequestDto, { note: ' Bentrok rilis ' })).instance
        .note,
    ).toBe('Bentrok rilis');
  });

  it('approve: note opsional, maksimal 500 karakter', async () => {
    expect((await check(ApproveLeaveRequestDto, {})).properties).toEqual([]);
    expect(
      (await check(ApproveLeaveRequestDto, { note: 'x'.repeat(501) }))
        .properties,
    ).toEqual(['note']);
  });
});

describe('Query DTO', () => {
  it('daftar HR: status/kind enum, departmentId UUID, tanggal YYYY-MM-DD', async () => {
    const { properties } = await check(ListLeaveRequestsQueryDto, {
      status: 'DONE',
      kind: 'X',
      departmentId: 'abc',
      from: '2026-13-01',
      to: '2026-12-31',
    });
    expect(properties.sort()).toEqual([
      'departmentId',
      'from',
      'kind',
      'status',
    ]);
  });

  it('saldo: year 2000-2100 dari query string', async () => {
    const ok = await check(LeaveBalanceQueryDto, { year: '2027' });
    expect(ok.properties).toEqual([]);
    expect(ok.instance.year).toBe(2027);
    expect(
      (await check(LeaveBalanceQueryDto, { year: '1999' })).properties,
    ).toEqual(['year']);
  });
});
