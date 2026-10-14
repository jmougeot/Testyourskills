import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CARD_MASK_URL } from "../../shared/card/geometry";
import { App } from "./App";
import "./styles.css";

// Silhouette de la carte, réutilisée pour le dos, les compteurs et le balayage.
document.documentElement.style.setProperty("--card-mask", CARD_MASK_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
