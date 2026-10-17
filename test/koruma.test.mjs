import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { korumaKarari } from '../sistem/lib/koruma.mjs';

const kasalar = [];
const KARARLAR = '# Verdiğim kararlar\n\n- 2026-10-01: poster fiyatı 1200 TL\n- 2026-10-05: kapak teslimi cuma\n';
const GUNLUK = '# Günlük — 2026-10-17\n\nSabah müşteri araması.\n';

function kasaKur() {
  const kok = mkdtempSync(join(tmpdir(), 'Dijital Beyin Ğüşİ-'));
  mkdirSync(join(kok, '.beyin'), { recursive: true });
  writeFileSync(join(kok, '.beyin', 'kurulum.json'), '{}');
  mkdirSync(join(kok, 'beynim'), { recursive: true });
  mkdirSync(join(kok, 'gunluk'), { recursive: true });
  writeFileSync(join(kok, 'beynim', 'verdigim-kararlar.md'), KARARLAR);
  writeFileSync(join(kok, 'beynim', 'guncel-durum.md'), 'Elif kapak üzerinde.\n');
  writeFileSync(join(kok, 'gunluk', '2026-10-17.md'), GUNLUK.replace(/\n/gu, '\r\n'));
  kasalar.push(kok);
  return kok;
}

after(() => { for (const kok of kasalar) rmSync(kok, { recursive: true, force: true }); });

const izin = sonuc => assert.deepEqual(sonuc, { izin: true });
function ret(sonuc, parca) {
  assert.equal(sonuc.izin, false, JSON.stringify(sonuc));
  assert.equal(typeof sonuc.neden, 'string');
  if (parca) assert.ok(sonuc.neden.includes(parca), sonuc.neden);
}

