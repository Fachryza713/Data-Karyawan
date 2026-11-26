import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateContactDto } from './contact.dto.js';
import { CreateHolidayDto, ListHolidaysQueryDto } from './holiday.dto.js';
import {
  CreateOfficeLocationDto,
  UpdateOfficeLocationDto,
} from './office-location.dto.js';
import { CreateShiftDto, UpdateShiftDto } from './shift.dto.js';

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

// ---------------------------------------------------------------------------
// Lokasi kantor: koordinat dan radius
// ---------------------------------------------------------------------------

const validOffice = {
  name: ' Head Office Jakarta ',
  latitude: -6.224889,
  longitude: 106.809889,
  radiusM: 100,
};

describe('CreateOfficeLocationDto', () => {
  it('menerima body valid, nama di-trim, radius boleh kosong', async () => {
    const { properties, instance } = await check(CreateOfficeLocationDto, {
      ...validOffice,
      radiusM: undefined,
    });

    expect(properties).toEqual([]);
    expect(instance.name).toBe('Head Office Jakarta');
  });

  it.each([25, 100, 1000])('radius %p meter diterima', async (radiusM) => {
    const { properties } = await check(CreateOfficeLocationDto, {
      ...validOffice,
      radiusM,
    });

    expect(properties).toEqual([]);
  });

  it.each([
    [24, 'radiusM minimal 25 meter'],
    [0, 'radiusM minimal 25 meter'],
    [-100, 'radiusM minimal 25 meter'],
    [1001, 'radiusM maksimal 1000 meter'],
    [100.5, 'radiusM harus bilangan bulat (meter)'],
    ['100', 'radiusM harus bilangan bulat (meter)'],
    [null, 'radiusM harus bilangan bulat (meter)'],
  ])('radius %p ditolak: %s', async (radiusM, message) => {
    const { properties, messages } = await check(CreateOfficeLocationDto, {
      ...validOffice,
      radiusM,
    });

    expect(properties).toEqual(['radiusM']);
    expect(messages).toContain(message);
  });

  it.each([
    [{ latitude: -90 }, []],
    [{ latitude: 90 }, []],
    [{ longitude: -180 }, []],
    [{ longitude: 180 }, []],
    [{ latitude: 90.000001 }, ['latitude']],
    [{ latitude: -91 }, ['latitude']],
    [{ longitude: 180.5 }, ['longitude']],
    [{ longitude: -181 }, ['longitude']],
    [{ latitude: '-6.2' }, ['latitude']],
    [{ latitude: Number.NaN }, ['latitude']],
  ])('koordinat %o -> error di %p', async (override, expected) => {
    const { properties } = await check(CreateOfficeLocationDto, {
      ...validOffice,
      ...override,
    });

    expect(properties).toEqual(expected);
  });

  it('nama, latitude, longitude wajib', async () => {
    const { properties } = await check(CreateOfficeLocationDto, {});

    expect(properties.sort()).toEqual(['latitude', 'longitude', 'name']);
  });
});

describe('UpdateOfficeLocationDto', () => {
  it('semua field opsional, tetapi null ditolak', async () => {
    expect((await check(UpdateOfficeLocationDto, {})).properties).toEqual([]);
    expect(
      (await check(UpdateOfficeLocationDto, { radiusM: null })).properties,
    ).toEqual(['radiusM']);
  });

  it('radius di luar 25-1000 tetap ditolak saat ubah', async () => {
    const { properties } = await check(UpdateOfficeLocationDto, {
      radiusM: 2000,
    });

    expect(properties).toEqual(['radiusM']);
  });
});

// ---------------------------------------------------------------------------
// Shift: format jam dan toleransi
// ---------------------------------------------------------------------------

const validShift = { name: 'Reguler', startTime: '08:30', endTime: '17:30' };

describe('CreateShiftDto', () => {
  it('menerima body valid tanpa toleransi (default 15)', async () => {
    const { properties } = await check(CreateShiftDto, validShift);

    expect(properties).toEqual([]);
  });

  it.each(['00:00', '07:05', '23:59'])('jam %p diterima', async (startTime) => {
    const { properties } = await check(CreateShiftDto, {
      ...validShift,
      startTime,
    });

    expect(properties).toEqual([]);
  });

  it.each(['8:30', '08.30', '24:00', '12:60', '0830', '08:30:00', '', 830])(
    'format jam %p ditolak',
    async (startTime) => {
      const { properties, messages } = await check(CreateShiftDto, {
        ...validShift,
        startTime,
      });

      expect(properties).toEqual(['startTime']);
      expect(messages).toContain(
        'startTime harus berformat HH:mm (00:00-23:59), contoh 08:30',
      );
    },
  );

  it.each([0, 15, 120])('toleransi %p menit diterima', async (value) => {
    const { properties } = await check(CreateShiftDto, {
      ...validShift,
      lateToleranceMin: value,
    });

    expect(properties).toEqual([]);
  });

  it.each([
    [-1, 'lateToleranceMin minimal 0 menit'],
    [121, 'lateToleranceMin maksimal 120 menit'],
    [7.5, 'lateToleranceMin harus bilangan bulat (menit)'],
    [null, 'lateToleranceMin harus bilangan bulat (menit)'],
  ])('toleransi %p ditolak: %s', async (value, message) => {
    const { properties, messages } = await check(CreateShiftDto, {
      ...validShift,
      lateToleranceMin: value,
    });

    expect(properties).toEqual(['lateToleranceMin']);
    expect(messages).toContain(message);
  });
});

