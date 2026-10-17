import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { ozyinelemeliKopyala } from '../sistem/lib/yol.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  arkaPlanKontrol, dogrulamaDegerlendir, geriAl, guncelle, guncellemeBildirimi, kontrolZamaniMi,
  paketiDogrula, paketiUygula, sonSurumuBul, surumKarsilastir,
} from '../sistem/lib/guncelle.mjs';
import { kilitAl } from '../sistem/lib/yol.mjs';
import {
  cagrilar, geciciKlasor, kaldir, kasaKur, kullaniciOzeti, manifestYazSahte, paketYap,
  sha as shaHex, sistemDosyalari, yonetilenOzeti,
} from './fixtures/b-yardimci/kasa.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

const onarFn = kok => { manifestYazSahte(kok); };
const saglikli = async () => true;
const hatayla = kod => err => err instanceof Error && err.message === kod;

function yeniPaket(surum = '1.1.0', secenekler = {}) {
  return paketYap(surum, sistemDosyalari(surum, secenekler));
}

// ---------------------------------------------------------------- semver

test('surumKarsilastir: sıra, ön sürüm ve geçersiz girdi', () => {
  assert.equal(surumKarsilastir('1.0.0', '1.0.0'), 0);
  assert.equal(surumKarsilastir('1.0.1', '1.0.0'), 1);
  assert.equal(surumKarsilastir('1.2.0', '1.10.0'), -1);
  assert.equal(surumKarsilastir('2.0.0', '1.99.99'), 1);
  assert.equal(surumKarsilastir('1.0.0-beta', '1.0.0'), -1);
  assert.equal(surumKarsilastir('1.0.0', '1.0.0-rc.1'), 1);
  assert.equal(surumKarsilastir('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(surumKarsilastir('1.0.0-alpha.2', '1.0.0-alpha.10'), -1);
  assert.equal(surumKarsilastir('1.0.0-1', '1.0.0-alpha'), -1);
  assert.equal(surumKarsilastir('1.0.0-beta', '1.0.0-alpha'), 1);
  for (const kotu of ['1.0', 'v1.0.0', '01.0.0', '1.0.0-', '', null, '1.0.0+build', ' 1.0.0']) {
    assert.throws(() => surumKarsilastir(kotu, '1.0.0'), hatayla('surum_gecersiz'), String(kotu));
  }
});

// ---------------------------------------------------------------- doğrulama

test('paketiDogrula: geçerli paketi kabul eder', () => {
  const { buffer, sha } = yeniPaket();
  const paket = paketiDogrula(buffer, sha.toUpperCase());
  assert.equal(paket.surum, '1.1.0');
  assert.equal(paket.dosyalar.length, 4);
});

test('paketiDogrula: bozuk sha, yollar, ekstra anahtar ve içerik uyuşmazlığını reddeder', () => {
  const temel = sistemDosyalari('1.1.0');
  const { buffer } = yeniPaket();
  assert.throws(() => paketiDogrula(buffer, 'a'.repeat(64)), hatayla('sha_uyusmuyor'));
  assert.throws(() => paketiDogrula(buffer, 'kisa'), hatayla('sha_gecersiz'));

  const reddet = (kod, dosyalar, degistir) => {
    const p = paketYap('1.1.0', dosyalar, { degistir });
    assert.throws(() => paketiDogrula(p.buffer, p.sha), hatayla(kod));
  };
  reddet('yol_reddedildi', { ...temel, 'sistem/../notlar/x.md': 'x' });
  reddet('yol_reddedildi', { ...temel, '../disari.mjs': 'x' });
  reddet('yol_reddedildi', { ...temel, '/etc/passwd': 'x' });
  reddet('yol_reddedildi', { ...temel, 'C:/Windows/x.mjs': 'x' });
  reddet('yol_reddedildi', { ...temel, 'notlar/x.md': 'x' });
  reddet('yol_reddedildi', { ...temel, 'beynim/ben-kimim.md': 'x' });
  reddet('yol_reddedildi', { ...temel, 'sistem\\lib\\y.mjs': 'x' });
  reddet('yol_reddedildi', { ...temel, 'sistem/lib/a:b': 'x' });
  reddet('yol_reddedildi', { ...temel, 'sistem/con.txt': 'x' });
  reddet('yol_reddedildi', { ...temel, 'sistem/lib/x.mjs/ic.mjs': 'x' });
  reddet('yol_tekrar', { ...temel, 'sistem/LIB/x.mjs': 'x' });
  reddet('sema_gecersiz', temel, p => ({ ...p, fazla: 1 }));
  reddet('sema_gecersiz', temel, p => { p.dosyalar[0].mod = 'x'; });
  reddet('sema_gecersiz', temel, p => ({ ...p, sema: 'dijital-beyin.paket/v2' }));
  reddet('sema_gecersiz', temel, p => { delete p.olusturuldu; });
  reddet('icerik_sha_uyusmuyor', temel, p => { p.dosyalar[0].sha256 = 'b'.repeat(64); });
  reddet('icerik_sha_uyusmuyor', temel, p => { p.dosyalar[0].icerik_b64 = Buffer.from('baska').toString('base64'); });
  const { 'sistem/cli.mjs': _cli, ...cliYok } = temel;
  reddet('zorunlu_dosya_eksik', cliYok);
  reddet('surum_uyusmuyor', { ...temel, 'sistem/surum.json': '{"surum":"9.9.9"}' });
  reddet('node_surumu_eski', temel, p => { p.min_node = '999'; });

  const bozukJson = Buffer.from('{bozuk');
  assert.throws(() => paketiDogrula(bozukJson, shaHex(bozukJson)), hatayla('sema_gecersiz'));
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buffer]);
  assert.throws(() => paketiDogrula(bom, shaHex(bom)), hatayla('sema_gecersiz'));
});

// ---------------------------------------------------------------- uygulama

