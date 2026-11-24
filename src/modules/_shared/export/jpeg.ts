/** Lecture minimale d'un JPEG : dimensions et nombre de composantes (1 = gris, 3 = couleur). Rien d'autre n'est décodé. */
export interface JpegInfo { width: number; height: number; components: 1 | 3 }

export function readJpeg(b: Uint8Array): JpegInfo | null {
  const at = (i: number): number => b[i] ?? 0;
  if (b.length < 4 || at(0) !== 0xff || at(1) !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (at(i) !== 0xff) return null;
    const marker = at(i + 1);
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // fin de l'image avant d'avoir trouvé les dimensions
    const len = (at(i + 2) << 8) | at(i + 3);
    if (len < 2) return null;
    // Marqueurs « Start Of Frame » (hors tables de Huffman, extensions et arithmétique non utilisées ici).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 10 > b.length) return null;
      const height = (at(i + 5) << 8) | at(i + 6);
      const width = (at(i + 7) << 8) | at(i + 8);
      const components = at(i + 9);
      if (at(i + 4) !== 8 || width < 1 || height < 1 || (components !== 1 && components !== 3)) return null;
      return { width, height, components };
    }
    i += 2 + len;
  }
  return null;
}
