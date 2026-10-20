# Dijital Beyin

Kendi bilgisayarına kurduğun, yapay zekânın seni her oturumda hatırlamasını
sağlayan bir not klasörü. Kim olduğun, ne üzerinde çalıştığın ve hangi
kararları verdiğin birkaç düz metin dosyasında durur. Claude Code ya da Codex
bu klasörde açıldığında dosyalar oturumun başında kendiliğinden okunur, oturum
bitince kısa bir özet günlüğe yazılır. Notların bizim bir sunucumuza gitmez;
hepsi senin diskinde, senin dosyalarında.

## Kimin için

Her yeni sohbette kendini baştan anlatmaktan yorulan, yapay zekâyla düzenli
çalışan herkes için: tasarımcılar, yazarlar, serbest çalışanlar, küçük ekipler.
Programcı olman gerekmez; kurulumu yapay zekâna da yaptırabilirsin.

## Gerekenler

- Node.js 20 ya da üstü ([nodejs.org](https://nodejs.org)).
- Claude Code ve/veya Codex (otomatik okuma ve yazma için).

Bunlar olmadan da işe yarar: `beynim/` içindeki dosyaları claude.ai ya da
ChatGPT'de bir Projeye ekle. İlk mesajın "Önce bu dosyaları oku, çelişkide
tarihi yeni olana uy ve bana sor" olsun; dosyaları güncelledikçe yeniden yükle.

## En kolay kurulum: tek mesaj

Notlarının duracağı klasörü Claude Code ya da Codex'te aç ve şunu yapıştır:

```
https://github.com/grafikcemm/dijital-beyin/blob/main/KURULUM.md dosyasını oku ve
Dijital Beyin'i bu klasöre kur. Klasörde var olan dosyalarıma dokunma.
```

Yapay zekâ Node sürümünü kontrol eder, son sürümü geçici bir klasöre indirir,
kurar ve `doktor` ile doğrular. Senden hiçbir API anahtarı istemez; isterse
durdur.

## Elle kurulum

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
4. `beynim/` dosyalarını birlikte doldurun. Doldurulmuş bir örnek için
   `ornek/elif/` klasörüne bak.

## Klasör düzeni

| Klasör / dosya | Ne için |
|---|---|
| `beynim/ben-kimim.md` | Kim olduğun, nasıl konuşulmasını istediğin |
| `beynim/aktif-projem.md` | Şu anki ana projen |
| `beynim/verdigim-kararlar.md` | Tarihli kararların; eskisi silinmez, GEÇERSİZ işaretlenir |
| `beynim/guncel-durum.md` | Bu haftanın tablosu |
| `notlar/` | Serbest notlar |
| `gunluk/` | Otomatik oturum özetleri |
| `gelen-kutusu/` | Onayını bekleyen öneriler |
| `sistem/`, `beyin.mjs` | Sistem dosyaları; güncellemede yenilenir |

## Günlük kullanım

Claude Code'da (ve kancalara güven onayı verdiysen Codex'te) şunlar kendiliğinden olur:

- **Oturum başı:** güncel durum, aktif proje, ben kimim, geçerli kararlar ve son
  oturum özetleri kısa bir bağlam olarak oturuma eklenir. Bu adım model
  kullanmaz.
- **Oturum sonu:** konuşmanın kısa özeti `gunluk/YYYY-MM-DD.md` dosyasına yazılır.
  Parola, anahtar, kart numarası gibi şeyler yazılmadan önce gizlenir. Bir
  konuşmanın kaydedilmesini istemiyorsan mesajına `[kaydetme]` yaz.
- **Karar dosyası koruması:** yapay zekâ `verdigim-kararlar.md` dosyasından ya
  da günlükten satır silmeye kalkarsa engellenir; yalnız ekleme ve satır sonuna
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
- Not dosyaların yapay zekâ istemcine (Claude, ChatGPT) gider; bu, o hizmetin
  kendi gizlilik koşullarına tabidir.
- Kasayı yedek için git'e koyarsan `gunluk/` da gider. Gizleme süzgeci yaygın
  parola ve anahtar biçimlerini yakalar ama her şeyi yakalayamaz; kasayı
  herkese açık bir depoya koyma.

## Sınırlar

- Karar dosyası koruması bir güvenlik sınırı değil, kaza önleyicidir. Kararlı
  bir yapay zekâ ya da sen, dosyayı başka yollarla yine değiştirebilirsiniz.
- Sürüm 1.0'da model ile özet derleme yok; oturum özetleri modelsiz, kısa ve
  kabadır. Anlamsal arama da yok; arama kelime tabanlıdır.
- Kancalar bilgisayarın açıkken ve istemci bu klasörde çalışırken çalışır.
- Birden fazla bilgisayar arasında eşitleme yapmaz.

## Hazırlayan

Ali Cem Bozma — Grafikcem, grafik tasarımcı. YouTube: [@grafikcem](https://www.youtube.com/@grafikcem).

## Lisans

MIT. Bkz. [LICENSE](LICENSE).
