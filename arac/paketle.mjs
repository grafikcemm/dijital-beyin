#!/usr/bin/env node
// Sürüm paketi üretir: node arac/paketle.mjs [--cikti dist]
// Çıktı: dist/beyin-paket-<sürüm>.json ve dist/beyin-paket-<sürüm>.json.sha256
// Paket deterministiktir: sıralı yollar, '/' ayraç, sabit "olusturuldu".
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomikYaz, sha256, yonetilenYolMu } from '../sistem/lib/yol.mjs';
import { PAKET_SEMA, PAKET_SINIR_BAYT } from '../sistem/lib/guncelle.mjs';

const ATLANANLAR = [/\.tmp$/iu, /^\.DS_Store$/u];

function atlanirMi(ad) {
  return ATLANANLAR.some(desen => desen.test(ad));
}

function dosyalariTopla(kok, rel, out) {
  const tam = join(kok, ...rel.split('/'));
  for (const giris of readdirSync(tam, { withFileTypes: true })) {
    if (atlanirMi(giris.name)) continue;
    const altRel = `${rel}/${giris.name}`;
    const bilgi = lstatSync(join(tam, giris.name));
    if (bilgi.isSymbolicLink()) continue;
    if (bilgi.isDirectory()) dosyalariTopla(kok, altRel, out);
    else if (bilgi.isFile()) out.push(altRel);
  }
  return out;
}

function minNode(paketJson) {
  const motor = String(paketJson?.engines?.node ?? '');
  const eslesme = /(\d+)/u.exec(motor);
  return eslesme ? eslesme[1] : '20';
}

export function paketOlustur(kaynakKok, { olusturuldu } = {}) {
  const kok = resolve(kaynakKok);
  const surumBilgisi = JSON.parse(readFileSync(join(kok, 'sistem', 'surum.json'), 'utf8'));
  const surum = surumBilgisi?.surum;
  if (typeof surum !== 'string' || !surum) throw new Error('surum_gecersiz');
  let paketJson = null;
  try {
    paketJson = JSON.parse(readFileSync(join(kok, 'package.json'), 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (paketJson && paketJson.version !== surum) throw new Error('surum_uyusmuyor');
  const zaman = olusturuldu ?? new Date().toISOString();
  if (typeof zaman !== 'string' || Number.isNaN(Date.parse(zaman))) throw new Error('olusturuldu_gecersiz');

  const yollarListesi = [...dosyalariTopla(kok, 'sistem', []), 'beyin.mjs']
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const dosyalar = yollarListesi.map(yol => {
    if (!yonetilenYolMu(yol)) throw new Error(`yol_reddedildi: ${yol}`);
    const icerik = readFileSync(join(kok, ...yol.split('/')));
    return { yol, sha256: sha256(icerik), icerik_b64: icerik.toString('base64') };
  });
  const paket = {
    sema: PAKET_SEMA,
    surum,
    olusturuldu: zaman,
    min_node: minNode(paketJson),
    dosyalar,
  };
  const json = `${JSON.stringify(paket)}\n`;
  if (Buffer.byteLength(json) > PAKET_SINIR_BAYT) throw new Error('paket_cok_buyuk');
  return { paket, json, sha: sha256(json) };
}

function olusturulmaZamani(kok) {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/u.test(epoch)) return new Date(Number(epoch) * 1000).toISOString();
  try {
    const cikti = execFileSync('git', ['log', '-1', '--format=%ct'], {
      cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    }).trim();
    if (/^\d+$/u.test(cikti)) return new Date(Number(cikti) * 1000).toISOString();
  } catch { /* git yok ya da henüz commit yok */ }
  return new Date().toISOString();
}

export function main(argv = process.argv.slice(2)) {
  const kok = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let cikti = join(kok, 'dist');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--cikti' && argv[i + 1]) {
      cikti = resolve(argv[i + 1]);
      i += 1;
    } else {
      process.stderr.write(`Bilinmeyen seçenek: ${argv[i]}\nKullanım: node arac/paketle.mjs [--cikti dist]\n`);
      return 1;
    }
  }
  try {
    const { paket, json, sha } = paketOlustur(kok, { olusturuldu: olusturulmaZamani(kok) });
    const ad = `beyin-paket-${paket.surum}.json`;
    atomikYaz(join(cikti, ad), json);
    atomikYaz(join(cikti, `${ad}.sha256`), `${sha}  ${ad}\n`);
    process.stdout.write(`${join(cikti, ad)} (${paket.dosyalar.length} dosya, sha256 ${sha})\n`);
    return 0;
  } catch (error) {
    if (error?.message === 'surum_uyusmuyor') {
      process.stderr.write('sistem/surum.json ile package.json sürümleri aynı değil.\n');
    } else {
      process.stderr.write(`Paket oluşturulamadı: ${error?.message ?? error}\n`);
    }
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
