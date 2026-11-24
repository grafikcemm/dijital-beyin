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
    for (const parca of ['follow the note with the newer date', 'which line is out of date', 'propose it to the user', '`supersedes`', 'Never invent facts', 'ask the user', "user's language",
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
      '- 2026-09-02 — Yapay zeka arka planları — yayınevi el işi istiyor', '',
    ].join('\n'));
    const metin = baglamOlustur(kok, { simdi: SIMDI });
    const karar = metin.indexOf('Ana renk kiremit');
    const baslik = metin.indexOf('### Ruled out');
    const elenen = metin.indexOf('Yapay zeka arka planları');
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
    assert.ok(kucuk.includes('to the end of the old line.'), 'kural bloğu tam kalmalı');
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

describe('2.x adları ve karışık kasa', () => {
  test('karışık kasa (1.x adları + 04/05): 1.x dosyaları okunur, 04 ve 05 kimlikten sonra gelir', () => {
    const kok = tamKasa();
    yaz(kok, 'beynim/04-Tuzaklar.md', not('2026-10-01', '- Tarihi 11/24/2026 biçiminde yazma.'));
    yaz(kok, 'beynim/05-Calisma-Tarzim.md', not('2026-10-01', '- Kısa ve maddeli yaz.'));
    const metin = baglamOlustur(kok, { simdi: SIMDI, butce: 9500 });
    const sira = ['## Current status — beynim/guncel-durum.md', '## Active project — beynim/aktif-projem.md',
      '## Who the user is — beynim/ben-kimim.md', '## Traps to avoid — beynim/04-Tuzaklar.md (dated 2026-10-01)',
      '## How the user likes to work — beynim/05-Calisma-Tarzim.md', '## Active decisions — beynim/verdigim-kararlar.md',
      '## Recent sessions'];
    const konumlar = sira.map(s => metin.indexOf(s));
    assert.ok(konumlar.every(k => k > 0), JSON.stringify(konumlar));
    assert.deepEqual([...konumlar].sort((a, b) => a - b), konumlar);
    assert.ok(metin.includes('to beynim/verdigim-kararlar.md. Never delete'));
  });

  test('2.x adı varsa 1.x adına tercih edilir', () => {
    const kok = kasaKur();
    yaz(kok, 'beynim/02-Guncel-Durum.md', not('2026-10-10', 'Yeni durum.'));
    yaz(kok, 'beynim/guncel-durum.md', not('2026-10-10', 'Eski durum.'));
    yaz(kok, 'beynim/03-Kararlar.md', '## Kararlar\n\n- 2026-10-05 — yeni karar — neden\n');
    yaz(kok, 'beynim/verdigim-kararlar.md', '## Kararlar\n\n- 2026-10-01 — eski karar — neden\n');
    const metin = baglamOlustur(kok, { simdi: SIMDI });
    assert.ok(metin.includes('## Current status — beynim/02-Guncel-Durum.md'));
    assert.ok(!metin.includes('Eski durum.'));
    assert.ok(metin.includes('## Active decisions — beynim/03-Kararlar.md'));
    assert.ok(!metin.includes('eski karar'));
    assert.ok(metin.includes('to beynim/03-Kararlar.md. Never delete'));
  });

  test('bütçe: oturumlar, sonra kararlar 04 ve 05\'ten önce kısalır ya da düşer', () => {
    const kok = tamKasa();
    const tuzaklar = Array.from({ length: 8 }, (_, i) => `- Tuzak ${i + 1}: müşteriye onaysız teslim tarihi verme, önce bana sor.`).join('\n');
    const tarz = Array.from({ length: 6 }, (_, i) => `- Tarz ${i + 1}: kısa ve maddeli yaz, klişe yok.`).join('\n');
    yaz(kok, 'beynim/04-Tuzaklar.md', not('2026-10-01', tuzaklar));
    yaz(kok, 'beynim/05-Calisma-Tarzim.md', not('2026-10-01', tarz));
    const tam = baglamOlustur(kok, { simdi: SIMDI, butce: 9500 });
    for (const parca of ['## Traps to avoid', '## How the user likes to work', '## Active decisions', '## Recent sessions']) {
      assert.ok(tam.includes(parca), parca);
    }
    assert.ok(tam.indexOf('## How the user likes to work') < tam.indexOf('## Active decisions'));

    // Biraz sıkışınca yalnız oturumlar kısalır.
    const az = baglamOlustur(kok, { simdi: SIMDI, butce: tam.length - 60 });
    assert.ok(az.length <= tam.length - 60);
    assert.ok(az.includes(tuzaklar) && az.includes(tarz), '04 ve 05 tam kalmalı');
    assert.ok(az.includes(tam.slice(tam.indexOf('## Active decisions'), tam.indexOf('\n\n## Recent sessions'))), 'kararlar tam kalmalı');

    // Oturumlar ve kararlar sığmayınca ikisi de düşer; 04 ve 05 olduğu gibi kalır.
    const kararSonrasi = tam.indexOf('\n\n## Active decisions');
    const dar = baglamOlustur(kok, { simdi: SIMDI, butce: kararSonrasi });
    assert.equal(dar, tam.slice(0, kararSonrasi));
    assert.ok(dar.includes(tuzaklar) && dar.includes(tarz));
    assert.ok(!dar.includes('## Recent sessions') && !dar.includes('## Active decisions'));
  });

  test('ad çakışması: üç yuvanın her biri için uyarı satırı, hangi dosyanın okunduğu, silme ve ad değiştirme kullanıcıda', () => {
    const kok = tamKasa();
    yaz(kok, 'beynim/02-Guncel-Durum.md', not('2026-10-14', 'Ajanın açtığı yeni durum dosyası.'));
    yaz(kok, 'beynim/01-Kimlik.md', not('2026-10-14', 'Ajanın açtığı yeni kimlik dosyası.'));
    yaz(kok, 'beynim/03-Kararlar.md', '## Kararlar\n\n- 2026-10-14 — yeni dosyada karar — neden\n');
    const metin = baglamOlustur(kok, { simdi: SIMDI, butce: 3000 });
    assert.ok(metin.length <= 3000, String(metin.length));
    const satir = (okunan, gizli) => `- beynim/${okunan} and beynim/${gizli} both exist; only beynim/${okunan} is shown here and beynim/${gizli} is ignored. Tell the user; only the user can delete or rename a file in beynim/. With their approval you may copy content from one file into the other.`;
    const blok = ['## File name conflicts',
      satir('02-Guncel-Durum.md', 'guncel-durum.md'),
      satir('01-Kimlik.md', 'ben-kimim.md'),
      satir('03-Kararlar.md', 'verdigim-kararlar.md')].join('\n');
    assert.ok(metin.endsWith(blok), metin);
    assert.ok(metin.includes('Ajanın açtığı yeni durum dosyası.'));
    assert.ok(!metin.includes('kapağına odaklanıyor'));

    // Tek çakışma tek satır verir; bayatlık uyarısıyla birlikte kesilmeden kalır.
    const tek = kasaKur();
    yaz(tek, 'beynim/guncel-durum.md', not('2026-09-02', 'Eski durum.'));
    yaz(tek, 'beynim/ben-kimim.md', not('2026-06-01', 'Elif.'));
    yaz(tek, 'beynim/01-Kimlik.md', not('2026-10-14', 'Elif, illüstratör.'));
    const tekMetin = baglamOlustur(tek, { simdi: SIMDI });
    assert.ok(tekMetin.includes('## Staleness warnings\n- beynim/guncel-durum.md is 45 days old'));
    assert.ok(tekMetin.endsWith(`## File name conflicts\n${satir('01-Kimlik.md', 'ben-kimim.md')}`), tekMetin);
  });

  test('ad çakışması uyarısı saf 1.x, saf 2.x ve 1.x + 04/05 kasasında çıkmaz', () => {
    const v1 = tamKasa();
    assert.ok(!baglamOlustur(v1, { simdi: SIMDI }).includes('File name conflicts'));
    yaz(v1, 'beynim/04-Tuzaklar.md', not('2026-10-01', '- Tuzak.'));
    yaz(v1, 'beynim/05-Calisma-Tarzim.md', not('2026-10-01', '- Tarz.'));
    assert.ok(!baglamOlustur(v1, { simdi: SIMDI }).includes('File name conflicts'));
    const v2 = kasaKur();
    for (const ad of ['01-Kimlik', '02-Guncel-Durum', '04-Tuzaklar', '05-Calisma-Tarzim']) yaz(v2, `beynim/${ad}.md`, not('2026-10-01', `${ad} notu.`));
    yaz(v2, 'beynim/03-Kararlar.md', '## Kararlar\n\n- 2026-10-01 — karar — neden\n');
    assert.ok(!baglamOlustur(v2, { simdi: SIMDI }).includes('File name conflicts'));
  });

  test('boş kasada ve 2.x kasasında 01-Kimlik.md, 1.x kasasında ben-kimim.md önerilir', () => {
    const bos = kasaKur();
    assert.ok(baglamOlustur(bos, { simdi: SIMDI }).includes('Suggest that the user fills in beynim/01-Kimlik.md.'));
    assert.ok(baglamOlustur(bos, { simdi: SIMDI }).includes('to beynim/03-Kararlar.md. Never delete'));
    const v2 = kasaKur();
    yaz(v2, 'beynim/01-Kimlik.md', '---\ndate:\n---\n');
    assert.ok(baglamOlustur(v2, { simdi: SIMDI }).includes('Suggest that the user fills in beynim/01-Kimlik.md.'));
    const v1 = kasaKur();
    yaz(v1, 'beynim/ben-kimim.md', '---\ndate:\n---\n');
    const metin = baglamOlustur(v1, { simdi: SIMDI });
    assert.ok(metin.includes('Suggest that the user fills in beynim/ben-kimim.md.'));
    assert.ok(metin.includes('to beynim/verdigim-kararlar.md. Never delete'));
  });

  test('bayatlık: 02-Guncel-Durum guncel_durum, 01-Kimlik ben_kimim sınırını kullanır; 04/05 denetlenmez', () => {
    const kok = kasaKur();
    yaz(kok, 'beynim/02-Guncel-Durum.md', not('2026-09-02', 'Durum.'));
    yaz(kok, 'beynim/01-Kimlik.md', not('2026-03-01', 'Kimlik.'));
    yaz(kok, 'beynim/04-Tuzaklar.md', not('2020-01-01', 'Tuzak.'));
    yaz(kok, 'beynim/05-Calisma-Tarzim.md', not('2020-01-01', 'Tarz.'));
    assert.deepEqual(bayatNotlar(kok, SIMDI), [
      { dosya: 'beynim/02-Guncel-Durum.md', gun: 45, sinir: 30 },
      { dosya: 'beynim/01-Kimlik.md', gun: 230, sinir: 180 },
    ]);
    writeFileSync(join(kok, '.beyin', 'tercihler.json'), JSON.stringify({ bayat_gun: { guncel_durum: 60, ben_kimim: 365 } }));
    assert.deepEqual(bayatNotlar(kok, SIMDI), []);
    const metin = baglamOlustur(join(kok), { simdi: SIMDI });
    assert.ok(!metin.includes('## Staleness warnings'));
  });
});

