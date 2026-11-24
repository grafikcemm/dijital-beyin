# Değişiklik günlüğü

## 2.0.0 — 2026-11-24

Beş dosya ve CLAUDE.md köprüsü.

- `beynim/` artık beş dosyayla başlar: `01-Kimlik.md`, `02-Guncel-Durum.md`, `03-Kararlar.md`, `04-Tuzaklar.md` ve `05-Calisma-Tarzim.md`. Aktif proje bilgisi `02-Guncel-Durum.md` içine taşındı. `04-Tuzaklar.md` iki örnek satırla gelir.
- `CLAUDE.md` ve `AGENTS.md` içindeki yönetilen bölüm bir oturum köprüsüne dönüştü: her oturumun başında kimlik, güncel durum ve tuzaklar okunur; üç temel kural geçerlidir (çelişki ve tarih kontrolü, onaysız silme yok, gizlilik kalkanı).
- Davranış değişikliği: yapay zeka yeni bir kararı ya da dersi artık kendiliğinden yazmaz. Oturum sonunda önerir, sen onaylarsan ekler; "bu kararı kaydet" demen de onay sayılır. İki not çelişince eski kalan satırı sana söyler.
- Oturum başı bağlamı tuzakları ve çalışma tarzını da içerir. Notlardaki `<!-- … -->` açıklamaları artık bağlama girmez ve yer kaplamaz; dosyada kalırlar. Bu 1.x kasalarını da kapsar. Silme koruması `03-Kararlar.md` dosyasında da çalışır.
- README'de kurulumsuz iki yol var: Claude Code ya da Codex için kopyalanabilir CLAUDE.md, claude.ai ve ChatGPT Projeleri için üç satırlık talimat.
- Örnek kasa (`ornek/elif/`) yeni düzene geçti.
- 1.x kuranlar `node beyin.mjs guncelle` ile geçer. Dosya adları değişmez: `ben-kimim.md`, `guncel-durum.md`, `aktif-projem.md` ve `verdigim-kararlar.md` okunmaya ve korunmaya devam eder. Yeni iki dosyayı istersen son sürümü indirip kurucuyu aynı klasöre yeniden çalıştır; yalnız eksik olanlar eklenir. Aynı not hem eski hem yeni adla durursa yapay zeka bunu oturum başında sana söyler.

## 1.0.2 — 2026-10-20

- Belgeler sadeleşti: `NOTICE.md` kaldırıldı, README'nin son bölümü "Hazırlayan" oldu.
- Kod değişmedi; 1.0.1 kuranlar `node beyin.mjs guncelle` ile geçebilir, notlarına dokunulmaz.

## 1.0.1 — 2026-10-17

- `[kaydetme]` ile kayıt dışı bırakılan oturumların işaretleri artık birikmiyor: yeni bir işaret yazılırken 30 günden eski olanlar silinir.
- Güncelleme hattının ilk gerçek denemesi: 1.0.0 kuranlar `node beyin.mjs guncelle` ile bu sürüme geçer; notlarına dokunulmaz.

## 1.0.0 — 2026-10-17

İlk sürüm.

- Tek komutla kurulum: `node kur.mjs --hedef "<klasör>"`; var olan dosyaların üzerine yazılmaz, `--plan` ile önce ne yazılacağı görülür. Hedefte önceden `sistem/` ya da `beyin.mjs` varsa kurucu durur; `--uzerine-yaz` önce yedekler.
- `beynim/` altında dört başlangıç dosyası (ben kimim, aktif proje, kararlar, güncel durum) ve doldurulmuş bir örnek (`ornek/elif/`).
- Claude Code ve Codex kancaları: oturum başında modelsiz bağlam, oturum sonunda `gunluk/` altına kısa özet.
- Gizlilik süzgeci: parola, anahtar, kart numarası, IBAN gibi bilgiler günlüğe yazılmadan gizlenir; `[kaydetme]` ile konuşma kayıt dışı kalır.
- Karar dosyası ve günlük için silme koruması (kaza önleyici, güvenlik sınırı değil).
- Türkçe eklere ve aksansız yazıma duyarlı BM25 araması: `node beyin.mjs ara`.
- `doktor`: her katmanın son çalışmasını ve sağlığını gösterir.
- Sürüm tabanlı güncelleme: `guncelle`, `guncelle --kontrol`, `geri-al`; kullanıcı dosyalarına dokunmaz, bozuk güncelleme kendini geri alır, yarıda kalan güncelleme bir sonraki komutta yedekten geri yüklenir.
- `CLAUDE.md`, `AGENTS.md` ve `.gitignore` içinde yalnız işaretli bölüm yönetilir; geri kalanı senindir.
