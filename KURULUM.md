# Oktan Hesap Takip — Kurulum

Bu klasör, Claude'daki "Oktan Hesap Takip" sayfasının bağımsız web sitesi hâlidir.
Kurulum için ücretli bir hizmet ya da bilgisayarına program yüklemek gerekmez.
Her şey tarayıcıdan yapılır.

| Parça | Ne işe yarar | Ücret |
|---|---|---|
| **GitHub Pages** | Siteyi yayınlar (`kullanici.github.io/...` ya da kendi alan adın) | Ücretsiz |
| **Firebase** (Firestore + Authentication) | Kayıtların ve Google ile giriş. Sadece senin e-postan girebilir | Ücretsiz (Spark planı) |
| **GitHub Actions** | Altın, gümüş ve fon fiyatlarını 20 dakikada bir çeker | Ücretsiz (açık depoda sınırsız) |
| **Google Gemini** | Ekstre fotoğrafı ve PDF okuma | Ücretsiz katman |

Kurulum yaklaşık 30–40 dakika sürer.

---

## 1. GitHub deposu

1. <https://github.com> adresinde hesap aç ya da giriş yap.
2. Sağ üstteki **+** düğmesinden **New repository** seç. Adı örneğin `oktan-hesap` olsun, **Public** seç ve **Create repository** ile oluştur.
   - Depo herkese açık olsa da içinde hiçbir kişisel veri yok. Kayıtların Firebase'de durur ve onları sadece senin hesabın görebilir.
3. **uploading an existing file** bağlantısına tıkla. Bu klasördeki dosyaları sürükleyip bırak: `index.html`, `config.js`, `firestore.rules`, `KURULUM.md`, `updater` klasörü. Sonra **Commit changes** ile kaydet.
4. `.github` klasörü Mac/Windows'ta gizli olduğu için sürüklemede atlanabilir. O yüzden şu şekilde ekle:
   - **Add file → Create new file**.
   - Dosya adı kutusuna tam olarak `.github/workflows/prices.yml` yaz.
   - Bu klasördeki `.github/workflows/prices.yml` dosyasının içeriğini yapıştır ve **Commit** ile kaydet.

> ⚠️ `oktan-yedek-….json` yedek dosyasını **GitHub'a yükleme**. O dosyada kişisel kayıtların var ve sadece 8. adımda siteye yüklenecek.

## 2. Firebase projesi

1. <https://console.firebase.google.com> adresine Google hesabınla gir. **Proje oluştur**'a bas, adı örneğin `oktan-hesap` olsun. Google Analytics'i kapatabilirsin.
2. **Authentication** bölümünde:
   - **Başlayın**'a bas.
   - **Sign-in method** sekmesinde **Google**'ı seç, **Etkinleştir**'i aç, destek e-postanı seç ve **Kaydet**'e bas.
3. **Firestore Database** bölümünde:
   - **Veritabanı oluştur**'a bas ve **Production mode** seç.
   - Konum olarak `eur3 (europe-west)` ya da `europe-west1` seç.
4. Firestore'da **Kurallar (Rules)** sekmesini aç:
   - İçindekileri sil ve bu klasördeki `firestore.rules` dosyasının içeriğini yapıştır.
   - `SENIN_EPOSTAN@gmail.com` yerine giriş yapacağın Gmail adresini yaz.
   - **Yayınla**'ya bas.

## 3. Siteyi Firebase'e bağla (config.js)

1. Firebase'de sol üstteki ⚙️ simgesinden **Proje ayarları**'nı aç ve **Genel** sekmesinde aşağı in.
2. **Uygulamalarınız** bölümünde **</>** (Web) simgesine bas. Takma ad olarak `oktan` yaz. Hosting kutusunu işaretleme. Sonra **Uygulamayı kaydet**'e bas.
3. Çıkan `firebaseConfig = { … }` bloğundaki değerleri kopyala.
4. GitHub'da depodaki `config.js` dosyasını aç, ✏️ (düzenle) simgesine bas.
5. `BURAYA_API_KEY`, `PROJE-ADI` gibi yer tutucuların yerine kopyaladığın değerleri yaz ve **Commit changes** ile kaydet.

## 4. Siteyi yayınla (GitHub Pages)

