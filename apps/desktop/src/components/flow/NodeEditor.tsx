import { useEffect, useState } from "react";

import {
  AlertTriangle,
  LayoutGrid,
  Plus,
  Trash2,
} from "lucide-react";

import type {
  FlowButtonColor,
  FlowMenuButtonWidth,
  FlowNode,
} from "@zerobotforge/flow-engine";

import type { JsonValue } from "../../types/electron-api";
import { createEditorId } from "./flow-editor.model";

export interface NodeEditorProps {
  node: FlowNode | null;
  onUpdate: (node: FlowNode, removedOutputHandles?: string[]) => void;
  onDelete: () => void;
}

type OptionEntry = {
  id: string;
  label: string;
  color: FlowButtonColor;
  row?: number;
  width?: FlowMenuButtonWidth;
};

const BUTTON_COLOR_SWATCHES: ReadonlyArray<{
  value: FlowButtonColor;
  title: string;
}> = [
  { value: "default", title: "Default Telegram style (Dark gray)" },
  { value: "green", title: "Green button style" },
  { value: "blue", title: "Blue button style" },
  { value: "red", title: "Red button style" },
];

const MENU_WIDTH_OPTIONS: ReadonlyArray<{
  value: FlowMenuButtonWidth;
  label: string;
}> = [
  { value: "auto", label: "Auto (by row)" },
  { value: "full", label: "Full width (1 per row)" },
  { value: "half", label: "Half width (2 per row)" },
  { value: "third", label: "Third width (3 per row)" },
  { value: "quarter", label: "Quarter width (4 per row)" },
];

