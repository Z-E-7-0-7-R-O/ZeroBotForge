import type { ProjectDocumentDto, ProjectSession } from "../types/electron-api";

export type ProjectStoreStatus = "idle" | "loading" | "saving" | "ready" | "error";

export interface ProjectStoreState {
  session: ProjectSession | null;
  status: ProjectStoreStatus;
  isDirty: boolean;
  error: string | null;
}

const INITIAL_STATE: ProjectStoreState = {
  session: null,
  status: "idle",
  isDirty: false,
  error: null,
};

let state: ProjectStoreState = INITIAL_STATE;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeProjectStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getProjectStoreSnapshot(): ProjectStoreState {
  return state;
}

export function setProjectStoreStatus(
  status: ProjectStoreStatus,
  error: string | null = null,
): void {
  state = {
    ...state,
    status,
    error,
  };
  emitChange();
}

export function setProjectSession(
  session: ProjectSession | null,
  options?: { dirty?: boolean },
): void {
  state = {
    session,
    status: session ? "ready" : "idle",
    isDirty: options?.dirty ?? false,
    error: null,
  };
  emitChange();
}

export function updateProjectDocument(
  document: ProjectDocumentDto,
  options?: { dirty?: boolean },
): void {
  if (!state.session) {
    return;
  }
  state = {
    ...state,
    session: {
      ...state.session,
      document,
    },
    status: "ready",
    isDirty: options?.dirty ?? true,
    error: null,
  };
  emitChange();
}

export function markProjectSaved(session: ProjectSession): void {
  state = {
    session,
    status: "ready",
    isDirty: false,
    error: null,
  };
  emitChange();
}

export function resetProjectStoreForTests(): void {
  state = INITIAL_STATE;
  emitChange();
}