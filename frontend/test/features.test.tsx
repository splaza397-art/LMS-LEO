// Funcionalidades separadas en la etapa 3.4: formularios, validaciones, CSV y secciones del panel por rol.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { permissionsFor, ROLES } from "../../backend/src/modules/auth/permissions";
import { ADMIN_PERMISSIONS, sectionsFor } from "@/config/admin-sections";
import { InfoRequestForm } from "@/features/admissions/info-request-form";
import { missingRules } from "@/features/auth/password-rules";
import { RegisterForm } from "@/features/auth/register-form";
import { contentBody } from "@/features/content/content-form";
import { AdminPanel } from "@/features/dashboard/admin-panel";
import { csvCell, toCsv } from "@/features/reports/csv";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("secciones del panel por rol (misma matriz RBAC que el backend)", () => {
  const expected: Record<string, string[]> = {
    superadmin: ["Solicitudes", "Usuarios", "Programas", "Contenidos", "Información", "Avisos", "Reportes", "Auditoría"],
    admin_tecnico: ["Usuarios", "Auditoría"],
    admin_academico: ["Solicitudes", "Usuarios", "Programas", "Contenidos", "Información", "Avisos", "Reportes"],
    coordinador: ["Solicitudes", "Usuarios", "Programas", "Avisos", "Reportes"],
    profesor: [],
    estudiante: [],
    aspirante: [],
    soporte: ["Usuarios"],
  };
  for (const role of ROLES) {
    it(`${role}: ${expected[role].join(", ") || "sin acceso al panel"}`, () => {
      const permissions = permissionsFor([role]);
      expect(sectionsFor(permissions).map((s) => s.label)).toEqual(expected[role]);
      expect(permissions.some((p) => ADMIN_PERMISSIONS.includes(p))).toBe(expected[role].length > 0);
    });
  }

  it("el panel solo dibuja las pestañas permitidas", () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([])));
    render(<AdminPanel permissions={permissionsFor(["admin_tecnico"])} selfId="x" />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Usuarios", "Auditoría"]);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("tab-usuarios");
  });
});

describe("validaciones y transformaciones", () => {
  it("reglas de contraseña", () => {
    expect(missingRules("")).toEqual(["10 caracteres o más", "una mayúscula", "una minúscula", "un número"]);
    expect(missingRules("sinmayuscula1")).toEqual(["una mayúscula"]);
    expect(missingRules("Segura12345")).toEqual([]);
  });

  it("el CSV neutraliza fórmulas y escapa comillas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("\"'+1\"");
    expect(csvCell("@SUM")).toBe("\"'@SUM\"");
    expect(csvCell(null)).toBe("\"\"");
    expect(toCsv([["name", "Programa"], ["courses", "Cursos"]], [{ name: "Base de Datos", courses: 2 }])).toBe("\"Programa\",\"Cursos\"\r\n\"Base de Datos\",\"2\"");
  });

  it("el contenido se envía sin campos vacíos y con el orden numérico", () => {
    expect(contentBody({ type: "noticia", title: "Hola", summary: "", sortOrder: "3", seoTitle: "" }, "/media/1"))
      .toEqual({ type: "noticia", title: "Hola", sortOrder: 3, imageUrl: "/media/1" });
  });
});

describe("formularios públicos", () => {
  function fillRegister(password: string) {
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Prueba" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "ana@iinicia.test" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: password } });
    fireEvent.click(screen.getByRole("checkbox"));
  }

  it("registro: una contraseña incompleta se explica sin llamar al servidor", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<RegisterForm />);
    fillRegister("sinmayuscula1");
    fireEvent.submit(screen.getByRole("button", { name: "Crear cuenta" }).closest("form")!);
    expect(screen.getByRole("alert").textContent).toBe("A tu contraseña le falta: una mayúscula.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registro: un correo ya registrado ofrece iniciar sesión", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Ya existe una cuenta con ese correo" }, 409)));
    render(<RegisterForm />);
    fillRegister("Segura12345");
    fireEvent.submit(screen.getByRole("button", { name: "Crear cuenta" }).closest("form")!);
    await waitFor(() => expect(screen.getByText(/Ya existe una cuenta con ese correo/)).toBeTruthy());
    expect(screen.getAllByRole("link", { name: "Inicia sesión" }).length).toBeGreaterThan(0);
  });

  it("registro: el éxito indica revisar el correo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ status: "aspirante" }, 201)));
    render(<RegisterForm />);
    fillRegister("Segura12345");
    fireEvent.submit(screen.getByRole("button", { name: "Crear cuenta" }).closest("form")!);
    expect(await screen.findByRole("heading", { name: "Revisa tu correo" })).toBeTruthy();
  });

  it("información: el límite de intentos se explica en español", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "ThrottlerException: Too Many Requests" }, 429)));
    render(<InfoRequestForm programs={[{ id: "p1", name: "Base de Datos" }]} />);
    fireEvent.change(screen.getByLabelText("Nombre completo"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "ana@iinicia.test" } });
    fireEvent.change(screen.getByLabelText("¿En qué podemos ayudarte?"), { target: { value: "Quiero información" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(screen.getByRole("button", { name: "Solicitar información" }).closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Demasiados intentos/);
  });
});
