# Dijital Beyin

Yapay zekanın seni her oturumda hatırlaması için kendi bilgisayarında duran bir
not klasörü. Kim olduğun, şu an ne üzerinde çalıştığın, hangi kararları
verdiğin ve hangi hatalara bir daha düşmek istemediğin beş düz metin
dosyasında durur. Yanlarındaki CLAUDE.md köprüsü yapay zekaya bu dosyaları her
oturumun başında okumasını ve üç temel kurala uymasını söyler. Notların bizim
bir sunucumuza gitmez; hepsi senin diskinde, senin dosyalarında.

## Kimin için

Her yeni sohbette kendini baştan anlatmaktan yorulan, yapay zekayla düzenli
çalışan herkes için: tasarımcılar, yazarlar, serbest çalışanlar, küçük ekipler.
Programcı olman gerekmez; kurulumu yapay zekana da yaptırabilirsin.

## Beş dosya

| Dosya | Ne için |
|---|---|
| `01-Kimlik.md` | Kim olduğun, ne iş yaptığın; kolay kolay değişmeyen temel bilgiler |
| `02-Guncel-Durum.md` | Bu haftanın odağı, değişen rakamlar, aktif projeler |
| `03-Kararlar.md` | Tarihli kararların ve elediğin fikirler; eskisi silinmez, GEÇERSİZ işaretlenir |
| `04-Tuzaklar.md` | Bir daha düşmek istemediğin hatalar, her satırda bir tane |
| `05-Calisma-Tarzim.md` | Yapay zekanın sana nasıl yazacağı: dil, ton, uzunluk |

Boş şablonlar [`sablon/beynim/`](sablon/beynim/) klasöründe. Her dosyanın
içinde nasıl doldurulacağını anlatan kısa bir not var; `04-Tuzaklar.md` iki
örnek satırla gelir. Doldurulmuş bir örnek için [`ornek/elif/`](ornek/elif/)
klasörüne bak.

## Üç yol

1. **Kurulumsuz:** beş dosya ve bir CLAUDE.md. Claude Code ya da Codex'te
   hemen çalışır.
2. **claude.ai ya da ChatGPT Projeleri:** beş dosya ve üç satırlık proje
   talimatı.
3. **Otomatik kurulum:** dosyalar her oturumun başında kendiliğinden okunur,
   oturum sonunda özet yazılır, karar dosyası korunur, güncelleme tek komuttur.

### 1. Kurulumsuz: beş dosya + CLAUDE.md

