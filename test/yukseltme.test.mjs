// Yükseltme: gerçek v1.0.2 ağacından kurulan kasa, bu ağacın paketiyle güncellenir.
// v1.0.2 ağacı salt-okur git komutlarıyla (ls-tree, cat-file) geçici klasöre çıkarılır.
// Sığ klonda (etiket yoksa) ya da git yoksa test atlanır ve nedenini söyler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ozyinelemeliKopyala } from '../sistem/lib/yol.mjs';
import { geciciKlasor, kaldir } from './fixtures/b-yardimci/kasa.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ETIKET = 'v1.0.2';
const SURUM = JSON.parse(readFileSync(join(REPO, 'sistem', 'surum.json'), 'utf8')).surum;
// Bağlam sabit bir anla üretilir: iki çıktı arasında gün değişse bile karşılaştırma bozulmaz.
const AN = '2026-10-20T12:00:00';

function git(args, girdi) {
  return spawnSync('git', ['-C', REPO, ...args], { input: girdi, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
}

function atlamaNedeni() {
  const surum = git(['--version']);
  if (surum.error || surum.status !== 0) return 'git bulunamadı';
  const etiket = git(['rev-parse', '--verify', '--quiet', `${ETIKET}^{commit}`]);
  if (etiket.status !== 0) return `${ETIKET} etiketi bu klonda yok (sığ klon); etiketlerle klonlanınca çalışır`;
  return false;
}

// v1.0.2 ağacındaki dosyaları baytı baytına çıkarır (kurulum için gereken klasörler).
function v1Cikar(hedef) {
  const liste = git(['ls-tree', '-r', '-z', '--full-tree', ETIKET]);
  assert.equal(liste.status, 0, String(liste.stderr));
  const girdiler = liste.stdout.toString('utf8').split('\0').filter(Boolean).map(satir => {
    const [bas, yol] = satir.split('\t');
    const [mod, tur, nesne] = bas.split(' ');
    return { mod, tur, nesne, yol };
  }).filter(g => g.tur === 'blob' && g.mod !== '120000'
    && (/^(sistem|sablon)\//u.test(g.yol) || ['beyin.mjs', 'kur.mjs', 'package.json'].includes(g.yol)));
  const toplu = git(['cat-file', '--batch'], `${girdiler.map(g => g.nesne).join('\n')}\n`);
  assert.equal(toplu.status, 0, String(toplu.stderr));
  const tampon = toplu.stdout;
  let konum = 0;
  for (const g of girdiler) {
    const satirSonu = tampon.indexOf(0x0a, konum);
    const [nesne, tur, boyut] = tampon.subarray(konum, satirSonu).toString('utf8').split(' ');
    assert.equal(nesne, g.nesne);
    assert.equal(tur, 'blob');
    const bas = satirSonu + 1;
    const icerik = tampon.subarray(bas, bas + Number(boyut));
    konum = bas + Number(boyut) + 1;
    const dosya = join(hedef, ...g.yol.split('/'));
    mkdirSync(dirname(dosya), { recursive: true });
    writeFileSync(dosya, icerik);
  }
  return girdiler.length;
}

function cocuk(args, { cwd } = {}) {
  const sonuc = spawnSync(process.execPath, args, {
    cwd, encoding: 'utf8', timeout: 90_000, env: { ...process.env, BEYIN_IC_CAGRI: '' }, windowsHide: true,
  });
  return { kod: sonuc.status, out: sonuc.stdout ?? '', err: sonuc.stderr ?? '' };
}

// Kasanın o anki baglam.mjs'iyle, ayrı bir süreçte, sabit anla bağlam üretir.
function baglam(kasa) {
  const url = pathToFileURL(join(kasa, 'sistem', 'lib', 'baglam.mjs')).href;
  const betik = `const { baglamOlustur } = await import(${JSON.stringify(url)});`
    + `process.stdout.write(baglamOlustur(${JSON.stringify(kasa)}, { simdi: new Date(${JSON.stringify(AN)}) }));`;
  const sonuc = cocuk(['--input-type=module', '-e', betik], { cwd: kasa });
  assert.equal(sonuc.kod, 0, sonuc.err);
  return sonuc.out;
}

function anlik(dizin) {
  const out = {};
  const gez = (d, rel) => {
    for (const g of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${g.name}` : g.name;
      if (g.isDirectory()) gez(join(d, g.name), r);
      else out[r] = readFileSync(join(d, g.name)).toString('base64');
    }
  };
  gez(dizin, '');
  return out;
}

function doktorJson(kasa) {
  const doktor = cocuk([join(kasa, 'beyin.mjs'), 'doktor', '--json'], { cwd: kasa });
  return { kod: doktor.kod, sonuc: JSON.parse(doktor.out) };
}

// Bir 1.x kullanıcısının doldurduğu notlar (şablonların yerine).
const ELIF_V1 = {
  'beynim/ben-kimim.md': '---\ndate: 2026-06-01\n---\n# Ben kimim\n\n- Adım: Elif\n- Ne iş yapıyorum: serbest illüstratör, çocuk kitapları\n- Hangi dilde konuşalım: Türkçe\n',
  'beynim/aktif-projem.md': '---\ndate: 2026-10-12\n---\n# Şu an ne üzerinde çalışıyorum\n\n## Proje: Deniz feneri\n\n- Kimin için: Mavi Yayınevi\n- Teslim tarihi: 30 Ekim\n',
  'beynim/guncel-durum.md': '---\ndate: 2026-09-01\n---\n# Güncel durum\n\n- Bu hafta: kapak eskizleri\n- Beklediğim: yayınevinin renk onayı\n',
  'beynim/verdigim-kararlar.md': '# Verdiğim kararlar\n\n## Kararlar\n\n- 2026-10-01 — Kapakta sulu boya — müşteri sıcak ton istedi GEÇERSİZ (2026-10-05)\n- 2026-10-05 — Kapakta guaj — sulu boya baskıda soluk çıktı\n\n## Elediklerim\n\n- 2026-09-20 — Yapay zeka arka planı — yayınevi el işi istiyor\n',
  'beynim/eski-fiyat.md': '---\ndate: 2026-08-01\n---\nPoster fiyatı 1200 TL.\n',
  'beynim/fiyat-notu.md': '---\ndate: 2026-10-10\nsupersedes: eski-fiyat.md\n---\nPoster fiyatı 1500 TL.\n',
  'notlar/yayinevi.md': 'Yayınevi toplantısı: renkler onaylandı, iç sayfalara geçildi.\n',
};

const ESKI_CELISKI = '- When notes disagree, the note with the newer date wins.';
const YENI_CELISKI = '- When notes disagree, follow the note with the newer date and tell the user which line is out of date; ask whether to update it.';
const eskiKarar = dosya => `- To record a decision, append a dated line (\`- YYYY-MM-DD — decision — reason\`) to ${dosya}. When a decision is replaced, add \` GEÇERSİZ (YYYY-MM-DD)\` to the end of the old line. Never delete or rewrite old lines.`;
const yeniKarar = dosya => `- When the session produces a new decision, propose it to the user at the end; append it only after they agree, as a dated line (\`- YYYY-MM-DD — decision — reason\`) to ${dosya}. Never delete or rewrite old lines; when a decision is replaced, add \` GEÇERSİZ (YYYY-MM-DD)\` to the end of the old line.`;

// v1 çıktısından beklenen 2.x çıktısı: yalnız iki kural satırı değişir.
function kuralSatirlariniYenile(v1Metin) {
  const satirlar = v1Metin.split('\n');
  const i = satirlar.indexOf(ESKI_CELISKI);
  const j = satirlar.indexOf(eskiKarar('beynim/verdigim-kararlar.md'));
  assert.ok(i > 0 && j > i, 'v1 kural satırları bulunamadı');
  satirlar[i] = YENI_CELISKI;
  satirlar[j] = yeniKarar('beynim/verdigim-kararlar.md');
  return satirlar.join('\n');
}

const neden = atlamaNedeni();
// GitHub Actions'ta atlanmaz: etiket yoksa test nedenini söyleyerek düşer (CI yükseltme yolunu
// denemeden yeşil olamaz). Yerelde atlanır ve nedenini söyler.
const CI = process.env.GITHUB_ACTIONS === 'true';

test(`gerçek ${ETIKET} kasası ${SURUM} paketiyle güncellenir: doktor sağlıklı, beynim/ aynı, bağlam yalnız kural satırlarında farklı`, { skip: CI ? false : neden }, () => {
  if (neden) assert.fail(`${neden}. GitHub Actions'ta bu test atlanamaz: checkout adımında fetch-depth: 0 gerekir.`);
  const tmp = geciciKlasor();
  try {
    const v1 = join(tmp, 'v1 kaynak');
    assert.ok(v1Cikar(v1) > 20);
    assert.equal(JSON.parse(readFileSync(join(v1, 'sistem', 'surum.json'), 'utf8')).surum, ETIKET.slice(1));

    // Kullanıcı gibi kur: v1.0.2'nin kendi kur.mjs'i.
    const kasa = join(tmp, 'Benim Beynim İş');
    const kurulum = cocuk([join(v1, 'kur.mjs'), '--hedef', kasa], { cwd: tmp });
    assert.equal(kurulum.kod, 0, kurulum.err + kurulum.out);
    assert.match(kurulum.out, /dört dosyayı/u);
    assert.deepEqual(readdirSync(join(kasa, 'beynim')).sort(), ['aktif-projem.md', 'ben-kimim.md', 'guncel-durum.md', 'verdigim-kararlar.md']);
    for (const [rel, icerik] of Object.entries(ELIF_V1)) writeFileSync(join(kasa, ...rel.split('/')), icerik);
    mkdirSync(join(kasa, 'gunluk'), { recursive: true });
    writeFileSync(join(kasa, 'gunluk', '2026-10-20.md'), '# Günlük — 2026-10-20\n\n<!-- oturum:abc12345 -->\n### 10:00 · claude · abc12345\n- **İstek:** kapak rengini konuştuk\n- **Sonuç:** guaj kararı\n<!-- /oturum:abc12345 -->\n');
    // Testte ağa çıkılmasın: günlük kontrol az önce yapılmış sayılır.
    mkdirSync(join(kasa, '.beyin', 'durum'), { recursive: true });
    writeFileSync(join(kasa, '.beyin', 'durum', 'guncelleme.json'),
      JSON.stringify({ son_kontrol: new Date().toISOString(), en_son_surum: ETIKET.slice(1) }));

    const v1Baglam = baglam(kasa);
    for (const parca of ['## Current status — beynim/guncel-durum.md', '## Active project — beynim/aktif-projem.md',
      '## Who the user is — beynim/ben-kimim.md', '## Note that overrides older notes — beynim/fiyat-notu.md',
      '## Active decisions — beynim/verdigim-kararlar.md', '### Ruled out', '## Recent sessions',
      '## Staleness warnings\n- beynim/guncel-durum.md is 49 days old']) {
      assert.ok(v1Baglam.includes(parca), `${parca}\n---\n${v1Baglam}`);
    }
    const v1Beynim = anlik(join(kasa, 'beynim'));
    const v1Doktor = doktorJson(kasa);
    assert.equal(v1Doktor.sonuc.saglikli, true, JSON.stringify(v1Doktor.sonuc.kontroller));

    // Bu ağacın paketi; güncellemeyi kasadaki v1.0.2 kodu uygular (kullanıcının yolu).
    const kopya = join(tmp, `kaynak-${SURUM}`);
    for (const ad of ['sistem', 'beyin.mjs', 'package.json', 'arac']) ozyinelemeliKopyala(join(REPO, ad), join(kopya, ad));
    const paketle = cocuk([join(kopya, 'arac', 'paketle.mjs'), '--cikti', join(kopya, 'dist')], { cwd: kopya });
    assert.equal(paketle.kod, 0, paketle.err);
    const paket = join(kopya, 'dist', `beyin-paket-${SURUM}.json`);
    const sha = `${paket}.sha256`;
    const guncelleme = cocuk([join(kasa, 'beyin.mjs'), 'guncelle', '--paket', paket, '--sha', sha], { cwd: kasa });
    assert.equal(guncelleme.kod, 0, guncelleme.err + guncelleme.out);
    assert.ok(guncelleme.out.includes(`${ETIKET.slice(1)} → ${SURUM}`), guncelleme.out);
    assert.match(cocuk([join(kasa, 'beyin.mjs'), 'surum'], { cwd: kasa }).out, new RegExp(SURUM.replaceAll('.', '\\.'), 'u'));

    const doktor = doktorJson(kasa);
    assert.equal(doktor.kod, 0);
    assert.equal(doktor.sonuc.saglikli, true, JSON.stringify(doktor.sonuc.kontroller.filter(k => k.durum === 'hata')));
    // Güncelleme yeni bir doktor uyarısı getirmez (1.x adları 2.x'te de tanınır).
    const uyarilar = s => s.kontroller.filter(k => k.durum !== 'tamam').map(k => `${k.ad}: ${k.mesaj}`).sort();
    assert.deepEqual(uyarilar(doktor.sonuc), uyarilar(v1Doktor.sonuc));

    assert.deepEqual(anlik(join(kasa, 'beynim')), v1Beynim, 'beynim/ bayt bayt aynı kalmalı');
    const v2Baglam = baglam(kasa);
    assert.equal(v2Baglam, kuralSatirlariniYenile(v1Baglam));
    assert.equal(cocuk([join(kasa, 'beyin.mjs'), 'baglam'], { cwd: kasa }).kod, 0);

    // Gerçek oturum başı kancası da aynı notları verir.
    const kanca = spawnSync(process.execPath, [join(kasa, 'sistem', 'kanca.mjs'), 'claude', 'baslangic'], {
      cwd: kasa, input: JSON.stringify({ cwd: kasa, session_id: 's1', source: 'startup' }), encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(kanca.status, 0, kanca.stderr);
    const ek = JSON.parse(kanca.stdout).hookSpecificOutput.additionalContext;
    for (const parca of ['beynim/ben-kimim.md', 'beynim/aktif-projem.md', 'Kapakta guaj', 'to beynim/verdigim-kararlar.md.']) {
      assert.ok(ek.includes(parca), parca);
    }

    // 1.x karar dosyası güncellemeden sonra da yalnız eklenebilir.
    const koruma = spawnSync(process.execPath, [join(kasa, 'sistem', 'kanca.mjs'), 'claude', 'koruma'], {
      cwd: kasa,
      input: JSON.stringify({ cwd: kasa, tool_name: 'Edit', tool_input: { file_path: join(kasa, 'beynim', 'verdigim-kararlar.md'), old_string: 'Kapakta guaj', new_string: 'Kapakta akrilik' } }),
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(koruma.status, 0, koruma.stderr);
    const karar = JSON.parse(koruma.stdout).hookSpecificOutput;
    assert.equal(karar.permissionDecision, 'deny');
    assert.match(karar.permissionDecisionReason, /beynim\/verdigim-kararlar\.md/u);

    // Kurucuyu (bu ağacın kur.mjs'i) yeniden çalıştırmak yalnız 04 ve 05'i ekler.
    const yeniden = cocuk([join(REPO, 'kur.mjs'), '--hedef', kasa], { cwd: tmp });
    assert.equal(yeniden.kod, 0, yeniden.err + yeniden.out);
    assert.match(yeniden.out, /beş dosyayı/u);
    assert.deepEqual(readdirSync(join(kasa, 'beynim')).sort(),
      ['04-Tuzaklar.md', '05-Calisma-Tarzim.md', ...Object.keys(v1Beynim)].sort());
    for (const [rel, b64] of Object.entries(v1Beynim)) {
      assert.equal(readFileSync(join(kasa, 'beynim', rel)).toString('base64'), b64, rel);
    }
    for (const ad of ['01-Kimlik.md', '02-Guncel-Durum.md', '03-Kararlar.md']) assert.equal(existsSync(join(kasa, 'beynim', ad)), false, ad);
    const karisik = baglam(kasa);
    const kimlik = karisik.indexOf('## Who the user is — beynim/ben-kimim.md');
    const tuzak = karisik.indexOf('## Traps to avoid — beynim/04-Tuzaklar.md');
    const tarz = karisik.indexOf('## How the user likes to work — beynim/05-Calisma-Tarzim.md');
    const kararlar = karisik.indexOf('## Active decisions — beynim/verdigim-kararlar.md');
    assert.ok(kimlik > 0 && tuzak > kimlik && tarz > tuzak && kararlar > tarz, JSON.stringify({ kimlik, tuzak, tarz, kararlar }));
    assert.equal(doktorJson(kasa).sonuc.saglikli, true);
  } finally {
    kaldir(tmp);
  }
});
