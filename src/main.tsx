import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initSettings } from "./store/settings";

// Load persisted settings (theme + reading size) before the first render
// so the app never flashes the wrong theme.
initSettings();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
