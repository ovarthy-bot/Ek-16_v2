import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Linking,
    Platform,
    RefreshControl,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw2J1BfjftIev4NKDJGekkVTnnHoa0T7qwF-LCD6R6NGTRQhIPI1zdpLSsW17RE9rwU/exec';
const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;
const FORM_GROUPS = [1, 2, 3, 4, 5] as const;
const REQUIRED_GROUP_MINIMUM = 10;
const MIN_MONTHLY_DISTINCT_DAYS = 12;
const RECOMMENDED_MONTHLY_DISTINCT_DAYS = 13;
const TT_STAMP_STORAGE_KEY = '@ek16/tt-stamped-default';
const REFERENCE_TYPE_STORAGE_KEY = '@ek16/reference-type-default';

const TASKS_DATA = [
  { id: 1, name: 'Uçak defterinde arıza kaydı', group: 1 },
  { id: 2, name: "Uçak defterinde MEL'e göre sefere verme", group: 1 },
  { id: 3, name: 'Servis işlemleri (Yağlama)', group: 2 },
  { id: 4, name: 'Servis işlemleri (Motor hidrolik ikmal)', group: 2 },
  { id: 5, name: 'Servis işlemleri (Lastik değişimi)', group: 2 },
  { id: 6, name: 'Günlük, haftalık kartlar, ETOPS servis kartları', group: 3 },
  { id: 7, name: 'Bakıma hazırlık / Bakım çıkış kartları', group: 3 },
  { id: 8, name: 'TSM/FIM kullanma', group: 4 },
  { id: 9, name: 'Komponent söküm takımları', group: 4 },
  { id: 10, name: 'Sistem/komponent testleri', group: 4 },
  { id: 11, name: 'Yazılım / Medya / Yükleme / İndirme', group: 4 },
  { id: 12, name: 'Motor Söküm Takımları (Optional)', group: 5 },
  { id: 13, name: 'Park / Depolama (Optional)', group: 5 },
];

const REFERENCE_TYPES = [
  { value: 'maintenance_card', label: 'Bakım kartı', hint: 'İlgili bakım kartı numarasını yazın. TT Sicil Kaşesi zorunludur.' },
  { value: 'nrc', label: 'NRC / item', hint: 'Referans alanına NRC numarasını NRC ibaresiyle yazın. TT Sicil Kaşesi zorunludur.' },
  { value: 'service_release', label: 'Servise verme (NRC + AML)', hint: 'Referans alanına NRC ve AML numaralarını birlikte yazın. Yalnız AML kaydıyla servise verme işleminde TT kaşesi aranmaz; Adam/Saat kaydı yeterlidir.' },
] as const;

type TaskItem = (typeof TASKS_DATA)[number];
type ReferenceType = (typeof REFERENCE_TYPES)[number]['value'];

type RawRecord = Record<string, any>;

type LogbookRecord = {
  id: string;
  formGroup: number;
  date: string;
  taskNo: number | string;
  woNumber: string;
  referenceType: ReferenceType;
  refNumber: string;
  description: string;
  ttStamped: boolean;
  combinedText?: string;
  pdfName?: string;
  pdfUrl?: string;
  pdfFileId?: string;
};

const colors = {
  background: '#F3F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  primary: '#1D4ED8',
  primaryDark: '#0F2E5F',
  primarySoft: '#EAF1FF',
  text: '#172033',
  muted: '#64748B',
  border: '#E2E8F0',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  success: '#15803D',
  successSoft: '#DCFCE7',
};

function getTaskById(taskId: number | string): TaskItem {
  const parsedId = Number(taskId);
  return TASKS_DATA.find((task) => task.id === parsedId) || TASKS_DATA[0];
}

function getReferenceType(value: unknown): (typeof REFERENCE_TYPES)[number] {
  return REFERENCE_TYPES.find((item) => item.value === value) || REFERENCE_TYPES[0];
}

function defaultReferenceTypeForTask(taskId: number | string): ReferenceType {
  return Number(taskId) === 2 ? 'service_release' : 'maintenance_card';
}

function parseBooleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLocaleLowerCase('tr-TR');
  return ['true', '1', 'evet', 'yes', 'var', 'mühürlü', 'muhurlu', 'x'].includes(normalized);
}

function isTtStampRequired(referenceType: ReferenceType): boolean {
  return referenceType !== 'service_release';
}

function formatMonthLabel(monthIso: string): string {
  const [year, month] = monthIso.split('-').map(Number);
  if (!year || !month) return monthIso;
  return `${MONTHS_TR_FULL[month - 1] || month} ${year}`;
}

