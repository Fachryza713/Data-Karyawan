import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import KpiPage from './KpiPage';
import KpiTemplateEditor from './KpiTemplateEditor';
import KpiReviewForm from './KpiReviewForm';

/* Sub-rute modul Evaluasi kinerja, relatif terhadap /hr. */
export default function KpiModule() {
  return (
    <Routes>
      <Route path="kpi" element={<Navigate to="/hr/kpi/penilaian" replace />} />
      <Route path="kpi/penilaian" element={<KpiPage tab="penilaian" />} />
      <Route path="kpi/penilaian/:reviewId" element={<KpiReviewForm />} />
      <Route path="kpi/template" element={<KpiPage tab="template" />} />
      <Route path="kpi/periode" element={<KpiPage tab="periode" />} />
      <Route path="kpi/template/:positionId" element={<KpiTemplateEditor />} />
      <Route path="*" element={<Navigate to="/hr/kpi/penilaian" replace />} />
    </Routes>
  );
}
