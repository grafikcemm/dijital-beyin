#!/usr/bin/env node
// Dijital Beyin kurucusu: node kur.mjs --hedef "<klasör>" [--istemci claude,codex] [--plan] [--uzerine-yaz]
// Kaynak, bu dosyanın bulunduğu klasördür.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  process.stderr.write(`Dijital Beyin Node.js 20 veya üstünü ister; bu bilgisayarda ${process.versions.node} var.\n`
    + 'https://nodejs.org adresinden güncel sürümü kurup tekrar dene.\n');
  process.exit(1);
}

const KULLANIM = 'Kullanım: node kur.mjs --hedef "<klasör>" [--istemci claude,codex] [--plan] [--uzerine-yaz]';

const HATALAR = {
  hedef_gecersiz: 'Kurulacak klasörü --hedef ile belirt.',
  kaynak_gecersiz: 'Kurucu dosyaları eksik görünüyor (sistem/ ya da beyin.mjs yok). Paketi yeniden indir.',
  hedef_kaynakla_ayni: 'Hedef klasör kurucunun kendi klasörü olamaz. Notlarının duracağı ayrı bir klasör seç.',
  hedef_kaynak_icinde: 'Hedef klasör kurucunun klasörünün içinde olamaz. Ayrı bir klasör seç.',
  kaynak_hedef_icinde: 'Kurucu klasörü hedef klasörün içinde duruyor. Kurucuyu başka bir yere (örneğin geçici bir klasöre) indirip oradan çalıştır.',
  hedef_klasor_degil: 'Hedef yol bir dosya; bir klasör olmalı.',
  istemci_gecersiz: '--istemci yalnız claude, codex ya da claude,codex olabilir.',
  ayar_bozuk: 'Klasördeki .claude/settings.json ya da .codex/hooks.json geçerli JSON değil. Dosyayı düzeltip tekrar dene; hiçbir şey değiştirilmedi.',
  surum_okunamadi: 'sistem/surum.json okunamadı. Paketi yeniden indir.',
};

function hataMesaji(error) {
  const kod = String(error?.message ?? error);
  if (HATALAR[kod]) return HATALAR[kod];
  if (kod.startsWith('hedef_cakisma:')) {
    return `Hedef klasörde bizim kurmadığımız bir ${kod.slice('hedef_cakisma:'.length).split(',').join(' / ')} var. `
      + 'Dosyalarının üzerine yazmamak için durdum. Boş bir klasör ya da başka bir ad seç; '
      + 'yine de buraya kurmak istersen --uzerine-yaz ekle (var olanlar önce .beyin/yedek/ altına kopyalanır).';
  }
  if (kod.startsWith('blok_kaynagi_yok:')) return HATALAR.kaynak_gecersiz;
  if (kod.startsWith('blok_bozuk:')) {
    return `${kod.slice('blok_bozuk:'.length)} dosyasında dijital-beyin işaretleri eksik ya da bozuk. `
      + 'Başlangıç ve bitiş işaret satırlarını düzeltip tekrar dene.';
  }
  return `Beklenmeyen hata: ${kod}`;
}

function argumanlariAyristir(argv) {
  const out = { plan: false, uzerineYaz: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--plan') out.plan = true;
    else if (arg === '--uzerine-yaz') out.uzerineYaz = true;
    else if (arg === '--hedef') out.hedef = argv[++i];
    else if (arg.startsWith('--hedef=')) out.hedef = arg.slice('--hedef='.length);
    else if (arg === '--istemci') out.istemci = argv[++i];
    else if (arg.startsWith('--istemci=')) out.istemci = arg.slice('--istemci='.length);
    else if (arg === '--yardim' || arg === '-h' || arg === '--help') out.yardim = true;
    else throw new Error(`Bilinmeyen seçenek: ${arg}`);
  }
  return out;
}

function liste(baslik, ogeler) {
  if (!ogeler.length) return [];
  const gosterilen = ogeler.slice(0, 12).map(o => `  - ${o}`);
  if (ogeler.length > 12) gosterilen.push(`  - … ve ${ogeler.length - 12} dosya daha`);
  return [baslik, ...gosterilen];
}

