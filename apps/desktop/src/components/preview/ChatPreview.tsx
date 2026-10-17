import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FlowDefinition,
  FlowExecutionEvent,
  FlowExecutionResult,
} from "@zerobotforge/flow-engine";
import { AlertTriangle, Bot, Image as ImageIcon, MessageCircle } from "lucide-react";
import { runFlowPreview } from "../../services/preview.service";
import PreviewControls from "./PreviewControls";
import "../../styles/preview-chat.css";

interface ChatPreviewProps {
  flow: FlowDefinition;
}

type PreviewSelection = { kind: "button" | "choice" | "menu"; optionId: string };
interface ChatPreviewMessage {
  id: string;
  event: FlowExecutionEvent;
}

type MenuEventItem = Extract<FlowExecutionEvent, { type: "show_menu" }>["items"][number];

function buildPreviewMenuRows(items: MenuEventItem[]): MenuEventItem[][] {
  if (items.length === 0) return [];
  const grouped = new Map<number, MenuEventItem[]>();
  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx]!;
    const rowKey = item.row ?? Math.floor(idx / 2) + 1;
    const bucket = grouped.get(rowKey) ?? [];
    bucket.push(item);
    grouped.set(rowKey, bucket);
  }
  const sortedKeys = [...grouped.keys()].sort((a, b) => a - b);
  const rows: MenuEventItem[][] = [];

  for (const key of sortedKeys) {
    const bucket = grouped.get(key) ?? [];
    let current: MenuEventItem[] = [];
    let cap = 4;
    for (const item of bucket) {
      const itemCap =
        item.width === "full"
          ? 1
          : item.width === "half"
            ? 2
            : item.width === "third"
              ? 3
              : item.width === "quarter"
                ? 4
                : bucket.length;
      cap = Math.min(cap, itemCap);
      current.push(item);
      if (current.length >= cap) {
        rows.push(current);
        current = [];
        cap = 4;
      }
    }
    if (current.length > 0) {
      rows.push(current);
    }
  }
  return rows;
}

function cloneFlow(flow: FlowDefinition): FlowDefinition {
  return JSON.parse(JSON.stringify(flow)) as FlowDefinition;
}

function eventText(event: FlowExecutionEvent): string {
  switch (event.type) {
    case "send_text":
      return event.text;
    case "send_image":
      return event.caption ?? event.url;
    case "show_buttons":
      return event.text;
    case "show_choices":
      return event.prompt;
    case "show_menu":
      return event.text;
    case "action_completed":
      return `Action completed: ${event.operationId}`;
    case "action_failed":
      return `Action failed: ${event.operationId} — ${event.message}`;
  }
}

function eventKind(event: FlowExecutionEvent): string {
  switch (event.type) {
    case "send_text": return "Text message";
    case "send_image": return "Image message";
    case "show_buttons": return "Button selection";
    case "show_choices": return "Choice selection";
    case "show_menu": return "Persistent bot menu";
    case "action_completed": return "Action event";
    case "action_failed": return "Action error";
  }
}

