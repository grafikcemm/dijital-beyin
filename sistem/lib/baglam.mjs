// Oturum başı bağlamı: modele dönük (İngilizce başlıklar); not gövdeleri tamamlanmış HTML
// yorumları (<!-- … -->) çıkarılarak, gerisi olduğu gibi.
// Modelsiz ve deterministik; asla fırlatmaz.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { frontmatterAyir, gecersizMi, notTarihi } from './notlar.mjs';
import { tercihleriOku, VARSAYILAN_TERCIHLER } from './tercihler.mjs';
import { hataKaydet, yerelTarih, yollar } from './yol.mjs';

const MUTLAK_SINIR = 9500;
const KARAR_SINIR = 15;
const ELENEN_SINIR = 5;
// "Elediklerim" gibi başlıkların altındaki maddeler karar değil, vazgeçilen seçeneklerdir.
const ELENEN_BASLIK = /eled|elen|vazge[cç]|reddet|rejected|ruled out/iu;
const OTURUM_SINIR = 3;
const KESIK = '\n[… truncated to fit the context budget]';

// Çekirdek notlar, gösterim sırasıyla. Her yuva var olan ilk dosyayı alır: önce 2.x adı,
// sonra 1.x adı (1.x kasaları kendi adlarını korur). `anahtar` bayatlık sınırının tercihteki
// adıdır; anahtarı olmayan yuva bayatlık denetimine girmez.
const CEKIRDEK = [
  { adlar: ['02-Guncel-Durum', 'guncel-durum'], anahtar: 'guncel_durum', baslik: 'Current status' },
  { adlar: ['aktif-projem'], anahtar: 'aktif_projem', baslik: 'Active project' },
  { adlar: ['01-Kimlik', 'ben-kimim'], anahtar: 'ben_kimim', baslik: 'Who the user is' },
  { adlar: ['04-Tuzaklar'], baslik: 'Traps to avoid' },
  { adlar: ['05-Calisma-Tarzim'], baslik: 'How the user likes to work' },
];
const KARAR_ADLARI = ['03-Kararlar', 'verdigim-kararlar'];
const KIMLIK_ADLARI = ['01-Kimlik', 'ben-kimim'];
// Bu adlardan biri varsa kasa 1.x düzenindedir (eksik dosya için 1.x adı önerilir).
const V1_ADLARI = ['ben-kimim', 'guncel-durum', 'aktif-projem', 'verdigim-kararlar'];

function dosyaVar(kok, ad) {
  try { return existsSync(join(yollar(kok).beynim, `${ad}.md`)); } catch { return false; }
}

// Adaylardan var olan ilki; hiçbiri yoksa kasa 1.x düzenindeyse 1.x adı, değilse 2.x adı.
function dosyaAdiSec(kok, adlar) {
  const bulunan = adlar.find(ad => dosyaVar(kok, ad));
  if (bulunan) return bulunan;
  return V1_ADLARI.some(ad => dosyaVar(kok, ad)) ? adlar.at(-1) : adlar[0];
}

function kurallar(simdi, kok) {
  const kararDosyasi = `beynim/${dosyaAdiSec(kok, KARAR_ADLARI)}.md`;
  return [
    "# Digital brain (the user's own notes)",
    '',
    `Today is ${yerelTarih(simdi)}. The sections below are quoted from the user's digital brain in this folder. Rules:`,
    '- When notes disagree, follow the note with the newer date and tell the user which line is out of date; ask whether to update it.',
    '- A note that lists another note in its `supersedes` field overrides that note.',
    '- Never invent facts that are not in these notes; say what is missing instead.',
    '- If notes contradict each other or what the user says, ask the user before acting.',
    "- Reply in the user's language.",
    '- To search the brain, run: node beyin.mjs ara "<query>"',
    `- When the session produces a new decision, propose it to the user at the end; append it only after they agree, as a dated line (\`- YYYY-MM-DD — decision — reason\`) to ${kararDosyasi}. Never delete or rewrite old lines; when a decision is replaced, add \` GEÇERSİZ (YYYY-MM-DD)\` to the end of the old line.`,
  ].join('\n');
}

function gunFarki(simdi, tarih) {
  const a = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
  const b = new Date(tarih.getFullYear(), tarih.getMonth(), tarih.getDate());
  return Math.round((a - b) / 86_400_000);
}

const YORUM = /<!--[\s\S]*?-->/gu;

