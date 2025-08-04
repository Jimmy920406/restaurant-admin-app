import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; // <--- 1. 導入 path 模組

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { // <--- 2. 新增 resolve 設定
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});