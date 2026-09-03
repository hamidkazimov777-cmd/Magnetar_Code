import React from "react";
import { createRoot } from "react-dom/client";
import { Monitor } from "./components/Monitor.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Monitor />
  </React.StrictMode>,
);