// Tamamlanmış <!-- … --> yorumlarını çıkarır (şablonlardaki yönlendirme insan içindir).
// Kapanmamış `<!--` olduğu gibi kalır. Satırın tamamı yorumsa satır da gider; yorumun iki
// yanında boş satır kalırsa biri silinir. Yorum dışındaki metin değişmez.
export function yorumlariSil(metin) {
  if (!metin.includes('<!--')) return metin;
  let out = '';
  let son = 0;
  for (const m of metin.matchAll(YORUM)) {
    const bas = m.index;
    const bit = bas + m[0].length;
    const satirBasi = metin.lastIndexOf('\n', bas - 1) + 1;
    let satirSonu = metin.indexOf('\n', bit);
    if (satirSonu < 0) satirSonu = metin.length;
    const tamSatir = satirBasi >= son && !metin.slice(satirBasi, bas).trim() && !metin.slice(bit, satirSonu).trim();
    if (!tamSatir) {
      out += metin.slice(son, bas);
      son = bit;
      continue;
    }
    out += metin.slice(son, satirBasi);
    son = Math.min(satirSonu + 1, metin.length);
    const sonraki = metin.indexOf('\n', son);
    if (sonraki >= 0 && !metin.slice(son, sonraki).trim() && (out === '' || /(?:^|\n)[ \t]*\n$/u.test(out))) son = sonraki + 1;
  }
  return out + metin.slice(son);
}

function notOku(dosya) {
  try {
    const ham = readFileSync(dosya, 'utf8');
    const { veri, govde } = frontmatterAyir(ham);
    const fmTarih = notTarihi(veri);
    return { veri, govde: yorumlariSil(govde).trim(), fmTarih, tarih: fmTarih ?? statSync(dosya).mtime };
  } catch {
    return null;
  }
}

function gecerliTarih(simdi) {
  return simdi instanceof Date && !Number.isNaN(simdi.getTime()) ? simdi : new Date();
}

export function bayatNotlar(kok, simdi) {
  const an = gecerliTarih(simdi);
  const sonuc = [];
  let sinirlar = VARSAYILAN_TERCIHLER.bayat_gun;
  try { sinirlar = tercihleriOku(kok).bayat_gun; } catch { /* varsayılan */ }
  for (const { adlar, anahtar } of CEKIRDEK) {
    if (!anahtar) continue;
    let ad = null;
    let not = null;
    for (const aday of adlar) {
      not = notOku(join(yollar(kok).beynim, `${aday}.md`));
      if (not) { ad = aday; break; }
    }
    if (!not) continue;
    const gun = gunFarki(an, not.tarih);
    const sinir = sinirlar[anahtar];
    if (gun > sinir) sonuc.push({ dosya: `beynim/${ad}.md`, gun, sinir });
  }
  return sonuc;
}

