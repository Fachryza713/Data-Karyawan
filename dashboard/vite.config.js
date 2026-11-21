import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Satu entry (index.html). Portal karyawan (/app) dan HR (/hr) dipisah lewat react-router-dom.
export default defineConfig({
  plugins: [react()],
});
