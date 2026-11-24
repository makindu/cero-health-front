import { describe, expect, it } from 'vitest';
import { readJpeg } from './jpeg';
import { LOGO_B64 } from './logo-fixture';

const bytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const COLOR = LOGO_B64;
const GRAY = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/wAALCAAKABQBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/AIaKKKKK/9k=';

describe('lecture d\'un JPEG', () => {
  it('lit les dimensions et la couleur', () => {
    expect(readJpeg(bytes(COLOR))).toEqual({ width: 60, height: 30, components: 3 });
  });
  it('reconnaît un JPEG en niveaux de gris', () => {
    expect(readJpeg(bytes(GRAY))).toEqual({ width: 20, height: 10, components: 1 });
  });
  it('refuse ce qui n\'est pas un JPEG ou qui est tronqué', () => {
    expect(readJpeg(new Uint8Array([]))).toBeNull();
    expect(readJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBeNull();
    expect(readJpeg(bytes(COLOR).subarray(0, 40))).toBeNull();
    expect(readJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });
  it('refuse les JPEG que le PDF ne sait pas afficher tels quels (CMJN, 12 bits)', () => {
    const sof = (b: Uint8Array): number => { for (let i = 2; i < b.length - 1; i += 1) if (b[i] === 0xff && b[i + 1] === 0xc0) return i; return -1; };
    const cmyk = bytes(COLOR); cmyk[sof(cmyk) + 9] = 4;
    const deep = bytes(COLOR); deep[sof(deep) + 4] = 12;
    expect(readJpeg(cmyk)).toBeNull();
    expect(readJpeg(deep)).toBeNull();
  });
  it('refuse des dimensions nulles', () => {
    const b = bytes(COLOR);
    for (let i = 2; i < b.length - 1; i += 1) if (b[i] === 0xff && b[i + 1] === 0xc0) { b[i + 7] = 0; b[i + 8] = 0; break; }
    expect(readJpeg(b)).toBeNull();
  });
});
