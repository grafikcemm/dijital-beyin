// Kurulum, onarım, kanca birleştirme ve kurulum manifesti.
// Güvenlik modeli docs/SOZLESME.md "Kasa düzeni" tablosudur: kullanıcı
// dosyalarına asla yazılmaz; ortak dosyalarda yalnız bizim bölümümüz yenilenir.
import {
  constants, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { atomikYaz, sha256, yollar } from './yol.mjs';

export const ISTEMCILER = Object.freeze(['claude', 'codex']);
const MANIFEST_SEMA = 'dijital-beyin.kurulum/v1';
const KANCA_IZI = 'sistem/kanca.mjs';
const YEDEK_SAKLA = 3;
// Kullanıcı klasörleri: onar eksik olanı boş olarak yeniden oluşturur, içine dokunmaz.
const KULLANICI_KLASORLERI = Object.freeze(['beynim', 'notlar', 'gunluk', 'gelen-kutusu']);

const MD_ISARET = { basla: '<!-- dijital-beyin:basla -->', bitir: '<!-- dijital-beyin:bitir -->' };
const GITIGNORE_ISARET = { basla: '# dijital-beyin:basla', bitir: '# dijital-beyin:bitir' };

// Ortak dosya → blok kaynağı (sistem/yonetilen altında) ve işaretler.
const BLOKLAR = [
  { rel: 'CLAUDE.md', kaynak: 'claude-blok.md', isaret: MD_ISARET },
  { rel: 'AGENTS.md', kaynak: 'agents-blok.md', isaret: MD_ISARET },
  { rel: '.gitignore', kaynak: 'gitignore-blok.txt', isaret: GITIGNORE_ISARET },
];

// Bu literal JSON'a aynen yazılır; Claude Code çalışırken genişletir.
const CLAUDE_PROJE_DEGISKENI = '${CLAUDE_PROJECT_DIR}';

const CLAUDE_OLAYLARI = [
  { olay: 'SessionStart', matcher: 'startup|resume|clear|compact', ad: 'baslangic' },
  { olay: 'SessionEnd', ad: 'bitis' },
  { olay: 'PreCompact', matcher: 'manual|auto', ad: 'sikistirma' },
  { olay: 'PreToolUse', matcher: 'Write|Edit|MultiEdit|Bash|PowerShell', ad: 'koruma' },
];

const CODEX_OLAYLARI = [
  { olay: 'SessionStart', matcher: 'startup|resume|clear', ad: 'baslangic', timeout: 10 },
  { olay: 'Stop', ad: 'durdur', timeout: 3 },
  { olay: 'PreToolUse', ad: 'koruma', timeout: 10 },
];

const CLAUDE_AYAR = '.claude/settings.json';
const CODEX_AYAR = '.codex/hooks.json';

// ---------------------------------------------------------------- yardımcılar

const WINDOWS = process.platform === 'win32';

function yolAnahtari(p) {
  const r = resolve(p);
  return WINDOWS ? r.toLowerCase() : r;
}

// a, b'nin içinde mi (ya da aynı mı)? Farklı sürücüler: içinde değil.
function icindeMi(ic, dis) {
  const fark = relative(yolAnahtari(dis), yolAnahtari(ic));
  if (fark === '') return true;
  if (isAbsolute(fark)) return false;
  return fark !== '..' && !fark.startsWith(`..${WINDOWS ? '\\' : '/'}`) && !fark.startsWith('../');
}

function ileriEgik(p) {
  return p.replace(/\\/gu, '/');
}

function metinOku(dosya) {
  try {
    return readFileSync(dosya, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

// Bayt sırası işareti kod içinde karakter kodu olarak tutulur (dosyada görünmez karakter olmasın).
const BOM = String.fromCharCode(0xfeff);

function bomsuz(metin) {
  return metin.startsWith(BOM) ? metin.slice(1) : metin;
}

function duzNesneMi(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function istemcileriDogrula(istemciler) {
  if (!Array.isArray(istemciler) || istemciler.length === 0) throw new Error('istemci_gecersiz');
  for (const ad of istemciler) {
    if (!ISTEMCILER.includes(ad)) throw new Error('istemci_gecersiz');
  }
  return ISTEMCILER.filter(ad => istemciler.includes(ad));
}

// Klasördeki dosyaları `/` ayraçlı göreli yollarla, sıralı döndürür. Sembolik
// bağlar ve *.tmp atlanır.
function dosyalariTopla(kokDizin, onEk = '') {
  const out = [];
  const gez = (dizin, rel) => {
    let girdiler;
    try {
      girdiler = readdirSync(dizin, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const girdi of girdiler) {
      const yeniRel = rel ? `${rel}/${girdi.name}` : girdi.name;
      const tam = join(dizin, girdi.name);
      if (girdi.isSymbolicLink()) continue;
      if (girdi.isDirectory()) gez(tam, yeniRel);
      else if (girdi.isFile() && !girdi.name.endsWith('.tmp')) out.push(yeniRel);
    }
  };
  gez(kokDizin, onEk);
  return out.sort();
}

// Kitin kendi yönetilen dosya listesi (kaynak klasörden). Hedef diski asla taranmaz:
// kullanıcının sistem/ altına koyduğu dosya manifeste girmesin, güncellemede silinmesin.
function kitDosyalari(kaynakKok) {
  const list = dosyalariTopla(join(kaynakKok, 'sistem'), 'sistem');
  try {
    if (statSync(join(kaynakKok, 'beyin.mjs')).isFile()) list.push('beyin.mjs');
  } catch { /* beyin.mjs yok */ }
  return list.sort();
}

function yonetilenRelMi(rel) {
  return typeof rel === 'string' && !rel.endsWith('.tmp') && !rel.includes('\\')
    && (rel === 'beyin.mjs' || (rel.startsWith('sistem/') && !rel.split('/').some(p => p === '' || p === '..' || p === '.')));
}

function surumOku(sistemDizin) {
  const ham = metinOku(join(sistemDizin, 'surum.json'));
  if (ham === null) throw new Error('surum_okunamadi');
  let veri;
  try {
    veri = JSON.parse(bomsuz(ham));
  } catch {
    throw new Error('surum_okunamadi');
  }
  if (!duzNesneMi(veri) || typeof veri.surum !== 'string') throw new Error('surum_okunamadi');
  return veri;
}

// ---------------------------------------------------------- yönetilen bloklar

function satirSonu(metin) {
  return metin && metin.includes('\r\n') ? '\r\n' : '\n';
}

// Bloğu yerine koyar ya da sona ekler; işaretlerin dışı bayt bayt korunur.
export function blokUygula(mevcut, blokIcerik, isaret, rel = 'dosya') {
  const eol = satirSonu(mevcut);
  const govde = blokIcerik.replace(/\r\n?/gu, '\n').replace(/\n+$/u, '').split('\n').join(eol);
  const blok = `${isaret.basla}${eol}${govde}${eol}${isaret.bitir}`;
  if (mevcut === null || mevcut === '') return `${blok}${eol}`;
  const bas = mevcut.indexOf(isaret.basla);
  if (bas < 0) {
    if (mevcut.includes(isaret.bitir)) throw new Error(`blok_bozuk:${rel}`);
    const ayrac = mevcut.endsWith('\n') ? eol : `${eol}${eol}`;
    return `${mevcut}${ayrac}${blok}${eol}`;
  }
  const son = mevcut.indexOf(isaret.bitir, bas + isaret.basla.length);
  if (son < 0) throw new Error(`blok_bozuk:${rel}`);
  if (mevcut.indexOf(isaret.basla, bas + isaret.basla.length) !== -1
    && mevcut.indexOf(isaret.basla, bas + isaret.basla.length) < son) {
    throw new Error(`blok_bozuk:${rel}`);
  }
  return `${mevcut.slice(0, bas)}${blok}${mevcut.slice(son + isaret.bitir.length)}`;
}

function bloklariHesapla(kok, sistemKaynak) {
  const sonuc = [];
  for (const tanim of BLOKLAR) {
    const icerik = metinOku(join(sistemKaynak, 'yonetilen', tanim.kaynak));
    if (icerik === null) throw new Error(`blok_kaynagi_yok:${tanim.kaynak}`);
    const dosya = join(kok, tanim.rel);
    const mevcut = metinOku(dosya);
    const yeni = blokUygula(mevcut, icerik, tanim.isaret, tanim.rel);
    if (yeni !== mevcut) sonuc.push({ rel: tanim.rel, dosya, yeni });
  }
  return sonuc;
}

// --------------------------------------------------------------------- kancalar

function bizimKancaMi(kanca) {
  if (!duzNesneMi(kanca)) return false;
  const parcalar = [kanca.command, ...(Array.isArray(kanca.args) ? kanca.args : [])];
  return parcalar.some(p => typeof p === 'string' && ileriEgik(p).includes(KANCA_IZI));
}

function ayarAyristir(ham) {
  let veri;
  try {
    veri = JSON.parse(bomsuz(ham));
  } catch {
    throw new Error('ayar_bozuk');
  }
  if (!duzNesneMi(veri)) throw new Error('ayar_bozuk');
  if (veri.hooks !== undefined) {
    if (!duzNesneMi(veri.hooks)) throw new Error('ayar_bozuk');
    for (const gruplar of Object.values(veri.hooks)) {
      if (!Array.isArray(gruplar)) throw new Error('ayar_bozuk');
    }
  }
  return veri;
}

// Bizim girdilerimizi çıkarır; başkalarınınkini olduğu gibi bırakır.
function bizimkileriCikar(veri) {
  let cikarildi = false;
  if (!veri.hooks) return cikarildi;
  for (const [olay, gruplar] of Object.entries(veri.hooks)) {
    let degisti = false;
    const kalan = [];
    for (const grup of gruplar) {
      if (duzNesneMi(grup) && Array.isArray(grup.hooks) && grup.hooks.some(bizimKancaMi)) {
        degisti = true;
        const hooks = grup.hooks.filter(k => !bizimKancaMi(k));
        if (hooks.length) kalan.push({ ...grup, hooks });
      } else {
        kalan.push(grup);
      }
    }
    if (!degisti) continue;
    cikarildi = true;
    if (kalan.length) veri.hooks[olay] = kalan;
    else delete veri.hooks[olay];
  }
  return cikarildi;
}

function gruplariEkle(veri, gruplar) {
  if (!duzNesneMi(veri.hooks)) veri.hooks = {};
  for (const { olay, grup } of gruplar) {
    if (!Array.isArray(veri.hooks[olay])) veri.hooks[olay] = [];
    veri.hooks[olay].push(grup);
  }
}

function claudeGruplari() {
  return CLAUDE_OLAYLARI.map(({ olay, matcher, ad }) => {
    const kanca = {
      type: 'command',
      command: 'node',
      args: [`${CLAUDE_PROJE_DEGISKENI}/sistem/kanca.mjs`, 'claude', ad],
      timeout: 10,
    };
    return { olay, grup: matcher ? { matcher, hooks: [kanca] } : { hooks: [kanca] } };
  });
}

function codexKancaYolu(kok) {
  return `${ileriEgik(resolve(kok))}/sistem/kanca.mjs`;
}

function codexGruplari(kok) {
  const yol = codexKancaYolu(kok);
  return CODEX_OLAYLARI.map(({ olay, matcher, ad, timeout }) => {
    const kanca = { type: 'command', command: `node "${yol}" codex ${ad}`, timeout };
    return { olay, grup: matcher ? { matcher, hooks: [kanca] } : { hooks: [kanca] } };
  });
}

function jsonMetni(veri) {
  return `${JSON.stringify(veri, null, 2)}\n`;
}

// Bir ayar dosyasının yeni içeriğini hesaplar. null → yazılacak bir şey yok.
function ayarHesapla(mevcut, ekle, gruplar, { bozuksaAtla }) {
  if (mevcut === null && !ekle) return null;
  let veri = {};
  if (mevcut !== null) {
    try {
      veri = ayarAyristir(mevcut);
    } catch (error) {
      if (bozuksaAtla) return null;
      throw error;
    }
  }
  const once = JSON.stringify(veri);
  const cikarildi = bizimkileriCikar(veri);
  // Bizim girdimiz yoksa ve eklemiyorsak dosya kullanıcınındır: biçimine bile dokunulmaz.
  if (!ekle && !cikarildi) return null;
  if (ekle) gruplariEkle(veri, gruplar);
  // İçerik anlamca aynıysa (yalnız biçim farkı) yeniden yazılmaz.
  if (mevcut !== null && JSON.stringify(veri) === once) return null;
  const yeni = jsonMetni(veri);
  return yeni === mevcut ? null : yeni;
}

function kancalariHesapla(kok, istemciler) {
  const liste = istemcileriDogrula(istemciler);
  const sonuc = [];
  const claudeDosya = join(kok, CLAUDE_AYAR);
  const claudeYeni = ayarHesapla(metinOku(claudeDosya), liste.includes('claude'), claudeGruplari(), {
    bozuksaAtla: !liste.includes('claude'),
  });
  if (claudeYeni !== null) sonuc.push({ rel: CLAUDE_AYAR, dosya: claudeDosya, yeni: claudeYeni });
  const codexDosya = join(kok, CODEX_AYAR);
  const codexYeni = ayarHesapla(metinOku(codexDosya), liste.includes('codex'), codexGruplari(kok), {
    bozuksaAtla: !liste.includes('codex'),
  });
  if (codexYeni !== null) sonuc.push({ rel: CODEX_AYAR, dosya: codexDosya, yeni: codexYeni });
  return sonuc;
}

function zamanEtiketi(simdi = new Date()) {
  return simdi.toISOString().replace(/[:.]/gu, '-');
}

function ayarYedekle(kok, dosya, simdi) {
  if (!existsSync(dosya)) return;
  const yedekDizin = join(yollar(kok).yedek, 'ayarlar');
  mkdirSync(yedekDizin, { recursive: true });
  const ad = dosya.endsWith('settings.json') ? 'settings' : 'hooks';
  copyFileSync(dosya, join(yedekDizin, `${ad}-${zamanEtiketi(simdi)}.json`));
  const eskiler = readdirSync(yedekDizin)
    .filter(n => n.startsWith(`${ad}-`) && n.endsWith('.json'))
    .sort();
  for (const fazla of eskiler.slice(0, Math.max(0, eskiler.length - YEDEK_SAKLA))) {
    try { unlinkSync(join(yedekDizin, fazla)); } catch { /* başka süreç sildi */ }
  }
}

export function kancalariBirlestir(kok, istemciler, { simdi } = {}) {
  const degisenler = [];
  for (const { rel, dosya, yeni } of kancalariHesapla(kok, istemciler)) {
    ayarYedekle(kok, dosya, simdi);
    atomikYaz(dosya, yeni);
    degisenler.push(rel);
  }
  return { degisenler };
}

function claudeEksikleri(kok) {
  const tum = CLAUDE_OLAYLARI.map(o => o.ad);
  const ham = metinOku(join(kok, CLAUDE_AYAR));
  if (ham === null) return tum;
  let veri;
  try { veri = ayarAyristir(ham); } catch { return tum; }
  return CLAUDE_OLAYLARI.filter(({ olay, ad }) => {
    const gruplar = veri.hooks?.[olay] ?? [];
    return !gruplar.some(g => duzNesneMi(g) && Array.isArray(g.hooks) && g.hooks.some(k => bizimKancaMi(k)
      && Array.isArray(k.args) && k.args[1] === 'claude' && k.args[2] === ad));
  }).map(o => o.ad);
}

function codexEksikleri(kok) {
  const tum = CODEX_OLAYLARI.map(o => o.ad);
  const ham = metinOku(join(kok, CODEX_AYAR));
  if (ham === null) return tum;
  let veri;
  try { veri = ayarAyristir(ham); } catch { return tum; }
  const beklenen = codexKancaYolu(kok);
  const ayni = (a, b) => (WINDOWS ? a.toLowerCase() === b.toLowerCase() : a === b);
  const eksik = [];
  let yolYanlis = false;
  for (const { olay, ad } of CODEX_OLAYLARI) {
    const gruplar = veri.hooks?.[olay] ?? [];
    let bulundu = false;
    for (const g of gruplar) {
      if (!duzNesneMi(g) || !Array.isArray(g.hooks)) continue;
      for (const k of g.hooks) {
        if (!bizimKancaMi(k) || typeof k.command !== 'string') continue;
        const m = /"([^"]*sistem\/kanca\.mjs)"\s+codex\s+([a-z]+)/u.exec(ileriEgik(k.command));
        if (!m || m[2] !== ad) continue;
        bulundu = true;
        if (!ayni(m[1], beklenen)) yolYanlis = true;
      }
    }
    if (!bulundu) eksik.push(ad);
  }
  if (yolYanlis) eksik.push('yol');
  return eksik;
}

export function kancaDurumu(kok) {
  const claude = claudeEksikleri(kok);
  const codex = codexEksikleri(kok);
  return {
    claude: { kurulu: claude.length === 0, eksik: claude },
    codex: { kurulu: codex.length === 0, eksik: codex },
  };
}

// --------------------------------------------------------------------- manifest

export function manifestOku(kok) {
  const ham = metinOku(yollar(kok).kurulum);
  if (ham === null) return null;
  try {
    const veri = JSON.parse(bomsuz(ham));
    return duzNesneMi(veri) ? veri : null;
  } catch {
    return null;
  }
}

function manifestHesapla(kok, surum, { simdi = new Date(), istemciler, repo, dosyalar: kitListesi } = {}) {
  const onceki = manifestOku(kok);
  const liste = istemciler
    ? istemcileriDogrula(istemciler)
    : (Array.isArray(onceki?.istemciler) ? istemcileriDogrulaSessiz(onceki.istemciler) : ['claude']);
  // Liste kitten gelir; verilmediyse yalnız önceki manifestteki yollar (diskten keşif yok).
  const eskiHarita = duzNesneMi(onceki?.dosyalar) ? onceki.dosyalar : {};
  const adaylar = Array.isArray(kitListesi) ? kitListesi : Object.keys(eskiHarita);
  const dosyalar = {};
  for (const rel of [...new Set(adaylar)].filter(yonetilenRelMi).sort()) {
    try {
      dosyalar[rel] = sha256(readFileSync(join(kok, ...rel.split('/'))));
    } catch (error) {
      // Dosya eksikse eski kayıt korunur ki doktor eksikliği göstermeye devam etsin.
      if (error?.code === 'ENOENT' && typeof eskiHarita[rel] === 'string') dosyalar[rel] = eskiHarita[rel];
      else if (error?.code !== 'ENOENT') throw error;
    }
  }
  const zaman = simdi.toISOString();
  return {
    onceki,
    veri: {
      sema: MANIFEST_SEMA,
      surum,
      repo,
      istemciler: liste,
      kuruldu: typeof onceki?.kuruldu === 'string' ? onceki.kuruldu : zaman,
      guncellendi: zaman,
      dosyalar,
    },
  };
}

function istemcileriDogrulaSessiz(liste) {
  try { return istemcileriDogrula(liste); } catch { return ['claude']; }
}

function manifestAyniMi(a, b) {
  if (!a) return false;
  const { guncellendi: _a, ...ra } = a;
  const { guncellendi: _b, ...rb } = b;
  return JSON.stringify(ra) === JSON.stringify(rb);
}

// `dosyalar`: kitin/paketin gönderdiği yönetilen yollar. Verilmezse önceki manifestin yolları.
export function manifestYaz(kok, surum, { simdi, istemciler, dosyalar } = {}) {
  let repo;
  try { repo = surumOku(join(kok, 'sistem')).repo; } catch { repo = undefined; }
  const { onceki, veri } = manifestHesapla(kok, surum, { simdi, istemciler, repo, dosyalar });
  if (typeof repo !== 'string') delete veri.repo;
  atomikYaz(yollar(kok).kurulum, jsonMetni(veri));
  return { manifest: veri, degisti: !manifestAyniMi(onceki, veri) };
}

// ------------------------------------------------------------------------ onar

function istemcileriBelirle(kok, istemciler) {
  if (istemciler !== undefined) return istemcileriDogrula(istemciler);
  const onceki = manifestOku(kok);
  return Array.isArray(onceki?.istemciler) ? istemcileriDogrulaSessiz(onceki.istemciler) : ['claude'];
}

// Eksik kullanıcı klasörünü boş oluşturur; `sablon` verilirse eksik şablon dosyalarını da
// (COPYFILE_EXCL: var olana asla yazılmaz). Var olan içeriğe dokunmaz.
function kullaniciKlasorleriniTamamla(kok, sablon) {
  const eklenenler = [];
  for (const ad of KULLANICI_KLASORLERI) {
    const dizin = join(kok, ad);
    if (!existsSync(dizin)) {
      mkdirSync(dizin, { recursive: true });
      eklenenler.push(`${ad}/`);
    }
  }
  if (sablon) {
    for (const rel of dosyalariTopla(sablon)) {
      const dosya = join(kok, ...rel.split('/'));
      if (existsSync(dosya)) continue;
      mkdirSync(dirname(dosya), { recursive: true });
      try {
        copyFileSync(join(sablon, ...rel.split('/')), dosya, constants.COPYFILE_EXCL);
        eklenenler.push(rel);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
    }
  }
  return eklenenler;
}

export function onar(kok, { istemciler, simdi, dosyalar, sablon } = {}) {
  const tamKok = resolve(kok);
  const liste = istemcileriBelirle(tamKok, istemciler);
  const { surum } = surumOku(join(tamKok, 'sistem'));
  // Önce her şeyi hesapla: bozuk bir dosya varsa hiçbir şey yazılmadan dur.
  const bloklar = bloklariHesapla(tamKok, join(tamKok, 'sistem'));
  kancalariHesapla(tamKok, liste);
  const degisenler = [];
  for (const { rel, dosya, yeni } of bloklar) {
    atomikYaz(dosya, yeni);
    degisenler.push(rel);
  }
  degisenler.push(...kancalariBirlestir(tamKok, liste, { simdi }).degisenler);
  degisenler.push(...kullaniciKlasorleriniTamamla(tamKok, sablon));
  const { degisti } = manifestYaz(tamKok, surum, { simdi, istemciler: liste, dosyalar });
  if (degisti) degisenler.push('.beyin/kurulum.json');
  return { degisenler };
}

// ------------------------------------------------------------------------- kur

export function kur({ kaynak, hedef, istemciler, plan = false, simdi, uzerineYaz = false } = {}) {
  if (typeof kaynak !== 'string' || !kaynak) throw new Error('kaynak_gecersiz');
  if (typeof hedef !== 'string' || !hedef) throw new Error('hedef_gecersiz');
  const kaynakKok = resolve(kaynak);
  const hedefKok = resolve(hedef);
  if (!existsSync(join(kaynakKok, 'sistem', 'surum.json')) || !existsSync(join(kaynakKok, 'beyin.mjs'))) {
    throw new Error('kaynak_gecersiz');
  }
  if (yolAnahtari(kaynakKok) === yolAnahtari(hedefKok)) throw new Error('hedef_kaynakla_ayni');
  if (icindeMi(hedefKok, kaynakKok)) throw new Error('hedef_kaynak_icinde');
  if (icindeMi(kaynakKok, hedefKok)) throw new Error('kaynak_hedef_icinde');
  if (existsSync(hedefKok) && !statSync(hedefKok).isDirectory()) throw new Error('hedef_klasor_degil');

  const onceki = existsSync(hedefKok) ? manifestOku(hedefKok) : null;
  // Daha önce bizim kurmadığımız klasörde kullanıcının sistem/ ya da beyin.mjs dosyası olabilir:
  // sormadan üzerine yazılmaz (bozuk bir kurulum.json da bizim kurulumumuz sayılır).
  const cakisanlar = existsSync(yollar(hedefKok).kurulum)
    ? []
    : ['sistem', 'beyin.mjs'].filter(ad => existsSync(join(hedefKok, ad)));
  if (cakisanlar.length && !uzerineYaz) throw new Error(`hedef_cakisma:${cakisanlar.join(',')}`);
  const liste = istemciler !== undefined
    ? istemcileriDogrula(istemciler)
    : (Array.isArray(onceki?.istemciler) ? istemcileriDogrulaSessiz(onceki.istemciler) : ['claude']);

  const uyarilar = [];
  if (existsSync(hedefKok) && !onceki && readdirSync(hedefKok).length > 0) uyarilar.push('hedef_bos_degil');

  const yonetilen = kitDosyalari(kaynakKok);
  if (onceki && duzNesneMi(onceki.dosyalar)) {
    for (const rel of yonetilen) {
      const beklenen = onceki.dosyalar[rel];
      const dosya = join(hedefKok, ...rel.split('/'));
      if (typeof beklenen === 'string' && existsSync(dosya) && sha256(readFileSync(dosya)) !== beklenen) {
        uyarilar.push(`yerel_degisiklik_ezilecek:${rel}`);
      }
    }
  }

  const sablonlar = dosyalariTopla(join(kaynakKok, 'sablon'));
  const yeniSablonlar = [];
  const korunanlar = [];
  for (const rel of sablonlar) {
    if (existsSync(join(hedefKok, ...rel.split('/')))) korunanlar.push(rel);
    else yeniSablonlar.push(rel);
  }

  const degisecekYonetilen = yonetilen.filter(rel => {
    const dosya = join(hedefKok, ...rel.split('/'));
    return !existsSync(dosya) || !readFileSync(dosya).equals(readFileSync(join(kaynakKok, ...rel.split('/'))));
  });

  // Bozuk ortak dosya (ayar_bozuk, blok_bozuk) hiçbir şey yazılmadan burada yakalanır.
  const bloklar = bloklariHesapla(hedefKok, join(kaynakKok, 'sistem'));
  const kancalar = kancalariHesapla(hedefKok, liste);

  if (plan) {
    const tahmini = [...degisecekYonetilen, ...yeniSablonlar];
    for (const { rel } of [...bloklar, ...kancalar]) tahmini.push(rel);
    tahmini.push('.beyin/kurulum.json');
    return { yazilanlar: [...new Set(tahmini)], korunanlar, uyarilar };
  }

  mkdirSync(hedefKok, { recursive: true });
  if (cakisanlar.length) {
    const yedekDizin = join(yollar(hedefKok).yedek, `kurulum-oncesi-${zamanEtiketi(simdi)}`);
    mkdirSync(yedekDizin, { recursive: true });
    for (const ad of cakisanlar) cpSync(join(hedefKok, ad), join(yedekDizin, ad), { recursive: true });
    uyarilar.push(`kurulum_oncesi_yedek:${ileriEgik(relative(hedefKok, yedekDizin))}`);
  }
  const yazilanlar = [];
  for (const rel of degisecekYonetilen) {
    atomikYaz(join(hedefKok, ...rel.split('/')), readFileSync(join(kaynakKok, ...rel.split('/'))));
    yazilanlar.push(rel);
  }
  for (const rel of yeniSablonlar) {
    const dosya = join(hedefKok, ...rel.split('/'));
    mkdirSync(dirname(dosya), { recursive: true });
    try {
      // COPYFILE_EXCL: arada kullanıcı dosyası oluştuysa üzerine yazılmaz.
      copyFileSync(join(kaynakKok, 'sablon', ...rel.split('/')), dosya, constants.COPYFILE_EXCL);
      yazilanlar.push(rel);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      korunanlar.push(rel);
    }
  }
  for (const rel of onar(hedefKok, {
    istemciler: liste, simdi, dosyalar: yonetilen, sablon: join(kaynakKok, 'sablon'),
  }).degisenler) {
    if (!yazilanlar.includes(rel)) yazilanlar.push(rel);
  }
  // Yeniden kurulum, yarıda kalmış bir güncellemenin işaretini geçersiz kılar;
  // yoksa başlatıcı bir sonraki açılışta eski yedeği taze kurulumun üstüne geri yükler.
  rmSync(join(hedefKok, '.beyin', 'durum', 'guncelleme-suruyor.json'), { force: true });
  return { yazilanlar, korunanlar: [...new Set(korunanlar)].sort(), uyarilar };
}
