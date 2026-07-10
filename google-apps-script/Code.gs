// ÇOK ÖNEMLİ: Kendi E-Tablo ve PDF klasörü ID bilgilerinizi burada tutun.
var SPREADSHEET_ID = '1BLuIxbcDn8SpS8BRESSZEpeHgquZYN_y3Kmu3qXVwJA';
var PDF_FOLDER_ID = '11fXK7BWx995jb053LkHD3TXiXHYRrmtL';

// İlk 9 sütunun sırası eski kayıtlarla uyumluluk için değiştirilmemiştir.
var HEADERS = [
  'ID',
  'Tarih',
  'Task No',
  'W/O Numarası',
  'Referans No',
  'Açıklama',
  'Birleşik Teknik Metin',
  'PDF Adı',
  'PDF URL',
  'Referans Türü',
  'TT Mühürlü',
  'PDF ID'
];

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    var data = parseRequest_(e);
    var action = normalizeText_(data.action || 'create').toLowerCase();

    if (action === 'testdrive') {
      return createResponse(testDriveFolder_());
    }

    if (action === 'uploadpdf') {
      return createResponse(uploadPdfFromPayload_(data));
    }

    var formGroup = normalizeText_(data.formGroup);
    if (!formGroup) {
      return createResponse({ status: 'error', message: 'Form grup belirtilmedi.' });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheetName = 'Form_Grup_' + formGroup;
    var sheet = action === 'create' ? getOrCreateSheet_(ss, sheetName) : ss.getSheetByName(sheetName);

    if (!sheet) {
      return createResponse({ status: 'error', message: 'İlgili form grubu sayfası bulunamadı: ' + sheetName });
    }

    ensureHeaderRow_(sheet);

    if (action === 'create') return createRecord_(sheet, data, formGroup);
    if (action === 'update') return updateRecord_(sheet, data);
    if (action === 'delete') return deleteRecord_(sheet, data);

    return createResponse({ status: 'error', message: 'Geçersiz işlem: ' + action });
  } catch (err) {
    return createResponse({ status: 'error', message: err && err.message ? err.message : String(err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (lockErr) {}
  }
}

function doGet(e) {
  try {
    var formGroup = normalizeText_(e && e.parameter ? e.parameter.formGroup : '');
    if (!formGroup) {
      return createResponse({ status: 'error', message: 'Form grup belirtilmedi.' });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheetName = 'Form_Grup_' + formGroup;
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet || sheet.getLastRow() < 2) {
      return createResponse([]);
    }

    ensureHeaderRow_(sheet);

    var lastRow = sheet.getLastRow();
    var rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    var list = [];

    for (var i = 0; i < rows.length; i++) {
      var record = rowToRecord_(rows[i]);
      if (record.id) {
        record.formGroup = Number(formGroup);
        list.push(record);
      }
    }

    return createResponse(list);
  } catch (err) {
    return createResponse({ status: 'error', message: err && err.message ? err.message : String(err) });
  }
}

function createRecord_(sheet, data, formGroup) {
  var pdfInfo = maybeUploadPdf_(data);
  if (pdfInfo && pdfInfo.status !== 'success') {
    return createResponse(pdfInfo);
  }

  if (pdfInfo && pdfInfo.status === 'success') {
    data.pdfName = pdfInfo.fileName;
    data.pdfUrl = pdfInfo.fileUrl;
    data.pdfFileId = pdfInfo.fileId;
  }

  var id = 'ID_' + Utilities.getUuid();
  var record = buildRecord_(data, id);
  sheet.appendRow(recordToRow_(record));

  return createResponse({
    status: 'success',
    message: pdfInfo ? 'Kayıt eklendi ve PDF Drive klasörüne yüklendi.' : 'Kayıt eklendi.',
    id: id,
    formGroup: formGroup,
    pdfName: record.pdfName || '',
    pdfUrl: record.pdfUrl || '',
    pdfFileId: record.pdfFileId || ''
  });
}

function updateRecord_(sheet, data) {
  var id = normalizeText_(data.id);
  if (!id) {
    return createResponse({ status: 'error', message: 'Güncellenecek kaydın ID bilgisi gönderilmedi.' });
  }

  var rowNum = findRowById_(sheet, id);
  if (rowNum === -1) {
    return createResponse({ status: 'error', message: 'Güncellenecek kayıt bulunamadı. ID: ' + id });
  }

  var existing = rowToRecord_(sheet.getRange(rowNum, 1, 1, HEADERS.length).getValues()[0]);
  var pdfInfo = maybeUploadPdf_(data);
  if (pdfInfo && pdfInfo.status !== 'success') {
    return createResponse(pdfInfo);
  }

  if (pdfInfo && pdfInfo.status === 'success') {
    data.pdfName = pdfInfo.fileName;
    data.pdfUrl = pdfInfo.fileUrl;
    data.pdfFileId = pdfInfo.fileId;
  } else {
    if (!normalizeText_(data.pdfName)) data.pdfName = existing.pdfName || '';
    if (!normalizeText_(data.pdfUrl)) data.pdfUrl = existing.pdfUrl || '';
    if (!normalizeText_(data.pdfFileId)) data.pdfFileId = existing.pdfFileId || '';
  }

  var record = buildRecord_(data, id);
  sheet.getRange(rowNum, 1, 1, HEADERS.length).setValues([recordToRow_(record)]);

  var deleteWarning = '';
  if (pdfInfo && pdfInfo.status === 'success' && hasDifferentPdf_(existing, record)) {
    var oldPdfDelete = trashPdfForRecord_(existing);
    if (!oldPdfDelete.success) {
      deleteWarning = ' Eski PDF silinemedi: ' + oldPdfDelete.message;
    }
  }

  return createResponse({
    status: 'success',
    message: pdfInfo ? 'Kayıt güncellendi ve yeni PDF Drive klasörüne yüklendi.' + deleteWarning : 'Kayıt güncellendi.',
    id: id,
    pdfName: record.pdfName || '',
    pdfUrl: record.pdfUrl || '',
    pdfFileId: record.pdfFileId || ''
  });
}

function deleteRecord_(sheet, data) {
  var id = normalizeText_(data.id);
  if (!id) {
    return createResponse({ status: 'error', message: 'Silinecek kaydın ID bilgisi gönderilmedi.' });
  }

  var rowNum = findRowById_(sheet, id);
  if (rowNum === -1) {
    return createResponse({ status: 'error', message: 'Silinecek kayıt bulunamadı. ID: ' + id });
  }

  var existing = rowToRecord_(sheet.getRange(rowNum, 1, 1, HEADERS.length).getValues()[0]);
  var pdfDelete = trashPdfForRecord_(existing);
  if (!pdfDelete.success) {
    return createResponse({
      status: 'error',
      message: 'PDF Drive’dan silinemediği için Sheet kaydı korunmuştur: ' + pdfDelete.message
    });
  }

  sheet.deleteRow(rowNum);
  return createResponse({
    status: 'success',
    message: pdfDelete.hadFile ? 'Kayıt ve bağlı PDF silindi.' : 'Kayıt silindi; bağlı PDF yoktu.',
    deletedId: id
  });
}

function buildRecord_(data, id) {
  var taskNo = normalizeText_(data.taskNo);
  var taskName = normalizeText_(data.taskName) || taskNameByNo_(taskNo);
  var woNumber = normalizeText_(data.woNumber);
  var referenceType = normalizeReferenceType_(data.referenceType, taskNo);
  var refNumber = normalizeText_(data.refNumber);
  var description = normalizeText_(data.description);
  var date = normalizeText_(data.date);
  var ttStamped = parseBoolean_(data.ttStamped);
  var pdfName = normalizeText_(data.pdfName);
  var pdfUrl = normalizeText_(data.pdfUrl);
  var pdfFileId = normalizeText_(data.pdfFileId) || extractDriveFileId_(pdfUrl);
  var combinedText = [
    'Task ' + taskNo + (taskName ? ' - ' + taskName : ''),
    'W/O: ' + woNumber,
    'Referans Türü: ' + referenceTypeLabel_(referenceType),
    'Ref: ' + refNumber,
    'Açıklama: ' + description,
    'TT Mühürlü: ' + (ttStamped ? 'Evet' : 'Hayır')
  ].join(' | ');

  return {
    id: id,
    date: date,
    taskNo: taskNo,
    woNumber: woNumber,
    refNumber: refNumber,
    description: description,
    combinedText: combinedText,
    pdfName: pdfName,
    pdfUrl: pdfUrl,
    referenceType: referenceType,
    ttStamped: ttStamped,
    pdfFileId: pdfFileId
  };
}

function recordToRow_(record) {
  return [
    record.id,
    record.date,
    record.taskNo,
    record.woNumber,
    record.refNumber,
    record.description,
    record.combinedText,
    record.pdfName || '',
    record.pdfUrl || '',
    record.referenceType || '',
    record.ttStamped ? 'Evet' : 'Hayır',
    record.pdfFileId || ''
  ];
}

function rowToRecord_(row) {
  var taskNo = normalizeText_(row[2]);
  var pdfUrl = normalizeText_(row[8]);
  return {
    id: normalizeText_(row[0]),
    date: formatDateForJson_(row[1]),
    taskNo: taskNo,
    woNumber: normalizeText_(row[3]),
    refNumber: normalizeText_(row[4]),
    description: normalizeText_(row[5]),
    combinedText: normalizeText_(row[6]),
    pdfName: normalizeText_(row[7]),
    pdfUrl: pdfUrl,
    referenceType: normalizeReferenceType_(row[9], taskNo),
    ttStamped: parseBoolean_(row[10]),
    pdfFileId: normalizeText_(row[11]) || extractDriveFileId_(pdfUrl)
  };
}

function findRowById_(sheet, id) {
  var wantedId = normalizeText_(id);
  var lastRow = sheet.getLastRow();
  if (!wantedId || lastRow < 2) return -1;

  var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < idValues.length; i++) {
    if (normalizeText_(idValues[i][0]) === wantedId) return i + 2;
  }
  return -1;
}

function getOrCreateSheet_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  ensureHeaderRow_(sheet);
  return sheet;
}

