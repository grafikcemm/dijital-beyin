// PreToolUse koruması: kararlar ve günlük yalnız-ekle, beynim/ notu boşaltılmaz.
// Bu bir güvenlik sınırı değil, kaza önleyicidir; hata olursa izin verir.
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { tercihleriOku } from './tercihler.mjs';

const DUYARSIZ = process.platform === 'win32' || process.platform === 'darwin';
const IZIN = Object.freeze({ izin: true });

const NEDEN = {
  karar: 'beynim/verdigim-kararlar.md yalnız eklenebilir: eski satırları silme veya değiştirme. Yeni kararı tarihli yeni bir satır olarak ekle; değişen kararın eski satırının sonuna " GEÇERSİZ" yaz.',
  gunluk: 'gunluk/ yalnız eklenebilir: mevcut satırları silme veya değiştirme. Yeni bilgiyi tarihli yeni bir satır olarak ekle.',
  bos: 'beynim/ altındaki bir notu boşaltma. Notu Edit ile güncelle; eskiyen bilgiyi silmek yerine tarihli yeni bilgi ekle.',
  kabuk: 'beynim/ veya gunluk/ altında silme, taşıma ya da üzerine yazma komutu engellendi. Notu Edit ile güncelle; kararlar için tarihli yeni satır ekle ve eskisinin sonuna " GEÇERSİZ" yaz.',
};

const RET = neden => ({ izin: false, neden });

function goreliYol(kok, ham) {
  if (typeof ham !== 'string' || !ham.trim()) return null;
  const duz = ham.trim().replace(/\\/gu, '/');
  if (process.platform !== 'win32' && /^[A-Za-z]:\//u.test(duz)) return null;
  const k = DUYARSIZ ? resolve(kok).toLowerCase() : resolve(kok);
  const h = DUYARSIZ ? resolve(kok, duz).toLowerCase() : resolve(kok, duz);
  const fark = relative(k, h);
  if (!fark || fark.startsWith('..') || isAbsolute(fark)) return null;
  const rel = fark.split(sep).join('/');
  return DUYARSIZ ? rel.toLowerCase() : rel;
}

function tur(rel) {
  if (!rel) return null;
  if (rel === 'beynim/verdigim-kararlar.md') return 'karar';
  if (rel.startsWith('gunluk/')) return 'gunluk';
  if (rel.startsWith('beynim/')) return 'beynim';
  return null;
}

function satirlar(text) {
  return String(text ?? '').replace(/\r/gu, '').split('\n').map(s => s.trimEnd()).filter(s => s.trim());
}

// Karar dosyasında yalnız karar maddeleri korunur (`- `, `* `, `1. `); başlık, açıklama ve "(örnek)" satırları serbest.
const KARAR_MADDESI = /^\s*(?:[-*]|\d+[.)])\s+(?!\(örnek\))\S/u;

// Her korunan eski satır, yeni satırlardan birinin öneki olmalı (ekleme ve son ek serbest).
// Eşleşme çoklu kümedir: aynı satırın iki kopyasından birini silmek de yakalanır.
function korunuyor(eski, yeni, t) {
  const yeniler = satirlar(yeni);
  const korunanlar = t === 'karar' ? satirlar(eski).filter(s => KARAR_MADDESI.test(s)) : satirlar(eski);
  const kullanildi = new Array(yeniler.length).fill(false);
  // Uzun satırlar önce eşleşir; tam eşleşme önek eşleşmesine tercih edilir.
  for (const e of [...korunanlar].sort((a, b) => b.length - a.length)) {
    let j = yeniler.findIndex((y, k) => !kullanildi[k] && y === e);
    if (j < 0) j = yeniler.findIndex((y, k) => !kullanildi[k] && y.startsWith(e));
    if (j < 0) return false;
    kullanildi[j] = true;
  }
  return true;
}

