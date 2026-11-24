import { RequestMethod, VERSION_NEUTRAL } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';

/**
 * Inventario de rutas leído de los metadatos de Nest, sin arrancar el servidor ni tocar la base.
 * Es la referencia de compatibilidad de la Fase 2: método, ruta, permiso, público, código HTTP,
 * límite de intentos, DTO del cuerpo y parámetros.
 */
export interface RouteEntry {
  method: string;
  path: string;
  permission: string | null;
  public: boolean;
  httpCode: number;
  throttle: { limit: number; ttl: number } | null;
  body: string | null;
  params: string[];
  query: string[];
}

const PUBLIC_KEY = 'iinicia:public';
const PERMISSION_KEY = 'iinicia:permission';
type Ctor = { prototype: object; name: string };
type RouteArg = { index: number; data?: string; pipes?: unknown[] };

function collectControllers(moduleRef: unknown, seen = new Set<unknown>(), out: Ctor[] = []): Ctor[] {
  const mod = typeof moduleRef === 'function' ? moduleRef : (moduleRef as { module?: unknown } | undefined)?.module;
  if (!mod || seen.has(mod)) return out;
  seen.add(mod);
  out.push(...((Reflect.getMetadata('controllers', mod) as Ctor[] | undefined) ?? []));
  const dynamic = typeof moduleRef === 'object' && moduleRef ? ((moduleRef as { imports?: unknown[] }).imports ?? []) : [];
  for (const child of [...((Reflect.getMetadata('imports', mod) as unknown[] | undefined) ?? []), ...dynamic]) {
    collectControllers(child, seen, out);
  }
  return out;
}

const join = (...parts: (string | undefined)[]) =>
  '/' + parts.filter((p): p is string => p !== undefined && p !== '' && p !== '/').map((p) => p.replace(/^\/|\/$/g, '')).join('/');

const pipeName = (p: unknown) => (typeof p === 'function' ? p.name : (p as object).constructor.name);

export function routeInventory(appModule: unknown, globalPrefix = 'api'): RouteEntry[] {
  const routes: RouteEntry[] = [];
  for (const controller of collectControllers(appModule)) {
    const base = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
    const classVersion = Reflect.getMetadata(VERSION_METADATA, controller) as string | symbol | undefined;
    const proto = controller.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (methodPath === undefined || method === undefined) continue;

      const version = (Reflect.getMetadata(VERSION_METADATA, handler) as string | symbol | undefined) ?? classVersion;
      const versionSegment = version === undefined || version === VERSION_NEUTRAL ? undefined : `v${String(version)}`;
      const meta = (key: string) => Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, controller);
      const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', handler) as number | undefined;
      const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, name) ?? {}) as Record<string, RouteArg>;
      const types = (Reflect.getMetadata('design:paramtypes', proto, name) ?? []) as ({ name?: string } | undefined)[];
      const byType = (type: RouteParamtypes) => Object.entries(args)
        .filter(([key]) => Number(key.split(':')[0]) === type)
        .map(([, a]) => a);
      const describe = (a: RouteArg) => {
        const pipes = (a.pipes ?? []).map(pipeName).sort();
        return `${a.data ?? '*'}${pipes.length ? ` (${pipes.join(', ')})` : ''}`;
      };
      const body = byType(RouteParamtypes.BODY)[0];
      routes.push({
        method: RequestMethod[method],
        path: join(globalPrefix, versionSegment, base, methodPath),
        permission: (meta(PERMISSION_KEY) as string | undefined) ?? null,
        public: Boolean(meta(PUBLIC_KEY)),
        httpCode: (Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined) ?? (method === RequestMethod.POST ? 201 : 200),
        throttle: limit === undefined ? null : { limit, ttl: Reflect.getMetadata('THROTTLER:TTLdefault', handler) as number },
        body: body ? (types[body.index]?.name ?? 'unknown') : null,
        params: byType(RouteParamtypes.PARAM).map(describe).sort(),
        query: byType(RouteParamtypes.QUERY).map(describe).sort(),
      });
    }
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}
