import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Cada prueba empieza con el DOM limpio y sin simulaciones de la anterior.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
