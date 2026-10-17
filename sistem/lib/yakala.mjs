// Modelsiz oturum yakalama: Claude Code / Codex JSONL'ünden gunluk/ bloğu.
// Kanca içinde çalışır: ağ yok, model yok, oturumuYakala asla fırlatmaz.
import {
  closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync, unlinkSync,
} from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { sirlariGizle } from './gizlilik.mjs';
import { tercihleriOku } from './tercihler.mjs';
import { atomikYaz, hataKaydet, kilitAl, yerelTarih, yollar } from './yol.mjs';

const OTURUM_ID = /^[A-Za-z0-9._-]{1,128}$/u;
const ISTEK_SINIR = 400;
const SONUC_SINIR = 600;
const DOSYA_SINIR = 8;
const PENCERE_BAYT = 8_000_000;
const SATIR_SINIR_BAYT = 4_000_000; // tarama için tek satır üst sınırı (bellek tavanı)
const KILIT_DENEME = 12;
const KILIT_BEKLEME_MS = 120; // toplam en çok ~1,3 sn; kanca zaman aşımı 10 sn

// Ajanın eklediği, insanın yazmadığı sarmalayıcılar.
const SARMALAYICI_ONEKLERI = [
  '<command-name>', '<command-message>', '<command-args>', '<command-contents>',
  '<local-command-stdout>', '<local-command-stderr>', '<local-command-caveat>',
  '<bash-input>', '<bash-stdout>', '<bash-stderr>', '<user-prompt-submit-hook>',
  '<ide_selection>', '<ide_opened_file>', '<environment_context>', '<user_instructions>',
  '<permissions instructions>', '<turn_aborted>', '<task-notification>', '<system-reminder>',
  '# AGENTS.md', '[Request interrupted', 'No response requested.',
];
const GENEL_SARMALAYICI = /^<[a-z]+[-_][a-z0-9_-]*(?:\s[^>]*)?>/u;

const KAYDETME = [
  /\[kaydetme\]/iu,
  /\[no[-_ ]?save\]/iu,
  /(?<![\p{L}\p{N}_])(?:bunu|şunu|bu\s+(?:konuşmayı|sohbeti|mesajı|oturumu))\s+(?:kaydetme|hatırlama|hafızaya\s+alma)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:hafızana|hafızaya|beynime|beyne)\s+(?:kaydetme|alma|ekleme)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:do\s+not|don't|dont)\s+(?:save|retain|remember|record)\s+this(?:\s+(?:conversation|chat|session|message))?(?![\p{L}\p{N}_])/iu,
];

function kayit(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function temizle(ham) {
  if (typeof ham !== 'string') return '';
  let text = ham.replace(/\r\n?/gu, '\n');
  text = text.replace(/<system-reminder>[\s\S]*?(?:<\/system-reminder>|$)/gu, '');
  text = text.split('\n').filter(line => !/^\s*Caveat:/u.test(line)).join('\n').trim();
  if (!text) return '';
  if (SARMALAYICI_ONEKLERI.some(onek => text.startsWith(onek)) || GENEL_SARMALAYICI.test(text)) return '';
  return text;
}

function dosyaTopla(hedef, girdi) {
  const input = kayit(girdi);
  if (input) {
    for (const key of ['file_path', 'path', 'notebook_path']) {
      if (typeof input[key] === 'string' && input[key].trim()) hedef.push(input[key].trim());
    }
  }
  // Codex apply_patch: yama metnindeki dosya başlıkları.
  const komut = Array.isArray(input?.command) ? input.command.filter(p => typeof p === 'string').join('\n')
    : input?.command ?? input?.cmd ?? input?.input;
  const metin = typeof girdi === 'string' ? girdi : typeof komut === 'string' ? komut : '';
  if (metin && metin.includes('*** ')) {
    for (const m of metin.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gmu)) hedef.push(m[1].trim());
  }
}

