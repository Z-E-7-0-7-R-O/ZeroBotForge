import type { DesktopApi } from './electron-api';

declare global {
  interface Window {
    zeroBotForge: DesktopApi;
  }
}

export {};