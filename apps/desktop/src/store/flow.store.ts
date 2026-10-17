import { useSyncExternalStore } from "react";
import type { FlowDefinition } from "@zerobotforge/flow-engine";
import type { FlowValidationResult } from "@zerobotforge/flow-engine/validator";
import type { FlowExecutionResult } from "@zerobotforge/flow-engine";

export interface FlowStoreState {
  activeFlow: FlowDefinition | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  validation: FlowValidationResult | null;
  previewResult: FlowExecutionResult | null;
  previewStatus: "idle" | "running" | "completed" | "failed";
  isDirty: boolean;
  error: string | null;
}

const initialState: FlowStoreState = {
  activeFlow: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  validation: null,
  previewResult: null,
  previewStatus: "idle",
  isDirty: false,
  error: null,
};

let snapshot: FlowStoreState = initialState;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getFlowStoreSnapshot(): FlowStoreState {
  return snapshot;
}

export function subscribeFlowStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commit(patch: Partial<FlowStoreState>): void {
  snapshot = { ...snapshot, ...patch };
  emit();
}

/** Synchronize from the project document. The project document remains canonical. */
export function synchronizeActiveFlow(flow: FlowDefinition | null): void {
  if (snapshot.activeFlow === flow) return;
  const sameFlow = snapshot.activeFlow?.id === flow?.id;
  const nodeStillExists = Boolean(flow?.nodes.some((node) => node.id === snapshot.selectedNodeId));
  const edgeStillExists = Boolean(flow?.edges.some((edge) => edge.id === snapshot.selectedEdgeId));

  commit({
    activeFlow: flow,
    selectedNodeId: nodeStillExists ? snapshot.selectedNodeId : null,
    selectedEdgeId: edgeStillExists ? snapshot.selectedEdgeId : null,
    validation: null,
    previewResult: null,
    previewStatus: "idle",
    isDirty: sameFlow ? snapshot.isDirty : false,
    error: null,
  });
}

export function recordFlowChange(flow: FlowDefinition): void {
  commit({
    activeFlow: flow,
    validation: null,
    previewResult: null,
    previewStatus: "idle",
    isDirty: true,
    error: null,
  });
}

export function selectFlowNode(selectedNodeId: string | null): void {
  if (snapshot.selectedNodeId === selectedNodeId && snapshot.selectedEdgeId === null) return;
  commit({ selectedNodeId, selectedEdgeId: null });
}

export function selectFlowEdge(selectedEdgeId: string | null): void {
  if (snapshot.selectedEdgeId === selectedEdgeId && snapshot.selectedNodeId === null) return;
  commit({ selectedEdgeId, selectedNodeId: null });
}

export function clearFlowSelection(): void {
  if (!snapshot.selectedNodeId && !snapshot.selectedEdgeId) return;
  commit({ selectedNodeId: null, selectedEdgeId: null });
}

export function setFlowValidation(validation: FlowValidationResult | null): void {
  commit({ validation });
}

export function setFlowPreviewStatus(previewStatus: FlowStoreState["previewStatus"]): void {
  commit({ previewStatus, ...(previewStatus === "running" ? { previewResult: null } : {}) });
}

export function setFlowPreviewResult(previewResult: FlowExecutionResult): void {
  commit({
    previewResult,
    previewStatus: previewResult.status === "failed" || previewResult.status === "step_limit_exceeded" ? "failed" : "completed",
  });
}

export function setFlowStoreError(error: string | null): void {
  commit({ error });
}

export function markFlowSaved(): void {
  if (!snapshot.isDirty) return;
  commit({ isDirty: false });
}

export function resetFlowStoreForTests(): void {
  snapshot = { ...initialState };
  emit();
}

export function useFlowStore(): FlowStoreState {
  return useSyncExternalStore(subscribeFlowStore, getFlowStoreSnapshot, getFlowStoreSnapshot);
}
