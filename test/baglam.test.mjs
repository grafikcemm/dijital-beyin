import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { baglamOlustur, bayatNotlar } from '../sistem/lib/baglam.mjs';

const SIMDI = new Date(2026, 9, 17, 12, 0);
const kasalar = [];

function kasaKur() {
  const kok = mkdtempSync(join(tmpdir(), 'Dijital Beyin Ğüşİ-'));
  mkdirSync(join(kok, '.beyin'), { recursive: true });
  writeFileSync(join(kok, '.beyin', 'kurulum.json'), '{}');
  kasalar.push(kok);
  return kok;
}

function yaz(kok, rel, icerik) {
  const dosya = join(kok, ...rel.split('/'));
  mkdirSync(dirname(dosya), { recursive: true });
  writeFileSync(dosya, icerik);
  return dosya;
}

const not = (tarih, govde, ek = '') => `---\ntitle: test\n${tarih ? `date: ${tarih}\n` : ''}${ek}---\n${govde}\n`;

function oturumBlogu(id, saat, istek, sonuc) {
  return [
    `<!-- oturum:${id} -->`,
    `### ${saat} · claude · ${id.slice(0, 8)}`,
    `- **İstek:** ${istek}`,
    `- **Sonuç:** ${sonuc}`,
    '- **Dosyalar:** notlar/a.md',
    '_Modelsiz özet · 1 tur_',
    `<!-- /oturum:${id} -->`,
  ].join('\n');
}

function tamKasa() {
  const kok = kasaKur();
  yaz(kok, 'beynim/guncel-durum.md', not('2026-10-10', 'Elif bu hafta çocuk kitabı kapağına odaklanıyor.'));
  yaz(kok, 'beynim/aktif-projem.md', not('2026-10-12', 'Aktif proje: "Ay Işığı" çocuk kitabı, 12 iç sayfa.'));
  yaz(kok, 'beynim/ben-kimim.md', not('2026-06-01', 'Elif, serbest illüstratör. Suluboya ve dijital çalışır.'));
  const kararlar = ['# Verdiğim kararlar', ''];
  for (let i = 1; i <= 20; i += 1) kararlar.push(`- 2026-09-${String(i).padStart(2, '0')}: karar ${i}`);
  kararlar.push('- 2026-10-01: poster fiyatı 1200 TL GEÇERSİZ', '- 2026-10-02: ~~eski karar~~', '- 2026-10-03: poster fiyatı 1500 TL');
  yaz(kok, 'beynim/verdigim-kararlar.md', `${kararlar.join('\n')}\n`);
  yaz(kok, 'gunluk/2026-10-16.md', [
    '# Günlük — 2026-10-16', '',
    oturumBlogu('dun-1', '09:00', 'dünkü ilk istek', 'dünkü ilk sonuç'), '',
    oturumBlogu('dun-2', '18:00', 'dünkü ikinci istek', 'dünkü ikinci sonuç'), '',
  ].join('\n'));
  yaz(kok, 'gunluk/2026-10-17.md', [
    '# Günlük — 2026-10-17', '', 'Elle yazılmış not.', '',
    oturumBlogu('bugun-1', '10:00', 'bugünkü ilk istek', 'bugünkü ilk sonuç'), '',
    oturumBlogu('bugun-2', '11:00', 'bugünkü ikinci istek', 'bugünkü ikinci sonuç'), '',
  ].join('\n'));
  return kok;
}

after(() => { for (const kok of kasalar) rmSync(kok, { recursive: true, force: true }); });

