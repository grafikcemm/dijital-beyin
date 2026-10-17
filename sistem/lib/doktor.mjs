// Sağlık denetimi: her katmanın durumunu sade Türkçe ile gösterir, asla fırlatmaz.
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { guvenliYol, jsonOku, sha256, yollar, yonetilenYolMu } from './yol.mjs';
import { surumKarsilastir } from './guncelle.mjs';

const GUN_MS = 24 * 60 * 60 * 1000;
const BAYAT_KILIT_MS = 10 * 60 * 1000;
const YAKALAMA_UYARI_GUN = 7;
const LOG_OKUMA_BAYT = 256 * 1024;
const BLOK_BASLA = '<!-- dijital-beyin:basla -->';
const BLOK_BITIR = '<!-- dijital-beyin:bitir -->';

async function varsayilanManifestOku(kok) {
  try {
    const { manifestOku } = await import('./kurulum.mjs');
    return manifestOku(kok);
  } catch {
    return jsonOku(yollar(kok).kurulum, null);
  }
}

async function varsayilanKancaDurumu(kok) {
  const { kancaDurumu } = await import('./kurulum.mjs');
  return kancaDurumu(kok);
}

async function varsayilanBayatNotlar(kok, simdi) {
  const { bayatNotlar } = await import('./baglam.mjs');
  return bayatNotlar(kok, simdi);
}

function istemcileriAl(manifest) {
  return Array.isArray(manifest?.istemciler) ? manifest.istemciler : ['claude'];
}

function nodeKontrol(surum) {
  const ana = Number(String(surum).split('.')[0]);
  if (ana >= 20) return [{ ad: 'node', durum: 'tamam', mesaj: `Node.js ${surum} kurulu.` }];
  return [{ ad: 'node', durum: 'hata', mesaj: `Node.js ${surum} eski; Dijital Beyin 20 veya üstünü ister.` }];
}

function duzenKontrol(kok) {
  const eksik = ['beynim', 'gunluk', 'sistem'].filter(ad => {
    try { return !statSync(join(kok, ad)).isDirectory(); } catch { return true; }
  });
  if (!eksik.length) return [{ ad: 'kasa_duzeni', durum: 'tamam', mesaj: 'Ana klasörler yerinde.' }];
  // onar yalnız kullanıcı klasörlerini (boş) yeniden oluşturur; sistem/ güncelleme ya da kurulumla gelir.
  const kullanici = eksik.filter(ad => ad !== 'sistem');
  const parcalar = [];
  if (kullanici.length) {
    parcalar.push(`"node beyin.mjs onar" eksik klasörleri boş olarak yeniden oluşturur (${kullanici.join(', ')}); eski içerik kendiliğinden geri gelmez, yedeğinden al.`);
  }
  if (eksik.includes('sistem')) {
    parcalar.push('sistem/ klasörü onar ile oluşmaz: kur.mjs\'i yeniden çalıştır ya da "node beyin.mjs guncelle --zorla --paket <dosya> --sha <dosya>" kullan.');
  }
  return [{
    ad: 'kasa_duzeni',
    durum: 'hata',
    mesaj: `Eksik klasör: ${eksik.join(', ')}. ${parcalar.join(' ')}`,
  }];
}

function manifestKontrol(kok, manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return [{
      ad: 'manifest',
      durum: 'hata',
      mesaj: 'Kurulum kaydı okunamadı. "node beyin.mjs onar" çalıştır.',
    }];
  }
  const dosyalar = manifest.dosyalar && typeof manifest.dosyalar === 'object' ? manifest.dosyalar : {};
  const sonuc = [];
  let sayi = 0;
  for (const [rel, beklenen] of Object.entries(dosyalar)) {
    if (!yonetilenYolMu(rel) || typeof beklenen !== 'string') continue;
    sayi += 1;
    let icerik;
    try {
      icerik = readFileSync(guvenliYol(kok, rel));
    } catch {
      sonuc.push({ ad: 'manifest', durum: 'hata', mesaj: `${rel} eksik. "node beyin.mjs guncelle --zorla" ile geri getirebilirsin.` });
      continue;
    }
    if (sha256(icerik) !== beklenen.toLowerCase()) {
      sonuc.push({ ad: 'manifest', durum: 'uyari', mesaj: `${rel} yerelde değiştirilmiş, güncellemede yedeklenir.` });
    }
  }
  if (sonuc.length > 50) {
    const kalan = sonuc.length - 50;
    sonuc.length = 50;
    sonuc.push({ ad: 'manifest', durum: 'uyari', mesaj: `${kalan} dosyada daha sorun var.` });
  }
  if (!sonuc.length) sonuc.push({ ad: 'manifest', durum: 'tamam', mesaj: `${sayi} sistem dosyası kayıtla aynı.` });
  return sonuc;
}

