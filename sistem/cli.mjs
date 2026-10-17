// Komut dağıtıcı: node beyin.mjs <komut>
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { kokBul } from './lib/yol.mjs';

const SISTEM = dirname(fileURLToPath(import.meta.url));

const YARDIM = `Dijital Beyin — komutlar

  node beyin.mjs baglam                 Oturum başında yapay zekâya verilen bağlamı göster
  node beyin.mjs ara "<sorgu>"          Notlarında ara (--limit 10)
  node beyin.mjs doktor                 Her şey çalışıyor mu, kontrol et (--json)
  node beyin.mjs guncelle               Yeni sürümü kur (--kontrol yalnız bakar)
  node beyin.mjs guncelle --paket <dosya> --sha <dosya>   İnternetsiz güncelleme
  node beyin.mjs geri-al                Son güncellemeyi geri al
  node beyin.mjs onar                   Kancaları ve yönetilen blokları yeniden yaz (--istemci claude,codex)
  node beyin.mjs tercih                 Tercihleri göster; tercih <anahtar> <değer> ile değiştir
  node beyin.mjs surum                  Kurulu sürümü göster
`;

function secenekleriAyir(args) {
  const secenekler = {};
  const konumlar = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const ad = arg.slice(2);
      const sonraki = args[i + 1];
      if (sonraki !== undefined && !sonraki.startsWith('--')) { secenekler[ad] = sonraki; i += 1; }
      else secenekler[ad] = true;
    } else {
      konumlar.push(arg);
    }
  }
  return { secenekler, konumlar };
}

function kasaKoku() {
  const sahibi = resolve(SISTEM, '..');
  if (existsSync(join(sahibi, '.beyin', 'kurulum.json'))) return sahibi;
  return kokBul(process.cwd());
}

function surumOku() {
  try {
    return JSON.parse(readFileSync(join(SISTEM, 'surum.json'), 'utf8'));
  } catch {
    return { surum: 'bilinmiyor', repo: 'bilinmiyor' };
  }
}

const out = text => process.stdout.write(`${text}\n`);
const err = text => process.stderr.write(`${text}\n`);

const YENIDEN_KUR = 'Son sürümü indirip kurucuyu aynı klasöre yeniden çalıştır: node kur.mjs --hedef "<bu klasör>". Notlarına dokunulmaz.';

const HATA_METINLERI = {
  kilit_mesgul: 'Başka bir güncelleme ya da yazma işlemi sürüyor. Biraz sonra tekrar dene.',
  paket_bulunamadi: 'GitHub sürümünde güncelleme paketi bulunamadı.',
  github_sinir: 'GitHub şu an istek kabul etmiyor (saatlik sınır). Bir saat sonra tekrar dene.',
  github_hata: 'GitHub beklenmeyen bir yanıt verdi. Biraz sonra tekrar dene.',
  ag_hatasi: 'İnternete ulaşılamadı. Bağlantını kontrol edip tekrar dene ya da internetsiz güncelleme için --paket ve --sha kullan.',
  https_gerekli: 'Güncelleme adresi güvenli (https) değil; indirme yapılmadı, hiçbir şey değiştirilmedi.',
  indirme_basarisiz: 'Güncelleme paketi indirilemedi. Biraz sonra tekrar dene.',
  paket_cok_buyuk: 'Güncelleme paketi izin verilen boyuttan (10 MB) büyük; hiçbir şey değiştirilmedi.',
  repo_gecersiz: 'sistem/surum.json içindeki depo adı geçersiz. "node beyin.mjs guncelle --zorla --paket <dosya> --sha <dosya>" ile onarabilirsin.',
  sha_uyusmuyor: 'İndirilen paket doğrulanamadı (sha256 tutmuyor). Hiçbir şey değiştirilmedi.',
  sha_gecersiz: 'Paketin sha256 değeri geçersiz. Hiçbir şey değiştirilmedi.',
  sha_dosyasi_gerekli: 'İnternetsiz güncelleme için --sha <dosya> da gerekli.',
  sha_dosyasi_gecersiz: '.sha256 dosyası okunamadı (64 haneli bir değer bekleniyordu). Hiçbir şey değiştirilmedi.',
  icerik_sha_uyusmuyor: 'Paketteki bir dosya bozuk (sha256 tutmuyor). Hiçbir şey değiştirilmedi.',
  sema_gecersiz: 'Güncelleme paketi beklenen biçimde değil. Hiçbir şey değiştirilmedi.',
  yol_reddedildi: 'Güncelleme paketi izin verilmeyen bir yola yazmak istedi; reddedildi, hiçbir şey değiştirilmedi.',
  yol_tekrar: 'Güncelleme paketinde aynı dosya iki kez var; reddedildi, hiçbir şey değiştirilmedi.',
  surum_uyusmuyor: 'Paketin sürüm bilgisi kendi içinde tutarsız; hiçbir şey değiştirilmedi.',
  surum_gecersiz: 'Kurulu sürüm bilgisi (sistem/surum.json) okunamadı. Onarmak için: node beyin.mjs guncelle --zorla',
  zorunlu_dosya_eksik: 'Güncelleme paketinde zorunlu bir sistem dosyası eksik; hiçbir şey değiştirilmedi. Paketi yeniden indir.',
  node_surumu_eski: 'Bu sürüm daha yeni bir Node.js istiyor. https://nodejs.org adresinden güncel LTS sürümünü kurup tekrar dene; hiçbir şey değiştirilmedi.',
  sistem_baglanti_reddedildi: 'sistem/ klasörü (ya da içindeki bir klasör) başka bir yere bağlantı (kısayol/junction) gibi görünüyor. Kasa dışına yazmamak için işlem durduruldu; hiçbir şey değiştirilmedi. Bağlantıyı kaldırıp tekrar dene.',
  uygulama_basarisiz_geri_alindi: 'Yeni sürüm yazılırken hata oldu; eski sürüm otomatik geri yüklendi. Notlarına dokunulmadı. Biraz sonra tekrar dene.',
  dogrulama_basarisiz_geri_alindi: 'Yeni sürüm kontrolden geçemedi; eski sürüm otomatik geri yüklendi. Notlarına dokunulmadı.',
  geri_alma_basarisiz: `Güncelleme geri alınamadı; yedek .beyin/yedek/ altında duruyor. Bir sonraki "node beyin.mjs" çalıştırmasında yeniden denenir. Düzelmezse: ${YENIDEN_KUR}`,
  yedek_yok: 'Geri alınacak bir güncelleme yedeği yok.',
  yedek_bozuk: `Güncelleme yedeği okunamadı. ${YENIDEN_KUR}`,
  tercih_bilinmiyor: 'Böyle bir tercih yok. Liste için: node beyin.mjs tercih',
  tercih_degeri: 'Bu tercih için geçersiz değer.',
  istemci_gecersiz: '--istemci yalnız claude, codex ya da claude,codex olabilir.',
  ayar_bozuk: '.claude/settings.json geçerli JSON değil; dosyaya dokunulmadı. Düzeltip tekrar dene.',
};

