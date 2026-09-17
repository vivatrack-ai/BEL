import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // works from any static folder (e.g. dev.evenuefy.com sub-path)
});
