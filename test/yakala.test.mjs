import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kaydetmeIstendiMi, oturumuYakala, ozetCikar, transkriptOku, tumDosyadaKaydetmeVarMi } from '../sistem/lib/yakala.mjs';

const FIKSTUR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'a-transkript');
const SIMDI = new Date(2026, 9, 17, 14, 5);
const kasalar = [];

function kasaKur() {
  const kok = mkdtempSync(join(tmpdir(), 'Dijital Beyin Ğüşİ-'));
  mkdirSync(join(kok, '.beyin'), { recursive: true });
  writeFileSync(join(kok, '.beyin', 'kurulum.json'), '{}');
  kasalar.push(kok);
  return kok;
}

// Fikstürü kasaya kopyalar; __KASA__ yer tutucusu kasanın mutlak yoluna döner.
function fiksturYaz(kok, ad, ekSatirlar = []) {
  const kasaJson = JSON.stringify(kok).slice(1, -1);
  const icerik = readFileSync(join(FIKSTUR, ad), 'utf8').replaceAll('__KASA__', kasaJson);
  const dosya = join(kok, '.beyin', `transkript-${ad}`);
  writeFileSync(dosya, icerik + ekSatirlar.map(s => `${JSON.stringify(s)}\n`).join(''));
  return dosya;
}

function satirlarYaz(kok, ad, satirlar) {
  const dosya = join(kok, '.beyin', ad);
  writeFileSync(dosya, satirlar.map(s => JSON.stringify(s)).join('\n') + '\n');
  return dosya;
}

const kullanici = text => ({ type: 'user', message: { role: 'user', content: text } });
const asistan = text => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });

after(() => { for (const kok of kasalar) rmSync(kok, { recursive: true, force: true }); });

describe('transkriptOku', () => {
  test('Claude Code: yalnız insan metni ve asistan text blokları kalır', () => {
    const kok = kasaKur();
    const mesajlar = transkriptOku(fiksturYaz(kok, 'claude.jsonl'));
    assert.deepEqual(mesajlar.map(m => [m.rol, m.metin]), [
      ['user', 'Elif için portfolyo sitesinin ana sayfa metnini yaz, ton samimi olsun.'],
      ['assistant', 'Ana sayfa metnini hazırlıyorum.'],
      ['user', 'Fiyat listesini de ekle.'],
      ['assistant', 'Ana sayfa metni notlar/portfolyo.md dosyasında. Test için yazdığın sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 anahtarını sohbete yazma.'],
    ]);
    assert.equal(mesajlar[0].zaman, '2026-10-17T11:01:00.000Z');
    const hepsi = JSON.stringify(mesajlar);
    for (const yasak of ['system-reminder', 'Injected', 'Caveat', 'command-name', 'Gizli düşünce', 'continued', 'Alt ajan', 'interrupted', 'No response']) {
      assert.ok(!hepsi.includes(yasak), yasak);
    }
    assert.deepEqual(mesajlar.dosyalar, [`${kok}/notlar/portfolyo.md`, 'notlar/fiyatlar.md']);
    assert.ok(!Object.keys(mesajlar).includes('dosyalar'), 'dosyalar sayılamaz özellik olmalı');
  });

  test('Codex: çift kayıt ve AGENTS.md/environment_context enjeksiyonu atılır', () => {
    const kok = kasaKur();
    const mesajlar = transkriptOku(fiksturYaz(kok, 'codex.jsonl'));
    assert.deepEqual(mesajlar.map(m => [m.rol, m.metin]), [
      ['user', "Elif'in illüstrasyon fiyat listesini güncelle: poster 1500 TL olsun."],
      ['assistant', 'Fiyat listesi güncellendi: poster artık 1500 TL.'],
    ]);
    assert.deepEqual(mesajlar.dosyalar, ['notlar/fiyatlar.md']);
  });

  test('büyük dosyada yalnız sondaki sinirBayt okunur, yarım ilk satır atılır', () => {
    const kok = kasaKur();
    const satirlar = [];
    for (let i = 0; i < 200; i += 1) satirlar.push(kullanici(`eski mesaj ${i}`), asistan(`eski cevap ${i}`));
    satirlar.push(kullanici('en son istek'), asistan('en son cevap'));
    const dosya = satirlarYaz(kok, 'buyuk.jsonl', satirlar);
    const mesajlar = transkriptOku(dosya, { sinirBayt: 2000 });
    assert.ok(mesajlar.length > 2 && mesajlar.length < 40, String(mesajlar.length));
    assert.deepEqual(mesajlar.at(-1), { rol: 'assistant', metin: 'en son cevap' });
    assert.ok(mesajlar.every(m => /^(eski|en son)/u.test(m.metin)));
  });

  test('olmayan ya da ikili dosya boş dizi döndürür', () => {
    const kok = kasaKur();
    assert.deepEqual(transkriptOku(join(kok, 'yok.jsonl')), []);
    const ikili = join(kok, '.beyin', 'ikili.jsonl');
    writeFileSync(ikili, Buffer.from([0, 255, 254, 10, 123, 1, 2, 10]));
    assert.deepEqual(transkriptOku(ikili), []);
  });
});

