<h1 align="center">
  <code>@zerobotforge/flow-engine</code> — Flow Graph, Node Registry, Validator &amp; Executor
</h1>

<div align="center">
<i>Conversation flow domain model, extensible node registry, BFS graph analyzer, structural/port validator, and deterministic step-budget execution engine.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../README.md">packages/README.md</a> · <a href="../../README.md">Root README.md</a><br>
<b>Package:</b> <code>@zerobotforge/flow-engine</code> 0.1.0
</div>

--------------------------------------------------------------------------------

## Overview

`@zerobotforge/flow-engine` implements the graph data structures, node schemas, port resolution rules, structural validation, and runtime execution loop for ZeroBotForge conversation flows. It is completely independent of React, Electron, and Telegraf; instead of performing network I/O, `executeFlow` consumes a `FlowDefinition` and a `FlowRuntimeContext` and returns a deterministic `FlowExecutionResult` containing emitted `FlowExecutionEvent` objects, updated context variables, step count, and execution status (`completed`, `waiting_for_input`, `failed`, or `step_limit_exceeded`).

--------------------------------------------------------------------------------

## Source Code Modules

### 1. Core Engine Modules (`src/`)

* **[package.json](package.json)**
  * **Role:** Package Manifest and Subpath Export Map.
  * **Implementation:** Declares `"name": "@zerobotforge/flow-engine"`, `"version": "0.1.0"`, and exports `"."` (`./src/flow.model.ts`), `"./registry"` (`./src/node-registry.ts`), `"./validator"` (`./src/flow-validator.ts`), `"./graph"` (`./src/flow-graph.ts`), `"./executor"` (`./src/flow-executor.ts`), and six individual node subpaths (`./nodes/start`, `./nodes/text`, `./nodes/image`, `./nodes/button`, `./nodes/choice`, `./nodes/action`). Depends on `@zerobotforge/shared` and `zod ^3.24.1`.

* **[src/flow.model.ts](src/flow.model.ts)**
  * **Role:** Flow Engine Domain Types, Execution Event Union, and Structural Schemas.
  * **Implementation:**
    * Defines `SupportedFlowNodeType` (`'start' | 'text' | 'image' | 'button' | 'choice' | 'menu' | 'action'`), `FlowButtonColor` (`'default' | 'green' | 'blue' | 'red'`), `FlowMenuButtonWidth` (`'auto' | 'full' | 'half' | 'third' | 'quarter'`), `FlowPoint`, `FlowPort` (`id`, `label`, `direction: 'input' | 'output'`, `requiredConnection?: boolean`), `NodeExecutionKind`, `FlowNode`, `FlowEdge` (requiring non-empty `sourceHandle: string`), and `FlowDefinition`.
    * `NodeDefinition`: Interface implemented by every node module (`type`, `title`, `description`, `executionKind`, `configSchema`, `getInputPorts(data)`, `getOutputPorts(data)`).
    * Runtime contracts: `FlowUserInput` (`{ kind: 'button' | 'choice' | 'menu'; optionId: string }`), `FlowRuntimeContext` (`variables`, `userId?`, `conversationId?`, `input?`), `FlowExecutionEvent` (7-member discriminated union: `send_text`, `send_image`, `show_buttons`, `show_choices`, `show_menu`, `action_completed`, `action_failed`), `FlowExecutionIssue`, `FlowExecutionStatus`, and `FlowExecutionResult`.
    * Zod schemas: `FlowPointSchema`, `FlowNodeSchema`, `FlowEdgeSchema`, and `FlowDefinitionSchema`.

* **[src/node-registry.ts](src/node-registry.ts)**
  * **Role:** Node Definition Registry and Default Singleton.
  * **Implementation:**
    * `NodeRegistry`: Stores `NodeDefinition` instances in a `Map<SupportedFlowNodeType, NodeDefinition>`. Throws if a duplicate `definition.type` is registered. Provides `register`, `get`, `has`, `list`, `getInputPorts(node)`, `getOutputPorts(node)`, and `getExecutionKind(type)`.
    * `DEFAULT_NODE_REGISTRY`: Pre-populated `NodeRegistry` containing `startNodeDefinition`, `textNodeDefinition`, `imageNodeDefinition`, `buttonNodeDefinition`, `choiceNodeDefinition`, `menuNodeDefinition`, and `actionNodeDefinition`.

