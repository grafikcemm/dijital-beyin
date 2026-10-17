// Şerit B testleri için sahte kurulu kasa ve paket üreticisi. Örnek kişi: Elif.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

export const sha = veri => createHash('sha256').update(veri).digest('hex');

function yaz(kok, rel, icerik) {
  const tam = join(kok, ...rel.split('/'));
  mkdirSync(dirname(tam), { recursive: true });
  writeFileSync(tam, icerik);
}

// Sahte başlatıcı: `doktor --json` gibi davranır. `doktorCikti` stdout'a yazılır.
// Her çağrıyı "<sürüm> <argümanlar>" olarak .beyin/durum/cagrilar.log'a ekler (testler
// hangi sürümün `onar`ının çalıştığını görebilsin; özet yardımcıları bu dosyayı saymaz).
export function sistemDosyalari(surum, { cliCikis = 0, doktorCikti, ek = {} } = {}) {
  const cikti = doktorCikti ?? JSON.stringify({ saglikli: cliCikis === 0, kontroller: [] });
  const kayit = [
    "import { appendFileSync, mkdirSync } from 'node:fs';",
    "import { dirname, join } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "const d = join(dirname(fileURLToPath(import.meta.url)), '.beyin', 'durum');",
    `try { mkdirSync(d, { recursive: true }); appendFileSync(join(d, 'cagrilar.log'), ${JSON.stringify(`${surum} `)} + process.argv.slice(2).join(' ') + '\\n'); } catch { /* kayıt isteğe bağlı */ }`,
  ].join('\n');
  return {
    'beyin.mjs': `// başlatıcı ${surum}\n${kayit}\nprocess.stdout.write(${JSON.stringify(cikti)});\nprocess.exitCode = ${cliCikis};\n`,
    'sistem/cli.mjs': `// sahte cli ${surum}\nexport async function main() { return 0; }\n`,
    'sistem/surum.json': `${JSON.stringify({ surum, repo: 'elif/dijital-beyin', paket_sema: 'dijital-beyin.paket/v1' })}\n`,
    'sistem/lib/x.mjs': `export const x = '${surum}';\n`,
    ...ek,
  };
}

function yonetilenleriTopla(kok) {
  const out = {};
  const gez = rel => {
    for (const g of readdirSync(join(kok, ...rel.split('/')), { withFileTypes: true })) {
      const alt = `${rel}/${g.name}`;
      if (g.isDirectory()) gez(alt);
      else out[alt] = sha(readFileSync(join(kok, ...alt.split('/'))));
    }
  };
  gez('sistem');
  try { out['beyin.mjs'] = sha(readFileSync(join(kok, 'beyin.mjs'))); } catch { /* yok */ }
  return out;
}

export function manifestYazSahte(kok, { istemciler = ['claude'] } = {}) {
  const surum = JSON.parse(readFileSync(join(kok, 'sistem', 'surum.json'), 'utf8')).surum;
  const manifest = {
    sema: 'dijital-beyin.kurulum/v1',
    surum,
    repo: 'elif/dijital-beyin',
    istemciler,
    kuruldu: '2026-10-01T09:00:00.000Z',
    guncellendi: '2026-10-01T09:00:00.000Z',
    dosyalar: yonetilenleriTopla(kok),
  };
  yaz(kok, '.beyin/kurulum.json', `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export const KULLANICI_DOSYALARI = {
  'beynim/ben-kimim.md': '---\ndate: 2026-10-01\n---\n# Ben kimim\nElif, illüstratör.\n',
  'beynim/guncel-durum.md': '# Güncel durum\nKitap kapağı üzerinde çalışıyorum.\n',
  'notlar/fikir.md': 'Şu fikir: ğüşiöç\n',
  'gelen-kutusu/not.md': 'gelen\n',
  'gunluk/2026-10-15.md': '# 2026-10-15\n<!-- oturum:abc -->\nözet\n<!-- /oturum:abc -->\n',
  'CLAUDE.md': '# Elif\n<!-- dijital-beyin:basla -->\nblok\n<!-- dijital-beyin:bitir -->\n',
  'AGENTS.md': '# Elif\n<!-- dijital-beyin:basla -->\nblok\n<!-- dijital-beyin:bitir -->\n',
  '.gitignore': '.beyin/durum/\n',
  '.beyin/tercihler.json': '{\n  "baglam_karakter": 5000\n}\n',
};

export function geciciKlasor() {
  return mkdtempSync(join(tmpdir(), 'Dijital Beyin Ğüşİ-'));
}

export function cagrilar(kok) {
  try {
    return readFileSync(join(kok, '.beyin', 'durum', 'cagrilar.log'), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function kasaKur({ surum = '1.0.0', ek = {}, istemciler = ['claude'], kullanici = KULLANICI_DOSYALARI, sistem = {} } = {}) {
  const kok = geciciKlasor();
  for (const [rel, icerik] of Object.entries(sistemDosyalari(surum, { ...sistem, ek }))) yaz(kok, rel, icerik);
  for (const [rel, icerik] of Object.entries(kullanici)) yaz(kok, rel, icerik);
  manifestYazSahte(kok, { istemciler });
  return kok;
}

export function kaldir(kok) {
  rmSync(kok, { recursive: true, force: true });
}

export function paketYap(surum, dosyalar, { degistir } = {}) {
  let paket = {
    sema: 'dijital-beyin.paket/v1',
    surum,
    olusturuldu: '2026-10-17T00:00:00.000Z',
    min_node: '20',
    dosyalar: Object.keys(dosyalar).sort().map(yol => {
      const icerik = Buffer.from(dosyalar[yol]);
      return { yol, sha256: sha(icerik), icerik_b64: icerik.toString('base64') };
    }),
  };
  if (degistir) paket = degistir(paket) ?? paket;
  const buffer = Buffer.from(JSON.stringify(paket));
  return { paket, buffer, sha: sha(buffer) };
}

// Kullanıcıya ait her dosyanın özeti: yönetilen yollar ve .beyin/ durumu hariç,
// ama .beyin/tercihler.json dahil.
export function kullaniciOzeti(kok) {
  const out = {};
  const gez = rel => {
    const tam = rel ? join(kok, ...rel.split('/')) : kok;
    for (const g of readdirSync(tam, { withFileTypes: true })) {
      const alt = rel ? `${rel}/${g.name}` : g.name;
      if (alt === 'sistem' || alt === 'beyin.mjs') continue;
      if (alt === '.beyin') {
        try { out['.beyin/tercihler.json'] = sha(readFileSync(join(kok, '.beyin', 'tercihler.json'))); } catch { /* yok */ }
        continue;
      }
      if (g.isDirectory()) gez(alt);
      else out[alt] = sha(readFileSync(join(kok, ...alt.split('/'))));
    }
  };
  gez('');
  return out;
}

// Yönetilen dosyalar + manifest baytları.
export function yonetilenOzeti(kok) {
  return { ...yonetilenleriTopla(kok), '.beyin/kurulum.json': sha(readFileSync(join(kok, '.beyin', 'kurulum.json'))) };
}