function hataMetni(error, kok) {
  const kod = String(error?.message ?? error);
  const metin = (HATA_METINLERI[kod] ?? `Beklenmeyen hata: ${kod}`).replace('<bu klasör>', kok ?? '<kasa klasörü>');
  const ayrinti = error?.ayrinti ?? {};
  const satirlar = [metin];
  if (Array.isArray(ayrinti.kontroller) && ayrinti.kontroller.length) {
    satirlar.push(`Geçemeyen kontroller: ${ayrinti.kontroller.join(', ')}`);
  }
  if (typeof ayrinti.neden === 'string' && ayrinti.neden) satirlar.push(`Asıl neden: ${ayrinti.neden}`);
  if (typeof ayrinti.onarHatasi === 'string' && ayrinti.onarHatasi) {
    satirlar.push(`Kancalar ve yönetilen bölümler yenilenemedi (${ayrinti.onarHatasi}). Çalıştır: node beyin.mjs onar`);
  }
  return satirlar.join('\n');
}

async function doktorKomutu(kok, secenekler) {
  const { doktor } = await import('./lib/doktor.mjs');
  const sonuc = await doktor(kok, {});
  if (secenekler.json) {
    out(JSON.stringify(sonuc));
  } else {
    const isaret = { tamam: '✓', uyari: '!', hata: '✗' };
    for (const k of sonuc.kontroller) out(`${isaret[k.durum] ?? '?'} ${k.ad}: ${k.mesaj}`);
    out(sonuc.saglikli ? '\nBeyin sağlıklı.' : '\nDüzeltilmesi gereken sorun var (✗).');
  }
  return sonuc.saglikli ? 0 : 1;
}

