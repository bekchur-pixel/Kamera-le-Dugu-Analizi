# MimikLab — Canlı Çoklu Yüz ve Duygu İfadesi Analiz Ekranı

**MimikLab**, bilgisayar kamerası (veya yüklenen fotoğraflar) üzerinden **aynı anda birden fazla kişinin** yüzünü algılayan, her kişiye kalıcı takip numarası (`Kişi 1`, `Kişi 2` vb.) atayan ve yüz ifadelerini gerçek zamanlı olarak analiz eden web tabanlı bir görüntü işleme uygulamasıdır.

Tüm yüz tespiti, 68 noktalı yüz ağı çıkarımı ve duygu sınıflandırması **tamamen tarayıcı içinde (yerel cihazda)** çalışır. Kamera görüntünüz hiçbir sunucuya gönderilmez.

---

## İçindekiler

1. [Algılanan Duygu İfadeleri](#algılanan-duygu-ifadeleri)
2. [Öne Çıkan Özellikler](#öne-çıkan-özellikler)
3. [Kurulum Gereksinimleri](#kurulum-gereksinimleri)
4. [Adım Adım Yerel Kurulum](#adım-adım-yerel-kurulum)
5. [Kullanım Kılavuzu](#kullanım-kılavuzu)
6. [Proje Dizin Yapısı](#proje-dizin-yapısı)
7. [Sık Karşılaşılan Sorunlar ve Çözümleri](#sık-karşılaşılan-sorunlar-ve-çözümleri)

---

## Algılanan Duygu İfadeleri

Uygulama, karedeki her bir yüz için aşağıdaki **7 temel ifadeyi** yüzde (`%`) olasılıklarıyla eşzamanlı hesaplar:

| İfade | Açıklama | Grafik Rengi |
| :--- | :--- | :--- |
| **Gülme / Mutlu** (`happy`) | Gülümseme ve neşe ifadeleri | Zümrüt Yeşili |
| **Üzülme / Üzgün** (`sad`) | Üzgün, düşkün ve hüzünlü ifadeler | Mavi |
| **Sinir / Kızgın** (`angry`) | Çatık kaş, gergin çene ve öfke ifadeleri | Kırmızı / Gül |
| **Şaşkın** (`surprised`) | Açık ağız ve kalkık kaş ile şaşırma | Kehribar |
| **Korkmuş** (`fearful`) | Gergin göz ve korku ifadeleri | Mor |
| **Tiksinmiş** (`disgusted`) | Burun/üst dudak büzülmesi | Açık Yeşil |
| **Nötr** (`neutral`) | Belirgin duygu içermeyen doğal duruş | Gri |

---

## Öne Çıkan Özellikler

- **Çoklu Yüz Algılama ve Kişi Takibi:** Tek bir karede birden fazla kişiyi algılar, her kişiyi konumuna göre takip ederek `Kişi 1`, `Kişi 2`, `Kişi 3` şeklinde numaralandırır ve yüz kesitini (thumbnail) kartta gösterir.
- **Genel Duygu Dağılımı Grafiği (Dairesel / Çubuk):** Yan panelin üst bölümünde, o anda tespit edilen tüm yüzlerin ortalama duygu oranlarını **Dairesel (Halka)** veya **Çubuk** grafik olarak anlık görüntüler.
- **Canlı Zaman Çizelgesi:** Son 60 örnekleme boyunca grubun gülme, üzülme, sinir, şaşkınlık ve nötr ifadelerinin zamana bağlı değişimini interaktif çizgi grafikte izler.
- **68 Noktalı Yüz Ağı ve Çerçeve Katmanı:** Göz, kaş, burun, dudak ve çene hattını canlı olarak video üzerine çizer; istenirse tek tıkla açılıp kapatılabilir.
- **Kamerasız Test Seçenekleri:** Kameranız yoksa veya izin vermek istemiyorsanız **Örnek Grup** (3 kişilik hazır test sahnesi) veya **Görsel Yükle** modlarıyla çoklu yüz analizini hemen deneyebilirsiniz.
- **Dışa Aktarım:** Analiz çerçeveli anlık görüntüyü **PNG** olarak indirebilir, ifade değişim geçmişini ise Excel uyumlu **CSV** dosyası olarak kaydedebilirsiniz.

---

## Kurulum Gereksinimleri

Uygulamayı kendi bilgisayarınızda çalıştırmak için aşağıdakilerin kurulu olması gerekir:

- **Node.js:** v18.0 veya üzeri (v20+ önerilir)
- **npm:** v9.0 veya üzeri (Node.js ile birlikte gelir)
- **Modern Tarayıcı:** Google Chrome, Microsoft Edge, Firefox veya Safari (WebGL desteği etkin olmalıdır)
- **Kamera:** Canlı analiz için dahili veya harici web kamerası

---

## Adım Adım Yerel Kurulum

### 1. Proje Dosyalarını Hazırlayın

Proje klasörüne terminal (Komut İstemi / PowerShell / Terminal) üzerinden geçiş yapın:

```bash
cd mimiklab
```

### 2. Bağımlılıkları Yükleyin

`package.json` içindeki tüm kütüphaneleri (`React`, `Vite`, `Tailwind CSS`, `@vladmandic/face-api`, `lucide-react`) kurun:

```bash
npm install
```

### 3. Yüz Analiz Modellerini Doğrulayın

Uygulama yüz tespiti ve duygu analizi için ağırlık dosyalarını `/public/models` klasöründen yükler. Kurulum sonrasında bu klasörün aşağıdaki 10 dosyayı içerdiğinden emin olun:

- `tiny_face_detector_model-weights_manifest.json` ve `.bin`
- `ssd_mobilenetv1_model-weights_manifest.json` ve `.bin`
- `face_landmark_68_tiny_model-weights_manifest.json` ve `.bin`
- `face_landmark_68_model-weights_manifest.json` ve `.bin`
- `face_expression_model-weights_manifest.json` ve `.bin`

Eğer `public/models` klasörü boşsa veya eksikse, paket içinden kopyalamak için şu komutu çalıştırabilirsiniz (Linux/macOS):

```bash
mkdir -p public/models && cp node_modules/@vladmandic/face-api/model/tiny_face_detector_model* node_modules/@vladmandic/face-api/model/ssd_mobilenetv1_model* node_modules/@vladmandic/face-api/model/face_landmark_68_tiny_model* node_modules/@vladmandic/face-api/model/face_landmark_68_model* node_modules/@vladmandic/face-api/model/face_expression_model* public/models/
```

Windows PowerShell kullanıyorsanız:

```powershell
New-Item -ItemType Directory -Force -Path public/models | Out-Null
Copy-Item node_modules/@vladmandic/face-api/model/tiny_face_detector_model*, node_modules/@vladmandic/face-api/model/ssd_mobilenetv1_model*, node_modules/@vladmandic/face-api/model/face_landmark_68_tiny_model*, node_modules/@vladmandic/face-api/model/face_landmark_68_model*, node_modules/@vladmandic/face-api/model/face_expression_model* public/models/
```

### 4. Geliştirme Sunucusunu Başlatın

```bash
npm run dev
```

Sunucu varsayılan olarak **3000** portunda açılır. Tarayıcınızda şu adresi açın:

```text
http://localhost:3000
```

> **Önemli Güvenlik Notu:** Tarayıcılar güvenlik gereği yalnızca `http://localhost` veya **HTTPS** sertifikalı alan adlarında kamera erişimine (`navigator.mediaDevices.getUserMedia`) izin verir. Uygulamayı yerel ağdaki başka bir bilgisayardan IP adresiyle (`http://192.168.x.x:3000`) açarsanız tarayıcı kamerayı engelleyebilir; bunun için HTTPS kullanmanız gerekir.

### 5. Üretim (Production) Derlemesi Alma (Opsiyonel)

Uygulamayı bir web sunucusunda yayınlamak için statik derleme alabilirsiniz:

```bash
npm run build
```

Derleme çıktısı `dist/` klasörüne oluşturulur. Oluşan derlemeyi yerel olarak önizlemek için:

```bash
npm run preview
```

Tip kontrolü (`TypeScript`) çalıştırmak için:

```bash
npm run lint
```

---

## Kullanım Kılavuzu

### 1. Analiz Kaynağını Seçme (Üst Menü)

Ekranın üst çubuğunda üç farklı çalışma modu yer alır:

- **Canlı Kamera:** Bilgisayar kamerasını kullanarak gerçek zamanlı çoklu yüz analizi yapar. Sağ üstteki **Kamerayı Başlat** butonuna bastığınızda tarayıcı kamera izni ister; **İzin Ver** seçeneğini onaylayın.
- **Örnek Grup:** Kamerası olmayan sistemlerde veya birden fazla duyguyu (gülme, sinir, üzülme) aynı karede test etmek için hazır 3 kişilik sahneyi yükler.
- **Görsel Yükle:** Bilgisayarınızdan bir grup fotoğrafı veya portre seçerek statik fotoğraf üzerinde çoklu yüz analizi yapmanızı sağlar.

### 2. Görüntü Alanı ve Alt Kontrol Çubuğu

Video veya fotoğraf alanının hemen altında analiz motorunu özelleştirebileceğiniz araçlar bulunur:

- **Kamera Seçimi:** Bilgisayarınızda birden fazla kamera (örneğin dahili kamera + harici USB webcam) bağlıysa açılır listeden geçiş yapabilirsiniz.
- **Algılama Modu:**
  - **Hızlı Algılama (`TinyFaceDetector`):** Düşük işlemci/GPU yükü ile yüksek FPS sunar. Günlük canlı kamera kullanımı için önerilir.
  - **Yüksek Hassasiyet (`SSD MobileNet v1`):** Daha uzak, küçük veya kalabalık sahnelerdeki yüzleri daha kararlı yakalar; ilk seçildiğinde ek model dosyasını yükler.
- **Eşik (`%20 - %80`):** Yüz algılama güven eşiğidir. Yanlış algılamaları azaltmak için eşiği yükseltebilir (`%55–%65`), loş ortamlarda veya uzaktaki yüzler için düşürebilirsiniz (`%30–%40`).
- **Ayna:** Ön kamera görüntüsünü yatay eksende çevirir (canlı kamera modunda aktif olur).
- **Çerçeve:** Yüzlerin etrafındaki köşe çerçevelerini ve anlık baskın ifade etiketini gizler veya gösterir.
- **Yüz Ağı:** 68 adet yüz referans noktasını (kaş, göz, burun, dudak, çene çizgileri) açıp kapatır.
- **Duraklat / Devam Et & Kareyi İndir:** Video üst çubuğundan canlı akışı durdurabilir veya üzerindeki analiz çizimleriyle birlikte **PNG** ekran görüntüsü indirebilirsiniz.

### 3. Sağ Analiz Paneli ve Grafikler

- **Üst Özet Şeridi:** Karedeki toplam kişi sayısını (`Algılanan Kişi`) ve grubun genel baskın ifadesini gösterir.
- **Genel Duygu Dağılımı:**
  - Tüm yüzlerin anlık ortalama duygu yüzdelerini gösterir.
  - Sağ üstündeki **Dairesel / Çubuk** düğmeleriyle görünüm değiştirebilirsiniz.
  - Dairesel grafikte dilimlerin üzerine geldiğinizde ilgili duygunun tam yüzdesi grafiğin ortasında vurgulanır.
- **Kişi Bazlı İfade Dağılımı:**
  - Algılanan her kişi (`Kişi 1`, `Kişi 2`, ...) için ayrı bir kart listelenir.
  - Kartın üzerine tıkladığınızda o kişi ana video ekranında **camgöbeği (cyan)** renkle vurgulanır; tekrar tıklayarak seçimi kaldırabilirsiniz.
- **Canlı İfade Zaman Çizelgesi (Video Altı):**
  - Son 60 örnekleme boyunca duyguların zaman içindeki seyrini çizer.
  - Grafik üzerindeki butonlara tıklayarak istediğiniz duygu eğrisini gizleyebilir/gösterebilirsiniz. Fareyi grafik üzerinde gezdirdiğinizde o saniyeye ait sayısal değerler alt satırda listelenir.
- **İfade Değişim Kaydı:**
  - Kişilerin belirgin duygu değişimlerini (`Saat · Kişi · İfade · Güven %`) kronolojik olarak kaydeder.
  - **CSV** butonuyla kayıtları tablo dosyası olarak indirebilir, **Temizle** butonuyla geçmişi sıfırlayabilirsiniz.

---

## Proje Dizin Yapısı

```text
├── public/
│   └── models/                         # Yerel çalışan face-api.js model ağırlıkları
├── src/
│   ├── assets/images/                  # Örnek çoklu kişi test görseli
│   ├── components/
│   │   ├── ExpressionTimelineChart.tsx # Canlı çoklu seri SVG zaman çizelgesi
│   │   ├── GroupEmotionDistribution.tsx# Dairesel (pie/donut) ve çubuk duygu grafiği
│   │   └── PersonInspectorCard.tsx     # Kişi bazlı yüz kesiti ve 7 ifade çubuğu
│   ├── types/
│   │   └── expressions.ts              # Duygu tipleri, renkler ve Türkçe etiketler
│   ├── utils/
│   │   └── faceEngine.ts               # Çoklu yüz algılama, ID takibi ve Canvas çizimi
│   ├── App.tsx                         # Ana analiz ekranı ve kamera/görsel yönetimi
│   ├── index.css                       # Tailwind v4 yapılandırması ve font ayarları
│   └── main.tsx                        # React giriş noktası
├── index.html                          # Sayfa başlığı, meta bilgileri ve font bağlantıları
├── metadata.json                       # Uygulama adı ve kamera izin beyanı
├── package.json                        # Bağımlılıklar ve npm komutları
└── vite.config.ts                      # Vite yapılandırması
```

---

## Sık Karşılaşılan Sorunlar ve Çözümleri

- **"Kamera izni reddedildi" uyarısı alıyorum:**
  Tarayıcınızın adres çubuğunun solundaki kilit/kamera simgesine tıklayın, **Kamera** iznini **İzin Ver** olarak değiştirin ve sayfayı yenileyin.
- **"Bağlı bir kamera algılanamadı" uyarısı alıyorum:**
  Kameranızı başka bir program (Zoom, Teams, Discord vb.) kullanıyor olabilir veya sistemde kamera bulunmuyor olabilir. Diğer uygulamaları kapatıp tekrar deneyin; test için **Örnek Grup** modunu kullanabilirsiniz.
- **Yüzler algılanmıyor veya kesik kesik algılanıyor:**
  - Ortam ışığının yüzleri önden aydınlattığından emin olun.
  - Alt araç çubuğundaki **Eşik** kaydırıcısını `%35`–`%40` seviyesine çekin.
  - Uzaktaki veya küçük yüzler için **Yüksek Hassasiyet** modunu seçin.
- **Analiz hızı (FPS) düşük görünüyor:**
  Algılama modunu **Hızlı Algılama** seçeneğine alın ve tarayıcı ayarlarından **Donanım Hızlandırma (WebGL)** özelliğinin açık olduğundan emin olun.
