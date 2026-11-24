import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { COOKIES, unseal } from "./session-core";

const base = () => `${process.env.BACKEND_URL}/api/v1`;

export interface Program { id: string; slug: string; name: string; level: string; summary: string; description?: string; duration: string; modality: string; imageUrl?: string }
export interface ContentItem { id: string; type: string; slug: string; title: string; summary: string; body: string; imageUrl?: string; seoTitle?: string; seoDescription?: string; publishedAt?: string }
export interface Me { id: string; email: string; firstName: string; lastName: string; phone?: string; status: string; roles: string[]; permissions: string[]; moodleSyncStatus: string }
export interface Activity { cmid: number; name: string; modname: string; url: string; duedate: number; completed: boolean }
export interface Course { id: number; fullname: string; shortname: string; summary: string; progress: number; url: string; activityCount?: number; sections?: { id: number; name: string; activities: Activity[] }[] }
export interface Upcoming extends Activity { courseId: number; courseName: string }
export interface Application { id: string; status: string; programId: string; programName: string; programSlug: string; cohortName?: string; createdAt: string }
export interface Notice { id: string; title: string; body: string; link?: string; readAt?: string; createdAt: string }

export async function publicGet<T>(path: string): Promise<T | null> {
  await connection();
  try {
    const response = await fetch(`${base()}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function privateGet<T>(path: string): Promise<T | null> {
  const store = await cookies();
  const access = await unseal<{ t: string }>(store.get(COOKIES.access)?.value);
  if (!access) return null;
  try {
    const response = await fetch(`${base()}${path}`, {
      headers: { authorization: `Bearer ${access.t}` },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export const getMe = () => privateGet<Me>("/me");

export const LEVEL_LABELS: Record<string, string> = {
  licenciatura: "Licenciatura", diplomado: "Diplomado", certificacion: "Certificación", curso: "Curso",
};
export const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadministrador", admin_tecnico: "Administrador técnico", admin_academico: "Administrador académico",
  coordinador: "Coordinador", profesor: "Profesor", estudiante: "Estudiante", aspirante: "Aspirante", soporte: "Soporte",
};