function ensureHeaderRow_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return;
  }

  if (sheet.getMaxColumns() < HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
  }

  var currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var shouldRewrite = false;
  for (var i = 0; i < HEADERS.length; i++) {
    if (normalizeText_(currentHeaders[i]) !== HEADERS[i]) {
      shouldRewrite = true;
      break;
    }
  }
  if (shouldRewrite) sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
}

function parseRequest_(e) {
  if (e && e.postData && e.postData.contents) return JSON.parse(e.postData.contents);
  if (e && e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
  return e && e.parameter ? e.parameter : {};
}

function normalizeText_(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function parseBoolean_(value) {
  if (value === true || value === 1) return true;
  var normalized = normalizeText_(value).toLocaleLowerCase('tr-TR');
  return ['true', '1', 'evet', 'yes', 'var', 'mühürlü', 'muhurlu', 'x'].indexOf(normalized) !== -1;
}

function normalizeReferenceType_(value, taskNo) {
  var normalized = normalizeText_(value);
  if (normalized === 'maintenance_card' || normalized === 'nrc' || normalized === 'service_release') {
    return normalized;
  }
  return Number(taskNo) === 2 ? 'service_release' : 'maintenance_card';
}

function taskNameByNo_(taskNo) {
  var names = {
    '1': 'Uçak defterinde arıza kaydı',
    '2': "Uçak defterinde MEL'e göre sefere verme işlemleri",
    '3': 'Servis işlemleri (Yağlama)',
    '4': 'Servis işlemleri (Motor hidrolik ikmal)',
    '5': 'Servis işlemleri (Lastik değişimi)',
    '6': 'Günlük, haftalık kartlar, ETOPS servis kartları',
    '7': 'Bakıma hazırlık / Bakım çıkış kartları',
    '8': 'TSM/FIM kullanma',
    '9': 'Komponent söküm takımları',
    '10': 'Sistem/komponent testleri',
    '11': 'Yazılım / Medya / Yükleme / İndirme',
    '12': 'Motor Söküm Takımları (Optional)',
    '13': 'Park / Depolama (Optional)'
  };
  return names[normalizeText_(taskNo)] || '';
}

function referenceTypeLabel_(value) {
  if (value === 'nrc') return 'NRC / item';
  if (value === 'service_release') return 'Servise verme (NRC + AML)';
  return 'Bakım kartı';
}

function formatDateForJson_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return normalizeText_(value);
}

function maybeUploadPdf_(payload) {
  if (!payload || !normalizeText_(payload.fileData)) return null;
  return uploadPdfFromPayload_(payload);
}

function uploadPdfFromPayload_(payload) {
  try {
    if (!payload || !normalizeText_(payload.fileData)) {
      return { status: 'error', message: 'PDF verisi bulunamadı.' };
    }
    if (!PDF_FOLDER_ID) {
      return { status: 'error', message: 'PDF_FOLDER_ID tanımlı değil.' };
    }

    var folder = DriveApp.getFolderById(PDF_FOLDER_ID);
    var fileName = buildUploadedPdfName_(payload);
    var base64 = cleanBase64_(payload.fileData);
    if (!base64) return { status: 'error', message: 'PDF base64 verisi boş.' };

    var bytes;
    try {
      bytes = Utilities.base64Decode(base64);
    } catch (decodeErr) {
      return { status: 'error', message: 'PDF base64 verisi çözümlenemedi: ' + decodeErr.message };
    }

    var blob = Utilities.newBlob(bytes, payload.mimeType || 'application/pdf', fileName);
    var driveFile = folder.createFile(blob);
    var sharingWarning = '';
    try {
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingErr) {
      sharingWarning = ' PDF yüklendi fakat paylaşım izni otomatik değiştirilemedi: ' +
        (sharingErr && sharingErr.message ? sharingErr.message : String(sharingErr));
      Logger.log(sharingWarning);
    }

    return {
      status: 'success',
      message: 'PDF Google Drive klasörüne yüklendi.' + sharingWarning,
      fileName: driveFile.getName(),
      fileId: driveFile.getId(),
      fileUrl: driveFile.getUrl(),
      sharingWarning: sharingWarning
    };
  } catch (err) {
    return { status: 'error', message: 'PDF yükleme hatası: ' + (err && err.message ? err.message : String(err)) };
  }
}

function hasDifferentPdf_(oldRecord, newRecord) {
  var oldId = normalizeText_(oldRecord.pdfFileId) || extractDriveFileId_(oldRecord.pdfUrl);
  var newId = normalizeText_(newRecord.pdfFileId) || extractDriveFileId_(newRecord.pdfUrl);
  return Boolean(oldId && newId && oldId !== newId);
}

function trashPdfForRecord_(record) {
  var fileId = normalizeText_(record && record.pdfFileId) || extractDriveFileId_(record && record.pdfUrl);
  if (!fileId) return { success: true, hadFile: false, message: 'Bağlı PDF yok.' };

  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return { success: true, hadFile: true, message: 'PDF Drive çöp kutusuna taşındı.' };
  } catch (err) {
    return {
      success: false,
      hadFile: true,
      message: err && err.message ? err.message : String(err)
    };
  }
}