describe('UpdateShiftDto', () => {
  it('boleh mengirim satu jam saja (urutan jam dicek di service)', async () => {
    const { properties } = await check(UpdateShiftDto, { endTime: '16:00' });

    expect(properties).toEqual([]);
  });

  it('format jam tetap dicek', async () => {
    const { properties } = await check(UpdateShiftDto, { endTime: '25:00' });

    expect(properties).toEqual(['endTime']);
  });
});

// ---------------------------------------------------------------------------
// Hari libur
// ---------------------------------------------------------------------------

describe('CreateHolidayDto', () => {
  it('menerima tanggal YYYY-MM-DD dan nama', async () => {
    const { properties } = await check(CreateHolidayDto, {
      date: '2026-08-17',
      name: 'Hari Kemerdekaan',
    });

    expect(properties).toEqual([]);
  });

  it.each(['2026-02-30', '17-08-2026', '2026-8-17', ''])(
    'tanggal %p ditolak',
    async (date) => {
      const { properties } = await check(CreateHolidayDto, {
        date,
        name: 'Libur',
      });

      expect(properties).toEqual(['date']);
    },
  );
});

describe('ListHolidaysQueryDto', () => {
  it('year dari query string diubah ke angka', async () => {
    const { properties, instance } = await check(ListHolidaysQueryDto, {
      year: '2026',
    });

    expect(properties).toEqual([]);
    expect(instance.year).toBe(2026);
  });

  it.each(['1999', '2101', 'abc', '2026.5'])(
    'year %p ditolak',
    async (year) => {
      const { properties } = await check(ListHolidaysQueryDto, { year });

      expect(properties).toEqual(['year']);
    },
  );
});

// ---------------------------------------------------------------------------
// Kontak
// ---------------------------------------------------------------------------

const validContact = {
  email: ' HR@BlueRose.test ',
  whatsapp: ' 6281200000000 ',
  hours: ' Senin-Jumat 08:30-17:30 WIB ',
};

describe('UpdateContactDto', () => {
  it('menerima body valid: email huruf kecil, semua di-trim', async () => {
    const { properties, instance } = await check(
      UpdateContactDto,
      validContact,
    );

    expect(properties).toEqual([]);
    expect(instance).toEqual({
      email: 'hr@bluerose.test',
      whatsapp: '6281200000000',
      hours: 'Senin-Jumat 08:30-17:30 WIB',
    });
  });

  it.each(['6281234567', '62812345678901'])(
    'nomor WhatsApp %p (10 dan 14 digit) diterima',
    async (whatsapp) => {
      const { properties } = await check(UpdateContactDto, {
        ...validContact,
        whatsapp,
      });

      expect(properties).toEqual([]);
    },
  );

  it.each([
    '081200000000', // diawali 0
    '+6281200000000', // ada +
    '62 812 0000 0000', // ada spasi
    '62-812-0000-0000', // ada strip
    '6201200000000', // 0 setelah 62
    '628123456', // terlalu pendek
    '628123456789012', // terlalu panjang
    '6281abc00000',
  ])('nomor WhatsApp %p ditolak', async (whatsapp) => {
    const { properties, messages } = await check(UpdateContactDto, {
      ...validContact,
      whatsapp,
    });

    expect(properties).toEqual(['whatsapp']);
    expect(messages[0]).toMatch(/^Nomor WhatsApp harus berformat 62xxxxxxxxx/);
  });

  it.each(['bukan-email', 'hr@bluerose', 'hr?cc=x@bluerose.test', 'hr @x.id'])(
    'email %p ditolak',
    async (email) => {
      const { properties } = await check(UpdateContactDto, {
        ...validContact,
        email,
      });

      expect(properties).toEqual(['email']);
    },
  );

  it('semua field wajib (PUT mengganti seluruh kontak)', async () => {
    const { properties } = await check(UpdateContactDto, {});

    expect(properties.sort()).toEqual(['email', 'hours', 'whatsapp']);
  });

  it('jam layanan kosong ditolak', async () => {
    const { properties } = await check(UpdateContactDto, {
      ...validContact,
      hours: '   ',
    });

    expect(properties).toEqual(['hours']);
  });
});