1. Depoda **Settings → Pages** bölümüne git.
2. **Source** olarak **Deploy from a branch** seç. **Branch** olarak `main` ve `/ (root)` seç, sonra **Save**'e bas.
3. 1–2 dakika sonra adres yukarıda görünür, örneğin `https://KULLANICI.github.io/oktan-hesap/`.
4. Firebase'de **Authentication → Settings → Authorized domains** bölümüne git. **Add domain** ile `KULLANICI.github.io` adresini ekle. Bu adım yapılmazsa Google ile giriş çalışmaz.

### Kendi alan adın (isteğe bağlı)

1. Alan adını aldığın firmanın DNS panelinde bir **CNAME** kaydı aç:
   - **Ad:** örneğin `hesap`
   - **Değer:** `KULLANICI.github.io`
2. GitHub'da **Settings → Pages → Custom domain** kutusuna `hesap.alanadin.com` yaz ve **Save**'e bas.
3. Birkaç dakika sonra **Enforce HTTPS** seçeneğini işaretle.
4. Firebase'de **Authorized domains** listesine `hesap.alanadin.com` adresini de ekle.

## 5. Otomatik fiyat güncelleme (GitHub Actions)

1. Firebase'de **Proje ayarları → Hizmet hesapları** bölümüne git ve **Yeni özel anahtar oluştur**'a bas. Bir `.json` dosyası iner.
   - Bu dosya veritabanına tam erişim verir. Kimseyle paylaşma, GitHub'a dosya olarak yükleme.
2. GitHub'da depoda **Settings → Secrets and variables → Actions** bölümüne git ve **New repository secret**'a bas.
   - **Name:** `FIREBASE_SERVICE_ACCOUNT`
   - **Secret:** inen `.json` dosyasını Not Defteri ile aç ve içeriğin **tamamını** yapıştır.
   - **Add secret**'a bas.
3. Depoda **Actions** sekmesini aç. "Workflows aren't being run…" uyarısı çıkarsa etkinleştir.
4. **Fiyatları güncelle → Run workflow** ile bir kez elle çalıştır.
   - Çalışma yeşil tik alırsa fiyatlar sitede görünür.
   - Çalışmanın içindeki **Summary** bölümünde neyin güncellendiği Türkçe yazar.

Güncelleme takvimi: Pazartesi–Cumartesi, İstanbul saatiyle 09:00–22:40 arasında 20 dakikada bir çalışır. GitHub yoğun saatlerde bazen birkaç dakika geç başlatır.

> GitHub, **60 gün boyunca hiç değişiklik yapılmayan** açık depolarda zamanlanmış görevleri durdurur. Durdurmadan önce e-posta gönderir. Gelirse **Actions** sekmesinden tek tıkla yeniden açabilirsin.

## 6. İlk giriş

Siteyi aç ve **Google ile giriş yap**'a bas. Kurallara yazdığın hesapla girmelisin. Başka bir hesapla girersen "erişimi yok" uyarısı görürsün.

## 7. Verilerini taşı

1. Sitede **Ayarlar → Yedekten yükle**'ye bas.
2. Sana ayrıca gönderilen `oktan-yedek-2026-10-19.json` dosyasını seç ve onayla.
3. Kartlar, harcamalar, alacaklar, ekstreler, altınlar, fonlar ve son fiyatlar yüklenir.

**Ayarlar → Yedeği indir** ile istediğin zaman yedek alabilirsin.

## 8. Fotoğraf / PDF okuma (Gemini)

1. <https://aistudio.google.com/apikey> adresinde **Create API key** ile ücretsiz bir anahtar al.
2. Sitede **Ayarlar → Gemini API anahtarı** alanına yapıştır, **Kaydet**'e bas, sonra **Anahtarı dene** ile test et.
3. **Harcamalar → + Harcama ekle** bölümünde **Fotoğraf / PDF'ten ekle** sekmesi açılır.

Bilmen gerekenler:

- Ücretsiz katmanda Google, gönderilen içeriği ürünlerini geliştirmek için kullanabilir.
- Dakikalık ve günlük istek sınırı vardır. Sınıra takılırsan biraz bekleyip yeniden dene.
- Model alanını boş bırakırsan `gemini-flash-latest` kullanılır. Bu ad kalkarsa site uygun bir Flash modelini kendisi bulur.

