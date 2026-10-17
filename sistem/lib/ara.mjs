// Modelsiz BM25 pasaj araması: beynim/ notlar/ gunluk/ gelen-kutusu/ altındaki
// .md dosyaları. Not içeriği yalnız veridir; çalıştırılmaz, bağlantı izlenmez.
//
// Türkçe uyum: tr yerel ayarıyla küçük harf (İ→i, I→ı), ardından hafif ek
// soyma (turkceKok), en sonda aksan katlama (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u).
// Böylece "sutlac" "sütlaç"ı, "karar" "kararları"nı bulur.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KLASORLER = ['beynim', 'notlar', 'gunluk', 'gelen-kutusu'];
const AZAMI_BAYT = 1024 * 1024;
const AZAMI_DOSYA = 5000;
const PARCA_SINIRI = 240;
const K1 = 1.2;
const B = 0.75;
const KOK_ALT_SINIR = 3;

const KATLAMA = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const SESLILER = new Set(['a', 'e', 'i', 'o', 'u']);

function katla(metin) {
  return metin.replace(/[çğıöşüâîû]/gu, harf => KATLAMA[harf]);
}

// Ekler katlanmış biçimde tutulur; eşleşme katlanmış sözcükte yapılır,
// kesme özgün sözcükte. Böylece kok(x) katlanınca kok(katla(x)) ile aynıdır.
// kosul: 'sessiz' → ekten önceki harf ünsüz olmalı; 'sesli' → ünlü olmalı.
const EKLER = [
  { ek: 'lar' }, { ek: 'ler' },
  { ek: 'dan' }, { ek: 'den' }, { ek: 'tan' }, { ek: 'ten' },
  { ek: 'nin', kosul: 'sesli' }, { ek: 'nun', kosul: 'sesli' },
  { ek: 'yla', kosul: 'sesli' }, { ek: 'yle', kosul: 'sesli' },
  { ek: 'dir' }, { ek: 'tir' }, { ek: 'dur' }, { ek: 'tur' },
  { ek: 'miz' }, { ek: 'muz' },
  { ek: 'da' }, { ek: 'de' }, { ek: 'ta' }, { ek: 'te' },
  { ek: 'in', kosul: 'sessiz' }, { ek: 'un', kosul: 'sessiz' },
  { ek: 'la', kosul: 'sessiz' }, { ek: 'le', kosul: 'sessiz' },
  { ek: 'si', kosul: 'sesli' }, { ek: 'su', kosul: 'sesli' },
  { ek: 'ya', kosul: 'sesli' }, { ek: 'ye', kosul: 'sesli' },
  { ek: 'a', kosul: 'sessiz' }, { ek: 'e', kosul: 'sessiz' },
  { ek: 'i', kosul: 'sessiz' }, { ek: 'u', kosul: 'sessiz' },
].sort((x, y) => y.ek.length - x.ek.length);

const DURAK = new Set([
  've', 'ile', 'bir', 'bu', 'su', 'icin', 'de', 'da', 'mi', 'mu', 'ne', 'ya', 'ama', 'ki', 'gibi', 'cok', 'daha',
  'the', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'was', 'be', 'on', 'for', 'with', 'as', 'at', 'by', 'it',
]);

function harfMi(ch) {
  return /\p{L}/u.test(ch);
}

export function turkceKok(kelime) {
  let ozgun = String(kelime ?? '').toLocaleLowerCase('tr-TR');
  for (let tur = 0; tur < 6; tur += 1) {
    const katli = katla(ozgun);
    let kesildi = false;
    for (const { ek, kosul } of EKLER) {
      const kalan = katli.length - ek.length;
      if (kalan < KOK_ALT_SINIR || !katli.endsWith(ek)) continue;
      const onceki = katli[kalan - 1];
      if (!harfMi(onceki)) continue;
      if (kosul === 'sessiz' && SESLILER.has(onceki)) continue;
      if (kosul === 'sesli' && !SESLILER.has(onceki)) continue;
      ozgun = ozgun.slice(0, kalan);
      kesildi = true;
      break;
    }
    if (!kesildi) break;
  }
  return ozgun;
}

export function terimler(metin) {
  const out = [];
  for (const ham of String(metin ?? '').toLocaleLowerCase('tr-TR').match(/[\p{L}\p{N}]+/gu) ?? []) {
    const katli = katla(ham);
    if (katli.length < 2 || DURAK.has(katli)) continue;
    out.push(katla(turkceKok(ham)));
  }
  return out;
}

