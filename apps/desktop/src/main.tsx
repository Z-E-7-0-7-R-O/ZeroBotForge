import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles.css";
import "./styles/feature-views.css";
import "./styles/variables.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/responsive.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error(
    'Application bootstrap failed: the "#root" element was not found.',
  );
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
