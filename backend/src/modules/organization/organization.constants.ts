export const OrganizationAuditActions = {
  departmentCreate: 'department.create',
  departmentUpdate: 'department.update',
  departmentDelete: 'department.delete',
  positionCreate: 'position.create',
  positionUpdate: 'position.update',
  positionDelete: 'position.delete',
} as const;

export const OrganizationMessages = {
  departmentNotFound: 'Departemen tidak ditemukan',
  departmentNameTaken: 'Departemen dengan nama ini sudah ada',
  positionNotFound: 'Jabatan tidak ditemukan',
  positionNameTaken: 'Jabatan dengan nama ini sudah ada di departemen tersebut',
} as const;
