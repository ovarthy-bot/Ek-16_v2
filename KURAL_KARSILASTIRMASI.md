# Ek-16 Kural Karşılaştırması ve Uygulanan Geliştirmeler

## Önceki çalışma biçimi

- Uygulama yalnızca seçilen taskın ait olduğu tek form grubunu Google Sheet'ten getiriyordu.
- Grup toplamı, grup içindeki task türlerinin kapsanması ve aylık farklı gün sayısı hesaplanmıyordu.
- Task seçimi 13 taskın tamamını tek listede gösteriyordu; 5 ayrı MOTM/12 formu görsel olarak ayrılmıyordu.
- Kayıtlar Sheet sırasıyla gösteriliyor, tarih sıralaması uygulanmıyordu.
- Referans türü ayrımı yoktu; yalnızca serbest bir "Referans no" alanı bulunuyordu.
- PDF eki opsiyoneldi.
- TT Sicil Kaşesi durumu kaydedilmiyordu.
- Kayıt silindiğinde Drive PDF dosyasının silinmesi garanti edilmiyordu.

## Yeni çalışma biçimi

### 1. Beş ayrı form grubu

- Grup 1: Task 1-2
- Grup 2: Task 3-5
- Grup 3: Task 6-7
- Grup 4: Task 8-11
- Grup 5: Task 12-13 (Optional)

Uygulama her grubu ayrı sekme gibi gösterir ve Google Sheet'teki `Form_Grup_1` ... `Form_Grup_5` sayfalarını ayrı tutar. Düzenleme sırasında bir kayıt başka gruba taşınamaz.

### 2. Dört zorunlu grup için 10 iş ve task çeşitliliği

Grup 1-4 için uygunluk aynı anda iki koşulla hesaplanır:

1. Grup toplamı en az 10 kayıt olmalıdır.
2. O gruptaki her task türü en az bir kez bulunmalıdır.

Örnek: Grup 1'de 10 kayıt olsa bile kayıtların tamamı Task 1 ise grup tamamlanmış sayılmaz; Task 2 de en az bir kez bulunmalıdır.

Grup 5 optional olarak gösterilir ve 10 kayıt şartına dahil edilmez.

### 3. Aylık 12-13 farklı gün

- Farklı gün hesabı yalnız seçili gruptan değil, 5 form grubundaki bütün kayıtlardan yapılır.
- Aynı tarihte birden fazla kayıt varsa tek gün sayılır.
- "12-13 ayrı gün" ifadesi uygulamada **minimum 12 gün, hedef 13 gün** olarak uygulanmıştır.
- Kullanıcı kontrol ayını seçebilir; kayıt ve farklı gün sayısını görebilir.

### 4. Referans ve W/O kuralları

- W/O numarası bütün kayıtlarda zorunludur.
- Referans türleri ayrılmıştır:
  - Bakım kartı
  - NRC / item
  - Servise verme (NRC + AML)
- NRC türünde referans metninde `NRC` ibaresi aranır.
- Servise verme türünde hem `NRC` hem `AML` ibaresi aranır.
- Kısa teknik açıklama zorunludur.
- Google Sheet'teki "Birleşik Teknik Metin" W/O, referans türü, referans, açıklama ve TT durumunu birlikte içerir.

### 5. TT mühürlü checkbox

- Forma `TT mühürlü` checkbox'ı eklendi.
- Değer kayıtla birlikte Google Sheet'e yazılır ve liste kartında gösterilir.
- Checkbox'ın son seçimi cihazda/web tarayıcısında kalıcı olarak saklanır.
- Bakım kartı ve NRC türlerinde TT mühürlü değilse kayıt kaydedilmez.
- Servise verme (NRC + AML) türünde TT kaşesi zorunlu tutulmaz; Adam/Saat istisnası ekranda hatırlatılır.

### 6. Taranmış doküman

- PDF eki artık yeni kayıt ve düzenleme için zorunludur.
- PDF bulunmayan eski kayıtlar listede "Taranmış doküman/PDF eksik" olarak işaretlenir.
- PDF bağlantısı kayıt kartından açılabilir.

### 7. Listeleme

- Tüm 5 grup arka planda alınır; uygunluk paneli bu toplam veriyle hesaplanır.
- Mevcut kayıtlar seçilen form grubuna göre filtrelenir.
- Kayıtlar tarihe göre yeni tarihten eski tarihe sıralanır.
- Her kartta grup, uygunluk, referans türü, TT durumu ve PDF durumu görünür.

### 8. Silme ve PDF temizliği

- Kayıt silinirken bağlı Drive PDF dosyası önce çöp kutusuna taşınır.
- PDF silinemezse Sheet satırı korunur ve hata döndürülür; böylece kayıt-PDF bağı sessizce bozulmaz.
- Düzenlemede yeni PDF yüklenirse eski PDF çöp kutusuna taşınır.

## Google Sheet şema uyumluluğu

Eski verilerin bozulmaması için mevcut ilk 9 sütunun sırası korunmuştur. Yeni sütunlar sona eklenmiştir:

10. Referans Türü
11. TT Mühürlü
12. PDF ID

Apps Script ilk çalışmada başlıkları genişletir. Eski kayıtlar okunmaya devam eder; eski kayıtlarda TT bilgisi bulunmadığı için varsayılan değer `Hayır` olur.

## Sınırlar

- Uygulama, MOTM/12 formunun değerlendiriciye ait 12-18 numaralı alanlarını üretmez veya değiştirmez; kayıt girişi yalnız yapılan işler verisini yönetir.
- Fiziksel MOTM/12 formunda sekiz iş satırı bulunduğundan 10 işlik bir grup çıktı alınacaksa birden fazla form sayfası gerekebilir. Bu sürüm PDF/MOTM form çıktısı üretmez.
