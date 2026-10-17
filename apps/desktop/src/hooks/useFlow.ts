import { useCallback, useEffect } from "react";
import type { FlowDefinition, FlowNode, SupportedFlowNodeType } from "@zerobotforge/flow-engine";
import { addFlowNode, connectFlowNodes, removeFlowEdge, removeFlowNode, updateFlowNode, validateFlowDefinition } from "../services/flow.service";
import { runFlowPreview } from "../services/preview.service";
import type { FlowPreviewOptions } from "../services/preview.service";
import {
  clearFlowSelection,
  markFlowSaved,
  recordFlowChange,
  selectFlowEdge,
  selectFlowNode,
  setFlowPreviewResult,
  setFlowPreviewStatus,
  setFlowStoreError,
  setFlowValidation,
  synchronizeActiveFlow,
  useFlowStore,
} from "../store/flow.store";

export type FlowChangeHandler = (flow: FlowDefinition) => void;

/** React-facing API for the editor. Mutations are recorded in the flow store and mirrored through onFlowChange into the project document. */
export function useFlow(flow: FlowDefinition | null, onFlowChange?: FlowChangeHandler) {
  const state = useFlowStore();

  useEffect(() => {
    synchronizeActiveFlow(flow);
    if (flow) setFlowValidation(validateFlowDefinition(flow));
  }, [flow]);

  const recordChange = useCallback((nextFlow: FlowDefinition) => {
    recordFlowChange(nextFlow);
    setFlowValidation(validateFlowDefinition(nextFlow));
    onFlowChange?.(nextFlow);
  }, [onFlowChange]);

  const addNode = useCallback((type: SupportedFlowNodeType): FlowDefinition => {
    if (!flow) throw new Error("Create or select a flow before adding nodes.");
    const next = addFlowNode(flow, type);
    recordChange(next);
    return next;
  }, [flow, recordChange]);

  const connectNodes = useCallback((input: Parameters<typeof connectFlowNodes>[1]): FlowDefinition => {
    if (!flow) throw new Error("Create or select a flow before connecting nodes.");
    const next = connectFlowNodes(flow, input);
    recordChange(next);
    return next;
  }, [flow, recordChange]);

  const updateNode = useCallback((node: FlowNode, removedOutputHandles: readonly string[] = []): FlowDefinition => {
    if (!flow) throw new Error("Create or select a flow before editing nodes.");
    const next = updateFlowNode(flow, node, removedOutputHandles);
    recordChange(next);
    return next;
  }, [flow, recordChange]);

  const removeNode = useCallback((nodeId: string): FlowDefinition => {
    if (!flow) throw new Error("Create or select a flow before removing nodes.");
    const next = removeFlowNode(flow, nodeId);
    recordChange(next);
    return next;
  }, [flow, recordChange]);

  const removeEdge = useCallback((edgeId: string): FlowDefinition => {
    if (!flow) throw new Error("Create or select a flow before removing connections.");
    const next = removeFlowEdge(flow, edgeId);
    recordChange(next);
    return next;
  }, [flow, recordChange]);

  const validateCurrentFlow = useCallback((target: FlowDefinition | null = flow) => {
    const result = target ? validateFlowDefinition(target) : null;
    setFlowValidation(result);
    return result;
  }, [flow]);

  const runPreview = useCallback(async (
    target: FlowDefinition | null = flow,
    options: FlowPreviewOptions = {},
  ) => {
    if (!target) throw new Error("Select or create a flow before running a preview.");
    setFlowStoreError(null);
    setFlowPreviewStatus("running");
    try {
      const report = await runFlowPreview(target, options);
      setFlowPreviewResult(report.result);
      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Flow preview failed.";
      setFlowStoreError(message);
      setFlowPreviewStatus("failed");
      throw error;
    }
  }, [flow]);

  const resetEditorState = useCallback(() => {
    clearFlowSelection();
    setFlowValidation(null);
    setFlowPreviewStatus("idle");
    setFlowStoreError(null);
    markFlowSaved();
  }, []);

  return {
    ...state,
    selectNode: selectFlowNode,
    selectEdge: selectFlowEdge,
    clearSelection: clearFlowSelection,
    recordChange,
    addNode,
    connectNodes,
    updateNode,
    removeNode,
    removeEdge,
    validateCurrentFlow,
    runPreview,
    resetEditorState,
    markSaved: markFlowSaved,
  };
}
