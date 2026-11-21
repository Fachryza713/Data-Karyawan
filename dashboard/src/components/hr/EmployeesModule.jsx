import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import EmployeesPage from './EmployeesPage';
import EmployeeCreatePage from './EmployeeCreatePage';
import EmployeeDetailPage from './EmployeeDetailPage';
import MasterDataPage from './MasterDataPage';

/* Sub-rute modul Data karyawan, relatif terhadap /hr. */
export default function EmployeesModule() {
  return (
    <Routes>
      <Route path="karyawan" element={<EmployeesPage />} />
      <Route path="karyawan/baru" element={<EmployeeCreatePage />} />
      <Route path="karyawan/master" element={<MasterDataPage />} />
      <Route path="karyawan/:id" element={<EmployeeDetailPage />} />
      <Route path="*" element={<Navigate to="/hr/karyawan" replace />} />
    </Routes>
  );
}
