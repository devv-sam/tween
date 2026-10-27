import { Agentation } from "agentation";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./core/modules/index";
import { Studio } from "./studio/Studio";
import "./studio/studio.css";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <Studio />
    {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
  </StrictMode>,
);
