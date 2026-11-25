import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pruebas de componentes y hooks en un DOM simulado (jsdom). Las pruebas de funciones puras del servidor
// siguen en test/*.test.ts con node:test.
// En Windows la letra de unidad puede llegar en minúscula ("c:\") y cargar dos veces el mismo módulo; la ruta
// canónica del sistema lo evita.
const root = realpathSync.native(fileURLToPath(new URL(".", import.meta.url)));

export default defineConfig({
  root,
  resolve: { alias: { "@": `${root}/src` } },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.tsx"],
    setupFiles: [`${root}/test/setup.ts`],
  },
});
