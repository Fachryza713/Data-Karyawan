import { jest } from '@jest/globals';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { KpiTemplatesService } from './kpi-templates.service.js';
import { KpiMessages } from './kpi.constants.js';

const d = (value: string) => new Prisma.Decimal(value);
const NOW = new Date('2026-04-14T03:00:00.000Z');

const indicatorRow = (id: string, name: string, weight: string, order = 0) => ({
  id,
  name,
  description: null,
  weight: d(weight),
  target: null,
  order,
});

const templateRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'tpl-1',
  positionId: 'pos-fe',
  name: 'KPI Frontend',
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  position: {
    id: 'pos-fe',
    name: 'Frontend Developer',
    department: { id: 'dept-it', name: 'Teknologi Informasi' },
  },
  indicators: [
    indicatorRow('i1', 'Kualitas', '33.33', 0),
    indicatorRow('i2', 'Kecepatan', '33.33', 1),
    indicatorRow('i3', 'Kolaborasi', '33.34', 2),
  ],
  ...overrides,
});

function setup() {
  const client = {
    position: { findUnique: queryMock().mockResolvedValue({ id: 'pos' }) },
    kpiTemplate: {
      findUnique: queryMock().mockResolvedValue(templateRow()),
      findFirst: queryMock().mockResolvedValue(templateRow()),
      findMany: queryMock().mockResolvedValue([]),
      create: queryMock().mockResolvedValue(templateRow({ id: 'tpl-new' })),
      update: queryMock().mockResolvedValue(templateRow()),
      updateMany: queryMock().mockResolvedValue({ count: 1 }),
    },
    kpiIndicator: {
      create: queryMock().mockResolvedValue(
        indicatorRow('i4', 'Baru', '10', 3),
      ),
      update: queryMock().mockResolvedValue(
        indicatorRow('i1', 'Kualitas', '40'),
      ),
      delete: queryMock().mockResolvedValue({}),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn(client),
    ),
  };
  const audit = {
    recordChange: jest
      .fn<AuditService['recordChange']>()
      .mockResolvedValue(undefined),
  };
  const service = new KpiTemplatesService(
    { client } as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, client, audit };
}

const args = (mock: { mock: { calls: QueryArgs[][] } }, index = 0) =>
  mock.mock.calls[index][0];

