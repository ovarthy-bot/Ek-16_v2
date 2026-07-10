# Ek-16 Hat Mekanik Logbook Uygulaması

Expo SDK 54 / React Native ile hazırlanmış, Google Sheets ve Google Drive bağlantılı Ek-16 kayıt uygulaması.

> GitHub'da bu dosyanın görüntülendiği sayfa uygulamanın kendisi değildir; kaynak kod deposunun açıklama sayfasıdır. Uygulama GitHub Pages'a yayımlandıktan sonra `https://KULLANICI_ADI.github.io/Ek-16_v2/` adresinden açılır.

## GitHub Pages ile yayınlama

Bu proje `Ek-16_v2` adlı GitHub deposu için ayarlanmıştır. `app.json` içindeki `experiments.baseUrl` değeri `/Ek-16_v2` olmalıdır.

### Otomatik yayınlama

1. Proje dosyalarını GitHub deposunun `main` dalına yükleyin.
2. GitHub'da **Settings > Pages** bölümünü açın.
3. **Build and deployment > Source** alanında **GitHub Actions** seçin.
4. **Actions** sekmesindeki `Expo Web'i GitHub Pages'a Yayinla` iş akışının tamamlanmasını bekleyin.
5. Uygulamayı `https://KULLANICI_ADI.github.io/Ek-16_v2/` adresinden açın.

### Bilgisayardan manuel yayınlama

```bash
npm install
npm run deploy
```

Ardından GitHub'da **Settings > Pages > Deploy from a branch** seçeneğinde `gh-pages` dalını ve `/(root)` klasörünü seçin.

## Yerel çalıştırma

```bash
npm install
npx expo start
```

Terminalde `w` tuşuna basarak web sürümünü açabilirsiniz.

## Yeni özellikler

- 5 ayrı MOTM/12 form grubu
- Grup 1-4 için 10 kayıt ve her task türünden en az bir kayıt kontrolü
- Aylık minimum 12, hedef 13 farklı gün kontrolü
- Referans türü: bakım kartı, NRC/item, servise verme (NRC + AML)
- Kalıcı `TT mühürlü` checkbox'ı
- Zorunlu taranmış doküman/PDF
- Tarihe göre yeni-eski listeleme
- Kayıt silinirken bağlı Drive PDF dosyasını silme
- Eski Sheet verilerini koruyan sütun genişletmesi

Ayrıntılı karşılaştırma: [KURAL_KARSILASTIRMASI.md](./KURAL_KARSILASTIRMASI.md)

## Google Apps Script güncellemesi

1. `google-apps-script/Code.gs` dosyasını açın.
2. En üstteki `SPREADSHEET_ID` ve `PDF_FOLDER_ID` değerlerini kontrol edin.
3. Apps Script projesindeki eski kodun tamamını bu dosyayla değiştirin.
4. Apps Script editöründe `testDriveAccess` fonksiyonunu bir kez çalıştırıp yetki verin.
5. **Deploy > Manage deployments > Edit > New version > Deploy** adımlarıyla yeni sürümü yayımlayın.
6. Yeni deployment oluşturulduysa `app/index.tsx` içindeki `GOOGLE_SCRIPT_URL` değerini güncelleyin.

Yeni `Referans Türü`, `TT Mühürlü` ve `PDF ID` alanlarının saklanması ve kayıt silindiğinde bağlı PDF'nin de kaldırılması için Apps Script'in yeniden yayımlanması zorunludur.

## Veri sayfaları

Google Spreadsheet içinde aşağıdaki sayfalar kullanılır:

- `Form_Grup_1`
- `Form_Grup_2`
- `Form_Grup_3`
- `Form_Grup_4`
- `Form_Grup_5`

İlk 9 sütun eski sürümle aynı sıradadır. Yeni alanlar sona eklenir; mevcut kayıtlar taşınmaz.

## Kontroller

```bash
npm run lint
npx tsc --noEmit
npm run predeploy
```
