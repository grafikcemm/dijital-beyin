// Kasa yolları, güvenli yol birleştirme, atomik yazma ve kilit.
import { createHash, randomBytes } from 'node:crypto';
import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync,
  renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const KASA_ISARETI = '.beyin/kurulum.json';

export function kokBul(baslangic) {
  if (typeof baslangic !== 'string' || !baslangic) return null;
  let current = resolve(baslangic);
  for (;;) {
    if (existsSync(join(current, '.beyin', 'kurulum.json'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function yollar(kok) {
  const beyinDir = join(kok, '.beyin');
  const durum = join(beyinDir, 'durum');
  return {
    sistem: join(kok, 'sistem'),
    beynim: join(kok, 'beynim'),
    notlar: join(kok, 'notlar'),
    gunluk: join(kok, 'gunluk'),
    gelenKutusu: join(kok, 'gelen-kutusu'),
    beyinDir,
    kurulum: join(beyinDir, 'kurulum.json'),
    tercihler: join(beyinDir, 'tercihler.json'),
    durum,
    yedek: join(beyinDir, 'yedek'),
    yerelDegisiklikler: join(beyinDir, 'yerel-degisiklikler'),
    hataLog: join(durum, 'hatalar.log'),
  };
}

function relParcalari(rel) {
  if (typeof rel !== 'string' || !rel || rel.length > 400) return null;
  if (rel.includes('\\') || rel.includes('\0') || rel.startsWith('/') || /^[A-Za-z]:/u.test(rel)) return null;
  const parts = rel.split('/');
  if (parts.some(part => part === '' || part === '.' || part === '..')) return null;
  return parts;
}

export function yonetilenYolMu(rel) {
  const parts = relParcalari(rel);
  if (!parts) return false;
  if (parts.length === 1) return parts[0] === 'beyin.mjs';
  return parts[0] === 'sistem';
}

export function guvenliYol(kok, rel) {
  const parts = relParcalari(rel);
  if (!parts) throw new Error('yol_reddedildi');
  const target = resolve(kok, ...parts);
  const fark = relative(resolve(kok), target);
  if (!fark || fark.startsWith('..') || isAbsolute(fark) || fark.split(sep).includes('..')) {
    throw new Error('yol_reddedildi');
  }
  return target;
}

// Windows'ta virüs tarayıcı, OneDrive ya da dizin izleyici hedefi kısa süre açık
// tutabilir; rename o an EPERM/EBUSY/EACCES verir. Birkaç kez kısa bekleyip dener.
const GECICI_HATALAR = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_BEKLEME_MS = [15, 40, 80, 150, 300];

function uyu(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function israrliRename(kaynak, hedef) {
  for (let deneme = 0; ; deneme += 1) {
    try {
      renameSync(kaynak, hedef);
      return;
    } catch (error) {
      if (!GECICI_HATALAR.has(error?.code) || deneme >= RENAME_BEKLEME_MS.length) throw error;
      uyu(RENAME_BEKLEME_MS[deneme]);
    }
  }
}

export function atomikYaz(dosya, icerik) {
  mkdirSync(dirname(dosya), { recursive: true });
  const tmp = `${dosya}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    writeFileSync(tmp, icerik);
    israrliRename(tmp, dosya);
  } catch (error) {
    try { unlinkSync(tmp); } catch { /* geçici dosya zaten yok */ }
    throw error;
  }
}

export function jsonOku(dosya, varsayilan) {
  try {
    return JSON.parse(readFileSync(dosya, 'utf8').replace(/^\u{FEFF}/u, ''));
  } catch {
    return varsayilan;
  }
}

export function sha256(veri) {
  return createHash('sha256').update(veri).digest('hex');
}

export function yerelTarih(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function kilitAl(kok, ad, { bayatMs = 600_000 } = {}) {
  if (!/^[a-z0-9-]+$/u.test(ad)) throw new Error('kilit_adi');
  const { durum } = yollar(kok);
  mkdirSync(durum, { recursive: true });
  const dosya = join(durum, `${ad}.kilit`);
  const dene = () => {
    const fd = openSync(dosya, 'wx');
    writeFileSync(fd, JSON.stringify({ pid: process.pid, zaman: new Date().toISOString() }));
    closeSync(fd);
  };
  try {
    dene();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let yas = 0;
    try { yas = Date.now() - statSync(dosya).mtimeMs; } catch { yas = Infinity; }
    if (yas < bayatMs) throw new Error('kilit_mesgul');
    try { unlinkSync(dosya); } catch { /* başka süreç devraldı */ }
    try { dene(); } catch { throw new Error('kilit_mesgul'); }
  }
  let birakildi = false;
  return () => {
    if (birakildi) return;
    birakildi = true;
    try { unlinkSync(dosya); } catch { /* zaten silinmiş */ }
  };
}

export function hataKaydet(kok, baglam, hata) {
  try {
    const { durum, hataLog } = yollar(kok);
    mkdirSync(durum, { recursive: true });
    const satir = JSON.stringify({
      zaman: new Date().toISOString(),
      baglam: String(baglam).slice(0, 80),
      hata: String(hata?.message ?? hata).slice(0, 300),
    });
    appendFileSync(hataLog, `${satir}\n`);
  } catch { /* hata günlüğü yazılamazsa da kanca bloklamaz */ }
}
