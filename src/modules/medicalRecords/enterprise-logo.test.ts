import { afterEach, describe, expect, it, vi } from 'vitest';
import { logoBytes } from '../_shared/export/logo-fixture';
import { MAX_LOGO_BYTES, fetchEnterpriseLogo } from './enterprise-logo';

const jpeg = logoBytes;
const reply = (body: Uint8Array, ok = true) => ({ ok, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) });

afterEach(() => vi.unstubAllGlobals());

describe('logo de l\'établissement', () => {
  it('lit le logo à l\'adresse publique de CERO ID, sans envoyer de cookie', async () => {
    const f = vi.fn(async () => reply(jpeg()));
    vi.stubGlobal('fetch', f);
    const logo = await fetchEnterpriseLogo(7, 'https://id.test/');
    expect(logo).toMatchObject({ width: 60, height: 30, components: 3 });
    expect(logo?.bytes.length).toBe(jpeg().length);
    expect(f).toHaveBeenCalledTimes(1);
    const call = f.mock.calls[0] as unknown as [string, { credentials: string }];
    expect(call[0]).toBe('https://id.test/api/v1/enterprise-logos/7');
    expect(call[1].credentials).toBe('omit');
  });
  it('accepte un identifiant numérique écrit en texte', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(jpeg())));
    expect(await fetchEnterpriseLogo('12', 'https://id.test')).toMatchObject({ width: 60 });
  });
  it('ne demande rien sans établissement ou sans adresse de CERO ID', async () => {
    const f = vi.fn(async () => reply(jpeg()));
    vi.stubGlobal('fetch', f);
    expect(await fetchEnterpriseLogo(null, 'https://id.test')).toBeNull();
    expect(await fetchEnterpriseLogo(0, 'https://id.test')).toBeNull();
    expect(await fetchEnterpriseLogo('../x', 'https://id.test')).toBeNull();
    expect(await fetchEnterpriseLogo(undefined, 'https://id.test')).toBeNull();
    expect(await fetchEnterpriseLogo(7, null)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('rend « pas de logo » sans jamais bloquer : absent, serveur en panne, vide, trop lourd, pas un JPEG', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(new Uint8Array(), false)));
    expect(await fetchEnterpriseLogo(7, 'https://id.test')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau'); }));
    expect(await fetchEnterpriseLogo(7, 'https://id.test')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => reply(new Uint8Array())));
    expect(await fetchEnterpriseLogo(7, 'https://id.test')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => reply(new Uint8Array(MAX_LOGO_BYTES + 1))));
    expect(await fetchEnterpriseLogo(7, 'https://id.test')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => reply(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))));
    expect(await fetchEnterpriseLogo(7, 'https://id.test')).toBeNull();
  });
});