test('paketiUygula: kullanıcı dosyaları bayt bayt aynı, eski dosya silinir, yerel değişiklik saklanır', async () => {
  const kok = kasaKur({ ek: { 'sistem/lib/eski.mjs': 'eski\n' } });
  try {
    writeFileSync(join(kok, 'sistem', 'lib', 'x.mjs'), '// Elif burayı değiştirdi\n');
    const onceKullanici = kullaniciOzeti(kok);
    const yeni = sistemDosyalari('1.1.0', { ek: { 'sistem/lib/yeni.mjs': 'yeni\n' } });
    const { buffer, sha } = paketYap('1.1.0', yeni);
    const paket = paketiDogrula(buffer, sha);

    const sonuc = await paketiUygula(kok, paket, { simdi: new Date('2026-10-17T10:00:00Z'), onarFn, dogrulaFn: saglikli });

    assert.equal(sonuc.eskiSurum, '1.0.0');
    assert.equal(sonuc.yeniSurum, '1.1.0');
    assert.deepEqual(sonuc.yerelDegisiklikler, ['sistem/lib/x.mjs']);
    assert.deepEqual(kullaniciOzeti(kok), onceKullanici);
    assert.equal(existsSync(join(kok, 'sistem', 'lib', 'eski.mjs')), false);
    for (const [rel, icerik] of Object.entries(yeni)) {
      assert.equal(readFileSync(join(kok, ...rel.split('/')), 'utf8'), icerik, rel);
    }
    const yerel = join(kok, '.beyin', 'yerel-degisiklikler');
    const [damga] = readdirSync(yerel);
    assert.equal(readFileSync(join(yerel, damga, 'sistem', 'lib', 'x.mjs'), 'utf8'), '// Elif burayı değiştirdi\n');
    const yedek = JSON.parse(readFileSync(join(sonuc.yedekDizin, 'yedek.json'), 'utf8'));
    assert.equal(yedek.eskiSurum, '1.0.0');
    assert.ok(yedek.dosyalar.includes('sistem/lib/eski.mjs'));
    assert.deepEqual(yedek.olmayanlar, ['sistem/lib/yeni.mjs']);
    assert.match(sonuc.yedekDizin, /1\.0\.0-20261017100000$/u);
    assert.equal(JSON.parse(readFileSync(join(kok, '.beyin', 'kurulum.json'), 'utf8')).surum, '1.1.0');
    assert.equal(existsSync(join(kok, '.beyin', 'durum', 'guncelle.kilit')), false);
  } finally {
    kaldir(kok);
  }
});

for (const [ad, dogrulaFn] of [
  ['false dönen', async () => false],
  ['fırlatan', async () => { throw new Error('patladi'); }],
]) {
  test(`paketiUygula: ${ad} doğrulama tam geri alır`, async () => {
    const kok = kasaKur({ ek: { 'sistem/lib/eski.mjs': 'eski\n' } });
    try {
      const onceYonetilen = yonetilenOzeti(kok);
      const onceKullanici = kullaniciOzeti(kok);
      const { buffer, sha } = paketYap('1.1.0', sistemDosyalari('1.1.0', { ek: { 'sistem/lib/yeni.mjs': 'yeni\n' } }));
      const paket = paketiDogrula(buffer, sha);
      await assert.rejects(paketiUygula(kok, paket, { onarFn, dogrulaFn }), hatayla('dogrulama_basarisiz_geri_alindi'));
      assert.deepEqual(yonetilenOzeti(kok), onceYonetilen);
      assert.deepEqual(kullaniciOzeti(kok), onceKullanici);
      assert.equal(existsSync(join(kok, 'sistem', 'lib', 'yeni.mjs')), false);
      assert.equal(existsSync(join(kok, '.beyin', 'durum', 'guncelle.kilit')), false);
      // Başarılı otomatik geri almadan sonra o yedek tutulmaz; geri-al anlamlı kalır.
      assert.throws(() => geriAl(kok), hatayla('yedek_yok'));
    } finally {
      kaldir(kok);
    }
  });
}

test('paketiUygula: onar hatası da geri alır', async () => {
  const kok = kasaKur();
  try {
    const once = yonetilenOzeti(kok);
    const { buffer, sha } = yeniPaket();
    await assert.rejects(
      paketiUygula(kok, paketiDogrula(buffer, sha), { onarFn: () => { throw new Error('onar_yok'); }, dogrulaFn: saglikli }),
      hatayla('uygulama_basarisiz_geri_alindi'),
    );
    assert.deepEqual(yonetilenOzeti(kok), once);
  } finally {
    kaldir(kok);
  }
});

test('paketiUygula: varsayılan doğrulama alt süreçte doktor --json çalıştırır', async () => {
  const kok = kasaKur();
  try {
    const once = yonetilenOzeti(kok);
    // Çıkış 1; çıkış 0 ama çıktı yok (sessiz başarı sayılmaz); çıkış 0 ama saglikli:false.
    for (const secenek of [{ cliCikis: 1 }, { doktorCikti: '' }, { doktorCikti: '{"saglikli":false,"kontroller":[]}' }]) {
      const kotu = paketYap('1.1.0', sistemDosyalari('1.1.0', secenek));
      await assert.rejects(
        paketiUygula(kok, paketiDogrula(kotu.buffer, kotu.sha), { onarFn }),
        hatayla('dogrulama_basarisiz_geri_alindi'),
        JSON.stringify(secenek),
      );
      assert.deepEqual(yonetilenOzeti(kok), once);
    }
    const iyi = yeniPaket('1.2.0');
    const sonuc = await paketiUygula(kok, paketiDogrula(iyi.buffer, iyi.sha), { onarFn });
    assert.equal(sonuc.yeniSurum, '1.2.0');
  } finally {
    kaldir(kok);
  }
});

test('geriAl: son yedeğe döner; yedek yoksa yedek_yok', async () => {
  const kok = kasaKur({ ek: { 'sistem/lib/eski.mjs': 'eski\n' } });
  try {
    assert.throws(() => geriAl(kok), hatayla('yedek_yok'));
    const once = yonetilenOzeti(kok);
    const onceKullanici = kullaniciOzeti(kok);
    const { buffer, sha } = yeniPaket();
    await paketiUygula(kok, paketiDogrula(buffer, sha), { onarFn, dogrulaFn: saglikli });
    assert.notDeepEqual(yonetilenOzeti(kok), once);
    const sonuc = geriAl(kok);
    assert.deepEqual(sonuc, { geriAlinanSurum: '1.0.0' });
    assert.deepEqual(yonetilenOzeti(kok), once);
    assert.deepEqual(kullaniciOzeti(kok), onceKullanici);
  } finally {
    kaldir(kok);
  }
});

test('paketiUygula: eşzamanlı çalışma kilit_mesgul ile reddedilir', async () => {
  const kok = kasaKur();
  try {
    const once = yonetilenOzeti(kok);
    const birak = kilitAl(kok, 'guncelle');
    try {
      const { buffer, sha } = yeniPaket();
      await assert.rejects(paketiUygula(kok, paketiDogrula(buffer, sha), { onarFn, dogrulaFn: saglikli }), hatayla('kilit_mesgul'));
      assert.throws(() => geriAl(kok), hatayla('kilit_mesgul'));
    } finally {
      birak();
    }
    assert.deepEqual(yonetilenOzeti(kok), once);
  } finally {
    kaldir(kok);
  }
});

