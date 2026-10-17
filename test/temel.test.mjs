import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { frontmatterAyir, gecersizMi, notTarihi } from '../sistem/lib/notlar.mjs';
import { tercihleriOku, tercihYaz } from '../sistem/lib/tercihler.mjs';
import {
  atomikYaz, guvenliYol, jsonOku, kilitAl, kokBul, yerelTarih, yonetilenYolMu,
} from '../sistem/lib/yol.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'Dijital Beyin Ğüşİ-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

function kasaYap(ad) {
  const kok = join(tmp, ad);
  mkdirSync(join(kok, '.beyin'), { recursive: true });
  writeFileSync(join(kok, '.beyin', 'kurulum.json'), '{}');
  return kok;
}

test('yönetilen yol izin listesi', () => {
  assert.equal(yonetilenYolMu('sistem/cli.mjs'), true);
  assert.equal(yonetilenYolMu('sistem/lib/yol.mjs'), true);
  assert.equal(yonetilenYolMu('beyin.mjs'), true);
  for (const kotu of ['beynim/ben-kimim.md', 'sistem', '../sistem/x', 'sistem/../beynim/x', '/sistem/x',
    'C:/sistem/x', 'sistem\\x', 'sistem//x', 'sistem/./x', '', '.beyin/kurulum.json', 'gunluk/a.md']) {
    assert.equal(yonetilenYolMu(kotu), false, kotu);
  }
});

test('güvenli yol kök dışına çıkmaz', () => {
  const kok = kasaYap('yol');
  assert.ok(guvenliYol(kok, 'beynim/a.md').startsWith(kok));
  assert.throws(() => guvenliYol(kok, '../a.md'), /yol_reddedildi/u);
  assert.throws(() => guvenliYol(kok, 'beynim/../../a.md'), /yol_reddedildi/u);
});

test('kasa kökü üst klasörlerde bulunur', () => {
  const kok = kasaYap('kok bul');
  mkdirSync(join(kok, 'beynim', 'alt'), { recursive: true });
  assert.equal(kokBul(join(kok, 'beynim', 'alt')), kok);
  assert.equal(kokBul(join(tmp, 'yok')), null);
});

test('atomik yazma ve JSON okuma', () => {
  const dosya = join(tmp, 'a', 'b', 'c.json');
  atomikYaz(dosya, '{"x":1}');
  assert.deepEqual(jsonOku(dosya, null), { x: 1 });
  writeFileSync(dosya, '\uFEFF{"x":2}');
  assert.deepEqual(jsonOku(dosya, null), { x: 2 });
  writeFileSync(dosya, '{bozuk');
  assert.equal(jsonOku(dosya, 'v'), 'v');
});

test('atomik yazma kalıcı hatada fırlatır ve geçici dosya bırakmaz', () => {
  // Hedef dolu bir klasör: rename her denemede başarısız olur (Windows'ta EPERM, yeniden
  // denenir; diğerlerinde EISDIR/ENOTEMPTY).
  const ust = join(tmp, 'atomik hata');
  const hedef = join(ust, 'klasor');
  mkdirSync(hedef, { recursive: true });
  writeFileSync(join(hedef, 'ic.txt'), 'x');
  assert.throws(() => atomikYaz(hedef, 'yeni'));
  assert.deepEqual(readdirSync(ust), ['klasor']);
  assert.equal(readFileSync(join(hedef, 'ic.txt'), 'utf8'), 'x');
});

test('kilit ikinci kez alınamaz, bırakılınca alınır', () => {
  const kok = kasaYap('kilit');
  const birak = kilitAl(kok, 'deneme');
  assert.throws(() => kilitAl(kok, 'deneme'), /kilit_mesgul/u);
  birak();
  kilitAl(kok, 'deneme')();
  const bayat = kilitAl(kok, 'bayat');
  // Dosya sistemi zaman damgası Date.now()'dan birkaç ms ileride olabilir; eşik geniş tutulur.
  assert.doesNotThrow(() => kilitAl(kok, 'bayat', { bayatMs: -60_000 })());
  bayat();
});

test('yerel tarih biçimi', () => {
  assert.equal(yerelTarih(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('frontmatter, tarih ve geçersiz satır', () => {
  const { veri, govde } = frontmatterAyir('---\ndate: 2026-10-16\nsupersedes:\n  - "beynim/eski.md"\ntitle: \'Başlık\'\n---\n# Gövde\n');
  assert.equal(veri.date, '2026-10-16');
  assert.deepEqual(veri.supersedes, ['beynim/eski.md']);
  assert.equal(veri.title, 'Başlık');
  assert.equal(govde, '# Gövde\n');
  assert.equal(notTarihi(veri).getDate(), 16);
  assert.equal(notTarihi({ date: '2026-02-31' }), null);
  assert.equal(notTarihi({}), null);
  assert.deepEqual(frontmatterAyir('# yok').veri, {});
  assert.equal(gecersizMi('- 2026-10-02 — Eski karar GEÇERSİZ (2026-10-10)'), true);
  assert.equal(gecersizMi('- ~~2026-10-02 — Eski karar~~'), true);
  assert.equal(gecersizMi('- 2026-10-02 — Geçerli karar'), false);
});

test('tercihler varsayılan, birleştirme ve doğrulama', () => {
  const kok = kasaYap('tercih');
  assert.equal(tercihleriOku(kok).baglam_karakter, 6000);
  writeFileSync(join(kok, '.beyin', 'tercihler.json'), JSON.stringify({ baglam_karakter: 99999, yakalama: 'evet', bilinmeyen: 1 }));
  assert.equal(tercihleriOku(kok).baglam_karakter, 6000);
  assert.equal(tercihleriOku(kok).yakalama, true);
  tercihYaz(kok, 'bayat_gun.guncel_durum', '14');
  tercihYaz(kok, 'guncelleme_bildirimi', 'kapali');
  const t = tercihleriOku(kok);
  assert.equal(t.bayat_gun.guncel_durum, 14);
  assert.equal(t.bayat_gun.ben_kimim, 180);
  assert.equal(t.guncelleme_bildirimi, false);
  assert.throws(() => tercihYaz(kok, 'yok', '1'), /tercih_bilinmiyor/u);
  assert.throws(() => tercihYaz(kok, 'bayat_gun', '1'), /tercih_bilinmiyor/u);
  assert.throws(() => tercihYaz(kok, 'baglam_karakter', '50'), /tercih_degeri/u);
  assert.equal(JSON.parse(readFileSync(join(kok, '.beyin', 'tercihler.json'), 'utf8')).bilinmeyen, 1);
});
