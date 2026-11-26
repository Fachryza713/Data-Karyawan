import { jest } from '@jest/globals';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defer, firstValueFrom, lastValueFrom } from 'rxjs';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { auditContext } from './audit-context.js';
import { Audit } from './audit.decorator.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { AuditService } from './audit.service.js';

class SampleController {
  @Audit('employee.update')
  update() {}

  list() {}
}

function httpContext(handler: () => void): ExecutionContext {
  const request = {
    user: { id: 'hr-1', role: 'HR', employeeId: 'e-hr' },
    ip: '10.0.0.7',
    headers: { 'user-agent': 'jest-agent' },
  };
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => SampleController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/** Handler palsu yang (seperti handler Nest) baru jalan saat di-subscribe. */
function handlerOf<T>(fn: () => Promise<T>): CallHandler<T> {
  return { handle: () => defer(fn) };
}

describe('AuditInterceptor + AuditService.recordChange', () => {
  const interceptor = new AuditInterceptor(new Reflector());
  const { update, list } = SampleController.prototype;

  it('endpoint @Audit: konteks (aksi, actor, IP, user agent) sampai ke service setelah await', async () => {
    const handler = handlerOf(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return auditContext.current();
    });

    const context = await lastValueFrom(
      interceptor.intercept(httpContext(update), handler),
    );

    expect(context).toEqual({
      action: 'employee.update',
      actorId: 'hr-1',
      ip: '10.0.0.7',
      userAgent: 'jest-agent',
    });
  });

  it('endpoint tanpa @Audit tidak punya konteks audit', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(
        httpContext(list),
        handlerOf(() => Promise.resolve(auditContext.current())),
      ),
    );

    expect(result).toBeUndefined();
  });

  it('recordChange menulis AuditLog dengan data dari konteks, tanpa field sensitif, di tx yang diberikan', async () => {
    const create = jest.fn<(args: unknown) => Promise<unknown>>();
    const tx = { auditLog: { create } };
    const audit = new AuditService({ client: {} } as unknown as PrismaService);

    await lastValueFrom(
      interceptor.intercept(
        httpContext(update),
        handlerOf(() =>
          audit.recordChange(
            {
              entity: 'Employee',
              entityId: 'e-1',
              before: { fullName: 'A', passwordHash: 'x' },
              after: { fullName: 'B', token: 'y' },
            },
            tx as never,
          ),
        ),
      ),
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: 'hr-1',
        action: 'employee.update',
        entity: 'Employee',
        entityId: 'e-1',
        before: { fullName: 'A' },
        after: { fullName: 'B' },
        ip: '10.0.0.7',
        userAgent: 'jest-agent',
      },
    });
  });

  it('recordChange di luar endpoint @Audit melempar error (tidak menulis log tanpa actor)', async () => {
    const create = jest.fn<(args: unknown) => Promise<unknown>>();
    const audit = new AuditService({
      client: { auditLog: { create } },
    } as unknown as PrismaService);

    await expect(
      audit.recordChange({ entity: 'Employee', entityId: 'e-1' }),
    ).rejects.toThrow('di luar endpoint @Audit');
    expect(create).not.toHaveBeenCalled();
  });
});