describe('korumaKarari: dosya araçları', () => {
  const kok = kasaKur();
  const karar = (aracAdi, girdi) => korumaKarari(kok, { aracAdi, girdi });

  test('kararlar: satır eklemek ve GEÇERSİZ son eki serbest', () => {
    izin(karar('Write', { file_path: 'beynim/verdigim-kararlar.md', content: `${KARARLAR}- 2026-10-17: poster fiyatı 1500 TL\n` }));
    izin(karar('Write', {
      file_path: 'beynim/verdigim-kararlar.md',
      content: KARARLAR.replace('1200 TL', '1200 TL GEÇERSİZ') + '- 2026-10-17: poster fiyatı 1500 TL\n',
    }));
    izin(karar('Edit', {
      file_path: 'beynim/verdigim-kararlar.md',
      old_string: '- 2026-10-01: poster fiyatı 1200 TL',
      new_string: '- 2026-10-01: poster fiyatı 1200 TL GEÇERSİZ',
    }));
    izin(karar('MultiEdit', {
      file_path: 'beynim/verdigim-kararlar.md',
      edits: [
        { old_string: '- 2026-10-05: kapak teslimi cuma', new_string: '- 2026-10-05: kapak teslimi cuma GEÇERSİZ\n- 2026-10-17: kapak teslimi pazartesi' },
      ],
    }));
  });

  test('kararlar: satır silmek ya da değiştirmek reddedilir', () => {
    ret(karar('Write', { file_path: 'beynim/verdigim-kararlar.md', content: '# Verdiğim kararlar\n\n- 2026-10-05: kapak teslimi cuma\n' }), 'GEÇERSİZ');
    ret(karar('Edit', { file_path: 'beynim/verdigim-kararlar.md', old_string: '- 2026-10-01: poster fiyatı 1200 TL\n', new_string: '' }), 'tarihli');
    ret(karar('Edit', { file_path: 'beynim/verdigim-kararlar.md', old_string: 'poster fiyatı 1200 TL', new_string: 'poster fiyatı 1500 TL' }));
    ret(karar('MultiEdit', {
      file_path: 'beynim/verdigim-kararlar.md',
      edits: [
        { old_string: '- 2026-10-01: poster fiyatı 1200 TL', new_string: '- 2026-10-01: poster fiyatı 1200 TL GEÇERSİZ' },
        { old_string: '- 2026-10-05: kapak teslimi cuma', new_string: '' },
      ],
    }));
  });

  test('Windows ters bölü mutlak yol ve büyük/küçük harf', () => {
    const geriBolu = `${kok}\\beynim\\verdigim-kararlar.md`.replace(/\//gu, '\\');
    ret(karar('Write', { file_path: geriBolu, content: '# boş\n- yeni\n' }));
    ret(karar('Edit', { file_path: 'beynim\\verdigim-kararlar.md', old_string: '- 2026-10-01: poster fiyatı 1200 TL', new_string: '' }));
    if (process.platform === 'win32') {
      ret(karar('Write', { file_path: `${kok.toUpperCase()}\\BEYNIM\\Verdigim-Kararlar.md`, content: '- yeni\n' }));
    }
    izin(karar('Write', { file_path: `${kok}\\notlar\\fikir.md`.replace(/\//gu, '\\'), content: '' }));
  });

  test('gunluk/ yalnız-ekle (CRLF dosya dahil); yeni günlük dosyası serbest', () => {
    izin(karar('Write', { file_path: 'gunluk/2026-10-17.md', content: `${GUNLUK}\n- 15:00 yeni not\n` }));
    ret(karar('Write', { file_path: 'gunluk/2026-10-17.md', content: '# Günlük — 2026-10-17\n' }), 'gunluk/');
    ret(karar('Edit', { file_path: join(kok, 'gunluk', '2026-10-17.md'), old_string: 'Sabah müşteri araması.', new_string: 'Öğlen araması.' }));
    izin(karar('Write', { file_path: 'gunluk/2026-10-18.md', content: '# Günlük — 2026-10-18\n' }));
    izin(karar('Edit', { file_path: 'gunluk/2026-10-17.md', old_string: 'Sabah müşteri araması.', new_string: 'Sabah müşteri araması. (ertelendi)' }));
  });

  test('beynim/ notunu boşaltan Write reddedilir, normal düzenleme serbest', () => {
    ret(karar('Write', { file_path: 'beynim/guncel-durum.md', content: '   \n' }), 'boşaltma');
    ret(karar('Write', { file_path: 'beynim/verdigim-kararlar.md', content: '' }));
    izin(karar('Write', { file_path: 'beynim/guncel-durum.md', content: 'Elif iç sayfalarda.\n' }));
    izin(karar('Edit', { file_path: 'beynim/guncel-durum.md', old_string: 'Elif kapak üzerinde.', new_string: '' }));
    izin(karar('Write', { file_path: 'notlar/x.md', content: '' }));
    izin(karar('Write', { file_path: '../dis/beynim/x.md', content: '' }));
    izin(karar('Read', { file_path: 'beynim/verdigim-kararlar.md' }));
  });
});

describe('korumaKarari: kabuk komutları', () => {
  const kok = kasaKur();
  const kabuk = (command, aracAdi = 'Bash') => korumaKarari(kok, { aracAdi, girdi: { command } });

  test('beynim/gunluk hedefli silme, taşıma, üzerine yazma reddedilir', () => {
    for (const komut of [
      'rm beynim/guncel-durum.md',
      'rm -rf gunluk',
      'cd beynim && rm -f *.md',
      'mv beynim/verdigim-kararlar.md /tmp/',
      'git mv gunluk/2026-10-17.md arsiv/',
      'echo "" > beynim/verdigim-kararlar.md',
      'echo x >"gunluk/2026-10-17.md"',
      'truncate -s 0 beynim/ben-kimim.md',
      "sed -i 's/1200/1500/' beynim/verdigim-kararlar.md",
      'git checkout -- beynim/verdigim-kararlar.md',
    ]) ret(kabuk(komut), 'GEÇERSİZ');
    for (const komut of [
      'Remove-Item .\\beynim\\x.md',
      'Remove-Item -Recurse -Force "C:\\Kasa\\gunluk"',
      'ri beynim\\guncel-durum.md',
      'del /q gunluk\\*.md',
      'Move-Item beynim\\a.md notlar\\a.md',
      'Set-Content -Path beynim\\verdigim-kararlar.md -Value ""',
      'Clear-Content gunluk\\2026-10-17.md',
      '"" | Out-File beynim\\ben-kimim.md',
    ]) ret(kabuk(komut, 'PowerShell'), 'GEÇERSİZ');
  });

  test('okuma, ekleme ve ilgisiz komutlar serbest', () => {
    for (const komut of [
      'cat beynim/guncel-durum.md',
      'cat beynim/guncel-durum.md 2>/dev/null',
      'grep -rn poster beynim gunluk',
      'echo "- 2026-10-17: poster fiyatı 1500 TL" >> beynim/verdigim-kararlar.md',
      'rm -rf node_modules',
      'Remove-Item .\\.beyin\\durum\\x.kilit',
      'node beyin.mjs ara "beynim kararları"',
      'git commit -m "move beynim notes"',
      'ls beynim-yedek && rm beynim-yedek/x',
      'Get-Content beynim\\guncel-durum.md | Select-String poster',
    ]) izin(kabuk(komut));
  });

  test('Codex apply_patch: kararı silmek reddedilir, GEÇERSİZ eklemek serbest', () => {
    const yama = govde => `apply_patch <<'EOF'\n*** Begin Patch\n${govde}\n*** End Patch\nEOF`;
    izin(kabuk(yama('*** Update File: beynim/verdigim-kararlar.md\n@@\n-- 2026-10-01: poster fiyatı 1200 TL\n+- 2026-10-01: poster fiyatı 1200 TL GEÇERSİZ\n+- 2026-10-17: poster fiyatı 1500 TL')));
    ret(kabuk(yama('*** Update File: beynim/verdigim-kararlar.md\n@@\n-- 2026-10-01: poster fiyatı 1200 TL\n+- 2026-10-01: poster fiyatı 1500 TL')));
    ret(kabuk(yama('*** Delete File: beynim/guncel-durum.md')));
    ret(kabuk(yama('*** Update File: gunluk/2026-10-17.md\n*** Move to: arsiv/eski.md')));
    izin(kabuk(yama('*** Update File: beynim/guncel-durum.md\n@@\n-Elif kapak üzerinde.\n+Elif iç sayfalarda.')));
    izin(korumaKarari(kok, { aracAdi: 'apply_patch', girdi: { input: '*** Begin Patch\n*** Add File: notlar/yeni.md\n+selam\n*** End Patch' } }));
    ret(korumaKarari(kok, { aracAdi: 'apply_patch', girdi: { input: '*** Begin Patch\n*** Delete File: gunluk/2026-10-17.md\n*** End Patch' } }));
  });

  test('Codex dizi biçimli komut', () => {
    ret(korumaKarari(kok, { aracAdi: 'shell', girdi: { command: ['powershell.exe', '-Command', 'Remove-Item beynim\\x.md'] } }));
    izin(korumaKarari(kok, { aracAdi: 'shell', girdi: { command: ['bash', '-lc', 'ls beynim'] } }));
  });
});

describe('korumaKarari: tercih ve hatalı girdi', () => {
  test('koruma kapalıysa her şey serbest; bozuk girdi fırlatmaz', () => {
    const kok = kasaKur();
    writeFileSync(join(kok, '.beyin', 'tercihler.json'), JSON.stringify({ koruma: false }));
    izin(korumaKarari(kok, { aracAdi: 'Bash', girdi: { command: 'rm -rf beynim' } }));
    izin(korumaKarari(kok, { aracAdi: 'Write', girdi: { file_path: 'beynim/verdigim-kararlar.md', content: '' } }));
    const acik = kasaKur();
    izin(korumaKarari(acik, {}));
    izin(korumaKarari(acik));
    izin(korumaKarari(undefined, { aracAdi: 'Bash', girdi: { command: 'rm -rf beynim' } }));
    izin(korumaKarari(acik, { aracAdi: 'Write', girdi: { file_path: 42, content: '' } }));
    izin(korumaKarari(acik, { aracAdi: 'MultiEdit', girdi: { file_path: 'beynim/verdigim-kararlar.md', edits: [null, 5] } }));
  });
});

test('karar dosyasında açıklama ve örnek satırları silinebilir, karar maddesi silinemez', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { korumaKarari } = await import('../sistem/lib/koruma.mjs');
  const kok = mkdtempSync(join(tmpdir(), 'Dijital Beyin Ğüşİ-'));
  try {
    mkdirSync(join(kok, '.beyin'), { recursive: true });
    writeFileSync(join(kok, '.beyin', 'kurulum.json'), '{}');
    mkdirSync(join(kok, 'beynim'));
    const dosya = join(kok, 'beynim', 'verdigim-kararlar.md');
    const icerik = '# Verdiğim kararlar\n\n<!-- açıklama\n- (örnek) 2026-01-01 — örnek — biçim -->\n\n- 2026-10-02 — Sulu boya — sıcak ton\n';
    writeFileSync(dosya, icerik);
    const temiz = '# Verdiğim kararlar\n\n- 2026-10-02 — Sulu boya — sıcak ton\n';
    assert.deepEqual(korumaKarari(kok, { aracAdi: 'Write', girdi: { file_path: dosya, content: temiz } }), { izin: true });
    const karar = korumaKarari(kok, { aracAdi: 'Write', girdi: { file_path: dosya, content: '# Verdiğim kararlar\n' } });
    assert.equal(karar.izin, false);
    const duzenle = korumaKarari(kok, { aracAdi: 'Edit', girdi: { file_path: dosya, old_string: '<!-- açıklama\n- (örnek) 2026-01-01 — örnek — biçim -->\n', new_string: '' } });
    assert.equal(duzenle.izin, true);
  } finally {
    rmSync(kok, { recursive: true, force: true });
  }
});

describe('korumaKarari: komuta bağlı hedef (kabuk)', () => {
  const kok = kasaKur();
  const kabuk = (command, aracAdi = 'Bash') => korumaKarari(kok, { aracAdi, girdi: { command } });

  test('kopyalama, find -delete ve değişkenli yönlendirme reddedilir', () => {
    for (const komut of [
      'cp x.md beynim/verdigim-kararlar.md',
      'cp -f x.md "beynim/guncel-durum.md"',
      'copy x.md beynim\\guncel-durum.md',
      'find gunluk -delete',
      'find gunluk -name "*.md" -exec rm {} +',
      'F=beynim/guncel-durum.md; : > "$F"',
      'sudo rm -rf gunluk',
      'bash -c "rm -rf beynim"',
    ]) ret(kabuk(komut), 'GEÇERSİZ');
    for (const komut of [
      'Copy-Item -Force x.md beynim\\verdigim-kararlar.md',
      'Copy-Item x.md -Destination gunluk\\2026-10-17.md',
    ]) ret(kabuk(komut, 'PowerShell'), 'GEÇERSİZ');
  });

  test('yıkıcı fiil korunan argümana bağlı: ilgisiz yollar ve arama sorguları serbest', () => {
    for (const komut of [
      'rm -rf dist && node beyin.mjs ara "beynim"',
      'grep -rn rm gunluk/',
      'git rm --cached tmp.log && git add gunluk/',
      'cp beynim/guncel-durum.md yedek/',
      'find . -name "*.log" -delete',
      'find gunluk -name "*.md"',
      'echo "- kayıt" >> gunluk/2026-10-17.md',
      'ls beynim; rm -f tmp.txt',
    ]) izin(kabuk(komut));
    izin(kabuk('Remove-Item dist -Recurse; Get-Content beynim\\guncel-durum.md', 'PowerShell'));
  });

  test('Codex apply_patch: var olan korunan dosyaya Add File yeniden yazmadır', () => {
    const yama = govde => ({ aracAdi: 'apply_patch', girdi: { input: `*** Begin Patch\n${govde}\n*** End Patch` } });
    ret(korumaKarari(kok, yama('*** Add File: beynim/verdigim-kararlar.md\n+# Verdiğim kararlar\n+- 2026-10-17: yeni')));
    ret(korumaKarari(kok, yama('*** Add File: gunluk/2026-10-17.md\n+boş değil ama eski satırlar yok')));
    izin(korumaKarari(kok, yama('*** Add File: gunluk/2030-01-01.md\n+yeni gün')));
  });
});

describe('korumaKarari: çoklu küme ve numaralı kararlar', () => {
  test('aynı karar satırının iki kopyasından birini silmek reddedilir', () => {
    const kok = kasaKur();
    const ikili = '# Verdiğim kararlar\n\n- 2026-10-01: poster fiyatı 1200 TL\n- 2026-10-01: poster fiyatı 1200 TL\n';
    writeFileSync(join(kok, 'beynim', 'verdigim-kararlar.md'), ikili);
    const karar = girdi => korumaKarari(kok, { aracAdi: 'Write', girdi: { file_path: 'beynim/verdigim-kararlar.md', ...girdi } });
    ret(karar({ content: '# Verdiğim kararlar\n\n- 2026-10-01: poster fiyatı 1200 TL\n' }), 'GEÇERSİZ');
    izin(karar({ content: ikili }));
    izin(karar({ content: ikili.replace('1200 TL\n- 2026', '1200 TL GEÇERSİZ\n- 2026') }));
  });

  test('numaralı karar maddeleri de korunur', () => {
    const kok = kasaKur();
    writeFileSync(join(kok, 'beynim', 'verdigim-kararlar.md'), '# Verdiğim kararlar\n\n1. Poster 1200 TL\n2) Teslim cuma\n');
    const karar = content => korumaKarari(kok, { aracAdi: 'Write', girdi: { file_path: 'beynim/verdigim-kararlar.md', content } });
    ret(karar('# Verdiğim kararlar\n\n2) Teslim cuma\n'), 'GEÇERSİZ');
    izin(karar('# Verdiğim kararlar\n\n1. Poster 1200 TL GEÇERSİZ\n2) Teslim cuma\n3. Yeni\n'));
  });
});
