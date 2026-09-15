import { createSSRApp } from 'vue';
import App from './App.vue.js';

export function createApp() {
  const app = createSSRApp(App);
  return { app };
}
