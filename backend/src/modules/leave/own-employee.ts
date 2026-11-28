import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { EmployeeMessages } from '../employees/employees.constants.js';

/**
 * ID karyawan milik akun yang login. Endpoint /me selalu memakai ini (user
 * ID dari JWT), tidak pernah ID dari parameter request.
 */
export async function findOwnEmployeeId(
  prisma: PrismaService,
  userId: string,
): Promise<string> {
  const employee = await prisma.client.employee.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!employee) {
    throw new NotFoundException(EmployeeMessages.noEmployeeRecord);
  }
  return employee.id;
}
