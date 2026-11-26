import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Role } from '../../generated/prisma/enums.js';
import { DepartmentsController } from '../organization/departments.controller.js';
import { PositionsController } from '../organization/positions.controller.js';
import { EmployeeProfileController } from './employee-profile.controller.js';
import { EmployeesController } from './employees.controller.js';

type ControllerClass = abstract new (...args: never[]) => object;

const employee: AuthUser = {
  id: 'u-emp',
  role: Role.EMPLOYEE,
  employeeId: 'e-emp',
};
const hr: AuthUser = { id: 'u-hr', role: Role.HR, employeeId: 'e-hr' };

/** Semua method handler di controller (selain constructor). */
function handlersOf(controller: ControllerClass): Array<[string, () => void]> {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => [name, prototype[name] as () => void]);
}

function contextFor(
  controller: ControllerClass,
  handler: () => void,
  user: AuthUser,
): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

// RolesGuard memakai metadata @Roles yang sama dengan aplikasi asli: test ini
// gagal jika ada endpoint HR yang lupa diberi @Roles(HR).
describe('Akses endpoint HR', () => {
  const guard = new RolesGuard(new Reflector());
  const hrControllers: ControllerClass[] = [
    EmployeesController,
    DepartmentsController,
    PositionsController,
  ];

  describe.each(hrControllers.map((c) => [c.name, c] as const))(
    '%s',
    (_name, controller) => {
      it.each(handlersOf(controller))(
        'karyawan (EMPLOYEE) ditolak 403 di %s',
        (_method, handler) => {
          expect(() =>
            guard.canActivate(contextFor(controller, handler, employee)),
          ).toThrow(ForbiddenException);
        },
      );

      it.each(handlersOf(controller))(
        'HR boleh memanggil %s',
        (_m, handler) => {
          expect(guard.canActivate(contextFor(controller, handler, hr))).toBe(
            true,
          );
        },
      );
    },
  );

  it.each(handlersOf(EmployeeProfileController))(
    'endpoint /employees/me (%s) terbuka untuk semua role',
    (_method, handler) => {
      for (const user of [employee, hr]) {
        expect(
          guard.canActivate(
            contextFor(EmployeeProfileController, handler, user),
          ),
        ).toBe(true);
      }
    },
  );
});