function adNormalle(ham) {
  const text = String(ham ?? '').trim().replace(/\\/gu, '/').replace(/^\.\//u, '');
  const son = text.split('/').filter(Boolean).at(-1) ?? '';
  return son.replace(/\.md$/iu, '').toLowerCase();
}

function supersedesListesi(veri) {
  const ham = veri?.supersedes;
  const liste = Array.isArray(ham) ? ham : typeof ham === 'string' ? ham.split(',') : [];
  return liste.map(adNormalle).filter(Boolean);
}

// beynim/*.md: supersedes zinciri. Yeni tarihli not önce işlenir; düşen not başkasını düşüremez.
function beynimNotlari(kok) {
  const dir = yollar(kok).beynim;
  let adlar = [];
  try { adlar = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.md')).sort(); } catch { return new Map(); }
  const notlar = new Map();
  for (const dosyaAdi of adlar) {
    const not = notOku(join(dir, dosyaAdi));
    if (!not) continue;
    const ad = dosyaAdi.replace(/\.md$/iu, '').toLowerCase();
    notlar.set(ad, { ...not, ad, rel: `beynim/${dosyaAdi}`, supersedes: supersedesListesi(not.veri) });
  }
  const sirali = [...notlar.values()].sort((a, b) => (b.tarih - a.tarih) || a.ad.localeCompare(b.ad));
  for (const not of sirali) {
    if (not.dusuren) continue;
    for (const hedef of not.supersedes) {
      const eski = notlar.get(hedef);
      if (eski && hedef !== not.ad && !eski.dusuren) eski.dusuren = not;
    }
  }
  return notlar;
}

function tarihEtiketi(not) {
  return not.fmTarih ? `dated ${yerelTarih(not.fmTarih)}` : `undated, file modified ${yerelTarih(not.tarih)}`;
}

function notBolumu(baslik, not, yerine) {
  const ek = yerine ? `; supersedes ${yerine}` : '';
  const ust = `## ${baslik} — ${not.rel} (${tarihEtiketi(not)}${ek})`;
  return { ust, metin: `${ust}\n${not.govde}`, dosyalar: [not.rel] };
}

function kararBolumu(kok) {
  const ad = KARAR_ADLARI.find(aday => dosyaVar(kok, aday));
  if (!ad) return null;
  const dosya = join(yollar(kok).beynim, `${ad}.md`);
  let govde;
  // Yorum içindeki "- tarih — karar" ya da "## Elediklerim" satırı karar ve bölüm sayılmasın.
  try { govde = yorumlariSil(frontmatterAyir(readFileSync(dosya, 'utf8')).govde); } catch { return null; }
  const aktif = [];
  const elenen = [];
  let elenenBolum = false;
  for (const satir of govde.replace(/\r/gu, '').split('\n').map(s => s.trimEnd())) {
    const baslik = /^#{2,6}\s+(.+)$/u.exec(satir);
    if (baslik) { elenenBolum = ELENEN_BASLIK.test(baslik[1]); continue; }
    if (!satir.startsWith('- ') || gecersizMi(satir)) continue;
    (elenenBolum ? elenen : aktif).push(satir);
  }
  if (!aktif.length && !elenen.length) return null;
  const son = aktif.slice(-KARAR_SINIR);
  const ust = `## Active decisions — beynim/${ad}.md (latest ${son.length} of ${aktif.length}, oldest first)`;
  const parcalar = [ust, ...son];
  if (elenen.length) {
    const sonElenen = elenen.slice(-ELENEN_SINIR);
    parcalar.push('', `### Ruled out — options the user considered and rejected; never treat these as decisions (latest ${sonElenen.length} of ${elenen.length})`, ...sonElenen);
  }
  return { ust, metin: parcalar.join('\n'), dosyalar: [] };
}

function oturumBolumu(kok, simdi) {
  const gunluk = yollar(kok).gunluk;
  const dun = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate() - 1);
  const bloklar = [];
  for (const tarih of [yerelTarih(dun), yerelTarih(simdi)]) {
    let text;
    try { text = readFileSync(join(gunluk, `${tarih}.md`), 'utf8').replace(/\r\n?/gu, '\n'); } catch { continue; }
    for (const m of text.matchAll(/<!-- oturum:([A-Za-z0-9._-]{1,128}) -->\n([\s\S]*?)<!-- \/oturum:\1 -->/gu)) {
      const satirlar = m[2].split('\n');
      const baslik = satirlar.find(s => s.startsWith('### '));
      const ozet = satirlar.filter(s => s.startsWith('- **İstek:**') || s.startsWith('- **Sonuç:**'));
      if (!ozet.length) continue;
      const etiket = baslik ? baslik.slice(4).trim() : m[1].slice(0, 8);
      bloklar.push([`### ${tarih} ${etiket}`, ...ozet].join('\n'));
    }
  }
  if (!bloklar.length) return null;
  const ust = '## Recent sessions — gunluk/ (model-free summaries, oldest first)';
  return { ust, metin: `${ust}\n${bloklar.slice(-OTURUM_SINIR).join('\n')}`, dosyalar: [] };
}

function uyariMetni(uyarilar) {
  if (!uyarilar.length) return '';
  const satirlar = uyarilar.map(u => `- ${u.dosya} is ${u.gun} days old (limit ${u.sinir}) — confirm with the user before relying on it.`);
  return `## Staleness warnings\n${satirlar.join('\n')}`;
}

// Aynı yuvada hem 2.x hem 1.x adı varsa yalnız 2.x adı okunur; kullanıcının 1.x dosyası
// sessizce bağlamdan düşmesin diye her çakışma için bir satır (bütçede kesilmez).
function catismaMetni(catismalar) {
  if (!catismalar.length) return '';
  const satirlar = catismalar.map(c => `- ${c.okunan} and ${c.gizli} both exist; only ${c.okunan} is shown here and ${c.gizli} is ignored. Tell the user; only the user can delete or rename a file in beynim/. With their approval you may copy content from one file into the other.`);
  return `## File name conflicts\n${satirlar.join('\n')}`;
}

function birlestir(parcalar) {
  return parcalar.filter(Boolean).join('\n\n');
}

export function baglamOlustur(kok, { simdi, butce } = {}) {
  const an = gecerliTarih(simdi);
  const kural = kurallar(an, kok);
  try {
    const tercihler = tercihleriOku(kok);
    const istenen = Number.isFinite(butce) && butce > 0 ? Math.floor(butce) : tercihler.baglam_karakter;

    const notlar = beynimNotlari(kok);
    const bolumler = [];
    const gosterilen = new Set();
    const zirve = not => { let n = not; for (let i = 0; n?.dusuren && i < 50; i += 1) n = n.dusuren; return n; };
    const catismalar = [];
    for (const { adlar, baslik } of CEKIRDEK) {
      const bulunanlar = adlar.map(a => a.toLowerCase()).filter(a => notlar.has(a));
      const ad = bulunanlar[0];
      const not = ad ? notlar.get(ad) : null;
      if (!not) continue;
      for (const gizli of bulunanlar.slice(1)) catismalar.push({ okunan: not.rel, gizli: notlar.get(gizli).rel });
      const gercek = zirve(not);
      if (!gercek || gosterilen.has(gercek.ad) || !gercek.govde) continue;
      gosterilen.add(gercek.ad);
      bolumler.push(notBolumu(baslik, gercek, gercek === not ? null : not.rel));
    }
    const kararlar = KARAR_ADLARI.filter(aday => dosyaVar(kok, aday));
    for (const gizli of kararlar.slice(1)) catismalar.push({ okunan: `beynim/${kararlar[0]}.md`, gizli: `beynim/${gizli}.md` });
    const catismaYazisi = catismaMetni(catismalar);
    const kararAdlari = new Set(KARAR_ADLARI.map(a => a.toLowerCase()));
    for (const not of [...notlar.values()].sort((a, b) => a.ad.localeCompare(b.ad))) {
      if (not.dusuren || !not.supersedes.length || gosterilen.has(not.ad) || kararAdlari.has(not.ad) || !not.govde) continue;
      gosterilen.add(not.ad);
      const yerine = not.supersedes.map(h => notlar.get(h)?.rel ?? `${h}.md`).join(', ');
      bolumler.push(notBolumu('Note that overrides older notes', not, yerine));
    }
    const karar = kararBolumu(kok);
    if (karar) bolumler.push(karar);
    const oturum = oturumBolumu(kok, an);
    if (oturum) bolumler.push(oturum);

    // Bayatlık uyarısı yalnız bağlamda gösterilen not için.
    const tumUyarilar = bayatNotlar(kok, an);
    const uyarilar = parcalar => {
      const gorunen = new Set(parcalar.flatMap(p => p.dosyalar));
      return uyariMetni(tumUyarilar.filter(u => gorunen.has(u.dosya)));
    };
    const metinYap = parcalar => birlestir([kural, ...parcalar.map(p => p.metin), uyarilar(parcalar), catismaYazisi]);

    if (!bolumler.length) {
      const kimlik = dosyaAdiSec(kok, KIMLIK_ADLARI);
      return birlestir([kural, `No brain notes were found yet. Suggest that the user fills in beynim/${kimlik}.md.`, catismaYazisi]);
    }

    // Kural bloğu ve uyarılar kesilmez; en düşük öncelikli bölümden başlayarak kısaltılır.
    const sinir = Math.min(MUTLAK_SINIR, istenen);
    const parcalar = bolumler.slice();
    for (let i = parcalar.length - 1; i >= 0; i -= 1) {
      const toplam = metinYap(parcalar).length;
      if (toplam <= sinir) break;
      const fazla = toplam - sinir;
      const bolum = parcalar[i];
      const hedef = bolum.metin.length - fazla - KESIK.length;
      if (hedef >= bolum.ust.length + 120) {
        let kesik = bolum.metin.slice(0, hedef);
        const son = kesik.charCodeAt(kesik.length - 1);
        if (son >= 0xd800 && son <= 0xdbff) kesik = kesik.slice(0, -1);
        parcalar[i] = { ...bolum, metin: `${kesik.trimEnd()}${KESIK}` };
      } else {
        parcalar.splice(i, 1);
      }
    }
    const sonuc = metinYap(parcalar);
    return sonuc.length <= MUTLAK_SINIR ? sonuc : sonuc.slice(0, MUTLAK_SINIR);
  } catch (error) {
    hataKaydet(kok, 'baglam', error);
    return kural;
  }
}