function readString(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function readBoolean(value: JsonValue | undefined, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeColor(value: JsonValue | undefined): FlowButtonColor {
  return value === "green" || value === "blue" || value === "red"
    ? value
    : "default";
}

function normalizeWidth(value: JsonValue | undefined): FlowMenuButtonWidth {
  return value === "full" ||
    value === "half" ||
    value === "third" ||
    value === "quarter"
    ? value
    : "auto";
}

function readOptions(value: JsonValue | undefined): OptionEntry[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((entry, idx) => ({
    id: typeof entry.id === "string" ? entry.id : "",
    label: typeof entry.label === "string" ? entry.label : "",
    color: normalizeColor(entry.color),
    row:
      typeof entry.row === "number" &&
      Number.isInteger(entry.row) &&
      entry.row >= 1 &&
      entry.row <= 12
        ? entry.row
        : Math.floor(idx / 2) + 1,
    width: normalizeWidth(entry.width),
  }));
}

function newOptionId(prefix = "option"): string {
  return `${prefix}_${createEditorId().replace(/-/g, "").slice(0, 10)}`;
}

function groupMenuPreviewRows(entries: OptionEntry[]): OptionEntry[][] {
  if (entries.length === 0) return [];
  const grouped = new Map<number, OptionEntry[]>();
  for (const entry of entries) {
    const rowNum = entry.row ?? 1;
    const list = grouped.get(rowNum) ?? [];
    list.push(entry);
    grouped.set(rowNum, list);
  }
  const sortedRows = [...grouped.keys()].sort((a, b) => a - b);
  const result: OptionEntry[][] = [];

  for (const rowKey of sortedRows) {
    const items = grouped.get(rowKey) ?? [];
    let current: OptionEntry[] = [];
    let rowLimit = 4;

    for (const item of items) {
      const widthCap =
        item.width === "full"
          ? 1
          : item.width === "half"
            ? 2
            : item.width === "third"
              ? 3
              : item.width === "quarter"
                ? 4
                : items.length;
      rowLimit = Math.min(rowLimit, widthCap);
      current.push(item);
      if (current.length >= rowLimit) {
        result.push(current);
        current = [];
        rowLimit = 4;
      }
    }
    if (current.length > 0) {
      result.push(current);
    }
  }

  return result;
}

export default function NodeEditor({
  node,
  onUpdate,
  onDelete,
}: NodeEditorProps) {
  const paramsValue = node?.data.params;
  const normalizedParams = isRecord(paramsValue)
    ? JSON.stringify(paramsValue, null, 2)
    : "{}";
  const [paramsDraft, setParamsDraft] = useState(normalizedParams);
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState(node?.label ?? "");

  useEffect(() => {
    setParamsDraft(normalizedParams);
    setParamsError(null);
  }, [node?.id, normalizedParams]);

  useEffect(() => {
    setLabelDraft(node?.label ?? "");
  }, [node?.id]);

  if (!node) {
    return (
      <section className="flow-editor-panel flow-node-editor flow-node-editor--empty">
        <div className="flow-editor-panel-heading">
          <div>
            <h2>Node settings</h2>
            <p>Select a node on the canvas to configure it.</p>
          </div>
        </div>
        <div className="flow-node-editor-empty-art" aria-hidden="true">◇</div>
        <p className="flow-node-editor-empty-copy">
          Node configuration is written directly to the current flow model.
        </p>
      </section>
    );
  }

  const patchData = (key: string, value: unknown) => {
    const nextData: Record<string, JsonValue> = { ...node.data };
    if (value === undefined) {
      delete nextData[key];
    } else {
      nextData[key] = value as JsonValue;
    }
    onUpdate({
      ...node,
      data: nextData as FlowNode["data"],
    });
  };

  const patchOptionalString = (key: string, rawValue: string) => {
    if (rawValue.trim().length === 0) {
      patchData(key, undefined);
      return;
    }
    patchData(key, rawValue);
  };

  const serializeOptionEntries = (
    key: "buttons" | "options" | "items",
    entries: OptionEntry[],
  ) => {
    if (key === "items") {
      return entries.map((entry) => ({
        id: entry.id,
        label: entry.label,
        color: entry.color,
        row: entry.row ?? 1,
        width: entry.width ?? "auto",
      }));
    }
    return entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      color: entry.color,
    }));
  };

  const patchOption = (
    key: "buttons" | "options" | "items",
    index: number,
    patch: Partial<OptionEntry>,
  ) => {
    const current = readOptions(node.data[key]);
    const next = current.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, ...patch } : entry,
    );
    patchData(key, serializeOptionEntries(key, next));
  };

  const addOption = (key: "buttons" | "options" | "items") => {
    const current = readOptions(node.data[key]);
    const maxLimit = key === "items" ? 24 : 20;
    if (current.length >= maxLimit) return;

    const highestRow = current.reduce(
      (max, item) => Math.max(max, item.row ?? 1),
      1,
    );
    const itemsInHighestRow = current.filter(
      (item) => (item.row ?? 1) === highestRow,
    ).length;
    const nextRow =
      current.length === 0
        ? 1
        : itemsInHighestRow >= 2
          ? Math.min(12, highestRow + 1)
          : highestRow;

    const next: OptionEntry[] = [
      ...current,
      {
        id: newOptionId(key === "items" ? "menu" : "option"),
        label:
          key === "items"
            ? `Menu Button ${current.length + 1}`
            : `Option ${current.length + 1}`,
        color: "default",
        row: nextRow,
        width: key === "items" ? "half" : "auto",
      },
    ];
    patchData(key, serializeOptionEntries(key, next));
  };

  const removeOption = (
    key: "buttons" | "options" | "items",
    index: number,
  ) => {
    const current = readOptions(node.data[key]);
    const minimum = key === "options" ? 2 : 1;
    if (current.length <= minimum) return;

    const removed = current[index];
    const next = current.filter((_, entryIndex) => entryIndex !== index);
    const handlePrefix =
      key === "buttons" ? "button:" : key === "options" ? "choice:" : "menu:";
    const removedHandles = removed ? [`${handlePrefix}${removed.id}`] : [];

    onUpdate(
      {
        ...node,
        data: {
          ...node.data,
          [key]: serializeOptionEntries(key, next),
        } as FlowNode["data"],
      },
      removedHandles,
    );
  };

  const applyMenuLayoutPreset = (
    preset: "two_col" | "three_col" | "full_stack" | "hero_grid",
  ) => {
    const current = readOptions(node.data.items);
    if (current.length === 0) return;

    const updated = current.map((entry, index): OptionEntry => {
      if (preset === "full_stack") {
        return {
          ...entry,
          row: Math.min(12, index + 1),
          width: "full",
        };
      }
      if (preset === "two_col") {
        return {
          ...entry,
          row: Math.min(12, Math.floor(index / 2) + 1),
          width: "half",
        };
      }
      if (preset === "three_col") {
        return {
          ...entry,
          row: Math.min(12, Math.floor(index / 3) + 1),
          width: "third",
        };
      }
      // hero_grid: Row 1 has 2 half-width buttons, middle rows have 3 third-width buttons, last button is full-width
      if (index < 2) {
        return { ...entry, row: 1, width: "half" };
      }
      if (index === current.length - 1 && current.length >= 3) {
        return { ...entry, row: Math.min(12, Math.ceil(current.length / 2) + 1), width: "full" };
      }
      const offset = index - 2;
      return {
        ...entry,
        row: Math.min(11, Math.floor(offset / 3) + 2),
        width: "third",
      };
    });

    patchData("items", serializeOptionEntries("items", updated));
  };

  const renderColorCubeSelector = (
    key: "buttons" | "options" | "items",
    index: number,
    selectedColor: FlowButtonColor,
  ) => (
    <div
      className="flow-option-color-row"
      role="radiogroup"
      aria-label="Telegram button color"
    >
      <div className="flow-option-color-cubes">
        {BUTTON_COLOR_SWATCHES.map((swatch) => {
          const isSelected = selectedColor === swatch.value;
          return (
            <button
              key={swatch.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={swatch.title}
              title={swatch.title}
              className={`flow-color-cube flow-color-cube--${swatch.value} ${
                isSelected ? "is-selected" : ""
              }`}
              onClick={() => patchOption(key, index, { color: swatch.value })}
            />
          );
        })}
      </div>
    </div>
  );

  const optionsEditor = (
    key: "buttons" | "options",
    title: string,
  ) => {
    const entries = readOptions(node.data[key]);
    const minimum = key === "options" ? 2 : 1;

    return (
      <div className="flow-editor-form-section">
        <div className="flow-editor-form-section-heading">
          <div>
            <strong>{title}</strong>
            <small>{entries.length} configured · maximum 20</small>
          </div>
          <button
            type="button"
            className="flow-editor-mini-button"
            disabled={entries.length >= 20}
            onClick={() => addOption(key)}
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {entries.map((entry, index) => (
          <div className="flow-option-editor" key={entry.id || index}>
            <div className="flow-option-id">
              <span>PORT ID</span>
              <code>{entry.id}</code>
            </div>
            <label className="flow-editor-field">
              <span>Visible label</span>
              <input
                value={entry.label}
                maxLength={120}
                onChange={(event) =>
                  patchOption(key, index, { label: event.target.value })
                }
              />
            </label>
            <button
              type="button"
              className="flow-editor-icon-button"
              aria-label={`Remove ${entry.label || "option"}`}
              title={
                entries.length <= minimum
                  ? `At least ${minimum} option${minimum > 1 ? "s" : ""} required`
                  : "Remove option and its outgoing connection"
              }
              disabled={entries.length <= minimum}
              onClick={() => removeOption(key, index)}
            >
              <Trash2 size={14} />
            </button>
            {renderColorCubeSelector(key, index, entry.color)}
          </div>
        ))}
      </div>
    );
  };

  const menuItemsEditor = () => {
    const entries = readOptions(node.data.items);
    const previewRows = groupMenuPreviewRows(entries);

    return (
      <>
        <div className="flow-editor-form-section">
          <div className="flow-editor-form-section-heading">
            <div>
              <strong>Quick row layouts</strong>
              <small>Arrange menu button rows with one click</small>
            </div>
          </div>
          <div className="flow-menu-preset-bar">
            <button
              type="button"
              className="flow-editor-mini-button"
              onClick={() => applyMenuLayoutPreset("two_col")}
            >
              2 per row
            </button>
            <button
              type="button"
              className="flow-editor-mini-button"
              onClick={() => applyMenuLayoutPreset("three_col")}
            >
              3 per row
            </button>
            <button
              type="button"
              className="flow-editor-mini-button"
              onClick={() => applyMenuLayoutPreset("hero_grid")}
            >
              Mixed (2 + 3 + 1)
            </button>
            <button
              type="button"
              className="flow-editor-mini-button"
              onClick={() => applyMenuLayoutPreset("full_stack")}
            >
              Full-width stack
            </button>
          </div>

          {previewRows.length > 0 && (
            <div className="flow-menu-live-layout" aria-label="Menu layout preview">
              <span className="flow-menu-live-title">
                <LayoutGrid size={12} /> LIVE MENU SHAPE
              </span>
              <div className="flow-menu-live-rows">
                {previewRows.map((rowItems, rowIndex) => (
                  <div
                    key={`preview-row-${rowIndex}`}
                    className="flow-menu-live-row"
                    style={{
                      gridTemplateColumns: `repeat(${rowItems.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {rowItems.map((item) => (
                      <span
                        key={item.id}
                        className={`flow-menu-live-pill is-color-${item.color}`}
                      >
                        {item.label || item.id}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flow-editor-form-section">
          <div className="flow-editor-form-section-heading">
            <div>
              <strong>Menu buttons</strong>
              <small>{entries.length} configured · maximum 24</small>
            </div>
            <button
              type="button"
              className="flow-editor-mini-button"
              disabled={entries.length >= 24}
              onClick={() => addOption("items")}
            >
              <Plus size={14} /> Add button
            </button>
          </div>

          {entries.map((entry, index) => (
            <div className="flow-option-editor" key={entry.id || index}>
              <div className="flow-option-id">
                <span>PORT ID</span>
                <code>{entry.id}</code>
              </div>

              <label className="flow-editor-field">
                <span>Visible label</span>
                <input
                  value={entry.label}
                  maxLength={120}
                  onChange={(event) =>
                    patchOption("items", index, { label: event.target.value })
                  }
                />
              </label>

              <button
                type="button"
                className="flow-editor-icon-button"
                aria-label={`Remove ${entry.label || "menu button"}`}
                title={
                  entries.length <= 1
                    ? "At least 1 menu button is required"
                    : "Remove menu button and its outgoing connection"
                }
                disabled={entries.length <= 1}
                onClick={() => removeOption("items", index)}
              >
                <Trash2 size={14} />
              </button>

              <div className="flow-menu-item-layout-controls">
                <label className="flow-editor-field">
                  <span>Row (1–12)</span>
                  <select
                    value={String(entry.row ?? 1)}
                    onChange={(event) =>
                      patchOption("items", index, {
                        row: Number(event.target.value),
                      })
                    }
                  >
                    {Array.from({ length: 12 }, (_, idx) => idx + 1).map(
                      (rowNumber) => (
                        <option key={rowNumber} value={String(rowNumber)}>
                          Row {rowNumber}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className="flow-editor-field">
                  <span>Button size</span>
                  <select
                    value={entry.width ?? "auto"}
                    onChange={(event) =>
                      patchOption("items", index, {
                        width: event.target.value as FlowMenuButtonWidth,
                      })
                    }
                  >
                    {MENU_WIDTH_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {renderColorCubeSelector("items", index, entry.color)}
            </div>
          ))}
        </div>
      </>
    );
  };

  const isUnsupportedNode =
    node.type !== "start" &&
    node.type !== "text" &&
    node.type !== "image" &&
    node.type !== "button" &&
    node.type !== "choice" &&
    node.type !== "menu" &&
    node.type !== "action";

  return (
    <section className="flow-editor-panel flow-node-editor">
      <div className="flow-editor-panel-heading">
        <div>
          <span className="flow-editor-eyebrow">NODE CONFIGURATION</span>
          <h2>{node.label || node.type}</h2>
          <p>Changes update the current project document.</p>
        </div>
        <span className={`flow-editor-type-badge flow-editor-type-badge--${node.type}`}>
          {node.type}
        </span>
      </div>

      <label className="flow-editor-field">
        <span>Node label</span>
        <input
          value={labelDraft}
          maxLength={120}
          onChange={(event) => {
            const value = event.target.value;
            setLabelDraft(value);
            if (value.trim()) onUpdate({ ...node, label: value });
          }}
          onBlur={() => {
            if (labelDraft.trim()) onUpdate({ ...node, label: labelDraft.trim() });
            else setLabelDraft(node.label);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setLabelDraft(node.label);
          }}
        />
      </label>

      {node.type === "start" && (
        <div className="flow-editor-readonly-note">
          <strong>Entry point</strong>
          <p>The Start node has no editable payload. Connect its <code>Next</code> output to another node.</p>
        </div>
      )}

      {node.type === "text" && (
        <label className="flow-editor-field">
          <span>Message text</span>
          <textarea
            value={readString(node.data.text)}
            rows={5}
            maxLength={4096}
            placeholder="Write the message sent to the user"
            onChange={(event) => patchData("text", event.target.value)}
          />
          <small>Text nodes require a non-empty message.</small>
        </label>
      )}

      {node.type === "image" && (
        <>
          <label className="flow-editor-field">
            <span>Image URL</span>
            <input
              type="url"
              value={readString(node.data.url)}
              placeholder="https://example.com/image.png"
              onChange={(event) => patchData("url", event.target.value)}
            />
            <small>Only valid HTTP or HTTPS URLs are accepted by the engine.</small>
          </label>
          <label className="flow-editor-field">
            <span>Caption (optional)</span>
            <textarea
              value={readString(node.data.caption)}
              rows={3}
              onChange={(event) =>
                patchOptionalString("caption", event.target.value)
              }
            />
          </label>
          <label className="flow-editor-field">
            <span>Alternative text (optional)</span>
            <input
              value={readString(node.data.altText)}
              onChange={(event) =>
                patchOptionalString("altText", event.target.value)
              }
            />
          </label>
        </>
      )}

      {node.type === "button" && (
        <>
          <label className="flow-editor-field">
            <span>Message above buttons</span>
            <textarea
              rows={3}
              value={readString(node.data.text)}
              onChange={(event) => patchData("text", event.target.value)}
            />
          </label>
          {optionsEditor("buttons", "Buttons")}
          <p className="flow-editor-help">
            Every button creates its own output port. A button output must be connected before the flow can pass validation.
          </p>
        </>
      )}

      {node.type === "choice" && (
        <>
          <label className="flow-editor-field">
            <span>Prompt</span>
            <textarea
              rows={3}
              value={readString(node.data.prompt)}
              onChange={(event) => patchData("prompt", event.target.value)}
            />
          </label>
          {optionsEditor("options", "Choices")}
          <p className="flow-editor-help">
            Each choice is a separate output port. At least two choices are required by the engine schema.
          </p>
        </>
      )}

      {node.type === "menu" && (
        <>
          <label className="flow-editor-field">
            <span>Menu greeting / prompt message</span>
            <textarea
              rows={3}
              value={readString(node.data.text)}
              placeholder="Choose an option from the main menu below:"
              onChange={(event) => patchData("text", event.target.value)}
            />
          </label>

          <label className="flow-editor-field">
            <span>Input field placeholder (optional)</span>
            <input
              maxLength={64}
              value={readString(node.data.placeholder)}
              placeholder="e.g. Choose an option 👇"
              onChange={(event) =>
                patchOptionalString("placeholder", event.target.value)
              }
            />
            <small>Displayed inside the Telegram message bar while the menu is open.</small>
          </label>

          <div className="flow-menu-toggles">
            <label className="flow-menu-toggle-item">
              <input
                type="checkbox"
                checked={readBoolean(node.data.persistent, true)}
                onChange={(event) =>
                  patchData("persistent", event.target.checked)
                }
              />
              <span>Persistent bottom menu</span>
            </label>

            <label className="flow-menu-toggle-item">
              <input
                type="checkbox"
                checked={readBoolean(node.data.resizeKeyboard, true)}
                onChange={(event) =>
                  patchData("resizeKeyboard", event.target.checked)
                }
              />
              <span>Compact auto-resize height</span>
            </label>

            <label className="flow-menu-toggle-item">
              <input
                type="checkbox"
                checked={readBoolean(node.data.oneTimeKeyboard, false)}
                onChange={(event) =>
                  patchData("oneTimeKeyboard", event.target.checked)
                }
              />
              <span>Hide menu after tap</span>
            </label>
          </div>

          {menuItemsEditor()}

          <p className="flow-editor-help">
            At most one Menu node can exist per flow. Each menu button creates a dedicated output port and stays active in the bot keyboard.
          </p>
        </>
      )}

      {node.type === "action" && (
        <>
          <label className="flow-editor-field">
            <span>Operation ID</span>
            <input
              value={readString(node.data.operationId)}
              maxLength={128}
              placeholder="registered_operation_id"
              onChange={(event) => patchData("operationId", event.target.value)}
            />
            <small>The operation must also be registered in the runtime to execute.</small>
          </label>
          <label className="flow-editor-field">
            <span>Parameters (JSON object)</span>
            <textarea
              className="flow-editor-code-input"
              rows={7}
              spellCheck={false}
              value={paramsDraft}
              onChange={(event) => {
                const text = event.target.value;
                setParamsDraft(text);
                try {
                  const parsed: unknown = JSON.parse(text);
                  if (!isRecord(parsed)) {
                    setParamsError("Parameters must be a JSON object.");
                    return;
                  }
                  setParamsError(null);
                  patchData("params", parsed);
                } catch {
                  setParamsError("Enter valid JSON before the parameters are applied to the flow.");
                }
              }}
            />
            {paramsError && <small className="flow-editor-field-error">{paramsError}</small>}
          </label>
        </>
      )}

      {isUnsupportedNode && (
        <div className="flow-editor-readonly-note flow-editor-readonly-note--warning">
          <AlertTriangle size={16} />
          <div>
            <strong>Unsupported editor node</strong>
            <p>This node is retained in the project, but its type is not available in the current engine registry. It cannot pass validation until supported.</p>
          </div>
        </div>
      )}

      <div className="flow-node-editor-footer">
        <button type="button" className="button-secondary flow-node-delete-button" onClick={onDelete}>
          <Trash2 size={15} /> Remove node
        </button>
      </div>
    </section>
  );
}