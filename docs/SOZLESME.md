# Dijital Beyin — uygulama sözleşmesi (v1.0)

Bu belge kodun bağlayıcı sözleşmesidir: dosya sahipliği, dışa aktarılan
fonksiyon imzaları, kasa düzeni ve güvenlik kuralları. Değişiklik önce burada
yapılır.

## Amaç

Herkesin kendi bilgisayarına kurabileceği, yazarın yayınladığı sürümlerle tek
komutla güncellenen, modelden bağımsız bir dijital beyin. Claude Code ve Codex
ile otomatik; diğer yapay zekâlarla üç dosya üzerinden elle çalışır.

"Sağlam"ın tanımı (Grafikcem OS 2026-10-16 kararından):

1. Bağlam ekleme ve oturum yakalama **hiç model olmadan** çalışır.
2. Kancalar oturumu **asla bloklamaz**: ağ yok, model yok, hata olursa sessizce
   `.beyin/durum/hatalar.log`'a yazar ve 0 ile çıkar. Tek istisna koruma
   kancasının bilinçli "deny" kararıdır.
3. Hiçbir şey sessizce durmaz: `doktor` her katmanın son çalışmasını gösterir.
4. Güncelleme kullanıcı dosyasına dokunmaz; bozuk güncelleme kendini geri alır.

v1.0 kapsam dışı (v1.1): model ile günlük derleme (`derle`), anlamsal arama,
çoklu makine eşitlemesi.

## Çalışma zamanı

- Node.js ≥ 20, sıfır npm bağımlılığı, ES modülleri.
- Windows, macOS, Linux. Yollar boşluk ve Türkçe karakter içerebilir.
- Ajan talimat metinleri (yönetilen CLAUDE.md/AGENTS.md bloğu, bağlam başlıkları)
  İngilizce, "kullanıcının dilinde cevap ver" kuralıyla. Kullanıcıya dönük CLI
  mesajları, şablonlar ve belgeler Türkçe.

## Kasa düzeni (kurulmuş hâl)