* **[src/flow-graph.ts](src/flow-graph.ts)**
  * **Role:** Indexed Directed Graph and Breadth-First Reachability Analyzer.
  * **Implementation:**
    * `FlowGraph`: Indexes `nodesById`, `edgesById`, `outgoingByNodeId`, and `incomingByNodeId` upon construction.
    * Provides `getNode`, `hasNode`, `getNodeIds`, `getNodes`, `getOutgoingEdges(nodeId, sourcePortId?)`, `getIncomingEdges(nodeId)`, `getSuccessors(nodeId)`, `getPredecessors(nodeId)`, `findEdge(edgeId)`, and `getReachableNodeIds(startNodeId)` (which uses a cursor-indexed queue to perform breadth-first traversal without mutating arrays via `shift()`).

* **[src/flow-validator.ts](src/flow-validator.ts)**
  * **Role:** Structural, Node Configuration, Cardinality, and Port Compatibility Validator.
  * **Implementation:**
    * `validateFlow(input: unknown, registry = DEFAULT_NODE_REGISTRY)`:
      1. Parses `input` against `FlowDefinitionSchema` (mapping failures to `FLOW_SCHEMA_INVALID`).
      2. Checks for duplicate node IDs (`FLOW_DUPLICATE_NODE_ID`), counts `start` and `menu` nodes, verifies each node's type is in `registry` (`FLOW_NODE_TYPE_UNREGISTERED`), and validates `node.data` against `definition.configSchema` (`FLOW_NODE_CONFIG_INVALID`).
      3. Enforces `startNodeCount === 1` (`FLOW_START_NODE_MISSING` or `FLOW_MULTIPLE_START_NODES`) and `menuNodeCount <= 1` (`FLOW_MULTIPLE_MENU_NODES`).
      4. Checks edges for duplicate IDs (`FLOW_DUPLICATE_EDGE_ID`), missing endpoints (`FLOW_EDGE_SOURCE_NOT_FOUND`, `FLOW_EDGE_TARGET_NOT_FOUND`), edges pointing to `start` (`FLOW_EDGE_TO_START`), invalid `sourceHandle` (`FLOW_SOURCE_PORT_INVALID`), invalid `targetHandle` (`FLOW_TARGET_PORT_INVALID`), and multiple outgoing edges from the same `(sourceNodeId, sourceHandle)` (`FLOW_MULTIPLE_EDGES_FROM_PORT`).
      5. Verifies that every output port with `requiredConnection: true` has an outgoing edge (`FLOW_OUTPUT_PORT_UNCONNECTED`).
    * Also exports `isFlowValid` and `validationIssuesToExecutionIssues`.

* **[src/flow-executor.ts](src/flow-executor.ts)**
  * **Role:** Step-Budget Conversation Flow Executor and Action Allowlist Registry.
  * **Implementation:**
    * `FlowActionRegistry`: Map-backed allowlist of `FlowActionHandler` callbacks keyed by `operationId` (validated against `identifierSchema`). Prevents arbitrary code execution from flow data.
    * `executeFlow(input: unknown, options: FlowExecutionOptions = {})`:
      * Clones `options.context`, validates `input` via `validateFlow`, and verifies `maxSteps` (default `100`) is a positive integer.
      * Resolves the entry node from `options.resumeAtNodeId ?? startNode.id`.
      * Executes a `while (steps < maxSteps)` loop dispatching by `definition.executionKind`:
        * `start`: Follows `next` outgoing edge.
        * `text`: Parses `TextNodeDataSchema`, emits `send_text`, follows `next`.
        * `image`: Parses `ImageNodeDataSchema`, emits `send_image`, follows `next`.
        * `button` / `choice` / `menu`: If `context.input` is `undefined`, emits `show_buttons` / `show_choices` / `show_menu` and returns `status: 'waiting_for_input'` with `currentNodeId: node.id`. If `context.input` is present, consumes it, validates `userInput.kind` and `userInput.optionId`, and follows `button:<id>`, `choice:<id>`, or `menu:<id>`.
        * `action`: Parses `ActionNodeDataSchema`. If a handler is registered in `options.actions`, awaits it, stores the result in `context.variables.lastActionResult`, emits `action_completed`, and follows `success` (or catches errors, records `FLOW_EXECUTION_FAILED`, emits `action_failed`, and follows `failure`). If `options.actions` is `undefined` and `config.params` is non-empty, runs a parameter inspection fallback that emits `send_text` if a candidate text field (`text`, `message`, `reply`) is present, stores `rawParams` in `context.variables`, and routes to `failure` or `success` based on explicit outcome flags. Otherwise records `FLOW_ACTION_NOT_REGISTERED`, emits `action_failed`, and follows `failure` if connected.
      * Returns `status: 'completed'` when a node has no outgoing edge for the active handle, or `status: 'step_limit_exceeded'` with `FLOW_STEP_LIMIT_EXCEEDED` if the loop reaches `maxSteps`.