function dosyaKarari(kok, aracAdi, girdi) {
  const rel = goreliYol(kok, girdi.file_path ?? girdi.path ?? girdi.notebook_path);
  const t = tur(rel);
  if (!t) return IZIN;
  const yalnizEkle = t === 'karar' || t === 'gunluk';
  if (typeof girdi.content === 'string' && (aracAdi === 'Write' || girdi.old_string === undefined)) {
    if (!girdi.content.trim() && (t === 'beynim' || t === 'karar')) return RET(NEDEN.bos);
    if (!yalnizEkle) return IZIN;
    let mevcut;
    try { mevcut = readFileSync(resolve(kok, String(girdi.file_path ?? girdi.path).replace(/\\/gu, '/')), 'utf8'); }
    catch { return IZIN; }
    return korunuyor(mevcut, girdi.content, t) ? IZIN : RET(NEDEN[t]);
  }
  if (!yalnizEkle) return IZIN;
  const duzenlemeler = (Array.isArray(girdi.edits) ? girdi.edits
    : typeof girdi.old_string === 'string' ? [girdi] : [])
    .filter(d => d && typeof d.old_string === 'string');
  let mevcut = null;
  try { mevcut = readFileSync(resolve(kok, String(girdi.file_path ?? girdi.path).replace(/\\/gu, '/')), 'utf8'); }
  catch { /* dosya okunamazsa parça parça denetlenir */ }
  if (mevcut !== null) {
    // Düzenlemeyi tüm dosyaya uygula ve sonucu karşılaştır: satır içi kısmi değişiklik de yakalanır.
    let sonuc = mevcut.replace(/\r\n?/gu, '\n');
    for (const d of duzenlemeler) {
      const eski = d.old_string.replace(/\r\n?/gu, '\n');
      const yeni = typeof d.new_string === 'string' ? d.new_string.replace(/\r\n?/gu, '\n') : '';
      sonuc = d.replace_all ? sonuc.split(eski).join(yeni) : sonuc.replace(eski, () => yeni);
    }
    return korunuyor(mevcut, sonuc, t) ? IZIN : RET(NEDEN[t]);
  }
  for (const d of duzenlemeler) {
    if (!korunuyor(d.old_string, typeof d.new_string === 'string' ? d.new_string : '', 'gunluk')) return RET(NEDEN[t]);
  }
  return IZIN;
}

// Codex apply_patch: silinen/taşınan korumalı dosya ya da kaldırılan eski satır.
function yamaKarari(kok, yama) {
  let t = null;
  let silinen = [];
  let eklenen = [];
  const bitir = () => {
    if ((t === 'karar' || t === 'gunluk') && !korunuyor(silinen.join('\n'), eklenen.join('\n'), t)) return RET(NEDEN[t]);
    return null;
  };
  for (const satir of yama.replace(/\r/gu, '').split('\n')) {
    const baslik = /^\*\*\* (Add|Update|Delete) File: (.+)$/u.exec(satir);
    const tasima = /^\*\*\* Move to: (.+)$/u.exec(satir);
    if (baslik || tasima || satir.startsWith('*** End Patch')) {
      const ret = bitir();
      if (ret) return ret;
      silinen = [];
      eklenen = [];
      if (tasima) {
        if (t) return RET(NEDEN.kabuk);
        t = null;
        continue;
      }
      t = baslik ? tur(goreliYol(kok, baslik[2])) : null;
      if (baslik?.[1] === 'Delete' && t) return RET(NEDEN.kabuk);
      if (baslik?.[1] === 'Add' && (t === 'karar' || t === 'gunluk')) {
        // Var olan korunan dosyaya "Add File" onu baştan yazar: eski satırlar yeni içerikte kalmalı.
        try { silinen = [readFileSync(resolve(kok, baslik[2].trim().replace(/\\/gu, '/')), 'utf8')]; } catch { silinen = []; }
      }
      continue;
    }
    if (!t) continue;
    if (satir.startsWith('-')) silinen.push(satir.slice(1));
    else if (satir.startsWith('+')) eklenen.push(satir.slice(1));
  }
  return bitir() ?? IZIN;
}

// Kabuk komutları basit komutlara bölünür; yıkıcı fiil yalnız kendi argümanları (ya da
// yönlendirme hedefi) beynim/ veya gunluk/ yoluna değiyorsa reddedilir. Böylece
// `ara "beynim"` gibi sorgular ve başka komuttaki yollar karışmaz.
const YIKICI = new Set([
  'rm', 'del', 'erase', 'rmdir', 'rd', 'unlink', 'shred', 'remove-item', 'ri', 'mv', 'move', 'move-item', 'mi',
  'ren', 'rename', 'rename-item', 'rni', 'clear-content', 'clc', 'set-content', 'sc', 'out-file', 'truncate',
]);
const KOPYALA = new Set(['cp', 'copy', 'copy-item', 'cpi', 'xcopy', 'robocopy', 'install', 'rsync', 'dd']);
const GIT_YIKICI = new Set(['rm', 'mv', 'checkout', 'restore', 'clean']);
const SARMALAYICI = new Set(['sudo', 'doas', 'env', 'command', 'nohup', 'time', 'exec', 'builtin']);
const KABUKLAR = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'powershell', 'pwsh', 'cmd']);
const DIZIN_DEGISTIR = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl']);
const KORUNAN_PARCALAR = new Set(['beynim', 'gunluk']);