test('paketiUygula: en fazla 3 yedek tutulur', async () => {
  const kok = kasaKur();
  try {
    const simdi = new Date('2026-10-17T10:00:00Z');
    for (const surum of ['1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.5.0']) {
      const { buffer, sha } = yeniPaket(surum);
      await paketiUygula(kok, paketiDogrula(buffer, sha), { simdi, onarFn, dogrulaFn: saglikli });
    }
    // Aynı saniyede beş güncelleme: sıra numarası en yeni üçünü doğru seçer.
    const yedekler = readdirSync(join(kok, '.beyin', 'yedek')).sort();
    assert.deepEqual(yedekler, ['1.2.0-20261017100000', '1.3.0-20261017100000', '1.4.0-20261017100000']);
    assert.deepEqual(geriAl(kok), { geriAlinanSurum: '1.4.0' });
  } finally {
    kaldir(kok);
  }
});

// ---------------------------------------------------------------- ağ

function sahteFetch(yollarHaritasi, kayit = []) {
  return async (url, secenekler = {}) => {
    kayit.push({ url, secenekler });
    const cevap = yollarHaritasi[url];
    if (!cevap) return new Response('yok', { status: 404 });
    if (typeof cevap === 'function') return cevap();
    return cevap;
  };
}

const API = 'https://api.github.com/repos/elif/dijital-beyin/releases/latest';

