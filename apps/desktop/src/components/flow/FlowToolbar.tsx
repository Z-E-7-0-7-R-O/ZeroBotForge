import { useEffect, useState } from "react";

import {
  CheckCircle2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Workflow,
} from "lucide-react";

export interface FlowToolbarProps {
  flowName: string;
  nodeCount: number;
  edgeCount: number;
  selectedItem: boolean;
  isValid: boolean;
  isSaving: boolean;
  onFlowNameChange: (name: string) => void;
  onNewFlow: () => void;
  onDeleteSelected: () => void;
  onValidate: () => void;
  onSave: () => void;
}

export default function FlowToolbar({
  flowName,
  nodeCount,
  edgeCount,
  selectedItem,
  isValid,
  isSaving,
  onFlowNameChange,
  onNewFlow,
  onDeleteSelected,
  onValidate,
  onSave,
}: FlowToolbarProps) {
  const [flowNameDraft, setFlowNameDraft] = useState(flowName);

  useEffect(() => {
    setFlowNameDraft(flowName);
  }, [flowName]);

  return (
    <div className="flow-editor-toolbar">
      <div className="flow-toolbar-flow-title">
        <span className="flow-toolbar-icon"><Workflow size={18} /></span>
        <label>
          <span>FLOW NAME</span>
          <input
            value={flowNameDraft}
            maxLength={120}
            aria-label="Flow name"
            onChange={(event) => setFlowNameDraft(event.target.value)}
            onBlur={() => {
              if (flowNameDraft.trim()) onFlowNameChange(flowNameDraft.trim());
              else setFlowNameDraft(flowName);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setFlowNameDraft(flowName);
            }}
          />
        </label>
      </div>

      <div className="flow-toolbar-metrics" aria-label="Flow size">
        <span>{nodeCount} nodes</span>
        <span className="flow-toolbar-metric-separator">·</span>
        <span>{edgeCount} connections</span>
        <span className={`flow-validity-pill ${isValid ? "is-valid" : "is-invalid"}`}>
          {isValid ? <CheckCircle2 size={13} /> : <ShieldCheck size={13} />}
          {isValid ? "Valid structure" : "Invalid flow"}
        </span>
      </div>

      <div className="flow-toolbar-actions">
        <button type="button" className="button-secondary" onClick={onNewFlow}>
          <Plus size={15} /> New flow
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={!selectedItem}
          onClick={onDeleteSelected}
        >
          <Trash2 size={15} /> Remove selected
        </button>
        <button type="button" className="button-secondary" onClick={onValidate}>
          <ShieldCheck size={15} /> Validate
        </button>
        <button type="button" className="button-primary" disabled={isSaving} onClick={onSave}>
          <Save size={15} /> {isSaving ? "Saving…" : "Save project"}
        </button>
      </div>
    </div>
  );
}