function surumKontrol(kok, manifest) {
  const dosyaSurumu = jsonOku(join(kok, 'sistem', 'surum.json'), null)?.surum;
  if (typeof dosyaSurumu !== 'string') {
    return [{ ad: 'surum', durum: 'uyari', mesaj: 'Sürüm dosyası okunamadı (sistem/surum.json).' }];
  }
  if (manifest?.surum !== dosyaSurumu) {
    return [{
      ad: 'surum',
      durum: 'uyari',
      mesaj: `Kurulu sürüm (${dosyaSurumu}) kurulum kaydındakiyle (${manifest?.surum ?? 'yok'}) aynı değil. "node beyin.mjs onar" çalıştır.`,
    }];
  }
  return [{ ad: 'surum', durum: 'tamam', mesaj: `Sürüm ${dosyaSurumu}.` }];
}

function kancaKontrol(durum, istemciler) {
  const sonuc = [];
  const eksikMetni = bilgi => (Array.isArray(bilgi?.eksik) && bilgi.eksik.length ? ` (eksik: ${bilgi.eksik.join(', ')})` : '');
  const tamMi = bilgi => Boolean(bilgi?.kurulu) && !(Array.isArray(bilgi?.eksik) && bilgi.eksik.length);
  if (istemciler.includes('claude')) {
    sonuc.push(tamMi(durum?.claude)
      ? { ad: 'kanca_claude', durum: 'tamam', mesaj: 'Claude Code kancaları kurulu.' }
      : { ad: 'kanca_claude', durum: 'hata', mesaj: `Claude Code kancaları eksik${eksikMetni(durum?.claude)}. "node beyin.mjs onar" çalıştır.` });
  }
  if (istemciler.includes('codex')) {
    sonuc.push(tamMi(durum?.codex)
      ? { ad: 'kanca_codex', durum: 'tamam', mesaj: 'Codex kancaları kurulu.' }
      : {
        ad: 'kanca_codex',
        durum: 'uyari',
        mesaj: `Codex kancaları eksik${eksikMetni(durum?.codex)}. "node beyin.mjs onar" çalıştır; Codex klasöre güvenmeni ve her kancayı /hooks ekranında onaylamanı ister.`,
      });
  }
  return sonuc;
}

function blokKontrol(kok) {
  return ['CLAUDE.md', 'AGENTS.md'].map(ad => {
    let metin = null;
    try { metin = readFileSync(join(kok, ad), 'utf8'); } catch { /* dosya yok */ }
    if (metin === null) {
      return { ad: 'yonetilen_blok', durum: 'uyari', mesaj: `${ad} bulunamadı. "node beyin.mjs onar" çalıştır.` };
    }
    if (!metin.includes(BLOK_BASLA) || !metin.includes(BLOK_BITIR)) {
      return { ad: 'yonetilen_blok', durum: 'uyari', mesaj: `${ad} içinde Dijital Beyin bölümü yok. "node beyin.mjs onar" çalıştır.` };
    }
    return { ad: 'yonetilen_blok', durum: 'tamam', mesaj: `${ad} içinde Dijital Beyin bölümü var.` };
  });
}

function bayatKontrol(liste) {
  if (!Array.isArray(liste) || !liste.length) {
    return [{ ad: 'bayat_not', durum: 'tamam', mesaj: 'Temel notlar güncel.' }];
  }
  return liste.map(not => ({
    ad: 'bayat_not',
    durum: 'uyari',
    mesaj: `${not.dosya} ${not.gun} gündür güncellenmedi (sınır ${not.sinir} gün); gözden geçirmek iyi olur.`,
  }));
}

