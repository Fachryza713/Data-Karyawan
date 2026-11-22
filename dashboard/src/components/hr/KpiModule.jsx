import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import KpiPage from './KpiPage';
import KpiTemplateEditor from './KpiTemplateEditor';

/* Sub-rute modul Evaluasi kinerja, relatif terhadap /hr. */
export default function KpiModule() {
  return (
    <Routes>
      <Route path="kpi" element={<Navigate to="/hr/kpi/template" replace />} />
      <Route path="kpi/template" element={<KpiPage tab="template" />} />
      <Route path="kpi/periode" element={<KpiPage tab="periode" />} />
      <Route path="kpi/template/:positionId" element={<KpiTemplateEditor />} />
      <Route path="*" element={<Navigate to="/hr/kpi/template" replace />} />
    </Routes>
  );
}
