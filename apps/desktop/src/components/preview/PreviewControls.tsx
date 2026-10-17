import { Play, RotateCcw, StepForward } from "lucide-react";

type PreviewStatus = "idle" | "completed" | "waiting_for_input" | "failed" | "step_limit_exceeded";

export interface PreviewControlsProps {
  status: PreviewStatus;
  hasStarted: boolean;
  isRunning: boolean;
  canContinue: boolean;
  onStartOrRestart: () => void;
  onNextStep: () => void;
}

const STATUS_LABELS: Record<PreviewStatus, string> = {
  idle: "Not started",
  completed: "Completed",
  waiting_for_input: "Waiting for selection",
  failed: "Failed",
  step_limit_exceeded: "Step limit exceeded",
};

export default function PreviewControls({
  status,
  hasStarted,
  isRunning,
  canContinue,
  onStartOrRestart,
  onNextStep,
}: PreviewControlsProps) {
  const statusClass =
    status === "failed" || status === "step_limit_exceeded"
      ? "is-error"
      : status === "completed"
        ? "is-success"
        : "";

  return (
    <div className="preview-chat-controls">
      <div className="preview-chat-status-wrap">
        <span className="preview-chat-status-label">Execution status</span>
        <span className={`preview-chat-status ${statusClass}`} role="status" aria-live="polite">
          {isRunning ? "Running…" : STATUS_LABELS[status]}
        </span>
      </div>
      <div className="preview-chat-control-buttons">
        <button
          type="button"
          className="button-secondary"
          onClick={onStartOrRestart}
          disabled={isRunning}
        >
          {hasStarted ? <RotateCcw size={15} /> : <Play size={15} />}
          {hasStarted ? "Restart preview" : "Start preview"}
        </button>
        <button
          type="button"
          className="button-primary"
          onClick={onNextStep}
          disabled={isRunning || !canContinue}
          title={canContinue ? "Continue the flow with the selected option" : "Select a button or choice option first"}
        >
          <StepForward size={15} /> Next step
        </button>
      </div>
    </div>
  );
}