async function guncelleKomutu(kok, secenekler) {
  const { guncelle } = await import('./lib/guncelle.mjs');
  if (secenekler.paket && !secenekler.sha) {
    err('İnternetsiz güncelleme için --sha <dosya> da gerekli.');
    return 1;
  }
  const sonuc = await guncelle(kok, {
    kontrol: Boolean(secenekler.kontrol),
    paketDosyasi: typeof secenekler.paket === 'string' ? resolve(secenekler.paket) : undefined,
    shaDosyasi: typeof secenekler.sha === 'string' ? resolve(secenekler.sha) : undefined,
    zorla: Boolean(secenekler.zorla),
  });
  if (sonuc.durum === 'guncel') out(`Zaten en güncel sürümdesin (${sonuc.mevcutSurum ?? surumOku().surum}).`);
  else if (sonuc.durum === 'mevcut' && sonuc.onarim && sonuc.enSonSurum === sonuc.mevcutSurum) {
    out(`Kurulum yarım kalmış görünüyor (${sonuc.mevcutSurum}). Onarmak için: node beyin.mjs guncelle`);
  } else if (sonuc.durum === 'mevcut') out(`Yeni sürüm var: ${sonuc.enSonSurum} (kurulu: ${sonuc.mevcutSurum}). Kurmak için: node beyin.mjs guncelle`);
  else if (sonuc.durum === 'guncellendi') {
    out(`Güncellendi: ${sonuc.eskiSurum} → ${sonuc.yeniSurum}. Notlarına dokunulmadı.`);
    if (sonuc.yerelDegisiklikler?.length) {
      out(`Sistem dosyalarında yaptığın ${sonuc.yerelDegisiklikler.length} değişiklik .beyin/yerel-degisiklikler/ altına kopyalandı.`);
    }
    out('Yeni oturum açınca yeni sürüm devreye girer.');
  }
  return 0;
}

async function tercihKomutu(kok, konumlar) {
  const { tercihleriOku, tercihYaz } = await import('./lib/tercihler.mjs');
  const [anahtar, deger] = konumlar;
  if (anahtar === undefined) {
    out(JSON.stringify(tercihleriOku(kok), null, 2));
    return 0;
  }
  if (deger === undefined) {
    const value = anahtar.split('.').reduce((node, part) => node?.[part], tercihleriOku(kok));
    if (value === undefined) throw new Error('tercih_bilinmiyor');
    out(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
    return 0;
  }
  tercihYaz(kok, anahtar, deger);
  out(`Kaydedildi: ${anahtar} = ${deger}`);
  return 0;
}

export async function main(args) {
  const [komut, ...rest] = args;
  const { secenekler, konumlar } = secenekleriAyir(rest);
  if (!komut || komut === 'yardim' || komut === '--help' || komut === '-h') {
    out(YARDIM);
    return 0;
  }
  if (komut === 'surum' || komut === '--version') {
    const { surum, repo } = surumOku();
    const kok = kasaKoku();
    out(`Dijital Beyin ${surum} (${repo})${kok ? `\nKasa: ${kok}` : ''}`);
    return 0;
  }
  const kok = kasaKoku();
  if (!kok) {
    err('Bu klasör kurulu bir dijital beyin değil. Kurmak için: node kur.mjs --hedef "<klasör>"');
    return 1;
  }
  try {
    switch (komut) {
      case 'baglam': {
        const { baglamOlustur } = await import('./lib/baglam.mjs');
        out(baglamOlustur(kok, {}));
        return 0;
      }
      case 'ara': {
        const sorgu = konumlar.join(' ').trim();
        if (!sorgu) { err('Kullanım: node beyin.mjs ara "<sorgu>"'); return 1; }
        const { ara } = await import('./lib/ara.mjs');
        const limit = Number(secenekler.limit ?? 5);
        const sonuclar = ara(kok, sorgu, { limit: Number.isInteger(limit) && limit > 0 && limit <= 50 ? limit : 5 });
        if (!sonuclar.length) { out('Sonuç yok.'); return 0; }
        for (const s of sonuclar) out(`${s.dosya}:${s.satir}  (${s.skor})\n  ${s.parca.replace(/\s+/gu, ' ')}`);
        return 0;
      }
      case 'doktor':
        return await doktorKomutu(kok, secenekler);
      case 'guncelle':
        return await guncelleKomutu(kok, secenekler);
      case 'geri-al': {
        const { geriAl } = await import('./lib/guncelle.mjs');
        const sonuc = geriAl(kok);
        out(`Geri alındı: ${sonuc.geriAlinanSurum} sürümüne dönüldü.`);
        if (sonuc.onarHatasi) {
          err(`Kancalar ve yönetilen bölümler yenilenemedi (${sonuc.onarHatasi}). Çalıştır: node beyin.mjs onar`);
        }
        return 0;
      }
      case 'onar': {
        const { onar } = await import('./lib/kurulum.mjs');
        const istemciler = typeof secenekler.istemci === 'string'
          ? secenekler.istemci.split(',').map(s => s.trim()).filter(Boolean)
          : undefined;
        const sonuc = onar(kok, { istemciler });
        out(sonuc.degisenler.length ? `Yenilendi: ${sonuc.degisenler.join(', ')}` : 'Her şey zaten yerinde.');
        return 0;
      }
      case 'tercih':
        return await tercihKomutu(kok, konumlar);
      case 'arka-plan-kontrol': {
        const { arkaPlanKontrol } = await import('./lib/guncelle.mjs');
        await arkaPlanKontrol(kok, {});
        return 0;
      }
      default:
        err(`Bilinmeyen komut: ${komut}\n`);
        out(YARDIM);
        return 1;
    }
  } catch (error) {
    err(hataMetni(error, kok));
    return 1;
  }
}
