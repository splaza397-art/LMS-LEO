// Defecto S1: el portal no debe reenviar al backend una IP inventada por el navegador.
// Se ejecuta con: npm test (Node quita los tipos de TypeScript sin compilar).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { forwardedFor } from "../src/lib/client-ip.ts";

const headers = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

describe("forwardedFor", () => {
  it("sin proxy delante (DEV) ignora X-Forwarded-For aunque venga", () => {
    assert.deepEqual(forwardedFor(headers("1.2.3.4"), 0), {});
    assert.deepEqual(forwardedFor(headers("1.2.3.4, 5.6.7.8"), 0), {});
  });

  it("con Nginx delante toma la dirección que agregó Nginx y descarta las inventadas", () => {
    assert.deepEqual(forwardedFor(headers("198.51.100.7"), 1), { "x-forwarded-for": "198.51.100.7" });
    assert.deepEqual(forwardedFor(headers("6.6.6.6, 198.51.100.7"), 1), { "x-forwarded-for": "198.51.100.7" });
    assert.deepEqual(forwardedFor(headers("2001:db8::1"), 1), { "x-forwarded-for": "2001:db8::1" });
  });

  it("con dos proxies propios toma la penúltima dirección", () => {
    assert.deepEqual(forwardedFor(headers("6.6.6.6, 198.51.100.7, 10.0.0.2"), 2), { "x-forwarded-for": "198.51.100.7" });
  });

  it("rechaza valores que no son una IP y cadenas más cortas que los saltos", () => {
    assert.deepEqual(forwardedFor(headers("no-es-ip"), 1), {});
    assert.deepEqual(forwardedFor(headers(""), 1), {});
    assert.deepEqual(forwardedFor(headers("198.51.100.7"), 2), {});
  });

  it("una configuración inválida equivale a no confiar", () => {
    assert.deepEqual(forwardedFor(headers("1.2.3.4"), Number.NaN), {});
    assert.deepEqual(forwardedFor(headers("1.2.3.4"), -1), {});
  });
});
