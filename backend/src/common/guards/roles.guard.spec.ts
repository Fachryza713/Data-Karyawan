import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../auth/auth-user.js';
import { Roles } from '../decorators/roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

class EmployeesController {
  @Roles(Role.HR)
  createEmployee() {}

  listMine() {}
}

@Roles(Role.HR)
class PayrollController {
  run() {}
}

function contextFor(
  controller: new () => object,
  handler: () => void,
  user?: AuthUser,
): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const employee: AuthUser = { id: 'u1', role: Role.EMPLOYEE, employeeId: 'e1' };
const hr: AuthUser = { id: 'u2', role: Role.HR, employeeId: 'e2' };

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const { createEmployee, listMine } = EmployeesController.prototype;

  it('menolak EMPLOYEE di endpoint @Roles(HR) dengan 403', () => {
    expect(() =>
      guard.canActivate(
        contextFor(EmployeesController, createEmployee, employee),
      ),
    ).toThrow(ForbiddenException);
  });

  it('mengizinkan HR di endpoint @Roles(HR)', () => {
    expect(
      guard.canActivate(contextFor(EmployeesController, createEmployee, hr)),
    ).toBe(true);
  });

  it('endpoint tanpa @Roles boleh untuk semua user login', () => {
    expect(
      guard.canActivate(contextFor(EmployeesController, listMine, employee)),
    ).toBe(true);
  });

  it('@Roles di level controller berlaku untuk semua method', () => {
    const { run } = PayrollController.prototype;
    expect(() =>
      guard.canActivate(contextFor(PayrollController, run, employee)),
    ).toThrow(ForbiddenException);
    expect(guard.canActivate(contextFor(PayrollController, run, hr))).toBe(
      true,
    );
  });

  it('401 jika @Roles dipakai tanpa user (endpoint @Public)', () => {
    expect(() =>
      guard.canActivate(contextFor(EmployeesController, createEmployee)),
    ).toThrow(UnauthorizedException);
  });
});
