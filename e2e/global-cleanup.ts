import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/** Se ejecuta antes y despues de la suite: el entorno queda solo con los datos demo. */
export default function cleanup() {
  execFileSync(process.execPath, [resolve(__dirname, "cleanup.mjs")], { stdio: "inherit" });
}
