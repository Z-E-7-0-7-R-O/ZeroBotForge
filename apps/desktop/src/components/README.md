<h1 align="center">
  <code>apps/desktop/src/components</code> — UI Shell, Visual Flow Editor, Node Cards &amp; Chat Preview
</h1>

<div align="center">
<i>Reusable modal/notification primitives, workspace shell layout, interactive 2D flow canvas, SVG connection renderer, node configuration inspector, and local conversation simulator.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../README.md">apps/desktop/src/README.md</a> · <a href="../../../../README.md">Root README.md</a>
</div>

--------------------------------------------------------------------------------

## Overview

`apps/desktop/src/components/` is organized into five subdirectories (`common/`, `layout/`, `flow/`, `nodes/`, `preview/`) containing 23 modules that implement the visual interface of ZeroBotForge.

--------------------------------------------------------------------------------

## Source Code Modules

### 1. Common UI Primitives (`common/`)

* **[common/Modal.tsx](common/Modal.tsx)**
  * **Role:** Accessible Portal Dialog Component.
  * **Implementation:** Renders into `document.body` via `createPortal`. Locks `document.body.style.overflow = "hidden"` while open, captures and restores focus on close, handles `Escape` key dismissal (`closeOnEscape`) and backdrop mousedown dismissal (`closeOnBackdrop`), and supports four width variants (`sm`, `md`, `lg`, `xl`).

* **[common/ConfirmDialog.tsx](common/ConfirmDialog.tsx)**
  * **Role:** Asynchronous Confirmation Modal Wrapper.
  * **Implementation:** Wraps `Modal` (`size="sm"`) with `busy` state locking (`closeOnBackdrop={!busy}`, `closeOnEscape={!busy}`), `danger` / `primary` button variants, and inline error reporting if `await onConfirm()` throws.

* **[common/EmptyState.tsx](common/EmptyState.tsx)**
  * **Role:** Standardized Empty/Placeholder Status Box.
  * **Implementation:** Renders `role="status"` with optional `icon`, `title`, `description`, and `action` slot.

* **[common/Notification.tsx](common/Notification.tsx)**
  * **Role:** Portal Toast Notification Region.
  * **Implementation:** Renders `notifications` into `document.body` via `createPortal` with `aria-live="polite"`, mapping `success`, `error`, `warning`, and `info` types to Lucide icons (`CheckCircle2`, `XCircle`, `AlertTriangle`, `Info`) and `role="alert"` for errors.

---

### 2. Application Shell Layout (`layout/`)

* **[layout/AppLayout.tsx](layout/AppLayout.tsx)**
  * **Role:** Primary Desktop Studio Shell.
  * **Implementation:** Renders ambient background layers, `Sidebar`, `Topbar`, scrollable `.content` slot with `StatusBar`, and the global `Notification` portal.

* **[layout/Sidebar.tsx](layout/Sidebar.tsx)**
  * **Role:** Left Workspace Navigation Rail.
  * **Implementation:** Defines `NavigationPage = "Dashboard" | "Bot" | "Run" | "Conversations" | "Analytics" | "Settings"` and renders navigation buttons, brand header (`ZeroBotForge / BOT STUDIO`), workspace switcher, external GitHub help link (`https://github.com/Z-E-7-0-7-R-O`), dashboard return button, and profile footer.

* **[layout/Topbar.tsx](layout/Topbar.tsx)**
  * **Role:** Top Breadcrumb and Quick-Action Header.
  * **Implementation:** Displays `Workspace > {activePage}` breadcrumbs, save status indicator (`All changes saved`), settings toggle button, and user avatar badge.

* **[layout/StatusBar.tsx](layout/StatusBar.tsx)**
  * **Role:** Page Footer Bar.
  * **Implementation:** Renders copyright (`© 2026 Zero Studio`), system operational indicator, and documentation anchor link.

---

### 3. Visual Flow Editor (`flow/`)

* **[flow/flow-editor.model.ts](flow/flow-editor.model.ts)**
  * **Role:** DTO/Engine Model Converters, Geometry Constants, and Default Node Payloads.
  * **Implementation:**
    * Geometry constants: `FLOW_NODE_WIDTH = 260`, `FLOW_NODE_HEADER_HEIGHT = 52`, `FLOW_PORT_ROW_HEIGHT = 26`, `FLOW_PORT_ANCHOR_OFFSET = 65`.
    * `createEditorId()`: Uses `crypto.randomUUID()` with a timestamp/random fallback.
    * `toEngineFlow(flow: ProjectFlowDto)` & `toProjectFlow(flow: FlowDefinition)`: Convert between persisted Electron DTOs and `@zerobotforge/flow-engine` domain models without hiding missing `sourceHandle` values.
    * `createEmptyEditorFlow(name = "Main flow")`: Creates a valid initial flow containing one `start` node at `{ x: 80, y: 90 }`.
    * `createDefaultNodeData(type)`: Supplies initial templates for new nodes (`start`: `{}`, `text`: `{ text: "Write your message here" }`, `image`: `{ url: "" }`—intentionally invalid until configured, `button`: 1 default button, `choice`: 2 default options, `menu`: 5 preconfigured menu buttons across 3 rows with green/blue/default colors and half/full widths, `action`: `{ operationId: "configure_me", params: {} }`).
    * `getNodePortCounts(node)` & `getNodeHeight(node)`: Compute dynamic node card heights from registry input/output port counts.