// Komutu `;` `&&` `||` `|` `&` ve satır sonlarından böler (tırnak içi bölünmez). Her basit
// komut için {jetonlar, yonler}: `>` hedefleri yonler'e girer, `>>` (ekleme) hedefi yok sayılır.
function komutlaraBol(komut) {
  const sonuc = [];
  let jetonlar = [];
  let yonler = [];
  let cur = '';
  let dolu = false;
  let tirnakli = false;
  let q = null;
  let bekleyen = null;
  const jetonBitir = () => {
    if (dolu) {
      if (bekleyen === 'kes') yonler.push(cur);
      else if (bekleyen === null) jetonlar.push({ v: cur, q: tirnakli });
      bekleyen = null;
    }
    cur = ''; dolu = false; tirnakli = false;
  };
  const komutBitir = () => {
    jetonBitir();
    bekleyen = null;
    if (jetonlar.length || yonler.length) sonuc.push({ jetonlar, yonler });
    jetonlar = []; yonler = [];
  };
  for (let i = 0; i < komut.length; i += 1) {
    const c = komut[i];
    const sonraki = komut[i + 1];
    if (q) {
      if (c === q) q = null; else cur += c;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') jetonBitir();
    else if (c === '\n' || c === ';') komutBitir();
    else if (c === '|') { komutBitir(); if (sonraki === '|' || sonraki === '&') i += 1; }
    else if (c === '&') {
      if (sonraki === '&') { komutBitir(); i += 1; } else if (sonraki === '>') jetonBitir(); else komutBitir();
    } else if (c === '(' || c === ')') {
      if (c === '(' && cur === '$') { cur = ''; dolu = false; }
      komutBitir();
    } else if (c === '>') {
      if (dolu && !tirnakli && /^\d+$/u.test(cur)) { cur = ''; dolu = false; } else jetonBitir();
      if (sonraki === '>') { bekleyen = 'ekle'; i += 1; } else if (sonraki === '&') {
        i += 1;
        while (/[\d-]/u.test(komut[i + 1] ?? '')) i += 1;
      } else { if (sonraki === '|') i += 1; bekleyen = 'kes'; }
    } else if (c === '"' || c === "'") { q = c; dolu = true; tirnakli = true; } else { cur += c; dolu = true; }
  }
  komutBitir();
  return sonuc;
}

// Argüman beynim/ ya da gunluk/ yol parçası içeriyor mu (çıplak klasör adı dahil)?
function korunanYol(arg) {
  return String(arg).replace(/\\/gu, '/').split(/[/=]/u).some(p => KORUNAN_PARCALAR.has(p.toLowerCase()));
}

function degiskenAc(metin, degiskenler) {
  return metin.replace(/\$\{?([A-Za-z_]\w*)\}?/gu, (tam, ad) => degiskenler[ad] ?? tam);
}

function bayrakMi(arg) {
  return /^-[A-Za-z-]/u.test(arg);
}

// Kopyalama komutunda yalnız hedef korunur; korunan klasörden kopyalamak serbesttir.
function hedefKorunuyor(fiil, args) {
  if (fiil === 'dd') return args.some(a => /^of=/iu.test(a) && korunanYol(a));
  const acik = [];
  args.forEach((a, i) => {
    if (/^-(?:destination|t)$/iu.test(a) || a === '--target-directory') acik.push(args[i + 1] ?? '');
    else if (/^--target-directory=/u.test(a) || /^-destination[:=]/iu.test(a)) acik.push(a.slice(a.search(/[:=]/u) + 1));
  });
  if (acik.length) return acik.some(korunanYol);
  const konumsal = args.filter(a => !bayrakMi(a));
  return konumsal.length > 0 && korunanYol(konumsal[konumsal.length - 1]);
}

function basitKomutKarari(fiilHam, args, durum) {
  const fiil = fiilHam.replace(/^.*[\\/]/u, '').toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/u, '');
  if (KABUKLAR.has(fiil)) {
    const i = args.findIndex(a => /^-[a-z]*c$/iu.test(a) || /^-command$/iu.test(a) || /^\/[ck]$/iu.test(a));
    return i >= 0 ? kabukMetniKarari(args.slice(i + 1).join(' ')) : null;
  }
  if (DIZIN_DEGISTIR.has(fiil)) {
    if (args.some(korunanYol)) durum.icerde = true;
    else if (args.length) durum.icerde = false;
    return null;
  }
  const hedefte = args.some(korunanYol);
  // `cd beynim && rm -f *.md`: korunan klasöre girildiyse sonraki yıkıcı komut oraya etki eder.
  const kosul = hedefte || durum.icerde;
  if (YIKICI.has(fiil)) {
    if (fiil === 'out-file' && args.some(a => /^-append$/iu.test(a))) return null;
    return kosul ? RET(NEDEN.kabuk) : null;
  }
  if (KOPYALA.has(fiil)) return hedefKorunuyor(fiil, args) ? RET(NEDEN.kabuk) : null;
  if (fiil === 'git') {
    const alt = [];
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === '-C' || args[i] === '-c') { i += 1; continue; }
      alt.push(args[i]);
    }
    const [komutAdi, ...geri] = alt;
    if (!GIT_YIKICI.has(komutAdi)) return null;
    return geri.some(korunanYol) || durum.icerde ? RET(NEDEN.kabuk) : null;
  }
  if (fiil === 'sed') {
    const yerinde = args.some(a => /^-[A-Za-z]*i/u.test(a) || a.startsWith('--in-place'));
    return yerinde && kosul ? RET(NEDEN.kabuk) : null;
  }
  if (fiil === 'tee') {
    const ekle = args.some(a => a === '-a' || a === '--append');
    return !ekle && kosul ? RET(NEDEN.kabuk) : null;
  }
  if (fiil === 'find') {
    const yikici = args.some(a => ['-delete', '-exec', '-execdir', '-ok', '-okdir'].includes(a));
    return yikici && hedefte ? RET(NEDEN.kabuk) : null;
  }
  return null;
}

