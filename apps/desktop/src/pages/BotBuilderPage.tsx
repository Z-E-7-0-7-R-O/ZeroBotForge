import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Settings,
  Sparkles,
  X,
} from "lucide-react";

import {
  DEFAULT_NODE_REGISTRY,
} from "@zerobotforge/flow-engine/registry";

import {
  validateFlow,
} from "@zerobotforge/flow-engine/validator";

import type {
  FlowDefinition,
  FlowNode,
  SupportedFlowNodeType,
} from "@zerobotforge/flow-engine";

import AppLayout from "../components/layout/AppLayout";
import type { NavigationPage } from "../components/layout/Sidebar";
import ConfirmDialog from "../components/common/ConfirmDialog";
import EmptyState from "../components/common/EmptyState";
import { useNotifications } from "../hooks/useNotifications";
import { useFlow } from "../hooks/useFlow";

import FlowCanvas from "../components/flow/FlowCanvas";
import FlowToolbar from "../components/flow/FlowToolbar";
import NodePalette from "../components/flow/NodePalette";
import NodeEditor from "../components/flow/NodeEditor";
import ChatPreview from "../components/preview/ChatPreview";

import {
  createDefaultNodeData,
  createEditorId,
  createEmptyEditorFlow,
  toEngineFlow,
  toProjectFlow,
} from "../components/flow/flow-editor.model";

import type {
  ProjectDocumentDto,
  ProjectSession,
} from "../types/electron-api";

import "../styles/flow-editor.css";

interface BotBuilderPageProps {
  activePage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  session: ProjectSession | null;
  onSessionChange: (session: ProjectSession | null) => void;
  onSaveProject: (document: ProjectDocumentDto) => Promise<void>;
}

type PendingDelete =
  | { kind: "node"; id: string; label: string }
  | { kind: "edge"; id: string; label: string }
  | null;

function getIssueNodeIds(
  flow: FlowDefinition,
  result: ReturnType<typeof validateFlow>,
): Set<string> {
  const resultIds = new Set<string>();
  if (result.valid) return resultIds;

  for (const entry of result.issues) {
    const [section, index] = entry.path;
    if (section === "nodes" && typeof index === "number") {
      const node = flow.nodes[index];
      if (node) resultIds.add(node.id);
    }
    if (section === "edges" && typeof index === "number") {
      const edge = flow.edges[index];
      if (edge) {
        resultIds.add(edge.sourceNodeId);
        resultIds.add(edge.targetNodeId);
      }
    }
  }
  return resultIds;
}

