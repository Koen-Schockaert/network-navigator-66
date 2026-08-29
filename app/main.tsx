import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "../src/components/netscan/AppShell";

/**
 * Standalone entry point for the packaged shells (Electron + Docker).
 * The Lovable web preview uses the TanStack route at src/routes/index.tsx;
 * both render the exact same AppShell component.
 */
const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <AppShell />
    </StrictMode>,
  );
}
