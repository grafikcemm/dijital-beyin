#!/usr/bin/env node
// Dijital Beyin başlatıcısı. Bu dosya sistem dosyasıdır; güncellemede yenilenir.
// sistem/ içinden hiçbir şey içe aktarmaz: güncelleme yarıda kalıp sistem/ karışık
// sürümde kaldıysa bile yedeği yalnız node:fs ile geri koyabilmelidir.
import {
  closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync,
  rmSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  process.stderr.write(`Dijital Beyin Node.js 20 veya üstünü ister; bu bilgisayarda ${process.versions.node} var.\n`);
  process.exit(1);
}
const kok = dirname(fileURLToPath(import.meta.url));

// Biçim sistem/lib/guncelle.mjs ile ortak: .beyin/durum/guncelleme-suruyor.json →
// {yedek: "<.beyin/yedek altındaki klasör adı>", eskiSurum, yeniSurum, islem?}.
function yarimGuncellemeyiKurtar() {
  const durum = join(kok, '.beyin', 'durum');
  const isaret = join(durum, 'guncelleme-suruyor.json');
  if (!existsSync(isaret)) return;
  const kilit = join(durum, 'guncelle.kilit');
  if (kilitCanliMi(kilit)) return; // güncelleme şu an başka bir süreçte sürüyor
  let veri = null;
  try { veri = JSON.parse(readFileSync(isaret, 'utf8')); } catch { /* bozuk işaret */ }
  const ad = typeof veri?.yedek === 'string' && /^[0-9A-Za-z][0-9A-Za-z._-]{0,99}$/u.test(veri.yedek) ? veri.yedek : null;
  const yedek = ad ? join(kok, '.beyin', 'yedek', ad) : null;
  let kayit = null;
  try { kayit = JSON.parse(readFileSync(join(yedek, 'yedek.json'), 'utf8')); } catch { /* yedek yok */ }
  if (!kayit || !Array.isArray(kayit.dosyalar) || !Array.isArray(kayit.olmayanlar)) {
    process.stderr.write(`Yarım kalmış bir güncelleme var ama yedeği bulunamadı. "node beyin.mjs guncelle --zorla" dene; olmazsa kurucuyu aynı klasöre yeniden çalıştır (node kur.mjs --hedef "${kok}"). Notlarına dokunulmaz.\n`);
    return;
  }
  const kilitAl = () => {
    const fd = openSync(kilit, 'wx');
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid, zaman: new Date().toISOString() })); } finally { closeSync(fd); }
  };
  try {
    kilitAl();
  } catch {
    if (kilitCanliMi(kilit)) return;
    try { unlinkSync(kilit); } catch { /* yok */ }
    try { kilitAl(); } catch { return; }
  }
  try {
    const yonetilen = rel => typeof rel === 'string' && !rel.includes('\\') && !rel.includes('\0')
      && (rel === 'beyin.mjs' || (rel.startsWith('sistem/') && rel.split('/').every(p => p && p !== '.' && p !== '..')));
    const dosyalar = kayit.dosyalar.filter(yonetilen);
    const olmayanlar = kayit.olmayanlar.filter(yonetilen);
    baglantiDenetle([...dosyalar, ...olmayanlar]);
    for (const rel of dosyalar) yaz(join(kok, ...rel.split('/')), readFileSync(join(yedek, 'dosyalar', ...rel.split('/'))));
    for (const rel of olmayanlar) {
      try { unlinkSync(join(kok, ...rel.split('/'))); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    }
    if (existsSync(join(yedek, 'kurulum.json'))) yaz(join(kok, '.beyin', 'kurulum.json'), readFileSync(join(yedek, 'kurulum.json')));
    unlinkSync(isaret);
    if (veri.islem !== 'geri-al') rmSync(yedek, { recursive: true, force: true });
    process.stderr.write(`Yarım kalan ${veri.islem === 'geri-al' ? 'geri alma tamamlandı' : 'güncelleme geri alındı'}: ${kayit.eskiSurum ?? 'önceki'} sürümü yerinde. Notlarına dokunulmadı. Kancaları tazelemek için: node beyin.mjs onar\n`);
  } catch (error) {
    process.stderr.write(`Yarım kalan güncelleme geri alınamadı (${error?.message ?? error}). Kurucuyu aynı klasöre yeniden çalıştır: node kur.mjs --hedef "${kok}". Notlarına dokunulmaz; yedek .beyin/yedek/ altında.\n`);
  } finally {
    try { unlinkSync(kilit); } catch { /* zaten yok */ }
  }
}

// Kilit dosyası taze (10 dk) ve sahibi süreç yaşıyorsa canlıdır. Öldürülmüş bir
// güncellemenin kilidi taze olsa da sahibi yaşamadığı için devralınır.
function kilitCanliMi(kilit) {
  let bilgi;
  try { bilgi = statSync(kilit); } catch { return false; }
  if (Date.now() - bilgi.mtimeMs >= 600_000) return false;
  let pid;
  try { pid = JSON.parse(readFileSync(kilit, 'utf8')).pid; } catch { return true; }
  if (!Number.isInteger(pid) || pid <= 0) return true;
  if (pid === process.pid) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}

// sistem/ ya da hedeflerin üst klasörü bağlantı/junction ise kasa dışına yazılmaz.
function baglantiDenetle(rels) {
  const gercekKok = realpathSync.native(kok);
  const dizinler = new Set([join(kok, 'sistem')]);
  for (const rel of rels) {
    const parcalar = rel.split('/');
    for (let i = 1; i < parcalar.length; i += 1) dizinler.add(join(kok, ...parcalar.slice(0, i)));
  }
  for (const dizin of dizinler) {
    let bilgi;
    try { bilgi = lstatSync(dizin); } catch { continue; }
    const fark = bilgi.isSymbolicLink() ? '..' : relative(gercekKok, realpathSync.native(dizin));
    if (fark.startsWith('..') || isAbsolute(fark)) throw new Error('sistem_baglanti_reddedildi');
  }
}

function yaz(dosya, icerik) {
  mkdirSync(dirname(dosya), { recursive: true });
  const gecici = `${dosya}.${process.pid}.kurtar.tmp`;
  writeFileSync(gecici, icerik);
  try { renameSync(gecici, dosya); } catch (error) { try { unlinkSync(gecici); } catch { /* yok */ } throw error; }
}

try { yarimGuncellemeyiKurtar(); } catch { /* başlatıcı asla burada düşmez */ }

const cli = join(kok, 'sistem', 'cli.mjs');
const { main } = await import(pathToFileURL(cli).href);
process.exitCode = await main(process.argv.slice(2));
