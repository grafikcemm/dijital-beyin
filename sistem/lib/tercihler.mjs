// Kullanıcı tercihleri: .beyin/tercihler.json kullanıcıya aittir, güncelleme dokunmaz.
import { atomikYaz, jsonOku, yollar } from './yol.mjs';

export const VARSAYILAN_TERCIHLER = Object.freeze({
  baglam_karakter: 6000,
  yakalama: true,
  guncelleme_bildirimi: true,
  bayat_gun: Object.freeze({ guncel_durum: 30, aktif_projem: 30, ben_kimim: 180 }),
  koruma: true,
});

const SINIRLAR = { baglam_karakter: [1000, 9500] };

function kopya(value) {
  return JSON.parse(JSON.stringify(value));
}

function birlestir(varsayilan, kullanici) {
  const out = kopya(varsayilan);
  if (!kullanici || typeof kullanici !== 'object' || Array.isArray(kullanici)) return out;
  for (const [key, base] of Object.entries(varsayilan)) {
    const value = kullanici[key];
    if (value === undefined) continue;
    if (base && typeof base === 'object') {
      out[key] = birlestir(base, value);
    } else if (typeof value === typeof base) {
      if (typeof value === 'number') {
        const [min, max] = SINIRLAR[key] ?? [0, 3650];
        if (Number.isFinite(value) && value >= min && value <= max) out[key] = value;
      } else {
        out[key] = value;
      }
    }
  }
  return out;
}

export function tercihleriOku(kok) {
  return birlestir(VARSAYILAN_TERCIHLER, jsonOku(yollar(kok).tercihler, {}));
}

export function tercihYaz(kok, anahtar, deger) {
  const path = String(anahtar ?? '').split('.');
  let base = VARSAYILAN_TERCIHLER;
  for (const part of path) {
    if (!base || typeof base !== 'object' || !Object.hasOwn(base, part)) throw new Error('tercih_bilinmiyor');
    base = base[part];
  }
  if (base && typeof base === 'object') throw new Error('tercih_bilinmiyor');
  let value = deger;
  if (typeof base === 'boolean') {
    if (deger === 'acik' || deger === 'true' || deger === true) value = true;
    else if (deger === 'kapali' || deger === 'false' || deger === false) value = false;
    else throw new Error('tercih_degeri');
  } else if (typeof base === 'number') {
    value = Number(deger);
    const [min, max] = SINIRLAR[path.at(-1)] ?? [0, 3650];
    if (!Number.isInteger(value) || value < min || value > max) throw new Error('tercih_degeri');
  }
  const dosya = yollar(kok).tercihler;
  const current = jsonOku(dosya, {});
  const root = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  let node = root;
  for (const part of path.slice(0, -1)) {
    if (!node[part] || typeof node[part] !== 'object') node[part] = {};
    node = node[part];
  }
  node[path.at(-1)] = value;
  atomikYaz(dosya, `${JSON.stringify(root, null, 2)}\n`);
  return tercihleriOku(kok);
}
