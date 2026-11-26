import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ClockLocationDto,
  ListAttendancesQueryDto,
  MyAttendanceQueryDto,
} from './attendance-request.dto.js';

/** Sama dengan ValidationPipe global (app.setup.ts). */
async function check<T extends object>(cls: new () => T, body: object) {
  const instance = plainToInstance(cls, body);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { instance, properties: errors.map((error) => error.property) };
}

describe('ClockLocationDto', () => {
  const valid = { lat: -6.2249, lng: 106.8099, accuracy: 15 };

  it('hanya lat, lng, accuracy; akurasi > 100 lolos DTO (ditolak 422 di service)', async () => {
    expect((await check(ClockLocationDto, valid)).properties).toEqual([]);
    expect(
      (await check(ClockLocationDto, { ...valid, accuracy: 250 })).properties,
    ).toEqual([]);
  });

  it.each([
    [{ lat: 91 }, ['lat']],
    [{ lng: -181 }, ['lng']],
    [{ accuracy: -1 }, ['accuracy']],
    [{ lat: '-6.2' }, ['lat']],
    [{ accuracy: null }, ['accuracy']],
  ])('%o ditolak', async (override, expected) => {
    expect(
      (await check(ClockLocationDto, { ...valid, ...override })).properties,
    ).toEqual(expected);
  });

  it('client tidak bisa mengirim jarak, waktu, atau mode', async () => {
    const { properties } = await check(ClockLocationDto, {
      ...valid,
      distanceM: 0,
      clockInAt: '2026-11-26T00:00:00Z',
      mode: 'WFH',
    });

    expect(properties.sort()).toEqual(['clockInAt', 'distanceM', 'mode']);
  });
});

describe('MyAttendanceQueryDto', () => {
  it.each(['2026-11', '2026-01', '2026-12'])(
    'month %p diterima',
    async (month) => {
      expect((await check(MyAttendanceQueryDto, { month })).properties).toEqual(
        [],
      );
    },
  );

  it.each(['2026-13', '2026-1', '26-11', '2026-11-01'])(
    'month %p ditolak',
    async (month) => {
      expect((await check(MyAttendanceQueryDto, { month })).properties).toEqual(
        ['month'],
      );
    },
  );
});

describe('ListAttendancesQueryDto', () => {
  it('menggabungkan filter dan pagination (default page 1, limit 20)', async () => {
    const { instance, properties } = await check(ListAttendancesQueryDto, {
      date: '2026-11-26',
      status: 'NOT_YET',
      search: '  radit ',
    });

    expect(properties).toEqual([]);
    expect(instance).toMatchObject({ page: 1, limit: 20, search: 'radit' });
  });

  it.each([
    [{ status: 'TELAT' }, ['status']],
    [{ date: '2026-02-30' }, ['date']],
    [{ departmentId: 'bukan-uuid' }, ['departmentId']],
    [{ limit: '101' }, ['limit']],
  ])('%o ditolak', async (query, expected) => {
    expect((await check(ListAttendancesQueryDto, query)).properties).toEqual(
      expected,
    );
  });
});
