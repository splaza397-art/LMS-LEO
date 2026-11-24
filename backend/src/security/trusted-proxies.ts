/**
 * Proxies cuyos encabezados X-Forwarded-For se aceptan (defecto S1 de la auditoría).
 *
 * Express toma como IP del cliente la última dirección de la cadena que NO pertenece a un proxy de confianza.
 * Por eso solo deben listarse los saltos propios (Nginx, el portal), nunca "todos".
 *  - DEV: "loopback". El backend escucha solo en 127.0.0.1, así que únicamente procesos de la misma máquina
 *    (el portal, las pruebas) pueden enviar X-Forwarded-For.
 *  - STAGING/PRODUCTION: direcciones o subredes internas de Nginx y del portal, por ejemplo "10.20.0.0/24".
 */
const FORBIDDEN = new Set(['true', '*', '0.0.0.0/0', '::/0', '0/0']);

export function parseTrustedProxies(value: string | undefined): string[] {
  const list = (value ?? 'loopback').split(',').map((v) => v.trim()).filter(Boolean);
  if (list.length === 0) return ['loopback'];
  const invalid = list.filter((v) => FORBIDDEN.has(v.toLowerCase()));
  if (invalid.length) {
    throw new Error(`TRUSTED_PROXIES no puede confiar en cualquier origen (${invalid.join(', ')}). Lista solo los proxies propios.`);
  }
  return list;
}