export default function BotBuilderPage({
  activePage,
  onNavigate,
  session,
  onSessionChange,
  onSaveProject,
}: BotBuilderPageProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [showBotSettings, setShowBotSettings] = useState(false);
  const [botNameDraft, setBotNameDraft] = useState(
    session?.document.bot.displayName ?? "My Telegram Bot",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const {
    notifications,
    notify,
    dismissNotification,
  } = useNotifications();

  const document = session?.document ?? null;
  const activeFlowDto = document
    ? document.flows.find((flow) => flow.id === document.activeFlowId) ?? document.flows[0] ?? null
    : null;
  const activeFlow = useMemo(
    () => activeFlowDto ? toEngineFlow(activeFlowDto) : null,
    [activeFlowDto],
  );
  const mirrorFlowIntoProject = useCallback((nextFlow: FlowDefinition) => {
    if (!session) return;
    const nextFlowDto = toProjectFlow(nextFlow);
    const exists = session.document.flows.some((entry) => entry.id === nextFlowDto.id);
    const flows = exists
      ? session.document.flows.map((entry) => entry.id === nextFlowDto.id ? nextFlowDto : entry)
      : [...session.document.flows, nextFlowDto];
    onSessionChange({
      ...session,
      document: {
        ...session.document,
        flows,
        activeFlowId: nextFlowDto.id,
        updatedAt: new Date().toISOString(),
      },
    });
  }, [session, onSessionChange]);
  const flowEditor = useFlow(activeFlow, mirrorFlowIntoProject);
  const selectFlowNodeInStore = flowEditor.selectNode;
  const selectFlowEdgeInStore = flowEditor.selectEdge;
  const clearFlowSelectionInStore = flowEditor.clearSelection;

  useEffect(() => {
    if (selectedNodeId !== null) selectFlowNodeInStore(selectedNodeId);
    else if (selectedEdgeId !== null) selectFlowEdgeInStore(selectedEdgeId);
    else clearFlowSelectionInStore();
  }, [selectedNodeId, selectedEdgeId, selectFlowNodeInStore, selectFlowEdgeInStore, clearFlowSelectionInStore]);

  const validation = useMemo(
    () => activeFlow ? validateFlow(activeFlow) : null,
    [activeFlow],
  );
  const invalidNodeIds = useMemo(
    () => activeFlow && validation
      ? getIssueNodeIds(activeFlow, validation)
      : new Set<string>(),
    [activeFlow, validation],
  );
  const selectedNode = activeFlow?.nodes.find(
    (node) => node.id === selectedNodeId,
  ) ?? null;
  const selectedEdge = activeFlow?.edges.find(
    (edge) => edge.id === selectedEdgeId,
  ) ?? null;

  useEffect(() => {
    if (!session) {
      setBotNameDraft("My Telegram Bot");
      return;
    }
    setBotNameDraft(session.document.bot.displayName);
  }, [session?.document.id, session?.document.bot.displayName]);

  // Seed a new project's persisted document with a real Start node, not sample UI data.
  useEffect(() => {
    if (!session || session.document.flows.length > 0) return;
    const flow = createEmptyEditorFlow();
    const nextDocument: ProjectDocumentDto = {
      ...session.document,
      flows: [toProjectFlow(flow)],
      activeFlowId: flow.id,
      updatedAt: new Date().toISOString(),
    };
    onSessionChange({ ...session, document: nextDocument });
  }, [session, onSessionChange]);

  useEffect(() => {
    if (!session || session.document.flows.length === 0) return;
    const activeId = session.document.activeFlowId;
    const activeExists = activeId !== null && session.document.flows.some(
      (flow) => flow.id === activeId,
    );
    if (activeExists) return;
    const firstFlow = session.document.flows[0];
    if (!firstFlow) return;
    onSessionChange({
      ...session,
      document: {
        ...session.document,
        activeFlowId: firstFlow.id,
      },
    });
  }, [session, onSessionChange]);

  const updateDocument = (nextDocument: ProjectDocumentDto) => {
    if (!session) return;
    onSessionChange({ ...session, document: nextDocument });
  };

  const updateFlow = (nextFlow: FlowDefinition) => {
    if (!session) return;
    flowEditor.recordChange(nextFlow);
  };

  const selectFlow = (flowId: string) => {
    if (!session) return;
    updateDocument({
      ...session.document,
      activeFlowId: flowId,
      updatedAt: new Date().toISOString(),
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setShowValidation(false);
  };

  const createNewFlow = () => {
    if (!session) return;
    const nextFlow = createEmptyEditorFlow(`Flow ${session.document.flows.length + 1}`);
    updateFlow(nextFlow);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setShowValidation(false);
    notify({
      type: "success",
      title: "Flow created",
      message: `A new flow with a Start node was added to ${session.document.name}. Save the project to persist it to disk.`,
    });
  };

  const addNode = (type: SupportedFlowNodeType) => {
    if (!session || !activeFlow) return;
    if (type === "start" && activeFlow.nodes.some((node) => node.type === "start")) {
      notify({
        type: "warning",
        title: "Start node already exists",
        message: "A flow must contain exactly one Start node.",
      });
      return;
    }
    const definition = DEFAULT_NODE_REGISTRY.get(type);
    if (!definition) {
      notify({ type: "error", title: "Unsupported node", message: `No registry definition exists for ${type}.` });
      return;
    }
    const nonStartNodes = activeFlow.nodes.filter((node) => node.type !== "start").length;
    const nextNode: FlowNode = {
      id: createEditorId() as FlowNode["id"],
      type,
      label: definition.title,
      position: {
        x: 420 + (nonStartNodes % 2) * 340,
        y: 90 + Math.floor(nonStartNodes / 2) * 220,
      },
      data: createDefaultNodeData(type),
    };
    updateFlow({ ...activeFlow, nodes: [...activeFlow.nodes, nextNode] });
    setSelectedNodeId(nextNode.id);
    setSelectedEdgeId(null);
    setShowValidation(true);
  };

  const updateNode = (
    nextNode: FlowNode,
    removedOutputHandles: string[] = [],
  ) => {
    if (!activeFlow) return;
    const nextEdges = removedOutputHandles.length === 0
      ? activeFlow.edges
      : activeFlow.edges.filter((edge) =>
          edge.sourceNodeId !== nextNode.id ||
          !removedOutputHandles.includes(edge.sourceHandle),
        );
    updateFlow({
      ...activeFlow,
      nodes: activeFlow.nodes.map((node) => node.id === nextNode.id ? nextNode : node),
      edges: nextEdges,
    });
  };

  const requestDeleteSelected = () => {
    if (selectedNode) {
      if (selectedNode.type === "start") {
        notify({
          type: "warning",
          title: "Start node is protected",
          message: "The Start node cannot be removed. Add or edit other nodes instead.",
        });
        return;
      }
      setPendingDelete({ kind: "node", id: selectedNode.id, label: selectedNode.label });
      return;
    }
    if (selectedEdge) {
      const source = activeFlow?.nodes.find((node) => node.id === selectedEdge.sourceNodeId);
      const target = activeFlow?.nodes.find((node) => node.id === selectedEdge.targetNodeId);
      setPendingDelete({
        kind: "edge",
        id: selectedEdge.id,
        label: `${source?.label ?? "Missing source"} → ${target?.label ?? "Missing target"}`,
      });
    }
  };

  const confirmDeleteSelected = () => {
    if (!pendingDelete || !activeFlow) return;
    if (pendingDelete.kind === "node") {
      const nextFlow: FlowDefinition = {
        ...activeFlow,
        nodes: activeFlow.nodes.filter((node) => node.id !== pendingDelete.id),
        edges: activeFlow.edges.filter(
          (edge) => edge.sourceNodeId !== pendingDelete.id && edge.targetNodeId !== pendingDelete.id,
        ),
      };
      updateFlow(nextFlow);
      setSelectedNodeId(null);
      notify({ type: "success", title: "Node removed", message: "The node and its connected edges were removed from the flow model." });
    } else {
      updateFlow({
        ...activeFlow,
        edges: activeFlow.edges.filter((edge) => edge.id !== pendingDelete.id),
      });
      setSelectedEdgeId(null);
      notify({ type: "success", title: "Connection removed", message: "The connection was removed from the flow model." });
    }
    setPendingDelete(null);
  };

  const runValidation = () => {
    setShowValidation(true);
    flowEditor.validateCurrentFlow(activeFlow);
    if (!validation) {
      notify({ type: "warning", title: "No flow selected", message: "Create or open a project flow before validating." });
      return;
    }
    if (validation.valid) {
      notify({ type: "success", title: "Flow validation passed", message: "The flow schema, node settings, port references and required output connections are valid." });
    } else {
      notify({
        type: "warning",
        title: `Flow has ${validation.issues.length} validation issue${validation.issues.length === 1 ? "" : "s"}`,
        message: validation.issues[0]?.message ?? "Review the validation panel for details.",
      });
    }
  };

  const saveProject = async () => {
    if (!session) {
      notify({ type: "warning", title: "No project is open", message: "Create or open a project from Dashboard before saving." });
      return;
    }
    const displayName = botNameDraft.trim();
    if (!displayName) {
      notify({ type: "warning", title: "Bot name is required", message: "Enter a non-empty bot display name before saving." });
      setShowBotSettings(true);
      return;
    }

    const nextDocument: ProjectDocumentDto = {
      ...session.document,
      bot: { ...session.document.bot, displayName },
      updatedAt: new Date().toISOString(),
    };

    setIsSaving(true);
    try {
      onSessionChange({ ...session, document: nextDocument });
      await onSaveProject(nextDocument);
      flowEditor.markSaved();
      notify({ type: "success", title: "Project saved", message: "Flow nodes, edges, positions and node settings were sent to the project storage service." });
    } catch (error) {
      notify({
        type: "error",
        title: "Project could not be saved",
        message: error instanceof Error ? error.message : "An unexpected storage error occurred.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const changeBotName = (value: string) => {
    setBotNameDraft(value);
    if (!session || !value.trim()) return;
    updateDocument({
      ...session.document,
      bot: { ...session.document.bot, displayName: value },
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <>
      <AppLayout
        activePage={activePage}
        onNavigate={onNavigate}
        onSettingsClick={() => onNavigate("Settings")}
        settingsOpen={showBotSettings}
        notifications={notifications}
        onDismissNotification={dismissNotification}
      >
        <div className="page-heading flow-editor-page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> FLOW ENGINE · VISUAL EDITOR</div>
            <h1>Bot Builder</h1>
            <p className="page-subtitle">
              {document
                ? `Editing ${document.name} · changes update the project document in memory until saved.`
                : "Create or open a project from Dashboard to begin editing a flow."}
            </p>
          </div>
          <div className="heading-actions flow-editor-page-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={!session}
              onClick={() => setShowBotSettings((value) => !value)}
            >
              <Settings size={16} /> Configure bot
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={() => notify({
                type: "info",
                title: "Publishing is not connected",
                message: "This phase implements visual flow editing and project persistence; Telegram publishing is not part of the current runtime flow.",
              })}
            >
              <Sparkles size={16} /> Publish bot
            </button>
          </div>
        </div>

        {showBotSettings && session && (
          <div className="settings-strip flow-editor-bot-settings">
            <label>
              Bot display name
              <input
                value={botNameDraft}
                maxLength={120}
                onChange={(event) => changeBotName(event.target.value)}
                onBlur={() => {
                  if (!botNameDraft.trim()) setBotNameDraft(session.document.bot.displayName);
                }}
              />
            </label>
            <span>Saved in project: <strong>{session.document.bot.displayName || "Untitled bot"}</strong></span>
            <button type="button" className="icon-button" aria-label="Close bot settings" onClick={() => setShowBotSettings(false)}>
              <X size={15} />
            </button>
          </div>
        )}

        {!session ? (
          <div className="flow-editor-no-project">
            <EmptyState
              icon={<Bot size={24} />}
              title="No project is open"
              description="Open or create a project from Dashboard. The visual editor uses the selected project's stored flow data."
            />
            <button type="button" className="button-primary" onClick={() => onNavigate("Dashboard")}>
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="flow-editor-page">
            <div className="flow-editor-flow-picker-row">
              <label className="flow-editor-flow-picker">
                <span>ACTIVE FLOW</span>
                <select
                  value={activeFlowDto?.id ?? ""}
                  onChange={(event) => selectFlow(event.target.value)}
                  disabled={session.document.flows.length === 0}
                >
                  {session.document.flows.map((flow) => (
                    <option key={flow.id} value={flow.id}>{flow.name}</option>
                  ))}
                </select>
              </label>
              <span className="flow-editor-project-path">{session.fileName ?? "Not saved to disk yet"}</span>
            </div>

            {activeFlow && validation && (
              <>
                <FlowToolbar
                  flowName={activeFlow.name}
                  nodeCount={activeFlow.nodes.length}
                  edgeCount={activeFlow.edges.length}
                  selectedItem={Boolean(selectedNodeId || selectedEdgeId)}
                  isValid={validation.valid}
                  isSaving={isSaving}
                  onFlowNameChange={(name) => {
                    if (name.trim()) updateFlow({ ...activeFlow, name });
                  }}
                  onNewFlow={createNewFlow}
                  onDeleteSelected={requestDeleteSelected}
                  onValidate={runValidation}
                  onSave={() => void saveProject()}
                />

                <div className="flow-editor-workbench">
                  <NodePalette
                    hasStartNode={activeFlow.nodes.some((node) => node.type === "start")}
                    onAddNode={addNode}
                  />

                  <FlowCanvas
                    key={activeFlow.id}
                    flow={activeFlow}
                    selectedNodeId={selectedNodeId}
                    selectedEdgeId={selectedEdgeId}
                    invalidNodeIds={invalidNodeIds}
                    onChange={updateFlow}
                    onSelectNode={setSelectedNodeId}
                    onSelectEdge={setSelectedEdgeId}
                    onConnectionMessage={(message, isError) => notify({
                      type: isError ? "warning" : "success",
                      title: isError ? "Connection not created" : "Flow connection",
                      message,
                    })}
                  />

                  <aside className="flow-editor-inspector-stack">
                    <NodeEditor node={selectedNode} onUpdate={updateNode} onDelete={requestDeleteSelected} />

                    {selectedEdge && (
                      <section className="flow-editor-panel flow-selected-edge-panel">
                        <div className="flow-editor-panel-heading">
                          <div>
                            <h2>Selected connection</h2>
                            <p>Stored as an edge in the active flow.</p>
                          </div>
                        </div>
                        <p className="flow-selected-edge-summary">
                          {activeFlow.nodes.find((node) => node.id === selectedEdge.sourceNodeId)?.label ?? "Missing source"}
                          {" → "}
                          {activeFlow.nodes.find((node) => node.id === selectedEdge.targetNodeId)?.label ?? "Missing target"}
                        </p>
                        <code>sourceHandle: {selectedEdge.sourceHandle}</code>
                        <code>targetHandle: {selectedEdge.targetHandle ?? "(not set)"}</code>
                        <button type="button" className="button-secondary full-width" onClick={requestDeleteSelected}>
                          Remove connection
                        </button>
                      </section>
                    )}

                    <ChatPreview key={activeFlow.id} flow={activeFlow} />

                    {showValidation && (
                      <section className={`flow-editor-panel flow-validation-panel ${validation.valid ? "is-valid" : "is-invalid"}`}>
                        <div className="flow-editor-panel-heading">
                          <div>
                            <h2>{validation.valid ? "Validation passed" : "Validation issues"}</h2>
                            <p>{validation.valid ? "The flow-engine validator accepted this flow." : `${validation.issues.length} issue${validation.issues.length === 1 ? "" : "s"} found by the flow engine.`}</p>
                          </div>
                          {validation.valid ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        </div>
                        {validation.valid ? (
                          <p className="flow-validation-success">Node schemas, edge references and port rules are valid.</p>
                        ) : (
                          <ol className="flow-validation-list">
                            {validation.issues.map((issue, index) => (
                              <li key={`${issue.code}-${index}`}>
                                <strong>{issue.code}</strong>
                                <span>{issue.message}</span>
                                <code>{issue.path.join(" / ")}</code>
                              </li>
                            ))}
                          </ol>
                        )}
                      </section>
                    )}
                  </aside>
                </div>
              </>
            )}
          </div>
        )}
      </AppLayout>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.kind === "edge" ? "Remove connection" : "Remove flow node"}
        message={(
          <>
            Are you sure you want to remove <strong>{pendingDelete?.label ?? "this item"}</strong>?
            {pendingDelete?.kind === "node"
              ? " All edges connected to this node will also be removed."
              : " This connection will be removed from the stored flow model."}
          </>
        )}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        pendingLabel="Removing…"
        variant="danger"
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDeleteSelected}
      />
    </>
  );
}
