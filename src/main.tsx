import React from "react";
import ReactDOM from "react-dom/client";
import { initSettings } from "./store/settings";

// Load persisted settings (theme + reading size) before the first render
// so the app never flashes the wrong theme.
initSettings();

// Single-window app: reading, sermon assembly, and PowerPoint export.
// (Presenting happens in PowerPoint — see src/export/pptx.ts.)
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

void import("./App").then(({ default: App }) => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