Dijital Beyin 1.x'i zaten kurduysan bu adımları atla ve
[1.x'ten 2.0'a](#1xten-20a) bölümüne bak: şablonları eski dosyalarının
yanına kopyalarsan aynı not iki ayrı adla durur.

1. Notların için bir klasör aç (örneğin `Beynim`) ve içine `beynim` adlı bir
   klasör koy.
2. Bu sayfanın üstündeki yeşil **Code** düğmesine bas, **Download ZIP**'i seç
   ve zip'i aç. `sablon/beynim/` içindeki beş dosyayı kendi `beynim/`
   klasörüne kopyala.
3. Ana klasörde `CLAUDE.md` adlı bir dosya oluştur ve aşağıdaki metni
   yapıştır. Codex kullanıyorsan aynı metni `AGENTS.md` adıyla da kaydet.
4. Klasörü Claude Code ya da Codex'te aç ve dosyaları birlikte doldurun.

```markdown
# Dijital Beyin 2.0 · Oturum Köprüsü

Her yeni oturuma başladığında önce şu üç dosyayı oku:
- `beynim/01-Kimlik.md`
- `beynim/02-Guncel-Durum.md`
- `beynim/04-Tuzaklar.md`

Benim için yazarken `beynim/05-Calisma-Tarzim.md` dosyasına uy. Bir fikir önermeden önce `beynim/03-Kararlar.md` dosyasına bak; elediğim bir fikri yeniden önerme.

## 3 Temel Kural
1. **Çelişki ve Tarih Kontrolü:** İki dosya çelişirse tarihi daha yeni olana uy ve eski kalan satırı bana açıkça bildir ("Şu dosya eski kalmış, güncelleyelim mi?").
2. **Onaysız Silme Yok:** Oturum sonunda yeni bir karar ya da ders çıktıysa `beynim/03-Kararlar.md` ya da `beynim/04-Tuzaklar.md` için öneri sun ("Bugün şu iki kararı verdik, Kararlar dosyasına ekleyeyim mi?") ve onayımla ekle. Eski kararları asla silme: değişen kararın sonuna `GEÇERSİZ (YYYY-MM-DD)` yaz, yenisini altına ekle.
3. **Gizlilik Kalkanı:** Banka ya da gelir-gider bilgisi, sağlık kaydı, şifre, API anahtarı ya da müşterinin gizli belgesini görürsen bu klasöre asla yazma ve beni uyar.

"Bunu hafızaya kaydetme" dersem o konuşmadan hiçbir şey kaydetme. Konuşmadan çıkardığın bir gözlem ("kısa cevap seviyor") kural değildir: önce bana öner, onaylarsam `beynim/05-Calisma-Tarzim.md` dosyasına ekle.
```

Bu yolda işi yalnız bu talimat yapar: yapay zeka dosyaları okur, karar ve ders
önerir, onayınla yazar. Oturum özetleri, silme koruması ve güncelleme için
otomatik kuruluma geç. Kurucu aynı klasördeki dosyalarına dokunmaz; CLAUDE.md'ye
aynı kuralları taşıyan kendi bölümünü ekler.

### 2. claude.ai ya da ChatGPT Projeleri

Beş dosyayı bir Projeye ekle ve proje talimatlarına şu üç satırı yapıştır:

```
Her sohbete başlamadan önce 01-Kimlik, 02-Guncel-Durum ve 04-Tuzaklar dosyalarını oku; benim için yazarken 05-Calisma-Tarzim dosyasına uy.
İki dosya çelişirse tarihi yeni olana uy ve eski kalan satırı bana söyle: "Şu dosya eski kalmış, güncelleyelim mi?"
Sohbetin sonunda yeni bir karar ya da ders çıktıysa 03-Kararlar ya da 04-Tuzaklar dosyasına eklenecek satırı öner; değişen bir kararın eski satırını silme, sonuna GEÇERSİZ ve tarih yaz.
```

Projedeki dosyaları yapay zeka değiştiremez. Önerdiği satırı dosyaya sen ekle
ve dosyayı projeye yeniden yükle. Bu dosyalara banka ya da gelir-gider bilgisi,
sağlık kaydı, şifre, API anahtarı ya da müşterinin gizli belgesini koyma.

### 3. Otomatik kurulum

Gerekenler:

- Node.js 20 ya da üstü ([nodejs.org](https://nodejs.org)).
- Claude Code ve/veya Codex.

#### En kolay yol: tek mesaj

Notlarının duracağı klasörü Claude Code ya da Codex'te aç ve şunu yapıştır:

```
https://github.com/grafikcemm/dijital-beyin/blob/main/KURULUM.md dosyasını oku ve
Dijital Beyin'i bu klasöre kur. Klasörde var olan dosyalarıma dokunma.
```

Yapay zeka Node sürümünü kontrol eder, son sürümü geçici bir klasöre indirir,
kurar ve `doktor` ile doğrular. Senden hiçbir API anahtarı istemez; isterse
durdur.

#### Elle kurulum

1. Son sürümü indir: ya `git clone https://github.com/grafikcemm/dijital-beyin.git`
   ya da [Releases](https://github.com/grafikcemm/dijital-beyin/releases/latest)
   sayfasından "Source code (zip)" dosyasını indirip aç. Bu klasör yalnız
   kurucudur; notların burada durmaz.
2. Kurucuyu çalıştır, `--hedef` notlarının duracağı klasör olsun:

   Windows:
   ```
   node kur.mjs --hedef "C:\Notlar\Beynim"
   ```
   macOS / Linux:
   ```
   node kur.mjs --hedef "$HOME/Notlar/Beynim"
   ```
   Codex da kullanıyorsan sona `--istemci claude,codex` ekle. Önce ne
   yazılacağını görmek istersen `--plan` ekle; hiçbir şey yazılmaz.
3. Kurucunun indirildiği klasörü sonra silebilirsin.

Klasörde zaten dosyalar varsa üzerlerine yazılmaz; yalnız eksik olanlar
eklenir. Kurucuyu aynı klasöre tekrar çalıştırmak güvenlidir.

Hedef klasörde kurulumdan önce `sistem/` klasörü ya da `beyin.mjs` dosyası
varsa kurucu durur, çünkü bunlar güncellemede yenilenen adlardır. Boş bir
klasör seç; ya da `--uzerine-yaz` ekle, o zaman eskileri önce
`.beyin/yedek/` altına yedeklenir.

## İlk konuşma

1. Claude Code'da doğrudan kasa klasörünü aç. Proje kökü tam olarak bu klasör
   olmalı; bir üst klasörü açarsan kancalar çalışmaz.
2. Yeni bir oturum başlat.
3. İlk mesaj olarak şunu dene: "Beynimdeki dosyaları oku ve benim hakkımda ne
   bildiğini üç maddede söyle. Eksik olanları bana sor."
4. `beynim/` içindeki beş dosyayı birlikte doldurun.

## Klasör düzeni

| Klasör / dosya | Ne için |
|---|---|
| `beynim/01-Kimlik.md` | Kim olduğun, ne iş yaptığın |
| `beynim/02-Guncel-Durum.md` | Bu haftanın tablosu, değişen rakamlar, aktif projeler |
| `beynim/03-Kararlar.md` | Tarihli kararların; eskisi silinmez, GEÇERSİZ işaretlenir |
| `beynim/04-Tuzaklar.md` | Bir daha düşmek istemediğin hatalar |
| `beynim/05-Calisma-Tarzim.md` | Dil, ton ve çalışma biçimin |
| `notlar/` | Serbest notlar |
| `gunluk/` | Otomatik oturum özetleri |
| `gelen-kutusu/` | Onayını bekleyen öneriler |
| `CLAUDE.md`, `AGENTS.md` | Oturum köprüsü; işaretli bölüm sistemindir, geri kalanı senin |
| `sistem/`, `beyin.mjs` | Sistem dosyaları; güncellemede yenilenir |

## Günlük kullanım

Claude Code'da (ve kancalara güven onayı verdiysen Codex'te) şunlar kendiliğinden olur:

- **Oturum başı:** güncel durum, kimlik, tuzaklar, çalışma tarzın, geçerli
  kararlar ve son oturum özetleri kısa bir bağlam olarak oturuma eklenir. Bu
  adım model kullanmaz.
- **Oturum sonu:** konuşmanın kısa özeti `gunluk/YYYY-MM-DD.md` dosyasına yazılır.
  Parola, anahtar, kart numarası gibi şeyler yazılmadan önce gizlenir. Bir
  konuşmanın kaydedilmesini istemiyorsan mesajına `[kaydetme]` yaz ya da
  "bunu hafızaya kaydetme" de.
- **Karar ve ders önerisi:** oturumda yeni bir karar ya da ders çıktıysa yapay
  zeka sonunda önerir; sen onaylarsan `03-Kararlar.md` ya da `04-Tuzaklar.md`
  dosyasına ekler. "Bu kararı kaydet" demen de onay sayılır.
- **Karar dosyası koruması:** yapay zeka `03-Kararlar.md` dosyasından ya da
  günlükten satır silmeye kalkarsa engellenir; yalnız ekleme ve satır sonuna
  GEÇERSİZ yazma serbesttir.

## Komutlar

Kasa klasöründe çalıştır:

| Komut | Ne yapar |
|---|---|
| `node beyin.mjs ara "kararlar"` | Notlarda arar (Türkçe eklere ve aksansız yazıma duyarlı) |
| `node beyin.mjs baglam` | Oturum başı bağlamını gösterir |
| `node beyin.mjs doktor` | Her parçanın çalışıp çalışmadığını kontrol eder |
| `node beyin.mjs guncelle` | Son sürümü kurar |
| `node beyin.mjs guncelle --kontrol` | Yalnız yeni sürüm var mı diye bakar |
| `node beyin.mjs geri-al` | Son güncellemeyi geri alır |
| `node beyin.mjs onar` | Yönetilen bölümleri ve kancaları yeniden yazar |
| `node beyin.mjs onar --istemci claude,codex` | Codex'i sonradan ekler |
| `node beyin.mjs tercih` | Tercihleri gösterir; `tercih <anahtar> <değer>` değiştirir |
| `node beyin.mjs surum` | Kurulu sürümü gösterir |

## Güncelleme

`node beyin.mjs guncelle` GitHub'daki son sürümü indirir ve kurar. Yalnız
`sistem/` ve `beyin.mjs` değişir. `CLAUDE.md`, `AGENTS.md` ve `.gitignore`
içinde yalnız `dijital-beyin` işaretleri arasındaki bölüm yenilenir; senin
yazdıkların korunur. `beynim/`, `notlar/`, `gunluk/`, `gelen-kutusu/` ve
`.beyin/tercihler.json` asla değişmez.

Güncellemeden önce yedek alınır. Yeni sürüm kendi kontrolünden geçemezse
kendini geri alır; elle geri dönmek için `node beyin.mjs geri-al`.

Güncelleme yarıda kesilirse (bilgisayar kapandı, pencereyi kapattın) bir sonraki
`node beyin.mjs` komutu bunu fark eder ve önce yedeği geri yükler. Yine de hiçbir
komut açılmıyorsa kurucuyu aynı klasöre yeniden çalıştır:
`node kur.mjs --hedef "<kasa klasörün>"`. Notlarına ve kararlarına dokunulmaz.

Dürüst bir not: indirilen paket, yanındaki `.sha256` dosyasıyla karşılaştırılır.
İkisi de aynı yerden geldiği için bu indirmenin **bozulmadığını** gösterir,
paketi **kimin yayınladığını** kanıtlamaz. GitHub hesabına güvendiğin ölçüde
güvenebilirsin.

### 1.x'ten 2.0'a

`node beyin.mjs guncelle` ile geçersin. Dosyaların yeniden adlandırılmaz:
`ben-kimim.md`, `guncel-durum.md`, `aktif-projem.md` ve `verdigim-kararlar.md`
okunmaya ve korunmaya devam eder. Davranışta iki şey değişir:

- Yapay zeka yeni kararı artık kendiliğinden yazmaz; oturum sonunda önerir, sen
  onaylarsan ekler.
- İki not çelişince eski kalan satırı sana söyler ve güncellemeyi önerir.

Aynı not hem eski hem yeni adla durursa (örneğin hem `guncel-durum.md` hem
`02-Guncel-Durum.md`), oturum başında yalnız yeni adlı olan okunur ve yapay
zeka bunu sana söyler. Hangisinin kalacağına sen karar verirsin. Koruma,
yapay zekanın `beynim/` içinde dosya silmesine ya da adını değiştirmesine
izin vermez; bunu sen yaparsın. İstersen yapay zeka senin onayınla bir
dosyanın içeriğini ötekine kopyalar.

Yeni iki dosyayı (`04-Tuzaklar.md`, `05-Calisma-Tarzim.md`) da istersen son
sürümü indirip kurucuyu aynı klasöre yeniden çalıştır. Yalnız eksik dosyalar
eklenir; 1.x karşılığı olan bir dosya (örneğin `ben-kimim.md` varken
`01-Kimlik.md`) eklenmez, yani genelde yalnız bu ikisi gelir. İstemezsen de
olur: yapay zeka ilk dersi senin onayınla yazarken `04-Tuzaklar.md`
dosyasını kendisi açar.

Notlarındaki `<!-- … -->` açıklamaları artık oturum başı bağlamına girmez;
dosyalarında olduğu gibi kalırlar.

## Codex

Codex iki onay ister ve ikisi de atlanamaz. Kurulumdan sonra Codex'i kasa
klasöründe aç:

1. Codex klasöre güvenip güvenmediğini sorarsa güven. Güvenilmeyen klasörde
   Codex `.codex/` altındaki kancaları hiç yüklemez.
2. `/hooks` yaz ve üç kancaya (oturum başı, durma, koruma) güven onayı ver.

Onay vermezsen Codex dosyaları
yalnız `AGENTS.md`'deki talimatla, `node beyin.mjs baglam` çalıştırarak okur.
Kasa klasörünü taşırsan `node beyin.mjs onar` çalıştır; Codex kancaları tam yol
kullanır.

## Gizlilik

- Her şey senin bilgisayarında kalır. Telemetri yok, hesap yok.
- Kendiliğinden yapılan tek ağ isteği, günde en fazla bir kez GitHub'da yeni
  sürüm olup olmadığına bakmaktır. Kapatmak için:
  `node beyin.mjs tercih guncelleme_bildirimi kapali`
- `guncelle` komutunu çalıştırdığında paket GitHub'dan indirilir.
- Not dosyaların yapay zeka istemcine (Claude, ChatGPT) gider; bu, o hizmetin
  kendi gizlilik koşullarına tabidir.
- Kasayı yedek için git'e koyarsan `gunluk/` da gider. Gizleme süzgeci yaygın
  parola ve anahtar biçimlerini yakalar ama her şeyi yakalayamaz; kasayı
  herkese açık bir depoya koyma.

## Sınırlar

- Karar dosyası koruması bir güvenlik sınırı değil, kaza önleyicidir. Kararlı
  bir yapay zeka ya da sen, dosyayı başka yollarla yine değiştirebilirsiniz.
- Bu sürümde model ile özet derleme yok; oturum özetleri modelsiz, kısa ve
  kabadır. Anlamsal arama da yok; arama kelime tabanlıdır.
- Kancalar bilgisayarın açıkken ve istemci bu klasörde çalışırken çalışır.
- Birden fazla bilgisayar arasında eşitleme yapmaz.

## Hazırlayan

Ali Cem Bozma — Grafikcem, grafik tasarımcı. YouTube: [@alicem_ai](https://www.youtube.com/@alicem_ai).

## Lisans

MIT. Bkz. [LICENSE](LICENSE).
