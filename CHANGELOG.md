# Değişiklik günlüğü

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
