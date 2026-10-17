import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, DesktopApiResult } from "../src/types/electron-api.js";
import { IPC_CHANNELS } from "./ipc/channels.js";

function invoke<T>(channel: string, ...args: unknown[]): Promise<DesktopApiResult<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<DesktopApiResult<T>>;
}

const api: DesktopApi = {
  projects: {
    create: (input) => invoke(IPC_CHANNELS.projectsCreate, input),
    open: () => invoke(IPC_CHANNELS.projectsOpen),
    save: (input) => invoke(IPC_CHANNELS.projectsSave, input),
    saveAs: (input) => invoke(IPC_CHANNELS.projectsSaveAs, input),
  },
  exports: {
    projectJson: (input) => invoke(IPC_CHANNELS.exportProjectJson, input),
    generatedProject: (input) => invoke(IPC_CHANNELS.exportGeneratedProject, input),
    updateGeneratedProject: (input) =>
      invoke(IPC_CHANNELS.exportUpdateGeneratedProject, input),
  },
  system: {
    getVersion: () => invoke(IPC_CHANNELS.systemGetVersion),
    settings: {
      get: () => invoke(IPC_CHANNELS.settingsGet),
      save: (input) => invoke(IPC_CHANNELS.settingsSave, input),
    },
  },
  telegram: {
    getStatus: () => invoke(IPC_CHANNELS.telegramGetStatus),
    setToken: (input) => invoke(IPC_CHANNELS.telegramSetToken, input),
    clearToken: () => invoke(IPC_CHANNELS.telegramClearToken),
    testConnection: () => invoke(IPC_CHANNELS.telegramTestConnection),
  },
  runtime: {
    getStatus: (input) => invoke(IPC_CHANNELS.runtimeGetStatus, input),
    openGeneratedProject: () => invoke(IPC_CHANNELS.runtimeOpenGeneratedProject),
    compile: (input) => invoke(IPC_CHANNELS.runtimeCompile, input),
    start: (input) => invoke(IPC_CHANNELS.runtimeStart, input),
    stop: () => invoke(IPC_CHANNELS.runtimeStop),
    clearLogs: () => invoke(IPC_CHANNELS.runtimeClearLogs),
    deleteGeneratedProject: (input) =>
      invoke(IPC_CHANNELS.runtimeDeleteGeneratedProject, input),
  },
};

contextBridge.exposeInMainWorld("zeroBotForge", api);
