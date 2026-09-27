import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { initSettings } from "./store/settings";

// Load persisted settings (theme + reading size) before the first render
// so the app never flashes the wrong theme. Harmless on the presentation
// stage, which uses only the theme-independent stage tokens.
initSettings();

// Two windows share this frontend build: the main app and the borderless
// fullscreen presentation stage (src-tauri/src/presentation.rs). The
// stage renders its own UI with stage tokens only — never the app's
// normal light/dark theme (AGENTS.md, Sermon rule #3).
function windowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

if (windowLabel() === "presentation") {
  void Promise.all([
    import("./styles/tokens.css"),
    import("./styles/stage.css"),
    import("./components/PresentationWindow"),
  ]).then(([, , { PresentationWindow }]) => {
    root.render(
      <React.StrictMode>
        <PresentationWindow />
      </React.StrictMode>,
    );
  });
} else {
  void import("./App").then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
}
