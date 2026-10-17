// Modelsiz sır süzgeci: yakalanan metindeki anahtar, token, parola, kart ve IBAN'ı gizler.
// Kaza önleyicidir; her sızıntıyı yakalamayı garanti etmez.

const GIZLI = tur => `[GİZLENDİ:${tur}]`;
const SINIR = '(?<![A-Za-z0-9_-])';

function luhn(rakamlar) {
  let toplam = 0;
  let cift = false;
  for (let i = rakamlar.length - 1; i >= 0; i -= 1) {
    let d = rakamlar.charCodeAt(i) - 48;
    if (cift) { d *= 2; if (d > 9) d -= 9; }
    toplam += d;
    cift = !cift;
  }
  return toplam % 10 === 0;
}

// Anahtar kelimeli değer gerçek bir sır gibi mi görünüyor? (düz Türkçe cümleyi gizlememek için)
function sirGibi(deger) {
  if (deger.length < 6) return false;
  if (/[0-9]/u.test(deger) || /[^\p{L}]/u.test(deger)) return true;
  return deger.length >= 12;
}

// Sıra önemli: özel kalıplar önce, genel anahtar=değer en son.
const KALIPLAR = [
  ['ozel_anahtar', /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/gu],
  ['api_anahtari', new RegExp(`${SINIR}sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}`, 'gu')],
  ['api_anahtari', new RegExp(`${SINIR}(?:[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{24,}|hf_[A-Za-z0-9]{30,})`, 'gu')],
  ['gitlab_token', new RegExp(`${SINIR}glpat-[A-Za-z0-9_-]{20,}`, 'gu')],
  ['npm_token', new RegExp(`${SINIR}npm_[A-Za-z0-9]{36}(?![A-Za-z0-9])`, 'gu')],
  ['github_token', new RegExp(`${SINIR}(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})`, 'gu')],
  ['slack_token', new RegExp(`${SINIR}xox[abposr]-[A-Za-z0-9-]{10,}`, 'gu')],
  ['aws_anahtari', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/gu],
  ['google_anahtari', new RegExp(`${SINIR}AIza[0-9A-Za-z_-]{35,}`, 'gu')],
  ['google_anahtari', new RegExp(`${SINIR}ya29\\.[A-Za-z0-9_-]{20,}`, 'gu')],
  ['jwt', new RegExp(`${SINIR}eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}`, 'gu')],
  // "Authorization: Bearer x" için kısa değer de gizlenir; çıplak Bearer için en az 16 karakter.
  ['bearer_token', /(?:(?<=Authorization\s{0,3}[:=]\s{0,3})Bearer\s+[A-Za-z0-9._~+/=-]{6,}|\bBearer\s+[A-Za-z0-9._~+/=-]{16,})/giu],
];

const URL_PAROLA = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]*):(?!\[GİZLENDİ)([^\s@/]+)@/giu;
const IBAN = /(?<![A-Za-z0-9])TR\s?(?:\d\s?){23}\d(?!\d)/giu;
// Diğer ülkeler: ülke kodu (büyük harf) + 2 kontrol hanesi + 4'lü gruplar; toplam en az 12 rakam.
const IBAN_GENEL = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?(?![A-Za-z0-9])/gu;
const KART = /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/gu;
// Ortam değişkeni önekleri (DB_PASSWORD, AWS_SECRET_ACCESS_KEY, OPENAI_API_KEY) ve tırnaklı JSON anahtarı kabul edilir.
const ANAHTAR_DEGER = /(?<![\p{L}\p{N}_])((?:[A-Za-z0-9]+[_-])*(?:password|passwd|pass|pwd|parola(?:m|n|sı)?|ş[iİ]fre(?:m|n|si|miz)?|sifre(?:m|n|si)?|token|secret|client[_-]?secret|api[_-]?key|apikey|access[_-]?key|private[_-]?key))(["']?\s*[:=]\s*)(["']?)(?!\[GİZLENDİ)([^\s"',;]+)/giu;

export function sirlariGizle(metin) {
  let text = typeof metin === 'string' ? metin : String(metin ?? '');
  const bulgular = [];
  const bul = tur => { if (!bulgular.includes(tur)) bulgular.push(tur); };

  for (const [tur, kalip] of KALIPLAR) {
    text = text.replace(kalip, () => { bul(tur); return GIZLI(tur); });
  }
  text = text.replace(URL_PAROLA, (_, sema, kullanici) => {
    bul('baglanti_parolasi');
    return `${sema}${kullanici}:${GIZLI('baglanti_parolasi')}@`;
  });
  text = text.replace(IBAN, () => { bul('iban'); return GIZLI('iban'); });
  text = text.replace(IBAN_GENEL, eslesme => {
    if ((eslesme.match(/\d/gu) ?? []).length < 12) return eslesme;
    bul('iban');
    return GIZLI('iban');
  });
  text = text.replace(KART, eslesme => {
    const rakamlar = eslesme.replace(/[ -]/gu, '');
    if (rakamlar.length < 13 || rakamlar.length > 19 || /^(\d)\1+$/u.test(rakamlar) || !luhn(rakamlar)) return eslesme;
    bul('kart');
    return GIZLI('kart');
  });
  text = text.replace(ANAHTAR_DEGER, (tam, anahtar, ayrac, tirnak, deger) => {
    if (!sirGibi(deger)) return tam;
    bul('parola');
    return `${anahtar}${ayrac}${tirnak}${GIZLI('parola')}`;
  });
  return { metin: text, bulgular };
}