function getRawValue(item: RawRecord, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return fallback;
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_LOOKUP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  oca: 1, sub: 2, şub: 2, nis: 4, haz: 6, tem: 7, agu: 8, ağu: 8, eyl: 9, eki: 10, kas: 11, ara: 12,
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function pad2(value: number | string): string {
  return String(value).padStart(2, '0');
}

function toIsoDate(value: unknown): string {
  if (!value) return todayIso();

  const text = String(value).trim();
  if (!text) return todayIso();

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const slashMonthMatch = text.match(/^(\d{1,2})\/([A-Za-zÇĞİÖŞÜçğıöşü]{3,})\/(\d{4})$/);
  if (slashMonthMatch) {
    const day = Number(slashMonthMatch[1]);
    const monthKey = slashMonthMatch[2].toLocaleLowerCase('tr-TR').replace('ı', 'i').slice(0, 3);
    const month = MONTH_LOOKUP[monthKey];
    const year = Number(slashMonthMatch[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const numericDateMatch = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (numericDateMatch) {
    const day = Number(numericDateMatch[1]);
    const month = Number(numericDateMatch[2]);
    const year = Number(numericDateMatch[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }

  return todayIso();
}

function formatDateForDisplay(value: unknown): string {
  const isoDate = toIsoDate(value);
  const [year, month, day] = isoDate.split('-');
  const monthName = MONTHS_EN[Number(month) - 1] || month;
  return `${day}/${monthName}/${year}`;
}

function normalizeRecord(item: RawRecord, fallbackFormGroup?: number): LogbookRecord {
  const taskNo = getRawValue(item, ['taskNo', 'Task No', 'task no', 'TaskNo'], '1');
  const task = getTaskById(taskNo);
  const rawReferenceType = getRawValue(item, ['referenceType', 'Referans Türü', 'Referans Turu']);
  const referenceType = getReferenceType(rawReferenceType || defaultReferenceTypeForTask(taskNo)).value;

  return {
    id: getRawValue(item, ['id', 'ID', 'Id']),
    formGroup: Number(getRawValue(item, ['formGroup', 'Form Grup', 'Form Grubu'], String(fallbackFormGroup || task.group))) || task.group,
    date: formatDateForDisplay(getRawValue(item, ['date', 'Tarih', 'tarih'])),
    taskNo,
    woNumber: getRawValue(item, ['woNumber', 'W/O Numarası', 'W/O Numarasi', 'WO Numarası', 'w/o numarası']),
    referenceType,
    refNumber: getRawValue(item, ['refNumber', 'Referans No', 'Referans no', 'referans no']),
    description: getRawValue(item, ['description', 'Açıklama', 'Aciklama', 'açıklama', 'aciklama']),
    ttStamped: parseBooleanValue(item?.ttStamped ?? item?.['TT Mühürlü'] ?? item?.['TT Muhurlu']),
    combinedText: getRawValue(item, ['combinedText', 'Birleşik Teknik Metin', 'Birlesik Teknik Metin']),
    pdfName: getRawValue(item, ['pdfName', 'PDF Adı', 'PDF Dosyası']),
    pdfUrl: getRawValue(item, ['pdfUrl', 'PDF URL', 'Pdf Url']),
    pdfFileId: getRawValue(item, ['pdfFileId', 'PDF ID', 'Pdf ID']),
  };
}

type DocumentPickerAsset = DocumentPicker.DocumentPickerAsset;

function getPickedDocumentAsset(result: any): DocumentPickerAsset | null {
  if (!result) return null;

  // Yeni expo-document-picker sürümleri: { canceled: false, assets: [...] }
  if (result.canceled === true) return null;
  if (Array.isArray(result.assets) && result.assets.length > 0) {
    return result.assets[0] as DocumentPickerAsset;
  }

  // Eski expo-document-picker sürümleri: { type: 'success', uri, name, ... }
  if (result.type === 'success' && result.uri) {
    return result as DocumentPickerAsset;
  }

  return null;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk) as unknown as number[]);
  }

  return btoa(binary);
}

async function readPdfAsBase64(asset: DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web') {
    if (asset.base64) return asset.base64;

    if (asset.file) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('PDF dosyası okunamadı.'));
        reader.readAsDataURL(asset.file as Blob);
      });

      const base64 = dataUrl.split(',')[1];
      if (!base64) throw new Error('PDF dosyası okunamadı.');
      return base64;
    }

    if (asset.uri) {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      return uint8ArrayToBase64(bytes);
    }

    throw new Error('PDF dosyası okunamadı.');
  }

  return FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
}

async function postToGoogleScript(payload: RawRecord) {
  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    // text/plain kullanımı özellikle Expo Web / Chrome testlerinde CORS preflight sorununu azaltır.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Google Script JSON cevap döndürmedi: ${text.slice(0, 120)}`);
  }
}

type DatePickerFieldProps = {
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
};

const WEEK_DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS_TR_FULL = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

type CalendarDay = {
  iso: string;
  day: number;
  inCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
};

function isoFromDateObject(dateObj: Date): string {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

function addMonthsToIso(value: string, amount: number): string {
  const isoDate = toIsoDate(value);
  const [year, month] = isoDate.split('-').map(Number);
  const target = new Date(year, month - 1 + amount, 1);
  return `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-01`;
}

function buildCalendarDays(visibleMonthIso: string, selectedIso: string): CalendarDay[] {
  const [year, month] = toIsoDate(visibleMonthIso).split('-').map(Number);
  const firstOfMonth = new Date(year, month - 1, 1);
  const firstDayIndexMondayBased = (firstOfMonth.getDay() + 6) % 7;
  const startDate = new Date(year, month - 1, 1 - firstDayIndexMondayBased);
  const today = todayIso();

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + index);
    const iso = isoFromDateObject(current);

    return {
      iso,
      day: current.getDate(),
      inCurrentMonth: current.getMonth() === month - 1,
      isSelected: iso === selectedIso,
      isToday: iso === today,
    };
  });
}