function yerelGunBaslangici(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function yakalamaKontrol(kok, simdi) {
  const { gunluk } = yollar(kok);
  let adaylar = [];
  try {
    adaylar = readdirSync(gunluk, { withFileTypes: true })
      .filter(g => g.isFile() && g.name.toLowerCase().endsWith('.md'))
      .map(g => {
        const tam = join(gunluk, g.name);
        const eslesme = /^(\d{4})-(\d{2})-(\d{2})\.md$/iu.exec(g.name);
        let zaman;
        if (eslesme) zaman = new Date(Number(eslesme[1]), Number(eslesme[2]) - 1, Number(eslesme[3])).getTime();
        else {
          try { zaman = statSync(tam).mtimeMs; } catch { zaman = 0; }
        }
        return { ad: g.name, tam, zaman };
      })
      .sort((a, b) => b.zaman - a.zaman);
  } catch { /* günlük klasörü yok; düzen kontrolü bildirir */ }
  const son = adaylar.find(aday => {
    try { return readFileSync(aday.tam, 'utf8').includes('<!-- oturum:'); } catch { return false; }
  });
  if (!son) {
    return [{ ad: 'son_yakalama', durum: 'uyari', mesaj: 'Henüz oturum yakalanmadı.' }];
  }
  const gun = Math.max(0, Math.floor((yerelGunBaslangici(simdi) - yerelGunBaslangici(new Date(son.zaman))) / GUN_MS));
  if (gun > YAKALAMA_UYARI_GUN) {
    return [{
      ad: 'son_yakalama',
      durum: 'uyari',
      mesaj: `Son oturum ${gun} gün önce yakalandı (${son.ad}). Kancalar çalışıyor mu, bir bak.`,
    }];
  }
  return [{ ad: 'son_yakalama', durum: 'tamam', mesaj: gun === 0 ? 'Son oturum bugün yakalandı.' : `Son oturum ${gun} gün önce yakalandı.` }];
}

function guncellemeKontrol(kok) {
  const durum = jsonOku(join(yollar(kok).durum, 'guncelleme.json'), null);
  if (!durum || typeof durum !== 'object') {
    return [{ ad: 'guncelleme', durum: 'tamam', mesaj: 'Güncelleme henüz denetlenmedi.' }];
  }
  const sonuc = [];
  const mevcut = jsonOku(join(kok, 'sistem', 'surum.json'), null)?.surum;
  let yeni = false;
  try { yeni = surumKarsilastir(durum.en_son_surum, mevcut) > 0; } catch { yeni = false; }
  if (yeni) {
    sonuc.push({
      ad: 'guncelleme',
      durum: 'uyari',
      mesaj: `Yeni sürüm var: ${durum.en_son_surum} (kurulu ${mevcut}). "node beyin.mjs guncelle" ile güncelleyebilirsin.`,
    });
  }
  if (durum.hata) {
    sonuc.push({
      ad: 'guncelleme',
      durum: 'uyari',
      mesaj: durum.hata === 'paket_bulunamadi'
        ? 'GitHub\'da yayınlanmış bir sürüm bulunamadı. Ertesi gün yeniden bakılır; acelen yoksa bir şey yapman gerekmez.'
        : `Son güncelleme denetimi başarısız oldu (${String(durum.hata).slice(0, 80)}). İnternet bağlantısı gelince yeniden denenir.`,
    });
  }
  if (!sonuc.length) sonuc.push({ ad: 'guncelleme', durum: 'tamam', mesaj: 'En son sürüm kurulu.' });
  return sonuc;
}

function kilitKontrol(kok, simdi) {
  const { durum } = yollar(kok);
  let adlar = [];
  try { adlar = readdirSync(durum).filter(ad => ad.endsWith('.kilit')); } catch { /* klasör yok */ }
  const bayatlar = adlar.filter(ad => {
    try { return simdi.getTime() - statSync(join(durum, ad)).mtimeMs > BAYAT_KILIT_MS; } catch { return false; }
  });
  if (!bayatlar.length) return [{ ad: 'kilit', durum: 'tamam', mesaj: 'Takılı kalmış iş yok.' }];
  return bayatlar.map(ad => ({
    ad: 'kilit',
    durum: 'uyari',
    mesaj: `.beyin/durum/${ad} 10 dakikadan eski; yarım kalmış bir iş olabilir. Sonraki çalışmada kendiliğinden devralınır.`,
  }));
}

function sonunuOku(dosya) {
  const fd = openSync(dosya, 'r');
  try {
    const boyut = statSync(dosya).size;
    const okunacak = Math.min(boyut, LOG_OKUMA_BAYT);
    const tampon = Buffer.alloc(okunacak);
    readSync(fd, tampon, 0, okunacak, boyut - okunacak);
    return tampon.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

function hataGunluguKontrol(kok, simdi) {
  const { hataLog } = yollar(kok);
  if (!existsSync(hataLog)) return [{ ad: 'hata_gunlugu', durum: 'tamam', mesaj: 'Son 24 saatte hata yok.' }];
  const sinir = simdi.getTime() - GUN_MS;
  let sayi = 0;
  let son = null;
  for (const satir of sonunuOku(hataLog).split('\n')) {
    if (!satir.trim()) continue;
    let kayit;
    try { kayit = JSON.parse(satir); } catch { continue; }
    const zaman = Date.parse(kayit?.zaman ?? '');
    if (Number.isNaN(zaman) || zaman < sinir || zaman > simdi.getTime() + 60_000) continue;
    sayi += 1;
    son = kayit;
  }
  if (!sayi) return [{ ad: 'hata_gunlugu', durum: 'tamam', mesaj: 'Son 24 saatte hata yok.' }];
  return [{
    ad: 'hata_gunlugu',
    durum: 'uyari',
    mesaj: `Son 24 saatte ${sayi} hata kaydedildi; sonuncusu: ${String(son?.baglam ?? '')} (${String(son?.hata ?? '').slice(0, 80)}). Ayrıntı: .beyin/durum/hatalar.log`,
  }];
}

async function guvenli(ad, is) {
  try {
    return await is();
  } catch (error) {
    return [{ ad, durum: 'uyari', mesaj: `Bu bölüm denetlenemedi (${String(error?.message ?? error).slice(0, 80)}).` }];
  }
}

export async function doktor(kok, {
  simdi = new Date(),
  kancaDurumuFn = varsayilanKancaDurumu,
  manifestOkuFn = varsayilanManifestOku,
  bayatNotlarFn = varsayilanBayatNotlar,
  nodeSurumu = process.versions.node,
} = {}) {
  const kontroller = [];
  const ekle = liste => { kontroller.push(...liste); };
  let manifest = null;
  try { manifest = await manifestOkuFn(kok); } catch { manifest = null; }
  const istemciler = istemcileriAl(manifest);

  ekle(await guvenli('node', () => nodeKontrol(nodeSurumu)));
  ekle(await guvenli('kasa_duzeni', () => duzenKontrol(kok)));
  ekle(await guvenli('manifest', () => manifestKontrol(kok, manifest)));
  ekle(await guvenli('surum', () => surumKontrol(kok, manifest)));
  ekle(await guvenli('kanca', async () => kancaKontrol(await kancaDurumuFn(kok), istemciler)));
  ekle(await guvenli('yonetilen_blok', () => blokKontrol(kok)));
  ekle(await guvenli('bayat_not', async () => bayatKontrol(await bayatNotlarFn(kok, simdi))));
  ekle(await guvenli('son_yakalama', () => yakalamaKontrol(kok, simdi)));
  ekle(await guvenli('guncelleme', () => guncellemeKontrol(kok)));
  ekle(await guvenli('kilit', () => kilitKontrol(kok, simdi)));
  ekle(await guvenli('hata_gunlugu', () => hataGunluguKontrol(kok, simdi)));

  return { saglikli: !kontroller.some(k => k.durum === 'hata'), kontroller };
}
