import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Satu entry (index.html). Portal karyawan (/app) dan HR (/hr) dipisah lewat react-router-dom.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Pustaka pihak ketiga dipisah dari kode aplikasi agar bisa di-cache browser antar-rilis.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
