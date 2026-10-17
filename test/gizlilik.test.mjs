import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sirlariGizle } from '../sistem/lib/gizlilik.mjs';

const gizle = metin => sirlariGizle(metin);

describe('sirlariGizle', () => {
  test('her sır türü gizlenir ve türü raporlanır', () => {
    const ornekler = [
      ['anahtar sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 burada', 'api_anahtari', 'sk-ant'],
      ['OPENAI=sk-proj-AbCdEfGhIjKlMnOpQrStUvWx12', 'api_anahtari', 'sk-proj'],
      ['token ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'github_token', 'ghp_'],
      ['github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuv', 'github_token', 'github_pat_'],
      ['slack xoxb-1234567890-abcdefghij', 'slack_token', 'xoxb-'],
      ['aws AKIAIOSFODNN7EXAMPLE kullan', 'aws_anahtari', 'AKIA'],
      ['google AIzaSyA-abcdefghijklmnopqrstuvwxyz012345 key', 'google_anahtari', 'AIza'],
      ['jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJlbGlmIn0.c2lnbmF0dXJlLXRlc3Q tamam', 'jwt', 'eyJ'],
      ['-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nabc\n-----END RSA PRIVATE KEY-----', 'ozel_anahtar', 'MIIEow'],
      ['-----BEGIN OPENSSH PRIVATE KEY-----\nyarim kalmis blok', 'ozel_anahtar', 'yarim'],
      ['db postgres://elif:GizliParola42@localhost:5432/beyin', 'baglanti_parolasi', 'GizliParola42'],
      ['password=hunter2!', 'parola', 'hunter2'],
      ['Şifre: Elif1990', 'parola', 'Elif1990'],
      ['api_key = "abcd1234efgh"', 'parola', 'abcd1234'],
      ['kart 4111 1111 1111 1111 ile ödendi', 'kart', '4111'],
      ['kart 5500-0000-0000-0004', 'kart', '5500'],
      ['IBAN: TR33 0006 1005 1978 6457 8413 26', 'iban', '0006'],
      ['iban TR330006100519786457841326 son', 'iban', '8413'],
    ];
    for (const [girdi, tur, iz] of ornekler) {
      const { metin, bulgular } = gizle(girdi);
      assert.ok(bulgular.includes(tur), `${girdi} -> ${bulgular}`);
      assert.ok(metin.includes(`[GİZLENDİ:${tur}]`), metin);
      assert.ok(!metin.includes(iz), `${girdi} -> ${metin}`);
    }
  });

  test('bağlantı dizesinde kullanıcı adı ve anahtar kelime korunur', () => {
    assert.equal(gizle('postgres://elif:GizliParola42@db').metin, 'postgres://elif:[GİZLENDİ:baglanti_parolasi]@db');
    assert.equal(gizle('password=hunter2!').metin, 'password=[GİZLENDİ:parola]');
  });

  test('sıradan Türkçe metin, tarih ve kısa sayılarda yanlış pozitif yok', () => {
    const temiz = [
      'Elif, serbest illüstratör; 2026-10-17 tarihinde müşteriyle görüştü.',
      'Telefon: 0532 123 45 67, saat 14:30.',
      'Fatura no 1234 5678 9012 3456 (Luhn geçmez).',
      'Token: 500 kullanıldı.',
      'Şifre sıfırlama bağlantısı gönderildi.',
      'parola: yok',
      'Şifre: unuttum',
      'Poster 1500 TL, kartvizit 750 TL. Toplam 2250 TL.',
      'Proje kodu TR-2026 ve sürüm 1.0.0.',
      'https://ornek.com/yol?x=1 ve user@example.com',
      'Risk değerlendirmesi: skor 4/5.',
      'Taslak 3 gün sürer; teslim 2026-11-01.',
    ];
    for (const metin of temiz) {
      const sonuc = gizle(metin);
      assert.deepEqual(sonuc, { metin, bulgular: [] }, metin);
    }
  });

  test('zaten gizlenmiş değer yeniden işlenmez; tekrarlanan tür bir kez raporlanır', () => {
    const ilk = gizle('token: ghp_abcdefghijklmnopqrstuvwxyz0123456789 ve ghp_zyxwvutsrqponmlkjihgfedcba9876543210');
    assert.deepEqual(ilk.bulgular, ['github_token']);
    assert.equal(ilk.metin, 'token: [GİZLENDİ:github_token] ve [GİZLENDİ:github_token]');
    assert.deepEqual(gizle(ilk.metin), { metin: ilk.metin, bulgular: [] });
  });

  test('metin olmayan girdi fırlatmaz', () => {
    assert.deepEqual(gizle(undefined), { metin: '', bulgular: [] });
    assert.deepEqual(gizle(null), { metin: '', bulgular: [] });
    assert.deepEqual(gizle(42), { metin: '42', bulgular: [] });
  });

  test('ortam değişkeni biçimli anahtarlar gizlenir, ad korunur', () => {
    const ornekler = [
      ['AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', 'AWS_SECRET_ACCESS_KEY=', 'wJalr'],
      ['DB_PASSWORD=Hunter2xyz!', 'DB_PASSWORD=', 'Hunter2'],
      ['export OPENAI_API_KEY="abcd1234efgh5678"', 'export OPENAI_API_KEY="', 'abcd1234'],
      ['GITHUB_TOKEN: abc123def456ghi', 'GITHUB_TOKEN: ', 'abc123'],
      ['APP_CLIENT_SECRET=s3cr3t-value-99', 'APP_CLIENT_SECRET=', 's3cr3t'],
      ['TLS_PRIVATE_KEY=base64+deger/abc==', 'TLS_PRIVATE_KEY=', 'base64'],
      ['{"password": "Hunter2xyz!"}', '{"password": "', 'Hunter2'],
      ['DB_PWD=abc12345', 'DB_PWD=', 'abc12345'],
      ['db-pass=abc12345', 'db-pass=', 'abc12345'],
      ['VERITABANI_ŞİFRE=Elif1990x', 'VERITABANI_ŞİFRE=', 'Elif1990'],
    ];
    for (const [girdi, onek, iz] of ornekler) {
      const { metin, bulgular } = gizle(girdi);
      assert.ok(bulgular.includes('parola'), `${girdi} -> ${bulgular}`);
      assert.ok(metin.startsWith(onek), metin);
      assert.ok(metin.includes('[GİZLENDİ:parola]'), metin);
      assert.ok(!metin.includes(iz), `${girdi} -> ${metin}`);
    }
  });

  test('servis token biçimleri gizlenir', () => {
    const ornekler = [
      ['sk_live_' + 'a1B2c3D4e5F6g7H8i9J0', 'api_anahtari', 'sk_live_'],
      ['sk_test_' + 'a1B2c3D4e5F6g7H8i9J0', 'api_anahtari', 'sk_test_'],
      ['rk_live_' + 'a1B2c3D4e5F6g7H8i9J0', 'api_anahtari', 'rk_live_'],
      ['hf_' + 'abcdefghijklmnopqrstuvwxyzABCDEFGH', 'api_anahtari', 'hf_'],
      ['glpat-' + 'abcdefghij0123456789', 'gitlab_token', 'glpat-'],
      ['npm_' + 'abcdefghijklmnopqrstuvwxyz0123456789', 'npm_token', 'npm_abc'],
      ['xoxp-' + '1234567890-abcdefghij', 'slack_token', 'xoxp-'],
      ['gho_' + 'abcdefghijklmnopqrstuvwxyz0123456789', 'github_token', 'gho_'],
      ['ghs_' + 'abcdefghijklmnopqrstuvwxyz0123456789', 'github_token', 'ghs_'],
      ['AIza' + 'SyA-abcdefghijklmnopqrstuvwxyz012345', 'google_anahtari', 'AIza'],
      ['ya29.' + 'a0AfH6SMBx-abcdefghijklmnop', 'google_anahtari', 'ya29.'],
      ['Authorization: Bearer abc.def', 'bearer_token', 'abc.def'],
      ['curl -H "Authorization: Bearer abcdefghijklmnop1234567890"', 'bearer_token', 'abcdefghij'],
      ['yanıt başlığı Bearer abcdefghijklmnop1234567890 geldi', 'bearer_token', 'abcdefghij'],
    ];
    for (const [girdi, tur, iz] of ornekler) {
      const { metin, bulgular } = gizle(girdi);
      assert.ok(bulgular.includes(tur), `${girdi} -> ${bulgular}`);
      assert.ok(!metin.includes(iz), `${girdi} -> ${metin}`);
    }
  });

  test('bağlantı dizesinde boş kullanıcı adı ve kullanıcılı biçim', () => {
    assert.equal(gizle('redis://:SuperSecret99@host:6379').metin, 'redis://:[GİZLENDİ:baglanti_parolasi]@host:6379');
    assert.equal(gizle('amqp://user:pass1234@mq').metin, 'amqp://user:[GİZLENDİ:baglanti_parolasi]@mq');
    const bir = gizle('redis://:SuperSecret99@host');
    assert.deepEqual(gizle(bir.metin), { metin: bir.metin, bulgular: [] });
  });

  test('TR dışı IBAN gizlenir, 12 rakamdan azı ve sıradan büyük harfli kodlar kalır', () => {
    for (const girdi of ['IBAN DE89 3704 0044 0532 0130 00 yatır', 'GB29NWBK60161331926819', 'FR76 3000 6000 0112 3456 7890 189']) {
      const { metin, bulgular } = gizle(girdi);
      assert.deepEqual(bulgular, ['iban'], girdi);
      assert.ok(!/\d{4}/u.test(metin), metin);
    }
    assert.equal(gizle('DE89 3704 0044 0532 0130 00 yatır').metin, '[GİZLENDİ:iban] yatır');
    for (const temiz of ['Kod AB12 CDEF GHIJ', 'ISO27001 ve SO42 ABCD EFGH', 'HTTP2 ABCD EFGH IJKL']) {
      assert.deepEqual(gizle(temiz), { metin: temiz, bulgular: [] }, temiz);
    }
  });

  test('PEM özel anahtar bloğu tümüyle gizlenir', () => {
    const { metin, bulgular } = gizle('önce\n-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\nkqhkiG9w0BAQEF\n-----END PRIVATE KEY-----\nsonra');
    assert.deepEqual(bulgular, ['ozel_anahtar']);
    assert.equal(metin, 'önce\n[GİZLENDİ:ozel_anahtar]\nsonra');
  });

  test('normal paragraf bayt bayt aynı kalır', () => {
    const paragraf = [
      'Elif ile 2026-10-17 günü toplantı yaptık; 14:30’da başladı ve 16:00’da bitti.',
      'Dosya: C:\Users\elif\Belgeler\sunum.pptx ve notlar/proje-plani.md güncellendi.',
      'Son commit 96b1cd6b0f3a9c1d2e4f5a6b7c8d9e0f1a2b3c4d, kimlik 123e4567-e89b-12d3-a456-426614174000.',
      'Şifre sıfırlama e-postası gitti; parola politikası: en az on iki karakter olmalı.',
      'Token limiti 4096, pass sayısı 3, secret sauce tarifi: tuz, biber.',
      'Adres https://ornek.com:8080/yol?x=1#bolum, mail elif@ornek.com, sürüm v1.2.3.',
      'Fatura 1234 5678 9012 3456; toplam 2250 TL, IBAN yerine havale kodu TR-2026 kullan.',
      'Authorization başlığı ve Bearer şeması üzerine kısa bir not yazdım.',
    ].join('\n');
    assert.deepEqual(gizle(paragraf), { metin: paragraf, bulgular: [] });
  });
});
