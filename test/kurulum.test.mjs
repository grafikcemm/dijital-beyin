import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import {
  kancaDurumu, kancalariBirlestir, kur, manifestOku, manifestYaz, onar,
} from '../sistem/lib/kurulum.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOM = String.fromCharCode(0xfeff);
const SIMDI = new Date('2026-10-17T09:00:00.000Z');

let kok;
let kaynak;
let sayac = 0;

function yeniKasaYolu() {
  sayac += 1;
  return join(kok, `Kasa ${sayac} Ğüş`);
}

function hash(dosya) {
  return createHash('sha256').update(readFileSync(dosya)).digest('hex');
}

// Bir klasördeki tüm dosyaların göreli yol → bayt eşlemi.
function anlikGoruntu(dizin) {
  const out = {};
  const gez = (d, rel) => {
    if (!existsSync(d)) return;
    for (const g of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${g.name}` : g.name;
      if (g.isDirectory()) gez(join(d, g.name), r);
      else out[r] = readFileSync(join(d, g.name)).toString('base64');
    }
  };
  gez(dizin, '');
  return out;
}

function kurulmusKasa(secenek = {}) {
  const hedef = yeniKasaYolu();
  kur({ kaynak, hedef, simdi: SIMDI, ...secenek });
  return hedef;
}

before(() => {
  kok = mkdtempSync(`${tmpdir()}/Dijital Beyin Ğüşİ-`);
  kaynak = join(kok, 'kaynak paket');
  mkdirSync(kaynak, { recursive: true });
  const filtre = kaynakYol => !kaynakYol.endsWith('.tmp');
  cpSync(join(REPO, 'sistem'), join(kaynak, 'sistem'), { recursive: true, filter: filtre });
  cpSync(join(REPO, 'sablon'), join(kaynak, 'sablon'), { recursive: true, filter: filtre });
  cpSync(join(REPO, 'beyin.mjs'), join(kaynak, 'beyin.mjs'));
});

after(() => {
  rmSync(kok, { recursive: true, force: true });
});

describe('kur', () => {
  test('ilk kurulum düzeni', () => {
    const hedef = yeniKasaYolu();
    const sonuc = kur({ kaynak, hedef, simdi: SIMDI });
    for (const rel of [
      'beyin.mjs', 'sistem/surum.json', 'sistem/lib/kurulum.mjs', 'sistem/yonetilen/claude-blok.md',
      'beynim/ben-kimim.md', 'beynim/aktif-projem.md', 'beynim/verdigim-kararlar.md', 'beynim/guncel-durum.md',
      'notlar/README.md', 'gunluk/README.md', 'gelen-kutusu/README.md',
      'CLAUDE.md', 'AGENTS.md', '.gitignore', '.claude/settings.json', '.beyin/kurulum.json',
    ]) {
      assert.ok(existsSync(join(hedef, ...rel.split('/'))), `${rel} olmalı`);
      assert.ok(sonuc.yazilanlar.includes(rel), `${rel} yazilanlar listesinde olmalı`);
    }
    assert.equal(existsSync(join(hedef, '.beyin', 'tercihler.json')), false);
    assert.equal(existsSync(join(hedef, '.codex')), false);
    assert.deepEqual(sonuc.korunanlar, []);
    assert.deepEqual(sonuc.uyarilar, []);
    const claudeMd = readFileSync(join(hedef, 'CLAUDE.md'), 'utf8');
    assert.match(claudeMd, /^<!-- dijital-beyin:basla -->\n/u);
    assert.match(claudeMd, /<!-- dijital-beyin:bitir -->\n$/u);
    const gitignore = readFileSync(join(hedef, '.gitignore'), 'utf8');
    assert.match(gitignore, /# dijital-beyin:basla\n\.beyin\/durum\/\n\.beyin\/yedek\/\n\.beyin\/yerel-degisiklikler\/\n# dijital-beyin:bitir\n/u);
    const m = manifestOku(hedef);
    assert.equal(m.sema, 'dijital-beyin.kurulum/v1');
    assert.equal(m.surum, JSON.parse(readFileSync(join(REPO, 'sistem', 'surum.json'), 'utf8')).surum);
    assert.equal(m.repo, 'grafikcemm/dijital-beyin');
    assert.deepEqual(m.istemciler, ['claude']);
    assert.equal(m.kuruldu, SIMDI.toISOString());
  });

  test('yeniden kurulum kullanıcı dosyalarını bayt bayt korur', () => {
    const hedef = kurulmusKasa();
    const benKimim = join(hedef, 'beynim', 'ben-kimim.md');
    writeFileSync(benKimim, `${BOM}---\r\ndate: 2026-10-01\r\n---\r\nAdım Elif.\r\n`);
    const notDosya = join(hedef, 'notlar', 'fikir.md');
    writeFileSync(notDosya, 'kendi notum\n');
    writeFileSync(join(hedef, '.beyin', 'tercihler.json'), '{"yakalama": false}\n');
    rmSync(join(hedef, 'gunluk', 'README.md'));
    const once = { ben: readFileSync(benKimim), not: readFileSync(notDosya) };
    const tercih = readFileSync(join(hedef, '.beyin', 'tercihler.json'));
    writeFileSync(join(hedef, 'sistem', 'surum.json'), '{"surum":"0.0.1","repo":"grafikcemm/dijital-beyin"}\n');

    const sonuc = kur({ kaynak, hedef, simdi: SIMDI });
    assert.ok(readFileSync(benKimim).equals(once.ben));
    assert.ok(readFileSync(notDosya).equals(once.not));
    assert.ok(readFileSync(join(hedef, '.beyin', 'tercihler.json')).equals(tercih));
    assert.ok(sonuc.korunanlar.includes('beynim/ben-kimim.md'));
    assert.ok(!sonuc.korunanlar.includes('gunluk/README.md'));
    assert.ok(sonuc.yazilanlar.includes('gunluk/README.md'), 'eksik şablon yeniden eklenir');
    assert.ok(sonuc.yazilanlar.includes('sistem/surum.json'), 'yönetilen dosya yenilenir');
    assert.ok(sonuc.uyarilar.includes('yerel_degisiklik_ezilecek:sistem/surum.json'));
    assert.ok(!sonuc.yazilanlar.includes('beynim/ben-kimim.md'));
  });

  test('hedef kaynakla aynı ya da içindeyse, kaynak hedefin içindeyse reddeder', () => {
    assert.throws(() => kur({ kaynak, hedef: kaynak }), /hedef_kaynakla_ayni/u);
    assert.throws(() => kur({ kaynak, hedef: join(kaynak, 'alt', 'kasa') }), /hedef_kaynak_icinde/u);
    assert.throws(() => kur({ kaynak, hedef: kok }), /kaynak_hedef_icinde/u);
    assert.equal(existsSync(join(kaynak, 'alt')), false);
    if (process.platform === 'win32') {
      assert.throws(() => kur({ kaynak, hedef: join(kaynak.toUpperCase(), 'x') }), /hedef_kaynak_icinde/u);
    }
  });

  test('geçersiz kaynak ve istemci reddedilir', () => {
    assert.throws(() => kur({ kaynak: join(kok, 'yok'), hedef: yeniKasaYolu() }), /kaynak_gecersiz/u);
    assert.throws(() => kur({ kaynak, hedef: yeniKasaYolu(), istemciler: ['chatgpt'] }), /istemci_gecersiz/u);
    assert.throws(() => kur({ kaynak, hedef: yeniKasaYolu(), istemciler: [] }), /istemci_gecersiz/u);
  });

  test('plan hiçbir şey yazmaz', () => {
    const hedef = yeniKasaYolu();
    const sonuc = kur({ kaynak, hedef, plan: true, istemciler: ['claude', 'codex'] });
    assert.equal(existsSync(hedef), false);
    assert.ok(sonuc.yazilanlar.includes('beyin.mjs'));
    assert.ok(sonuc.yazilanlar.includes('beynim/ben-kimim.md'));
    assert.ok(sonuc.yazilanlar.includes('CLAUDE.md'));
    assert.ok(sonuc.yazilanlar.includes('.codex/hooks.json'));

    const kasa = kurulmusKasa();
    writeFileSync(join(kasa, 'CLAUDE.md'), 'yalnız kullanıcı metni\n');
    const once = anlikGoruntu(kasa);
    const plan = kur({ kaynak, hedef: kasa, plan: true });
    assert.deepEqual(anlikGoruntu(kasa), once);
    assert.ok(plan.yazilanlar.includes('CLAUDE.md'));
    assert.ok(!plan.yazilanlar.includes('beyin.mjs'), 'aynı içerikli yönetilen dosya listelenmez');
    assert.ok(plan.korunanlar.includes('beynim/ben-kimim.md'));
  });

  test('boş olmayan, kasa olmayan klasör uyarı verir ama dosyalara dokunmaz', () => {
    const hedef = yeniKasaYolu();
    mkdirSync(hedef, { recursive: true });
    writeFileSync(join(hedef, 'eski.txt'), 'dokunma');
    const sonuc = kur({ kaynak, hedef, simdi: SIMDI });
    assert.ok(sonuc.uyarilar.includes('hedef_bos_degil'));
    assert.equal(readFileSync(join(hedef, 'eski.txt'), 'utf8'), 'dokunma');
  });
});

describe('onar ve yönetilen bloklar', () => {
  test('blok yenilenir, çevresindeki kullanıcı metni korunur', () => {
    const hedef = kurulmusKasa();
    const dosya = join(hedef, 'CLAUDE.md');
    writeFileSync(dosya, '# Benim kurallarım\n\nÖnce bu.\n<!-- dijital-beyin:basla -->\neski blok\n<!-- dijital-beyin:bitir -->\nSonra şu.\n');
    const { degisenler } = onar(hedef, { simdi: SIMDI });
    assert.ok(degisenler.includes('CLAUDE.md'));
    const yeni = readFileSync(dosya, 'utf8');
    assert.ok(yeni.startsWith('# Benim kurallarım\n\nÖnce bu.\n<!-- dijital-beyin:basla -->\n## Digital brain'));
    assert.ok(yeni.endsWith('<!-- dijital-beyin:bitir -->\nSonra şu.\n'));
    assert.ok(!yeni.includes('eski blok'));
    const ikinci = onar(hedef, { simdi: SIMDI });
    assert.deepEqual(ikinci.degisenler, []);
    assert.equal(readFileSync(dosya, 'utf8'), yeni);
  });

  test('işaretsiz dosyaya blok sona eklenir; CRLF dosyada idempotent', () => {
    const hedef = kurulmusKasa();
    const dosya = join(hedef, 'AGENTS.md');
    writeFileSync(dosya, 'Satır 1\r\nSatır 2');
    onar(hedef, { simdi: SIMDI });
    const bir = readFileSync(dosya, 'utf8');
    assert.ok(bir.startsWith('Satır 1\r\nSatır 2\r\n\r\n<!-- dijital-beyin:basla -->\r\n'));
    assert.ok(!/[^\r]\n/u.test(bir), 'yalnız CRLF');
    onar(hedef, { simdi: SIMDI });
    assert.equal(readFileSync(dosya, 'utf8'), bir);
  });

  test('bitiş işareti eksikse blok_bozuk ve hiçbir dosya değişmez', () => {
    const hedef = kurulmusKasa();
    const dosya = join(hedef, 'CLAUDE.md');
    writeFileSync(dosya, 'üst\n<!-- dijital-beyin:basla -->\nkullanıcı metni\n');
    const once = anlikGoruntu(hedef);
    assert.throws(() => onar(hedef, { simdi: new Date('2026-12-01T00:00:00Z') }), /blok_bozuk:CLAUDE\.md/u);
    assert.deepEqual(anlikGoruntu(hedef), once);
  });

  test('onar kullanıcı klasörlerine dokunmaz', () => {
    const hedef = kurulmusKasa();
    writeFileSync(join(hedef, 'gunluk', '2026-10-17.md'), 'oturum\n');
    writeFileSync(join(hedef, 'gelen-kutusu', 'oneri.md'), 'öneri\n');
    const izle = ['beynim', 'notlar', 'gunluk', 'gelen-kutusu'];
    const once = izle.map(d => anlikGoruntu(join(hedef, d)));
    rmSync(join(hedef, 'CLAUDE.md'));
    onar(hedef, { simdi: SIMDI });
    assert.deepEqual(izle.map(d => anlikGoruntu(join(hedef, d))), once);
    assert.ok(existsSync(join(hedef, 'CLAUDE.md')));
  });
});

describe('kancalar', () => {
  test('.claude/settings.json birleştirme: yabancı kanca kalır, idempotent, yedek yalnız değişimde', () => {
    const hedef = yeniKasaYolu();
    mkdirSync(join(hedef, '.claude'), { recursive: true });
    const ayar = join(hedef, '.claude', 'settings.json');
    const yabanci = { type: 'command', command: 'echo yabanci' };
    writeFileSync(ayar, JSON.stringify({
      permissions: { allow: ['Read'] },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [yabanci] }],
        SessionStart: [{ hooks: [{ type: 'command', command: 'node', args: ['/eski/yer/sistem/kanca.mjs', 'claude', 'baslangic'] }] }],
      },
    }));
    kur({ kaynak, hedef, simdi: SIMDI });
    const yedekDizin = join(hedef, '.beyin', 'yedek', 'ayarlar');
    assert.equal(readdirSync(yedekDizin).length, 1);
    const ilk = readFileSync(ayar);
    const veri = JSON.parse(ilk.toString('utf8'));
    assert.deepEqual(veri.permissions, { allow: ['Read'] });
    assert.deepEqual(veri.hooks.PreToolUse[0], { matcher: 'Bash', hooks: [yabanci] });
    assert.equal(veri.hooks.SessionStart.length, 1, 'eski girdimiz silinir');
    assert.deepEqual(veri.hooks.SessionStart[0], {
      matcher: 'startup|resume|clear|compact',
      hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/sistem/kanca.mjs', 'claude', 'baslangic'], timeout: 10 }],
    });
    assert.deepEqual(veri.hooks.SessionEnd, [{ hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/sistem/kanca.mjs', 'claude', 'bitis'], timeout: 10 }] }]);
    assert.equal(veri.hooks.PreCompact[0].matcher, 'manual|auto');
    assert.equal(veri.hooks.PreToolUse[1].matcher, 'Write|Edit|MultiEdit|Bash|PowerShell');
    assert.ok(ilk.toString('utf8').includes('"${CLAUDE_PROJECT_DIR}/sistem/kanca.mjs"'));
    assert.ok(ilk.toString('utf8').endsWith('}\n'));

    const ikinci = kancalariBirlestir(hedef, ['claude']);
    assert.deepEqual(ikinci.degisenler, []);
    assert.ok(readFileSync(ayar).equals(ilk));
    onar(hedef, { simdi: SIMDI });
    assert.ok(readFileSync(ayar).equals(ilk));
    assert.equal(readdirSync(yedekDizin).length, 1, 'değişiklik yoksa yeni yedek yok');
  });

  test('yeni settings.json için yedek alınmaz; yedekler en fazla 3', () => {
    const hedef = kurulmusKasa();
    assert.equal(existsSync(join(hedef, '.beyin', 'yedek', 'ayarlar')), false);
    const ayar = join(hedef, '.claude', 'settings.json');
    for (let i = 0; i < 5; i += 1) {
      writeFileSync(ayar, JSON.stringify({ deneme: i }));
      kancalariBirlestir(hedef, ['claude'], { simdi: new Date(Date.UTC(2026, 9, 17, 10, i)) });
    }
    assert.equal(readdirSync(join(hedef, '.beyin', 'yedek', 'ayarlar')).length, 3);
    assert.equal(JSON.parse(readFileSync(ayar, 'utf8')).deneme, 4);
  });

  test('bozuk settings.json → ayar_bozuk, dosya değişmez', () => {
    const hedef = yeniKasaYolu();
    mkdirSync(join(hedef, '.claude'), { recursive: true });
    const ayar = join(hedef, '.claude', 'settings.json');
    for (const bozuk of ['{ "hooks": ', '[1,2]', '{"hooks": []}', '{"hooks": {"PreToolUse": {}}}']) {
      writeFileSync(ayar, bozuk);
      assert.throws(() => kancalariBirlestir(hedef, ['claude']), /ayar_bozuk/u);
      assert.equal(readFileSync(ayar, 'utf8'), bozuk);
    }
    assert.throws(() => kur({ kaynak, hedef, simdi: SIMDI }), /ayar_bozuk/u);
    assert.equal(readFileSync(ayar, 'utf8'), '{"hooks": {"PreToolUse": {}}}');
    assert.deepEqual(readdirSync(hedef), ['.claude'], 'kur hiçbir şey yazmadan durur');
  });

  test('BOM içeren settings.json okunur, BOM yazılmaz', () => {
    const hedef = yeniKasaYolu();
    mkdirSync(join(hedef, '.claude'), { recursive: true });
    const ayar = join(hedef, '.claude', 'settings.json');
    writeFileSync(ayar, `${BOM}{"model":"x"}`);
    kancalariBirlestir(hedef, ['claude']);
    const metin = readFileSync(ayar, 'utf8');
    assert.ok(!metin.includes(BOM));
    assert.equal(JSON.parse(metin).model, 'x');
  });

  test('codex ekleme ve kaldırma', () => {
    const hedef = kurulmusKasa({ istemciler: ['claude', 'codex'] });
    const dosya = join(hedef, '.codex', 'hooks.json');
    const veri = JSON.parse(readFileSync(dosya, 'utf8'));
    const yol = `${hedef.replace(/\\/gu, '/')}/sistem/kanca.mjs`;
    assert.deepEqual(veri.hooks.SessionStart, [{ matcher: 'startup|resume|clear', hooks: [{ type: 'command', command: `node "${yol}" codex baslangic`, timeout: 10 }] }]);
    assert.deepEqual(veri.hooks.Stop, [{ hooks: [{ type: 'command', command: `node "${yol}" codex durdur`, timeout: 3 }] }]);
    assert.deepEqual(veri.hooks.PreToolUse, [{ hooks: [{ type: 'command', command: `node "${yol}" codex koruma`, timeout: 10 }] }]);
    assert.ok(!readFileSync(dosya, 'utf8').includes('\\\\'), 'ters eğik çizgi yok');
    assert.deepEqual(manifestOku(hedef).istemciler, ['claude', 'codex']);
    assert.deepEqual(kancaDurumu(hedef), { claude: { kurulu: true, eksik: [] }, codex: { kurulu: true, eksik: [] } });

    // İstemci verilmeden onar: manifestteki istemciler korunur.
    onar(hedef, { simdi: SIMDI });
    assert.equal(kancaDurumu(hedef).codex.kurulu, true);

    veri.hooks.Stop.push({ hooks: [{ type: 'command', command: 'echo baskasi' }] });
    writeFileSync(dosya, JSON.stringify(veri));
    const { degisenler } = onar(hedef, { istemciler: ['claude'], simdi: SIMDI });
    assert.ok(degisenler.includes('.codex/hooks.json'));
    const sonra = JSON.parse(readFileSync(dosya, 'utf8'));
    assert.deepEqual(sonra.hooks, { Stop: [{ hooks: [{ type: 'command', command: 'echo baskasi' }] }] });
    assert.deepEqual(manifestOku(hedef).istemciler, ['claude']);
    assert.equal(kancaDurumu(hedef).codex.kurulu, false);
  });

  test('bizim girdimiz olmayan ayar dosyasının biçimine bile dokunulmaz', () => {
    const hedef = kurulmusKasa();
    mkdirSync(join(hedef, '.codex'), { recursive: true });
    const codex = join(hedef, '.codex', 'hooks.json');
    const sikisik = '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo kendi"}]}]}}';
    writeFileSync(codex, sikisik);
    const { degisenler } = onar(hedef, { istemciler: ['claude'], simdi: SIMDI });
    assert.ok(!degisenler.includes('.codex/hooks.json'));
    assert.equal(readFileSync(codex, 'utf8'), sikisik);
    assert.equal(existsSync(join(hedef, '.beyin', 'yedek', 'ayarlar')), false);

    // Bizim girdilerimiz zaten tamsa, yalnız biçim farkı için yeniden yazılmaz.
    const ayar = join(hedef, '.claude', 'settings.json');
    const tek = JSON.stringify(JSON.parse(readFileSync(ayar, 'utf8')));
    writeFileSync(ayar, tek);
    assert.deepEqual(kancalariBirlestir(hedef, ['claude']).degisenler, []);
    assert.equal(readFileSync(ayar, 'utf8'), tek);
  });

  test('yalnız claude kurulumunda bozuk .codex/hooks.json onarı durdurmaz ve değişmez', () => {
    const hedef = kurulmusKasa();
    mkdirSync(join(hedef, '.codex'), { recursive: true });
    writeFileSync(join(hedef, '.codex', 'hooks.json'), 'bozuk');
    onar(hedef, { simdi: SIMDI });
    assert.equal(readFileSync(join(hedef, '.codex', 'hooks.json'), 'utf8'), 'bozuk');
    assert.throws(() => kancalariBirlestir(hedef, ['claude', 'codex']), /ayar_bozuk/u);
  });

  test('kancaDurumu eksik olayı ve taşınmış kasayı bulur', () => {
    const hedef = kurulmusKasa({ istemciler: ['claude', 'codex'] });
    const ayar = join(hedef, '.claude', 'settings.json');
    const veri = JSON.parse(readFileSync(ayar, 'utf8'));
    delete veri.hooks.SessionEnd;
    writeFileSync(ayar, JSON.stringify(veri));
    assert.deepEqual(kancaDurumu(hedef).claude, { kurulu: false, eksik: ['bitis'] });

    const tasinmis = join(kok, 'tamamen baska yer', 'Taşınan Kasa');
    mkdirSync(tasinmis, { recursive: true });
    cpSync(join(hedef, '.codex'), join(tasinmis, '.codex'), { recursive: true });
    cpSync(join(hedef, '.claude'), join(tasinmis, '.claude'), { recursive: true });
    const durum = kancaDurumu(tasinmis);
    assert.equal(durum.codex.kurulu, false);
    assert.deepEqual(durum.codex.eksik, ['yol']);
    assert.deepEqual(durum.claude.eksik, ['bitis'], 'claude girdisi taşınabilir, yol denetlenmez');

    const bos = yeniKasaYolu();
    mkdirSync(bos, { recursive: true });
    assert.deepEqual(kancaDurumu(bos), {
      claude: { kurulu: false, eksik: ['baslangic', 'bitis', 'sikistirma', 'koruma'] },
      codex: { kurulu: false, eksik: ['baslangic', 'durdur', 'koruma'] },
    });
  });
});

describe('manifest', () => {
  test('hash\'ler dosya baytlarıyla tutar; kuruldu korunur, guncellendi yenilenir', () => {
    const hedef = kurulmusKasa();
    writeFileSync(join(hedef, 'sistem', 'artik.mjs.123.tmp'), 'geçici');
    const sonra = new Date('2026-11-01T12:00:00.000Z');
    const { manifest } = manifestYaz(hedef, '1.0.0', { simdi: sonra });
    const disk = manifestOku(hedef);
    assert.deepEqual(disk, manifest);
    assert.equal(disk.kuruldu, SIMDI.toISOString());
    assert.equal(disk.guncellendi, sonra.toISOString());
    const anahtarlar = Object.keys(disk.dosyalar);
    assert.deepEqual(anahtarlar, [...anahtarlar].sort());
    assert.ok(anahtarlar.includes('beyin.mjs'));
    assert.ok(anahtarlar.includes('sistem/lib/kurulum.mjs'));
    assert.ok(anahtarlar.every(rel => rel === 'beyin.mjs' || rel.startsWith('sistem/')));
    assert.ok(anahtarlar.every(rel => !rel.includes('\\') && !rel.endsWith('.tmp')));
    for (const rel of anahtarlar) {
      assert.equal(disk.dosyalar[rel], hash(join(hedef, ...rel.split('/'))), rel);
    }
    assert.equal(manifestOku(join(kok, 'yok')), null);
    assert.ok(statSync(join(hedef, '.beyin', 'kurulum.json')).isFile());
    assert.ok(!readFileSync(join(hedef, '.beyin', 'kurulum.json'), 'utf8').includes(BOM));
  });
});

describe('kullanıcı dosyalarını sahiplenmeme', () => {
  test('taze kurulumda var olan sistem/ ya da beyin.mjs reddedilir, hiçbir şey değişmez', () => {
    const hedef = yeniKasaYolu();
    mkdirSync(join(hedef, 'sistem'), { recursive: true });
    writeFileSync(join(hedef, 'sistem', 'rapor.docx'), 'benim raporum');
    writeFileSync(join(hedef, 'beyin.mjs'), '// benim dosyam\n');
    const once = anlikGoruntu(hedef);
    assert.throws(() => kur({ kaynak, hedef, simdi: SIMDI }), /hedef_cakisma:sistem,beyin\.mjs/u);
    assert.throws(() => kur({ kaynak, hedef, plan: true }), /hedef_cakisma/u);
    assert.deepEqual(anlikGoruntu(hedef), once);
  });

  test('uzerineYaz: var olanlar kurulum-oncesi yedeğe alınır, kullanıcı dosyası manifeste girmez', () => {
    const hedef = yeniKasaYolu();
    mkdirSync(join(hedef, 'sistem'), { recursive: true });
    writeFileSync(join(hedef, 'sistem', 'rapor.docx'), 'benim raporum');
    writeFileSync(join(hedef, 'beyin.mjs'), '// benim dosyam\n');
    const sonuc = kur({ kaynak, hedef, simdi: SIMDI, uzerineYaz: true });
    const yedek = sonuc.uyarilar.find(u => u.startsWith('kurulum_oncesi_yedek:'));
    assert.ok(yedek, 'yedek uyarısı olmalı');
    const yedekDizin = join(hedef, ...yedek.slice('kurulum_oncesi_yedek:'.length).split('/'));
    assert.match(yedekDizin, /kurulum-oncesi-/u);
    assert.equal(readFileSync(join(yedekDizin, 'beyin.mjs'), 'utf8'), '// benim dosyam\n');
    assert.equal(readFileSync(join(yedekDizin, 'sistem', 'rapor.docx'), 'utf8'), 'benim raporum');
    assert.equal(readFileSync(join(hedef, 'beyin.mjs'), 'utf8'), readFileSync(join(kaynak, 'beyin.mjs'), 'utf8'));
    assert.equal(manifestOku(hedef).dosyalar['sistem/rapor.docx'], undefined);
  });

  test('kurulumdan sonra sistem/ altına eklenen dosya onar ve yeniden kurulumda manifeste girmez', () => {
    const hedef = kurulmusKasa();
    writeFileSync(join(hedef, 'sistem', 'rapor.docx'), 'benim raporum');
    onar(hedef, { simdi: SIMDI });
    assert.equal(manifestOku(hedef).dosyalar['sistem/rapor.docx'], undefined);
    kur({ kaynak, hedef, simdi: SIMDI });
    assert.equal(manifestOku(hedef).dosyalar['sistem/rapor.docx'], undefined);
    assert.equal(readFileSync(join(hedef, 'sistem', 'rapor.docx'), 'utf8'), 'benim raporum');
    // Kitin dosyaları kayıtlı kalır.
    assert.ok(manifestOku(hedef).dosyalar['sistem/lib/kurulum.mjs']);
    assert.ok(manifestOku(hedef).dosyalar['beyin.mjs']);
  });

  test('manifestYaz: dosyalar listesi verilirse yalnız onlar yazılır, diskte olmayan eski kayıt korunur', () => {
    const hedef = kurulmusKasa();
    writeFileSync(join(hedef, 'sistem', 'yeni-kit-dosyasi.mjs'), '// kit\n');
    rmSync(join(hedef, 'sistem', 'lib', 'ara.mjs'));
    const { manifest } = manifestYaz(hedef, '1.0.0', {
      simdi: SIMDI, dosyalar: ['sistem/yeni-kit-dosyasi.mjs', 'sistem/lib/ara.mjs', 'sistem/surum.json', '../disari', 'baska.txt'],
    });
    assert.deepEqual(Object.keys(manifest.dosyalar), ['sistem/lib/ara.mjs', 'sistem/surum.json', 'sistem/yeni-kit-dosyasi.mjs']);
    assert.equal(manifest.dosyalar['sistem/yeni-kit-dosyasi.mjs'], hash(join(hedef, 'sistem', 'yeni-kit-dosyasi.mjs')));
  });
});

describe('onar eksik kullanıcı klasörlerini yeniden oluşturur', () => {
  test('eksik klasörler boş açılır, var olanın içeriği ve dosyaları değişmez', () => {
    const hedef = kurulmusKasa();
    writeFileSync(join(hedef, 'notlar', 'benim.md'), 'notum\n');
    rmSync(join(hedef, 'beynim'), { recursive: true });
    rmSync(join(hedef, 'gunluk'), { recursive: true });
    rmSync(join(hedef, 'gelen-kutusu'), { recursive: true });
    const notlarOnce = anlikGoruntu(join(hedef, 'notlar'));
    const sonuc = onar(hedef, { simdi: SIMDI });
    for (const ad of ['beynim', 'gunluk', 'gelen-kutusu']) {
      assert.ok(statSync(join(hedef, ad)).isDirectory(), ad);
      assert.deepEqual(readdirSync(join(hedef, ad)), [], `${ad} boş olmalı`);
      assert.ok(sonuc.degisenler.includes(`${ad}/`), ad);
    }
    assert.ok(!sonuc.degisenler.includes('notlar/'));
    assert.deepEqual(anlikGoruntu(join(hedef, 'notlar')), notlarOnce);
  });

  test('sablon verilirse eksik şablon dosyaları eklenir, var olan dosyaya yazılmaz', () => {
    const hedef = kurulmusKasa();
    writeFileSync(join(hedef, 'beynim', 'ben-kimim.md'), 'Elif benim\n');
    rmSync(join(hedef, 'beynim', 'guncel-durum.md'));
    onar(hedef, { simdi: SIMDI, sablon: join(kaynak, 'sablon') });
    assert.equal(readFileSync(join(hedef, 'beynim', 'ben-kimim.md'), 'utf8'), 'Elif benim\n');
    assert.ok(existsSync(join(hedef, 'beynim', 'guncel-durum.md')));
  });
});

describe('yarıda kalmış güncelleme işareti', () => {
  test('yeniden kurulum işareti siler, kanca işaret varken hiçbir şey yazmaz', async () => {
    const hedef = yeniKasaYolu();
    kur({ kaynak, hedef, simdi: SIMDI });
    const isaret = join(hedef, '.beyin', 'durum', 'guncelleme-suruyor.json');
    mkdirSync(dirname(isaret), { recursive: true });
    writeFileSync(isaret, '{}');
    const { kancaCalistir } = await import(pathToFileURL(join(hedef, 'sistem', 'kanca.mjs')).href);
    const eskiYaz = process.stdout.write;
    let cikti = '';
    process.stdout.write = parca => { cikti += parca; return true; };
    try {
      assert.equal(await kancaCalistir(['claude', 'baslangic'], JSON.stringify({ cwd: hedef })), 0);
    } finally { process.stdout.write = eskiYaz; }
    assert.equal(cikti, '');
    kur({ kaynak, hedef, simdi: SIMDI });
    assert.ok(!existsSync(isaret));
  });
});