function extractDriveFileId_(url) {
  var text = normalizeText_(url);
  if (!text) return '';
  var match = text.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || text.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return match ? match[1] : '';
}

function testDriveFolder_() {
  try {
    var folder = DriveApp.getFolderById(PDF_FOLDER_ID);
    return {
      status: 'success',
      message: 'PDF klasörüne erişim var.',
      folderName: folder.getName(),
      folderId: folder.getId()
    };
  } catch (err) {
    return { status: 'error', message: 'PDF klasörüne erişilemiyor: ' + (err && err.message ? err.message : String(err)) };
  }
}

function cleanBase64_(value) {
  var text = normalizeText_(value);
  var commaIndex = text.indexOf(',');
  if (commaIndex !== -1) text = text.substring(commaIndex + 1);
  return text.replace(/\s/g, '');
}

function buildUploadedPdfName_(payload) {
  var rawName = sanitizeFileName_(payload.fileName || 'ek.pdf');
  if (!/\.pdf$/i.test(rawName)) rawName += '.pdf';

  var prefixParts = [];
  if (payload.date) prefixParts.push(String(payload.date).replace(/[\\/:*?"<>|]/g, '-'));
  if (payload.woNumber) prefixParts.push(String(payload.woNumber).replace(/[\\/:*?"<>|]/g, '-'));
  if (payload.refNumber) prefixParts.push(String(payload.refNumber).replace(/[\\/:*?"<>|]/g, '-'));
  return prefixParts.length ? prefixParts.join('_') + '_' + rawName : rawName;
}

function sanitizeFileName_(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim() || 'ek.pdf';
}

function testDriveAccess() {
  var result = testDriveFolder_();
  Logger.log(JSON.stringify(result));
  return result;
}

function createResponse(output) {
  return ContentService
    .createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}
