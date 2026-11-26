import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { requiresMfa } from '../../modules/auth/permissions';
import { config } from '../../config';

const { url, realm, clientId, clientSecret } = config.keycloak;
const adminBase = `${url}/admin/realms/${realm}`;

export interface NewIdentity {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  emailVerified?: boolean;
}

/** Sesión de Keycloak tal como la ve un administrador (sin IP ni datos del navegador). */
export interface KeycloakSession {
  id: string;
  kind: 'en_linea' | 'offline';
  started: number;
  lastAccess: number;
  clients: string[];
}
interface RawSession { id: string; start: number; lastAccess: number; clients?: Record<string, string> }

@Injectable()
export class KeycloakService {
  private readonly logger = new Logger(KeycloakService.name);
  private token?: { value: string; expiresAt: number };

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 10_000) return this.token.value;
    const response = await fetch(`${url}/realms/${realm}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new ServiceUnavailableException('Proveedor de identidad no disponible');
    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${adminBase}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(15_000),
    });
  }

  /**
   * Cierra una sesión concreta de Keycloak (Fase 4.10): la del portal es "en línea" y la de la app, por
   * offline_access, es "offline". Devuelve true si la sesión existía y se cerró, o si ya no existía.
   * Lanza ServiceUnavailableException si Keycloak no responde.
   */
  async endSession(sid: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(sid)) return false;
    for (const offline of [false, true]) {
      let response: Response;
      try {
        response = await this.request(`/sessions/${sid}${offline ? '?isOffline=true' : ''}`, { method: 'DELETE' });
      } catch {
        throw new ServiceUnavailableException('Proveedor de identidad no disponible');
      }
      if (response.status === 204) return true;
      if (response.status !== 404) throw new ServiceUnavailableException('Proveedor de identidad no disponible');
    }
    return true;
  }

  /** Fase 5: cierra todas las sesiones de la persona (en línea y offline, comprobado en Keycloak 26.4.7). */
  async logoutAll(sub: string): Promise<void> {
    const response = await this.request(`/users/${sub}/logout`, { method: 'POST' });
    if (!response.ok) throw new ServiceUnavailableException('Keycloak no pudo cerrar las sesiones');
  }

  /** Fase 5: sesiones activas (en línea y offline) de la persona, para revocar una sesión comprometida. */
  async listSessions(sub: string): Promise<KeycloakSession[]> {
    const online = await this.request(`/users/${sub}/sessions`);
    if (!online.ok) throw new ServiceUnavailableException('Keycloak no respondió');
    const sessions = (await online.json()) as RawSession[];
    const offline: RawSession[] = [];
    for (const clientId of ['iinicia-android', 'iinicia-portal']) {
      const client = await this.request(`/clients?clientId=${clientId}`);
      const [found] = client.ok ? ((await client.json()) as { id: string }[]) : [];
      if (!found) continue;
      const res = await this.request(`/users/${sub}/offline-sessions/${found.id}`);
      if (res.ok) offline.push(...((await res.json()) as RawSession[]));
    }
    const map = (s: RawSession, kind: 'en_linea' | 'offline'): KeycloakSession => ({
      id: s.id, kind, started: s.start, lastAccess: s.lastAccess, clients: Object.values(s.clients ?? {}),
    });
    return [...sessions.map((s) => map(s, 'en_linea')), ...offline.map((s) => map(s, 'offline'))];
  }

  async findByEmail(email: string): Promise<string | null> {
    const response = await this.request(`/users?exact=true&email=${encodeURIComponent(email)}`);
    if (!response.ok) throw new ServiceUnavailableException('Proveedor de identidad no disponible');
    const users = (await response.json()) as { id: string }[];
    return users[0]?.id ?? null;
  }

  async createUser(identity: NewIdentity): Promise<string> {
    const response = await this.request('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: identity.email.toLowerCase(),
        email: identity.email.toLowerCase(),
        firstName: identity.firstName,
        lastName: identity.lastName,
        enabled: true,
        emailVerified: identity.emailVerified ?? false,
        requiredActions: identity.emailVerified ? [] : ['VERIFY_EMAIL'],
        credentials: [{ type: 'password', value: identity.password, temporary: false }],
      }),
    });
    if (response.status === 409) throw new ConflictException('Ya existe una cuenta con ese correo');
    if (response.status === 400) {
      throw new ConflictException('La contraseña no cumple la política: mínimo 10 caracteres, mayúscula, minúscula y número');
    }
    if (response.status !== 201) throw new ServiceUnavailableException('No se pudo crear la identidad');
    const id = response.headers.get('location')?.split('/').pop();
    if (!id) throw new ServiceUnavailableException('Respuesta inválida del proveedor de identidad');
    return id;
  }

  async deleteUser(sub: string): Promise<void> {
    await this.request(`/users/${sub}`, { method: 'DELETE' });
  }

  async setEnabled(sub: string, enabled: boolean): Promise<void> {
    const response = await this.request(`/users/${sub}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
    if (!response.ok) throw new ServiceUnavailableException('No se pudo actualizar la cuenta');
    if (!enabled) await this.request(`/users/${sub}/logout`, { method: 'POST' });
  }

  async updateProfile(sub: string, firstName: string, lastName: string): Promise<void> {
    const current = await this.request(`/users/${sub}`);
    if (!current.ok) throw new ServiceUnavailableException('No se pudo leer la cuenta');
    const body = { ...(await current.json() as object), firstName, lastName };
    const response = await this.request(`/users/${sub}`, { method: 'PUT', body: JSON.stringify(body) });
    if (!response.ok) throw new ServiceUnavailableException('No se pudo actualizar la cuenta');
  }

  /** Sincroniza los roles para que el token refleje la autorización vigente. */
  async setRealmRoles(sub: string, roles: string[]): Promise<void> {
    const managed = new Set(['superadmin', 'admin_tecnico', 'admin_academico', 'coordinador', 'profesor', 'estudiante', 'aspirante', 'soporte']);
    const all = (await (await this.request('/roles')).json()) as { id: string; name: string }[];
    const current = (await (await this.request(`/users/${sub}/role-mappings/realm`)).json()) as { id: string; name: string }[];
    const remove = current.filter((r) => managed.has(r.name) && !roles.includes(r.name));
    const add = all.filter((r) => roles.includes(r.name) && !current.some((c) => c.name === r.name));
    if (remove.length) await this.request(`/users/${sub}/role-mappings/realm`, { method: 'DELETE', body: JSON.stringify(remove) });
    if (add.length) await this.request(`/users/${sub}/role-mappings/realm`, { method: 'POST', body: JSON.stringify(add) });
    if (config.mfaPrivilegedRoles && requiresMfa(roles)) await this.requireOtp(sub);
  }

  /**
   * Obliga a registrar un autenticador en el siguiente acceso. El flujo de Keycloak pide el codigo
   * en cada inicio de sesion a todo usuario que ya tiene OTP configurado.
   */
  private async requireOtp(sub: string): Promise<void> {
    const credentials = (await (await this.request(`/users/${sub}/credentials`)).json()) as { type: string }[];
    if (credentials.some((c) => c.type === 'otp')) return;
    const user = (await (await this.request(`/users/${sub}`)).json()) as { requiredActions?: string[] };
    const actions = new Set(user.requiredActions ?? []);
    if (actions.has('CONFIGURE_TOTP')) return;
    actions.add('CONFIGURE_TOTP');
    const response = await this.request(`/users/${sub}`, { method: 'PUT', body: JSON.stringify({ ...user, requiredActions: [...actions] }) });
    if (!response.ok) throw new ServiceUnavailableException('No se pudo exigir la verificación en dos pasos');
  }

  async sendVerificationEmail(sub: string): Promise<void> {
    // send-verify-email usa la plantilla de confirmación de correo. Al confirmar, el enlace «Ir a IINICIA»
    // lleva a Mi IINICIA, que pide iniciar sesión. Esa URL está registrada tal cual en el cliente del portal.
    const query = new URLSearchParams({ client_id: 'iinicia-portal', redirect_uri: `${config.portalUrl}/mi-iinicia` });
    const response = await this.request(`/users/${sub}/send-verify-email?${query}`, { method: 'PUT' });
    if (!response.ok) this.logger.warn(`No se pudo enviar la verificación (HTTP ${response.status})`);
  }

  async health(): Promise<boolean> {
    try {
      return (await fetch(`${url}/realms/${realm}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(3000) })).ok;
    } catch {
      return false;
    }
  }
}
