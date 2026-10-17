import { useSyncExternalStore } from "react";
import type { NavigationPage } from "../components/layout/Sidebar";
import type { BotRuntimeStatus } from "../types/electron-api";

export interface AppStoreState {
  activePage: NavigationPage;
  globalBusy: boolean;
  lastError: string | null;
  runtimeStatus: BotRuntimeStatus | null;
}

const initialState: AppStoreState = {
  activePage: "Bot",
  globalBusy: false,
  lastError: null,
  runtimeStatus: null,
};

let snapshot: AppStoreState = initialState;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getAppStoreSnapshot(): AppStoreState {
  return snapshot;
}

export function subscribeAppStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setActivePage(page: NavigationPage): void {
  if (snapshot.activePage === page) return;
  snapshot = { ...snapshot, activePage: page };
  emit();
}

export function setGlobalBusy(globalBusy: boolean): void {
  if (snapshot.globalBusy === globalBusy) return;
  snapshot = { ...snapshot, globalBusy };
  emit();
}

export function setAppError(lastError: string | null): void {
  if (snapshot.lastError === lastError) return;
  snapshot = { ...snapshot, lastError };
  emit();
}

export function setRuntimeStatus(runtimeStatus: BotRuntimeStatus | null): void {
  if (snapshot.runtimeStatus === runtimeStatus) return;
  snapshot = { ...snapshot, runtimeStatus };
  emit();
}

export function resetAppStoreForTests(): void {
  snapshot = { ...initialState };
  emit();
}

export function useAppStore(): AppStoreState & {
  setActivePage: typeof setActivePage;
  setGlobalBusy: typeof setGlobalBusy;
  setAppError: typeof setAppError;
  setRuntimeStatus: typeof setRuntimeStatus;
} {
  const state = useSyncExternalStore(
    subscribeAppStore,
    getAppStoreSnapshot,
    getAppStoreSnapshot,
  );

  return {
    ...state,
    setActivePage,
    setGlobalBusy,
    setAppError,
    setRuntimeStatus,
  };
}