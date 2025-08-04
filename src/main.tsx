import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App'; // 或者 './App.jsx'
import '@/index.css'; // 或者 './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);