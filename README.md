# Ek-16 Hat Mekanik Logbook Uygulaması

Expo SDK 54 / React Native ile hazırlanmış, Google Sheets ve Google Drive bağlantılı Ek-16 kayıt uygulaması.

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

## Kurulum

```bash
npm install
npx expo start
```

Web çıktısı:

```bash
npm run predeploy
```

## Google Apps Script güncellemesi

1. `google-apps-script/Code.gs` dosyasını açın.
2. En üstteki `SPREADSHEET_ID` ve `PDF_FOLDER_ID` değerlerini kontrol edin.
3. Apps Script projesindeki eski kodun tamamını bu dosyayla değiştirin.
4. Apps Script editöründe `testDriveAccess` fonksiyonunu bir kez çalıştırıp yetki verin.
5. **Deploy > Manage deployments > Edit > New version > Deploy** adımlarıyla yeni sürümü yayımlayın.
6. Aynı deployment güncellendiyse Web App URL değişmez. Yeni deployment oluşturulduysa `app/index.tsx` içindeki `GOOGLE_SCRIPT_URL` değerini güncelleyin.

Uygulamanın yeni `Referans Türü`, `TT Mühürlü` ve `PDF ID` alanlarını saklaması ve silinen kaydın PDF dosyasını da kaldırması için Apps Script'in yeniden yayımlanması zorunludur.

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
```