export default function ChatPreview({ flow }: ChatPreviewProps) {
  const [flowSnapshot, setFlowSnapshot] = useState<FlowDefinition | null>(null);
  const [messages, setMessages] = useState<ChatPreviewMessage[]>([]);
  const [result, setResult] = useState<FlowExecutionResult | null>(null);
  const [selectedInput, setSelectedInput] = useState<PreviewSelection | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const runNumber = useRef(0);

  useEffect(() => {
    setFlowSnapshot(null);
    setMessages([]);
    setResult(null);
    setSelectedInput(null);
    setIsRunning(false);
    setPreviewError(null);
  }, [flow.id]);

  const flowChangedSinceStart = useMemo(
    () => flowSnapshot !== null && JSON.stringify(flowSnapshot) !== JSON.stringify(flow),
    [flowSnapshot, flow],
  );

  const appendEvents = useCallback((events: FlowExecutionEvent[]) => {
    runNumber.current += 1;
    const runId = runNumber.current;
    setMessages((current) => [
      ...current,
      ...events.map((event, index) => ({
        id: `${runId}-${index}-${event.nodeId}`,
        event,
      })),
    ]);
  }, []);

  const startOrRestart = useCallback(async () => {
    if (isRunning) return;
    const snapshot = cloneFlow(flow);
    setFlowSnapshot(snapshot);
    setMessages([]);
    setResult(null);
    setSelectedInput(null);
    setPreviewError(null);
    setIsRunning(true);

    try {
      const report = await runFlowPreview(snapshot);
      setResult(report.result);
      appendEvents(report.result.events);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Flow preview failed.");
    } finally {
      setIsRunning(false);
    }
  }, [appendEvents, flow, isRunning]);

  const nextStep = useCallback(async () => {
    if (
      isRunning ||
      !flowSnapshot ||
      !result ||
      result.status !== "waiting_for_input" ||
      !result.currentNodeId ||
      !selectedInput
    ) {
      return;
    }

    setIsRunning(true);
    setPreviewError(null);
    try {
      const report = await runFlowPreview(flowSnapshot, {
        resumeAtNodeId: result.currentNodeId,
        context: {
          ...result.context,
          variables: { ...result.context.variables },
          input: { ...selectedInput },
        },
      });
      setResult(report.result);
      setSelectedInput(null);
      appendEvents(report.result.events);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Flow preview could not continue.");
    } finally {
      setIsRunning(false);
    }
  }, [appendEvents, flowSnapshot, isRunning, result, selectedInput]);

  const pendingPrompt = useMemo(() => {
    if (result?.status !== "waiting_for_input" || !result.currentNodeId) return null;
    return [...result.events].reverse().find(
      (event) =>
        event.nodeId === result.currentNodeId &&
        (event.type === "show_buttons" ||
          event.type === "show_choices" ||
          event.type === "show_menu"),
    ) ?? null;
  }, [result]);
  const pendingPromptMessageId = useMemo(() => {
    if (!pendingPrompt) return null;
    return [...messages].reverse().find(({ event }) => event === pendingPrompt || (
      event.nodeId === pendingPrompt.nodeId && event.type === pendingPrompt.type
    ))?.id ?? null;
  }, [messages, pendingPrompt]);

  const chooseOption = (input: PreviewSelection) => {
    if (isRunning || result?.status !== "waiting_for_input") return;
    if (
      (pendingPrompt?.type === "show_buttons" && input.kind !== "button") ||
      (pendingPrompt?.type === "show_choices" && input.kind !== "choice") ||
      (pendingPrompt?.type === "show_menu" && input.kind !== "menu")
    ) {
      return;
    }
    setSelectedInput(input);
  };

  const hasStarted = result !== null || flowSnapshot !== null || messages.length > 0;
  const canContinue = result?.status === "waiting_for_input" && selectedInput !== null;

  return (
    <section className="flow-editor-panel flow-editor-preview-panel chat-preview-panel" aria-label="Flow conversation preview">
      <div className="flow-editor-panel-heading">
        <div>
          <h2><MessageCircle size={15} /> Conversation preview</h2>
          <p>Runs the existing flow executor locally. It does not connect to Telegram.</p>
        </div>
        <span className="chat-preview-local-badge">Local</span>
      </div>

      <PreviewControls
        status={result?.status ?? "idle"}
        hasStarted={hasStarted}
        isRunning={isRunning}
        canContinue={canContinue}
        onStartOrRestart={() => void startOrRestart()}
        onNextStep={() => void nextStep()}
      />

      {flowChangedSinceStart && (
        <p className="chat-preview-notice" role="status">
          The flow has changed since this preview started. Restart the preview to use the latest configuration.
        </p>
      )}

      <div className="chat-preview-transcript" aria-live="polite" aria-label="Preview conversation">
        {messages.length === 0 ? (
          <div className="chat-preview-empty">
            <span><Bot size={23} /></span>
            <strong>Preview is ready</strong>
            <p>Start the preview to execute the flow. Text, image, button, and choice events will appear here.</p>
          </div>
        ) : (
          messages.map(({ id, event }) => {
            const isActivePrompt =
              result?.status === "waiting_for_input" &&
              result.currentNodeId === event.nodeId &&
              id === pendingPromptMessageId &&
              (event.type === "show_buttons" ||
                event.type === "show_choices" ||
                event.type === "show_menu");

            return (
              <article className={`chat-preview-message ${event.type === "action_failed" ? "is-error" : ""}`} key={id}>
                <div className="chat-preview-message-label">
                  {event.type === "send_image" && <ImageIcon size={12} />}
                  <span>{eventKind(event)}</span>
                </div>
                {event.type === "send_image" ? (
                  <div className="chat-preview-image-content">
                    <img src={event.url} alt={event.altText ?? event.caption ?? "Flow image preview"} loading="lazy" />
                    {event.caption && <p>{event.caption}</p>}
                    <a href={event.url} target="_blank" rel="noreferrer">Open image URL</a>
                  </div>
                ) : (
                  <p className="chat-preview-message-text">{eventText(event)}</p>
                )}

                {event.type === "show_buttons" && (
                  <div className="chat-preview-options" aria-label="Button options">
                    {event.buttons.map((option) => {
                      const selected = selectedInput?.kind === "button" && selectedInput.optionId === option.id;
                      const colorClass = `is-color-${option.color ?? "default"}`;
                      return (
                        <button
                          type="button"
                          key={option.id}
                          className={`${colorClass} ${selected ? "is-selected" : ""}`.trim()}
                          disabled={!isActivePrompt || isRunning}
                          aria-pressed={selected}
                          onClick={() => chooseOption({ kind: "button", optionId: option.id })}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {event.type === "show_choices" && (
                  <div className="chat-preview-options" aria-label="Choice options">
                    {event.options.map((option) => {
                      const selected = selectedInput?.kind === "choice" && selectedInput.optionId === option.id;
                      const colorClass = `is-color-${option.color ?? "default"}`;
                      return (
                        <button
                          type="button"
                          key={option.id}
                          className={`${colorClass} ${selected ? "is-selected" : ""}`.trim()}
                          disabled={!isActivePrompt || isRunning}
                          aria-pressed={selected}
                          onClick={() => chooseOption({ kind: "choice", optionId: option.id })}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {event.type === "show_menu" && (
                  <div className="chat-preview-menu-dock" aria-label="Persistent bot menu">
                    {event.placeholder && (
                      <div className="chat-preview-menu-placeholder">
                        <span>{event.placeholder}</span>
                      </div>
                    )}
                    <div className="chat-preview-menu-rows">
                      {buildPreviewMenuRows(event.items).map((rowItems, rowIndex) => (
                        <div
                          key={`menu-row-${rowIndex}`}
                          className="chat-preview-menu-row"
                          style={{
                            gridTemplateColumns: `repeat(${rowItems.length}, minmax(0, 1fr))`,
                          }}
                        >
                          {rowItems.map((item) => {
                            const selected =
                              selectedInput?.kind === "menu" &&
                              selectedInput.optionId === item.id;
                            const colorClass = `is-color-${item.color ?? "default"}`;
                            return (
                              <button
                                type="button"
                                key={item.id}
                                className={`chat-preview-menu-button ${colorClass} ${
                                  selected ? "is-selected" : ""
                                }`.trim()}
                                disabled={!isActivePrompt || isRunning}
                                aria-pressed={selected}
                                onClick={() =>
                                  chooseOption({ kind: "menu", optionId: item.id })
                                }
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
        {isRunning && <p className="chat-preview-running">Executing flow…</p>}
      </div>

      {selectedInput && (
        <p className="chat-preview-selection-note">
          Selected option: <strong>{selectedInput.optionId}</strong>. Use “Next step” to continue the flow.
        </p>
      )}

      {previewError && (
        <div className="chat-preview-error" role="alert">
          <AlertTriangle size={16} />
          <span>{previewError}</span>
        </div>
      )}

      {result && result.errors.length > 0 && (
        <div className="chat-preview-errors" role="alert" aria-label="Flow execution errors">
          {result.errors.map((issue, index) => (
            <div className="chat-preview-error" key={`${issue.code}-${index}`}>
              <AlertTriangle size={15} />
              <span><strong>{issue.code}</strong> {issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {result && (
        <p className="chat-preview-run-summary">
          {result.steps} step(s) processed in the latest execution. Preview context is separate from the real bot runtime.
        </p>
      )}
    </section>
  );
}
