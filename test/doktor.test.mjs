import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { doktor } from '../sistem/lib/doktor.mjs';
import { jsonOku } from '../sistem/lib/yol.mjs';
import { kaldir, kasaKur, KULLANICI_DOSYALARI } from './fixtures/b-yardimci/kasa.mjs';

const SIMDI = new Date(2026, 9, 17, 12, 0, 0);
const kancalarTam = async () => ({ claude: { kurulu: true, eksik: [] }, codex: { kurulu: true, eksik: [] } });
const manifestOkuFn = kok => jsonOku(join(kok, '.beyin', 'kurulum.json'), null);
const bayatYok = () => [];

function bul(sonuc, ad) {
  return sonuc.kontroller.filter(k => k.ad === ad);
}

function bicimiDogrula(sonuc) {
  assert.equal(typeof sonuc.saglikli, 'boolean');
  assert.ok(Array.isArray(sonuc.kontroller) && sonuc.kontroller.length > 0);
  for (const k of sonuc.kontroller) {
    assert.equal(typeof k.ad, 'string');
    assert.ok(['tamam', 'uyari', 'hata'].includes(k.durum), k.durum);
    assert.equal(typeof k.mesaj, 'string');
    assert.ok(k.mesaj.length > 0);
  }
}

test('doktor: sağlıklı kasada her şey tamam', async () => {
  const kok = kasaKur();
  try {
    const sonuc = await doktor(kok, { simdi: SIMDI, kancaDurumuFn: kancalarTam, manifestOkuFn, bayatNotlarFn: bayatYok });
    bicimiDogrula(sonuc);
    assert.equal(sonuc.saglikli, true);
    assert.deepEqual(sonuc.kontroller.filter(k => k.durum !== 'tamam'), []);
    for (const ad of ['node', 'kasa_duzeni', 'manifest', 'surum', 'kanca_claude', 'yonetilen_blok',
      'bayat_not', 'son_yakalama', 'guncelleme', 'kilit', 'hata_gunlugu']) {
      assert.ok(bul(sonuc, ad).length > 0, ad);
    }
    assert.equal(bul(sonuc, 'kanca_codex').length, 0, 'Codex seçilmediyse Codex denetlenmez');
  } finally {
    kaldir(kok);
  }
});

test('doktor: bozuk kasada her sorunu sade dille bildirir', async () => {
  const kok = kasaKur({ istemciler: ['claude', 'codex'], ek: { 'sistem/lib/eski.mjs': 'eski\n' } });
  try {
    rmSync(join(kok, 'beynim'), { recursive: true, force: true });
    writeFileSync(join(kok, 'sistem', 'lib', 'x.mjs'), '// değişti\n');
    unlinkSync(join(kok, 'sistem', 'lib', 'eski.mjs'));
    writeFileSync(join(kok, 'CLAUDE.md'), '# Elif\nblok yok\n');
    unlinkSync(join(kok, 'AGENTS.md'));
    const durum = join(kok, '.beyin', 'durum');
    mkdirSync(durum, { recursive: true });
    // 2026-10-30: son oturum (2026-10-15) 15 gün önce.
    const ileri = new Date(2026, 9, 30, 12, 0, 0);
    writeFileSync(join(durum, 'guncelleme.json'), JSON.stringify({ son_kontrol: ileri.toISOString(), en_son_surum: '2.0.0', hata: 'github_sinir' }));
    const kilit = join(durum, 'yakala.kilit');
    writeFileSync(kilit, '{}');
    const yarimSaatOnce = new Date(ileri.getTime() - 30 * 60 * 1000);
    utimesSync(kilit, yarimSaatOnce, yarimSaatOnce);
    writeFileSync(join(durum, 'taze.kilit'), '{}');
    utimesSync(join(durum, 'taze.kilit'), ileri, ileri);
    const satir = (saatOnce, baglam) => JSON.stringify({
      zaman: new Date(ileri.getTime() - saatOnce * 3600 * 1000).toISOString(), baglam, hata: 'bozuk transkript',
    });
    writeFileSync(join(durum, 'hatalar.log'), `${satir(30, 'eski')}\n${satir(5, 'kanca:bitis')}\nbozuk satır\n${satir(1, 'kanca:baslangic')}\n`);

    const sonuc = await doktor(kok, {
      simdi: ileri,
      kancaDurumuFn: async () => ({ claude: { kurulu: false, eksik: ['SessionStart', 'SessionEnd'] }, codex: { kurulu: false, eksik: ['Stop'] } }),
      manifestOkuFn,
      bayatNotlarFn: () => [{ dosya: 'beynim/guncel-durum.md', gun: 45, sinir: 30 }, { dosya: 'beynim/ben-kimim.md', gun: 200, sinir: 180 }],
    });
    bicimiDogrula(sonuc);
    assert.equal(sonuc.saglikli, false);

    assert.equal(bul(sonuc, 'kasa_duzeni')[0].durum, 'hata');
    assert.match(bul(sonuc, 'kasa_duzeni')[0].mesaj, /beynim/u);

    const manifest = bul(sonuc, 'manifest');
    assert.ok(manifest.some(k => k.durum === 'uyari' && k.mesaj.includes('sistem/lib/x.mjs') && k.mesaj.includes('yerelde değiştirilmiş')));
    assert.ok(manifest.some(k => k.durum === 'hata' && k.mesaj.includes('sistem/lib/eski.mjs')));

    assert.equal(bul(sonuc, 'kanca_claude')[0].durum, 'hata');
    assert.match(bul(sonuc, 'kanca_claude')[0].mesaj, /SessionStart/u);
    assert.equal(bul(sonuc, 'kanca_codex')[0].durum, 'uyari');
    assert.match(bul(sonuc, 'kanca_codex')[0].mesaj, /\/hooks/u);

    const bloklar = bul(sonuc, 'yonetilen_blok');
    assert.equal(bloklar.length, 2);
    assert.ok(bloklar.every(k => k.durum === 'uyari'));

    assert.equal(bul(sonuc, 'bayat_not').length, 2);
    assert.ok(bul(sonuc, 'bayat_not').every(k => k.durum === 'uyari'));

    assert.equal(bul(sonuc, 'son_yakalama')[0].durum, 'uyari');
    assert.match(bul(sonuc, 'son_yakalama')[0].mesaj, /15 gün/u);

    const guncelleme = bul(sonuc, 'guncelleme');
    assert.equal(guncelleme.length, 2);
    assert.ok(guncelleme.some(k => k.mesaj.includes('2.0.0') && k.mesaj.includes('node beyin.mjs guncelle')));
    assert.ok(guncelleme.every(k => k.durum === 'uyari'));

    const kilitler = bul(sonuc, 'kilit');
    assert.equal(kilitler.length, 1);
    assert.equal(kilitler[0].durum, 'uyari');
    assert.match(kilitler[0].mesaj, /yakala\.kilit/u);

    const log = bul(sonuc, 'hata_gunlugu')[0];
    assert.equal(log.durum, 'uyari');
    assert.match(log.mesaj, /2 hata/u);
  } finally {
    kaldir(kok);
  }
});