describe('kaydetmeIstendiMi ve ozetCikar', () => {
  test('kaydetme kalıpları yalnız kullanıcı mesajında', () => {
    const u = metin => [{ rol: 'user', metin }];
    assert.equal(kaydetmeIstendiMi(u('Bunu not al [kaydetme]')), true);
    assert.equal(kaydetmeIstendiMi(u('[KAYDETME] özel konu')), true);
    assert.equal(kaydetmeIstendiMi(u('bunu kaydetme lütfen')), true);
    assert.equal(kaydetmeIstendiMi(u('Do not save this conversation.')), true);
    assert.equal(kaydetmeIstendiMi(u('Kaydetme butonunun rengi ne olsun?')), false);
    assert.equal(kaydetmeIstendiMi([{ rol: 'assistant', metin: '[kaydetme]' }]), false);
    assert.equal(kaydetmeIstendiMi(null), false);
  });

  test('düz mesaj dizisiyle çalışır, sınırları uygular', () => {
    const ozet = ozetCikar([
      { rol: 'user', metin: '   ' },
      { rol: 'user', metin: `İlk  gerçek\nistek ${'a'.repeat(500)}` },
      { rol: 'assistant', metin: 'ara cevap' },
      { rol: 'user', metin: 'ikinci' },
      { rol: 'assistant', metin: `son ${'b'.repeat(700)}` },
    ]);
    assert.ok(ozet.istek.startsWith('İlk gerçek istek '));
    assert.equal(ozet.istek.length, 400);
    assert.ok(ozet.istek.endsWith('…'));
    assert.ok(ozet.sonuc.startsWith('son '));
    assert.equal(ozet.sonuc.length, 600);
    assert.equal(ozet.tur_sayisi, 2);
    assert.deepEqual(ozet.dosyalar, []);
    assert.deepEqual(ozetCikar(undefined), { istek: '', sonuc: '', dosyalar: [], tur_sayisi: 0 });
  });
});