* **[flow/FlowCanvas.tsx](flow/FlowCanvas.tsx)**
  * **Role:** Interactive 2D Node Stage and Port Connection Controller.
  * **Implementation:**
    * Dynamically expands stage `width` (minimum `1200px`) and `height` (minimum `820px`) based on node coordinates.
    * Implements pointer-captured node header dragging (`beginDrag`, `handleStagePointerMove`, `finishDrag`), clamping node coordinates to `>= 12px`.
    * Manages two-click port connection creation (`selectOutput` -> `pendingConnection` banner -> `selectInput`), blocking self-connections, connections targeting `start`, and duplicate connections from an already-connected output port.

* **[flow/ConnectionLayer.tsx](flow/ConnectionLayer.tsx)**
  * **Role:** SVG Cubic Bezier Edge Renderer.
  * **Implementation:** Resolves source and target port row indices from `DEFAULT_NODE_REGISTRY`, computes anchor coordinates `(x1, y1)` and `(x2, y2)`, and renders keyboard-accessible (`role="button"`, `tabIndex={0}`) SVG `<path>` curves (`M x1 y1 C x1+curve y1, x2-curve y2, x2 y2`) with arrowhead marker `#zbf-flow-arrow` and optional midpoint `<text>` labels.

* **[flow/FlowNode.tsx](flow/FlowNode.tsx)**
  * **Role:** Shared Visual Card for All Flow Nodes (`FlowNodeCard`).
  * **Implementation:** Queries `DEFAULT_NODE_REGISTRY` for the node's input and output ports, resolves per-port button color indicators (`green`, `blue`, `red`), renders a draggable header with a live summary subtitle (`getNodeSummary`) and validation warning badge (`AlertTriangle`), and renders interactive input/output port buttons.

* **[flow/FlowToolbar.tsx](flow/FlowToolbar.tsx)**
  * **Role:** Active Flow Name Editor, Metrics Bar, and Action Toolbar.
  * **Implementation:** Provides inline editing of `flowName`, displays node and connection counts plus a `Valid structure` / `Invalid flow` pill, and exposes buttons for `New flow`, `Remove selected`, `Validate`, and `Save project`.

* **[flow/NodePalette.tsx](flow/NodePalette.tsx)**
  * **Role:** Registry-Backed Node Creation Palette.
  * **Implementation:** Lists all node definitions from `DEFAULT_NODE_REGISTRY.list()`. Disables the `Start` button when `hasStartNode` is true (1 per flow) and disables the `Menu` button when a `menu` node already exists in the active flow store or canvas DOM (`MutationObserver`).

* **[flow/NodeEditor.tsx](flow/NodeEditor.tsx)**
  * **Role:** Context-Sensitive Node Property Inspector.
  * **Implementation:**
    * Edits `node.label` and renders type-specific configuration forms:
      * `start`: Read-only entry point notice.
      * `text`: `textarea` (`maxLength={4096}`).
      * `image`: `url` input (`http:`/`https:`), optional `caption`, and optional `altText`.
      * `button` & `choice`: Dynamic option list editor (`addOption`, `removeOption` which also returns `removedHandles` to prune dangling edges, label input, and 4-color radio cube selector `default`/`green`/`blue`/`red`).
      * `menu`: Greeting text, input placeholder (`maxLength={64}`), 3 keyboard behavior checkboxes (`persistent`, `resizeKeyboard`, `oneTimeKeyboard`), 4 one-click row layout preset buttons (`2 per row`, `3 per row`, `Mixed (2 + 3 + 1)`, `Full-width stack`), live visual keyboard preview (`LIVE MENU SHAPE`), and per-button row (`1..12`), width (`auto`, `full`, `half`, `third`, `quarter`), and color controls (up to 24 buttons).
      * `action`: `operationId` input (`maxLength={128}`) and JSON object `params` code editor with live `JSON.parse` validation.

---

### 4. Typed Node Card Wrappers (`nodes/`)

* **[nodes/StartNode.tsx](nodes/StartNode.tsx)**, **[nodes/TextNode.tsx](nodes/TextNode.tsx)**, **[nodes/ImageNode.tsx](nodes/ImageNode.tsx)**, **[nodes/ButtonNode.tsx](nodes/ButtonNode.tsx)**, **[nodes/ChoiceNode.tsx](nodes/ChoiceNode.tsx)**, **[nodes/ActionNode.tsx](nodes/ActionNode.tsx)**
  * **Role:** Node-Type Component Wrappers.
  * **Implementation:** Thin typed wrappers forwarding `FlowNodeCardProps` to `FlowNodeCard` ([`flow/FlowNode.tsx`](flow/FlowNode.tsx)), used by `FlowCanvas.tsx` when dispatching by `node.type`.

---

### 5. Local Conversation Simulator (`preview/`)

* **[preview/ChatPreview.tsx](preview/ChatPreview.tsx)**
  * **Role:** Interactive In-Editor Flow Conversation Simulator.
  * **Implementation:**
    * Clones the active flow on `Start preview` and detects subsequent editor modifications (`flowChangedSinceStart`) to prompt for a preview restart.
    * Calls `runFlowPreview` from [`services/preview.service.ts`](../../services/preview.service.ts) and appends emitted `FlowExecutionEvent` items into a transcript.
    * Renders text messages, image previews with external links, interactive colored inline buttons (`show_buttons`, `show_choices`), and a multi-row persistent bottom menu dock (`show_menu` via `buildPreviewMenuRows`).
    * When suspended at `waiting_for_input`, allows the user to select an option and click `Next step` to resume execution from `result.currentNodeId`.

* **[preview/PreviewControls.tsx](preview/PreviewControls.tsx)**
  * **Role:** Simulator Status Banner and Execution Control Bar.
  * **Implementation:** Displays the current execution status (`Not started`, `Running…`, `Waiting for selection`, `Completed`, `Failed`, `Step limit exceeded`) and `Start preview` / `Restart preview` and `Next step` buttons.