test('doktor: oturum yoksa, kayıt yoksa ve bağımlılık patlarsa fırlatmaz', async () => {
  const kullanici = { ...KULLANICI_DOSYALARI, 'gunluk/2026-10-15.md': '# boş gün\n' };
  const kok = kasaKur({ kullanici });
  try {
    const patlayan = () => { throw new Error('modul_yok'); };
    const sonuc = await doktor(kok, {
      simdi: SIMDI, kancaDurumuFn: patlayan, manifestOkuFn: () => null, bayatNotlarFn: patlayan, nodeSurumu: '18.19.0',
    });
    bicimiDogrula(sonuc);
    assert.equal(sonuc.saglikli, false);
    assert.equal(bul(sonuc, 'node')[0].durum, 'hata');
    assert.equal(bul(sonuc, 'manifest')[0].durum, 'hata');
    assert.equal(bul(sonuc, 'son_yakalama')[0].durum, 'uyari');
    assert.match(bul(sonuc, 'son_yakalama')[0].mesaj, /Henüz oturum yakalanmadı/u);
    assert.equal(bul(sonuc, 'kanca')[0].durum, 'uyari');
    assert.match(bul(sonuc, 'kanca')[0].mesaj, /denetlenemedi/u);
    assert.equal(bul(sonuc, 'bayat_not')[0].durum, 'uyari');
    assert.equal(bul(sonuc, 'surum')[0].durum, 'uyari');
  } finally {
    kaldir(kok);
  }
});

test('doktor: güncelleme sırasında tutulan taze kilit sorun sayılmaz', async () => {
  const kok = kasaKur();
  try {
    const durum = join(kok, '.beyin', 'durum');
    mkdirSync(durum, { recursive: true });
    writeFileSync(join(durum, 'guncelle.kilit'), '{}');
    const sonuc = await doktor(kok, { simdi: new Date(), kancaDurumuFn: kancalarTam, manifestOkuFn, bayatNotlarFn: bayatYok });
    assert.deepEqual(bul(sonuc, 'kilit').map(k => k.durum), ['tamam']);
  } finally {
    kaldir(kok);
  }
});

test('doktor: eksik klasör mesajı onar\'ın gerçekte yaptığını söyler (boş oluşturur; sistem/ için onar demez)', async () => {
  const kok = kasaKur();
  try {
    rmSync(join(kok, 'gunluk'), { recursive: true, force: true });
    let sonuc = await doktor(kok, { simdi: SIMDI, kancaDurumuFn: kancalarTam, manifestOkuFn, bayatNotlarFn: bayatYok });
    let mesaj = bul(sonuc, 'kasa_duzeni')[0].mesaj;
    assert.match(mesaj, /boş olarak yeniden oluşturur/u);
    assert.doesNotMatch(mesaj, /sistem\/ klasörü onar ile oluşmaz/u);
    rmSync(join(kok, 'sistem'), { recursive: true, force: true });
    sonuc = await doktor(kok, { simdi: SIMDI, kancaDurumuFn: kancalarTam, manifestOkuFn, bayatNotlarFn: bayatYok });
    mesaj = bul(sonuc, 'kasa_duzeni')[0].mesaj;
    assert.match(mesaj, /sistem\/ klasörü onar ile oluşmaz/u);
  } finally {
    kaldir(kok);
  }
});
