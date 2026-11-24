import { expect, test } from "@playwright/test";
import { API, bff, ORIGIN, PNG, session, sql, uniqueIp } from "./helpers";

test("cabeceras de seguridad", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("no hay redirección abierta en el inicio de sesión", async ({ request }) => {
  for (const value of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
    const response = await request.get(`/auth/login?returnTo=${encodeURIComponent(value)}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).not.toContain("evil.example");
  }
  const callback = await request.get("/auth/callback?code=x&state=forjado", { maxRedirects: 0 });
  expect(callback.headers().location).toContain("error=login");
});

test("el BFF rechaza rutas no permitidas y peticiones de otro origen", async ({ browser, request }) => {
  const page = await session(browser, "superadmin");
  for (const path of ["v1/auth/register", "v1/programs", "v2/me", "v1/me/%2e%2e/%2e%2e/estado"]) {
    expect((await page.request.get(`/api/bff/${path}`)).status(), path).toBe(404);
  }
  for (const route of ["/api/bff/v1/me/applications", "/api/registro", "/api/informacion"]) {
    const response = await page.request.post(route, { headers: { origin: "https://evil.example" }, data: {} });
    expect(response.status(), route).toBe(403);
  }
  expect((await request.post("/auth/logout", { headers: { origin: "https://evil.example" } })).status()).toBe(403);
});

test("la API rechaza tokens falsos y un estudiante no accede a datos ajenos", async ({ browser, request }) => {
  const forged = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from('{"sub":"x"}').toString("base64url")}.`;
  expect((await request.get(`${API}/me`, { headers: { authorization: `Bearer ${forged}` } })).status()).toBe(401);

  const student = await session(browser, "estudiante");
  expect((await bff(student, "GET", "me/courses/999999")).status).toBe(404);
  expect((await bff(student, "GET", "me/campus-link?cmid=999999")).status).toBe(403);

  const other = sql("portal", "select id from users where email = 'profesor@iinicia.test'");
  const notice = sql("portal", `insert into notifications (user_id, title, body) values ('${other}', 'Privado', 'Privado') returning id`).split("\n")[0];
  await bff(student, "POST", `me/notifications/${notice}/read`);
  expect(sql("portal", `select read_at is null from notifications where id = '${notice}'`)).toBe("t");
  expect(JSON.stringify((await bff(student, "GET", "me/notifications")).body)).not.toContain(notice);
});

test("validación de entrada e inyección SQL", async ({ browser, request }) => {
  const admin = await session(browser, "superadmin");
  const before = sql("portal", "select count(*) from users");
  const { status, body } = await bff(admin, "GET", `admin/users?q=${encodeURIComponent("'; DROP TABLE users; --")}`);
  expect(status).toBe(200);
  expect(body).toEqual([]);
  expect(sql("portal", "select count(*) from users")).toBe(before);

  const extra = await request.post(`${API}/auth/register`, {
    headers: { "x-forwarded-for": uniqueIp() },
    data: { email: "x@iinicia.test", password: "PruebaSegura123", firstName: "Ab", lastName: "Cd", consent: true, roles: ["superadmin"] },
  });
  expect(extra.status()).toBe(400);
  const weak = await request.post(`${API}/auth/register`, {
    headers: { "x-forwarded-for": uniqueIp() },
    data: { email: "y@iinicia.test", password: "debil", firstName: "Ab", lastName: "Cd", consent: true },
  });
  expect(weak.status()).toBe(400);
});

test("anti-bot: el campo trampa no crea cuenta y el registro tiene límite", async ({ request }) => {
  const email = `bot.${Date.now()}@iinicia.test`;
  const bot = await request.post(`${API}/auth/register`, {
    headers: { "x-forwarded-for": uniqueIp() },
    data: { email, password: "PruebaSegura123", firstName: "Bot", lastName: "Bot", consent: true, website: "spam" },
  });
  expect(bot.status()).toBe(201);
  expect(sql("portal", `select count(*) from users where email = '${email}'`)).toBe("0");

  const ip = "203.0.113.77";
  const codes: number[] = [];
  for (let i = 0; i < 7; i++) {
    codes.push((await request.post(`${API}/info-requests`, {
      headers: { "x-forwarded-for": ip }, data: { name: "Limite", email: "limite@iinicia.test", message: "Prueba de límite", consent: true, website: "trampa" },
    })).status());
  }
  expect(codes).toContain(429);
});

test("la carga de archivos valida el contenido real", async ({ browser }) => {
  const admin = await session(browser, "academico");
  const upload = (data: Buffer, type: string) => admin.request.post("/api/bff/v1/admin/media", { headers: { origin: ORIGIN, "content-type": type }, data });
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  expect((await upload(svg, "image/png")).status(), "SVG disfrazado de PNG").toBe(400);
  expect((await upload(Buffer.from("<html></html>"), "image/jpeg")).status()).toBe(400);
  expect((await upload(Buffer.alloc(6 * 1024 * 1024, 0), "image/png")).status(), "más de 5 MB").toBe(413);
  const good = await upload(PNG, "image/png");
  expect(good.status()).toBe(201);
  const { url } = await good.json();
  const served = await admin.request.get(url);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");

  const student = await session(browser, "estudiante");
  const denied = await student.request.post("/api/bff/v1/admin/media", { headers: { origin: ORIGIN, "content-type": "image/png" }, data: PNG });
  expect(denied.status()).toBe(403);
});

test("la auditoría registra acciones y no se puede alterar", async ({ browser }) => {
  const root = await session(browser, "superadmin");
  const { body } = await bff(root, "GET", "admin/audit");
  expect(body.map((l: { action: string }) => l.action)).toEqual(expect.arrayContaining(["moodle.sync"]));
  expect(() => sql("portal", "update audit_log set action = 'alterado' where id = (select min(id) from audit_log)")).toThrow();
  expect(() => sql("portal", "delete from audit_log where id = (select min(id) from audit_log)")).toThrow();
});

test("el token de servicio de Moodle no llega al navegador", async ({ browser }) => {
  const page = await session(browser, "estudiante");
  const bodies: string[] = [];
  page.on("response", async (r) => { if (r.url().startsWith(ORIGIN)) bodies.push(await r.text().catch(() => "")); });
  await page.goto("/mi-iinicia");
  await expect(page.getByRole("heading", { name: "Mis cursos" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const all = bodies.join("\n");
  for (const secret of [process.env.MOODLE_WS_TOKEN!, process.env.KEYCLOAK_BACKEND_CLIENT_SECRET!]) expect(all).not.toContain(secret);
});
