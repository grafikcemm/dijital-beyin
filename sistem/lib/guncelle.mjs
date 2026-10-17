// Sürüm denetimi, paket doğrulama, güncelleme uygulama ve geri alma.
// Kural: hiçbir şey sha256 doğrulanmadan ayrıştırılmaz ya da yazılmaz; yalnız
// yönetilen yollar (sistem/**, beyin.mjs) ve .beyin/ durumu değiştirilir.
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync,
  rmdirSync, statSync, unlinkSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  atomikYaz, guvenliYol, jsonOku, kilitAl, sha256, yollar, yonetilenYolMu,
} from './yol.mjs';
import { tercihleriOku } from './tercihler.mjs';

export const PAKET_SEMA = 'dijital-beyin.paket/v1';
export const PAKET_SINIR_BAYT = 10 * 1024 * 1024;
const YEDEK_SAYISI = 3;
const KONTROL_ARALIGI_MS = 20 * 60 * 60 * 1000;
const API_ZAMAN_ASIMI_MS = 10_000;
const INDIRME_ZAMAN_ASIMI_MS = 60_000;
const DOGRULA_ZAMAN_ASIMI_MS = 30_000;
const ZORUNLU_DOSYALAR = ['sistem/cli.mjs', 'sistem/surum.json', 'beyin.mjs'];
// Yarım kalan güncellemenin işareti. beyin.mjs her açılışta buna bakar (biçim sabit kalmalı).
export const GUNCELLEME_ISARETI = 'guncelleme-suruyor.json';
const ISARET_SEMA = 'dijital-beyin.guncelleme-suruyor/v1';
const YEDEK_ADI = /^[0-9A-Za-z][0-9A-Za-z._-]{0,99}$/u;
// Güncellemenin bozamayacağı, kullanıcının durumuna bağlı doktor kontrolleri. Bunlardaki
// "hata" güncellemeyi geri aldırmaz; bilinmeyen (yeni) kontrol adları ise kapıda kalır.
const KULLANICI_DURUMU_KONTROLLERI = new Set([
  'kasa_duzeni', 'yonetilen_blok', 'bayat_not', 'son_yakalama', 'guncelleme', 'kilit', 'hata_gunlugu',
]);
const REPO_DESENI = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/u;
const SURUM_DESENI = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const WINDOWS_AYRILMIS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/iu;
const YASAK_KARAKTER = /[<>:"|?*\u0000-\u001f]/u;

// ---------------------------------------------------------------- sürüm

function surumAyir(surum) {
  const eslesme = typeof surum === 'string' ? SURUM_DESENI.exec(surum) : null;
  if (!eslesme) throw new Error('surum_gecersiz');
  return {
    ana: [Number(eslesme[1]), Number(eslesme[2]), Number(eslesme[3])],
    on: eslesme[4] ? eslesme[4].split('.') : [],
  };
}

export function surumKarsilastir(a, b) {
  const x = surumAyir(a);
  const y = surumAyir(b);
  for (let i = 0; i < 3; i += 1) {
    if (x.ana[i] !== y.ana[i]) return x.ana[i] < y.ana[i] ? -1 : 1;
  }
  if (!x.on.length && !y.on.length) return 0;
  if (!x.on.length) return 1;
  if (!y.on.length) return -1;
  const n = Math.max(x.on.length, y.on.length);
  for (let i = 0; i < n; i += 1) {
    const p = x.on[i];
    const q = y.on[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pSayi = /^\d+$/u.test(p);
    const qSayi = /^\d+$/u.test(q);
    if (pSayi && qSayi) return Number(p) < Number(q) ? -1 : 1;
    if (pSayi) return -1;
    if (qSayi) return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

// ---------------------------------------------------------------- ağ

function hata(kod, cause) {
  return cause === undefined ? new Error(kod) : new Error(kod, { cause });
}

function httpsMi(url) {
  return typeof url === 'string' && url.startsWith('https://');
}

export async function sonSurumuBul({ repo, fetchFn = fetch } = {}) {
  if (typeof repo !== 'string' || !REPO_DESENI.test(repo)) throw hata('repo_gecersiz');
  let yanit;
  try {
    yanit = await fetchFn(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'dijital-beyin',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(API_ZAMAN_ASIMI_MS),
    });
  } catch (error) {
    throw hata('ag_hatasi', error);
  }
  if (yanit.status === 403 || yanit.status === 429) throw hata('github_sinir');
  if (yanit.status === 404) throw hata('paket_bulunamadi');
  if (!yanit.ok) throw hata('github_hata');
  let veri;
  try {
    veri = await yanit.json();
  } catch (error) {
    throw hata('github_hata', error);
  }
  const etiket = typeof veri?.tag_name === 'string' ? veri.tag_name : '';
  const surum = etiket.replace(/^v/u, '');
  surumAyir(surum);
  const varliklar = Array.isArray(veri?.assets) ? veri.assets : [];
  const bul = ad => varliklar.find(varlik => varlik && varlik.name === ad);
  const paket = bul(`beyin-paket-${surum}.json`);
  const sha = bul(`beyin-paket-${surum}.json.sha256`);
  if (!paket || !sha) throw hata('paket_bulunamadi');
  if (!httpsMi(paket.browser_download_url) || !httpsMi(sha.browser_download_url)) {
    throw hata('https_gerekli');
  }
  return { surum, paketUrl: paket.browser_download_url, shaUrl: sha.browser_download_url };
}

async function indir(url, fetchFn, sinir = PAKET_SINIR_BAYT) {
  if (!httpsMi(url)) throw hata('https_gerekli');
  let yanit;
  try {
    yanit = await fetchFn(url, {
      headers: { 'User-Agent': 'dijital-beyin' },
      redirect: 'follow',
      signal: AbortSignal.timeout(INDIRME_ZAMAN_ASIMI_MS),
    });
  } catch (error) {
    throw hata('ag_hatasi', error);
  }
  if (yanit.status === 403 || yanit.status === 429) throw hata('github_sinir');
  if (!yanit.ok) throw hata('indirme_basarisiz');
  if (typeof yanit.url === 'string' && yanit.url && !httpsMi(yanit.url)) throw hata('https_gerekli');
  const uzunluk = Number(yanit.headers?.get?.('content-length'));
  if (Number.isFinite(uzunluk) && uzunluk > sinir) throw hata('paket_cok_buyuk');
  if (yanit.body && typeof yanit.body.getReader === 'function') {
    const okuyucu = yanit.body.getReader();
    const parcalar = [];
    let toplam = 0;
    for (;;) {
      const { done, value } = await okuyucu.read();
      if (done) break;
      toplam += value.byteLength;
      if (toplam > sinir) {
        try { await okuyucu.cancel(); } catch { /* akış zaten kapalı */ }
        throw hata('paket_cok_buyuk');
      }
      parcalar.push(Buffer.from(value));
    }
    return Buffer.concat(parcalar);
  }
  const tampon = Buffer.from(await yanit.arrayBuffer());
  if (tampon.length > sinir) throw hata('paket_cok_buyuk');
  return tampon;
}

export function shaMetniniAyir(metin) {
  const satir = String(metin ?? '').trim().split(/\r?\n/u)[0] ?? '';
  const parca = satir.trim().split(/\s+/u)[0] ?? '';
  if (!/^[0-9a-fA-F]{64}$/u.test(parca)) throw hata('sha_dosyasi_gecersiz');
  return parca.toLowerCase();
}

// ---------------------------------------------------------------- doğrulama

function yalnizAnahtarlar(nesne, anahtarlar) {
  if (!nesne || typeof nesne !== 'object' || Array.isArray(nesne)) return false;
  const var_ = Object.keys(nesne).sort();
  const ist = [...anahtarlar].sort();
  return var_.length === ist.length && var_.every((anahtar, i) => anahtar === ist[i]);
}

function guvenliParcalarMi(yol) {
  return yol.split('/').every(parca => !YASAK_KARAKTER.test(parca)
    && !/[. ]$/u.test(parca)
    && !WINDOWS_AYRILMIS.test(parca));
}

// Düz döngü: büyük (10 MB'a kadar) içerikte düzenli ifade yığını taşırmaz.
function b64GecerliMi(metin) {
  const n = metin.length;
  if (n % 4 !== 0) return false;
  for (let i = 0; i < n; i += 1) {
    const c = metin.charCodeAt(i);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47) continue;
    // '=' yalnız sonda, en fazla iki tane.
    if (c === 61 && i >= n - 2 && metin.charCodeAt(n - 1) === 61) continue;
    return false;
  }
  return true;
}

function minNodeAna(deger) {
  if (Number.isInteger(deger) && deger > 0) return deger;
  if (typeof deger === 'string' && /^\d+(\.\d+){0,2}$/u.test(deger)) return Number(deger.split('.')[0]);
  throw hata('sema_gecersiz');
}

export function paketiDogrula(buffer, beklenenSha) {
  if (!Buffer.isBuffer(buffer)) throw hata('sema_gecersiz');
  if (buffer.length > PAKET_SINIR_BAYT) throw hata('paket_cok_buyuk');
  const beklenen = String(beklenenSha ?? '').trim().toLowerCase();
  if (!HEX64.test(beklenen)) throw hata('sha_gecersiz');
  if (sha256(buffer) !== beklenen) throw hata('sha_uyusmuyor');
  let paket;
  try {
    paket = JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw hata('sema_gecersiz', error);
  }
  if (!yalnizAnahtarlar(paket, ['sema', 'surum', 'olusturuldu', 'min_node', 'dosyalar'])) throw hata('sema_gecersiz');
  if (paket.sema !== PAKET_SEMA) throw hata('sema_gecersiz');
  if (typeof paket.surum !== 'string' || !SURUM_DESENI.test(paket.surum)) throw hata('sema_gecersiz');
  if (typeof paket.olusturuldu !== 'string' || Number.isNaN(Date.parse(paket.olusturuldu))) throw hata('sema_gecersiz');
  const minAna = minNodeAna(paket.min_node);
  if (!Array.isArray(paket.dosyalar) || paket.dosyalar.length === 0) throw hata('sema_gecersiz');

  const gorulen = new Set();
  let toplam = 0;
  const icerikler = new Map();
  for (const dosya of paket.dosyalar) {
    if (!yalnizAnahtarlar(dosya, ['yol', 'sha256', 'icerik_b64'])) throw hata('sema_gecersiz');
    if (typeof dosya.yol !== 'string' || typeof dosya.sha256 !== 'string' || typeof dosya.icerik_b64 !== 'string') {
      throw hata('sema_gecersiz');
    }
    if (!yonetilenYolMu(dosya.yol) || !guvenliParcalarMi(dosya.yol)) throw hata('yol_reddedildi');
    const anahtar = dosya.yol.toLowerCase();
    if (gorulen.has(anahtar)) throw hata('yol_tekrar');
    gorulen.add(anahtar);
    if (!HEX64.test(dosya.sha256)) throw hata('sema_gecersiz');
    if (!b64GecerliMi(dosya.icerik_b64)) throw hata('sema_gecersiz');
    const icerik = Buffer.from(dosya.icerik_b64, 'base64');
    // Kanonik olmayan dolgu bitleri de reddedilir: çözülen içerik aynı metne dönmeli.
    if (icerik.toString('base64') !== dosya.icerik_b64) throw hata('sema_gecersiz');
    toplam += icerik.length;
    if (toplam > PAKET_SINIR_BAYT) throw hata('paket_cok_buyuk');
    if (sha256(icerik) !== dosya.sha256) throw hata('icerik_sha_uyusmuyor');
    icerikler.set(dosya.yol, icerik);
  }
  // Bir yol hem dosya hem başka bir yolun klasörü olamaz.
  for (const anahtar of gorulen) {
    const parcalar = anahtar.split('/');
    for (let i = 1; i < parcalar.length; i += 1) {
      if (gorulen.has(parcalar.slice(0, i).join('/'))) throw hata('yol_reddedildi');
    }
  }
  for (const zorunlu of ZORUNLU_DOSYALAR) {
    if (!icerikler.has(zorunlu)) throw hata('zorunlu_dosya_eksik');
  }
  let surumDosyasi;
  try {
    surumDosyasi = JSON.parse(icerikler.get('sistem/surum.json').toString('utf8'));
  } catch (error) {
    throw hata('sema_gecersiz', error);
  }
  if (surumDosyasi?.surum !== paket.surum) throw hata('surum_uyusmuyor');
  const nodeAna = Number(process.versions.node.split('.')[0]);
  if (minAna > nodeAna) throw hata('node_surumu_eski');
  return paket;
}

// ---------------------------------------------------------------- uygulama

function zamanDamgasi(date) {
  const pad = (deger, n = 2) => String(deger).padStart(n, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function guvenliAd(deger) {
  return String(deger ?? 'bilinmiyor').replace(/[^0-9A-Za-z.-]/gu, '_').slice(0, 60) || 'bilinmiyor';
}

function benzersizDizin(ust, ad) {
  mkdirSync(ust, { recursive: true });
  for (let i = 1; i < 1000; i += 1) {
    const aday = join(ust, i === 1 ? ad : `${ad}-${i}`);
    try {
      mkdirSync(aday);
      return aday;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw hata('yedek_dizini_olusturulamadi');
}

function dosyaShaOku(dosya) {
  try {
    return sha256(readFileSync(dosya));
  } catch {
    return null;
  }
}

function manifestDosyalari(manifest) {
  const dosyalar = manifest?.dosyalar;
  if (!dosyalar || typeof dosyalar !== 'object' || Array.isArray(dosyalar)) return {};
  const out = {};
  for (const [rel, sha] of Object.entries(dosyalar)) {
    if (yonetilenYolMu(rel) && typeof sha === 'string') out[rel] = sha.toLowerCase();
  }
  return out;
}

function mevcutSurumOku(kok) {
  const veri = jsonOku(join(kok, 'sistem', 'surum.json'), null);
  return veri && typeof veri === 'object' ? veri : {};
}

function bosUstleriSil(kok, dosya) {
  const sistem = resolve(kok, 'sistem');
  let dizin = dirname(dosya);
  while (dizin.startsWith(sistem) && dizin !== sistem) {
    try { rmdirSync(dizin); } catch { return; }
    dizin = dirname(dizin);
  }
}

function yedekleriListele(kok) {
  const { yedek } = yollar(kok);
  let adlar = [];
  try {
    adlar = readdirSync(yedek, { withFileTypes: true }).filter(g => g.isDirectory()).map(g => g.name);
  } catch {
    return [];
  }
  // Sıra: yedek.json içindeki artan "sira" (saat geri gitse de doğru), sonra zaman damgası.
  return adlar
    .map(ad => {
      const eslesme = /-(\d{14})(?:-(\d+))?$/u.exec(ad);
      if (!eslesme) return null;
      const dizin = join(yedek, ad);
      const kayit = jsonOku(join(dizin, 'yedek.json'), null);
      if (!kayit || typeof kayit !== 'object') return null;
      const sira = Number.isInteger(kayit.sira) ? kayit.sira : 0;
      return { ad, dizin, sira, ts: eslesme[1], ek: Number(eslesme[2] ?? 1) };
    })
    .filter(Boolean)
    .sort((a, b) => (b.sira - a.sira) || (a.ts === b.ts ? b.ek - a.ek : (a.ts < b.ts ? 1 : -1)));
}

function yedekleriBudala(kok) {
  for (const kayit of yedekleriListele(kok).slice(YEDEK_SAYISI)) {
    try { rmSync(kayit.dizin, { recursive: true, force: true }); } catch { /* sonraki sefer */ }
  }
}

function yedekOlustur(kok, eskiSurum, yollarListesi, simdi) {
  const p = yollar(kok);
  const sira = yedekleriListele(kok).reduce((enBuyuk, kayit) => Math.max(enBuyuk, kayit.sira), 0) + 1;
  const dizin = benzersizDizin(p.yedek, `${guvenliAd(eskiSurum)}-${zamanDamgasi(simdi)}`);
  const dosyalar = [];
  const olmayanlar = [];
  for (const rel of yollarListesi) {
    const kaynak = guvenliYol(kok, rel);
    if (existsSync(kaynak) && statSync(kaynak).isFile()) {
      atomikYaz(guvenliYol(join(dizin, 'dosyalar'), rel), readFileSync(kaynak));
      dosyalar.push(rel);
    } else {
      olmayanlar.push(rel);
    }
  }
  const manifestVardi = existsSync(p.kurulum);
  if (manifestVardi) copyFileSync(p.kurulum, join(dizin, 'kurulum.json'));
  atomikYaz(join(dizin, 'yedek.json'), `${JSON.stringify({
    eskiSurum, sira, olusturuldu: simdi.toISOString(), dosyalar, olmayanlar, manifestVardi,
  }, null, 2)}\n`);
  return dizin;
}

function yedektenGeriYukle(kok, dizin) {
  const kayit = jsonOku(join(dizin, 'yedek.json'), null);
  if (!kayit || !Array.isArray(kayit.dosyalar) || !Array.isArray(kayit.olmayanlar)) throw hata('yedek_bozuk');
  const p = yollar(kok);
  for (const rel of kayit.dosyalar) {
    if (!yonetilenYolMu(rel)) continue;
    atomikYaz(guvenliYol(kok, rel), readFileSync(guvenliYol(join(dizin, 'dosyalar'), rel)));
  }
  for (const rel of kayit.olmayanlar) {
    if (!yonetilenYolMu(rel)) continue;
    const hedef = guvenliYol(kok, rel);
    try {
      unlinkSync(hedef);
      bosUstleriSil(kok, hedef);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const yedekManifest = join(dizin, 'kurulum.json');
  if (existsSync(yedekManifest)) atomikYaz(p.kurulum, readFileSync(yedekManifest));
  return kayit;
}

function yedekKaydiOku(dizin) {
  const kayit = jsonOku(join(dizin, 'yedek.json'), null);
  if (!kayit || !Array.isArray(kayit.dosyalar) || !Array.isArray(kayit.olmayanlar)) return null;
  return kayit;
}

// Geri almadan sonra çalışan `onar` manifesti yeniden hesaplar; yedekteki manifest bayt
// bayt geri konur ki yerelde değiştirilmiş dosya bilgisi kaybolmasın.
function manifestiGeriKoy(kok, dizin) {
  const yedekManifest = join(dizin, 'kurulum.json');
  if (existsSync(yedekManifest)) atomikYaz(yollar(kok).kurulum, readFileSync(yedekManifest));
}

// ---------------------------------------------------------------- yarım güncelleme işareti

function isaretYolu(kok) {
  return join(yollar(kok).durum, GUNCELLEME_ISARETI);
}

function isaretOku(kok) {
  const yol = isaretYolu(kok);
  if (!existsSync(yol)) return null;
  const veri = jsonOku(yol, null);
  return veri && typeof veri === 'object' && !Array.isArray(veri) ? veri : {};
}

function isaretYaz(kok, veri) {
  atomikYaz(isaretYolu(kok), `${JSON.stringify({ sema: ISARET_SEMA, ...veri }, null, 2)}\n`);
}

function isaretSil(kok) {
  try { unlinkSync(isaretYolu(kok)); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

function isaretYedekDizini(kok, isaret) {
  const ad = isaret?.yedek;
  if (typeof ad !== 'string' || !YEDEK_ADI.test(ad)) return null;
  return join(yollar(kok).yedek, ad);
}

// Kilit altında çağrılır: önceki çalışma yarıda öldüyse önce o güncellemenin yedeğini
// geri koyar, sonra işareti siler. Yedek yoksa yeni paket zaten her şeyi üzerine yazar.
function yarimKalaniKurtar(kok) {
  const isaret = isaretOku(kok);
  if (!isaret) return null;
  const dizin = isaretYedekDizini(kok, isaret);
  const kayit = dizin ? yedekKaydiOku(dizin) : null;
  if (kayit) {
    baglantilariDenetle(kok, [...kayit.dosyalar, ...kayit.olmayanlar]);
    try {
      yedektenGeriYukle(kok, dizin);
    } catch (error) {
      throw hata('geri_alma_basarisiz', error);
    }
    // Yarım güncellemenin yedeği artık diskle aynı; yarım "geri-al"ın yedeği ise kalır.
    if (isaret.islem !== 'geri-al') {
      try { rmSync(dizin, { recursive: true, force: true }); } catch { /* zararsız */ }
    }
  }
  isaretSil(kok);
  return { ...isaret, geriYuklendi: Boolean(kayit) };
}

// ---------------------------------------------------------------- bağlantı denetimi

// `sistem` ya da hedeflerin bir üst klasörü sembolik bağlantı/junction ise yazma ve silme
// kasa dışına taşabilir. Dize denetimi (guvenliYol) bunu göremez; burada diske bakılır.
function baglantilariDenetle(kok, relListesi) {
  const tamKok = resolve(kok);
  let gercekKok;
  try { gercekKok = realpathSync.native(tamKok); } catch { gercekKok = tamKok; }
  const icindeMi = yol => {
    const fark = relative(gercekKok, yol);
    return fark === '' || (!fark.startsWith('..') && !isAbsolute(fark));
  };
  const bakilan = new Map();
  const denetle = tam => {
    if (bakilan.has(tam)) return bakilan.get(tam);
    let bilgi;
    try {
      bilgi = lstatSync(tam);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') { bakilan.set(tam, false); return false; }
      throw error;
    }
    if (bilgi.isSymbolicLink()) throw hata('sistem_baglanti_reddedildi');
    let gercek;
    try { gercek = realpathSync.native(tam); } catch { throw hata('sistem_baglanti_reddedildi'); }
    if (!icindeMi(gercek)) throw hata('sistem_baglanti_reddedildi');
    bakilan.set(tam, true);
    return true;
  };
  denetle(join(tamKok, 'sistem'));
  for (const rel of relListesi) {
    if (!yonetilenYolMu(rel)) continue;
    const parcalar = rel.split('/');
    let yol = tamKok;
    for (let i = 0; i < parcalar.length - 1; i += 1) {
      yol = join(yol, parcalar[i]);
      if (!denetle(yol)) break;
    }
  }
}

function yerelDegisiklikleriSakla(kok, manifestHaritasi, simdi) {
  const degisenler = [];
  for (const [rel, beklenen] of Object.entries(manifestHaritasi)) {
    const mevcut = dosyaShaOku(guvenliYol(kok, rel));
    if (mevcut && mevcut !== beklenen) degisenler.push(rel);
  }
  if (!degisenler.length) return [];
  const dizin = benzersizDizin(yollar(kok).yerelDegisiklikler, zamanDamgasi(simdi));
  for (const rel of degisenler) {
    atomikYaz(guvenliYol(dizin, rel), readFileSync(guvenliYol(kok, rel)));
  }
  return degisenler;
}

// Yeni kod alt süreçte çalışır; bu süreçte yüklü eski modüllerle karışmaz.
function varsayilanOnar(kok, { istemciler } = {}) {
  return new Promise((resolvePromise, reject) => {
    const args = [join(kok, 'beyin.mjs'), 'onar'];
    if (Array.isArray(istemciler) && istemciler.length) args.push('--istemci', istemciler.join(','));
    const child = spawn(process.execPath, args, {
      cwd: kok,
      env: { ...process.env, BEYIN_IC_CAGRI: '1' },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      timeout: DOGRULA_ZAMAN_ASIMI_MS,
    });
    let hata = '';
    child.stderr.on('data', parca => { hata += parca; });
    child.on('error', reject);
    child.on('close', kod => (kod === 0 ? resolvePromise() : reject(new Error(`onar_basarisiz: ${hata.trim().slice(0, 200)}`))));
  });
}

// geriAl senkron kalır (sözleşme); geri yüklenen sürümün onar'ı alt süreçte çalışır.
function altSurecteOnarSync(kok) {
  const sonuc = spawnSync(process.execPath, [join(kok, 'beyin.mjs'), 'onar'], {
    cwd: kok,
    env: { ...process.env, BEYIN_IC_CAGRI: '1' },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
    timeout: DOGRULA_ZAMAN_ASIMI_MS,
    encoding: 'utf8',
  });
  if (sonuc.error) throw sonuc.error;
  if (sonuc.status !== 0) throw new Error(`onar_basarisiz: ${String(sonuc.stderr ?? '').trim().slice(0, 200)}`);
}

function nedenMetni(error) {
  if (error === undefined || error === null) return undefined;
  const kod = typeof error?.code === 'string' ? error.code : '';
  const mesaj = String(error?.message ?? error);
  return (kod && !mesaj.includes(kod) ? `${kod}: ${mesaj}` : mesaj).slice(0, 200);
}

function kontrolDurumu(sonuc, ad) {
  const liste = Array.isArray(sonuc?.kontroller) ? sonuc.kontroller.filter(k => k?.ad === ad) : [];
  if (!liste.length) return null;
  return liste.every(k => k.durum === 'tamam') ? 'tamam' : 'sorunlu';
}

// Güncelleme sonrası kapı. `sonuc`: doğrulama fonksiyonunun dönüşü (true/false ya da
// doktor JSON'u). Yalnız güncellemenin bozabileceği kontroller geri aldırır: kullanıcı
// durumu kontrollerindeki "hata" sayılmaz; "surum" tamam olmalı; "kanca_codex"
// güncellemeden önce tamamsa sonra da tamam olmalı. Tutarsız/okunamayan çıktı = başarısız.
export function dogrulamaDegerlendir(sonuc, onceki = null) {
  if (sonuc === true) return { gecti: true, basarisizlar: [] };
  if (!sonuc || typeof sonuc !== 'object' || typeof sonuc.saglikli !== 'boolean' || !Array.isArray(sonuc.kontroller)) {
    return { gecti: false, basarisizlar: [] };
  }
  const basarisizlar = new Set();
  let hataVar = false;
  for (const k of sonuc.kontroller) {
    if (!k || typeof k.ad !== 'string') continue;
    if (k.durum === 'hata') {
      hataVar = true;
      if (!KULLANICI_DURUMU_KONTROLLERI.has(k.ad)) basarisizlar.add(k.ad);
    }
    if (k.ad === 'surum' && k.durum !== 'tamam') basarisizlar.add('surum');
  }
  if (kontrolDurumu(onceki, 'kanca_codex') === 'tamam' && kontrolDurumu(sonuc, 'kanca_codex') === 'sorunlu') {
    basarisizlar.add('kanca_codex');
  }
  // "Sağlıksız" deyip hiçbir hata göstermeyen çıktıya güvenilmez.
  if (!sonuc.saglikli && !hataVar) return { gecti: false, basarisizlar: [...basarisizlar] };
  return { gecti: basarisizlar.size === 0, basarisizlar: [...basarisizlar] };
}

// Başlatıcı üzerinden `doktor --json`. Dönüş: ayrıştırılmış doktor sonucu ya da null.
// Doktor sağlıksızken 1 ile çıkar; bu yüzden 0 ve 1 kabul edilir, karar JSON'dan verilir.
export function altSurecteDoktor(kok, { zamanAsimiMs = DOGRULA_ZAMAN_ASIMI_MS } = {}) {
  return new Promise(resolvePromise => {
    let bitti = false;
    const sonuc = deger => {
      if (bitti) return;
      bitti = true;
      resolvePromise(deger);
    };
    // Başlatıcı (beyin.mjs) üzerinden çalıştırılır: sistem/cli.mjs yalnız `main` dışa
    // aktarır, doğrudan çalıştırılınca hiçbir şey yapmadan 0 ile çıkar. Çıkış kodu tek
    // başına yetmez; karar dogrulamaDegerlendir ile JSON'dan verilir.
    let cocuk;
    try {
      cocuk = spawn(process.execPath, [join(kok, 'beyin.mjs'), 'doktor', '--json'], {
        cwd: kok,
        env: { ...process.env, BEYIN_IC_CAGRI: '1' },
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        timeout: zamanAsimiMs,
      });
    } catch {
      sonuc(null);
      return;
    }
    const parcalar = [];
    let boyut = 0;
    cocuk.stdout.on('data', parca => {
      boyut += parca.length;
      if (boyut <= 1024 * 1024) parcalar.push(parca);
    });
    cocuk.on('error', () => sonuc(null));
    cocuk.on('close', kod => {
      if ((kod !== 0 && kod !== 1) || boyut > 1024 * 1024) { sonuc(null); return; }
      try {
        const veri = JSON.parse(Buffer.concat(parcalar).toString('utf8').trim());
        // Çıkış kodu ile JSON çelişirse güvenilmez.
        if (!veri || typeof veri !== 'object' || (kod === 0) !== (veri.saglikli === true)) { sonuc(null); return; }
        sonuc(veri);
      } catch {
        sonuc(null);
      }
    });
  });
}

// Yazma sırası: önce sistem/** (surum.json hariç), sonra surum.json, en son beyin.mjs.
// Yarıda kesilirse eski başlatıcı yerinde kalır ve işaretten kurtarmayı yapar.
function yazmaSirasi(dosyalar) {
  const sira = yol => (yol === 'beyin.mjs' ? 2 : yol === 'sistem/surum.json' ? 1 : 0);
  return [...dosyalar].sort((a, b) => (sira(a.yol) - sira(b.yol)) || (a.yol < b.yol ? -1 : a.yol > b.yol ? 1 : 0));
}

function ayrintiliHata(kod, cause, ayrinti) {
  const error = hata(kod, cause);
  const temiz = Object.fromEntries(Object.entries(ayrinti).filter(([, deger]) => deger !== undefined
    && !(Array.isArray(deger) && !deger.length)));
  if (Object.keys(temiz).length) error.ayrinti = temiz;
  return error;
}

// `adimFn(yol, sira)`: her dosya yazıldıktan sonra çağrılır (yalnız testler; kesinti benzetimi).
export async function paketiUygula(kok, paket, { simdi = new Date(), onarFn, dogrulaFn, adimFn } = {}) {
  const p = yollar(kok);
  const yeniYollar = paket.dosyalar.map(d => d.yol);
  for (const rel of yeniYollar) {
    if (!yonetilenYolMu(rel)) throw hata('yol_reddedildi');
  }
  baglantilariDenetle(kok, [...Object.keys(manifestDosyalari(jsonOku(p.kurulum, {}) ?? {})), ...yeniYollar]);
  const birak = kilitAl(kok, 'guncelle');
  try {
    // Önceki bir çalışma yarıda öldüyse temiz bir tabandan başla.
    yarimKalaniKurtar(kok);
    const eskiManifest = jsonOku(p.kurulum, {}) ?? {};
    const eskiHarita = manifestDosyalari(eskiManifest);
    const eskiSurum = typeof eskiManifest.surum === 'string' ? eskiManifest.surum : (mevcutSurumOku(kok).surum ?? 'bilinmiyor');
    const istemciler = Array.isArray(eskiManifest.istemciler) ? eskiManifest.istemciler : undefined;
    const tumYollar = [...new Set([...Object.keys(eskiHarita), ...yeniYollar])].sort();
    baglantilariDenetle(kok, tumYollar);
    const dogrula = dogrulaFn ?? altSurecteDoktor;
    // Yazmadan önce yüklenir: sonra içe aktarılsa diskteki yeni kurulum.mjs, bellekteki eski
    // yol.mjs ile karışırdı. Kurulu kurulum.mjs eksik/bozuksa (onarım için --zorla) engel değil.
    let manifestYaz = null;
    try { ({ manifestYaz } = await import('./kurulum.mjs')); } catch { manifestYaz = null; }

    // Kapı için taban: güncellemeden önce neler sağlamdı (alınamazsa engel değil).
    let onceki = null;
    try { onceki = await dogrula(kok); } catch { onceki = null; }

    // Önce yedek: ilk değişiklikten önce tam ve geri alınabilir olmalı.
    const yedekDizin = yedekOlustur(kok, eskiSurum, tumYollar, simdi);
    const yerelDegisiklikler = yerelDegisiklikleriSakla(kok, eskiHarita, simdi);
    isaretYaz(kok, {
      yedek: basename(yedekDizin), eskiSurum, yeniSurum: paket.surum, pid: process.pid, baslangic: simdi.toISOString(),
    });

    const geriAlVeFirlat = async (kod, cause, ayrinti = {}) => {
      try {
        yedektenGeriYukle(kok, yedekDizin);
      } catch (geriAlmaHatasi) {
        // Yedek ve işaret yerinde kalır: başlatıcı sonraki açılışta yeniden dener.
        throw ayrintiliHata('geri_alma_basarisiz', geriAlmaHatasi, { neden: nedenMetni(geriAlmaHatasi) });
      }
      // Güncellemenin onar'ı CLAUDE.md/AGENTS.md/.gitignore bloklarını ve kancaları yenilemiş
      // olabilir; geri yüklenen sürümün onar'ı onları eski hâline getirir. Hatası geri almayı bozmaz.
      let onarHatasi;
      try {
        await (onarFn ? onarFn(kok, { istemciler }) : varsayilanOnar(kok, { istemciler }));
      } catch (error) {
        onarHatasi = nedenMetni(error);
      }
      try { manifestiGeriKoy(kok, yedekDizin); } catch { /* yedektenGeriYukle zaten yazdı */ }
      isaretSil(kok);
      // Disk artık yedekle aynı; bu yedeği tutmak "geri-al"ı anlamsız kılar.
      try { rmSync(yedekDizin, { recursive: true, force: true }); } catch { /* zararsız */ }
      throw ayrintiliHata(kod, cause, { ...ayrinti, neden: nedenMetni(cause), onarHatasi });
    };

    try {
      // Büyük/küçük harf duyarsız: Windows ve macOS'ta X.mjs → x.mjs yeni dosyayı silmesin.
      const yeniSet = new Set(yeniYollar.map(rel => rel.toLowerCase()));
      const sirali = yazmaSirasi(paket.dosyalar);
      const sonlar = sirali.filter(d => d.yol === 'sistem/surum.json' || d.yol === 'beyin.mjs');
      let adim = 0;
      const yaz = dosya => {
        atomikYaz(guvenliYol(kok, dosya.yol), Buffer.from(dosya.icerik_b64, 'base64'));
        adim += 1;
        if (adimFn) adimFn(dosya.yol, adim);
      };
      for (const dosya of sirali) {
        if (!sonlar.includes(dosya)) yaz(dosya);
      }
      for (const rel of Object.keys(eskiHarita)) {
        if (yeniSet.has(rel.toLowerCase()) || !yonetilenYolMu(rel)) continue;
        const hedef = guvenliYol(kok, rel);
        try {
          unlinkSync(hedef);
          bosUstleriSil(kok, hedef);
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      for (const dosya of sonlar) yaz(dosya);
      await (onarFn ? onarFn(kok, { istemciler }) : varsayilanOnar(kok, { istemciler }));
      // Manifest tam olarak paketin gönderdiği yolları listeler (onar alt süreci listeyi bilmez).
      if (manifestYaz) {
        manifestYaz(kok, paket.surum, { simdi, istemciler, dosyalar: yeniYollar });
      } else {
        // Yedek yol: yeni yazılan kurulum.mjs taze bir adresle yüklenir. Olmazsa onar'ın
        // yazdığı manifest kalır; karar doktor kapısınındır.
        try {
          const taze = await import(`./kurulum.mjs?onarim=${Date.now()}`);
          taze.manifestYaz(kok, paket.surum, { simdi, istemciler, dosyalar: yeniYollar });
        } catch { /* onar manifesti zaten yazdı */ }
      }
    } catch (error) {
      await geriAlVeFirlat('uygulama_basarisiz_geri_alindi', error);
    }

    let sonuc = null;
    let dogrulamaHatasi;
    try {
      sonuc = await dogrula(kok);
    } catch (error) {
      dogrulamaHatasi = error;
    }
    const karar = dogrulamaDegerlendir(sonuc, onceki);
    if (!karar.gecti) {
      await geriAlVeFirlat('dogrulama_basarisiz_geri_alindi', dogrulamaHatasi, { kontroller: karar.basarisizlar });
    }

    isaretSil(kok);
    yedekleriBudala(kok);
    return { eskiSurum, yeniSurum: paket.surum, yedekDizin, yerelDegisiklikler };
  } finally {
    birak();
  }
}

// ---------------------------------------------------------------- komutlar

export async function guncelle(kok, { kontrol = false, paketDosyasi, shaDosyasi, zorla = false, fetchFn = fetch, simdi, onarFn, dogrulaFn } = {}) {
  const surumBilgisi = mevcutSurumOku(kok);
  const mevcutSurum = surumBilgisi.surum;
  let mevcutGecerli = true;
  try {
    surumAyir(mevcutSurum);
  } catch (error) {
    // Bozuk kurulum yalnız --zorla ile (ör. çevrimdışı paketle) onarılabilir.
    if (!zorla) throw error;
    mevcutGecerli = false;
  }

  let enSonSurum;
  let paketiGetir;
  if (paketDosyasi) {
    if (!shaDosyasi) throw hata('sha_dosyasi_gerekli');
    const paketYolu = resolve(paketDosyasi);
    if (statSync(paketYolu).size > PAKET_SINIR_BAYT) throw hata('paket_cok_buyuk');
    const paket = paketiDogrula(readFileSync(paketYolu), shaMetniniAyir(readFileSync(resolve(shaDosyasi), 'utf8')));
    enSonSurum = paket.surum;
    paketiGetir = async () => paket;
  } else {
    const bulunan = await sonSurumuBul({ repo: surumBilgisi.repo, fetchFn });
    enSonSurum = bulunan.surum;
    paketiGetir = async () => {
      const shaMetni = (await indir(bulunan.shaUrl, fetchFn, 4096)).toString('utf8');
      const beklenen = shaMetniniAyir(shaMetni);
      const tampon = await indir(bulunan.paketUrl, fetchFn);
      const paket = paketiDogrula(tampon, beklenen);
      if (paket.surum !== bulunan.surum) throw hata('surum_uyusmuyor');
      return paket;
    };
  }

  // Yarım kalmış güncelleme (işaret duruyor ya da kayıt ile sürüm dosyası ayrışmış) "güncel"
  // sayılmaz: aynı sürümün paketi yeniden uygulanarak onarılır (eski sürüme inilmez).
  const manifestSurum = jsonOku(yollar(kok).kurulum, null)?.surum;
  const onarim = mevcutGecerli && (existsSync(isaretYolu(kok)) || manifestSurum !== mevcutSurum);
  const fark = mevcutGecerli ? surumKarsilastir(enSonSurum, mevcutSurum) : 1;
  const yeniMi = fark > 0 || (onarim && fark === 0);
  const ek = onarim ? { onarim: true } : {};
  if (kontrol) return { durum: yeniMi ? 'mevcut' : 'guncel', mevcutSurum, enSonSurum, ...ek };
  if (!yeniMi && !zorla) return { durum: 'guncel', mevcutSurum, enSonSurum, ...ek };

  const paket = await paketiGetir();
  const sonuc = await paketiUygula(kok, paket, { simdi, onarFn, dogrulaFn });
  return {
    durum: 'guncellendi',
    eskiSurum: sonuc.eskiSurum,
    yeniSurum: sonuc.yeniSurum,
    yedekDizin: sonuc.yedekDizin,
    yerelDegisiklikler: sonuc.yerelDegisiklikler,
  };
}

// Geri yüklenen sürümün onar'ı (bloklar, kancalar) çalışır; manifest yedektekiyle aynı kalır.
// Onar hatası geri almayı bozmaz, `onarHatasi` olarak döner.
function geriAlmaSonrasiOnar(kok, dizin, onarFn) {
  let onarHatasi;
  try {
    if (onarFn) onarFn(kok, {});
    else altSurecteOnarSync(kok);
  } catch (error) {
    onarHatasi = nedenMetni(error);
  }
  if (dizin) {
    try { manifestiGeriKoy(kok, dizin); } catch { /* geri yükleme zaten yazdı */ }
  }
  return onarHatasi;
}

export function geriAl(kok, { simdi = new Date(), onarFn } = {}) {
  const birak = kilitAl(kok, 'guncelle');
  try {
    // Yarıda kalmış bir güncelleme varsa geri alınacak olan odur.
    const yarim = isaretOku(kok);
    if (yarim && isaretYedekDizini(kok, yarim) && yedekKaydiOku(isaretYedekDizini(kok, yarim))) {
      const dizin = isaretYedekDizini(kok, yarim);
      const kayit = yedekKaydiOku(dizin);
      baglantilariDenetle(kok, [...kayit.dosyalar, ...kayit.olmayanlar]);
      try { yedektenGeriYukle(kok, dizin); } catch (error) { throw hata('geri_alma_basarisiz', error); }
      const onarHatasi = geriAlmaSonrasiOnar(kok, dizin, onarFn);
      isaretSil(kok);
      if (yarim.islem !== 'geri-al') {
        try { rmSync(dizin, { recursive: true, force: true }); } catch { /* zararsız */ }
      }
      return { geriAlinanSurum: kayit.eskiSurum, ...(onarHatasi ? { onarHatasi } : {}) };
    }
    const [enYeni] = yedekleriListele(kok);
    if (!enYeni) throw hata('yedek_yok');
    const kayit = yedekKaydiOku(enYeni.dizin);
    if (!kayit) throw hata('yedek_bozuk');
    const mevcutHarita = manifestDosyalari(jsonOku(yollar(kok).kurulum, {}));
    baglantilariDenetle(kok, [...kayit.dosyalar, ...kayit.olmayanlar, ...Object.keys(mevcutHarita)]);
    // Güncellemeden sonra elle değiştirilmiş yönetilen dosyalar kaybolmasın.
    yerelDegisiklikleriSakla(kok, mevcutHarita, simdi);
    // Geri alma da kesilebilir: işaret, başlatıcının işi tamamlamasını sağlar.
    isaretYaz(kok, {
      yedek: enYeni.ad, eskiSurum: kayit.eskiSurum, yeniSurum: mevcutSurumOku(kok).surum ?? 'bilinmiyor',
      pid: process.pid, baslangic: simdi.toISOString(), islem: 'geri-al',
    });
    try {
      yedektenGeriYukle(kok, enYeni.dizin);
    } catch (error) {
      throw hata('geri_alma_basarisiz', error);
    }
    const onarHatasi = geriAlmaSonrasiOnar(kok, enYeni.dizin, onarFn);
    isaretSil(kok);
    return { geriAlinanSurum: kayit.eskiSurum, ...(onarHatasi ? { onarHatasi } : {}) };
  } finally {
    birak();
  }
}

// ---------------------------------------------------------------- arka plan

function durumDosyasi(kok) {
  return join(yollar(kok).durum, 'guncelleme.json');
}

export function kontrolZamaniMi(kok, simdi = new Date()) {
  const durum = jsonOku(durumDosyasi(kok), null);
  const son = Date.parse(durum?.son_kontrol ?? '');
  if (Number.isNaN(son)) return true;
  const yas = simdi.getTime() - son;
  return yas < 0 || yas >= KONTROL_ARALIGI_MS;
}

export async function arkaPlanKontrol(kok, { fetchFn = fetch, simdi = new Date() } = {}) {
  try {
    if (!kontrolZamaniMi(kok, simdi)) return null;
    let birak;
    try {
      birak = kilitAl(kok, 'guncelleme-kontrol');
    } catch {
      return null;
    }
    try {
      const onceki = jsonOku(durumDosyasi(kok), {}) ?? {};
      let kayit;
      try {
        const { surum } = await sonSurumuBul({ repo: mevcutSurumOku(kok).repo, fetchFn });
        kayit = { son_kontrol: simdi.toISOString(), en_son_surum: surum };
      } catch (error) {
        kayit = { son_kontrol: simdi.toISOString(), hata: String(error?.message ?? error).slice(0, 120) };
        if (typeof onceki.en_son_surum === 'string') kayit.en_son_surum = onceki.en_son_surum;
      }
      atomikYaz(durumDosyasi(kok), `${JSON.stringify(kayit, null, 2)}\n`);
      return kayit;
    } finally {
      birak();
    }
  } catch {
    return null;
  }
}

export function guncellemeBildirimi(kok) {
  try {
    if (!tercihleriOku(kok).guncelleme_bildirimi) return null;
    const durum = jsonOku(durumDosyasi(kok), null);
    const enSon = durum?.en_son_surum;
    const mevcut = mevcutSurumOku(kok).surum;
    if (surumKarsilastir(enSon, mevcut) <= 0) return null;
    return `Dijital Beyin ${enSon} sürümü çıktı (kurulu: ${mevcut}); güncellemek için: node beyin.mjs guncelle`;
  } catch {
    return null;
  }
}