describe('oturumuYakala', () => {
  test('Claude oturumu bloğu biçimli, göreli dosyalı ve sırları gizli yazar', () => {
    const kok = kasaKur();
    const transkript = fiksturYaz(kok, 'claude.jsonl');
    const sonuc = oturumuYakala(kok, { istemci: 'claude', oturumId: 'abcdef12-3456-7890', transkriptYolu: transkript, olay: 'bitis', simdi: SIMDI });
    const dosya = join(kok, 'gunluk', '2026-10-17.md');
    assert.deepEqual(sonuc, { durum: 'yakalandi', dosya });
    const icerik = readFileSync(dosya, 'utf8');
    assert.equal(icerik, [
      '# Günlük — 2026-10-17',
      '',
      '<!-- oturum:abcdef12-3456-7890 -->',
      '### 14:05 · claude · abcdef12',
      '- **İstek:** Elif için portfolyo sitesinin ana sayfa metnini yaz, ton samimi olsun.',
      '- **Sonuç:** Ana sayfa metni notlar/portfolyo.md dosyasında. Test için yazdığın [GİZLENDİ:api_anahtari] anahtarını sohbete yazma.',
      '- **Dosyalar:** notlar/portfolyo.md, notlar/fiyatlar.md',
      '_Modelsiz özet · 2 tur_',
      '<!-- /oturum:abcdef12-3456-7890 -->',
      '',
    ].join('\n'));
    assert.ok(!icerik.includes('sk-ant'));
  });

  test('Codex oturumu yakalanır', () => {
    const kok = kasaKur();
    const sonuc = oturumuYakala(kok, { istemci: 'codex', oturumId: '0199a1b2-c3d4', transkriptYolu: fiksturYaz(kok, 'codex.jsonl'), olay: 'durdur', simdi: SIMDI });
    assert.equal(sonuc.durum, 'yakalandi');
    const icerik = readFileSync(sonuc.dosya, 'utf8');
    assert.match(icerik, /### 14:05 · codex · 0199a1b2/u);
    assert.match(icerik, /- \*\*Dosyalar:\*\* notlar\/fiyatlar\.md/u);
    assert.match(icerik, /_Modelsiz özet · 1 tur_/u);
  });

  test('aynı oturum ikinci kez yakalanınca blok çoğalmaz, yerinde yenilenir', () => {
    const kok = kasaKur();
    const dosya = join(kok, 'gunluk', '2026-10-17.md');
    mkdirSync(dirname(dosya), { recursive: true });
    writeFileSync(dosya, '# Günlük — 2026-10-17\n\nElif sabah notu: müşteri araması 10:00.\n');
    const diger = satirlarYaz(kok, 'diger.jsonl', [kullanici('Başka oturum isteği'), asistan('Başka sonuç')]);
    oturumuYakala(kok, { istemci: 'claude', oturumId: 'diger-oturum', transkriptYolu: diger, simdi: SIMDI });

    const ilk = fiksturYaz(kok, 'claude.jsonl');
    oturumuYakala(kok, { istemci: 'claude', oturumId: 'tekrar.1', transkriptYolu: ilk, simdi: SIMDI });
    const ikinci = fiksturYaz(kok, 'claude.jsonl', [kullanici('Bir de iletişim sayfası ekle.'), asistan('İletişim sayfası da eklendi.')]);
    const sonuc = oturumuYakala(kok, { istemci: 'claude', oturumId: 'tekrar.1', transkriptYolu: ikinci, simdi: new Date(2026, 9, 17, 15, 30) });
    assert.equal(sonuc.durum, 'yakalandi');
    const icerik = readFileSync(dosya, 'utf8');
    assert.equal(icerik.split('<!-- oturum:tekrar.1 -->').length - 1, 1);
    assert.equal(icerik.split('<!-- /oturum:tekrar.1 -->').length - 1, 1);
    assert.match(icerik, /### 15:30 · claude · tekrar\.1\n/u);
    assert.match(icerik, /İletişim sayfası da eklendi\./u);
    assert.match(icerik, /_Modelsiz özet · 3 tur_/u);
    assert.ok(icerik.startsWith('# Günlük — 2026-10-17\n\nElif sabah notu: müşteri araması 10:00.\n'));
    assert.ok(icerik.indexOf('oturum:diger-oturum') < icerik.indexOf('oturum:tekrar.1'));
    assert.match(icerik, /Başka sonuç/u);
  });

  test('[kaydetme] yakalamayı atlar ve var olan bloğu siler', () => {
    const kok = kasaKur();
    const satirlar = [kullanici('Elif’in vergi planı'), asistan('Plan hazır.')];
    const dosya1 = satirlarYaz(kok, 'k1.jsonl', satirlar);
    const diger = satirlarYaz(kok, 'k0.jsonl', [kullanici('Kalıcı oturum'), asistan('Kalsın.')]);
    oturumuYakala(kok, { istemci: 'claude', oturumId: 'kalici', transkriptYolu: diger, simdi: SIMDI });
    oturumuYakala(kok, { istemci: 'claude', oturumId: 'gizli-1', transkriptYolu: dosya1, simdi: SIMDI });
    const gunluk = join(kok, 'gunluk', '2026-10-17.md');
    assert.match(readFileSync(gunluk, 'utf8'), /oturum:gizli-1/u);

    const dosya2 = satirlarYaz(kok, 'k2.jsonl', [...satirlar, kullanici('Aslında [kaydetme]'), asistan('Tamam.')]);
    const sonuc = oturumuYakala(kok, { istemci: 'claude', oturumId: 'gizli-1', transkriptYolu: dosya2, simdi: SIMDI });
    assert.equal(sonuc.durum, 'atlandi');
    assert.equal(sonuc.neden, 'kaydetme');
    const icerik = readFileSync(gunluk, 'utf8');
    assert.ok(!icerik.includes('gizli-1'));
    assert.ok(!icerik.includes('vergi'));
    assert.match(icerik, /oturum:kalici/u);
    assert.ok(!/\n{3,}/u.test(icerik));
  });

  test('[kaydetme] dosya yoksa dosya oluşturmaz', () => {
    const kok = kasaKur();
    const dosya = satirlarYaz(kok, 'k.jsonl', [kullanici('[kaydetme] özel'), asistan('Tamam.')]);
    const sonuc = oturumuYakala(kok, { istemci: 'claude', oturumId: 'x1', transkriptYolu: dosya, simdi: SIMDI });
    assert.equal(sonuc.neden, 'kaydetme');
    assert.equal(existsSync(join(kok, 'gunluk', '2026-10-17.md')), false);
  });

  test('yakalama kapalı, geçersiz kimlik, eksik transkript ve boş oturum atlanır', () => {
    const kok = kasaKur();
    const iyi = satirlarYaz(kok, 'iyi.jsonl', [kullanici('Merhaba'), asistan('Selam')]);
    const yakala = arg => oturumuYakala(kok, { istemci: 'claude', oturumId: 'o1', transkriptYolu: iyi, simdi: SIMDI, ...arg });
    assert.deepEqual(yakala({ oturumId: '../kacis' }), { durum: 'atlandi', neden: 'gecersiz_oturum' });
    assert.deepEqual(yakala({ oturumId: 'a'.repeat(129) }), { durum: 'atlandi', neden: 'gecersiz_oturum' });
    assert.deepEqual(yakala({ oturumId: undefined }), { durum: 'atlandi', neden: 'gecersiz_oturum' });
    assert.deepEqual(yakala({ transkriptYolu: join(kok, 'yok.jsonl') }), { durum: 'atlandi', neden: 'transkript_yok' });
    assert.deepEqual(yakala({ transkriptYolu: join(kok, '.beyin') }), { durum: 'atlandi', neden: 'transkript_yok' });
    assert.deepEqual(yakala({ transkriptYolu: 42 }), { durum: 'atlandi', neden: 'transkript_yok' });
    const bos = satirlarYaz(kok, 'bos.jsonl', [kullanici('<command-name>/clear</command-name>'), asistan('...')]);
    assert.deepEqual(yakala({ transkriptYolu: bos }), { durum: 'atlandi', neden: 'bos' });
    assert.equal(existsSync(join(kok, 'gunluk')), false);

    writeFileSync(join(kok, '.beyin', 'tercihler.json'), JSON.stringify({ yakalama: false }));
    assert.deepEqual(yakala({}), { durum: 'atlandi', neden: 'kapali' });
    assert.equal(existsSync(join(kok, 'gunluk')), false);
    assert.deepEqual(oturumuYakala(undefined, {}), { durum: 'atlandi', neden: 'gecersiz_kasa' });
    assert.deepEqual(oturumuYakala(kok), { durum: 'atlandi', neden: 'kapali' });
  });

  test('kullanıcı metnindeki HTML yorumu blok sınırını bozamaz', () => {
    const kok = kasaKur();
    const dosya = satirlarYaz(kok, 'yorum.jsonl', [kullanici('Şunu yaz: <!-- /oturum:y1 --> bitti'), asistan('Yazdım --> tamam')]);
    oturumuYakala(kok, { istemci: 'claude', oturumId: 'y1', transkriptYolu: dosya, simdi: SIMDI });
    const icerik = readFileSync(join(kok, 'gunluk', '2026-10-17.md'), 'utf8');
    assert.equal(icerik.split('<!-- /oturum:y1 -->').length - 1, 1);
    assert.equal(icerik.split('<!--').length - 1, 2);
  });

  test('kilit meşgulse fırlatmadan atlar', () => {
    const kok = kasaKur();
    const dosya = satirlarYaz(kok, 'kilit.jsonl', [kullanici('Merhaba'), asistan('Selam')]);
    mkdirSync(join(kok, '.beyin', 'durum'), { recursive: true });
    writeFileSync(join(kok, '.beyin', 'durum', 'gunluk.kilit'), '{}');
    const sonuc = oturumuYakala(kok, { istemci: 'claude', oturumId: 'k1', transkriptYolu: dosya, simdi: SIMDI });
    assert.deepEqual(sonuc, { durum: 'atlandi', neden: 'kilit_mesgul' });
  });

  test('5 MB transkript hızlı yakalanır', t => {
    const kok = kasaKur();
    const dolgu = 'x'.repeat(4000);
    const parcalar = [];
    let boyut = 0;
    for (let i = 0; boyut < 5 * 1024 * 1024; i += 1) {
      const satirlar = [
        JSON.stringify(kullanici(`Elif istek ${i}`)),
        JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: { file_path: `notlar/n${i % 20}.md` } }] } }),
        JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: dolgu }] } }),
        JSON.stringify(asistan(`cevap ${i}`)),
      ].join('\n');
      boyut += satirlar.length + 1;
      parcalar.push(satirlar);
    }
    const dosya = join(kok, '.beyin', 'buyuk.jsonl');
    writeFileSync(dosya, `${parcalar.join('\n')}\n`);
    const basla = performance.now();
    const sonuc = oturumuYakala(kok, { istemci: 'claude', oturumId: 'hiz', transkriptYolu: dosya, simdi: SIMDI });
    const sure = performance.now() - basla;
    assert.equal(sonuc.durum, 'yakalandi');
    t.diagnostic(`5 MB yakalama: ${sure.toFixed(0)} ms`);
    assert.ok(sure < 1500, `${sure} ms`);
    assert.match(readFileSync(sonuc.dosya, 'utf8'), /- \*\*Dosyalar:\*\* (notlar\/n\d+\.md, ){7}notlar\/n\d+\.md\n/u);
  });
});

