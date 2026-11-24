"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Markdown } from "./markdown";
import { bff } from "./portal-forms";

const STATUS_LABELS: Record<string, string> = { aspirante: "Aspirante", admitido: "Admitido", activo: "Activo", suspendido: "Suspendido" };
const SYNC_LABELS: Record<string, string> = { none: "Sin cuenta", pending: "Pendiente", synced: "Sincronizado", error: "Error" };

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ROLES: [string, string][] = [
  ["superadmin", "Superadministrador"], ["admin_tecnico", "Administrador técnico"], ["admin_academico", "Administrador académico"],
  ["coordinador", "Coordinador"], ["profesor", "Profesor"], ["estudiante", "Estudiante"], ["aspirante", "Aspirante"], ["soporte", "Soporte"],
];
const LEVELS: [string, string][] = [["licenciatura", "Licenciatura"], ["diplomado", "Diplomado"], ["certificacion", "Certificación"], ["curso", "Curso"]];
const CONTENT_TYPES: [string, string][] = [["noticia", "Noticia"], ["pagina", "Página"], ["faq", "Pregunta frecuente"], ["docente", "Docente"], ["autoridad", "Autoridad"], ["contacto", "Contacto"]];
const TABS = [
  { id: "solicitudes", label: "Solicitudes", permission: "applications:review" },
  { id: "usuarios", label: "Usuarios", permission: "users:read" },
  { id: "programas", label: "Programas", permission: "programs:manage" },
  { id: "contenidos", label: "Contenidos", permission: "content:manage" },
  { id: "informacion", label: "Información", permission: "info_requests:manage" },
  { id: "avisos", label: "Avisos", permission: "notifications:send" },
  { id: "reportes", label: "Reportes", permission: "reports:read" },
  { id: "auditoria", label: "Auditoría", permission: "audit:read" },
];

function useData(path: string | null) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!path) return;
    try {
      setRows(await bff<Row[]>(path));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    if (!path) return;
    let current = true; // Descarta respuestas viejas, por ejemplo al escribir en el buscador.
    bff<Row[]>(path)
      .then((data) => { if (current) { setRows(data); setError(""); } })
      .catch((e: Error) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [path]);
  return { rows, error, load, setError };
}

const Status = ({ error, loading }: { error: string; loading: boolean }) =>
  error ? <p role="alert" className="my-3 text-sm text-red-700">{error}</p> : loading ? <p role="status" className="my-3 muted">Cargando...</p> : null;

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" tabIndex={0} role="region" aria-label="Tabla con desplazamiento">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="bg-slate-100"><tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-200">{children}</tbody>
      </table>
    </div>
  );
}
const Td = ({ children }: { children?: ReactNode }) => <td className="px-3 py-2 align-middle">{children}</td>;

/** Confirmacion en la misma pantalla para acciones destructivas. */
function ConfirmButton({ label, confirmLabel, onConfirm }: { label: string; confirmLabel: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="btn-danger" onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="inline-flex gap-2">
      <button type="button" className="btn-danger" onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="btn-outline" onClick={() => setAsking(false)}>Cancelar</button>
    </span>
  );
}