## 9. "Fiyatları şimdi güncelle" düğmesi (isteğe bağlı)

1. GitHub'da sağ üstteki profil resmine tıkla. **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** yolunu izle.
2. **Repository access** için **Only select repositories** seç ve `oktan-hesap` deposunu işaretle.
3. **Permissions → Repository permissions → Actions** iznini **Read and write** yap. Başka izin verme.
4. Oluşan anahtarı ve depo adını (`KULLANICI/oktan-hesap`) sitede **Ayarlar → Fiyatları elle güncelleme** bölümüne yaz.
5. Bundan sonra **Altın & Gümüş** ve **Fonlar** sekmelerinde düğme görünür.

## 10. Son ödeme hatırlatması (telefon bildirimi)

Bir kartın son ödeme günü **yarınsa** ya da **bugünse** öğlen 12:00 civarı telefonuna bildirim gelir. Son gün ekstre hâlâ ödenmemiş olarak işaretliyse 21:00, 22:00, 23:00 ve 23:30'da tekrar gelir (ödenmiş ekstreler atlanır; tutarı girilmemiş ekstre "tutar henüz girilmedi" diye yazılır).

1. Firebase konsolu → Proje ayarları → **Cloud Messaging** → "Web Push sertifikaları" → **Anahtar çifti oluştur**. Çıkan açık anahtarı `config.js` içindeki `VAPID_KEY` satırına yapıştır.
2. `FIREBASE_SERVICE_ACCOUNT` gizli değeri (fiyat güncelleyiciyle ortak) zaten tanımlıysa başka bir şey gerekmez.
3. Telefonda uygulamayı aç → ⚙ Ayarlar → **Bildirim** → **Bildirimleri aç** → izin ver. iPhone'da uygulama önce Safari'den Paylaş → **Ana Ekrana Ekle** ile eklenmeli ve Ana ekran simgesinden açılmalı (iOS 16.4 ve üstü).
4. Deneme: depo → **Actions → Son ödeme hatırlatması → Run workflow** (deneme işaretli). Birkaç dakika içinde yaklaşan ödemeleri listeleyen bir deneme bildirimi gelir.

Herkese açık depolarda GitHub, 60 gün hiç değişiklik olmazsa zamanlanmış işleri durdurur. Hatırlatma görevi her ayın 1'inde boş bir kayıt atarak hem bu görevin hem fiyat güncellemesinin durmamasını sağlar.

## 11. Claude'daki eski düzen

Yeni site sorunsuz çalıştıktan sonra Claude'daki fiyat güncelleme görevini durdurabilirsin. İstersen Claude'a "eski fiyat görevini kapat" demen yeterli.

---

### Dosyalar

- `index.html` — sitenin kendisi
- `config.js` — Firebase bağlantı ayarları (3. adım)
- `firestore.rules` — sadece senin hesabının erişmesini sağlayan kurallar (2. adım)
- `updater/` — fiyat çekici (Node.js) ve testleri (`npm test`)
- `updater/funds.json` — TEFAS'a erişilemezse kullanılacak yedek fon sayfaları. Yeni bir fon alırsan Bloomberg HT sayfasının adresini buraya ekleyebilirsin.
- `.github/workflows/prices.yml` — zamanlanmış fiyat güncelleme
- `.github/workflows/reminders.yml` + `updater/reminders.mjs` — son ödeme bildirim hatırlatması (10. adım)

### Fiyat kuralları (çekici bunlara uyar)

- **Altın ve gümüş:**
  - Bir ürün, sayfadaki "Son (SS:DD)" saati kayıtlıdan yeniyse güncellenir.
  - Piyasa açıkken 20 dakikadan eski sayfa 3 kez yeniden denenir.
  - Kayıtlı değerden %15'ten fazla sapan fiyat reddedilir.
- **Fonlar:**
  - Fiyat kayıtlıdan farklıysa ve tarihi kayıtlı tarihten eski değilse yeni kabul edilir.
  - Daha önce görülmüş eski bir fiyata eşit olan değer alınmaz.
  - Para piyasası fonlarında fiyat hiçbir zaman düşürülmez.