describe('yakalama sertleştirmeleri', () => {
  test('kesim sınırına denk gelen anahtar önce süzüldüğü için sızmaz', () => {
    const anahtar = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123';
    // Anahtar 400. karakterin ortasında kalır: önce kesilseydi kalan önek gizlenemeyecek kadar kısa olurdu.
    const istek = `${'a'.repeat(385)} ${anahtar} son`;
    const sonuc = `${'b'.repeat(585)} ${anahtar} son`;
    const ozet = ozetCikar([{ rol: 'user', metin: istek }, { rol: 'assistant', metin: sonuc }]);
    for (const alan of [ozet.istek, ozet.sonuc]) {
      assert.ok(!alan.includes('sk-'), alan);
      assert.ok(alan.includes('[GİZLENDİ:api_anahtari]') || alan.endsWith('…'), alan);
    }

    const kok = kasaKur();
    const dosya = satirlarYaz(kok, 'kesim.jsonl', [kullanici(istek), asistan(sonuc)]);
    const yakalandi = oturumuYakala(kok, { istemci: 'claude', oturumId: 'kesim', transkriptYolu: dosya, simdi: SIMDI });
    const icerik = readFileSync(yakalandi.dosya, 'utf8');
    assert.ok(!icerik.includes('sk-'), icerik);
    assert.ok(!icerik.includes('api03'), icerik);
  });

  test('8 MB üstü transkriptte baştaki [kaydetme] kalıcı işaretle korunur', () => {
    const kok = kasaKur();
    const gunluk = join(kok, 'gunluk', '2026-10-17.md');
    const ilk = satirlarYaz(kok, 'ilk.jsonl', [kullanici('Gizli vergi planı'), asistan('Hazır.')]);
    oturumuYakala(kok, { istemci: 'codex', oturumId: 'devasa', transkriptYolu: ilk, simdi: SIMDI });
    assert.match(readFileSync(gunluk, 'utf8'), /oturum:devasa/u);

    const dolgu = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'x'.repeat(8000) }] } });
    const govde = Array.from({ length: 1200 }, () => dolgu).join('\n');
    const basa = `${JSON.stringify(kullanici('Bunu [kaydetme] lütfen'))}\n${JSON.stringify(asistan('Tamam.'))}\n`;
    const sonaKullanici = `${JSON.stringify(kullanici('Devam edelim'))}\n${JSON.stringify(asistan('Devam.'))}\n`;
    const buyuk = join(kok, '.beyin', 'devasa.jsonl');
    writeFileSync(buyuk, `${basa}${govde}\n${sonaKullanici}`);
    assert.ok(statSync(buyuk).size > 8_000_000);
    assert.equal(kaydetmeIstendiMi(transkriptOku(buyuk)), false, 'pencere isteği görmemeli');

    const sonuc = oturumuYakala(kok, { istemci: 'codex', oturumId: 'devasa', transkriptYolu: buyuk, simdi: SIMDI });
    assert.equal(sonuc.neden, 'kaydetme');
    assert.ok(!readFileSync(gunluk, 'utf8').includes('devasa'));
    assert.ok(existsSync(join(kok, '.beyin', 'durum', 'kaydetme', 'devasa.isaret')));

    // İstek artık hiçbir yerde görünmese de işaret sayesinde blok geri gelmez.
    const temiz = satirlarYaz(kok, 'temiz.jsonl', [kullanici('Devam edelim'), asistan('Devam.')]);
    const tekrar = oturumuYakala(kok, { istemci: 'codex', oturumId: 'devasa', transkriptYolu: temiz, simdi: SIMDI });
    assert.equal(tekrar.neden, 'kaydetme');
    assert.ok(!readFileSync(gunluk, 'utf8').includes('devasa'));
    // Başka oturum etkilenmez.
    assert.equal(oturumuYakala(kok, { istemci: 'codex', oturumId: 'baska', transkriptYolu: temiz, simdi: SIMDI }).durum, 'yakalandi');
  });

  test('8 MB üstü transkriptte kaydetme isteği yoksa normal yakalanır; asistan metni sayılmaz', () => {
    const kok = kasaKur();
    const dolgu = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: '[kaydetme] '.repeat(600) }] } });
    const asistanSozu = JSON.stringify(asistan('Kullanıcı [kaydetme] yazarsa kaydetmem.'));
    const buyuk = join(kok, '.beyin', 'buyuk2.jsonl');
    writeFileSync(buyuk, `${JSON.stringify(kullanici('Normal istek'))}\n${asistanSozu}\n${Array.from({ length: 1500 }, () => dolgu).join('\n')}\n${JSON.stringify(kullanici('Son istek'))}\n`);
    assert.ok(statSync(buyuk).size > 8_000_000);
    assert.equal(tumDosyadaKaydetmeVarMi(buyuk), false);
    assert.equal(oturumuYakala(kok, { istemci: 'claude', oturumId: 'normal', transkriptYolu: buyuk, simdi: SIMDI }).durum, 'yakalandi');
  });

  test('kilit meşgulken yeniden dener, yine olmazsa hata günlüğüne yazar', () => {
    const kok = kasaKur();
    const dosya = satirlarYaz(kok, 'kilit2.jsonl', [kullanici('Merhaba'), asistan('Selam')]);
    mkdirSync(join(kok, '.beyin', 'durum'), { recursive: true });
    writeFileSync(join(kok, '.beyin', 'durum', 'gunluk.kilit'), '{}');
    const basla = performance.now();
    const sonuc = oturumuYakala(kok, { istemci: 'claude', oturumId: 'mesgul-1', transkriptYolu: dosya, simdi: SIMDI });
    const sure = performance.now() - basla;
    assert.deepEqual(sonuc, { durum: 'atlandi', neden: 'kilit_mesgul' });
    assert.ok(sure >= 800 && sure < 3000, `${sure} ms`);
    const log = readFileSync(join(kok, '.beyin', 'durum', 'hatalar.log'), 'utf8');
    assert.match(log, /kilit_mesgul: oturum mesgul-1/u);
  });

  test('gece yarısını aşan oturum dünkü bloğu yerinde yeniler, bugüne ikinci blok açmaz', () => {
    const kok = kasaKur();
    const dun = new Date(2026, 9, 16, 23, 50);
    const bugun = new Date(2026, 9, 17, 0, 10);
    const ilk = satirlarYaz(kok, 'gece1.jsonl', [kullanici('Gece işi'), asistan('Başladı.')]);
    const bir = oturumuYakala(kok, { istemci: 'claude', oturumId: 'gece', transkriptYolu: ilk, simdi: dun });
    const ikinci = satirlarYaz(kok, 'gece2.jsonl', [kullanici('Gece işi'), asistan('Başladı.'), kullanici('Devam'), asistan('Bitti.')]);
    const iki = oturumuYakala(kok, { istemci: 'claude', oturumId: 'gece', transkriptYolu: ikinci, simdi: bugun });
    assert.equal(iki.durum, 'yakalandi');
    assert.equal(iki.dosya, bir.dosya);
    assert.equal(existsSync(join(kok, 'gunluk', '2026-10-17.md')), false);
    const icerik = readFileSync(bir.dosya, 'utf8');
    assert.equal(icerik.split('<!-- oturum:gece -->').length - 1, 1);
    assert.match(icerik, /Bitti\./u);
    assert.match(icerik, /2 tur/u);
  });
});