function mdDosyalari(kok) {
  const out = [];
  const gez = (dizin, rel) => {
    let girdiler;
    try {
      girdiler = readdirSync(dizin, { withFileTypes: true });
    } catch {
      return;
    }
    girdiler.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const girdi of girdiler) {
      if (girdi.isSymbolicLink() || girdi.name.startsWith('.')) continue;
      const yeniRel = `${rel}/${girdi.name}`;
      if (girdi.isDirectory()) gez(join(dizin, girdi.name), yeniRel);
      else if (girdi.isFile() && girdi.name.toLowerCase().endsWith('.md')) out.push(yeniRel);
    }
  };
  for (const klasor of KLASORLER) gez(join(kok, klasor), klasor);
  return out.slice(0, AZAMI_DOSYA);
}

// Paragraflar (boş satırla ayrılmış) ve başlangıç satır numaraları (1 tabanlı,
// frontmatter dahil sayılır ama pasaj olarak alınmaz).
export function pasajlar(metin) {
  let ham = String(metin ?? '');
  if (ham.charCodeAt(0) === 0xfeff) ham = ham.slice(1);
  const satirlar = ham.split(/\r?\n/u);
  let i = 0;
  if (satirlar[0] === '---') {
    const son = satirlar.indexOf('---', 1);
    if (son > 0) i = son + 1;
  }
  const out = [];
  let bas = -1;
  let tampon = [];
  const bosalt = () => {
    if (tampon.length) out.push({ satir: bas + 1, metin: tampon.join('\n') });
    tampon = [];
    bas = -1;
  };
  for (; i < satirlar.length; i += 1) {
    if (satirlar[i].trim() === '') { bosalt(); continue; }
    if (bas < 0) bas = i;
    tampon.push(satirlar[i]);
  }
  bosalt();
  return out;
}

function parcaYap(metin) {
  const duz = metin.replace(/\s+/gu, ' ').trim();
  return duz.length <= PARCA_SINIRI ? duz : `${duz.slice(0, PARCA_SINIRI - 1)}…`;
}

export function ara(kok, sorgu, { limit = 5 } = {}) {
  const sorguTerimleri = [...new Set(terimler(sorgu))];
  if (!sorguTerimleri.length) return [];
  const belgeler = [];
  for (const rel of mdDosyalari(kok)) {
    const dosya = join(kok, ...rel.split('/'));
    let metin;
    try {
      if (statSync(dosya).size > AZAMI_BAYT) continue;
      metin = readFileSync(dosya, 'utf8');
    } catch {
      continue;
    }
    for (const pasaj of pasajlar(metin)) {
      const liste = terimler(pasaj.metin);
      if (!liste.length) continue;
      const tf = new Map();
      for (const t of liste) tf.set(t, (tf.get(t) ?? 0) + 1);
      belgeler.push({ dosya: rel, satir: pasaj.satir, metin: pasaj.metin, uzunluk: liste.length, tf });
    }
  }
  if (!belgeler.length) return [];
  const n = belgeler.length;
  const ortalama = belgeler.reduce((t, b) => t + b.uzunluk, 0) / n;
  const idf = new Map();
  for (const terim of sorguTerimleri) {
    let df = 0;
    for (const b of belgeler) if (b.tf.has(terim)) df += 1;
    idf.set(terim, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
  }
  const sonuc = [];
  for (const b of belgeler) {
    let skor = 0;
    for (const terim of sorguTerimleri) {
      const f = b.tf.get(terim);
      if (!f) continue;
      skor += idf.get(terim) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * b.uzunluk) / ortalama)));
    }
    if (skor > 0) sonuc.push({ b, skor });
  }
  sonuc.sort((x, y) => y.skor - x.skor
    || (x.b.dosya < y.b.dosya ? -1 : x.b.dosya > y.b.dosya ? 1 : 0)
    || x.b.satir - y.b.satir);
  const adet = Number.isInteger(limit) && limit > 0 ? limit : 5;
  return sonuc.slice(0, adet).map(({ b, skor }) => ({
    dosya: b.dosya,
    satir: b.satir,
    skor: Math.round(skor * 1000) / 1000,
    parca: parcaYap(b.metin),
  }));
}