describe('KpiTemplatesService', () => {
  it('response melaporkan total bobot dan validitas (33,33 + 33,33 + 33,34 valid)', async () => {
    const { service, client } = setup();

    await expect(service.findOne('tpl-1')).resolves.toMatchObject({
      totalWeight: '100.00',
      isValid: true,
      problem: null,
      indicators: [
        { weight: '33.33' },
        { weight: '33.33' },
        { weight: '33.34' },
      ],
    });

    client.kpiTemplate.findUnique.mockResolvedValue(
      templateRow({ indicators: [indicatorRow('i1', 'Kualitas', '90')] }),
    );
    await expect(service.findOne('tpl-1')).resolves.toMatchObject({
      totalWeight: '90.00',
      isValid: false,
      problem: 'Total bobot 90.00, harus 100.00',
    });
  });

  it('create aktif: template aktif lain di jabatan itu dinonaktifkan dulu, lalu audit', async () => {
    const { service, client, audit } = setup();
    client.kpiTemplate.findMany.mockResolvedValue([{ id: 'tpl-old' }]);

    await service.create({
      positionId: 'pos-fe',
      name: 'KPI Frontend 2026',
      indicators: [
        { name: 'Kualitas', weight: '50' },
        { name: 'Kecepatan', weight: '50', order: 5 },
      ],
    });

    expect(args(client.kpiTemplate.updateMany)).toEqual({
      where: { id: { in: ['tpl-old'] } },
      data: { isActive: false },
    });
    expect(args(client.kpiTemplate.create).data).toEqual({
      positionId: 'pos-fe',
      name: 'KPI Frontend 2026',
      isActive: true,
      indicators: {
        create: [
          {
            name: 'Kualitas',
            description: null,
            weight: d('50'),
            target: null,
            order: 0,
          },
          {
            name: 'Kecepatan',
            description: null,
            weight: d('50'),
            target: null,
            order: 5,
          },
        ],
      },
    });
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      entity: 'KpiTemplate',
      entityId: 'tpl-new',
      after: { deactivated: ['tpl-old'], totalWeight: '100.00' },
    });
  });

  it('create: jabatan tidak ada 404; nama indikator ganda 409; bobot 0 422', async () => {
    const { service, client } = setup();
    client.position.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ positionId: 'x', name: 'T' }),
    ).rejects.toThrow(new NotFoundException(KpiMessages.positionNotFound));

    await expect(
      service.create({
        positionId: 'pos-fe',
        name: 'T',
        indicators: [
          { name: 'Kualitas', weight: '50' },
          { name: 'KUALITAS', weight: '50' },
        ],
      }),
    ).rejects.toThrow(
      new ConflictException(KpiMessages.duplicateIndicatorName),
    );

    await expect(
      service.create({
        positionId: 'pos-fe',
        name: 'T',
        indicators: [{ name: 'Kualitas', weight: '0' }],
      }),
    ).rejects.toThrow(
      new UnprocessableEntityException(KpiMessages.weightPositive),
    );
  });

  it('bentrok index unik template aktif (bersamaan): 409', async () => {
    const { service, client } = setup();
    client.kpiTemplate.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: Prisma.prismaVersion.client,
      }),
    );

    await expect(
      service.create({ positionId: 'pos-fe', name: 'T' }),
    ).rejects.toThrow(
      new ConflictException(KpiMessages.activeTemplateConflict),
    );
  });

  it('copy: indikator template aktif sumber jadi template aktif baru jabatan tujuan', async () => {
    const { service, client, audit } = setup();

    await service.copy({ fromPositionId: 'pos-fe', toPositionId: 'pos-be' });

    expect(args(client.kpiTemplate.findFirst).where).toEqual({
      positionId: 'pos-fe',
      isActive: true,
    });
    expect(args(client.kpiTemplate.create).data).toEqual({
      positionId: 'pos-be',
      name: 'KPI Frontend (salinan)',
      isActive: true,
      indicators: {
        create: [
          {
            name: 'Kualitas',
            description: null,
            weight: d('33.33'),
            target: null,
            order: 0,
          },
          {
            name: 'Kecepatan',
            description: null,
            weight: d('33.33'),
            target: null,
            order: 1,
          },
          {
            name: 'Kolaborasi',
            description: null,
            weight: d('33.34'),
            target: null,
            order: 2,
          },
        ],
      },
    });
    expect(audit.recordChange.mock.calls[0][0].after).toMatchObject({
      copiedFromTemplateId: 'tpl-1',
    });
  });

  it('copy ke jabatan yang sama atau dari jabatan tanpa template aktif: 422', async () => {
    const { service, client } = setup();
    await expect(
      service.copy({ fromPositionId: 'pos-fe', toPositionId: 'pos-fe' }),
    ).rejects.toThrow(
      new UnprocessableEntityException(KpiMessages.copySamePosition),
    );

    client.kpiTemplate.findFirst.mockResolvedValue(null);
    await expect(
      service.copy({ fromPositionId: 'pos-fe', toPositionId: 'pos-be' }),
    ).rejects.toThrow(
      new UnprocessableEntityException(KpiMessages.copyNoSource),
    );
  });

  it('PATCH isActive true menonaktifkan template aktif lain (kecuali dirinya)', async () => {
    const { service, client } = setup();
    client.kpiTemplate.findUnique.mockResolvedValue(
      templateRow({ isActive: false }),
    );
    client.kpiTemplate.findMany.mockResolvedValue([{ id: 'tpl-old' }]);

    await service.update('tpl-1', { isActive: true });

    expect(args(client.kpiTemplate.findMany).where).toEqual({
      positionId: 'pos-fe',
      isActive: true,
      id: { not: 'tpl-1' },
    });
    expect(args(client.kpiTemplate.update).data).toEqual({ isActive: true });
  });

  it('tambah indikator: urutan berikutnya, nama unik, maksimal 20', async () => {
    const { service, client } = setup();

    await service.addIndicator('tpl-1', { name: 'Inisiatif', weight: '10' });
    expect(args(client.kpiIndicator.create).data).toMatchObject({
      templateId: 'tpl-1',
      weight: d('10'),
      order: 3,
    });

    await expect(
      service.addIndicator('tpl-1', { name: 'kualitas', weight: '10' }),
    ).rejects.toThrow(ConflictException);

    client.kpiTemplate.findUnique.mockResolvedValue(
      templateRow({
        indicators: Array.from({ length: 20 }, (_, i) =>
          indicatorRow(`i${i}`, `Ind ${i}`, '5', i),
        ),
      }),
    );
    await expect(
      service.addIndicator('tpl-1', { name: 'Ke-21', weight: '1' }),
    ).rejects.toThrow(
      new UnprocessableEntityException(KpiMessages.tooManyIndicators),
    );
  });

  it('ubah dan hapus indikator: harus milik template itu (404), dicatat di audit', async () => {
    const { service, client, audit } = setup();

    await service.updateIndicator('tpl-1', 'i1', { weight: '40' });
    expect(args(client.kpiIndicator.update)).toMatchObject({
      where: { id: 'i1' },
      data: { weight: d('40') },
    });
    expect(audit.recordChange.mock.calls[0][0]).toMatchObject({
      entity: 'KpiIndicator',
      before: { weight: '33.33' },
      after: { weight: '40.00' },
    });

    await expect(service.removeIndicator('tpl-1', 'i-lain')).rejects.toThrow(
      new NotFoundException(KpiMessages.indicatorNotFound),
    );
    await service.removeIndicator('tpl-1', 'i2');
    expect(args(client.kpiIndicator.delete)).toEqual({ where: { id: 'i2' } });
  });
});
