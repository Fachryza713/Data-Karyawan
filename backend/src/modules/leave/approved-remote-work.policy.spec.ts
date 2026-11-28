import { type QueryArgs, queryMock } from '../../../test/fixtures/employees.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ApprovedRemoteWorkPolicy } from './approved-remote-work.policy.js';

const EMPLOYEE = '0196b0c4-7c2a-7d3e-9a51-2f7a4c1d9e10';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function setup(found: unknown) {
  const findFirst = queryMock().mockResolvedValue(found);
  const policy = new ApprovedRemoteWorkPolicy({
    client: { leaveRequest: { findFirst } },
  } as unknown as PrismaService);
  return { policy, findFirst };
}

const firstArgs = (mock: { mock: { calls: QueryArgs[][] } }) =>
  mock.mock.calls[0][0];

describe('ApprovedRemoteWorkPolicy', () => {
  it('hanya WFH/BUSINESS_TRIP APPROVED yang mencakup tanggal itu', async () => {
    const { policy, findFirst } = setup(null);

    await expect(
      policy.hasApprovedRemote(EMPLOYEE, '2026-12-08'),
    ).resolves.toBeNull();
    expect(firstArgs(findFirst).where).toEqual({
      employeeId: EMPLOYEE,
      kind: { in: ['WFH', 'BUSINESS_TRIP'] },
      status: 'APPROVED',
      startDate: { lte: day('2026-12-08') },
      endDate: { gte: day('2026-12-08') },
    });
  });

  it.each([
    ['WFH', 'WFH'],
    ['BUSINESS_TRIP', 'BUSINESS_TRIP'],
  ])('pengajuan %s disetujui: mode %s', async (kind, mode) => {
    const { policy } = setup({ kind });

    await expect(
      policy.hasApprovedRemote(EMPLOYEE, '2026-12-08'),
    ).resolves.toEqual({ mode });
  });
});
