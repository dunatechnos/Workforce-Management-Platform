import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyPreferences } from "./lib";
import "./styles.css";
import "./theme-v2.css";
applyPreferences();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
