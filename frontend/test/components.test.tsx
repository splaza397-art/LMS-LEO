// Componentes reutilizables (Fase 3, etapa 3.3): accesibilidad, estados y comportamiento.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmButton } from "@/components/feedback/confirm-button";
import { EmptyState, ErrorMessage, Loading, SuccessMessage } from "@/components/feedback/status";
import { CheckboxField, SelectField, TextField } from "@/components/forms/field";
import { SearchInput } from "@/components/forms/search-input";
import { Tabs } from "@/components/navigation/tabs";
import { Pagination } from "@/components/tables/pagination";
import { Table, Td } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("por omisión no envía formularios y usa el estilo institucional", () => {
    render(<Button>Guardar</Button>);
    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("btn-primary");
  });
  it("mientras trabaja se desactiva y muestra el texto de espera", () => {
    render(<Button busy busyLabel="Guardando...">Guardar</Button>);
    const button = screen.getByRole("button", { name: "Guardando..." }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});

describe("campos de formulario", () => {
  it("TextField asocia etiqueta, ayuda y error", () => {
    render(<TextField label="Correo" name="email" hint="Usa tu correo personal" error="Correo inválido" />);
    const input = screen.getByLabelText("Correo");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = input.getAttribute("aria-describedby")!.split(" ").map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(["Usa tu correo personal", "Correo inválido"]);
    expect(screen.getByRole("alert").textContent).toBe("Correo inválido");
  });
  it("SelectField muestra la opción vacía y las opciones", () => {
    render(<SelectField label="Estado" placeholder="Todos" options={[["activo", "Activo"], ["suspendido", "Suspendido"]]} />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Todos", "Activo", "Suspendido"]);
  });
  it("CheckboxField se puede marcar desde su etiqueta", () => {
    render(<CheckboxField label="Acepto el aviso" />);
    const box = screen.getByLabelText("Acepto el aviso") as HTMLInputElement;
    fireEvent.click(screen.getByText("Acepto el aviso"));
    expect(box.checked).toBe(true);
  });
  it("SearchInput es un buscador etiquetado con límite de longitud", () => {
    const onChange = vi.fn();
    render(<SearchInput label="Buscar personas" value="" onChange={onChange} />);
    expect(screen.getByRole("search")).toBeTruthy();
    const input = screen.getByLabelText("Buscar personas");
    expect(input.getAttribute("maxlength")).toBe("100");
    fireEvent.change(input, { target: { value: "ana" } });
    expect(onChange).toHaveBeenCalledWith("ana");
  });
});

describe("Pagination", () => {
  it("muestra el rango y el total, y navega", () => {
    const onPage = vi.fn();
    render(<Pagination page={2} pageSize={20} total={250} onPageChange={onPage} label="usuarios" />);
    expect(screen.getByText("Mostrando 21–40 de 250 usuarios")).toBeTruthy();
    expect(screen.getByText("Página 2 de 13")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(onPage.mock.calls).toEqual([[3], [1]]);
  });
  it("desactiva Anterior en la primera página y Siguiente en la última", () => {
    const { rerender } = render(<Pagination page={1} pageSize={20} total={30} onPageChange={() => {}} />);
    expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Pagination page={2} pageSize={20} total={30} onPageChange={() => {}} />);
    expect((screen.getByRole("button", { name: "Siguiente" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("sin resultados lo dice y no permite avanzar", () => {
    render(<Pagination page={1} pageSize={20} total={0} onPageChange={() => {}} label="solicitudes" />);
    expect(screen.getByText("Sin solicitudes")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Siguiente" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("permite cambiar el tamaño de página", () => {
    const onSize = vi.fn();
    render(<Pagination page={1} pageSize={20} total={500} onPageChange={() => {}} onPageSizeChange={onSize} />);
    fireEvent.change(screen.getByLabelText("Por página"), { target: { value: "50" } });
    expect(onSize).toHaveBeenCalledWith(50);
  });
});

describe("ConfirmButton", () => {
  it("pide confirmación, mueve el foco y ejecuta una sola vez", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Eliminar" confirmLabel="Confirmar eliminación" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    const confirm = screen.getByRole("button", { name: "Confirmar eliminación" });
    expect(document.activeElement).toBe(confirm);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeTruthy();
  });
  it("Escape cancela y devuelve el foco al botón original", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Suspender" confirmLabel="Confirmar" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Suspender" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Confirmar" }), { key: "Escape" });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Suspender" }));
  });
});

describe("Tabs", () => {
  const items = [{ id: "a", label: "Usuarios" }, { id: "b", label: "Programas" }, { id: "c", label: "Auditoría" }];
  it("solo la pestaña activa entra en el orden de tabulación y las flechas cambian de pestaña", () => {
    const onChange = vi.fn();
    render(<Tabs items={items} active="a" onChange={onChange} label="Secciones" panelId="p" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(onChange.mock.calls).toEqual([["b"], ["c"], ["c"]]);
    expect(document.activeElement).toBe(tabs[2]);
  });
});

describe("estados y tablas", () => {
  it("los mensajes usan el rol accesible adecuado", () => {
    render(<><Loading /><ErrorMessage message="Falló" /><SuccessMessage message="Listo" /><EmptyState>Sin datos</EmptyState><ErrorMessage /></>);
    expect(screen.getAllByRole("status").map((s) => s.textContent)).toEqual(["Cargando...", "Listo"]);
    expect(screen.getAllByRole("alert").map((s) => s.textContent)).toEqual(["Falló"]);
    expect(screen.getByText("Sin datos")).toBeTruthy();
  });
  it("la tabla es una región etiquetada y desplazable con teclado", () => {
    render(<Table head={["Nombre", "Estado"]} label="Usuarios"><tr><Td>Ana</Td><Td>Activo</Td></tr></Table>);
    const region = screen.getByRole("region", { name: "Usuarios" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Nombre", "Estado"]);
  });
});
