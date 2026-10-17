// Uçtan uca: gerçek kurucu, gerçek kancalar, gerçek güncelleme paketi.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const KULLANICI_KOKLERI = ['beynim', 'notlar', 'gunluk', 'gelen-kutusu'];

let tmp;
let kasa;

function node(args, { cwd, girdi, env } = {}) {
  const sonuc = spawnSync(process.execPath, args, {
    cwd: cwd ?? kasa,
    input: girdi === undefined ? '' : girdi,
    encoding: 'utf8',
    env: { ...process.env, BEYIN_IC_CAGRI: '', ...env },
    timeout: 60_000,
  });
  return { kod: sonuc.status, out: sonuc.stdout ?? '', err: sonuc.stderr ?? '' };
}

function kanca(istemci, olay, girdi, opts = {}) {
  return node([join(kasa, 'sistem', 'kanca.mjs'), istemci, olay], { girdi: JSON.stringify(girdi), ...opts });
}

function dosyalar(kok, alt) {
  const out = [];
  const gez = dir => {
    if (!existsSync(dir)) return;
    for (const ad of readdirSync(dir)) {
      const yol = join(dir, ad);
      if (statSync(yol).isDirectory()) gez(yol);
      else out.push(yol);
    }
  };
  gez(join(kok, alt));
  return out;
}

function kullaniciParmakIzi({ gunlukHaric = false } = {}) {
  const izler = {};
  for (const alt of KULLANICI_KOKLERI) {
    if (gunlukHaric && alt === 'gunluk') continue;
    for (const yol of dosyalar(kasa, alt)) {
      izler[relative(kasa, yol).replace(/\\/gu, '/')] = createHash('sha256').update(readFileSync(yol)).digest('hex');
    }
  }
  for (const ad of ['CLAUDE.md', 'AGENTS.md']) {
    const metin = readFileSync(join(kasa, ad), 'utf8');
    izler[`${ad}#kullanici`] = metin.replace(/<!-- dijital-beyin:basla -->[\s\S]*<!-- dijital-beyin:bitir -->/u, '');
  }
  return izler;
}

function paketYap(surum, degistir) {
  const kopya = join(tmp, `kaynak-${surum}`);
  for (const ad of ['sistem', 'beyin.mjs', 'package.json', 'arac']) {
    cpSync(join(REPO, ad), join(kopya, ad), { recursive: true });
  }
  const surumDosyasi = join(kopya, 'sistem', 'surum.json');
  const surumJson = JSON.parse(readFileSync(surumDosyasi, 'utf8'));
  surumJson.surum = surum;
  writeFileSync(surumDosyasi, `${JSON.stringify(surumJson, null, 2)}\n`);
  const paket = JSON.parse(readFileSync(join(kopya, 'package.json'), 'utf8'));
  paket.version = surum;
  writeFileSync(join(kopya, 'package.json'), `${JSON.stringify(paket, null, 2)}\n`);
  degistir?.(kopya);
  const sonuc = node([join(kopya, 'arac', 'paketle.mjs'), '--cikti', join(kopya, 'dist')], { cwd: kopya });
  assert.equal(sonuc.kod, 0, sonuc.err);
  return {
    paket: join(kopya, 'dist', `beyin-paket-${surum}.json`),
    sha: join(kopya, 'dist', `beyin-paket-${surum}.json.sha256`),
  };
}

const ELIF = {
  'beynim/ben-kimim.md': '---\ndate: 2026-10-01\n---\n# Ben kimim\n\nElif, serbest illüstratör. Çocuk kitabı illüstrasyonu yapıyor.\n',
  'beynim/aktif-projem.md': '---\ndate: 2026-10-15\n---\n# Aktif projem\n\nDeniz feneri temalı resimli kitap, 24 sayfa.\n',
  'beynim/verdigim-kararlar.md': '# Verdiğim kararlar\n\n## Kararlar\n\n- 2026-10-02 — Kapakta sulu boya kullanacağım — müşteri sıcak ton istedi\n- 2026-10-10 — Teslim tarihi 30 Ekim — yayınevi onayladı\n',
};

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'Dijital Beyin Ğüşİ-'));
  kasa = join(tmp, 'Benim Beynim İş');
});