function DatePickerField({ value, onChange, disabled }: DatePickerFieldProps) {
  const selectedIso = toIsoDate(value);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonthIso, setVisibleMonthIso] = useState(`${selectedIso.slice(0, 7)}-01`);

  useEffect(() => {
    setVisibleMonthIso(`${toIsoDate(value).slice(0, 7)}-01`);
  }, [value]);

  const calendarDays = useMemo(
    () => buildCalendarDays(visibleMonthIso, selectedIso),
    [visibleMonthIso, selectedIso],
  );

  const [visibleYear, visibleMonth] = toIsoDate(visibleMonthIso).split('-').map(Number);
  const monthTitle = `${MONTHS_TR_FULL[visibleMonth - 1]} ${visibleYear}`;

  const handleSelectDate = (isoDate: string) => {
    onChange(isoDate);
    setCalendarOpen(false);
  };

  return (
    <View style={styles.datePickerContainer}>
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={() => !disabled && setCalendarOpen((prev) => !prev)}
        disabled={disabled}
        style={[styles.datePickerButton, calendarOpen && styles.datePickerButtonActive]}
      >
        <Text style={styles.datePickerText}>{formatDateForDisplay(value)}</Text>
        <Text style={styles.datePickerIcon}>📅</Text>
      </TouchableOpacity>

      {calendarOpen && !disabled && (
        <View style={styles.calendarPanel}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity
              style={styles.calendarNavButton}
              onPress={() => setVisibleMonthIso((current) => addMonthsToIso(current, -1))}
            >
              <Text style={styles.calendarNavText}>‹</Text>
            </TouchableOpacity>

            <Text style={styles.calendarTitle}>{monthTitle}</Text>

            <TouchableOpacity
              style={styles.calendarNavButton}
              onPress={() => setVisibleMonthIso((current) => addMonthsToIso(current, 1))}
            >
              <Text style={styles.calendarNavText}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.weekDaysRow}>
            {WEEK_DAYS_TR.map((dayName) => (
              <Text key={dayName} style={styles.weekDayText}>{dayName}</Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarDays.map((day) => (
              <TouchableOpacity
                key={day.iso}
                style={[
                  styles.calendarDayButton,
                  !day.inCurrentMonth && styles.calendarDayOutside,
                  day.isToday && styles.calendarDayToday,
                  day.isSelected && styles.calendarDaySelected,
                ]}
                onPress={() => handleSelectDate(day.iso)}
              >
                <Text
                  style={[
                    styles.calendarDayText,
                    !day.inCurrentMonth && styles.calendarDayTextOutside,
                    day.isToday && styles.calendarDayTextToday,
                    day.isSelected && styles.calendarDayTextSelected,
                  ]}
                >
                  {day.day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.calendarFooter}>
            <TouchableOpacity style={styles.calendarFooterButton} onPress={() => handleSelectDate(todayIso())}>
              <Text style={styles.calendarFooterButtonText}>Bugün</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calendarFooterButton} onPress={() => setCalendarOpen(false)}>
              <Text style={styles.calendarFooterButtonText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export default function App() {
  const [selectedFormGroup, setSelectedFormGroup] = useState<number>(1);
  const [selectedTask, setSelectedTask] = useState<number>(1);
  const [date, setDate] = useState(todayIso());
  const [woNumber, setWoNumber] = useState('');
  const [referenceType, setReferenceType] = useState<ReferenceType>(defaultReferenceTypeForTask(1));
  const [refNumber, setRefNumber] = useState('');
  const [description, setDescription] = useState('');
  const [ttStamped, setTtStamped] = useState(false);
  const [allRecords, setAllRecords] = useState<LogbookRecord[]>([]);
  const [progressMonth, setProgressMonth] = useState(todayIso().slice(0, 7));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadedPdfName, setUploadedPdfName] = useState<string | null>(null);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);
  const [selectedPdfData, setSelectedPdfData] = useState<string | null>(null);
  const [selectedPdfName, setSelectedPdfName] = useState<string | null>(null);
  const [selectedPdfMimeType, setSelectedPdfMimeType] = useState<string>('application/pdf');
  const [selectedPdfSize, setSelectedPdfSize] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const tasksForSelectedGroup = useMemo(
    () => TASKS_DATA.filter((task) => task.group === selectedFormGroup),
    [selectedFormGroup],
  );
  const records = useMemo(
    () => allRecords
      .filter((record) => record.formGroup === selectedFormGroup)
      .sort((a, b) => {
        const dateCompare = toIsoDate(b.date).localeCompare(toIsoDate(a.date));
        return dateCompare !== 0 ? dateCompare : b.id.localeCompare(a.id);
      }),
    [allRecords, selectedFormGroup],
  );
  const isEditing = Boolean(editingId);
  const isBusy = fetching || saving || uploadingPdf || Boolean(deletingId);
  const selectedReferenceType = getReferenceType(referenceType);

  const monthOptions = useMemo(() => {
    const months = new Set<string>([todayIso().slice(0, 7), progressMonth]);
    allRecords.forEach((record) => months.add(toIsoDate(record.date).slice(0, 7)));
    return Array.from(months).filter(Boolean).sort((a, b) => b.localeCompare(a));
  }, [allRecords, progressMonth]);

  const monthlyProgress = useMemo(() => {
    const monthRecords = allRecords.filter((record) => toIsoDate(record.date).slice(0, 7) === progressMonth);
    const distinctDays = new Set(monthRecords.map((record) => toIsoDate(record.date))).size;
    return {
      recordCount: monthRecords.length,
      distinctDays,
      minimumMet: distinctDays >= MIN_MONTHLY_DISTINCT_DAYS,
      recommendedMet: distinctDays >= RECOMMENDED_MONTHLY_DISTINCT_DAYS,
    };
  }, [allRecords, progressMonth]);

  const groupProgress = useMemo(() => FORM_GROUPS.map((group) => {
    const groupRecords = allRecords.filter((record) => record.formGroup === group);
    const requiredTaskIds = TASKS_DATA.filter((task) => task.group === group).map((task) => task.id);
    const coveredTaskIds = new Set(groupRecords.map((record) => Number(record.taskNo)));
    const missingTaskIds = requiredTaskIds.filter((taskId) => !coveredTaskIds.has(taskId));
    const optional = group === 5;

    return {
      group,
      total: groupRecords.length,
      minimum: optional ? 0 : REQUIRED_GROUP_MINIMUM,
      coveredCount: requiredTaskIds.length - missingTaskIds.length,
      requiredCount: requiredTaskIds.length,
      missingTaskIds,
      optional,
      complete: optional ? true : groupRecords.length >= REQUIRED_GROUP_MINIMUM && missingTaskIds.length === 0,
    };
  }), [allRecords]);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.multiGet([TT_STAMP_STORAGE_KEY, REFERENCE_TYPE_STORAGE_KEY])
      .then((entries) => {
        if (!mounted) return;
        const savedTt = entries.find(([key]) => key === TT_STAMP_STORAGE_KEY)?.[1];
        const savedReferenceType = entries.find(([key]) => key === REFERENCE_TYPE_STORAGE_KEY)?.[1];
        if (savedTt !== null && savedTt !== undefined) setTtStamped(parseBooleanValue(savedTt));
        if (REFERENCE_TYPES.some((item) => item.value === savedReferenceType)) {
          setReferenceType(savedReferenceType as ReferenceType);
        }
      })
      .catch((error) => console.log('Yerel ayar yüklenemedi:', error));

    return () => {
      mounted = false;
    };
  }, []);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setDate(todayIso());
    setWoNumber('');
    setReferenceType(defaultReferenceTypeForTask(selectedTask));
    setRefNumber('');
    setDescription('');
    setUploadedPdfName(null);
    setUploadedPdfUrl(null);
    setSelectedPdfData(null);
    setSelectedPdfName(null);
    setSelectedPdfMimeType('application/pdf');
    setSelectedPdfSize(null);
  }, [selectedTask]);

  const fetchRecords = useCallback(async () => {
    setFetching(true);
    try {
      const results = await Promise.allSettled(
        FORM_GROUPS.map(async (formGroup) => {
          const url = `${GOOGLE_SCRIPT_URL}?formGroup=${encodeURIComponent(String(formGroup))}&_ts=${Date.now()}`;
          const response = await fetch(url);
          const text = await response.text();

          let data: any;
          try {
            data = JSON.parse(text);
          } catch {
            throw new Error(`Grup ${formGroup}: Google Script JSON cevap döndürmedi: ${text.slice(0, 100)}`);
          }

          if (!Array.isArray(data)) {
            throw new Error(`Grup ${formGroup}: ${data?.message || 'Beklenen liste formatı alınamadı.'}`);
          }

          return data
            .map((item: RawRecord) => normalizeRecord(item, formGroup))
            .filter((record: LogbookRecord) => record.id);
        }),
      );

      const successfulRecords = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
      const failures = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
      setAllRecords(successfulRecords);

      if (failures.length > 0) {
        Alert.alert(
          'Kısmi listeleme hatası',
          `${FORM_GROUPS.length - failures.length} grup yüklendi, ${failures.length} grup alınamadı. ${String(failures[0].reason?.message || failures[0].reason)}`,
        );
      }
    } catch (error: any) {
      setAllRecords([]);
      Alert.alert('Bağlantı hatası', error?.message || 'Google Drive verileri alınamadı.');
      console.log('Veri çekme hatası:', error);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleFormGroupChange = (formGroup: number) => {
    if (isEditing || saving) return;
    const firstTask = TASKS_DATA.find((task) => task.group === formGroup);
    setSelectedFormGroup(formGroup);
    if (firstTask) {
      setSelectedTask(firstTask.id);
      const nextReferenceType = defaultReferenceTypeForTask(firstTask.id);
      setReferenceType(nextReferenceType);
    }
  };

  const handleTaskChange = (taskId: number) => {
    const task = getTaskById(taskId);
    if (task.group !== selectedFormGroup) return;
    setSelectedTask(taskId);
    if (!isEditing) setReferenceType(defaultReferenceTypeForTask(taskId));
  };

  const handleReferenceTypeChange = (value: ReferenceType) => {
    setReferenceType(value);
    AsyncStorage.setItem(REFERENCE_TYPE_STORAGE_KEY, value)
      .catch((error) => console.log('Referans türü ayarı kaydedilemedi:', error));
  };

  const handleTtStampedChange = (value: boolean) => {
    setTtStamped(value);
    AsyncStorage.setItem(TT_STAMP_STORAGE_KEY, value ? 'true' : 'false')
      .catch((error) => console.log('TT mühür ayarı kaydedilemedi:', error));
  };

  const handlePdfUpload = async () => {
    try {
      const pickResult = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        ...(Platform.OS === 'web' ? { base64: true } : {}),
      });

      const asset = getPickedDocumentAsset(pickResult);
      if (!asset) return;

      const mimeType = asset.mimeType?.toLowerCase() || 'application/pdf';
      const fileName = asset.name || 'ek.pdf';

      if (mimeType !== 'application/pdf' && !fileName.toLowerCase().endsWith('.pdf')) {
        Alert.alert('Geçersiz dosya', 'Sadece PDF dosyaları yüklenebilir.');
        return;
      }

      if (asset.size && asset.size > MAX_PDF_SIZE_BYTES) {
        Alert.alert('Dosya çok büyük', 'PDF dosyası en fazla 10 MB olabilir. Daha küçük bir PDF deneyin.');
        return;
      }

      setUploadingPdf(true);
      const fileData = await readPdfAsBase64(asset);

      setSelectedPdfData(fileData);
      setSelectedPdfName(fileName);
      setSelectedPdfMimeType(mimeType || 'application/pdf');
      setSelectedPdfSize(asset.size || null);
      setUploadedPdfName(null);
      setUploadedPdfUrl(null);

      Alert.alert('PDF seçildi', 'PDF, Google Drive’a kayıt işlemi sırasında yüklenecek.');
    } catch (error: any) {
      Alert.alert('PDF hatası', error?.message || 'PDF seçilirken bir sorun oluştu.');
    } finally {
      setUploadingPdf(false);
    }
  };

  const validateReferences = (trimmedRef: string): string | null => {
    const upperRef = trimmedRef.toLocaleUpperCase('tr-TR');
    if (referenceType === 'nrc' && !upperRef.includes('NRC')) {
      return 'NRC / item işleminde referans alanında NRC ibaresi ve NRC numarası bulunmalıdır.';
    }
    if (referenceType === 'service_release' && (!upperRef.includes('NRC') || !upperRef.includes('AML'))) {
      return 'Servise verme işleminde referans alanında hem NRC hem AML numarası bulunmalıdır.';
    }
    return null;
  };

  const handleSave = async () => {
    const trimmedWo = woNumber.trim();
    const trimmedRef = refNumber.trim();
    const trimmedDescription = description.trim();

    if (!date.trim() || !trimmedWo || !trimmedRef || !trimmedDescription) {
      Alert.alert('Eksik bilgi', 'Tarih, W/O numarası, referans ve açıklama alanlarını doldurun.');
      return;
    }

    const referenceError = validateReferences(trimmedRef);
    if (referenceError) {
      Alert.alert('Referans kuralı', referenceError);
      return;
    }

    if (isTtStampRequired(referenceType) && !ttStamped) {
      Alert.alert('TT Sicil Kaşesi gerekli', 'Bakım kartı veya NRC’ye göre yapılan işlemde aday personele ait TT Sicil Kaşesi bulunmalıdır.');
      return;
    }

    if (!selectedPdfData && !uploadedPdfUrl) {
      Alert.alert('Taranmış doküman gerekli', 'İşlemin kontrol edilebilmesi için ilgili dokümanın PDF kopyasını ekleyin.');
      return;
    }

    const payload: RawRecord = {
      action: isEditing ? 'update' : 'create',
      id: editingId,
      formGroup: selectedFormGroup,
      date: formatDateForDisplay(date),
      taskNo: selectedTask,
      taskName: getTaskById(selectedTask).name,
      woNumber: trimmedWo,
      referenceType,
      refNumber: trimmedRef,
      description: trimmedDescription,
      ttStamped,
    };

    if (selectedPdfData) {
      payload.fileData = selectedPdfData;
      payload.fileName = selectedPdfName || 'ek.pdf';
      payload.mimeType = selectedPdfMimeType || 'application/pdf';
    } else {
      if (uploadedPdfName) payload.pdfName = uploadedPdfName;
      if (uploadedPdfUrl) payload.pdfUrl = uploadedPdfUrl;
    }

    setSaving(true);
    try {
      const result = await postToGoogleScript(payload);
      if (result.status === 'success') {
        await AsyncStorage.multiSet([
          [TT_STAMP_STORAGE_KEY, ttStamped ? 'true' : 'false'],
          [REFERENCE_TYPE_STORAGE_KEY, referenceType],
        ]).catch((error) => console.log('Form ayarları kaydedilemedi:', error));
        Alert.alert('İşlem başarılı', result.message || (isEditing ? 'Kayıt güncellendi.' : 'Yeni kayıt eklendi.'));
        resetForm();
        await fetchRecords();
      } else {
        Alert.alert('İşlem başarısız', result.message || 'Google Script işlemi tamamlayamadı.');
      }
    } catch (error: any) {
      Alert.alert('Bağlantı hatası', error?.message || 'Google Drive ile bağlantı kurulamadı.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditSetup = (item: LogbookRecord) => {
    if (!item.id) {
      Alert.alert('Düzenlenemiyor', 'Bu kaydın ID bilgisi bulunamadı.');
      return;
    }

    setEditingId(item.id);
    setSelectedFormGroup(item.formGroup);
    setDate(toIsoDate(item.date));
    setSelectedTask(Number(item.taskNo) || selectedTask);
    setWoNumber(item.woNumber || '');
    setReferenceType(item.referenceType || defaultReferenceTypeForTask(item.taskNo));
    setRefNumber(item.refNumber || '');
    setDescription(item.description || '');
    setTtStamped(Boolean(item.ttStamped));
    setUploadedPdfName(item.pdfName || null);
    setUploadedPdfUrl(item.pdfUrl || null);
    setSelectedPdfData(null);
    setSelectedPdfName(null);
    setSelectedPdfMimeType('application/pdf');
    setSelectedPdfSize(null);
  };

  const deleteRecord = async (item: LogbookRecord) => {
    if (!item.id) {
      Alert.alert('Silinemiyor', 'Bu kaydın ID bilgisi bulunamadı. Listeyi yenileyip tekrar deneyin.');
      return;
    }

    setDeletingId(item.id);
    try {
      const result = await postToGoogleScript({
        action: 'delete',
        id: item.id,
        formGroup: item.formGroup,
      });

      if (result.status === 'success') {
        if (editingId === item.id) resetForm();
        setAllRecords((prev) => prev.filter((record) => record.id !== item.id));
        Alert.alert('Kayıt silindi', result.message || 'Logbook kaydı ve bağlı PDF silindi.');
      } else {
        Alert.alert('Silme başarısız', result.message || 'Silinecek kayıt Google Sheet içinde bulunamadı.');
        await fetchRecords();
      }
    } catch (error: any) {
      Alert.alert('Bağlantı hatası', error?.message || 'Silme işlemi sırasında bağlantı kurulamadı.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = async (item: LogbookRecord) => {
    const message = `${item.woNumber || 'Seçilen kayıt'} ve bağlı PDF kalıcı olarak silinecek. Devam edilsin mi?`;

    if (Platform.OS === 'web') {
      const confirmed =
        typeof globalThis !== 'undefined' && typeof (globalThis as any).confirm === 'function'
          ? (globalThis as any).confirm(message)
          : false;

      if (!confirmed) return;
      await deleteRecord(item);
      return;
    }

    Alert.alert('Kaydı sil', message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteRecord(item) },
    ]);
  };

  const handleOpenPdf = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('PDF açılamıyor', 'Bu PDF bağlantısı açılamıyor.');
        return;
      }
      await Linking.openURL(url);
    } catch (error: any) {
      Alert.alert('PDF hatası', error?.message || 'PDF bağlantısı açılırken bir sorun oluştu.');
    }
  };

  const renderRecord = ({ item }: { item: LogbookRecord }) => {
    const task = getTaskById(item.taskNo);
    const itemReferenceType = getReferenceType(item.referenceType);
    const ttRequired = isTtStampRequired(item.referenceType);
    const compliant = Boolean(
      item.date && item.woNumber && item.refNumber && item.description && item.pdfUrl && (!ttRequired || item.ttStamped),
    );
    const isDeletingThis = deletingId === item.id;

    return (
      <View style={styles.recordCard}>
        <View style={styles.recordTopRow}>
          <View style={styles.recordTitleArea}>
            <Text style={styles.recordDate}>{item.date || '-'}</Text>
            <Text style={styles.recordWo} numberOfLines={1}>W/O: {item.woNumber || '-'}</Text>
          </View>
          <View style={styles.recordBadgeStack}>
            <View style={styles.groupBadge}>
              <Text style={styles.groupBadgeText}>Grup {task.group}</Text>
            </View>
            <View style={[styles.complianceBadge, compliant ? styles.complianceBadgeOk : styles.complianceBadgeMissing]}>
              <Text style={[styles.complianceBadgeText, compliant ? styles.complianceBadgeTextOk : styles.complianceBadgeTextMissing]}>
                {compliant ? 'Uygun' : 'Eksik'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.recordTask} numberOfLines={2}>{task.id}. {task.name}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Tür</Text>
          <Text style={styles.infoValue}>{itemReferenceType.label}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ref</Text>
          <Text style={styles.infoValue}>{item.refNumber || '-'}</Text>
        </View>
        <View style={styles.recordMetaRow}>
          <View style={[styles.ttStatusBadge, item.ttStamped ? styles.ttStatusBadgeOn : styles.ttStatusBadgeOff]}>
            <Text style={[styles.ttStatusText, item.ttStamped ? styles.ttStatusTextOn : styles.ttStatusTextOff]}>
              {item.ttStamped ? 'TT mühürlü' : ttRequired ? 'TT mühür eksik' : 'TT zorunlu değil'}
            </Text>
          </View>
        </View>
        <Text style={styles.recordDescription}>{item.description || 'Açıklama girilmemiş.'}</Text>

        {item.pdfUrl ? (
          <TouchableOpacity style={styles.pdfLinkRow} onPress={() => handleOpenPdf(item.pdfUrl || '')} disabled={isBusy}>
            <Text style={styles.pdfLinkText}>{item.pdfName ? `PDF: ${item.pdfName}` : 'PDF dosyasını aç'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.missingPdfBadge}>
            <Text style={styles.missingPdfText}>Taranmış doküman/PDF eksik</Text>
          </View>
        )}

        <View style={styles.recordActions}>
          <TouchableOpacity
            style={[styles.smallButton, styles.editButton]}
            onPress={() => handleEditSetup(item)}
            disabled={isBusy}
          >
            <Text style={styles.editButtonText}>Düzenle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.smallButton, styles.deleteButton, isDeletingThis && styles.disabledButton]}
            onPress={() => handleDelete(item)}
            disabled={isBusy}
          >
            {isDeletingThis ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.deleteButtonText}>Sil</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const HeaderComponent = (
    <View>
      <View style={styles.hero}>
        <View>
          <Text style={styles.heroKicker}>MPM 2.4 / EK-16</Text>
          <Text style={styles.heroTitle}>Logbook Paneli</Text>
          <Text style={styles.heroSubtitle}>5 ayrı MOTM/12 formu ve uygunluk takibi</Text>
        </View>
        <View style={styles.heroCountBox}>
          <Text style={styles.heroCount}>{allRecords.length}</Text>
          <Text style={styles.heroCountLabel}>Toplam kayıt</Text>
        </View>
      </View>

      <View style={styles.rulesCard}>
        <View style={styles.rulesHeaderRow}>
          <View style={styles.rulesTitleArea}>
            <Text style={styles.rulesTitle}>Kural ve ilerleme durumu</Text>
            <Text style={styles.rulesSubtitle}>Aylık farklı gün sayısı 5 formdaki tüm kayıtlardan hesaplanır.</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={fetchRecords} disabled={fetching}>
            {fetching ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.refreshButtonText}>Yenile</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Kontrol ayı</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={progressMonth}
            onValueChange={(value) => setProgressMonth(String(value))}
            enabled={!fetching}
            dropdownIconColor={colors.primaryDark}
          >
            {monthOptions.map((month) => (
              <Picker.Item key={month} label={formatMonthLabel(month)} value={month} />
            ))}
          </Picker>
        </View>

        <View style={styles.monthMetricRow}>
          <View style={styles.monthMetricTextArea}>
            <Text style={styles.monthMetricValue}>{monthlyProgress.distinctDays} farklı gün</Text>
            <Text style={styles.monthMetricHint}>
              {monthlyProgress.recordCount} kayıt · minimum 12 gün, hedef 13 gün
            </Text>
          </View>
          <View style={[styles.monthStatusBadge, monthlyProgress.minimumMet ? styles.monthStatusBadgeOk : styles.monthStatusBadgeMissing]}>
            <Text style={[styles.monthStatusText, monthlyProgress.minimumMet ? styles.monthStatusTextOk : styles.monthStatusTextMissing]}>
              {monthlyProgress.recommendedMet ? '13 gün tamam' : monthlyProgress.minimumMet ? 'Minimum tamam' : `${MIN_MONTHLY_DISTINCT_DAYS - monthlyProgress.distinctDays} gün eksik`}
            </Text>
          </View>
        </View>
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(100, (monthlyProgress.distinctDays / RECOMMENDED_MONTHLY_DISTINCT_DAYS) * 100)}%` },
            ]}
          />
        </View>

        <View style={styles.groupProgressList}>
          {groupProgress.map((progress) => (
            <TouchableOpacity
              key={progress.group}
              style={[styles.groupProgressRow, selectedFormGroup === progress.group && styles.groupProgressRowSelected]}
              onPress={() => handleFormGroupChange(progress.group)}
              disabled={isEditing || saving}
            >
              <View style={styles.groupProgressMain}>
                <Text style={styles.groupProgressTitle}>Grup {progress.group}{progress.optional ? ' · Optional' : ''}</Text>
                <Text style={styles.groupProgressDetail}>
                  {progress.optional
                    ? `${progress.total} kayıt · ${progress.coveredCount}/${progress.requiredCount} optional task türü`
                    : `${progress.total}/${progress.minimum} kayıt · ${progress.coveredCount}/${progress.requiredCount} task türü`}
                </Text>
                {!progress.optional && progress.missingTaskIds.length > 0 && (
                  <Text style={styles.groupProgressMissing}>Eksik task: {progress.missingTaskIds.join(', ')}</Text>
                )}
              </View>
              <View style={[styles.groupStatusDot, progress.complete ? styles.groupStatusDotOk : styles.groupStatusDotMissing]} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>{isEditing ? 'Kaydı düzenle' : 'Yeni kayıt oluştur'}</Text>
          {isEditing && <Text style={styles.editingPill}>Düzenleme modu</Text>}
        </View>

        <Text style={styles.label}>MOTM/12 form grubu</Text>
        <View style={styles.formTabs}>
          {FORM_GROUPS.map((group) => (
            <TouchableOpacity
              key={group}
              style={[styles.formTab, selectedFormGroup === group && styles.formTabSelected]}
              onPress={() => handleFormGroupChange(group)}
              disabled={isEditing || saving}
            >
              <Text style={[styles.formTabText, selectedFormGroup === group && styles.formTabTextSelected]}>
                {group === 5 ? '5 Optional' : `Grup ${group}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {isEditing && <Text style={styles.lockedFieldHint}>Düzenleme sırasında kayıt başka form grubuna taşınamaz.</Text>}

        <Text style={styles.label}>Yapılan task</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedTask}
            onValueChange={(itemValue) => handleTaskChange(Number(itemValue))}
            enabled={!saving}
            dropdownIconColor={colors.primaryDark}
          >
            {tasksForSelectedGroup.map((task) => (
              <Picker.Item key={task.id} label={`${task.id} - ${task.name}`} value={task.id} />
            ))}
          </Picker>
        </View>

        <View style={styles.dateFieldGroup}>
          <Text style={styles.label}>Tarih</Text>
          <DatePickerField value={date} onChange={setDate} disabled={saving} />
        </View>

        <Text style={styles.label}>Referans türü</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={referenceType}
            onValueChange={(value) => handleReferenceTypeChange(value as ReferenceType)}
            enabled={!saving}
            dropdownIconColor={colors.primaryDark}
          >
            {REFERENCE_TYPES.map((item) => (
              <Picker.Item key={item.value} label={item.label} value={item.value} />
            ))}
          </Picker>
        </View>
        <Text style={styles.referenceHint}>{selectedReferenceType.hint}</Text>

        <View style={styles.twoColumnRow}>
          <View style={styles.twoColumnItem}>
            <Text style={styles.label}>W/O numarası</Text>
            <TextInput
              style={styles.input}
              value={woNumber}
              onChangeText={setWoNumber}
              placeholder="WO-XXXXXX"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
            />
          </View>
          <View style={styles.twoColumnItem}>
            <Text style={styles.label}>Referans no</Text>
            <TextInput
              style={styles.input}
              value={refNumber}
              onChangeText={setRefNumber}
              placeholder={referenceType === 'service_release' ? 'NRC ... / AML ...' : referenceType === 'nrc' ? 'NRC ...' : 'Kart No ...'}
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
            />
          </View>
        </View>

        <Text style={styles.label}>İşin kısa ve teknik açıklaması</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Yapılan işi, task içeriğini ve doküman referansını anlaşılır şekilde yazın"
          placeholderTextColor={colors.muted}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => handleTtStampedChange(!ttStamped)}
          disabled={saving}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ttStamped, disabled: saving }}
        >
          <View style={[styles.checkboxBox, ttStamped && styles.checkboxBoxChecked]}>
            {ttStamped && <Text style={styles.checkboxCheck}>✓</Text>}
          </View>
          <View style={styles.checkboxTextArea}>
            <Text style={styles.checkboxLabel}>TT mühürlü</Text>
            <Text style={styles.checkboxHint}>
              {isTtStampRequired(referenceType)
                ? 'Bakım kartı/NRC adımında aday personele ait TT Sicil Kaşesi bulunduğunu onaylar.'
                : 'Servise verme/yalnız AML işleminde zorunlu değildir; işaretlenebilir.'}
            </Text>
          </View>
        </TouchableOpacity>

        {!isTtStampRequired(referenceType) && !ttStamped && (
          <View style={styles.exceptionNote}>
            <Text style={styles.exceptionNoteText}>TT istisnası uygulanıyor: NRC + AML ve aday personele ait Adam/Saat kaydı bulunmalıdır.</Text>
          </View>
        )}

        <View style={styles.pdfSection}>
          <Text style={styles.label}>Taranmış doküman / PDF</Text>
          <Text style={styles.pdfHint}>
            Kayıt kontrolü taranmış dokümandan yapılacağı için PDF zorunludur. Yeni tarihli işlemlerin kopyasını Easyarchive taraması tamamlanmadan saklayın.
          </Text>

          {selectedPdfName && !uploadedPdfUrl && (
            <View style={styles.pdfPendingBadge}>
              <Text style={styles.pdfPendingText} numberOfLines={2}>
                Seçildi: {selectedPdfName}{selectedPdfSize ? ` (${Math.round(selectedPdfSize / 1024)} KB)` : ''}
              </Text>
            </View>
          )}

          {uploadedPdfName && uploadedPdfUrl && (
            <View style={styles.pdfSuccessBadge}>
              <Text style={styles.pdfSuccessText} numberOfLines={2}>Ekli PDF: {uploadedPdfName}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.pdfButton, (isBusy || uploadingPdf) && styles.disabledButton]}
            onPress={handlePdfUpload}
            disabled={isBusy || uploadingPdf}
          >
            {uploadingPdf ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.pdfButtonText}>{selectedPdfName || uploadedPdfName ? 'PDF değiştir' : 'PDF seç'}</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, isEditing && styles.updateButton, saving && styles.disabledButton]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{isEditing ? 'Değişiklikleri güncelle' : 'Google Drive’a kaydet'}</Text>
          )}
        </TouchableOpacity>

        {isEditing && (
          <TouchableOpacity style={styles.secondaryButton} onPress={resetForm} disabled={saving}>
            <Text style={styles.secondaryButtonText}>Düzenlemeyi iptal et</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.listHeaderRow}>
        <View style={styles.listHeaderTextArea}>
          <Text style={styles.sectionTitle}>Mevcut kayıtlar</Text>
          <Text style={styles.sectionSubtitle}>
            Grup {selectedFormGroup} · tarihe göre yeni → eski · {records.length} kayıt
          </Text>
        </View>
        <View style={styles.listGroupBadge}>
          <Text style={styles.listGroupBadgeText}>{selectedFormGroup === 5 ? 'Optional form' : `Form ${selectedFormGroup}/5`}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          renderItem={renderRecord}
          ListHeaderComponent={HeaderComponent}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              {fetching ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Text style={styles.emptyTitle}>Bu form grubu için kayıt yok</Text>
                  <Text style={styles.emptyText}>Yeni kayıt eklediğinizde burada listelenecek.</Text>
                </>
              )}
            </View>
          }
          refreshControl={<RefreshControl refreshing={fetching} onRefresh={fetchRecords} />}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroKicker: {
    color: '#BFDBFE',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 4,
  },
  heroSubtitle: {
    color: '#DBEAFE',
    fontSize: 13,
    marginTop: 6,
    maxWidth: 220,
  },
  heroCountBox: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  heroCount: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  heroCountLabel: {
    color: '#DBEAFE',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    position: 'relative',
    overflow: 'visible',
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  editingPill: {
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '800',
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 7,
  },
  pickerContainer: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  dateFieldGroup: {
    position: 'relative',
    zIndex: 9000,
    elevation: 9000,
    overflow: 'visible',
  },
  twoColumnRow: {
    position: 'relative',
    zIndex: 5000,
    elevation: 5000,
    overflow: 'visible',
    flexDirection: 'row',
    gap: 12,
  },
  twoColumnItem: {
    position: 'relative',
    zIndex: 5000,
    elevation: 5000,
    overflow: 'visible',
    flex: 1,
  },
  input: {
    minHeight: 48,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  datePickerContainer: {
    position: 'relative',
    zIndex: 9000,
    elevation: 9000,
    overflow: 'visible',
  },
  datePickerButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  datePickerButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  datePickerText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
  },
  datePickerIcon: {
    fontSize: 17,
  },
  calendarPanel: {
    position: Platform.OS === 'web' ? 'absolute' : 'relative',
    top: Platform.OS === 'web' ? 54 : undefined,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 28,
    elevation: 10000,
    zIndex: 10000,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  calendarNavButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  calendarNavText: {
    color: colors.primaryDark,
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 27,
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayButton: {
    width: '14.2857%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    marginVertical: 2,
  },
  calendarDayOutside: {
    opacity: 0.35,
  },
  calendarDayToday: {
    backgroundColor: colors.primarySoft,
  },
  calendarDaySelected: {
    backgroundColor: colors.primary,
  },
  calendarDayText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  calendarDayTextOutside: {
    color: colors.muted,
  },
  calendarDayTextToday: {
    color: colors.primary,
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
  },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  calendarFooterButton: {
    minHeight: 34,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarFooterButtonText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  textArea: {
    minHeight: 92,
    lineHeight: 20,
  },
  pdfSection: {
    marginTop: 4,
  },
  pdfHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  pdfPendingBadge: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  pdfPendingText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '800',
  },
  pdfSuccessBadge: {
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  pdfSuccessText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '800',
  },
  pdfButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  pdfButtonText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '900',
  },
  primaryButton: {
    position: 'relative',
    zIndex: 1,
    elevation: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  updateButton: {
    backgroundColor: colors.warning,
  },
  disabledButton: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.muted,
    fontWeight: '900',
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  refreshButton: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  refreshButtonText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 12,
  },
  recordCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recordTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  recordTitleArea: {
    flex: 1,
  },
  recordDate: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  recordWo: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 3,
  },
  groupBadge: {
    backgroundColor: colors.successSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  groupBadgeText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '900',
  },
  recordTask: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  infoValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  recordDescription: {
    color: colors.muted,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    lineHeight: 19,
    fontSize: 13,
  },
  pdfLinkRow: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pdfLinkText: {
    color: colors.primary,
    fontWeight: '900',
  },
  recordActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  smallButton: {
    minWidth: 92,
    minHeight: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  editButton: {
    backgroundColor: colors.warningSoft,
  },
  deleteButton: {
    backgroundColor: colors.dangerSoft,
  },
  editButtonText: {
    color: colors.warning,
    fontWeight: '900',
  },
  deleteButtonText: {
    color: colors.danger,
    fontWeight: '900',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },

  rulesCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rulesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  rulesTitleArea: {
    flex: 1,
  },
  rulesTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  rulesSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  monthMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
  },
  monthMetricTextArea: {
    flex: 1,
  },
  monthMetricValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  monthMetricHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  monthStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  monthStatusBadgeOk: {
    backgroundColor: colors.successSoft,
  },
  monthStatusBadgeMissing: {
    backgroundColor: colors.warningSoft,
  },
  monthStatusText: {
    fontSize: 11,
    fontWeight: '900',
  },
  monthStatusTextOk: {
    color: colors.success,
  },
  monthStatusTextMissing: {
    color: colors.warning,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  groupProgressList: {
    marginTop: 14,
    gap: 8,
  },
  groupProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupProgressRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  groupProgressMain: {
    flex: 1,
  },
  groupProgressTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  groupProgressDetail: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  groupProgressMissing: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
  },
  groupStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: 10,
  },
  groupStatusDotOk: {
    backgroundColor: colors.success,
  },
  groupStatusDotMissing: {
    backgroundColor: colors.warning,
  },
  formTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formTab: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTabSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  formTabText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  formTabTextSelected: {
    color: '#FFFFFF',
  },
  lockedFieldHint: {
    color: colors.warning,
    fontSize: 11,
    marginTop: 7,
  },
  referenceHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 14,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.muted,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxBoxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxCheck: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  checkboxTextArea: {
    flex: 1,
  },
  checkboxLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  checkboxHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  exceptionNote: {
    backgroundColor: colors.successSoft,
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  exceptionNoteText: {
    color: colors.success,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  recordBadgeStack: {
    alignItems: 'flex-end',
    gap: 6,
  },
  complianceBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  complianceBadgeOk: {
    backgroundColor: colors.successSoft,
  },
  complianceBadgeMissing: {
    backgroundColor: colors.warningSoft,
  },
  complianceBadgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
  complianceBadgeTextOk: {
    color: colors.success,
  },
  complianceBadgeTextMissing: {
    color: colors.warning,
  },
  recordMetaRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  ttStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ttStatusBadgeOn: {
    backgroundColor: colors.successSoft,
  },
  ttStatusBadgeOff: {
    backgroundColor: colors.warningSoft,
  },
  ttStatusText: {
    fontSize: 11,
    fontWeight: '900',
  },
  ttStatusTextOn: {
    color: colors.success,
  },
  ttStatusTextOff: {
    color: colors.warning,
  },
  missingPdfBadge: {
    marginTop: 10,
    padding: 11,
    borderRadius: 13,
    backgroundColor: colors.dangerSoft,
  },
  missingPdfText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  listHeaderTextArea: {
    flex: 1,
  },
  listGroupBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  listGroupBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },

});