function surumCevabi(surum, varliklar) {
  return new Response(JSON.stringify({
    tag_name: `v${surum}`,
    assets: varliklar ?? [
      { name: `beyin-paket-${surum}.json`, browser_download_url: `https://ornek.test/p-${surum}.json` },
      { name: `beyin-paket-${surum}.json.sha256`, browser_download_url: `https://ornek.test/p-${surum}.json.sha256` },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('sonSurumuBul: en son sürümü ve varlık adreslerini bulur', async () => {
  const kayit = [];
  const sonuc = await sonSurumuBul({ repo: 'elif/dijital-beyin', fetchFn: sahteFetch({ [API]: surumCevabi('1.2.3') }, kayit) });
  assert.deepEqual(sonuc, {
    surum: '1.2.3',
    paketUrl: 'https://ornek.test/p-1.2.3.json',
    shaUrl: 'https://ornek.test/p-1.2.3.json.sha256',
  });
  assert.equal(kayit[0].url, API);
  assert.equal(kayit[0].secenekler.headers.Accept, 'application/vnd.github+json');
  assert.equal(kayit[0].secenekler.headers['User-Agent'], 'dijital-beyin');
  assert.equal(kayit[0].secenekler.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.ok(kayit[0].secenekler.signal instanceof AbortSignal);
});

test('sonSurumuBul: eksik varlık, sınır, http adresi ve geçersiz depo', async () => {
  const repo = 'elif/dijital-beyin';
  await assert.rejects(sonSurumuBul({ repo, fetchFn: sahteFetch({ [API]: surumCevabi('1.2.3', [
    { name: 'beyin-paket-1.2.3.json', browser_download_url: 'https://ornek.test/p.json' },
  ]) }) }), hatayla('paket_bulunamadi'));
  await assert.rejects(sonSurumuBul({ repo, fetchFn: sahteFetch({ [API]: surumCevabi('1.2.3', [
    { name: 'beyin-paket-1.2.4.json', browser_download_url: 'https://ornek.test/p.json' },
    { name: 'beyin-paket-1.2.4.json.sha256', browser_download_url: 'https://ornek.test/p.json.sha256' },
  ]) }) }), hatayla('paket_bulunamadi'));
  await assert.rejects(sonSurumuBul({ repo, fetchFn: sahteFetch({}) }), hatayla('paket_bulunamadi'));
  await assert.rejects(sonSurumuBul({ repo, fetchFn: sahteFetch({ [API]: new Response('', { status: 403 }) }) }), hatayla('github_sinir'));
  await assert.rejects(sonSurumuBul({ repo, fetchFn: sahteFetch({ [API]: new Response('', { status: 429 }) }) }), hatayla('github_sinir'));
  await assert.rejects(sonSurumuBul({ repo, fetchFn: sahteFetch({ [API]: surumCevabi('1.2.3', [
    { name: 'beyin-paket-1.2.3.json', browser_download_url: 'http://ornek.test/p.json' },
    { name: 'beyin-paket-1.2.3.json.sha256', browser_download_url: 'https://ornek.test/p.json.sha256' },
  ]) }) }), hatayla('https_gerekli'));
  await assert.rejects(sonSurumuBul({ repo, fetchFn: async () => { throw new Error('dns'); } }), hatayla('ag_hatasi'));
  for (const kotu of ['elif', 'elif/../x', 'https://github.com/elif/x', 'elif/x?y', '']) {
    await assert.rejects(sonSurumuBul({ repo: kotu, fetchFn: sahteFetch({}) }), hatayla('repo_gecersiz'), kotu);
  }
});

// ---------------------------------------------------------------- guncelle

test('guncelle: çevrimdışı paket yolu, kontrol, güncel ve zorla', async () => {
  const kok = kasaKur();
  const dis = geciciKlasor();
  try {
    const { buffer, sha } = yeniPaket('1.1.0');
    const paketDosyasi = join(dis, 'beyin-paket-1.1.0.json');
    const shaDosyasi = `${paketDosyasi}.sha256`;
    writeFileSync(paketDosyasi, buffer);
    writeFileSync(shaDosyasi, `${sha}  beyin-paket-1.1.0.json\n`);
    const ortak = { paketDosyasi, shaDosyasi, onarFn, dogrulaFn: saglikli };

    await assert.rejects(guncelle(kok, { paketDosyasi }), hatayla('sha_dosyasi_gerekli'));
    assert.deepEqual(await guncelle(kok, { ...ortak, kontrol: true }), { durum: 'mevcut', mevcutSurum: '1.0.0', enSonSurum: '1.1.0' });
    assert.equal(readFileSync(join(kok, 'sistem', 'lib', 'x.mjs'), 'utf8'), "export const x = '1.0.0';\n");

    const onceKullanici = kullaniciOzeti(kok);
    const sonuc = await guncelle(kok, ortak);
    assert.equal(sonuc.durum, 'guncellendi');
    assert.equal(sonuc.eskiSurum, '1.0.0');
    assert.equal(sonuc.yeniSurum, '1.1.0');
    assert.deepEqual(sonuc.yerelDegisiklikler, []);
    assert.deepEqual(kullaniciOzeti(kok), onceKullanici);

    assert.equal((await guncelle(kok, ortak)).durum, 'guncel');
    assert.equal((await guncelle(kok, { ...ortak, kontrol: true })).durum, 'guncel');
    assert.equal((await guncelle(kok, { ...ortak, zorla: true })).durum, 'guncellendi');

    // Bozuk sürüm dosyası: normalde reddedilir, --zorla ile paketten onarılır.
    writeFileSync(join(kok, 'sistem', 'surum.json'), '{bozuk');
    await assert.rejects(guncelle(kok, ortak), hatayla('surum_gecersiz'));
    const onarim = await guncelle(kok, { ...ortak, zorla: true });
    assert.equal(onarim.durum, 'guncellendi');
    assert.deepEqual(onarim.yerelDegisiklikler, ['sistem/surum.json']);
    assert.equal(JSON.parse(readFileSync(join(kok, 'sistem', 'surum.json'), 'utf8')).surum, '1.1.0');

    writeFileSync(shaDosyasi, `${'0'.repeat(64)}\n`);
    await assert.rejects(guncelle(kok, ortak), hatayla('sha_uyusmuyor'));
  } finally {
    kaldir(kok);
    kaldir(dis);
  }
});

test('guncelle: çevrim içi yol sha dosyasını ve paketi indirip uygular', async () => {
  const kok = kasaKur();
  try {
    const { buffer, sha } = yeniPaket('1.2.0');
    const fetchFn = sahteFetch({
      [API]: () => surumCevabi('1.2.0'),
      'https://ornek.test/p-1.2.0.json': () => new Response(buffer, { status: 200 }),
      'https://ornek.test/p-1.2.0.json.sha256': () => new Response(`${sha}  beyin-paket-1.2.0.json\n`, { status: 200 }),
    });
    assert.equal((await guncelle(kok, { kontrol: true, fetchFn })).durum, 'mevcut');
    const sonuc = await guncelle(kok, { fetchFn, onarFn, dogrulaFn: saglikli });
    assert.equal(sonuc.durum, 'guncellendi');
    assert.equal(sonuc.yeniSurum, '1.2.0');

    const buyuk = sahteFetch({
      [API]: () => surumCevabi('1.3.0'),
      'https://ornek.test/p-1.3.0.json.sha256': () => new Response(`${sha}\n`),
      'https://ornek.test/p-1.3.0.json': () => new Response(Buffer.alloc(11 * 1024 * 1024)),
    });
    await assert.rejects(guncelle(kok, { fetchFn: buyuk, onarFn, dogrulaFn: saglikli }), hatayla('paket_cok_buyuk'));
  } finally {
    kaldir(kok);
  }
});

// ---------------------------------------------------------------- arka plan

test('kontrolZamaniMi, arkaPlanKontrol ve guncellemeBildirimi', async () => {
  const kok = kasaKur();
  try {
    const simdi = new Date('2026-10-17T08:00:00Z');
    assert.equal(kontrolZamaniMi(kok, simdi), true);
    assert.equal(guncellemeBildirimi(kok), null);

    const kayit = await arkaPlanKontrol(kok, { fetchFn: sahteFetch({ [API]: surumCevabi('1.4.0') }), simdi });
    assert.deepEqual(kayit, { son_kontrol: simdi.toISOString(), en_son_surum: '1.4.0' });
    assert.equal(kontrolZamaniMi(kok, new Date('2026-10-17T09:00:00Z')), false);
    assert.equal(kontrolZamaniMi(kok, new Date('2026-10-18T05:00:00Z')), true);
    assert.equal(await arkaPlanKontrol(kok, { fetchFn: () => { throw new Error('cagrilmamali'); }, simdi }), null);

    const bildirim = guncellemeBildirimi(kok);
    assert.match(bildirim, /1\.4\.0/u);
    assert.match(bildirim, /node beyin\.mjs guncelle/u);
    assert.ok(!bildirim.includes('\n'));

    writeFileSync(join(kok, '.beyin', 'tercihler.json'), '{"guncelleme_bildirimi": false}\n');
    assert.equal(guncellemeBildirimi(kok), null);
    writeFileSync(join(kok, '.beyin', 'tercihler.json'), '{}\n');

    const sonra = new Date('2026-10-18T09:00:00Z');
    const hataKaydi = await arkaPlanKontrol(kok, { fetchFn: async () => { throw new Error('ag yok'); }, simdi: sonra });
    assert.equal(hataKaydi.son_kontrol, sonra.toISOString());
    assert.equal(hataKaydi.hata, 'ag_hatasi');
    assert.equal(hataKaydi.en_son_surum, '1.4.0');

    writeFileSync(join(kok, '.beyin', 'durum', 'guncelleme.json'), '{"son_kontrol":"x","en_son_surum":"1.0.0"}');
    assert.equal(guncellemeBildirimi(kok), null);
    // Kasa olmayan bir yolda da asla fırlatmaz.
    await assert.doesNotReject(arkaPlanKontrol(join(kok, 'yok', 'burada'), { fetchFn: async () => { throw new Error('x'); } }));
  } finally {
    kaldir(kok);
  }
});

// ---------------------------------------------------------------- kesinti, kapı, bağlantı

const kontrol = (ad, durum = 'tamam') => ({ ad, durum, mesaj: ad });
const temelKontroller = () => [kontrol('node'), kontrol('manifest'), kontrol('surum'), kontrol('kanca_claude')];

function doktorluSistem(surum, kontroller, ek = {}) {
  const saglikli = !kontroller.some(k => k.durum === 'hata');
  return sistemDosyalari(surum, { doktorCikti: JSON.stringify({ saglikli, kontroller }), cliCikis: saglikli ? 0 : 1, ek });
}

function isaretVarMi(kok) {
  return existsSync(join(kok, '.beyin', 'durum', 'guncelleme-suruyor.json'));
}

test('paketiUygula: yazma sırası sistem/** → surum.json → beyin.mjs; işaret yazmadan önce durur', async () => {
  const kok = kasaKur();
  try {
    const sira = [];
    const { buffer, sha } = yeniPaket('1.1.0', { ek: { 'sistem/a.mjs': 'a\n', 'sistem/z/z.mjs': 'z\n' } });
    await paketiUygula(kok, paketiDogrula(buffer, sha), {
      onarFn,
      dogrulaFn: saglikli,
      adimFn: yol => { sira.push(yol); assert.ok(isaretVarMi(kok), `${yol} yazılırken işaret yok`); },
    });
    assert.deepEqual(sira.slice(-2), ['sistem/surum.json', 'beyin.mjs']);
    assert.deepEqual(sira.slice(0, -2), ['sistem/a.mjs', 'sistem/cli.mjs', 'sistem/lib/x.mjs', 'sistem/z/z.mjs']);
    assert.equal(isaretVarMi(kok), false);
  } finally {
    kaldir(kok);
  }
});

test('paketiUygula: yazma ortasında hata tam geri alır ve asıl nedeni taşır', async () => {
  const kok = kasaKur();
  try {
    const once = yonetilenOzeti(kok);
    const { buffer, sha } = yeniPaket('1.1.0');
    await assert.rejects(
      paketiUygula(kok, paketiDogrula(buffer, sha), {
        onarFn,
        dogrulaFn: saglikli,
        adimFn: (_yol, n) => { if (n === 2) throw Object.assign(new Error('erisim reddedildi'), { code: 'EPERM' }); },
      }),
      err => err.message === 'uygulama_basarisiz_geri_alindi' && /EPERM/u.test(err.ayrinti?.neden ?? ''),
    );
    assert.deepEqual(yonetilenOzeti(kok), once);
    assert.equal(isaretVarMi(kok), false);
    assert.equal(existsSync(join(kok, '.beyin', 'durum', 'guncelle.kilit')), false);
  } finally {
    kaldir(kok);
  }
});

test('guncelle: yarım kalmış kurulum "güncel" sayılmaz, aynı sürüm paketiyle onarılır', async () => {
  const kok = kasaKur({ surum: '1.1.0' });
  const dis = geciciKlasor();
  try {
    const { buffer, sha } = yeniPaket('1.1.0');
    const paketDosyasi = join(dis, 'p.json');
    const shaDosyasi = join(dis, 'p.json.sha256');
    writeFileSync(paketDosyasi, buffer);
    writeFileSync(shaDosyasi, `${sha}\n`);
    const ortak = { paketDosyasi, shaDosyasi, onarFn, dogrulaFn: saglikli };
    assert.equal((await guncelle(kok, { ...ortak, kontrol: true })).durum, 'guncel');

    // Kayıt (manifest) sürümü ile sürüm dosyası ayrışmış.
    const manifestYolu = join(kok, '.beyin', 'kurulum.json');
    const manifest = JSON.parse(readFileSync(manifestYolu, 'utf8'));
    writeFileSync(manifestYolu, JSON.stringify({ ...manifest, surum: '1.0.0' }));
    assert.deepEqual(await guncelle(kok, { ...ortak, kontrol: true }),
      { durum: 'mevcut', mevcutSurum: '1.1.0', enSonSurum: '1.1.0', onarim: true });
    assert.equal((await guncelle(kok, ortak)).durum, 'guncellendi');
    assert.equal(JSON.parse(readFileSync(manifestYolu, 'utf8')).surum, '1.1.0');

    // Yedeği olmayan bir işaret: yine onarım gerekir; uygulama işareti temizler.
    writeFileSync(join(kok, '.beyin', 'durum', 'guncelleme-suruyor.json'), '{"yedek":"yok-boyle-bir-yedek"}');
    assert.equal((await guncelle(kok, { ...ortak, kontrol: true })).onarim, true);
    assert.equal((await guncelle(kok, ortak)).durum, 'guncellendi');
    assert.equal(isaretVarMi(kok), false);
    assert.equal((await guncelle(kok, ortak)).durum, 'guncel');
  } finally {
    kaldir(kok);
    kaldir(dis);
  }
});

test("geri alma yolları geri yüklenen sürümün onar'ını çalıştırır; onar hatası geri almayı bozmaz", async () => {
  const kok = kasaKur();
  try {
    const once = yonetilenOzeti(kok);
    const onceKullanici = kullaniciOzeti(kok);
    const { buffer, sha } = yeniPaket('1.1.0');
    const paket = paketiDogrula(buffer, sha);

    // Otomatik geri alma: güncellemedeki onar + geri almadaki onar.
    const surumler = [];
    const sayanOnar = k => {
      surumler.push(JSON.parse(readFileSync(join(k, 'sistem', 'surum.json'), 'utf8')).surum);
      manifestYazSahte(k);
    };
    await assert.rejects(paketiUygula(kok, paket, { onarFn: sayanOnar, dogrulaFn: async () => false }),
      hatayla('dogrulama_basarisiz_geri_alindi'));
    assert.deepEqual(surumler, ['1.1.0', '1.0.0']);
    assert.deepEqual(yonetilenOzeti(kok), once);

    // Geri almadaki onar patlarsa: dosyalar yine geri yüklü, hata ayrıntıda.
    let cagri = 0;
    const ikinciPatlar = k => {
      cagri += 1;
      if (cagri === 2) throw new Error('kanca yazilamadi');
      manifestYazSahte(k);
    };
    await assert.rejects(paketiUygula(kok, paket, { onarFn: ikinciPatlar, dogrulaFn: async () => false }),
      err => err.message === 'dogrulama_basarisiz_geri_alindi' && /kanca yazilamadi/u.test(err.ayrinti?.onarHatasi ?? ''));
    assert.deepEqual(yonetilenOzeti(kok), once);

    // geri-al: varsayılan olarak geri yüklenen başlatıcıyla `onar` alt süreci.
    await paketiUygula(kok, paket, { onarFn, dogrulaFn: saglikli });
    const oncekiCagri = cagrilar(kok).length;
    assert.deepEqual(geriAl(kok), { geriAlinanSurum: '1.0.0' });
    assert.deepEqual(cagrilar(kok).slice(oncekiCagri), ['1.0.0 onar']);
    assert.deepEqual(yonetilenOzeti(kok), once);
    assert.deepEqual(kullaniciOzeti(kok), onceKullanici);
    assert.equal(isaretVarMi(kok), false);

    // geri-al + onar hatası: geri alma tamam, hata dönüşte.
    await paketiUygula(kok, paket, { onarFn, dogrulaFn: saglikli });
    const sonuc = geriAl(kok, { onarFn: () => { throw new Error('onar patladi'); } });
    assert.equal(sonuc.geriAlinanSurum, '1.0.0');
    assert.match(sonuc.onarHatasi, /onar patladi/u);
    assert.deepEqual(yonetilenOzeti(kok), once);
  } finally {
    kaldir(kok);
  }
});

test('doğrulama kapısı: kullanıcı durumu hatası geri aldırmaz, güncellemenin bozduğu kontrol aldırır', async () => {
  // Saf değerlendirme.
  assert.equal(dogrulamaDegerlendir(true).gecti, true);
  assert.equal(dogrulamaDegerlendir(false).gecti, false);
  assert.equal(dogrulamaDegerlendir(null).gecti, false);
  assert.equal(dogrulamaDegerlendir({ saglikli: false, kontroller: [] }).gecti, false);
  assert.deepEqual(dogrulamaDegerlendir({ saglikli: false, kontroller: [...temelKontroller(), kontrol('kasa_duzeni', 'hata')] }),
    { gecti: true, basarisizlar: [] });
  assert.deepEqual(dogrulamaDegerlendir({ saglikli: false, kontroller: [...temelKontroller(), kontrol('yeni_kontrol', 'hata')] }),
    { gecti: false, basarisizlar: ['yeni_kontrol'] });
  assert.deepEqual(dogrulamaDegerlendir({ saglikli: true, kontroller: [kontrol('node'), kontrol('manifest'), kontrol('surum', 'uyari')] }),
    { gecti: false, basarisizlar: ['surum'] });

  // Alt süreçte gerçek kapı: günlük klasörü eksik (kasa_duzeni hata) → güncelleme kalır.
  const kok = kasaKur();
  try {
    const kotuKullanici = doktorluSistem('1.1.0', [...temelKontroller(), kontrol('kasa_duzeni', 'hata'), kontrol('son_yakalama', 'uyari')]);
    const p1 = paketYap('1.1.0', kotuKullanici);
    const sonuc = await paketiUygula(kok, paketiDogrula(p1.buffer, p1.sha), { onarFn });
    assert.equal(sonuc.yeniSurum, '1.1.0');

    const once = yonetilenOzeti(kok);
    const bozukManifest = doktorluSistem('1.2.0', [kontrol('node'), kontrol('manifest', 'hata'), kontrol('surum'), kontrol('kanca_claude', 'hata')]);
    const p2 = paketYap('1.2.0', bozukManifest);
    await assert.rejects(paketiUygula(kok, paketiDogrula(p2.buffer, p2.sha), { onarFn }),
      err => err.message === 'dogrulama_basarisiz_geri_alindi'
        && JSON.stringify(err.ayrinti?.kontroller) === JSON.stringify(['manifest', 'kanca_claude']));
    assert.deepEqual(yonetilenOzeti(kok), once);
  } finally {
    kaldir(kok);
  }
});

test('doğrulama kapısı: Codex kancası yalnız önceden sağlamsa geri aldırır', async () => {
  for (const [onceDurum, gecmeli] of [['tamam', false], ['uyari', true]]) {
    const kok = kasaKur({
      istemciler: ['claude', 'codex'],
      sistem: { doktorCikti: JSON.stringify({ saglikli: true, kontroller: [...temelKontroller(), kontrol('kanca_codex', onceDurum)] }) },
    });
    try {
      const yeni = doktorluSistem('1.1.0', [...temelKontroller(), kontrol('kanca_codex', 'uyari')]);
      const { buffer, sha } = paketYap('1.1.0', yeni);
      const is = paketiUygula(kok, paketiDogrula(buffer, sha), { onarFn: k => manifestYazSahte(k, { istemciler: ['claude', 'codex'] }) });
      if (gecmeli) assert.equal((await is).yeniSurum, '1.1.0', onceDurum);
      else await assert.rejects(is, err => JSON.stringify(err.ayrinti?.kontroller) === '["kanca_codex"]', onceDurum);
    } finally {
      kaldir(kok);
    }
  }
});

test('manifest paketin gönderdiği dosyaları listeler; sonraki paket düşürünce dosya silinir', async () => {
  const kok = kasaKur();
  try {
    // onar manifesti yazmasa bile (alt süreç paketin listesini bilmez) güncelleme yazar.
    const hicbirSeyYapma = () => {};
    const ilk = sistemDosyalari('1.1.0', { ek: { 'sistem/lib/yeni.mjs': 'yeni\n' } });
    const p1 = paketYap('1.1.0', ilk);
    await paketiUygula(kok, paketiDogrula(p1.buffer, p1.sha), { onarFn: hicbirSeyYapma, dogrulaFn: saglikli });
    const m1 = JSON.parse(readFileSync(join(kok, '.beyin', 'kurulum.json'), 'utf8'));
    assert.equal(m1.surum, '1.1.0');
    assert.deepEqual(Object.keys(m1.dosyalar).sort(), Object.keys(ilk).sort());
    assert.equal(m1.dosyalar['sistem/lib/yeni.mjs'], shaHex('yeni\n'));

    const ikinci = sistemDosyalari('1.2.0');
    const p2 = paketYap('1.2.0', ikinci);
    await paketiUygula(kok, paketiDogrula(p2.buffer, p2.sha), { onarFn: hicbirSeyYapma, dogrulaFn: saglikli });
    assert.equal(existsSync(join(kok, 'sistem', 'lib', 'yeni.mjs')), false);
    const m2 = JSON.parse(readFileSync(join(kok, '.beyin', 'kurulum.json'), 'utf8'));
    assert.equal(m2.surum, '1.2.0');
    assert.deepEqual(Object.keys(m2.dosyalar).sort(), Object.keys(ikinci).sort());
  } finally {
    kaldir(kok);
  }
});

function baglantiKur(t, hedef, yol) {
  try {
    symlinkSync(hedef, yol, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch (error) {
    t.skip(`bağlantı oluşturulamadı: ${error.code}`);
    return false;
  }
}

test('bağlantı/junction ile kasa dışına yazma ve silme reddedilir', async t => {
  const kok = kasaKur({ ek: { 'sistem/lib/eski.mjs': 'eski\n' } });
  const dis = geciciKlasor();
  try {
    // Önce bir başarılı güncelleme: geri-al için yedek olsun.
    const p1 = yeniPaket('1.1.0', { ek: { 'sistem/lib/eski.mjs': 'eski\n' } });
    await paketiUygula(kok, paketiDogrula(p1.buffer, p1.sha), { onarFn, dogrulaFn: saglikli });

    // sistem/lib → kasa dışı.
    writeFileSync(join(dis, 'x.mjs'), 'dis dosya\n');
    writeFileSync(join(dis, 'eski.mjs'), 'dis eski\n');
    rmSync(join(kok, 'sistem', 'lib'), { recursive: true, force: true });
    if (!baglantiKur(t, dis, join(kok, 'sistem', 'lib'))) return;
    const disOzeti = () => Object.fromEntries(readdirSync(dis).sort().map(ad => [ad, readFileSync(join(dis, ad), 'utf8')]));
    const disOnce = disOzeti();
    // Paket eski.mjs'i düşürür: silme de kasa dışına taşmamalı.
    const p2 = yeniPaket('1.2.0');
    await assert.rejects(paketiUygula(kok, paketiDogrula(p2.buffer, p2.sha), { onarFn, dogrulaFn: saglikli }),
      hatayla('sistem_baglanti_reddedildi'));
    assert.throws(() => geriAl(kok, { onarFn: () => {} }), hatayla('sistem_baglanti_reddedildi'));
    assert.deepEqual(disOzeti(), disOnce);
    assert.equal(isaretVarMi(kok), false);
    assert.equal(existsSync(join(kok, '.beyin', 'durum', 'guncelle.kilit')), false);

    // sistem/ klasörünün kendisi bağlantı.
    rmSync(join(kok, 'sistem', 'lib'), { force: true });
    const disSistem = geciciKlasor();
    try {
      ozyinelemeliKopyala(join(kok, 'sistem'), disSistem);
      rmSync(join(kok, 'sistem'), { recursive: true, force: true });
      if (!baglantiKur(t, disSistem, join(kok, 'sistem'))) return;
      const sistemOnce = readFileSync(join(disSistem, 'cli.mjs'), 'utf8');
      await assert.rejects(paketiUygula(kok, paketiDogrula(p2.buffer, p2.sha), { onarFn, dogrulaFn: saglikli }),
        hatayla('sistem_baglanti_reddedildi'));
      assert.equal(readFileSync(join(disSistem, 'cli.mjs'), 'utf8'), sistemOnce);
      rmSync(join(kok, 'sistem'), { force: true });
    } finally {
      kaldir(disSistem);
    }
  } finally {
    // Bağlantı önce kaldırılır ki kasa silinirken hedefin içi silinmesin.
    try { rmSync(join(kok, 'sistem', 'lib'), { force: true }); } catch { /* yok */ }
    kaldir(kok);
    kaldir(dis);
  }
});

test('paketiDogrula: 5 MB dosya yığını taşırmadan doğrulanır; kanonik olmayan base64 reddedilir', () => {
  const buyuk = randomBytes(5 * 1024 * 1024);
  const { buffer, sha } = paketYap('1.1.0', sistemDosyalari('1.1.0', { ek: { 'sistem/buyuk.bin': buyuk } }));
  const paket = paketiDogrula(buffer, sha);
  assert.equal(Buffer.from(paket.dosyalar.find(d => d.yol === 'sistem/buyuk.bin').icerik_b64, 'base64').length, buyuk.length);

  const temel = sistemDosyalari('1.1.0', { ek: { 'sistem/a.txt': 'A' } });
  for (const kotu of ['QR==', 'Q===', 'QQ=A', 'QQ', 'Q Q=']) {
    const p = paketYap('1.1.0', temel, { degistir: x => { x.dosyalar.find(d => d.yol === 'sistem/a.txt').icerik_b64 = kotu; } });
    assert.throws(() => paketiDogrula(p.buffer, p.sha), hatayla('sema_gecersiz'), kotu);
  }
});

// ---------------------------------------------------------------- gerçek kit: kesinti ve kurtarma

function cocuk(args, { cwd, env } = {}) {
  const sonuc = spawnSync(process.execPath, args, {
    cwd, encoding: 'utf8', timeout: 90_000, env: { ...process.env, BEYIN_IC_CAGRI: '', ...env },
  });
  return { kod: sonuc.status, out: sonuc.stdout ?? '', err: sonuc.stderr ?? '' };
}

function gercekKasaKur() {
  const tmp = geciciKlasor();
  const kasa = join(tmp, 'Benim Beynim İş');
  const kur = cocuk([join(REPO, 'kur.mjs'), '--hedef', kasa], { cwd: tmp });
  assert.equal(kur.kod, 0, kur.err + kur.out);
  // Testte ağa çıkılmasın: günlük kontrol az önce yapılmış sayılır.
  const surum = JSON.parse(readFileSync(join(REPO, 'sistem', 'surum.json'), 'utf8')).surum;
  mkdirSync(join(kasa, '.beyin', 'durum'), { recursive: true });
  writeFileSync(join(kasa, '.beyin', 'durum', 'guncelleme.json'),
    JSON.stringify({ son_kontrol: new Date().toISOString(), en_son_surum: surum }));
  return { tmp, kasa };
}

function gercekPaketYap(tmp, surum, degistir) {
  const kopya = join(tmp, `kaynak-${surum}`);
  for (const ad of ['sistem', 'beyin.mjs', 'package.json', 'arac']) ozyinelemeliKopyala(join(REPO, ad), join(kopya, ad));
  const surumYolu = join(kopya, 'sistem', 'surum.json');
  writeFileSync(surumYolu, `${JSON.stringify({ ...JSON.parse(readFileSync(surumYolu, 'utf8')), surum }, null, 2)}\n`);
  const pj = join(kopya, 'package.json');
  writeFileSync(pj, `${JSON.stringify({ ...JSON.parse(readFileSync(pj, 'utf8')), version: surum }, null, 2)}\n`);
  degistir?.(kopya);
  const sonuc = cocuk([join(kopya, 'arac', 'paketle.mjs'), '--cikti', join(kopya, 'dist')], { cwd: kopya });
  assert.equal(sonuc.kod, 0, sonuc.err);
  return { paket: join(kopya, 'dist', `beyin-paket-${surum}.json`), sha: join(kopya, 'dist', `beyin-paket-${surum}.json.sha256`) };
}

test('kesilen güncelleme: başlatıcı yedeği geri koyar, kasa yeniden çalışır', () => {
  const { tmp, kasa } = gercekKasaKur();
  try {
    // Yeni cli.mjs, yeni yol.mjs'teki bir dışa aktarımı ister: yarım kalırsa ESM içe aktarma düşer.
    const { paket, sha } = gercekPaketYap(tmp, '9.9.0', kopya => {
      const cli = join(kopya, 'sistem', 'cli.mjs');
      writeFileSync(cli, `import { yeniYardimci } from './lib/yol.mjs';\nvoid yeniYardimci;\n${readFileSync(cli, 'utf8')}`);
      const yol = join(kopya, 'sistem', 'lib', 'yol.mjs');
      writeFileSync(yol, `${readFileSync(yol, 'utf8')}\nexport function yeniYardimci() {}\n`);
    });
    const once = yonetilenOzeti(kasa);
    const kes = join(tmp, 'kes.mjs');
    writeFileSync(kes, [
      "import { readFileSync } from 'node:fs';",
      'const [url, kok, paketYolu, shaYolu] = process.argv.slice(2);',
      'const { paketiDogrula, paketiUygula, shaMetniniAyir } = await import(url);',
      "const paket = paketiDogrula(readFileSync(paketYolu), shaMetniniAyir(readFileSync(shaYolu, 'utf8')));",
      // İlk yazılan dosya sistem/cli.mjs; hemen ardından süreç ölür (finally çalışmaz).
      'await paketiUygula(kok, paket, { adimFn: () => process.exit(7) });',
    ].join('\n'));
    const guncelleUrl = pathToFileURL(join(kasa, 'sistem', 'lib', 'guncelle.mjs')).href;
    const kesinti = cocuk([kes, guncelleUrl, kasa, paket, sha], { cwd: kasa });
    assert.equal(kesinti.kod, 7, kesinti.err);
    assert.ok(isaretVarMi(kasa));
    assert.ok(existsSync(join(kasa, '.beyin', 'durum', 'guncelle.kilit')), 'taze ama sahipsiz kilit kalmalı');

    // Hata yeniden üretilir: karışık sürümde cli.mjs içe aktarılamaz.
    const cliUrl = pathToFileURL(join(kasa, 'sistem', 'cli.mjs')).href;
    const kirik = cocuk(['--input-type=module', '-e', `await import(${JSON.stringify(cliUrl)});`], { cwd: kasa });
    assert.notEqual(kirik.kod, 0);
    assert.match(kirik.err, /yeniYardimci|SyntaxError/u);

    // Başlatıcı kurtarır ve komut çalışır.
    const doktor = cocuk([join(kasa, 'beyin.mjs'), 'doktor', '--json'], { cwd: kasa });
    assert.match(doktor.err, /Yarım kalan güncelleme geri alındı/u);
    const sonuc = JSON.parse(doktor.out);
    assert.equal(sonuc.saglikli, true, JSON.stringify(sonuc.kontroller.filter(k => k.durum === 'hata')));
    assert.equal(doktor.kod, 0);
    assert.deepEqual(yonetilenOzeti(kasa), once);
    assert.equal(isaretVarMi(kasa), false);
    assert.equal(existsSync(join(kasa, '.beyin', 'durum', 'guncelle.kilit')), false);
    assert.deepEqual(readdirSync(join(kasa, '.beyin', 'yedek')), []);

    // Kapıdan geçemeyen güncelleme: kullanıcıya hangi kontrolün düştüğü söylenir.
    const bozuk = gercekPaketYap(tmp, '9.8.0', kopya => {
      writeFileSync(join(kopya, 'sistem', 'lib', 'doktor.mjs'),
        'export async function doktor() { return { saglikli: false, kontroller: [{ ad: "manifest", durum: "hata", mesaj: "x" }] }; }\n');
    });
    const reddedilen = cocuk([join(kasa, 'beyin.mjs'), 'guncelle', '--paket', bozuk.paket, '--sha', bozuk.sha], { cwd: kasa });
    assert.equal(reddedilen.kod, 1);
    assert.match(reddedilen.err, /otomatik geri yüklendi/u);
    assert.match(reddedilen.err, /Geçemeyen kontroller: manifest/u);
    assert.deepEqual(yonetilenOzeti(kasa), once);

    // Sonra güncelleme baştan sona çalışır; günlük klasörü eksik olsa bile geri alınmaz.
    rmSync(join(kasa, 'gunluk'), { recursive: true, force: true });
    const guncelleme = cocuk([join(kasa, 'beyin.mjs'), 'guncelle', '--paket', paket, '--sha', sha], { cwd: kasa });
    assert.equal(guncelleme.kod, 0, guncelleme.err + guncelleme.out);
    assert.match(cocuk([join(kasa, 'beyin.mjs'), 'surum'], { cwd: kasa }).out, /9\.9\.0/u);
    assert.equal(isaretVarMi(kasa), false);

    // Doktorun önerdiği onarım yolu: kurulu kurulum.mjs eksikken de "guncelle --zorla" çalışır.
    const kurulumYolu = join(kasa, 'sistem', 'lib', 'kurulum.mjs');
    const kurulumIcerik = readFileSync(kurulumYolu);
    rmSync(kurulumYolu);
    const onarim = cocuk([join(kasa, 'beyin.mjs'), 'guncelle', '--zorla', '--paket', paket, '--sha', sha], { cwd: kasa });
    assert.equal(onarim.kod, 0, onarim.err + onarim.out);
    assert.deepEqual(readFileSync(kurulumYolu), kurulumIcerik);
    const sonManifest = JSON.parse(readFileSync(join(kasa, '.beyin', 'kurulum.json'), 'utf8'));
    assert.equal(sonManifest.dosyalar['sistem/lib/kurulum.mjs'], shaHex(kurulumIcerik));
  } finally {
    kaldir(tmp);
  }
});

test('başlatıcı canlı bir güncellemenin işaretine dokunmaz, sahipsiz kalınca işler', () => {
  const { tmp, kasa } = gercekKasaKur();
  try {
    const once = yonetilenOzeti(kasa);
    const durum = join(kasa, '.beyin', 'durum');
    // İşaretin gösterdiği yedek başka bir cli.mjs içerir; canlı kilit varken geri konmamalı.
    const yedekAdi = '0.0.1-20261017000000';
    const yedek = join(kasa, '.beyin', 'yedek', yedekAdi);
    const eskiCli = 'export async function main() { return 0; }\n';
    mkdirSync(join(yedek, 'dosyalar', 'sistem'), { recursive: true });
    writeFileSync(join(yedek, 'dosyalar', 'sistem', 'cli.mjs'), eskiCli);
    writeFileSync(join(yedek, 'yedek.json'), JSON.stringify({ eskiSurum: '0.0.1', sira: 1, dosyalar: ['sistem/cli.mjs'], olmayanlar: [] }));
    writeFileSync(join(durum, 'guncelleme-suruyor.json'), JSON.stringify({ yedek: yedekAdi }));
    writeFileSync(join(durum, 'guncelle.kilit'), JSON.stringify({ pid: process.pid, zaman: new Date().toISOString() }));
    const canli = cocuk([join(kasa, 'beyin.mjs'), 'surum'], { cwd: kasa });
    assert.equal(canli.kod, 0, canli.err);
    assert.deepEqual(yonetilenOzeti(kasa), once);
    assert.ok(isaretVarMi(kasa));

    // Kilit kalkınca başlatıcı işareti işler.
    rmSync(join(durum, 'guncelle.kilit'));
    const sonra = cocuk([join(kasa, 'beyin.mjs'), 'surum'], { cwd: kasa });
    assert.match(sonra.err, /geri alındı/u);
    assert.equal(isaretVarMi(kasa), false);
    assert.equal(readFileSync(join(kasa, 'sistem', 'cli.mjs'), 'utf8'), eskiCli);
  } finally {
    kaldir(tmp);
  }
});