describe('HTML yorumları bağlama girmez', () => {
  test('yorumlar çıkar, yorum dışındaki metin bayt bayt kalır, yorumun bıraktığı boş satır teklenir', () => {
    const kok = kasaKur();
    yaz(kok, 'beynim/01-Kimlik.md', not('2026-10-01', [
      '# Kimlik', '', '<!-- yönlendirme', '     ikinci satır -->', '',
      '- Adım: Elif', '- İş: illüstratör <!-- satır içi --> ve yazar', '', '',
      '- Not:  iki  boşluk', '<!-- son -->',
    ].join('\n')));
    const metin = baglamOlustur(kok, { simdi: SIMDI });
    const beklenen = '# Kimlik\n\n- Adım: Elif\n- İş: illüstratör  ve yazar\n\n\n- Not:  iki  boşluk';
    assert.ok(metin.endsWith(`\n\n## Who the user is — beynim/01-Kimlik.md (dated 2026-10-01)\n${beklenen}`), metin);
    for (const yok of ['<!--', '-->', 'yönlendirme', 'satır içi', 'son -->']) assert.ok(!metin.includes(yok), yok);
  });

  test('kapanmamış yorum olduğu gibi kalır', () => {
    const kok = kasaKur();
    const govde = '- Adım: Elif\n<!-- kapanmamış not\n- Devam';
    yaz(kok, 'beynim/01-Kimlik.md', not('2026-10-01', govde));
    assert.ok(baglamOlustur(kok, { simdi: SIMDI }).includes(`beynim/01-Kimlik.md (dated 2026-10-01)\n${govde}`));
  });

  test('yalnız yorumdan oluşan not bölüm üretmez', () => {
    const kok = kasaKur();
    yaz(kok, 'beynim/02-Guncel-Durum.md', not('2026-10-01', '<!-- Şu anki tablo.\n     Burayı doldur. -->\n'));
    const bos = baglamOlustur(kok, { simdi: SIMDI });
    assert.ok(!bos.includes('## Current status'));
    assert.ok(bos.includes('No brain notes were found yet.'));
    yaz(kok, 'beynim/04-Tuzaklar.md', not('2026-10-01', '<!-- a --> <!-- b -->'));
    yaz(kok, 'beynim/01-Kimlik.md', not('2026-10-01', 'Elif.'));
    const metin = baglamOlustur(kok, { simdi: SIMDI });
    assert.ok(metin.includes('## Who the user is'));
    assert.ok(!metin.includes('## Current status') && !metin.includes('## Traps to avoid'), metin);
  });

  test('yorum içindeki karar ve başlık satırları karar sayılmaz', () => {
    const kok = kasaKur();
    yaz(kok, 'beynim/03-Kararlar.md', [
      '# Kararlar Günlüğü', '',
      '<!-- Biçim:', '- 2026-01-05 — yorumdaki karar — örnek', '## Elediklerim', '-->', '',
      '## Kararlar', '', '- 2026-10-05 — gerçek karar — neden', '',
      '## Elediklerim', '', '<!-- - 2026-01-06 — yorumdaki elenen — örnek -->', '- 2026-09-01 — gerçek elenen — neden', '',
    ].join('\n'));
    const metin = baglamOlustur(kok, { simdi: SIMDI });
    assert.ok(metin.includes('## Active decisions — beynim/03-Kararlar.md (latest 1 of 1, oldest first)\n- 2026-10-05 — gerçek karar — neden'), metin);
    assert.ok(metin.includes('(latest 1 of 1)\n- 2026-09-01 — gerçek elenen — neden'), metin);
    assert.ok(!metin.includes('yorumdaki'), metin);
  });
});
