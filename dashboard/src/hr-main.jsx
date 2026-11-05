import React from 'react';
import ReactDOM from 'react-dom/client';
import HRDashboard from './components/HRDashboard';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HRDashboard onLogout={() => { window.location.href = '/'; }} />
  </React.StrictMode>,
);
