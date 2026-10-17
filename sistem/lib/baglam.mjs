// Oturum başı bağlamı: modele dönük (İngilizce başlıklar), not gövdeleri olduğu gibi.
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

// Bayatlık denetlenen çekirdek notlar, öncelik sırasıyla.
const CEKIRDEK = [
  { ad: 'guncel-durum', anahtar: 'guncel_durum', baslik: 'Current status' },
  { ad: 'aktif-projem', anahtar: 'aktif_projem', baslik: 'Active project' },
  { ad: 'ben-kimim', anahtar: 'ben_kimim', baslik: 'Who the user is' },
];
const KARARLAR = 'verdigim-kararlar';

function kurallar(simdi) {
  return [
    "# Digital brain (the user's own notes)",
    '',
    `Today is ${yerelTarih(simdi)}. The sections below are quoted from the user's digital brain in this folder. Rules:`,
    '- When notes disagree, the note with the newer date wins.',
    '- A note that lists another note in its `supersedes` field overrides that note.',
    '- Never invent facts that are not in these notes; say what is missing instead.',
    '- If notes contradict each other or what the user says, ask the user before acting.',
    "- Reply in the user's language.",
    '- To search the brain, run: node beyin.mjs ara "<query>"',
    '- To record a decision, append a dated line (`- YYYY-MM-DD — decision — reason`) to beynim/verdigim-kararlar.md. When a decision is replaced, add ` GEÇERSİZ (YYYY-MM-DD)` to the end of the old line. Never delete or rewrite old lines.',
  ].join('\n');
}

function gunFarki(simdi, tarih) {
  const a = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
  const b = new Date(tarih.getFullYear(), tarih.getMonth(), tarih.getDate());
  return Math.round((a - b) / 86_400_000);
}

function notOku(dosya) {
  try {
    const ham = readFileSync(dosya, 'utf8');
    const { veri, govde } = frontmatterAyir(ham);
    const fmTarih = notTarihi(veri);
    return { veri, govde: govde.trim(), fmTarih, tarih: fmTarih ?? statSync(dosya).mtime };
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
  for (const { ad, anahtar } of CEKIRDEK) {
    const not = notOku(join(yollar(kok).beynim, `${ad}.md`));
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
  const dosya = join(yollar(kok).beynim, `${KARARLAR}.md`);
  if (!existsSync(dosya)) return null;
  let govde;
  try { govde = frontmatterAyir(readFileSync(dosya, 'utf8')).govde; } catch { return null; }
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
  const ust = `## Active decisions — beynim/${KARARLAR}.md (latest ${son.length} of ${aktif.length}, oldest first)`;
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

function birlestir(parcalar) {
  return parcalar.filter(Boolean).join('\n\n');
}

export function baglamOlustur(kok, { simdi, butce } = {}) {
  const an = gecerliTarih(simdi);
  const kural = kurallar(an);
  try {
    const tercihler = tercihleriOku(kok);
    const istenen = Number.isFinite(butce) && butce > 0 ? Math.floor(butce) : tercihler.baglam_karakter;

    const notlar = beynimNotlari(kok);
    const bolumler = [];
    const gosterilen = new Set();
    const zirve = not => { let n = not; for (let i = 0; n?.dusuren && i < 50; i += 1) n = n.dusuren; return n; };
    for (const { ad, baslik } of CEKIRDEK) {
      const not = notlar.get(ad);
      if (!not) continue;
      const gercek = zirve(not);
      if (!gercek || gosterilen.has(gercek.ad) || !gercek.govde) continue;
      gosterilen.add(gercek.ad);
      bolumler.push(notBolumu(baslik, gercek, gercek === not ? null : not.rel));
    }
    for (const not of [...notlar.values()].sort((a, b) => a.ad.localeCompare(b.ad))) {
      if (not.dusuren || !not.supersedes.length || gosterilen.has(not.ad) || not.ad === KARARLAR || !not.govde) continue;
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
    const metinYap = parcalar => birlestir([kural, ...parcalar.map(p => p.metin), uyarilar(parcalar)]);

    if (!bolumler.length) {
      return birlestir([kural, 'No brain notes were found yet. Suggest that the user fills in beynim/ben-kimim.md.']);
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