function argumanAyristir(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function sonunuOku(dosya, sinirBayt) {
  const boyut = statSync(dosya).size;
  const sinir = Number.isFinite(sinirBayt) && sinirBayt > 0 ? Math.floor(sinirBayt) : PENCERE_BAYT;
  if (boyut <= sinir) return readFileSync(dosya, 'utf8');
  const fd = openSync(dosya, 'r');
  try {
    const buffer = Buffer.alloc(sinir);
    const okunan = readSync(fd, buffer, 0, sinir, boyut - sinir);
    const text = buffer.subarray(0, okunan).toString('utf8');
    const ilk = text.indexOf('\n');
    return ilk < 0 ? '' : text.slice(ilk + 1); // yarım kalan ilk satır atılır
  } finally {
    closeSync(fd);
  }
}

function claudeIcerik(content, rol, dosyalar) {
  if (typeof content === 'string') return temizle(content);
  if (!Array.isArray(content)) return '';
  const parcalar = [];
  for (const block of content) {
    const b = kayit(block);
    if (!b) continue;
    if (b.type === 'text' && typeof b.text === 'string') {
      const text = rol === 'user' ? temizle(b.text) : b.text.trim();
      if (text) parcalar.push(text);
    } else if (b.type === 'tool_use' && rol === 'assistant') {
      dosyaTopla(dosyalar, b.input);
    }
  }
  return parcalar.join('\n').trim();
}

function codexIcerik(content, rol) {
  if (typeof content === 'string') return rol === 'user' ? temizle(content) : content.trim();
  if (!Array.isArray(content)) return '';
  const parcalar = [];
  for (const block of content) {
    const b = kayit(block);
    if (!b || typeof b.text !== 'string') continue;
    if (!['input_text', 'output_text', 'text', 'Text'].includes(b.type)) continue;
    const text = rol === 'user' ? temizle(b.text) : b.text.trim();
    if (text) parcalar.push(text);
  }
  return parcalar.join('\n').trim();
}

// Tek satırı {rol, metin, zaman} adayına çevirir; araç çağrısı dosyalarını toplar.
function satirCevir(row, dosyalar) {
  const zaman = typeof row.timestamp === 'string' ? row.timestamp : undefined;
  if (row.type === 'user' || row.type === 'assistant') {
    if (row.isMeta === true || row.isCompactSummary === true || row.isSidechain === true) return null;
    const message = kayit(row.message);
    if (!message) return null;
    if (row.type === 'assistant' && message.model === '<synthetic>') return null;
    const metin = claudeIcerik(message.content, row.type, dosyalar);
    return metin ? { rol: row.type, metin, zaman } : null;
  }
  const payload = kayit(row.payload);
  if (!payload) return null;
  if (row.type === 'response_item') {
    if (payload.type === 'message' && (payload.role === 'user' || payload.role === 'assistant')) {
      const metin = codexIcerik(payload.content, payload.role);
      return metin ? { rol: payload.role, metin, zaman } : null;
    }
    if (payload.type === 'function_call' || payload.type === 'custom_tool_call' || payload.type === 'local_shell_call') {
      dosyaTopla(dosyalar, argumanAyristir(payload.arguments ?? payload.input ?? payload.action));
    }
    return null;
  }
  if (row.type === 'event_msg') {
    if (payload.type === 'user_message' && typeof payload.message === 'string') {
      const metin = temizle(payload.message);
      return metin ? { rol: 'user', metin, zaman } : null;
    }
    if (payload.type === 'agent_message' && typeof payload.message === 'string') {
      const metin = payload.message.trim();
      return metin ? { rol: 'assistant', metin, zaman } : null;
    }
  }
  return null;
}

export function transkriptOku(dosya, { sinirBayt = PENCERE_BAYT } = {}) {
  const mesajlar = [];
  const dosyalar = [];
  Object.defineProperty(mesajlar, 'dosyalar', { value: dosyalar, enumerable: false });
  let ham;
  try { ham = sonunuOku(dosya, sinirBayt); } catch { return mesajlar; }
  // Codex aynı turu hem response_item hem event_msg olarak yazar: tur içinde çiftleri at.
  let sonKullanici = null;
  let turAsistanlari = new Set();
  for (const line of ham.split('\n')) {
    if (!line || line.charCodeAt(0) !== 123) continue; // '{'
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (!kayit(row)) continue;
    let aday;
    try { aday = satirCevir(row, dosyalar); } catch { aday = null; }
    if (!aday) continue;
    const anahtar = aday.metin.replace(/\s+/gu, ' ');
    if (aday.rol === 'user') {
      if (anahtar === sonKullanici) continue;
      sonKullanici = anahtar;
      turAsistanlari = new Set();
    } else {
      if (turAsistanlari.has(anahtar)) continue;
      turAsistanlari.add(anahtar);
    }
    const mesaj = { rol: aday.rol, metin: aday.metin };
    if (aday.zaman) mesaj.zaman = aday.zaman;
    mesajlar.push(mesaj);
  }
  return mesajlar;
}

// Pencere dışında kalan eski kısımda kullanıcının [kaydetme] isteğini arar; parça parça okur, bellek sınırlıdır.
export function tumDosyadaKaydetmeVarMi(dosya) {
  let fd;
  try {
    fd = openSync(dosya, 'r');
    const parca = Buffer.alloc(1_048_576);
    let kalan = Buffer.alloc(0);
    let atla = false; // aşırı uzun satırın geri kalanı
    const satiriDene = buf => {
      if (!buf.length || buf[0] !== 123) return false;
      const line = buf.toString('utf8');
      if (!KAYDETME.some(kalip => kalip.test(line))) return false; // ucuz ön süzgeç
      let row;
      try { row = JSON.parse(line); } catch { return false; }
      if (!kayit(row)) return false;
      let aday;
      try { aday = satirCevir(row, []); } catch { aday = null; }
      return aday?.rol === 'user' && KAYDETME.some(kalip => kalip.test(aday.metin));
    };
    for (;;) {
      const okunan = readSync(fd, parca, 0, parca.length, null);
      if (okunan <= 0) break;
      const veri = kalan.length ? Buffer.concat([kalan, parca.subarray(0, okunan)]) : Buffer.from(parca.subarray(0, okunan));
      kalan = Buffer.alloc(0);
      let bas = 0;
      for (let son = veri.indexOf(10, bas); son >= 0; son = veri.indexOf(10, bas)) {
        if (!atla && satiriDene(veri.subarray(bas, son))) return true;
        atla = false;
        bas = son + 1;
      }
      if (!atla) {
        const artan = veri.subarray(bas);
        if (artan.length > SATIR_SINIR_BAYT) atla = true;
        else kalan = Buffer.from(artan);
      }
    }
    return !atla && satiriDene(kalan);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function kaydetmeIstendiMi(mesajlar) {
  if (!Array.isArray(mesajlar)) return false;
  return mesajlar.some(m => m?.rol === 'user' && typeof m.metin === 'string'
    && KAYDETME.some(kalip => kalip.test(m.metin)));
}

// Önce tüm metin süzülür, sonra kesilir: kesilen bir anahtar asgari uzunluğun altında kalıp sızmasın.
function tekSatir(text, sinir) {
  const duz = sirlariGizle(String(text ?? '')).metin.replace(/\s+/gu, ' ').trim();
  return duz.length > sinir ? `${duz.slice(0, sinir - 1).trimEnd()}…` : duz;
}

function anlamliMi(text) {
  return /[\p{L}\p{N}]/u.test(String(text ?? ''));
}

export function ozetCikar(mesajlar) {
  const liste = Array.isArray(mesajlar) ? mesajlar : [];
  const kullanicilar = liste.filter(m => m?.rol === 'user' && typeof m.metin === 'string' && anlamliMi(m.metin));
  const asistanlar = liste.filter(m => m?.rol === 'assistant' && typeof m.metin === 'string' && anlamliMi(m.metin));
  const hamDosyalar = [
    ...(Array.isArray(liste.dosyalar) ? liste.dosyalar : []),
    ...liste.flatMap(m => (Array.isArray(m?.dosyalar) ? m.dosyalar : [])),
  ];
  const dosyalar = [];
  for (const d of hamDosyalar) {
    if (typeof d === 'string' && d && !dosyalar.includes(d)) dosyalar.push(d);
  }
  return {
    istek: kullanicilar.length ? tekSatir(kullanicilar[0].metin, ISTEK_SINIR) : '',
    sonuc: asistanlar.length ? tekSatir(asistanlar.at(-1).metin, SONUC_SINIR) : '',
    dosyalar,
    tur_sayisi: kullanicilar.length,
  };
}

function regexKacis(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function blokKalibi(id, cevre = false) {
  const govde = `<!-- oturum:${regexKacis(id)} -->[\\s\\S]*?<!-- /oturum:${regexKacis(id)} -->`;
  return new RegExp(cevre ? `\\n*${govde}\\n?` : govde, 'u');
}

// Blok sınırlarını bozacak HTML yorum işaretlerini etkisizleştirir.
function guvenliMetin(text) {
  return text.replace(/<!--/gu, '< !--').replace(/-->/gu, '-- >');
}

function dosyaGoreli(kok, yol) {
  const duz = yol.replace(/\\/gu, '/');
  if (!isAbsolute(yol) && !/^[A-Za-z]:\//u.test(duz)) return duz.replace(/^\.\//u, '');
  const fark = relative(kok, yol);
  if (fark && !fark.startsWith('..') && !isAbsolute(fark)) return fark.split(sep).join('/');
  return duz;
}

function bekle(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function kilitliCalis(kok, is, ad = '') {
  let birak = null;
  for (let deneme = 0; deneme < KILIT_DENEME && !birak; deneme += 1) {
    try {
      birak = kilitAl(kok, 'gunluk');
    } catch (error) {
      if (error?.message !== 'kilit_mesgul') throw error;
      if (deneme < KILIT_DENEME - 1) bekle(KILIT_BEKLEME_MS);
    }
  }
  if (!birak) {
    hataKaydet(kok, 'yakala', `kilit_mesgul: oturum ${ad} yakalanamadı`);
    return { durum: 'atlandi', neden: 'kilit_mesgul' };
  }
  try { return is(); } finally { birak(); }
}

function kaydetmeIsareti(kok, oturumId) {
  return join(yollar(kok).durum, 'kaydetme', `${oturumId}.isaret`);
}

// Bir oturum 30 günden uzun sürmez; daha eski vazgeçme işaretleri birikmesin diye silinir.
const ISARET_OMRU_MS = 30 * 24 * 60 * 60 * 1000;

function eskiIsaretleriTemizle(kok, an) {
  const dizin = join(yollar(kok).durum, 'kaydetme');
  let adlar;
  try { adlar = readdirSync(dizin); } catch { return; }
  for (const ad of adlar) {
    if (!ad.endsWith('.isaret')) continue;
    const yol = join(dizin, ad);
    try {
      if (an.getTime() - statSync(yol).mtimeMs > ISARET_OMRU_MS) unlinkSync(yol);
    } catch { /* başka süreç sildiyse sorun değil */ }
  }
}

function blokSil(dosya, id) {
  if (!existsSync(dosya)) return false;
  const mevcut = readFileSync(dosya, 'utf8');
  const kalip = blokKalibi(id, true);
  if (!kalip.test(mevcut)) return false;
  atomikYaz(dosya, mevcut.replace(kalip, () => '\n'));
  return true;
}

export function oturumuYakala(kok, { istemci, oturumId, transkriptYolu, olay, simdi } = {}) {
  void olay; // olay türü (bitis/sikistirma/durdur) çıktıyı değiştirmez
  try {
    if (typeof kok !== 'string' || !kok) return { durum: 'atlandi', neden: 'gecersiz_kasa' };
    if (tercihleriOku(kok).yakalama === false) return { durum: 'atlandi', neden: 'kapali' };
    if (typeof oturumId !== 'string' || !OTURUM_ID.test(oturumId)) {
      return { durum: 'atlandi', neden: 'gecersiz_oturum' };
    }
    let dosyaMi = false;
    try { dosyaMi = typeof transkriptYolu === 'string' && statSync(transkriptYolu).isFile(); } catch { dosyaMi = false; }
    if (!dosyaMi) return { durum: 'atlandi', neden: 'transkript_yok' };

    const an = simdi instanceof Date && !Number.isNaN(simdi.getTime()) ? simdi : new Date();
    const tarih = yerelTarih(an);
    const gunlukDir = yollar(kok).gunluk;
    const dosya = join(gunlukDir, `${tarih}.md`);
    const dun = yerelTarih(new Date(an.getFullYear(), an.getMonth(), an.getDate() - 1));
    const dunDosya = join(gunlukDir, `${dun}.md`);
    const isaret = kaydetmeIsareti(kok, oturumId);
    const mesajlar = transkriptOku(transkriptYolu);

    // Vazgeçme oturum başınadır ve kalıcıdır: istek 8 MB penceresinden çıksa da (Codex her turda koşar) blok geri gelmez.
    let vazgecildi = existsSync(isaret);
    if (!vazgecildi) {
      vazgecildi = kaydetmeIstendiMi(mesajlar)
        || (statSync(transkriptYolu).size > PENCERE_BAYT && tumDosyadaKaydetmeVarMi(transkriptYolu));
      if (vazgecildi) {
        atomikYaz(isaret, `${an.toISOString()}\n`);
        eskiIsaretleriTemizle(kok, an);
      }
    }
    if (vazgecildi) {
      return kilitliCalis(kok, () => {
        blokSil(dosya, oturumId);
        blokSil(dunDosya, oturumId);
        return { durum: 'atlandi', neden: 'kaydetme', dosya };
      }, oturumId);
    }

    const ozet = ozetCikar(mesajlar);
    if (!ozet.istek) return { durum: 'atlandi', neden: 'bos' };

    const goreliler = [];
    for (const d of ozet.dosyalar) {
      const g = dosyaGoreli(kok, d);
      if (g && !goreliler.includes(g)) goreliler.push(g);
      if (goreliler.length >= DOSYA_SINIR) break;
    }
    const gizle = text => guvenliMetin(sirlariGizle(text).metin);
    const istemciAdi = typeof istemci === 'string' && /^[a-z0-9-]{1,20}$/u.test(istemci) ? istemci : 'ajan';
    const pad = n => String(n).padStart(2, '0');
    const satirlar = [
      `<!-- oturum:${oturumId} -->`,
      `### ${pad(an.getHours())}:${pad(an.getMinutes())} · ${istemciAdi} · ${oturumId.slice(0, 8)}`,
      `- **İstek:** ${gizle(ozet.istek)}`,
      `- **Sonuç:** ${ozet.sonuc ? gizle(ozet.sonuc) : '(asistan yanıtı yok)'}`,
    ];
    if (goreliler.length) satirlar.push(`- **Dosyalar:** ${gizle(goreliler.join(', '))}`);
    satirlar.push(`_Modelsiz özet · ${ozet.tur_sayisi} tur_`, `<!-- /oturum:${oturumId} -->`);
    const blok = satirlar.join('\n');

    return kilitliCalis(kok, () => {
      const kalip = blokKalibi(oturumId);
      let hedef = dosya;
      let mevcut = existsSync(dosya) ? readFileSync(dosya, 'utf8') : `# Günlük — ${tarih}\n`;
      if (!kalip.test(mevcut) && existsSync(dunDosya)) {
        // Gece yarısını aşan oturum: blok dünün dosyasındaysa orada yenilenir, bugüne ikinci blok açılmaz.
        const dunMetni = readFileSync(dunDosya, 'utf8');
        if (kalip.test(dunMetni)) { hedef = dunDosya; mevcut = dunMetni; }
      }
      if (kalip.test(mevcut)) {
        mevcut = mevcut.replace(kalip, () => blok);
      } else {
        if (!mevcut.endsWith('\n')) mevcut += '\n';
        mevcut += `\n${blok}\n`;
      }
      atomikYaz(hedef, mevcut);
      return { durum: 'yakalandi', dosya: hedef };
    }, oturumId);
  } catch (error) {
    hataKaydet(kok, 'yakala', error);
    return { durum: 'atlandi', neden: 'hata' };
  }
}