function kabukMetniKarari(komut) {
  const durum = { icerde: false };
  const degiskenler = {};
  for (const { jetonlar, yonler } of komutlaraBol(komut)) {
    const degerler = jetonlar.map(j => j.v);
    let i = 0;
    while (i < degerler.length && /^[A-Za-z_]\w*=/u.test(degerler[i])) {
      const ayrac = degerler[i].indexOf('=');
      degiskenler[degerler[i].slice(0, ayrac)] = degiskenAc(degerler[i].slice(ayrac + 1), degiskenler);
      i += 1;
    }
    for (const hedef of yonler) {
      if (korunanYol(degiskenAc(hedef, degiskenler))) return RET(NEDEN.kabuk);
    }
    while (i < degerler.length && SARMALAYICI.has(degerler[i].toLowerCase())) {
      i += 1;
      while (i < degerler.length && bayrakMi(degerler[i])) i += 1;
    }
    if (i >= degerler.length) continue;
    const ret = basitKomutKarari(degerler[i], degerler.slice(i + 1).map(a => degiskenAc(a, degiskenler)), durum);
    if (ret) return ret;
  }
  return null;
}

function kabukKarari(kok, komut) {
  if (komut.includes('*** Begin Patch')) return yamaKarari(kok, komut);
  return kabukMetniKarari(komut) ?? IZIN;
}

export function korumaKarari(kok, { aracAdi, girdi } = {}) {
  try {
    if (typeof kok !== 'string' || !kok || !girdi || typeof girdi !== 'object') return IZIN;
    if (tercihleriOku(kok).koruma === false) return IZIN;
    const komut = Array.isArray(girdi.command) ? girdi.command.filter(p => typeof p === 'string').join(' ')
      : girdi.command ?? girdi.cmd;
    if (typeof komut === 'string') return kabukKarari(kok, komut);
    if (aracAdi === 'apply_patch' && typeof girdi.input === 'string') return yamaKarari(kok, girdi.input);
    return dosyaKarari(kok, aracAdi, girdi);
  } catch {
    return IZIN;
  }
}
