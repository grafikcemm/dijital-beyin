import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ara, turkceKok } from '../sistem/lib/ara.mjs';

let kok;

function yaz(rel, icerik) {
  const dosya = join(kok, ...rel.split('/'));
  mkdirSync(join(dosya, '..'), { recursive: true });
  writeFileSync(dosya, icerik);
}

before(() => {
  kok = mkdtempSync(`${tmpdir()}/Dijital Beyin Ğüşİ-`);
  yaz('beynim/ben-kimim.md', '---\ndate: 2026-10-17\n---\n# Ben kimim\n\n- Adım Elif. Serbest illüstratörüm.\n- En sevdiğim tatlı sütlaç.\n');
  yaz('notlar/alt klasör/toplanti.md', [
    '# Yayınevi toplantısı',
    '',
    'Toplantıda kapak renklerini konuştuk ve baskı provası istedik.',
    '',
    'Geçen ay verdiğim kararları gözden geçirdim; iki karar değişti.',
    '',
    'Sonraki toplantı kasımda.',
    '',
  ].join('\n'));
  yaz('gunluk/2026-10-16.md', 'Oturumda uzun bir konuşma yaptık: sayfa düzeni, kenar boşlukları, font boyutu, renk profili, baskı kâğıdı, '
    + 'teslim tarihi, fatura, yayınevinin geri bildirimi ve sonunda küçük bir karar üzerine sohbet ettik.\n');
  yaz('gelen-kutusu/oneri.md', 'Arka kapakta yalnız sincap olsun mu?\n');
  yaz('notlar/resim.txt', 'karar karar karar');
  yaz('CLAUDE.md', 'karar karar karar');
  yaz('notlar/buyuk.md', `karar ${'x'.repeat(1024 * 1024 + 10)}`);
});

after(() => {
  rmSync(kok, { recursive: true, force: true });
});

describe('turkceKok', () => {
  test('çekim eklerini soyar, kökü en az 3 harf bırakır', () => {
    assert.equal(turkceKok('kararları'), 'karar');
    assert.equal(turkceKok('kararlarımız'), 'karar');
    assert.equal(turkceKok('KARARLARDAN'), 'karar');
    assert.equal(turkceKok('renklerin'), 'renk');
    assert.equal(turkceKok('kitapta'), 'kitap');
    assert.equal(turkceKok('kalemle'), 'kalem');
    assert.equal(turkceKok('okula'), turkceKok('okulda'));
    for (const k of ['evde', 'eve', 'ama']) assert.ok(turkceKok(k).length >= 3, k);
    assert.equal(turkceKok('İstanbul'), 'istanbul');
  });

  test('aksanlı ve aksansız yazım aynı köke iner', () => {
    const katla = s => s.replace(/ç/gu, 'c').replace(/ğ/gu, 'g').replace(/ı/gu, 'i').replace(/ö/gu, 'o').replace(/ş/gu, 's').replace(/ü/gu, 'u');
    for (const kelime of ['kararları', 'sütlacı', 'gözlüğünü', 'işlerimiz', 'çiçeklerden']) {
      assert.equal(katla(turkceKok(kelime)), turkceKok(katla(kelime)), kelime);
    }
  });
});

describe('ara', () => {
  test('"karar" "kararları" içeren notu bulur ve doğru paragrafı ilk sıraya koyar', () => {
    const sonuc = ara(kok, 'karar');
    assert.ok(sonuc.length >= 2);
    assert.equal(sonuc[0].dosya, 'notlar/alt klasör/toplanti.md');
    assert.equal(sonuc[0].satir, 5);
    assert.match(sonuc[0].parca, /kararları gözden geçirdim/u);
    assert.ok(sonuc.some(s => s.dosya === 'gunluk/2026-10-16.md'));
    assert.ok(sonuc[0].skor > sonuc[1].skor);
    assert.equal(sonuc[0].skor, Math.round(sonuc[0].skor * 1000) / 1000);
  });

  test('aksan duyarsız: "sutlac" "sütlaç"ı bulur, büyük harf de çalışır', () => {
    for (const sorgu of ['sutlac', 'SÜTLAÇ', 'sütlacı']) {
      const sonuc = ara(kok, sorgu);
      assert.equal(sonuc[0]?.dosya, 'beynim/ben-kimim.md', sorgu);
      assert.equal(sonuc[0].satir, 6, 'frontmatter satırları sayılır');
    }
  });

  test('yollar / ayraçlı ve göreli; yalnız dört klasördeki .md aranır', () => {
    const sonuc = ara(kok, 'karar', { limit: 50 });
    for (const s of sonuc) {
      assert.ok(!s.dosya.includes('\\'));
      assert.match(s.dosya, /^(beynim|notlar|gunluk|gelen-kutusu)\/.+\.md$/u);
    }
    assert.ok(!sonuc.some(s => s.dosya === 'CLAUDE.md' || s.dosya.endsWith('.txt')));
    assert.ok(!sonuc.some(s => s.dosya === 'notlar/buyuk.md'), '1 MB üstü dosya atlanır');
  });

  test('parça en fazla 240 karakter, limit uygulanır, boş sorgu boş döner', () => {
    const sonuc = ara(kok, 'karar', { limit: 1 });
    assert.equal(sonuc.length, 1);
    for (const s of ara(kok, 'konuşma karar', { limit: 10 })) assert.ok(s.parca.length <= 240);
    assert.deepEqual(ara(kok, '  ve '), []);
    assert.deepEqual(ara(kok, 'zürafa'), []);
    assert.deepEqual(ara(join(kok, 'olmayan kasa'), 'karar'), []);
  });
});