| Yol | Sahip | Güncellemede |
|---|---|---|
| `sistem/**` | sistem (yönetilen) | Değiştirilir |
| `beyin.mjs` | sistem (yönetilen) | Değiştirilir |
| `beynim/`, `notlar/`, `gunluk/`, `gelen-kutusu/` | kullanıcı | **Asla dokunulmaz** (gunluk'a yalnız yakalama bloğu yazar) |
| `.beyin/tercihler.json` | kullanıcı | Asla dokunulmaz |
| `CLAUDE.md`, `AGENTS.md`, `.gitignore` | kullanıcı + yönetilen blok | Yalnız `<!-- dijital-beyin:basla -->` … `<!-- dijital-beyin:bitir -->` arası yenilenir |
| `.claude/settings.json`, `.codex/hooks.json` | kullanıcı + bizim kanca girdilerimiz | Yalnız komutu `sistem/kanca.mjs` içeren girdiler yenilenir |
| `.beyin/kurulum.json` | durum | Yeniden yazılır |
| `.beyin/durum/`, `.beyin/yedek/`, `.beyin/yerel-degisiklikler/` | durum | Eklenir, en fazla 3 yedek tutulur |

Kasa kökü, `.beyin/kurulum.json` dosyasını içeren en yakın üst klasördür.

## Kaynak depo düzeni

```
kur.mjs                 kurulum girişi (C)
beyin.mjs               başlatıcı → sistem/cli.mjs (lider)
package.json            (lider)
sistem/surum.json       {"surum","repo","paket_sema"} (lider)
sistem/cli.mjs          komut dağıtıcı (lider)
sistem/kanca.mjs        tek kanca girişi (lider)
sistem/lib/yol.mjs      (lider)
sistem/lib/notlar.mjs   (lider)
sistem/lib/tercihler.mjs (lider)
sistem/lib/gizlilik.mjs (A)
sistem/lib/yakala.mjs   (A)
sistem/lib/baglam.mjs   (A)
sistem/lib/koruma.mjs   (A)
sistem/lib/guncelle.mjs (B)
sistem/lib/doktor.mjs   (B)
arac/paketle.mjs        (B)
.github/workflows/*     (B)
sistem/lib/kurulum.mjs  (C)
sistem/lib/ara.mjs      (C)
sistem/yonetilen/*      (C)
sablon/**, ornek/**     (C)
README.md, KURULUM.md, NOTICE.md, LICENSE, CHANGELOG.md (C)
test/<modül>.test.mjs   modül sahibi
test/uctan-uca.test.mjs (lider)
```

Bir şerit yalnız kendi dosyalarını yazar. Başka şeridin modülünü yalnız aşağıdaki
imzalarla içe aktarır.

## İmzalar

Tüm fonksiyonlar senkron, aksi yazılmadıkça. `kok` her zaman kasa kökünün mutlak yolu.
`simdi` isteğe bağlı `Date` (testler için).

### yol.mjs (lider)
- `KASA_ISARETI = '.beyin/kurulum.json'`
- `kokBul(baslangic) → string|null`
- `yollar(kok) → {sistem, beynim, notlar, gunluk, gelenKutusu, beyinDir, kurulum, tercihler, durum, yedek, yerelDegisiklikler, hataLog}`
- `yonetilenYolMu(rel) → boolean` — `sistem/` altı veya tam `beyin.mjs`; `/` ayraçlı göreli yol, `..`/mutlak/sürücü harfi/boş parça reddedilir.
- `guvenliYol(kok, rel) → string` — kök dışına çıkarsa `Error('yol_reddedildi')`.
- `atomikYaz(dosya, icerik)` — üst klasörü oluşturur, geçici dosya + rename.
- `jsonOku(dosya, varsayilan)` — yoksa/bozuksa varsayılan.
- `sha256(buffer|string) → hex`
- `yerelTarih(date) → 'YYYY-MM-DD'` (makinenin yerel günü)
- `kilitAl(kok, ad, {bayatMs=600000}) → () => void` — `.beyin/durum/<ad>.kilit`, `wx`; bayatsa devralır; alınamazsa `Error('kilit_mesgul')`.
- `hataKaydet(kok, baglam, hata)` — tek satır JSON'u `hataLog`'a ekler, asla fırlatmaz.

### notlar.mjs (lider)
- `frontmatterAyir(metin) → {veri: object, govde: string}` — basit YAML: `anahtar: deger`, liste (`- x`), tırnaklı değer.
- `notTarihi(veri) → Date|null` — `date`/`tarih` alanı.
- `gecersizMi(satir) → boolean` — `GEÇERSİZ`/`GECERSIZ`/`~~…~~` işaretli karar satırı.

### tercihler.mjs (lider)
- `VARSAYILAN_TERCIHLER = {baglam_karakter: 6000, yakalama: true, guncelleme_bildirimi: true, bayat_gun: {guncel_durum: 30, aktif_projem: 30, ben_kimim: 180}, koruma: true}`
- `tercihleriOku(kok) → object` — derin birleştirme, bilinmeyen anahtar yok sayılır.
- `tercihYaz(kok, anahtar, deger)` — noktalı anahtar (`bayat_gun.guncel_durum`), tip doğrulamalı.

### gizlilik.mjs (A)
- `sirlariGizle(metin) → {metin, bulgular: string[]}` — API anahtarı (OpenAI/Anthropic, Stripe `sk_/rk_`, `whsec_`, `hf_`, Google `AIza`/`ya29.`), GitHub/GitLab (`glpat-`)/npm/Slack token'ları, `Bearer` token, özel anahtar bloğu, parola=… (ortam değişkeni biçimi dahil: `DB_PASSWORD=`, `AWS_SECRET_ACCESS_KEY=`, `"password": "…"`), kart numarası (Luhn), IBAN (TR ve diğer ülkeler), JWT, bağlantı dizesindeki parola (kullanıcı adı boş olsa da). Bulunanlar `[GİZLENDİ:tür]` olur. Sıradan metin, yol, SHA, UUID ve tarih bayt bayt korunur.

### yakala.mjs (A)
- `transkriptOku(dosya, {sinirBayt=8_000_000}) → Array<{rol:'user'|'assistant', metin, zaman?}>` — Claude Code ve Codex JSONL'ünü savunmacı ayrıştırır; araç sonuçları, sistem hatırlatmaları, komut sarmalayıcıları ve otomatik turlar elenir.
- `kaydetmeIstendiMi(mesajlar) → boolean` — kullanıcı mesajında `[kaydetme]` veya "bunu kaydetme"/"do not save this" kalıpları.
- `ozetCikar(mesajlar) → {istek, sonuc, dosyalar: string[], tur_sayisi}` — modelsiz; istek ilk anlamlı kullanıcı mesajı (≤ 400 karakter), sonuç son asistan metni (≤ 600 karakter). Önce tüm metin gizlenir, sonra kesilir (kesilen anahtar sızmaz).
- `tumDosyadaKaydetmeVarMi(dosya) → boolean` — tüm transkripti 1 MB parçalarla, sınırlı bellekle tarar; yalnız kullanıcı satırları sayılır.
- `oturumuYakala(kok, {istemci, oturumId, transkriptYolu, olay, simdi}) → {durum:'yakalandi'|'atlandi', neden?, dosya?}` — `gunluk/YYYY-MM-DD.md` içinde `<!-- oturum:<id> -->` … `<!-- /oturum:<id> -->` bloğunu kilit altında ekler ya da yerinde yeniler (aynı oturum ikinci kez yazılınca çoğalmaz). Gizlilik süzgecinden geçer. `[kaydetme]` → atlar, varsa bugünkü ve dünkü bloğu siler ve `.beyin/durum/kaydetme/<id>.isaret` bırakır; işaret varsa oturum bir daha yakalanmaz (8 MB penceresinden çıkan istek kaybolmaz). Gece yarısını aşan oturumun bloğu dünkü dosyada güncellenir (`dosya` dünkü olabilir). Kilit meşgulse ≈1,3 sn yeniden dener, olmazsa `hataKaydet` ile iz bırakır. `tercihler.yakalama=false` → atlar.

### baglam.mjs (A)
- `baglamOlustur(kok, {simdi, butce}) → string` — öncelik: güncel durum, aktif proje, ben kimim, geçerli kararlar (son 15; "Elediklerim" gibi vazgeçme başlıkları altındaki maddeler ayrı bir "Ruled out" alt başlığında, son 5), son 3 oturum özeti, bayatlık uyarıları. Çelişki kuralı metinde: tarihi yeni olan kazanır, `supersedes` alanı eskisini geçersiz kılar, dosyada olmayanı uydurma, çelişkide kullanıcıya sor. Toplam ≤ `butce` ve kesinlikle ≤ 9500 karakter; taşarsa düşük öncelikli bölüm kısaltılır.
- `bayatNotlar(kok, simdi) → Array<{dosya, gun, sinir}>`

### koruma.mjs (A)
- `korumaKarari(kok, {aracAdi, girdi}) → {izin: true} | {izin: false, neden}` — `beynim/verdigim-kararlar.md` ve `gunluk/**` yalnız-ekle (Write/Edit/MultiEdit eski satırları korumalı; bir satıra son ek eklemek, örn. `GEÇERSİZ`, serbest); `beynim/` altında dosyayı boşaltan Write reddedilir. Karar dosyasında yalnız karar maddeleri (`- `, `* `, `1. `, `2) `; `(örnek)` hariç) korunur, satırlar çoklu küme olarak sayılır. Edit/MultiEdit tüm dosyaya uygulanıp sonuç karşılaştırılır. Kabuk (Bash/PowerShell): komut `;`, `&&`, `||`, `|`, `&` ve satır sonlarından basit komutlara bölünür; yıkıcı fiil (silme, taşıma, üzerine yazma, `cp`/`copy`/`Copy-Item` hedefi, `find -delete/-exec`, `git rm/checkout/restore/clean`) yalnız aynı basit komutun argümanı ya da `>` hedefi `beynim/`/`gunluk/` yol parçasına değiyorsa reddedilir; korunan klasöre `cd` sonrası yıkıcı komut da reddedilir; `$VAR` açılır, `bash -c`/`powershell -Command`/`sudo` içi incelenir; `>>` serbest. Codex `apply_patch`: var olan korunan dosyaya `Add File` baştan yazma sayılır. Bu bir güvenlik sınırı değil, kaza önleyicidir; belgede böyle yazılır.

### kurulum.mjs (C)
- `kur({kaynak, hedef, istemciler=['claude'], plan=false, simdi, uzerineYaz=false}) → {yazilanlar: string[], korunanlar: string[], uyarilar: string[]}` — `kaynak` kaynak depo/paket kökü. Var olan kullanıcı dosyasının üzerine asla yazmaz. `hedef` kaynakla aynı ya da içindeyse reddeder. Taze kurulumda (`.beyin/kurulum.json` yok) hedefte `sistem/` ya da `beyin.mjs` varsa `Error('hedef_cakisma:…')`; `uzerineYaz` (CLI `--uzerine-yaz`) önce `.beyin/yedek/kurulum-oncesi-<zaman>/` altına yedekler. Sonunda yarıda kalmış güncelleme işaretini siler.
- `onar(kok, {istemciler, simdi, dosyalar, sablon}) → {degisenler: string[]}` — yönetilen blokları, kancaları ve manifesti yeniden yazar; eksik `beynim/ notlar/ gunluk/ gelen-kutusu/` klasörlerini boş oluşturur (`sablon` verilirse eksik şablon dosyalarını `COPYFILE_EXCL` ile ekler); kullanıcı dosyasına dokunmaz. Güncelleme sonrası da bu çağrılır.
- **Manifest kuralı:** manifest = kitin ya da paketin gönderdiği yönetilen dosyalar. Hedef disk asla taranmaz; `sistem/` altına kullanıcının koyduğu dosya manifeste girmez, güncellemede silinmez. `dosyalar` verilmezse önceki manifestin yolları kullanılır.
- `kancalariBirlestir(kok, istemciler) → {degisenler: string[]}`
- `kancaDurumu(kok) → {claude: {kurulu, eksik: string[]}, codex: {kurulu, eksik: string[]}}`
- `manifestYaz(kok, surum, {simdi, istemciler, dosyalar})` → `.beyin/kurulum.json`: `{sema:'dijital-beyin.kurulum/v1', surum, repo, istemciler, kuruldu, guncellendi, dosyalar: {rel: sha256}}`
- `manifestOku(kok) → object|null`

### ara.mjs (C)
- `ara(kok, sorgu, {limit=5}) → Array<{dosya, satir, skor, parca}>` — BM25, Türkçe ek soyma, `beynim/ notlar/ gunluk/ gelen-kutusu/` altındaki `.md`.
- `turkceKok(kelime) → string`

### guncelle.mjs (B)
- `surumKarsilastir(a, b) → -1|0|1` (semver, ön sürüm etiketi yok sayılmaz)
- `async sonSurumuBul({repo, fetchFn=fetch}) → {surum, paketUrl, shaUrl}`
- `paketiDogrula(buffer, beklenenSha) → paket` — önce sha256, sonra JSON + şema: `{sema:'dijital-beyin.paket/v1', surum, olusturuldu, min_node, dosyalar:[{yol, sha256, icerik_b64}]}`; her `yol` `yonetilenYolMu`'dan geçer, her dosyanın sha256'sı tutar, toplam ≤ 10 MB.
- `async paketiUygula(kok, paket, {simdi, onarFn, dogrulaFn, adimFn}) → {eskiSurum, yeniSurum, yedekDizin, yerelDegisiklikler: string[]}` — `onarFn` varsayılanı alt süreçte `node beyin.mjs onar`, `dogrulaFn` varsayılanı alt süreçte `node beyin.mjs doktor --json` (yazmadan önce ve sonra birer kez; boolean ya da doktor JSON'u döner); `adimFn` test kancası. Sıra: bağlantı denetimi (`sistem` ya da üst klasörlerinden biri symlink/junction ise ya da kasa dışına çözülüyorsa `sistem_baglanti_reddedildi`) → kilit → yedek → işaret `.beyin/durum/guncelleme-suruyor.json` → atomik yazma (`sistem/**` → eski manifestte olup pakette olmayanları silme → `surum.json` → en son `beyin.mjs`) → `onar` → manifesti paketin yol listesiyle yaz → doktor kapısı → işareti sil. Başarısızsa yedekten geri yükler, geri yüklenen sürümün `onar`'ını alt süreçte çalıştırır, yedeğin manifestini geri koyar ve fırlatır.
- **Doktor kapısı:** kullanıcı durumu kontrollerindeki `hata` (`kasa_duzeni`, `yonetilen_blok`, `bayat_not`, `son_yakalama`, `guncelleme`, `kilit`, `hata_gunlugu`) geri aldırmaz; diğer her `hata` aldırır (bilinmeyen adlar dahil). `surum` `tamam` olmalı; `kanca_codex` yalnız güncellemeden önce `tamam` idiyse kapıya girer. `doktor --json` çıkış kodu sözleşmedir: 0 ⇔ `saglikli:true`.
- Hatalar (`uygulama_basarisiz_geri_alindi`, `dogrulama_basarisiz_geri_alindi`, `geri_alma_basarisiz`) `error.ayrinti = {kontroller, neden, onarHatasi}` taşır; `cli.mjs` bunları kullanıcıya yazar.
- `async guncelle(kok, {kontrol, paketDosyasi, shaDosyasi, zorla, fetchFn}) → {durum:'guncel'|'guncellendi'|'mevcut', onarim?, ...}` — işaret kaldıysa ya da manifest sürümü `surum.json`'dan farklıysa `onarim: true` ile aynı sürümü yeniden uygular (asla eski sürüme inmez).
- `geriAl(kok, {simdi, onarFn}) → {geriAlinanSurum, onarHatasi?}` — kendi işaretini (`islem:'geri-al'`) yazar, geri yüklenen sürümün `onar`'ını `spawnSync` ile çalıştırır.
- **Yarıda kalan güncelleme:** işaret `{sema:'dijital-beyin.guncelleme-suruyor/v1', yedek, eskiSurum, yeniSurum, pid, baslangic, islem?}`. `beyin.mjs` her açılışta, CLI'yi içe aktarmadan önce ve yalnız `node:fs/path/url` ile, işaret varsa ve `guncelle.kilit` canlı değilse (10 dakikadan genç ve sahibi pid yaşıyor) yedeği geri yükler, güncellemenin eklediği dosyaları siler, eski manifesti koyar, işareti ve yedeği siler (`geri-al` yedeği kalır). `kanca.mjs` işaret varken hiçbir şey yapmaz ve lib modüllerini dinamik yükler. `kur` işareti siler.
- `async arkaPlanKontrol(kok, {fetchFn})` — günde en fazla bir kez; `.beyin/durum/guncelleme.json` = `{son_kontrol, en_son_surum, hata?}`.
- `kontrolZamaniMi(kok, simdi) → boolean`
- `guncellemeBildirimi(kok) → string|null` — yeni sürüm varsa ve bildirim açıksa tek satır.

### doktor.mjs (B)
- `async doktor(kok, {simdi, kancaDurumuFn, manifestOkuFn, bayatNotlarFn}) → {saglikli, kontroller: Array<{ad, durum:'tamam'|'uyari'|'hata', mesaj}>}` — Node sürümü, kasa düzeni, manifest bütünlüğü (yönetilen dosya yerelde değişmiş mi), kancalar, yönetilen bloklar, bayat notlar, son yakalama yaşı, güncelleme durumu, bayat kilit, hata günlüğü son 24 saat. `saglikli` yalnız `hata` yoksa true.

### kanca.mjs ve cli.mjs (lider)
- `node sistem/kanca.mjs <claude|codex> <baslangic|bitis|sikistirma|durdur|koruma>` stdin'den JSON okur.
  `BEYIN_IC_CAGRI=1` ortam değişkeni varsa hiçbir şey yapmaz. `cwd`'den kasa bulunamazsa hiçbir şey yapmaz.
- `node beyin.mjs <komut>`: `baglam`, `ara <sorgu>`, `doktor [--json]`, `guncelle [--kontrol] [--paket f --sha f] [--zorla]`, `geri-al`, `onar`, `tercih [anahtar [deger]]`, `surum`, `arka-plan-kontrol` (iç kullanım).

## Kancalar

Claude Code, `.claude/settings.json` (exec biçimi, taşınabilir):

```json
{"type":"command","command":"node","args":["${CLAUDE_PROJECT_DIR}/sistem/kanca.mjs","claude","baslangic"],"timeout":10}
```

Olaylar: `SessionStart` (matcher `startup|resume|clear|compact`) → `baslangic`;
`SessionEnd` → `bitis` (timeout 10); `PreCompact` → `sikistirma`;
`PreToolUse` (matcher `Write|Edit|MultiEdit|Bash|PowerShell`) → `koruma`.

Codex, `.codex/hooks.json` (proje düzeyi; mutlak yol, `onar` yeniden yazar):
`SessionStart` → `baslangic`, `Stop` → `durdur`, `PreToolUse` → `koruma`.
Codex her kancayı `/hooks` ekranında kullanıcıya onaylatır; kurucu bunu atlayamaz
ve belgede açıkça yazar.

Bağlam çıktısı: `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}`.
Ret: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}`, çıkış 0.

## Güncelleme kuralları

- Depo `sistem/surum.json` içinde sabit; yalnız HTTPS.
- Paket ve `.sha256` indirilir; hiçbir şey ayrıştırılmadan veya çalıştırılmadan önce sha256 doğrulanır.
- Aynı sürümden gelen yan hash **bütünlük** sağlar, **kimlik doğrulama değil**; README böyle der.
- Her yol izin listesinden geçer; yedek → işaret → atomik yazma (`atomikYaz` EPERM/EBUSY/EACCES'te kısa beklemeli yeniden dener) → `onar` → manifest → alt süreçte doktor kapısı → hata varsa otomatik geri alma.
- Paket içi base64 döngüyle doğrulanır (regex değil); 10 MB'a kadar dosya güvenle işlenir.
- Yayın (`surum.yml`): 3 işletim sistemi × Node 20/22 test işi geçmeden yayın yok; `-` içeren etiket `--prerelease` olur ve `releases/latest`'e girmez.
- Eşzamanlı çalışmaya karşı kilit. Çevrimdışı `--paket` yolu.
- Kurulum + güncelleme sonrası kullanıcı dosyaları bayt bayt aynı kalır (testle doğrulanır).

## Test kuralları

- `npm test` (`node --test "test/*.test.mjs"`) her platformda; Node 21+ dizin argümanını modül sayar.
- Fikstür kasa yolu boşluk ve Türkçe karakter içerir (`Dijital Beyin Ğüşİ`).
- Fikstürlerde gerçek kişisel veri yok; örnek kişi Elif.
- Yazılan dosyalarda `\u{FEFF}` olmaz.