function ApplicationRow({ a, cohorts, onDecide }: { a: Row; cohorts: Row[]; onDecide: (id: string, decision: string, cohortId?: string) => void }) {
  const [cohortId, setCohortId] = useState("");
  return (
    <tr>
      <Td>{a.firstName} {a.lastName}</Td><Td>{a.email}</Td><Td>{a.programName}</Td>
      <Td>
        <select aria-label={`Cohorte para ${a.email}`} className="input" value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
          <option value="">Sin cohorte</option>
          {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Td>
      <Td><div className="flex gap-2">
        <button className="btn-primary" onClick={() => onDecide(a.id, "admitida", cohortId || undefined)}>Admitir</button>
        <ConfirmButton label="Rechazar" confirmLabel="Confirmar rechazo" onConfirm={() => onDecide(a.id, "rechazada")} />
      </div></Td>
    </tr>
  );
}

function Applications() {
  const { rows, error, load, setError } = useData("admin/applications?status=enviada");
  const { rows: programs } = useData("admin/programs");
  async function decide(id: string, decision: string, cohortId?: string) {
    try {
      const result = await bff<{ moodleSynced: boolean }>(`admin/applications/${id}/decision`, "POST", { decision, ...(cohortId ? { cohortId } : {}) });
      await load();
      if (decision === "admitida" && !result.moodleSynced) setError("Admitida. Moodle no respondió; la sincronización se reintentará sola.");
    } catch (e) { setError((e as Error).message); }
  }
  return (
    <>
      <Status error={error} loading={!rows} />
      {rows?.length === 0 && <p className="muted">No hay solicitudes pendientes.</p>}
      {!!rows?.length && (
        <Table head={["Persona", "Correo", "Programa", "Cohorte", "Acciones"]}>
          {rows.map((a) => <ApplicationRow key={a.id} a={a} cohorts={programs?.find((p) => p.id === a.programId)?.cohorts ?? []} onDecide={decide} />)}
        </Table>
      )}
    </>
  );
}

function RoleEditor({ user, programs, onSave }: { user: Row; programs: Row[]; onSave: (roles: string[], programId?: string) => void }) {
  const [role, setRole] = useState<string>(user.roles[0] ?? "aspirante");
  const [programId, setProgramId] = useState("");
  const dirty = role !== user.roles[0] || (role === "coordinador" && !!programId);
  return (
    <div className="flex min-w-48 flex-col gap-2">
      <select aria-label={`Rol de ${user.email}`} className="input" value={role} onChange={(e) => setRole(e.target.value)}>
        {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {role === "coordinador" && (
        <select aria-label={`Programa que coordina ${user.email}`} className="input" value={programId} onChange={(e) => setProgramId(e.target.value)}>
          <option value="">Selecciona programa</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {dirty && <button className="btn-outline" disabled={role === "coordinador" && !programId} onClick={() => onSave([role], programId || undefined)}>Guardar rol</button>}
    </div>
  );
}

function UserEnrolments({ userId, courses, onError }: { userId: string; courses: Row[]; onError: (m: string) => void }) {
  const { rows, load } = useData(`admin/users/${userId}/enrolments`);
  async function toggle(courseId: number, active: boolean) {
    try { await bff(`admin/users/${userId}/enrolment`, "PATCH", { courseId: Number(courseId), active }); await load(); }
    catch (e) { onError((e as Error).message); }
  }
  if (!rows) return <p role="status" className="text-sm muted">Cargando matrículas...</p>;
  if (!rows.length) return <p className="text-sm muted">Sin matrículas.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((e) => (
        <li key={e.courseId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span><strong>{courses.find((c) => Number(c.id) === Number(e.courseId))?.fullname ?? `Curso ${e.courseId}`}</strong> · {e.role} · {e.status === "suspended" ? "suspendida" : "activa"}</span>
          {e.status === "suspended"
            ? <button className="btn-outline" onClick={() => toggle(e.courseId, true)}>Reactivar matrícula</button>
            : <ConfirmButton label="Suspender matrícula" confirmLabel="Confirmar" onConfirm={() => toggle(e.courseId, false)} />}
        </li>
      ))}
    </ul>
  );
}

function Users({ permissions, selfId }: { permissions: string[]; selfId: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { rows, error, load, setError } = useData(`admin/users?q=${encodeURIComponent(q)}`);
  const canRoles = permissions.includes("roles:manage");
  const canEnrol = permissions.includes("enrolments:manage");
  const { rows: programs } = useData(canRoles ? "admin/programs" : null);
  const { rows: courses } = useData(canEnrol ? "admin/moodle/courses" : null);
  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); setError(""); await load(); } catch (e) { setError((e as Error).message); }
  };
  return (
    <>
      <label htmlFor="user-search" className="label">Buscar</label>
      <input id="user-search" className="input mb-4 max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o correo" />
      <Status error={error} loading={!rows} />
      {rows && (
        <Table head={["Persona", "Estado", "Moodle", "Rol", "Acciones"]}>
          {rows.flatMap((u) => [
            <tr key={u.id}>
              <Td><span className="font-semibold">{u.firstName} {u.lastName}</span><br /><span className="text-xs muted">{u.email}</span></Td>
              <Td>{STATUS_LABELS[u.status] ?? u.status}</Td>
              <Td>{SYNC_LABELS[u.moodleSyncStatus] ?? u.moodleSyncStatus}</Td>
              <Td>{canRoles && u.id !== selfId
                ? <RoleEditor key={u.roles.join()} user={u} programs={programs ?? []} onSave={(roles, programId) => act(() => bff(`admin/users/${u.id}/roles`, "PUT", { roles, ...(programId ? { programId } : {}) }))} />
                : u.roles.map((r: string) => ROLES.find(([v]) => v === r)?.[1] ?? r).join(", ")}</Td>
              <Td><div className="flex flex-wrap gap-2">
                {canEnrol && <button className="btn-outline" aria-expanded={open === u.id} onClick={() => setOpen(open === u.id ? null : u.id)}>Matrículas</button>}
                {permissions.includes("users:suspend") && u.id !== selfId && (u.status === "suspendido"
                  ? <button className="btn-outline" onClick={() => act(() => bff(`admin/users/${u.id}/suspension`, "PATCH", { suspended: false }))}>Reactivar</button>
                  : <ConfirmButton label="Suspender" confirmLabel="Confirmar" onConfirm={() => act(() => bff(`admin/users/${u.id}/suspension`, "PATCH", { suspended: true }))} />)}
                {permissions.includes("integrations:manage") && (
                  <button className="btn-outline" onClick={() => act(() => bff(`admin/users/${u.id}/sync`, "POST"))}>Sincronizar</button>
                )}
              </div></Td>
            </tr>,
            ...(open === u.id ? [<tr key={`${u.id}-e`}><td colSpan={5} className="bg-slate-50 px-3 py-3"><UserEnrolments userId={u.id} courses={courses ?? []} onError={setError} /></td></tr>] : []),
          ])}
        </Table>
      )}
    </>
  );
}

function ProgramForm({ program, onDone, onCancel, onError }: { program?: Row; onDone: () => void; onCancel: () => void; onError: (m: string) => void }) {
  const [cover, setCover] = useState<string>(program?.imageUrl ?? "");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const body = { ...f, published: f.published === "on", ...(cover ? { imageUrl: cover } : {}) };
    try {
      if (program) await bff(`admin/programs/${program.id}`, "PUT", body);
      else await bff("admin/programs", "POST", body);
      onDone();
    } catch (e) { onError((e as Error).message); }
  }
  const id = program?.id ?? "new";
  return (
    <form onSubmit={save} className="card mb-4 grid gap-3 sm:grid-cols-2">
      <div><label className="label" htmlFor={`pg-name-${id}`}>Nombre</label><input id={`pg-name-${id}`} name="name" defaultValue={program?.name} required minLength={3} className="input" /></div>
      <div><label className="label" htmlFor={`pg-slug-${id}`}>Ruta (slug)</label><input id={`pg-slug-${id}`} name="slug" defaultValue={program?.slug} required pattern="[a-z0-9\-]{3,80}" className="input" /></div>
      <div><label className="label" htmlFor={`pg-level-${id}`}>Nivel</label>
        <select id={`pg-level-${id}`} name="level" defaultValue={program?.level ?? "licenciatura"} className="input">{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div><label className="label" htmlFor={`pg-duration-${id}`}>Duración</label><input id={`pg-duration-${id}`} name="duration" defaultValue={program?.duration} maxLength={80} className="input" /></div>
      <div><label className="label" htmlFor={`pg-modality-${id}`}>Modalidad</label><input id={`pg-modality-${id}`} name="modality" defaultValue={program?.modality ?? "En línea"} maxLength={80} className="input" /></div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="published" defaultChecked={program?.published} className="size-5" /> Publicado en el portal</label>
      <div className="sm:col-span-2"><label className="label" htmlFor={`pg-summary-${id}`}>Resumen</label><input id={`pg-summary-${id}`} name="summary" defaultValue={program?.summary} required minLength={3} maxLength={400} className="input" /></div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`pg-cover-${id}`}>Portada</label>
        <input id={`pg-cover-${id}`} type="file" accept="image/png,image/jpeg,image/webp" className="input"
          onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { setCover((await uploadImage(file)).url); } catch (err) { onError((err as Error).message); } }} />
        {cover && <p className="mt-1 flex items-center gap-2 text-xs muted">Portada cargada <button type="button" className="font-semibold text-red-700 underline" onClick={() => setCover("")}>Quitar</button></p>}
      </div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`pg-desc-${id}`}>Descripción</label><textarea id={`pg-desc-${id}`} name="description" defaultValue={program?.description} rows={5} className="input" /></div>
      <div className="flex gap-2 sm:col-span-2"><button className="btn-primary">Guardar programa</button><button type="button" className="btn-outline" onClick={onCancel}>Cancelar</button></div>
    </form>
  );
}

