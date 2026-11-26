// Fase 4.10: decisión del portal tras pedir el cierre de sesión coordinado al backend.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loginPrompt, logoutPlan, logoutScope, reauthStep } from "../src/lib/logout-policy.ts";

describe("cierre de sesión del portal", () => {
  it("confirmado por Keycloak y Moodle: no hace falta redirigir ni forzar credenciales", () => {
    assert.deepEqual(logoutPlan({ keycloak: "ok", moodle: "ok", complete: true }), { requireCredentialsNextTime: false, browserLogout: false });
  });
  it("Moodle pendiente o Keycloak sin confirmar: se fuerza pedir credenciales y se intenta el cierre por el navegador", () => {
    for (const result of [{ keycloak: "ok", moodle: "pendiente", complete: false }, { keycloak: "error", moodle: "ok", complete: false }]) {
      assert.deepEqual(logoutPlan(result), { requireCredentialsNextTime: true, browserLogout: true });
    }
  });
  it("sin respuesta del backend (caído, sin token): nunca se da por cerrado", () => {
    assert.deepEqual(logoutPlan(null), { requireCredentialsNextTime: true, browserLogout: true });
  });
  it("el siguiente inicio de sesión pide credenciales solo si quedó pendiente", () => {
    assert.deepEqual(loginPrompt(true), { prompt: "login" });
    assert.deepEqual(loginPrompt(false), {});
  });
  it("Fase 5: el alcance 'todos los dispositivos' solo se usa si se pidió de forma explícita", () => {
    assert.equal(logoutScope("all"), "all");
    for (const value of [null, undefined, "", "device", "ALL", "todo"]) assert.equal(logoutScope(value as never), "device");
  });
  it("Fase 5: tras un cierre no confirmado, primero se cierra la sesión anterior de Keycloak y después se piden credenciales", () => {
    assert.equal(reauthStep(null), "sin_pendiente");
    assert.equal(reauthStep({ hint: "token-de-identidad" }), "cerrar_sesion_anterior");
    assert.equal(reauthStep({}), "pedir_credenciales", "el aviso ya usado (o sin token) solo obliga a pedir la contraseña");
  });
});
