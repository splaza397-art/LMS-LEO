// Defecto S1: la IP del cliente solo puede venir de X-Forwarded-For si la conexión llega de un proxy propio.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTrustedProxies } from '../src/security/trusted-proxies';

// Misma resolución que hace Express para req.ip (express usa proxy-addr internamente).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const proxyaddr = require('proxy-addr') as {
  (req: object, trust: (addr: string, i: number) => boolean): string;
  compile(list: string[]): (addr: string, i: number) => boolean;
};

const ipOf = (socket: string, xff: string | undefined, trusted: string[]) =>
  proxyaddr({ connection: { remoteAddress: socket }, socket: { remoteAddress: socket }, headers: xff ? { 'x-forwarded-for': xff } : {} },
    proxyaddr.compile(trusted));

describe('configuración de proxies de confianza', () => {
  it('por omisión confía solo en loopback', () => {
    assert.deepEqual(parseTrustedProxies(undefined), ['loopback']);
    assert.deepEqual(parseTrustedProxies(' '), ['loopback']);
  });

  it('acepta una lista explícita de direcciones y subredes', () => {
    assert.deepEqual(parseTrustedProxies('loopback, 10.20.0.0/24'), ['loopback', '10.20.0.0/24']);
  });

  it('rechaza confiar en cualquier origen', () => {
    for (const value of ['true', '*', '0.0.0.0/0', '::/0', 'loopback,true']) {
      assert.throws(() => parseTrustedProxies(value), /no puede confiar en cualquier origen/, value);
    }
  });
});

describe('IP del cliente según el origen de la conexión', () => {
  const dev = parseTrustedProxies('loopback');
  const prod = parseTrustedProxies('10.20.0.0/24');

  it('una conexión directa no confiable ignora el X-Forwarded-For manipulado', () => {
    assert.equal(ipOf('203.0.113.9', '1.2.3.4', dev), '203.0.113.9');
    assert.equal(ipOf('203.0.113.9', '1.2.3.4', prod), '203.0.113.9');
  });

  it('el portal en la misma máquina (DEV) puede indicar la IP del visitante', () => {
    assert.equal(ipOf('127.0.0.1', '198.51.100.7', dev), '198.51.100.7');
    assert.equal(ipOf('::1', '198.51.100.7', dev), '198.51.100.7');
  });

  it('detrás de Nginx se toma la dirección que agregó Nginx, no las que inventó el cliente', () => {
    // Nginx con $proxy_add_x_forwarded_for agrega la IP real al final de lo que mandó el cliente.
    assert.equal(ipOf('10.20.0.5', '6.6.6.6, 198.51.100.7', prod), '198.51.100.7');
    // Cadena Nginx -> portal -> backend: ambos saltos son de confianza.
    assert.equal(ipOf('10.20.0.6', '6.6.6.6, 198.51.100.7, 10.20.0.5', prod), '198.51.100.7');
  });

  it('sin encabezado se usa la dirección de la conexión', () => {
    assert.equal(ipOf('10.20.0.5', undefined, prod), '10.20.0.5');
  });
});
