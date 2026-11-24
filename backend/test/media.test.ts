import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectImage } from '../src/modules/content/image';

describe('detección de imágenes', () => {
  it('reconoce PNG', () => assert.equal(detectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png'));
  it('reconoce JPEG', () => assert.equal(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg'));
  it('reconoce WebP', () => assert.equal(detectImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 'image/webp'));
  it('rechaza SVG', () => assert.equal(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null));
  it('rechaza HTML', () => assert.equal(detectImage(Buffer.from('<html><script>alert(1)</script>')), null));
  it('rechaza RIFF que no es WebP', () => assert.equal(detectImage(Buffer.from('RIFF\0\0\0\0WAVEfmt ', 'latin1')), null));
  it('rechaza archivo vacío', () => assert.equal(detectImage(Buffer.alloc(0)), null));
});
