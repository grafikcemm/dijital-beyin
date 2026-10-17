import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ozyinelemeliKopyala } from '../sistem/lib/yol.mjs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paketOlustur } from '../arac/paketle.mjs';
import { paketiDogrula } from '../sistem/lib/guncelle.mjs';
import { geciciKlasor, kaldir } from './fixtures/b-yardimci/kasa.mjs';

const DEPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ZAMAN = '2026-10-17T00:00:00.000Z';

// Canlı ağaçta başka şeritler hâlâ dosya yazıyor olabilir; paketi sabit bir kopyadan üret.
function kaynakKopyasi() {
  const kok = geciciKlasor();
  const atla = kaynak => !/\.tmp$/iu.test(basename(kaynak));
  ozyinelemeliKopyala(join(DEPO, 'sistem'), join(kok, 'sistem'), { filtre: atla });
  ozyinelemeliKopyala(join(DEPO, 'arac'), join(kok, 'arac'), { filtre: atla });
  ozyinelemeliKopyala(join(DEPO, 'beyin.mjs'), join(kok, 'beyin.mjs'));
  ozyinelemeliKopyala(join(DEPO, 'package.json'), join(kok, 'package.json'));
  if (!existsSync(join(kok, 'sistem', 'cli.mjs'))) {
    writeFileSync(join(kok, 'sistem', 'cli.mjs'), 'export async function main() { return 0; }\n');
  }
  return kok;
}

test('paketOlustur: aynı girdi iki kez aynı sha256; paketiDogrula ile gidiş-dönüş', () => {
  const kok = kaynakKopyasi();
  try {
    mkdirSync(join(kok, 'sistem', 'lib', 'alt'), { recursive: true });
    writeFileSync(join(kok, 'sistem', 'lib', 'alt', 'yarim.mjs.123.tmp'), 'yarım');
    writeFileSync(join(kok, 'sistem', '.DS_Store'), 'mac');
    const birinci = paketOlustur(kok, { olusturuldu: ZAMAN });
    const ikinci = paketOlustur(kok, { olusturuldu: ZAMAN });
    assert.equal(birinci.sha, ikinci.sha);
    assert.equal(birinci.json, ikinci.json);

    const yollar = birinci.paket.dosyalar.map(d => d.yol);
    assert.deepEqual(yollar, [...yollar].sort());
    assert.ok(yollar.every(yol => !yol.includes('\\')));
    assert.ok(yollar.includes('beyin.mjs'));
    assert.ok(yollar.includes('sistem/surum.json'));
    assert.ok(yollar.includes('sistem/lib/yol.mjs'));
    assert.ok(!yollar.some(yol => yol.endsWith('.tmp') || yol.endsWith('.DS_Store')));

    const surum = JSON.parse(readFileSync(join(kok, 'sistem', 'surum.json'), 'utf8')).surum;
    const dogrulanan = paketiDogrula(Buffer.from(birinci.json), birinci.sha);
    assert.equal(dogrulanan.surum, surum);
    assert.equal(dogrulanan.olusturuldu, ZAMAN);
    assert.equal(dogrulanan.min_node, '20');
    assert.deepEqual(Object.keys(dogrulanan), ['sema', 'surum', 'olusturuldu', 'min_node', 'dosyalar']);
  } finally {
    kaldir(kok);
  }
});

test('paketOlustur: package.json sürümü farklıysa reddeder', () => {
  const kok = kaynakKopyasi();
  try {
    const paketJson = JSON.parse(readFileSync(join(kok, 'package.json'), 'utf8'));
    writeFileSync(join(kok, 'package.json'), JSON.stringify({ ...paketJson, version: '9.9.9' }));
    assert.throws(() => paketOlustur(kok, { olusturuldu: ZAMAN }), /surum_uyusmuyor/u);
  } finally {
    kaldir(kok);
  }
});

test('arac/paketle.mjs komutu: dist çıktısı, sha dosyası biçimi ve sürüm uyuşmazlığında çıkış 1', () => {
  const kok = kaynakKopyasi();
  try {
    const surum = JSON.parse(readFileSync(join(kok, 'sistem', 'surum.json'), 'utf8')).surum;
    const cikti = join(kok, 'çıktı klasörü');
    const ortam = { ...process.env, SOURCE_DATE_EPOCH: '1760659200' };
    const calistir = () => spawnSync(process.execPath, [join(kok, 'arac', 'paketle.mjs'), '--cikti', cikti], {
      cwd: kok, env: ortam, encoding: 'utf8', windowsHide: true,
    });
    const ilk = calistir();
    assert.equal(ilk.status, 0, ilk.stderr);
    const ad = `beyin-paket-${surum}.json`;
    const json = readFileSync(join(cikti, ad));
    const shaMetni = readFileSync(join(cikti, `${ad}.sha256`), 'utf8');
    assert.match(shaMetni, new RegExp(`^[0-9a-f]{64}  ${ad.replace(/\./gu, '\\.')}\\n$`, 'u'));
    const paket = paketiDogrula(json, shaMetni.slice(0, 64));
    assert.equal(paket.olusturuldu, new Date(1760659200 * 1000).toISOString());

    const ikinci = calistir();
    assert.equal(ikinci.status, 0, ikinci.stderr);
    assert.equal(readFileSync(join(cikti, `${ad}.sha256`), 'utf8'), shaMetni);

    const paketJson = JSON.parse(readFileSync(join(kok, 'package.json'), 'utf8'));
    writeFileSync(join(kok, 'package.json'), JSON.stringify({ ...paketJson, version: '9.9.9' }));
    const kotu = calistir();
    assert.equal(kotu.status, 1);
    assert.match(kotu.stderr, /sürüm/u);
  } finally {
    kaldir(kok);
  }
});