async function main(argv) {
  let secenek;
  try {
    secenek = argumanlariAyristir(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n${KULLANIM}\n`);
    return 1;
  }
  if (secenek.yardim) {
    process.stdout.write(`${KULLANIM}\n`);
    return 0;
  }
  if (!secenek.hedef) {
    process.stderr.write(`${HATALAR.hedef_gecersiz}\n${KULLANIM}\n`);
    return 1;
  }
  const kaynak = dirname(fileURLToPath(import.meta.url));
  const hedef = resolve(process.cwd(), secenek.hedef);
  const istemciler = secenek.istemci
    ? secenek.istemci.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : undefined;

  const { kur, manifestOku } = await import(pathToFileURL(resolve(kaynak, 'sistem', 'lib', 'kurulum.mjs')).href);
  let sonuc;
  try {
    sonuc = kur({ kaynak, hedef, istemciler, plan: secenek.plan, uzerineYaz: secenek.uzerineYaz });
  } catch (error) {
    process.stderr.write(`Kurulum yapılamadı: ${hataMesaji(error)}\n`);
    return 1;
  }

  const satirlar = [];
  if (secenek.plan) {
    satirlar.push(`Deneme (--plan): ${hedef} klasörüne hiçbir şey yazılmadı.`, '');
    satirlar.push(...liste('Yazılacak ya da güncellenecek dosyalar:', sonuc.yazilanlar));
  } else {
    satirlar.push(`Dijital Beyin kuruldu: ${hedef}`, '');
    satirlar.push(...liste('Yazılan ya da güncellenen dosyalar:', sonuc.yazilanlar));
    if (!sonuc.yazilanlar.length) satirlar.push('Değişen dosya yok; kurulum zaten güncel.');
  }
  if (sonuc.korunanlar.length) {
    satirlar.push('', ...liste('Senin dosyaların olduğu gibi bırakıldı:', sonuc.korunanlar));
  }
  const yerel = sonuc.uyarilar.filter(u => u.startsWith('yerel_degisiklik_ezilecek:'));
  if (sonuc.uyarilar.includes('hedef_bos_degil')) {
    satirlar.push('', 'Not: Klasör boş değildi. Var olan dosyalarına dokunulmadı; yalnız eksik olanlar eklendi.');
  }
  const yedek = sonuc.uyarilar.find(u => u.startsWith('kurulum_oncesi_yedek:'));
  if (yedek) {
    satirlar.push('', `Var olan sistem/ ve beyin.mjs dosyaların yedeklendi: ${yedek.slice('kurulum_oncesi_yedek:'.length)}`);
  }
  if (yerel.length) {
    satirlar.push('', ...liste('Uyarı: Bu sistem dosyalarını elle değiştirmişsin; yeni sürümleri yazıldı:',
      yerel.map(u => u.slice('yerel_degisiklik_ezilecek:'.length))));
  }
  if (!secenek.plan) {
    const kurulu = manifestOku(hedef)?.istemciler;
    const codex = (Array.isArray(kurulu) ? kurulu : istemciler ?? []).includes('codex');
    satirlar.push(
      '',
      'Sıradaki adımlar:',
      `  1. Claude Code'da doğrudan bu klasörü aç (proje kökü tam olarak bu klasör olmalı): ${hedef}`,
      '  2. Yeni bir oturum başlat; beyin oturum başında kendiliğinden okunur.',
      '  3. beynim/ klasöründeki dört dosyayı doldur ya da yapay zekâdan seninle birlikte doldurmasını iste.',
    );
    if (codex) {
      satirlar.push('  4. Codex için: Codex\'i bu klasörde aç; klasöre güvenip güvenmediğini sorarsa güven. Sonra /hooks yaz ve üç kancaya güven onayı ver. İkisinden biri eksikse kancalar çalışmaz.');
    }
    satirlar.push(
      '',
      'İlk mesaj için öneri:',
      '  "Beynimdeki dosyaları oku ve benim hakkımda ne bildiğini üç maddede söyle. Eksik olanları bana sor."',
      '',
      'Her şeyin çalıştığını görmek için kasa klasöründe: node beyin.mjs doktor',
    );
  }
  process.stdout.write(`${satirlar.join('\n')}\n`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
