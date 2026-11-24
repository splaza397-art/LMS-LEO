// Punto 3: registro y autenticacion, sobre la pantalla de acceso con identidad IINICIA.
import { expect, test } from "@playwright/test";
import "./helpers";

test("la pantalla de acceso muestra la marca IINICIA en español", async ({ page }) => {
  await page.goto("/auth/login");
  await page.waitForURL(/localhost:8180/);
  await expect(page.getByRole("heading", { name: "Inicia sesión en IINICIA" })).toBeVisible();
  const logo = await page.locator(".kc-logo-text").evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(logo).toContain("logo-blanco.png");
  // Las cuentas solo se crean en el portal: la pantalla de acceso enlaza al registro.
  await page.getByRole("link", { name: "Crea tu cuenta" }).click();
  await expect(page).toHaveURL("http://localhost:3000/registro");
});

test("el registro guía la contraseña y avisa de un correo ya registrado", async ({ page }) => {
  await page.goto("/registro");
  const alert = page.locator("form").getByRole("alert");
  await page.getByLabel("Nombre", { exact: true }).fill("Prueba");
  await page.getByLabel("Apellidos").fill("Duplicada");
  await page.getByLabel("Correo electrónico").fill("estudiante@iinicia.test");
  await page.getByLabel("Contraseña").fill("sinmayuscula1");
  await page.getByRole("button", { name: "Mostrar" }).click();
  await expect(page.getByLabel("Contraseña")).toHaveAttribute("type", "text");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(alert).toHaveText("A tu contraseña le falta: una mayúscula.");
  await page.getByLabel("Contraseña").fill("ConMayuscula1");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(alert).toContainText("Ya existe una cuenta con ese correo.");
  await expect(alert.getByRole("link", { name: "Inicia sesión" })).toHaveAttribute("href", "/auth/login");
});

test("una contraseña incorrecta no inicia sesión", async ({ page }) => {
  await page.goto("/auth/login");
  await page.locator("#username").fill("estudiante@iinicia.test");
  await page.locator("#password").fill("ContraseñaIncorrecta1");
  await page.locator("#kc-login").click();
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  expect(page.url()).toContain("localhost:8180");
});

test("recuperación de contraseña envía el correo de restablecimiento", async ({ page, request }) => {
  const since = Date.now();
  await page.goto("/auth/login");
  await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
  await page.locator("#username").fill("aspirante@iinicia.test");
  await page.getByRole("button", { name: /Enviar|Submit/ }).click();
  await expect(page.getByText(/recibirás|instrucciones|correo/i).first()).toBeVisible();
  await expect.poll(async () => {
    const list = await (await request.get(`http://localhost:8025/api/v1/search?query=${encodeURIComponent("to:aspirante@iinicia.test")}`)).json();
    return list.messages.some((m: { Created: string; Subject: string }) => Date.parse(m.Created) >= since - 5000 && /contraseña|credenciales/i.test(m.Subject));
  }, { timeout: 20_000 }).toBe(true);
});

test("cerrar sesión termina la sesión en el portal", async ({ page }) => {
  await page.goto("/auth/login?returnTo=/mi-iinicia");
  await page.locator("#username").fill("estudiante@iinicia.test");
  await page.locator("#password").fill(process.env.DEMO_PASSWORD!);
  await page.locator("#kc-login").click();
  await page.waitForURL(/\/mi-iinicia/);
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL("http://localhost:3000/");
  await page.goto("/mi-iinicia");
  await page.waitForURL(/localhost:8180/);
  await expect(page.locator("#username")).toBeVisible();
});
