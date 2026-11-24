// Ejecuta vitest desde la ruta canónica del proyecto. En Windows la letra de unidad puede llegar en minúscula
// ("c:\...") según la terminal; vitest cargaría dos veces su propio módulo y no encontraría las pruebas.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync.native(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const bin = resolve(root, "node_modules", "vitest", "vitest.mjs");
const { status } = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
process.exit(status ?? 1);