describe('baglamOlustur', () => {
  test('kural bloğu ve bölümler öncelik sırasıyla gelir', () => {
    const kok = tamKasa();
    const metin = baglamOlustur(kok, { simdi: SIMDI });
    assert.ok(metin.startsWith("# Digital brain (the user's own notes)"));
    for (const parca of ['newer date wins', '`supersedes`', 'Never invent facts', 'ask the user', "user's language",
      'node beyin.mjs ara "<query>"', 'beynim/verdigim-kararlar.md', 'GEÇERSİZ', 'Never delete', 'Today is 2026-10-17']) {
      assert.ok(metin.includes(parca), parca);
    }
    const sira = ['## Current status — beynim/guncel-durum.md (dated 2026-10-10)', '## Active project — beynim/aktif-projem.md',
      '## Who the user is — beynim/ben-kimim.md (dated 2026-06-01)', '## Active decisions', '## Recent sessions'];
    const konumlar = sira.map(s => metin.indexOf(s));
    assert.ok(konumlar.every(k => k > 0), JSON.stringify(konumlar));
    assert.deepEqual([...konumlar].sort((a, b) => a - b), konumlar);
    assert.ok(metin.includes('Elif, serbest illüstratör. Suluboya ve dijital çalışır.'));
    assert.ok(!metin.includes('title: test'), 'frontmatter gösterilmemeli');
    assert.ok(!metin.includes('## Staleness warnings'));
    assert.ok(metin.length <= 6000);
  });

  test('geçerli kararlar: GEÇERSİZ ve üstü çizili atlanır, son 15', () => {
    const metin = baglamOlustur(tamKasa(), { simdi: SIMDI });
    assert.match(metin, /latest 15 of 21/u);
    assert.ok(metin.includes('- 2026-10-03: poster fiyatı 1500 TL'));
    assert.ok(!metin.includes('1200 TL'));
    assert.ok(!metin.includes('eski karar'));
    assert.ok(metin.includes('karar 7\n'));
    assert.ok(!metin.includes('karar 6\n'));
  });

  test('Elediklerim altındaki maddeler karar olarak değil, ayrı başlıkla gelir', () => {
    const kok = kasaKur();
    yaz(kok, 'beynim/verdigim-kararlar.md', [
      '# Verdiğim kararlar', '', '## Kararlar', '',
      '- 2026-10-05 — Ana renk kiremit — krem soluk çıktı', '',
      '## Elediklerim', '',
      '- 2026-09-02 — Yapay zekâ arka planları — yayınevi el işi istiyor', '',
    ].join('\n'));
    const metin = baglamOlustur(kok, { simdi: SIMDI });
    const karar = metin.indexOf('Ana renk kiremit');
    const baslik = metin.indexOf('### Ruled out');
    const elenen = metin.indexOf('Yapay zekâ arka planları');
    assert.match(metin, /latest 1 of 1/u);
    assert.ok(karar > 0 && baslik > karar && elenen > baslik, JSON.stringify({ karar, baslik, elenen }));
  });

  test('son 3 oturum, yalnız İstek/Sonuç satırları', () => {
    const metin = baglamOlustur(tamKasa(), { simdi: SIMDI });
    assert.ok(!metin.includes('dünkü ilk istek'));
    for (const s of ['dünkü ikinci istek', 'bugünkü ilk sonuç', 'bugünkü ikinci istek']) assert.ok(metin.includes(s), s);
    assert.ok(metin.includes('### 2026-10-17 11:00 · claude · bugun-2'));
    assert.ok(!metin.includes('Dosyalar'));
    assert.ok(!metin.includes('Modelsiz'));
    assert.ok(!metin.includes('Elle yazılmış not.'));
  });

  test('bütçe: düşük öncelikli bölüm önce kısalır, kural bloğu kesilmez', () => {
    const kok = tamKasa();
    yaz(kok, 'beynim/ben-kimim.md', not('2026-06-01', `Elif, serbest illüstratör.\n${'Uzun biyografi satırı. '.repeat(400)}`));
    const tam = baglamOlustur(kok, { simdi: SIMDI, butce: 9500 });
    assert.ok(tam.length <= 9500, String(tam.length));

    const kucuk = baglamOlustur(kok, { simdi: SIMDI, butce: 1500 });
    assert.ok(kucuk.length <= 1500, String(kucuk.length));
    assert.ok(kucuk.includes('Never delete or rewrite old lines.'), 'kural bloğu tam kalmalı');
    assert.ok(kucuk.includes('Elif bu hafta çocuk kitabı kapağına odaklanıyor.'));
    assert.ok(!kucuk.includes('## Recent sessions'));
    assert.ok(!kucuk.includes('## Active decisions'));

    const orta = baglamOlustur(kok, { simdi: SIMDI, butce: 3000 });
    assert.ok(orta.length <= 3000, String(orta.length));
    assert.ok(orta.includes('## Who the user is'));
    assert.ok(orta.includes('[… truncated to fit the context budget]'));

    const asiri = baglamOlustur(kok, { simdi: SIMDI, butce: 50_000 });
    assert.ok(asiri.length <= 9500, String(asiri.length));
    writeFileSync(join(kok, '.beyin', 'tercihler.json'), JSON.stringify({ baglam_karakter: 2000 }));
    assert.ok(baglamOlustur(kok, { simdi: SIMDI }).length <= 2000);
  });

  test('supersedes: eski not düşer, yerine yenisi gösterilir', () => {
    const kok = tamKasa();
    yaz(kok, 'beynim/yeni-durum.md', not('2026-10-15', 'Kapak bitti; Elif artık iç sayfalarda.', 'supersedes:\n  - guncel-durum.md\n'));
    const metin = baglamOlustur(kok, { simdi: SIMDI });
    assert.ok(!metin.includes('kapağına odaklanıyor'));
    assert.ok(metin.includes('Kapak bitti; Elif artık iç sayfalarda.'));
    assert.ok(metin.includes('beynim/yeni-durum.md (dated 2026-10-15; supersedes beynim/guncel-durum.md)'));
    assert.ok(metin.indexOf('Kapak bitti') < metin.indexOf('## Active project'));
    assert.equal(metin.split('Kapak bitti').length - 1, 1);

    yaz(kok, 'beynim/fiyat-notu.md', not('2026-10-16', 'Yeni fiyat notu.', 'supersedes: beynim/eski-fiyat.md\n'));
    yaz(kok, 'beynim/eski-fiyat.md', not('2026-01-01', 'Eski fiyat notu.'));
    const ikinci = baglamOlustur(kok, { simdi: SIMDI });
    assert.ok(ikinci.includes('## Note that overrides older notes — beynim/fiyat-notu.md'));
    assert.ok(ikinci.includes('Yeni fiyat notu.'));
    assert.ok(!ikinci.includes('Eski fiyat notu.'));
  });

  test('bayatlık uyarısı bağlamda görünür', () => {
    const kok = tamKasa();
    yaz(kok, 'beynim/guncel-durum.md', not('2026-09-02', 'Eski durum.'));
    const metin = baglamOlustur(kok, { simdi: SIMDI });
    assert.ok(metin.includes('## Staleness warnings\n- beynim/guncel-durum.md is 45 days old (limit 30) — confirm with the user before relying on it.'));
  });

  test('eksik dosyalar sessizce atlanır; kasa yoksa da fırlatmaz', () => {
    const kok = kasaKur();
    const bos = baglamOlustur(kok, { simdi: SIMDI });
    assert.ok(bos.startsWith('# Digital brain'));
    assert.ok(bos.includes('No brain notes were found yet.'));
    yaz(kok, 'beynim/aktif-projem.md', 'Frontmattersız aktif proje notu.');
    const tek = baglamOlustur(kok, { simdi: SIMDI });
    assert.ok(tek.includes('## Active project — beynim/aktif-projem.md (undated, file modified'));
    assert.ok(!tek.includes('## Current status'));
    assert.doesNotThrow(() => baglamOlustur(join(kok, 'yok', 'kasa')));
    assert.ok(baglamOlustur(join(kok, 'yok')).startsWith('# Digital brain'));
  });
});

