import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Default to the light theme until the settings/theme-toggle feature exists.
document.documentElement.dataset.theme = "light";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
