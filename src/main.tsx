import { createRoot } from "react-dom/client";
import { App } from "@app/app";
import "./app/styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element.");
}

createRoot(root).render(<App />);