describe('bayatNotlar', () => {
  test('frontmatter tarihi, mtime yedeği ve tercih sınırları', () => {
    const kok = kasaKur();
    yaz(kok, 'beynim/guncel-durum.md', not('2026-09-02', 'Durum.'));
    yaz(kok, 'beynim/aktif-projem.md', not('2026-10-01', 'Proje.'));
    const ben = yaz(kok, 'beynim/ben-kimim.md', 'Tarihsiz kimlik notu.');
    const eski = new Date(2026, 2, 1, 12, 0);
    utimesSync(ben, eski, eski);
    assert.deepEqual(bayatNotlar(kok, SIMDI), [
      { dosya: 'beynim/guncel-durum.md', gun: 45, sinir: 30 },
      { dosya: 'beynim/ben-kimim.md', gun: 230, sinir: 180 },
    ]);
    writeFileSync(join(kok, '.beyin', 'tercihler.json'), JSON.stringify({ bayat_gun: { guncel_durum: 60, aktif_projem: 10 } }));
    assert.deepEqual(bayatNotlar(kok, SIMDI), [
      { dosya: 'beynim/aktif-projem.md', gun: 16, sinir: 10 },
      { dosya: 'beynim/ben-kimim.md', gun: 230, sinir: 180 },
    ]);
    assert.deepEqual(bayatNotlar(join(kok, 'yok'), SIMDI), []);
  });
});
