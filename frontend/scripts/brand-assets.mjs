// Genera los recursos de marca a partir del logotipo oficial (documentation/marca).
// Uso: node scripts/brand-assets.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, '../documentation/marca/logo-iinicia-blanco-original.png');
const out = (p) => resolve(root, p);
mkdirSync(out('public/brand'), { recursive: true });

const NAVY = { r: 23, g: 37, b: 84, alpha: 1 }; // #172554, color de la barra del portal y de Moodle
const INK = [11, 18, 32]; // #0B1220, para fondos claros

// Franjas del logotipo original (1563 px): simbolo, "²INICIA" y nombre en dos lineas.
const SYMBOL = { top: 56, height: 786 };
const WORDMARK = { top: 852, height: 386 };

const base = () => sharp(source).ensureAlpha();
// sharp aplica trim antes que extract en una misma cadena: se separan en dos pasos.
const band = async ({ top, height }) => sharp(await base().extract({ left: 0, top, width: 1563, height }).png().toBuffer()).trim();

/** Convierte a tinta oscura los trazos blancos y conserva el azul de la marca. */
async function toDark(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) [data[i], data[i + 1], data[i + 2]] = INK;
  }
  return sharp(data, { raw: info }).png();
}

const full = await base().trim().resize({ width: 640 }).png().toBuffer();
await sharp(full).toFile(out('public/brand/logo-blanco.png'));
await (await toDark(full)).toFile(out('public/brand/logo-oscuro.png'));

const symbol = await (await band(SYMBOL)).resize({ height: 256 }).png().toBuffer();
await sharp(symbol).toFile(out('public/brand/isotipo.png'));
// Version compacta para barras: simbolo y "²INICIA" sin el nombre en dos lineas (el "²" vive junto al simbolo).
const compact = { top: SYMBOL.top, height: WORDMARK.top + WORDMARK.height - SYMBOL.top };
await (await band(compact)).resize({ height: 160 }).png().toFile(out('public/brand/logo-compacto-blanco.png'));

/** Icono cuadrado: isotipo sobre azul institucional, legible en pestanas claras y oscuras. */
async function icon(size, file, padding = 0.16) {
  const inner = Math.round(size * (1 - padding * 2));
  const glyph = await sharp(symbol).resize({ width: inner, height: inner, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: glyph, gravity: 'center' }]).png().toFile(file);
}
await icon(512, out('src/app/icon.png'));
await icon(180, out('src/app/apple-icon.png'), 0.12);
console.log('Recursos de marca generados en public/brand y src/app');

// --- Android: icono adaptativo (isotipo sobre azul) y logotipo para la pantalla de acceso.
const res = (p) => resolve(root, '../android/app/src/main/res', p);
mkdirSync(res('drawable-nodpi'), { recursive: true });
// Primer plano adaptativo de 432 px: el contenido visible debe caber en el circulo central de 264 px.
const foreground = await sharp(symbol).resize({ width: 264, height: 264, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
await sharp({ create: { width: 432, height: 432, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: foreground, gravity: 'center' }]).png().toFile(res('drawable-nodpi/ic_launcher_foreground.png'));
// Sin PNG por densidad: con minSdk 26 Android siempre usa el ícono adaptativo (mipmap-anydpi/ic_launcher.xml).
await sharp(full).resize({ width: 480 }).png().toFile(res('drawable-nodpi/logo_iinicia.png'));
console.log('Recursos de marca de Android generados');
