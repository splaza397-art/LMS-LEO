import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/register-form";

export const metadata: Metadata = { title: "Registro" };

export default function RegistroPage() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:py-14">
      <h1 className="h1">Crea tu cuenta</h1>
      <p className="mt-2 mb-6 muted">Una sola cuenta para el portal, el campus y la app. Crearla no inscribe a ningún curso.</p>
      <RegisterForm />
    </div>
  );
}
