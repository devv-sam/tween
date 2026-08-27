import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./core/modules/index";
import { Studio } from "./studio/Studio";
import "./studio/studio.css";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <Studio />
  </StrictMode>,
);