* **[src/flow-engine.test.ts](src/flow-engine.test.ts)**
  * **Role:** Package Unit Test Suite (13 tests).
  * **Implementation:** Tests `validateFlow` (valid `Start -> Text`, duplicate node IDs, missing Start node, missing edge target, invalid source port, empty text config, unregistered `condition` node), `FlowGraph` (`getReachableNodeIds`, `getOutgoingEdges`), and `executeFlow` (`Start -> Text` event emission, button suspension and resumption, cyclic flow termination at `maxSteps: 3`, unregistered action failure with `FLOW_ACTION_NOT_REGISTERED`, and registered `FlowActionRegistry` execution recording `lastActionResult`).

---

### 2. Node Definition Modules (`src/nodes/`)

* **[src/nodes/start.node.ts](src/nodes/start.node.ts)**
  * **Role:** `start` Node Definition.
  * **Implementation:** `StartNodeDataSchema = z.object({}).strict()`. Defines `0` input ports and `1` output port (`{ id: 'next', label: 'Next', direction: 'output' }`).

* **[src/nodes/text.node.ts](src/nodes/text.node.ts)**
  * **Role:** `text` Node Definition.
  * **Implementation:** `TextNodeDataSchema = z.object({ text: nonEmptyStringSchema }).strict()`. Defines input port `'in'` and output port `'next'`.

* **[src/nodes/image.node.ts](src/nodes/image.node.ts)**
  * **Role:** `image` Node Definition.
  * **Implementation:** `ImageNodeDataSchema` validates `url` as a trimmed URL whose parsed `URL.protocol` is `'http:'` or `'https:'`, plus optional preprocessed non-empty `caption` and `altText`. Defines input port `'in'` and output port `'next'`.

* **[src/nodes/button.node.ts](src/nodes/button.node.ts)**
  * **Role:** `button` Node Definition.
  * **Implementation:** `ButtonNodeDataSchema` validates `text: nonEmptyStringSchema` and `buttons` (`1..20` items of `{ id: identifierSchema, label: nonEmptyStringSchema, color?: 'default' | 'green' | 'blue' | 'red' }`) with a `.superRefine` check rejecting duplicate `button.id` values. Dynamically generates required output ports `button:<id>` (`requiredConnection: true`) for each configured button.

* **[src/nodes/choice.node.ts](src/nodes/choice.node.ts)**
  * **Role:** `choice` Node Definition.
  * **Implementation:** `ChoiceNodeDataSchema` validates `prompt: nonEmptyStringSchema` and `options` (`2..20` items of `{ id: identifierSchema, label: nonEmptyStringSchema, color?: ChoiceColorSchema }`) with `.superRefine` duplicate ID rejection. Dynamically generates required output ports `choice:<id>` (`requiredConnection: true`).

* **[src/nodes/menu.node.ts](src/nodes/menu.node.ts)**
  * **Role:** `menu` Node Definition (Persistent Telegram Reply Keyboard).
  * **Implementation:** `MenuNodeDataSchema` validates `text: nonEmptyStringSchema`, optional `placeholder` (trimmed, max `64` chars), optional booleans `persistent`, `resizeKeyboard`, and `oneTimeKeyboard`, and `items` (`1..24` items of `MenuItemSchema` with `id`, `label`, optional `color`, optional integer `row` in `1..12`, and optional `width` in `'auto' | 'full' | 'half' | 'third' | 'quarter'`), rejecting duplicate item IDs via `.superRefine`. Dynamically generates required output ports `menu:<id>` (`requiredConnection: true`).

* **[src/nodes/action.node.ts](src/nodes/action.node.ts)**
  * **Role:** `action` Node Definition.
  * **Implementation:** `ActionNodeDataSchema = z.object({ operationId: identifierSchema, params: z.record(z.string(), jsonValueSchema).default({}) }).strict()`. Defines input port `'in'` and two non-required output ports: `'success'` (`Success`) and `'failure'` (`Failure`).