function ProgramCard({ p, courses, candidates, canCreateEdit, reload, onError }: { p: Row; courses: Row[]; candidates: Row[]; canCreateEdit: boolean; reload: () => Promise<void>; onError: (m: string) => void }) {
  const [editing, setEditing] = useState(false);
  const { rows: teachers, load: loadTeachers } = useData(`admin/programs/${p.id}/teachers`);
  const [teacher, setTeacher] = useState("");
  const [teacherCourse, setTeacherCourse] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); onError(""); await reload(); await loadTeachers(); } catch (e) { onError((e as Error).message); }
  };
  const courseName = (id: number | string) => courses.find((c) => Number(c.id) === Number(id))?.fullname ?? `Curso ${id}`;
  const linked: (number | string)[] = p.courseIds;
  async function addCohort(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    await run(() => bff(`admin/programs/${p.id}/cohorts`, "POST", { name: f.name, ...(f.startsOn ? { startsOn: f.startsOn } : {}), ...(f.endsOn ? { endsOn: f.endsOn } : {}) }));
    form.reset();
  }
  if (editing) return <ProgramForm program={p} onDone={() => { setEditing(false); void reload(); }} onCancel={() => setEditing(false)} onError={onError} />;
  return (
    <li className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="font-bold">{p.name}</h2><p className="mt-1 text-sm muted">{p.level} · {p.published ? "Publicado" : "Oculto"}</p></div>
        {canCreateEdit && <button className="btn-outline" onClick={() => setEditing(true)}>Editar programa</button>}
      </div>

      <h3 className="mt-5 font-semibold">Cursos Moodle</h3>
      <ul className="mt-2 space-y-2">
        {linked.map((id) => (
          <li key={id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{courseName(id)}</span>
            <ConfirmButton label="Desvincular" confirmLabel="Confirmar" onConfirm={() => run(() => bff(`admin/programs/${p.id}/courses/${id}`, "DELETE"))} /></li>
        ))}
        {!linked.length && <li className="text-sm muted">Sin cursos vinculados.</li>}
      </ul>
      <label htmlFor={`course-${p.id}`} className="label mt-3">Vincular curso</label>
      <select id={`course-${p.id}`} className="input max-w-sm" value="" onChange={(e) => e.target.value && run(() => bff(`admin/programs/${p.id}/courses`, "POST", { moodleCourseId: Number(e.target.value) }))}>
        <option value="">Selecciona un curso</option>
        {courses.filter((c) => !linked.some((id) => Number(id) === Number(c.id))).map((c) => <option key={c.id} value={c.id}>{c.fullname}</option>)}
      </select>

      <h3 className="mt-5 font-semibold">Profesores</h3>
      <ul className="mt-2 space-y-2">
        {teachers?.filter((t) => t.status !== "suspended").map((t) => (
          <li key={`${t.userId}-${t.courseId}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{t.firstName} {t.lastName} · {courseName(t.courseId)}</span>
            <ConfirmButton label="Retirar" confirmLabel="Confirmar" onConfirm={() => run(() => bff(`admin/programs/${p.id}/teachers`, "PUT", { userId: t.userId, courseId: Number(t.courseId), active: false }))} />
          </li>
        ))}
        {teachers?.every((t) => t.status === "suspended") && <li className="text-sm muted">Sin profesores asignados.</li>}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <select aria-label={`Profesor para ${p.name}`} className="input" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
          <option value="">Selecciona profesor</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.email})</option>)}
        </select>
        <select aria-label={`Curso del profesor en ${p.name}`} className="input" value={teacherCourse} onChange={(e) => setTeacherCourse(e.target.value)}>
          <option value="">Selecciona curso</option>
          {linked.map((id) => <option key={id} value={id}>{courseName(id)}</option>)}
        </select>
        <button className="btn-outline" disabled={!teacher || !teacherCourse}
          onClick={() => run(async () => { await bff(`admin/programs/${p.id}/teachers`, "PUT", { userId: teacher, courseId: Number(teacherCourse), active: true }); setTeacher(""); setTeacherCourse(""); })}>Asignar profesor</button>
      </div>

      <h3 className="mt-5 font-semibold">Cohortes</h3>
      <p className="mt-1 text-sm muted">{p.cohorts.map((c: Row) => c.name).join(", ") || "Sin cohortes."}</p>
      <form onSubmit={addCohort} className="mt-2 grid gap-2 sm:grid-cols-4">
        <div><label className="label" htmlFor={`co-name-${p.id}`}>Nombre</label><input id={`co-name-${p.id}`} name="name" required minLength={2} className="input" /></div>
        <div><label className="label" htmlFor={`co-start-${p.id}`}>Inicio</label><input id={`co-start-${p.id}`} name="startsOn" type="date" className="input" /></div>
        <div><label className="label" htmlFor={`co-end-${p.id}`}>Fin</label><input id={`co-end-${p.id}`} name="endsOn" type="date" className="input" /></div>
        <button className="btn-outline self-end">Crear cohorte</button>
      </form>
    </li>
  );
}

function Programs({ permissions }: { permissions: string[] }) {
  const { rows, error, load, setError } = useData("admin/programs");
  const { rows: courses } = useData("admin/moodle/courses");
  const { rows: candidates } = useData("admin/teachers");
  const [creating, setCreating] = useState(false);
  const canCreate = permissions.includes("users:manage");
  return (
    <>
      <Status error={error} loading={!rows} />
      {canCreate && !creating && <button className="btn-primary mb-4" onClick={() => setCreating(true)}>Nuevo programa</button>}
      {creating && <ProgramForm onDone={() => { setCreating(false); void load(); }} onCancel={() => setCreating(false)} onError={setError} />}
      <ul className="space-y-3">
        {rows?.map((p) => <ProgramCard key={p.id} p={p} courses={courses ?? []} candidates={candidates ?? []} canCreateEdit reload={load} onError={setError} />)}
      </ul>
    </>
  );
}

function MarkdownEditor({ defaultValue, onError }: { defaultValue?: string; onError: (m: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue ?? "");
  const [preview, setPreview] = useState(false);
  function wrap(before: string, after = "", placeholder = "texto") {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    setValue(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + selected.length); });
  }
  async function image(file?: File) {
    if (!file) return;
    try {
      const { url } = await uploadImage(file);
      wrap("\n![", `](${url})\n`, "Descripción de la imagen");
    } catch (e) { onError((e as Error).message); }
  }
  const tools: [string, string, string, string][] = [
    ["Título", "\n## ", "\n", "Título"], ["Negrita", "**", "**", "texto"], ["Cursiva", "*", "*", "texto"],
    ["Lista", "\n- ", "\n", "elemento"], ["Enlace", "[", "](https://)", "texto del enlace"],
  ];
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {tools.map(([label, before, after, placeholder]) => <button key={label} type="button" className="btn-outline" onClick={() => wrap(before, after, placeholder)}>{label}</button>)}
        <label className="btn-outline cursor-pointer focus-within:outline-2">Imagen<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { void image(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <button type="button" className="btn-outline" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? "Editar" : "Vista previa"}</button>
      </div>
      {preview && <div className="min-h-40 rounded-lg border border-slate-300 bg-white p-4 leading-7 text-slate-700"><Markdown source={value} /></div>}
      <textarea ref={ref} id="c-body" name="body" value={value} onChange={(e) => setValue(e.target.value)} rows={10} hidden={preview} className="input font-mono" aria-label="Contenido" />
    </div>
  );
}

async function uploadImage(file: File): Promise<{ url: string }> {
  if (file.size > 5 * 1024 * 1024) throw new Error("La imagen supera 5 MB");
  const response = await fetch("/api/bff/v1/admin/media", { method: "POST", headers: { "content-type": file.type }, body: file });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? "No se pudo subir la imagen");
  return data;
}

function Content() {
  const { rows, error, load, setError } = useData("admin/content");
  const [editing, setEditing] = useState<Row | null>(null);
  const [cover, setCover] = useState("");
  const start = (item: Row) => { setEditing(item); setCover(item.imageUrl ?? ""); };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const body: Record<string, unknown> = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ""));
    if (cover) body.imageUrl = cover;
    if (raw.sortOrder) body.sortOrder = Number(raw.sortOrder);
    try {
      if (editing?.id) await bff(`admin/content/${editing.id}`, "PUT", body);
      else await bff("admin/content", "POST", body);
      setEditing(null);
      setError("");
      await load();
    } catch (e) { setError((e as Error).message); }
  }
  async function remove(id: string) {
    try { await bff(`admin/content/${id}`, "DELETE"); setError(""); await load(); } catch (e) { setError((e as Error).message); }
  }
  return (
    <>
      <Status error={error} loading={!rows} />
      <button className="btn-primary mb-4" onClick={() => start({ type: "noticia", status: "borrador" })}>Nuevo contenido</button>
      {editing && (
        <form key={editing.id ?? "new"} onSubmit={save} className="card mb-4 grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="c-type">Tipo</label>
            <select id="c-type" name="type" defaultValue={editing.type} className="input">{CONTENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="label" htmlFor="c-status">Estado</label>
            <select id="c-status" name="status" defaultValue={editing.status} className="input"><option value="borrador">Borrador</option><option value="publicado">Publicado</option></select></div>
          <div><label className="label" htmlFor="c-title">Título</label><input id="c-title" name="title" defaultValue={editing.title} required className="input" /></div>
          <div><label className="label" htmlFor="c-slug">Ruta (slug)</label><input id="c-slug" name="slug" defaultValue={editing.slug} required pattern="[a-z0-9\-]{2,120}" className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="c-summary">Resumen</label><input id="c-summary" name="summary" defaultValue={editing.summary} maxLength={600} className="input" /></div>
          <div className="sm:col-span-2">
            <span className="label">Contenido</span>
            <MarkdownEditor defaultValue={editing.body} onError={setError} />
          </div>
          <div>
            <label className="label" htmlFor="c-cover">Imagen principal</label>
            <input id="c-cover" type="file" accept="image/png,image/jpeg,image/webp" className="input"
              onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setCover((await uploadImage(f)).url); } catch (err) { setError((err as Error).message); } }} />
            {cover && <p className="mt-1 flex items-center gap-2 text-xs muted">Imagen cargada <button type="button" className="font-semibold text-red-700 underline" onClick={() => setCover("")}>Quitar</button></p>}
          </div>
          <div><label className="label" htmlFor="c-order">Orden</label><input id="c-order" name="sortOrder" type="number" defaultValue={editing.sortOrder ?? 0} className="input" /></div>
          <div><label className="label" htmlFor="c-seo-t">Título SEO</label><input id="c-seo-t" name="seoTitle" defaultValue={editing.seoTitle ?? ""} maxLength={160} className="input" /></div>
          <div><label className="label" htmlFor="c-seo-d">Descripción SEO</label><input id="c-seo-d" name="seoDescription" defaultValue={editing.seoDescription ?? ""} maxLength={320} className="input" /></div>
          <div className="flex gap-2 sm:col-span-2"><button className="btn-primary">Guardar</button><button type="button" className="btn-outline" onClick={() => setEditing(null)}>Cancelar</button></div>
        </form>
      )}
      {rows && (
        <Table head={["Título", "Tipo", "Estado", "Acciones"]}>
          {rows.map((c) => (
            <tr key={c.id}><Td>{c.title}</Td><Td>{CONTENT_TYPES.find(([v]) => v === c.type)?.[1] ?? c.type}</Td><Td>{c.status}</Td>
              <Td><div className="flex flex-wrap gap-2"><button className="btn-outline" aria-label={`Editar ${c.title}`} onClick={() => start(c)}>Editar</button>
                <ConfirmButton label="Eliminar" confirmLabel="Confirmar eliminación" onConfirm={() => remove(c.id)} /></div></Td></tr>
          ))}
        </Table>
      )}
    </>
  );
}

function InfoRequests() {
  const { rows, error, load, setError } = useData("admin/info-requests");
  async function mark(id: string, status: string) {
    try { await bff(`admin/info-requests/${id}`, "PATCH", { status }); await load(); } catch (e) { setError((e as Error).message); }
  }
  return (
    <>
      <Status error={error} loading={!rows} />
      {rows?.length === 0 && <p className="muted">No hay solicitudes de información.</p>}
      {!!rows?.length && (
        <Table head={["Fecha", "Persona", "Programa", "Mensaje", "Estado"]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>{new Date(r.createdAt).toLocaleDateString("es-MX")}</Td>
              <Td><span className="font-semibold">{r.name}</span><br /><span className="text-xs muted">{r.email}{r.phone ? ` · ${r.phone}` : ""}</span></Td>
              <Td>{r.programName ?? "Sin definir"}</Td>
              <Td><span className="line-clamp-3 max-w-xs">{r.message}</span></Td>
              <Td>{r.status === "nueva"
                ? <button className="btn-outline" onClick={() => mark(r.id, "atendida")}>Marcar atendida</button>
                : <button className="btn-outline" onClick={() => mark(r.id, "nueva")}>Reabrir</button>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

function Broadcast() {
  const { rows } = useData("admin/programs");
  const [message, setMessage] = useState("");
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    try {
      const { recipients } = await bff<{ recipients: number }>("admin/notifications", "POST", f);
      setMessage(`Aviso enviado a ${recipients} persona(s).`);
      form.reset();
    } catch (e) { setMessage((e as Error).message); }
  }
  return (
    <form onSubmit={send} className="card max-w-xl space-y-3">
      <div><label className="label" htmlFor="b-program">Programa</label>
        <select id="b-program" name="programId" required className="input"><option value="">Selecciona</option>{rows?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className="label" htmlFor="b-title">Título</label><input id="b-title" name="title" required minLength={3} maxLength={120} className="input" /></div>
      <div><label className="label" htmlFor="b-body">Mensaje</label><textarea id="b-body" name="body" required minLength={3} maxLength={500} rows={4} className="input" /></div>
      <button className="btn-primary">Enviar aviso</button>
      {message && <p role="status" className="text-sm muted">{message}</p>}
    </form>
  );
}

const REPORT_COLUMNS: [string, string][] = [
  ["name", "Programa"], ["courses", "Cursos"], ["pending", "En revisión"], ["admitted", "Admitidas"], ["rejected", "Rechazadas"],
  ["activeStudents", "Estudiantes activos"], ["suspendedStudents", "Matrículas suspendidas"], ["teachers", "Profesores"],
];

function Reports() {
  const { rows, error } = useData("admin/reports");
  function exportCsv() {
    if (!rows) return;
    // Evita que una hoja de calculo interprete como formula un texto que empiece con = + - @.
    const cell = (v: unknown) => { const s = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };
    const csv = [REPORT_COLUMNS.map(([, l]) => cell(l)).join(","), ...rows.map((r) => REPORT_COLUMNS.map(([k]) => cell(r[k])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-programas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <Status error={error} loading={!rows} />
      {rows && (
        <>
          <button className="btn-outline mb-4" onClick={exportCsv}>Exportar CSV</button>
          <Table head={REPORT_COLUMNS.map(([, l]) => l)}>
            {rows.map((r) => <tr key={r.id}>{REPORT_COLUMNS.map(([k]) => <Td key={k}>{r[k]}</Td>)}</tr>)}
          </Table>
        </>
      )}
    </>
  );
}

function Audit() {
  const { rows, error } = useData("admin/audit");
  return (
    <>
      <Status error={error} loading={!rows} />
      {rows && (
        <Table head={["Fecha", "Actor", "Acción", "Objetivo"]}>
          {rows.map((l) => <tr key={l.id}><Td>{new Date(l.createdAt).toLocaleString("es-MX")}</Td><Td>{l.actor ?? "sistema"}</Td><Td>{l.action}</Td><Td>{l.targetType ?? ""}</Td></tr>)}
        </Table>
      )}
    </>
  );
}

export function AdminPanel({ permissions, selfId }: { permissions: string[]; selfId: string }) {
  const tabs = TABS.filter((t) => permissions.includes(t.permission));
  const [tab, setTab] = useState(tabs[0]?.id);
  return (
    <>
      <div role="tablist" aria-label="Secciones" className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-controls="admin-tabpanel" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={tab === t.id ? "btn-primary" : "btn-outline"}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id="admin-tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "solicitudes" && <Applications />}
        {tab === "usuarios" && <Users permissions={permissions} selfId={selfId} />}
        {tab === "programas" && <Programs permissions={permissions} />}
        {tab === "contenidos" && <Content />}
        {tab === "informacion" && <InfoRequests />}
        {tab === "avisos" && <Broadcast />}
        {tab === "reportes" && <Reports />}
        {tab === "auditoria" && <Audit />}
      </div>
    </>
  );
}