after(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('uçtan uca', { concurrency: false }, () => {
  test('kurulum', () => {
    const sonuc = node([join(REPO, 'kur.mjs'), '--hedef', kasa, '--istemci', 'claude,codex'], { cwd: tmp });
    assert.equal(sonuc.kod, 0, sonuc.err + sonuc.out);
    for (const yol of ['beyin.mjs', 'sistem/cli.mjs', 'sistem/kanca.mjs', '.beyin/kurulum.json',
      'beynim/ben-kimim.md', 'CLAUDE.md', 'AGENTS.md', '.claude/settings.json', '.codex/hooks.json']) {
      assert.ok(existsSync(join(kasa, yol)), `${yol} yok`);
    }
    for (const [rel, icerik] of Object.entries(ELIF)) writeFileSync(join(kasa, rel), icerik);
    writeFileSync(join(kasa, 'CLAUDE.md'), `Benim kendi notum.\n\n${readFileSync(join(kasa, 'CLAUDE.md'), 'utf8')}`);
    // Testte ağa çıkılmasın: günlük kontrol az önce yapılmış sayılır.
    mkdirSync(join(kasa, '.beyin', 'durum'), { recursive: true });
    writeFileSync(join(kasa, '.beyin', 'durum', 'guncelleme.json'),
      JSON.stringify({ son_kontrol: new Date().toISOString(), en_son_surum: '1.0.0' }));
  });

  test('oturum başı bağlamı notları içerir', () => {
    const sonuc = kanca('claude', 'baslangic', { cwd: kasa, session_id: 's1', source: 'startup' });
    assert.equal(sonuc.kod, 0, sonuc.err);
    const json = JSON.parse(sonuc.out);
    const metin = json.hookSpecificOutput.additionalContext;
    assert.equal(json.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(metin, /Elif/u);
    assert.match(metin, /Deniz feneri/u);
    assert.match(metin, /sulu boya/u);
    assert.ok(metin.length <= 9500);
  });

  test('iç çağrı ve kasa dışı kancalar hiçbir şey yapmaz', () => {
    const ic = kanca('claude', 'baslangic', { cwd: kasa }, { env: { BEYIN_IC_CAGRI: '1' } });
    assert.equal(ic.kod, 0);
    assert.equal(ic.out, '');
    const disari = kanca('claude', 'baslangic', { cwd: tmp }, { cwd: tmp });
    assert.equal(disari.kod, 0);
    assert.equal(disari.out, '');
    const bozuk = node([join(kasa, 'sistem', 'kanca.mjs'), 'claude', 'baslangic'], { girdi: '{bozuk' });
    assert.equal(bozuk.kod, 0);
  });

  test('oturum sonu yakalanır ve tekrar yazılınca çoğalmaz', () => {
    const transkript = join(tmp, 'oturum.jsonl');
    const satirlar = [
      { type: 'user', message: { role: 'user', content: 'Kapak eskizi için üç renk paleti öner. Parolam=gizli123 olsun.' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Üç palet önerdim: deniz mavisi, kum, mercan.' }] } },
      { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Mercan paletini seçtik, karar dosyasına ekledim.' }] } },
    ];
    writeFileSync(transkript, satirlar.map(s => JSON.stringify(s)).join('\n'));
    const girdi = { cwd: kasa, session_id: 'oturum-123', transcript_path: transkript, reason: 'other' };
    assert.equal(kanca('claude', 'bitis', girdi).kod, 0);
    assert.equal(kanca('claude', 'bitis', girdi).kod, 0);
    const gunlukler = dosyalar(kasa, 'gunluk').filter(yol => yol.endsWith('.md') && !yol.endsWith('README.md'));
    assert.equal(gunlukler.length, 1);
    const metin = readFileSync(gunlukler[0], 'utf8');
    assert.equal(metin.split('<!-- oturum:oturum-123 -->').length - 1, 1);
    assert.match(metin, /renk paleti/u);
    assert.doesNotMatch(metin, /gizli123/u);
  });

  test('karar dosyası korunur', () => {
    const karar = join(kasa, 'beynim', 'verdigim-kararlar.md');
    const eski = readFileSync(karar, 'utf8');
    const sil = kanca('claude', 'koruma', {
      cwd: kasa, tool_name: 'Write',
      tool_input: { file_path: karar, content: '# Verdiğim kararlar\n\n## Kararlar\n' },
    });
    assert.equal(sil.kod, 0);
    assert.equal(JSON.parse(sil.out).hookSpecificOutput.permissionDecision, 'deny');
    const ekle = kanca('claude', 'koruma', {
      cwd: kasa, tool_name: 'Write',
      tool_input: { file_path: karar, content: `${eski}- 2026-10-17 — Mercan paleti — müşteri onayı\n` },
    });
    assert.equal(ekle.out, '');
    const komut = kanca('claude', 'koruma', {
      cwd: kasa, tool_name: 'Bash', tool_input: { command: 'rm beynim/verdigim-kararlar.md' },
    });
    assert.equal(JSON.parse(komut.out).hookSpecificOutput.permissionDecision, 'deny');
  });

  test('doktor ve arama çalışır', () => {
    const doktor = node([join(kasa, 'beyin.mjs'), 'doktor', '--json']);
    const sonuc = JSON.parse(doktor.out);
    assert.equal(sonuc.saglikli, true, JSON.stringify(sonuc.kontroller.filter(k => k.durum === 'hata')));
    assert.equal(doktor.kod, 0);
    const ara = node([join(kasa, 'beyin.mjs'), 'ara', 'sulu boya']);
    assert.equal(ara.kod, 0, ara.err);
    assert.match(ara.out, /beynim\/verdigim-kararlar\.md/u);
  });

  test('güncelleme kullanıcı dosyalarına dokunmaz', () => {
    const once = kullaniciParmakIzi();
    const { paket, sha } = paketYap('1.0.1');
    const sonuc = node([join(kasa, 'beyin.mjs'), 'guncelle', '--paket', paket, '--sha', sha]);
    assert.equal(sonuc.kod, 0, sonuc.err + sonuc.out);
    assert.match(node([join(kasa, 'beyin.mjs'), 'surum']).out, /1\.0\.1/u);
    assert.equal(JSON.parse(readFileSync(join(kasa, '.beyin', 'kurulum.json'), 'utf8')).surum, '1.0.1');
    assert.deepEqual(kullaniciParmakIzi(), once);
  });

  test('bozuk güncelleme kendini geri alır', () => {
    const once = kullaniciParmakIzi();
    const cliOnce = readFileSync(join(kasa, 'sistem', 'cli.mjs'));
    const { paket, sha } = paketYap('1.0.2', kopya => {
      writeFileSync(join(kopya, 'sistem', 'lib', 'doktor.mjs'),
        'export async function doktor() { return { saglikli: false, kontroller: [{ ad: "x", durum: "hata", mesaj: "bozuk" }] }; }\n');
      writeFileSync(join(kopya, 'sistem', 'cli.mjs'), `${readFileSync(join(kopya, 'sistem', 'cli.mjs'), 'utf8')}\n// 1.0.2\n`);
    });
    const sonuc = node([join(kasa, 'beyin.mjs'), 'guncelle', '--paket', paket, '--sha', sha]);
    assert.equal(sonuc.kod, 1);
    assert.match(node([join(kasa, 'beyin.mjs'), 'surum']).out, /1\.0\.1/u);
    assert.deepEqual(readFileSync(join(kasa, 'sistem', 'cli.mjs')), cliOnce);
    assert.deepEqual(kullaniciParmakIzi(), once);
  });

  test('geri alma ve yeniden kurulum kullanıcı dosyalarını korur', () => {
    const once = kullaniciParmakIzi();
    const geri = node([join(kasa, 'beyin.mjs'), 'geri-al']);
    assert.equal(geri.kod, 0, geri.err);
    assert.match(node([join(kasa, 'beyin.mjs'), 'surum']).out, /1\.0\.0/u);
    const yeniden = node([join(REPO, 'kur.mjs'), '--hedef', kasa, '--istemci', 'claude,codex'], { cwd: tmp });
    assert.equal(yeniden.kod, 0, yeniden.err);
    assert.deepEqual(kullaniciParmakIzi(), once);
    const ayarlar = readFileSync(join(kasa, '.claude', 'settings.json'), 'utf8');
    assert.equal(ayarlar.split('sistem/kanca.mjs').length - 1, 4);
  });

  test('yazılan dosyalarda BOM yok', () => {
    for (const alt of ['sistem', 'beynim', 'gunluk', '.beyin', '.claude', '.codex']) {
      for (const yol of dosyalar(kasa, alt)) {
        if (!/\.(mjs|md|json|txt)$/u.test(yol)) continue;
        assert.ok(!readFileSync(yol, 'utf8').includes('\u{FEFF}'), `${yol} BOM içeriyor`);
      }
    }
  });
});
