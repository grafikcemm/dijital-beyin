#!/usr/bin/env node
// Tek kanca girişi: node sistem/kanca.mjs <claude|codex> <olay>
// Kural: oturumu asla bloklama. Ağ yok, model yok; hata olursa günlüğe yaz ve 0 ile çık.
// Tek istisna koruma kancasının bilinçli "deny" kararı.
import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// lib modülleri dinamik yüklenir: yarıda kalmış bir güncellemede eski ve yeni dosyalar
// karışık olabilir; statik içe aktarma o durumda kancayı daha başlamadan çökertir.
let hataKaydet = () => {};

const ISTEMCILER = new Set(['claude', 'codex']);
const OLAYLAR = new Set(['baslangic', 'bitis', 'sikistirma', 'durdur', 'koruma']);

function stdinOku({ sinir = 1_000_000, zamanAsimi = 2000 } = {}) {
  return new Promise(resolve => {
    if (process.stdin.isTTY) { resolve(''); return; }
    const parcalar = [];
    let boyut = 0;
    const bitir = () => resolve(Buffer.concat(parcalar).toString('utf8'));
    const zamanlayici = setTimeout(() => { process.stdin.pause(); bitir(); }, zamanAsimi);
    process.stdin.on('data', parca => {
      boyut += parca.length;
      if (boyut <= sinir) parcalar.push(parca);
    });
    process.stdin.on('end', () => { clearTimeout(zamanlayici); bitir(); });
    process.stdin.on('error', () => { clearTimeout(zamanlayici); bitir(); });
  });
}

function yaz(nesne) {
  process.stdout.write(`${JSON.stringify(nesne)}\n`);
}

function arkaPlanKontrolBaslat(kok) {
  const giris = join(kok, 'beyin.mjs');
  if (!existsSync(giris)) return;
  const child = spawn(process.execPath, [giris, 'arka-plan-kontrol'], {
    cwd: kok,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, BEYIN_IC_CAGRI: '1' },
  });
  child.on('error', () => {});
  child.unref();
}

async function baslangic(kok, istemci) {
  const { baglamOlustur } = await import('./lib/baglam.mjs');
  let metin = baglamOlustur(kok, {});
  try {
    const { guncellemeBildirimi, kontrolZamaniMi } = await import('./lib/guncelle.mjs');
    const { tercihleriOku } = await import('./lib/tercihler.mjs');
    const bildirim = guncellemeBildirimi(kok);
    if (bildirim) metin = `${metin}\n\n${bildirim}`;
    // Bildirim kapalıysa GitHub'a hiç sorulmaz: kancanın tek ağ çağrısı budur.
    if (tercihleriOku(kok).guncelleme_bildirimi && kontrolZamaniMi(kok, new Date())) arkaPlanKontrolBaslat(kok);
  } catch (error) {
    hataKaydet(kok, `${istemci}:guncelleme-bildirimi`, error);
  }
  if (metin) {
    yaz({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: metin } });
  }
}

async function yakala(kok, istemci, olay, girdi) {
  const { oturumuYakala } = await import('./lib/yakala.mjs');
  // oturumuYakala hatalarını kendisi günlüğe yazar ve asla fırlatmaz.
  oturumuYakala(kok, {
    istemci,
    oturumId: girdi.session_id,
    transkriptYolu: girdi.transcript_path,
    olay,
  });
}

async function koruma(kok, girdi) {
  const { korumaKarari } = await import('./lib/koruma.mjs');
  const karar = korumaKarari(kok, { aracAdi: girdi.tool_name, girdi: girdi.tool_input ?? {} });
  if (karar && karar.izin === false) {
    yaz({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: String(karar.neden ?? 'Dijital Beyin koruması bu işlemi engelledi.'),
      },
    });
  }
}

export async function kancaCalistir(argv, girdiMetni) {
  const [istemci, olay] = argv;
  if (process.env.BEYIN_IC_CAGRI === '1') return 0;
  if (!ISTEMCILER.has(istemci) || !OLAYLAR.has(olay)) return 0;
  // Güncelleme sürüyor ya da yarıda kaldıysa dokunma; başlatıcı bir sonraki komutta onarır.
  if (existsSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.beyin', 'durum', 'guncelleme-suruyor.json'))) return 0;
  let kokBul;
  try {
    const yol = await import('./lib/yol.mjs');
    ({ kokBul } = yol);
    hataKaydet = yol.hataKaydet;
  } catch { return 0; }
  let girdi = {};
  try {
    const parsed = JSON.parse(girdiMetni || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) girdi = parsed;
  } catch { /* bozuk girdi: boş kabul et */ }
  const kok = kokBul(typeof girdi.cwd === 'string' && girdi.cwd ? girdi.cwd : process.cwd());
  if (!kok) return 0;
  try {
    if (olay === 'baslangic') await baslangic(kok, istemci);
    else if (olay === 'koruma') await koruma(kok, girdi);
    else await yakala(kok, istemci, olay, girdi);
  } catch (error) {
    hataKaydet(kok, `${istemci}:${olay}`, error);
  }
  return 0;
}

// Node ana modülün symlink'ini çözer (macOS'ta /var → /private/var, Windows'ta junction);
// argv[1] ise çözülmemiş kalır. İkisi de gerçek yola çevrilmeden karşılaştırılırsa kanca sessizce ölür.
const gercekYol = yol => { try { return realpathSync(yol); } catch { return resolve(yol); } };
const buDosya = gercekYol(fileURLToPath(import.meta.url));
const calisan = process.argv[1] ? gercekYol(process.argv[1]) : '';
const dogrudanCalisti = process.platform === 'win32'
  ? buDosya.toLowerCase() === calisan.toLowerCase()
  : buDosya === calisan;
if (dogrudanCalisti) {
  const metin = await stdinOku();
  process.exitCode = await kancaCalistir(process.argv.slice(2), metin);
}
