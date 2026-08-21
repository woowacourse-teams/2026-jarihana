import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { enableDevelopmentTools } from "./app/developmentTools";

enableDevelopmentTools();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("React root element를 찾을 수 없습니다.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
