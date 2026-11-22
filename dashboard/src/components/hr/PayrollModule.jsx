import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PayrollRunsPage from './PayrollRunsPage';
import PayrollRunDetailPage from './PayrollRunDetailPage';

/* Sub-rute modul Penggajian & manfaat, relatif terhadap /hr. */
export default function PayrollModule() {
  return (
    <Routes>
      <Route path="penggajian" element={<PayrollRunsPage />} />
      <Route path="penggajian/:period" element={<PayrollRunDetailPage />} />
      <Route path="*" element={<Navigate to="/hr/penggajian" replace />} />
    </Routes>
  );
}
