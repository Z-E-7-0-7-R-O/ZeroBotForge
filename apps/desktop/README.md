<h1 align="center">
  <code>@zerobotforge/desktop</code> — Electron &amp; React Desktop Studio Application
</h1>

<div align="center">
<i>Workspace configuration, Content-Security-Policy HTML entry point, Vite bundler setup, composite TypeScript configurations, and architectural index for the ZeroBotForge desktop application.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../../README.md">Root README.md</a><br>
<b>Package:</b> <code>@zerobotforge/desktop</code> 0.1.0
</div>

--------------------------------------------------------------------------------

## Overview

`apps/desktop/` houses the ZeroBotForge desktop application. It combines two isolated runtime environments within one workspace package:
1. **Electron Main & Preload Processes (`electron/`):** Bundled with `esbuild` targeting Node.js 22 CommonJS (`dist-electron/main.cjs` and `dist-electron/preload.cjs`). Owns window creation, IPC sender verification, native file dialogs, OS-encrypted token storage (`safeStorage`), and local child-process bot compilation/execution (`BotRuntimeService`).
2. **React 18 Renderer Application (`src/`):** Bundled with Vite 6 (`dist/`) and served on `http://127.0.0.1:5173` during development. Implements the visual flow canvas, node editor, local chat preview, project dashboard, live runtime monitor, and settings views.

--------------------------------------------------------------------------------

## Workspace Configuration & Entry Files

* **[package.json](package.json)**
  * **Role:** Desktop Workspace Manifest and Build Scripts.
  * **Implementation:** Declares `"name": "@zerobotforge/desktop"`, `"version": "0.1.0"`, `"private": true`, `"type": "module"`, and `"main": "dist-electron/main.cjs"`. Defines scripts:
    * `"dev"`: `"vite --host 127.0.0.1 --port 5173 --strictPort"`
    * `"build"`: `"tsc -b && vite build"`
    * `"build:electron"`: `"esbuild electron/main.ts electron/preload.ts --bundle --platform=node --target=node22 --format=cjs --outdir=dist-electron --external:electron --out-extension:.js=.cjs"`
    * `"start:electron"`: `"electron ."`
    * `"preview"`: `"vite preview --host 127.0.0.1"`
    * `"typecheck"`: `"tsc -b"`
    * `"typecheck:electron"`: `"tsc -p tsconfig.electron.json"`
    * Dependencies: `react 18.3.1`, `react-dom 18.3.1`, `lucide-react 0.468.0`, `@zerobotforge/flow-engine 0.1.0`, `@zerobotforge/code-generator 0.1.0`. DevDependencies: `electron 44.7.0`, `vite 6.0.5`, `@vitejs/plugin-react 4.3.4`, `esbuild ^0.25.0`, `@zerobotforge/project-format 0.1.0`, `@types/react`, `@types/react-dom`.

* **[index.html](index.html)**
  * **Role:** Renderer HTML Shell and Content-Security-Policy (CSP) Boundary.
  * **Implementation:** Defines a strict `<meta http-equiv="Content-Security-Policy">` header: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:5173; object-src 'none'; base-uri 'self'; frame-src 'none'`. Mounts `<div id="root"></div>` and loads `/src/main.tsx`.

* **[vite.config.ts](vite.config.ts)**
  * **Role:** Vite Renderer Bundler Configuration.
  * **Implementation:** Configures `base: "./"`, `plugins: [react()]`, `server: { host: "127.0.0.1", port: 5173, strictPort: true }`, and `build: { outDir: "dist", emptyOutDir: true }`.

* **[tsconfig.json](tsconfig.json)**
  * **Role:** Composite TypeScript Solution Config.
  * **Implementation:** References `./tsconfig.app.json` and `./tsconfig.node.json`.

* **[tsconfig.app.json](tsconfig.app.json)**
  * **Role:** React Renderer TypeScript Configuration.
  * **Implementation:** Extends `../../tsconfig.base.json` with `"target": "ES2020"`, `"lib": ["ES2020", "DOM", "DOM.Iterable"]`, `"jsx": "react-jsx"`, `"moduleResolution": "bundler"`, `"types": ["vite/client"]`, and `"include": ["src"]`.

* **[tsconfig.node.json](tsconfig.node.json)**
  * **Role:** Vite Config TypeScript Configuration.
  * **Implementation:** Extends `../../tsconfig.base.json` with `"target": "ES2022"`, `"lib": ["ES2023"]`, `"types": ["node"]`, and `"include": ["vite.config.ts"]`.

* **[tsconfig.electron.json](tsconfig.electron.json)**
  * **Role:** Electron Main & Preload TypeScript Configuration.
  * **Implementation:** Extends `../../tsconfig.base.json` with `"target": "ES2022"`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"types": ["node"]`, and `"include": ["electron/**/*.ts", "src/types/electron-api.ts", "../../packages/shared/src/**/*.ts", "../../packages/project-format/src/**/*.ts"]`.

--------------------------------------------------------------------------------

## Sub-Directory Documentation Index

Navigate to each sub-directory's `README.md` for complete code-by-code documentation:

1. **[`apps/desktop/electron/README.md`](electron/README.md)** — Electron Main Process (`main.ts`, `preload.ts`, `errors.ts`), IPC Handlers (`electron/ipc/*`), and Native Services (`electron/services/*`).
2. **[`apps/desktop/src/README.md`](src/README.md)** — React Renderer Bootstrap, Pages (`src/pages/*`), Services (`src/services/*`), Stores (`src/store/*`), Hooks (`src/hooks/*`), Styles (`src/styles/*`), Types (`src/types/*`), and links to:
   * **[`apps/desktop/src/components/README.md`](src/components/README.md)** — Common UI, Layout, Flow Canvas, Node Cards, and Chat Preview Components.
   * **[`apps/desktop/src/features/README.md`](src/features/README.md)** — Domain Feature Modules (`projects`, `bot`, `settings`, `conversations`, `analytics`).
3. **[`apps/desktop/tests/README.md`](tests/README.md)** — Desktop Unit and Service Test Suites (`app-settings`, `file-system`, `flow-editor.model`, `ipc-security`, `phase08-store-services`).
