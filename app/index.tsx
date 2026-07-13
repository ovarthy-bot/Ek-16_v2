import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw2J1BfjftIev4NKDJGekkVTnnHoa0T7qwF-LCD6R6NGTRQhIPI1zdpLSsW17RE9rwU/exec';

const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024;
const REQUIRED_GROUP_RECORD_COUNT = 10;
const MONTH_MIN_UNIQUE_DAYS = 12;
const MONTH_SAFE_UNIQUE_DAYS = 13;

const TASKS_DATA = [
  { id: 1, name: 'Uçak defterinde arıza kaydı', group: 1, optional: false },
  { id: 2, name: "Uçak defterinde MEL'e göre sefere verme", group: 1, optional: false },
  { id: 3, name: 'Servis işlemleri (Yağlama)', group: 2, optional: false },
  { id: 4, name: 'Servis işlemleri (Motor hidrolik ikmal)', group: 2, optional: false },
  { id: 5, name: 'Servis işlemleri (Lastik değişimi)', group: 2, optional: false },
  { id: 6, name: 'Günlük, haftalık kartlar, ETOPS servis kartları', group: 3, optional: false },
  { id: 7, name: 'Bakıma hazırlık / Bakım çıkış kartları', group: 3, optional: false },
  { id: 8, name: 'TSM/FIM kullanma', group: 4, optional: false },
  { id: 9, name: 'Komponent söküm takımları', group: 4, optional: false },
  { id: 10, name: 'Sistem/komponent testleri', group: 4, optional: false },
  { id: 11, name: 'Yazılım / Medya / Yükleme / İndirme', group: 4, optional: false },
  { id: 12, name: 'Motor Söküm Takımları (Optional)', group: 5, optional: true },
  { id: 13, name: 'Park / Depolama (Optional)', group: 5, optional: true },
] as const;

type TaskItem = (typeof TASKS_DATA)[number];
type RawRecord = Record<string, any>;

type LogbookRecord = {
  id: string;
  date: string;
  dateIso: string;
  taskNo: number;
  woNumber: string;
  refNumber: string;
  description: string;
  combinedText?: string;
  pdfName?: string;
  pdfUrl?: string;
};

type DraftSectionDefinition = {
  key: string;
  title: string;
  requiredTaskIds: number[];
  targetCount: number;
  optional: boolean;
};

type DraftSection = DraftSectionDefinition & {
  records: LogbookRecord[];
  missingTaskIds: number[];
  availableCount: number;
};

type MonthStatus = {
  month: string;
  selectedDays: number;
  availableDays: number;
  status: 'valid' | 'borderline' | 'invalid';
};

const REQUIRED_SECTION_DEFINITIONS: DraftSectionDefinition[] = [
  {
    key: 'group-1',
    title: 'Grup 1 — Uçak Defteri İşlemleri',
    requiredTaskIds: [1, 2],
    targetCount: REQUIRED_GROUP_RECORD_COUNT,
    optional: false,
  },
  {
    key: 'group-2',
    title: 'Grup 2 — Servis İşlemleri',
    requiredTaskIds: [3, 4, 5],
    targetCount: REQUIRED_GROUP_RECORD_COUNT,
    optional: false,
  },
  {
    key: 'group-3',
    title: 'Grup 3 — Bakım Kartları',
    requiredTaskIds: [6, 7],
    targetCount: REQUIRED_GROUP_RECORD_COUNT,
    optional: false,
  },
  {
    key: 'group-4',
    title: 'Grup 4 — Troubleshooting / Söküm / Test',
    requiredTaskIds: [8, 9, 10, 11],
    targetCount: REQUIRED_GROUP_RECORD_COUNT,
    optional: false,
  },
];

const OPTIONAL_SECTION_DEFINITIONS: DraftSectionDefinition[] = TASKS_DATA.filter(
  (task) => task.optional,
).map((task) => ({
  key: `optional-${task.id}`,
  title: `Optional — ${task.name.replace(' (Optional)', '')}`,
  requiredTaskIds: [task.id],
  targetCount: REQUIRED_GROUP_RECORD_COUNT,
  optional: true,
}));

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
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  success: '#15803D',
  successSoft: '#DCFCE7',
};

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const MONTH_LOOKUP: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  oca: 1,
  sub: 2,
  şub: 2,
  martr: 3,
  nis: 4,
  maytr: 5,
  haz: 6,
  tem: 7,
  agu: 8,
  ağu: 8,
  eyl: 9,
  eki: 10,
  kas: 11,
  ara: 12,
};

function pad2(value: number | string): string {
  return String(value).padStart(2, '0');
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function parseDateToIso(value: unknown): string {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${pad2(isoMatch[2])}-${pad2(isoMatch[3])}`;
  }

  const slashMonthMatch = text.match(/^(\d{1,2})\/([A-Za-zÇĞİÖŞÜçğıöşü]{3,})\/(\d{4})$/);
  if (slashMonthMatch) {
    const day = Number(slashMonthMatch[1]);
    const rawMonth = slashMonthMatch[2].toLocaleLowerCase('tr-TR').slice(0, 3);
    const normalizedMonth = rawMonth.replace('ı', 'i');
    const month = MONTH_LOOKUP[rawMonth] || MONTH_LOOKUP[normalizedMonth];
    const year = Number(slashMonthMatch[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  const numericDateMatch = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (numericDateMatch) {
    const day = Number(numericDateMatch[1]);
    const month = Number(numericDateMatch[2]);
    const year = Number(numericDateMatch[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }

  return '';
}

function toFormIsoDate(value: unknown): string {
  return parseDateToIso(value) || todayIso();
}

function formatDateForDisplay(value: unknown): string {
  const isoDate = parseDateToIso(value);
  if (!isoDate) return String(value || '-');
  const [year, month, day] = isoDate.split('-');
  return `${day}/${MONTHS_EN[Number(month) - 1] || month}/${year}`;
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return `${MONTHS_TR[month - 1]} ${year}`;
}

function getTaskById(taskId: number | string): TaskItem {
  const parsedId = Number(taskId);
  return TASKS_DATA.find((task) => task.id === parsedId) || TASKS_DATA[0];
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

function normalizeRecord(item: RawRecord): LogbookRecord {
  const rawDate = getRawValue(item, ['date', 'Tarih', 'tarih']);
  const dateIso = parseDateToIso(rawDate);
  return {
    id: getRawValue(item, ['id', 'ID', 'Id']),
    date: formatDateForDisplay(rawDate),
    dateIso,
    taskNo: Number(getRawValue(item, ['taskNo', 'Task No', 'task no', 'TaskNo'], '1')) || 1,
    woNumber: getRawValue(item, ['woNumber', 'W/O Numarası', 'W/O Numarasi', 'WO Numarası', 'w/o numarası']),
    refNumber: getRawValue(item, ['refNumber', 'Referans No', 'Referans no', 'referans no']),
    description: getRawValue(item, ['description', 'Açıklama', 'Aciklama', 'açıklama', 'aciklama']),
    combinedText: getRawValue(item, ['combinedText', 'Birleşik Teknik Metin', 'Birlesik Teknik Metin']),
    pdfName: getRawValue(item, ['pdfName', 'PDF Adı', 'PDF Dosyası']),
    pdfUrl: getRawValue(item, ['pdfUrl', 'PDF URL', 'Pdf Url']),
  };
}

function recordIdentity(record: LogbookRecord): string {
  return (
    record.id ||
    [record.taskNo, record.dateIso, record.woNumber, record.refNumber, record.description]
      .map((value) => String(value || '').trim().toLocaleLowerCase('tr-TR'))
      .join('|')
  );
}

function dedupeRecords(records: LogbookRecord[]): LogbookRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = recordIdentity(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortRecordsChronologically(records: LogbookRecord[]): LogbookRecord[] {
  return [...records].sort((a, b) => {
    if (!a.dateIso && !b.dateIso) return recordIdentity(a).localeCompare(recordIdentity(b));
    if (!a.dateIso) return 1;
    if (!b.dateIso) return -1;
    return a.dateIso.localeCompare(b.dateIso) || recordIdentity(a).localeCompare(recordIdentity(b));
  });
}

function buildAvailableMonthDays(records: LogbookRecord[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  records.forEach((record) => {
    if (!record.dateIso) return;
    const month = record.dateIso.slice(0, 7);
    if (!result.has(month)) result.set(month, new Set<string>());
    result.get(month)?.add(record.dateIso);
  });
  return result;
}

type SelectionContext = {
  selectedIdentities: Set<string>;
  globalDates: Set<string>;
  monthDates: Map<string, Set<string>>;
  taskCounts: Map<number, number>;
  availableMonthDays: Map<string, Set<string>>;
};

function createSelectionContext(allRecords: LogbookRecord[]): SelectionContext {
  return {
    selectedIdentities: new Set<string>(),
    globalDates: new Set<string>(),
    monthDates: new Map<string, Set<string>>(),
    taskCounts: new Map<number, number>(),
    availableMonthDays: buildAvailableMonthDays(allRecords),
  };
}

function registerSelection(record: LogbookRecord, context: SelectionContext) {
  context.selectedIdentities.add(recordIdentity(record));
  context.taskCounts.set(record.taskNo, (context.taskCounts.get(record.taskNo) || 0) + 1);

  if (!record.dateIso) return;
  context.globalDates.add(record.dateIso);
  const month = record.dateIso.slice(0, 7);
  if (!context.monthDates.has(month)) context.monthDates.set(month, new Set<string>());
  context.monthDates.get(month)?.add(record.dateIso);
}

function candidateScore(
  record: LogbookRecord,
  context: SelectionContext,
  sectionSelected: LogbookRecord[],
): number {
  let score = 0;

  if (record.dateIso) {
    const month = record.dateIso.slice(0, 7);
    const selectedMonthDays = context.monthDates.get(month)?.size || 0;
    const availableMonthDays = context.availableMonthDays.get(month)?.size || 0;
    const isNewGlobalDay = !context.globalDates.has(record.dateIso);
    const isNewSectionDay = !sectionSelected.some((item) => item.dateIso === record.dateIso);

    if (isNewGlobalDay) score += 1000;
    if (isNewSectionDay) score += 160;

    // Önce her ayı 12 farklı güne ulaştırmaya, ardından güvenli hedef olan 13. güne çıkarmaya çalışır.
    if (isNewGlobalDay && availableMonthDays >= MONTH_MIN_UNIQUE_DAYS) {
      if (selectedMonthDays < MONTH_MIN_UNIQUE_DAYS) {
        score += 650 + selectedMonthDays * 8;
      } else if (selectedMonthDays < MONTH_SAFE_UNIQUE_DAYS) {
        score += 220;
      }
    }

    const dayOfMonth = Number(record.dateIso.slice(8, 10));
    const selectedDaysInMonth = sectionSelected
      .filter((item) => item.dateIso?.startsWith(month))
      .map((item) => Number(item.dateIso.slice(8, 10)));
    if (selectedDaysInMonth.length > 0) {
      const nearestDistance = Math.min(...selectedDaysInMonth.map((day) => Math.abs(day - dayOfMonth)));
      score += Math.min(nearestDistance, 15) * 3;
    }
  } else {
    score -= 500;
  }

  const taskCount = context.taskCounts.get(record.taskNo) || 0;
  score += Math.max(0, 140 - taskCount * 25);

  const duplicateWo = sectionSelected.some(
    (item) => item.woNumber && record.woNumber && item.woNumber === record.woNumber,
  );
  if (duplicateWo) score -= 180;

  const hasTechnicalContent = Boolean(record.description.trim() && record.refNumber.trim() && record.woNumber.trim());
  if (hasTechnicalContent) score += 40;

  return score;
}

function pickBestCandidate(
  candidates: LogbookRecord[],
  context: SelectionContext,
  sectionSelected: LogbookRecord[],
): LogbookRecord | null {
  const eligible = candidates.filter(
    (record) =>
      Boolean(record.dateIso) &&
      !context.selectedIdentities.has(recordIdentity(record)) &&
      !context.globalDates.has(record.dateIso),
  );
  if (eligible.length === 0) return null;

  return [...eligible].sort((a, b) => {
    const scoreDifference = candidateScore(b, context, sectionSelected) - candidateScore(a, context, sectionSelected);
    if (scoreDifference !== 0) return scoreDifference;
    if (a.dateIso && b.dateIso) return a.dateIso.localeCompare(b.dateIso);
    if (a.dateIso) return -1;
    if (b.dateIso) return 1;
    return recordIdentity(a).localeCompare(recordIdentity(b));
  })[0];
}

function technicalRecordScore(record: LogbookRecord): number {
  let score = 0;
  if (record.woNumber.trim()) score += 4;
  if (record.refNumber.trim()) score += 3;
  if (record.description.trim()) score += 3;
  if (record.pdfUrl?.trim()) score += 1;
  return score;
}

function uniqueDatedRecordCount(records: LogbookRecord[]): number {
  return new Set(records.map((record) => record.dateIso).filter(Boolean)).size;
}

/**
 * Her zorunlu iş türüne mümkünse farklı bir gün atar.
 * Aynı gün için birden fazla iş varsa, eşleştirme diğer iş türlerini alternatif
 * günlere taşıyarak maksimum iş türü kapsamını korumaya çalışır.
 */
function matchRequiredTasksToUniqueDates(records: LogbookRecord[]): Map<number, LogbookRecord> {
  const requiredTaskIds = REQUIRED_SECTION_DEFINITIONS.flatMap((section) => section.requiredTaskIds);
  const candidatesByTask = new Map<number, LogbookRecord[]>();

  requiredTaskIds.forEach((taskId) => {
    const bestRecordByDate = new Map<string, LogbookRecord>();

    records
      .filter((record) => record.taskNo === taskId && Boolean(record.dateIso))
      .forEach((record) => {
        const current = bestRecordByDate.get(record.dateIso);
        if (
          !current ||
          technicalRecordScore(record) > technicalRecordScore(current) ||
          (technicalRecordScore(record) === technicalRecordScore(current) &&
            recordIdentity(record).localeCompare(recordIdentity(current)) < 0)
        ) {
          bestRecordByDate.set(record.dateIso, record);
        }
      });

    candidatesByTask.set(
      taskId,
      [...bestRecordByDate.values()].sort((a, b) => {
        const qualityDifference = technicalRecordScore(b) - technicalRecordScore(a);
        if (qualityDifference !== 0) return qualityDifference;
        return a.dateIso.localeCompare(b.dateIso);
      }),
    );
  });

  const taskOrder = [...requiredTaskIds].sort((a, b) => {
    const candidateDifference =
      (candidatesByTask.get(a)?.length || 0) - (candidatesByTask.get(b)?.length || 0);
    return candidateDifference || a - b;
  });

  const dateOwner = new Map<string, number>();
  const taskSelection = new Map<number, LogbookRecord>();

  const tryAssign = (taskId: number, visitedDates: Set<string>, visitedTasks: Set<number>): boolean => {
    if (visitedTasks.has(taskId)) return false;
    visitedTasks.add(taskId);

    const candidates = candidatesByTask.get(taskId) || [];
    for (const candidate of candidates) {
      const candidateDate = candidate.dateIso;
      if (!candidateDate || visitedDates.has(candidateDate)) continue;
      visitedDates.add(candidateDate);

      const currentOwner = dateOwner.get(candidateDate);
      if (
        currentOwner === undefined ||
        tryAssign(currentOwner, visitedDates, visitedTasks)
      ) {
        dateOwner.set(candidateDate, taskId);
        taskSelection.set(taskId, candidate);
        return true;
      }
    }

    return false;
  };

  taskOrder.forEach((taskId) => {
    tryAssign(taskId, new Set<string>(), new Set<number>());
  });

  return taskSelection;
}

function createDraft(records: LogbookRecord[]): {
  requiredSections: DraftSection[];
  optionalSections: DraftSection[];
  selectedRecords: LogbookRecord[];
  monthStatuses: MonthStatus[];
} {
  const uniqueRecords = dedupeRecords(records);
  const context = createSelectionContext(uniqueRecords);

  const workingRequired = REQUIRED_SECTION_DEFINITIONS.map((definition) => ({
    definition,
    candidates: uniqueRecords.filter((record) => definition.requiredTaskIds.includes(record.taskNo)),
    selected: [] as LogbookRecord[],
  }));

  // 1. Her zorunlu iş türünden en az bir adet, mükerrer gün oluşturmadan seçilir.
  const requiredCoverageSelections = matchRequiredTasksToUniqueDates(uniqueRecords);
  workingRequired.forEach((section) => {
    section.definition.requiredTaskIds.forEach((taskId) => {
      const candidate = requiredCoverageSelections.get(taskId);
      if (candidate) section.selected.push(candidate);
    });
  });

  // Eşleştirme bittikten sonra seçimler topluca kaydedilir; böylece aynı gün hiçbir grupta tekrar kullanılamaz.
  workingRequired.forEach((section) => {
    section.selected.forEach((record) => registerSelection(record, context));
  });

  // 2. Gruplar sırayla doldurulur. Böylece ilk grup bütün iyi tarihleri tek başına tüketmez.
  let addedInRound = true;
  while (addedInRound) {
    addedInRound = false;
    workingRequired.forEach((section) => {
      if (section.selected.length >= section.definition.targetCount) return;
      const candidate = pickBestCandidate(section.candidates, context, section.selected);
      if (!candidate) return;
      section.selected.push(candidate);
      registerSelection(candidate, context);
      addedInRound = true;
    });

    if (workingRequired.every((section) => section.selected.length >= section.definition.targetCount)) break;
  }

  const requiredSections: DraftSection[] = workingRequired.map((section) => ({
    ...section.definition,
    records: sortRecordsChronologically(section.selected).slice(0, section.definition.targetCount),
    missingTaskIds: section.definition.requiredTaskIds.filter(
      (taskId) => !section.selected.some((record) => record.taskNo === taskId),
    ),
    availableCount: uniqueDatedRecordCount(section.candidates),
  }));

  // 3. Optional işlemler birbirinden ayrı taslaklarda gösterilir ve zorunlu kayıtları tüketmez.
  const optionalSections: DraftSection[] = OPTIONAL_SECTION_DEFINITIONS.map((definition) => {
    const candidates = uniqueRecords.filter((record) => definition.requiredTaskIds.includes(record.taskNo));
    const selected: LogbookRecord[] = [];

    while (selected.length < definition.targetCount) {
      const candidate = pickBestCandidate(candidates, context, selected);
      if (!candidate) break;
      selected.push(candidate);
      registerSelection(candidate, context);
    }

    return {
      ...definition,
      records: sortRecordsChronologically(selected),
      missingTaskIds: [],
      availableCount: uniqueDatedRecordCount(candidates),
    };
  }).filter((section) => section.availableCount > 0);

  const selectedRecords = [...requiredSections, ...optionalSections].flatMap((section) => section.records);
  const selectedMonthDays = buildAvailableMonthDays(selectedRecords);
  const availableMonthDays = buildAvailableMonthDays(uniqueRecords);
  const monthKeys = [...new Set([...selectedMonthDays.keys(), ...availableMonthDays.keys()])].sort();

  const monthStatuses: MonthStatus[] = monthKeys.map((month) => {
    const selectedDays = selectedMonthDays.get(month)?.size || 0;
    const availableDays = availableMonthDays.get(month)?.size || 0;
    return {
      month,
      selectedDays,
      availableDays,
      status:
        selectedDays >= MONTH_SAFE_UNIQUE_DAYS
          ? 'valid'
          : selectedDays >= MONTH_MIN_UNIQUE_DAYS
            ? 'borderline'
            : 'invalid',
    };
  });

  return { requiredSections, optionalSections, selectedRecords, monthStatuses };
}

type DocumentPickerAsset = DocumentPicker.DocumentPickerAsset;

async function readPdfAsBase64(asset: DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web') {
    if ((asset as any).base64) return String((asset as any).base64);

    if ((asset as any).file) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('PDF dosyası okunamadı.'));
        reader.readAsDataURL((asset as any).file as Blob);
      });
      const base64 = dataUrl.split(',')[1];
      if (!base64) throw new Error('PDF dosyası okunamadı.');
      return base64;
    }

    const response = await fetch(asset.uri);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  return FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function postToGoogleScript(payload: RawRecord) {
  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Google Script JSON cevap döndürmedi: ${text.slice(0, 160)}`);
  }
}

async function fetchGroupRecords(formGroup: number): Promise<LogbookRecord[]> {
  const response = await fetch(`${GOOGLE_SCRIPT_URL}?formGroup=${encodeURIComponent(String(formGroup))}`);
  const data = await response.json();

  const rawList = Array.isArray(data) ? data : Array.isArray(data?.records) ? data.records : [];
  return rawList.map(normalizeRecord).filter((record: LogbookRecord) => record.id || record.woNumber);
}

export default function App() {
  const [selectedTask, setSelectedTask] = useState<number>(1);
  const [date, setDate] = useState(todayIso());
  const [woNumber, setWoNumber] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [description, setDescription] = useState('');
  const [allRecords, setAllRecords] = useState<LogbookRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [selectedPdfData, setSelectedPdfData] = useState<string | null>(null);
  const [selectedPdfName, setSelectedPdfName] = useState<string | null>(null);
  const [uploadedPdfName, setUploadedPdfName] = useState<string | null>(null);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedTaskObj = useMemo(() => getTaskById(selectedTask), [selectedTask]);
  const isEditing = Boolean(editingId);
  const isBusy = fetching || saving || uploadingPdf || Boolean(deletingId);

  const selectedGroupRecords = useMemo(
    () =>
      sortRecordsChronologically(
        allRecords.filter((record) => getTaskById(record.taskNo).group === selectedTaskObj.group),
      ),
    [allRecords, selectedTaskObj.group],
  );

  const draft = useMemo(() => createDraft(allRecords), [allRecords]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setSelectedTask(1);
    setDate(todayIso());
    setWoNumber('');
    setRefNumber('');
    setDescription('');
    setSelectedPdfData(null);
    setSelectedPdfName(null);
    setUploadedPdfName(null);
    setUploadedPdfUrl(null);
  }, []);

  const fetchAllRecords = useCallback(async () => {
    setFetching(true);
    try {
      const groupResults = await Promise.all([1, 2, 3, 4, 5].map(fetchGroupRecords));
      setAllRecords(dedupeRecords(groupResults.flat()));
    } catch (error) {
      Alert.alert(
        'Listeleme hatası',
        'Google Drive kayıtlarının tamamı alınamadı. İnternet bağlantısını ve Apps Script Web App yetkilerini kontrol edin.',
      );
      console.log('Kayıtları çekme hatası:', error);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchAllRecords();
  }, [fetchAllRecords]);

  const handlePdfSelect = async () => {
    try {
      const result: any = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        ...(Platform.OS === 'web' ? { base64: true } : {}),
      });

      if (result?.canceled || result?.type === 'cancel') return;
      const asset: DocumentPickerAsset | undefined = result?.assets?.[0] || result;
      if (!asset?.uri) {
        Alert.alert('PDF seçilemedi', 'Dosya bilgisi alınamadı.');
        return;
      }

      const mimeType = String(asset.mimeType || 'application/pdf').toLowerCase();
      if (mimeType !== 'application/pdf') {
        Alert.alert('Geçersiz dosya', 'Sadece PDF dosyaları seçilebilir.');
        return;
      }

      if (asset.size && asset.size > MAX_PDF_SIZE_BYTES) {
        Alert.alert('Dosya çok büyük', 'PDF dosyası en fazla 15 MB olabilir.');
        return;
      }

      setUploadingPdf(true);
      const fileData = await readPdfAsBase64(asset);
      setSelectedPdfData(fileData);
      setSelectedPdfName(asset.name || 'ek.pdf');
      setUploadedPdfName(null);
      setUploadedPdfUrl(null);
      Alert.alert('PDF hazır', 'PDF, kayıt kaydedilirken Google Drive’a yüklenecek.');
    } catch (error: any) {
      Alert.alert('PDF hatası', error?.message || 'PDF seçilirken bir sorun oluştu.');
    } finally {
      setUploadingPdf(false);
    }
  };

  const uploadSelectedPdfIfNeeded = async (): Promise<{ pdfName?: string; pdfUrl?: string }> => {
    if (!selectedPdfData) {
      return { pdfName: uploadedPdfName || undefined, pdfUrl: uploadedPdfUrl || undefined };
    }

    const uploadResult = await postToGoogleScript({
      action: 'uploadPdf',
      formGroup: selectedTaskObj.group,
      fileName: selectedPdfName || 'ek.pdf',
      mimeType: 'application/pdf',
      fileData: selectedPdfData,
      date: formatDateForDisplay(date),
      woNumber: woNumber.trim(),
      refNumber: refNumber.trim(),
    });

    if (uploadResult.status !== 'success') {
      throw new Error(uploadResult.message || 'PDF Google Drive’a yüklenemedi.');
    }

    return {
      pdfName: uploadResult.fileName || selectedPdfName || 'ek.pdf',
      pdfUrl: uploadResult.fileUrl || '',
    };
  };

  const handleSave = async () => {
    const trimmedWo = woNumber.trim();
    const trimmedRef = refNumber.trim();
    const trimmedDescription = description.trim();
    const isoDate = parseDateToIso(date);

    if (!isoDate || !trimmedWo || !trimmedRef || !trimmedDescription) {
      Alert.alert('Eksik bilgi', 'Geçerli tarih, W/O numarası, referans no ve açıklama alanlarını doldurun.');
      return;
    }

    setSaving(true);
    try {
      const pdf = await uploadSelectedPdfIfNeeded();
      const result = await postToGoogleScript({
        action: isEditing ? 'update' : 'create',
        id: editingId,
        formGroup: selectedTaskObj.group,
        date: formatDateForDisplay(isoDate),
        taskNo: selectedTask,
        woNumber: trimmedWo,
        refNumber: trimmedRef,
        description: trimmedDescription,
        ...(pdf.pdfName ? { pdfName: pdf.pdfName } : {}),
        ...(pdf.pdfUrl ? { pdfUrl: pdf.pdfUrl } : {}),
      });

      if (result.status !== 'success') {
        throw new Error(result.message || 'Google Script işlemi tamamlayamadı.');
      }

      Alert.alert('İşlem başarılı', isEditing ? 'Kayıt güncellendi.' : 'Yeni kayıt eklendi.');
      resetForm();
      await fetchAllRecords();
    } catch (error: any) {
      Alert.alert('Kayıt hatası', error?.message || 'Google Drive ile bağlantı kurulamadı.');
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
    setSelectedTask(item.taskNo);
    setDate(toFormIsoDate(item.dateIso || item.date));
    setWoNumber(item.woNumber);
    setRefNumber(item.refNumber);
    setDescription(item.description);
    setSelectedPdfData(null);
    setSelectedPdfName(null);
    setUploadedPdfName(item.pdfName || null);
    setUploadedPdfUrl(item.pdfUrl || null);
  };

  const deleteRecord = async (item: LogbookRecord) => {
    if (!item.id) {
      Alert.alert('Silinemiyor', 'Bu kaydın ID bilgisi bulunamadı.');
      return;
    }

    setDeletingId(item.id);
    try {
      const result = await postToGoogleScript({
        action: 'delete',
        id: item.id,
        formGroup: getTaskById(item.taskNo).group,
      });
      if (result.status !== 'success') {
        throw new Error(result.message || 'Kayıt silinemedi.');
      }

      if (editingId === item.id) resetForm();
      setAllRecords((current) => current.filter((record) => recordIdentity(record) !== recordIdentity(item)));
      Alert.alert('Kayıt silindi', 'Seçilen logbook kaydı silindi.');
    } catch (error: any) {
      Alert.alert('Silme hatası', error?.message || 'Silme işlemi sırasında bağlantı kurulamadı.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = (item: LogbookRecord) => {
    const message = `${item.woNumber || 'Seçilen kayıt'} kalıcı olarak silinecek.`;

    if (Platform.OS === 'web') {
      const confirmed = typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false;
      if (confirmed) void deleteRecord(item);
      return;
    }

    Alert.alert('Kaydı sil', message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => void deleteRecord(item) },
    ]);
  };

  const handleOpenPdf = async (url?: string) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('PDF bağlantısı açılamıyor.');
      await Linking.openURL(url);
    } catch (error: any) {
      Alert.alert('PDF hatası', error?.message || 'PDF açılamadı.');
    }
  };

  const renderRecordCard = (item: LogbookRecord) => {
    const task = getTaskById(item.taskNo);
    const deleting = deletingId === item.id;

    return (
      <View key={recordIdentity(item)} style={styles.recordCard}>
        <View style={styles.recordHeaderRow}>
          <View style={styles.flexOne}>
            <Text style={styles.recordDate}>{item.date || '-'}</Text>
            <Text style={styles.recordWo}>W/O: {item.woNumber || '-'}</Text>
          </View>
          <View style={styles.groupBadge}>
            <Text style={styles.groupBadgeText}>Grup {task.group}</Text>
          </View>
        </View>

        <Text style={styles.recordTask}>{task.id}. {task.name}</Text>
        <Text style={styles.recordMeta}>Referans: {item.refNumber || '-'}</Text>
        <Text style={styles.recordDescription}>{item.description || '-'}</Text>

        <View style={styles.actionRow}>
          {item.pdfUrl ? (
            <TouchableOpacity style={styles.smallNeutralButton} onPress={() => void handleOpenPdf(item.pdfUrl)}>
              <Text style={styles.smallNeutralButtonText}>PDF</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.smallEditButton} onPress={() => handleEditSetup(item)} disabled={isBusy}>
            <Text style={styles.smallEditButtonText}>Düzenle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.smallDeleteButton} onPress={() => handleDelete(item)} disabled={isBusy}>
            {deleting ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Text style={styles.smallDeleteButtonText}>Sil</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDraftSection = (section: DraftSection) => {
    const complete = section.optional || (section.records.length >= section.targetCount && section.missingTaskIds.length === 0);
    const rows = Array.from({ length: section.targetCount }, (_, index) => section.records[index] || null);

    return (
      <View key={section.key} style={styles.draftSection}>
        <View style={styles.draftSectionHeader}>
          <View style={styles.flexOne}>
            <Text style={styles.draftSectionTitle}>{section.title}</Text>
            <Text style={styles.draftSectionSubtitle}>
              {section.optional
                ? `${section.records.length} kayıt seçildi · ${section.availableCount} benzersiz gün mevcut · Optional, minimum zorunluluk uygulanmaz.`
                : `${section.records.length}/${section.targetCount} kayıt · Mevcut benzersiz gün: ${section.availableCount}`}
            </Text>
          </View>
          <View style={[styles.statusBadge, complete ? styles.statusBadgeSuccess : styles.statusBadgeDanger]}>
            <Text style={[styles.statusBadgeText, complete ? styles.statusTextSuccess : styles.statusTextDanger]}>
              {complete ? 'Uygun' : 'Eksik'}
            </Text>
          </View>
        </View>

        {section.missingTaskIds.length > 0 ? (
          <View style={styles.inlineWarning}>
            <Text style={styles.inlineWarningText}>
              Eksik iş türü: {section.missingTaskIds.map((id) => `${id}. ${getTaskById(id).name}`).join(' · ')}
            </Text>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={styles.draftTable}>
            <View style={[styles.draftRow, styles.draftHeaderRow]}>
              <Text style={[styles.draftCell, styles.noCell, styles.draftHeaderText]}>No</Text>
              <Text style={[styles.draftCell, styles.taskCell, styles.draftHeaderText]}>Yapılan İş</Text>
              <Text style={[styles.draftCell, styles.woCell, styles.draftHeaderText]}>W/O / Referans</Text>
              <Text style={[styles.draftCell, styles.descriptionCell, styles.draftHeaderText]}>Teknik Açıklama</Text>
              <Text style={[styles.draftCell, styles.dateCell, styles.draftHeaderText]}>Tarih</Text>
            </View>

            {rows.map((record, index) => {
              const task = record ? getTaskById(record.taskNo) : null;
              return (
                <View key={`${section.key}-${index}`} style={[styles.draftRow, index % 2 === 1 && styles.draftAlternateRow]}>
                  <Text style={[styles.draftCell, styles.noCell]}>{index + 1}</Text>
                  <Text style={[styles.draftCell, styles.taskCell]}>
                    {record && task ? `${task.id}. ${task.name}` : '— Kayıt bekleniyor —'}
                  </Text>
                  <Text style={[styles.draftCell, styles.woCell]}>
                    {record ? `W/O: ${record.woNumber || '-'}\nRef: ${record.refNumber || '-'}` : '—'}
                  </Text>
                  <Text style={[styles.draftCell, styles.descriptionCell]}>{record?.description || '—'}</Text>
                  <Text style={[styles.draftCell, styles.dateCell]}>{record?.date || '—'}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  };

  const requiredGroupsComplete = draft.requiredSections.every(
    (section) => section.records.length >= section.targetCount && section.missingTaskIds.length === 0,
  );
  const monthsComplete = draft.monthStatuses.length > 0 && draft.monthStatuses.every(
    (month) => month.selectedDays >= MONTH_MIN_UNIQUE_DAYS,
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>MOTM/12 Logbook Kayıt Sistemi</Text>
            <Text style={styles.heroSubtitle}>MPM 2.4 Ek-16 · Otomatik OJT Defteri Taslağı</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.flexOne}>
                <Text style={styles.cardTitle}>{isEditing ? 'Kaydı Düzenle' : 'Yeni İş Kaydı'}</Text>
                <Text style={styles.cardSubtitle}>Kayıtlar Google Sheet ve Google Drive ile senkronize edilir.</Text>
              </View>
              {isEditing ? (
                <TouchableOpacity style={styles.cancelButton} onPress={resetForm}>
                  <Text style={styles.cancelButtonText}>Vazgeç</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <Text style={styles.label}>Tarih</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              editable={!isBusy}
            />

            <Text style={styles.label}>Ek-16 İş Türü</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedTask}
                onValueChange={(value) => setSelectedTask(Number(value))}
                enabled={!isBusy}
              >
                {TASKS_DATA.map((task) => (
                  <Picker.Item
                    key={task.id}
                    label={`${task.id}. ${task.name} · Grup ${task.group}`}
                    value={task.id}
                  />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>W/O Numarası</Text>
            <TextInput
              style={styles.input}
              value={woNumber}
              onChangeText={setWoNumber}
              placeholder="Örn. 2722566"
              editable={!isBusy}
            />

            <Text style={styles.label}>Referans No</Text>
            <TextInput
              style={styles.input}
              value={refNumber}
              onChangeText={setRefNumber}
              placeholder="Bakım kartı, NRC veya AML"
              editable={!isBusy}
            />

            <Text style={styles.label}>İşin Teknik Açıklaması</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Yapılan işlemin teknik özeti"
              multiline
              textAlignVertical="top"
              editable={!isBusy}
            />

            <View style={styles.pdfRow}>
              <TouchableOpacity style={styles.pdfButton} onPress={() => void handlePdfSelect()} disabled={isBusy}>
                {uploadingPdf ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.pdfButtonText}>{selectedPdfName || uploadedPdfName ? 'PDF Değiştir' : 'PDF Seç'}</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.pdfName} numberOfLines={2}>
                {selectedPdfName || uploadedPdfName || 'PDF eklenmedi'}
              </Text>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={() => void handleSave()} disabled={isBusy}>
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>{isEditing ? 'Kaydı Güncelle' : 'Google Drive’a Kaydet'}</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.flexOne}>
                <Text style={styles.cardTitle}>Kayıtlı İşler · Grup {selectedTaskObj.group}</Text>
                <Text style={styles.cardSubtitle}>{selectedGroupRecords.length} kayıt görüntüleniyor.</Text>
              </View>
              <TouchableOpacity style={styles.refreshButton} onPress={() => void fetchAllRecords()} disabled={isBusy}>
                {fetching ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.refreshButtonText}>Yenile</Text>}
              </TouchableOpacity>
            </View>

            {selectedGroupRecords.length > 0 ? (
              selectedGroupRecords.map(renderRecordCard)
            ) : fetching ? null : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Bu grupta kayıt bulunamadı.</Text>
              </View>
            )}
          </View>

          <View style={styles.ojtHeaderCard}>
            <Text style={styles.ojtEyebrow}>OTOMATİK ÇIKTI</Text>
            <Text style={styles.ojtTitle}>OJT Defteri Taslağı</Text>
            <Text style={styles.ojtDescription}>
              Algoritma gerçek kayıt tarihlerini korur; dört zorunlu grupta 10’ar kayıt seçer, her iş türünü en az bir kez kullanır ve farklı gün sayısını yükseltir.
            </Text>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Zorunlu Gruplar</Text>
                <Text style={[styles.summaryValue, requiredGroupsComplete ? styles.greenText : styles.redText]}>
                  {requiredGroupsComplete ? '4/4 Uygun' : `${draft.requiredSections.filter((section) => section.records.length >= 10 && section.missingTaskIds.length === 0).length}/4 Uygun`}
                </Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Seçilen Kayıt</Text>
                <Text style={styles.summaryValue}>{draft.selectedRecords.length}</Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Aylık Gün Kuralı</Text>
                <Text style={[styles.summaryValue, monthsComplete ? styles.greenText : styles.redText]}>
                  {monthsComplete ? 'Uygun' : 'Eksik Var'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Aylık Gün Dağılımı</Text>
            <Text style={styles.cardSubtitle}>
              13 gün güvenli hedef, 12 gün alt sınır olarak değerlendirilir. “Mevcut” sütunu tüm kayıtların sunduğu farklı gün sayısıdır.
            </Text>

            {draft.monthStatuses.length > 0 ? (
              draft.monthStatuses.map((month) => (
                <View key={month.month} style={styles.monthRow}>
                  <View style={styles.flexOne}>
                    <Text style={styles.monthTitle}>{monthLabel(month.month)}</Text>
                    <Text style={styles.monthMeta}>Taslak: {month.selectedDays} gün · Mevcut: {month.availableDays} gün</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      month.status === 'valid'
                        ? styles.statusBadgeSuccess
                        : month.status === 'borderline'
                          ? styles.statusBadgeWarning
                          : styles.statusBadgeDanger,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        month.status === 'valid'
                          ? styles.statusTextSuccess
                          : month.status === 'borderline'
                            ? styles.statusTextWarning
                            : styles.statusTextDanger,
                      ]}
                    >
                      {month.status === 'valid' ? '13+ gün' : month.status === 'borderline' ? '12 gün' : `${month.selectedDays}/12`}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Aylık analiz için tarihli kayıt bulunamadı.</Text>
              </View>
            )}
          </View>

          {draft.requiredSections.map(renderDraftSection)}

          {draft.optionalSections.length > 0 ? (
            <View>
              <Text style={styles.optionalMainTitle}>Optional İşlem Taslakları</Text>
              {draft.optionalSections.map(renderDraftSection)}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Optional İşlem Taslakları</Text>
              <Text style={styles.cardSubtitle}>Henüz optional işlem kaydı bulunmadığı için ayrı taslak oluşturulmadı.</Text>
            </View>
          )}

          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              Not: OJT taslağında aynı tarih yalnızca bir kez kullanılır. Aynı gün kaydedilmiş birden fazla iş arasından algoritmanın en uygun bulduğu tek kayıt seçilir. Uygulama tarih veya iş bilgisi üretmez; eksik kayıt bulunursa boş satır ve uyarı gösterir.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flexOne: { flex: 1 },
  pageContent: { padding: 14, paddingBottom: 60 },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: 18,
    padding: 22,
    marginBottom: 14,
  },
  heroTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '800' },
  heroSubtitle: { color: '#DCE8FF', fontSize: 13, marginTop: 6 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 14,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  cardSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  label: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    borderRadius: 11,
    paddingHorizontal: 12,
    minHeight: 46,
    fontSize: 14,
  },
  multilineInput: { minHeight: 100, paddingTop: 12 },
  pickerContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 11,
    overflow: 'hidden',
  },
  pdfRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  pdfButton: {
    minWidth: 110,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  pdfButtonText: { color: colors.primary, fontWeight: '800' },
  pdfName: { flex: 1, color: colors.muted, fontSize: 12 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 11,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  cancelButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: colors.warningSoft },
  cancelButtonText: { color: colors.warning, fontWeight: '800' },
  refreshButton: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9, backgroundColor: colors.primarySoft },
  refreshButtonText: { color: colors.primary, fontWeight: '800' },
  recordCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    padding: 13,
    marginTop: 10,
    backgroundColor: colors.surfaceAlt,
  },
  recordHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  recordDate: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  recordWo: { color: colors.muted, fontSize: 12, marginTop: 2 },
  groupBadge: { backgroundColor: colors.primarySoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  groupBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  recordTask: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 10, lineHeight: 20 },
  recordMeta: { color: colors.muted, fontSize: 12, marginTop: 7 },
  recordDescription: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 7 },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  smallNeutralButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primarySoft },
  smallNeutralButtonText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  smallEditButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.warningSoft },
  smallEditButtonText: { color: colors.warning, fontWeight: '800', fontSize: 12 },
  smallDeleteButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.dangerSoft },
  smallDeleteButtonText: { color: colors.danger, fontWeight: '800', fontSize: 12 },
  emptyBox: { padding: 18, alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: 12, marginTop: 10 },
  emptyText: { color: colors.muted, fontSize: 13 },
  ojtHeaderCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
  ojtEyebrow: { color: '#93C5FD', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  ojtTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', marginTop: 5 },
  ojtDescription: { color: '#DCE8FF', fontSize: 13, lineHeight: 19, marginTop: 7 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 15 },
  summaryBox: { flexGrow: 1, minWidth: 100, backgroundColor: '#173D75', borderRadius: 12, padding: 12 },
  summaryLabel: { color: '#BFDBFE', fontSize: 11 },
  summaryValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginTop: 4 },
  greenText: { color: '#86EFAC' },
  redText: { color: '#FCA5A5' },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 12,
  },
  monthTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
  monthMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  statusBadgeSuccess: { backgroundColor: colors.successSoft },
  statusBadgeWarning: { backgroundColor: colors.warningSoft },
  statusBadgeDanger: { backgroundColor: colors.dangerSoft },
  statusBadgeText: { fontSize: 11, fontWeight: '900' },
  statusTextSuccess: { color: colors.success },
  statusTextWarning: { color: colors.warning },
  statusTextDanger: { color: colors.danger },
  draftSection: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 14,
  },
  draftSectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  draftSectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  draftSectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  inlineWarning: { backgroundColor: colors.dangerSoft, borderRadius: 9, padding: 10, marginBottom: 10 },
  inlineWarningText: { color: colors.danger, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  draftTable: { minWidth: 1070, borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden' },
  draftRow: { flexDirection: 'row', alignItems: 'stretch', minHeight: 60, backgroundColor: colors.surface },
  draftHeaderRow: { minHeight: 42, backgroundColor: colors.primaryDark },
  draftAlternateRow: { backgroundColor: colors.surfaceAlt },
  draftCell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 11,
    lineHeight: 16,
    textAlignVertical: 'center',
  },
  draftHeaderText: { color: '#FFFFFF', fontWeight: '900', textAlign: 'center' },
  noCell: { width: 46, textAlign: 'center' },
  taskCell: { width: 230 },
  woCell: { width: 190 },
  descriptionCell: { width: 500 },
  dateCell: { width: 104, textAlign: 'center' },
  optionalMainTitle: { color: colors.primaryDark, fontSize: 20, fontWeight: '900', marginBottom: 10, marginTop: 4 },
  noteBox: { backgroundColor: '#E0F2FE', borderRadius: 13, padding: 14 },
  noteText: { color: '#0C4A6E', fontSize: 12, lineHeight: 18, fontWeight: '600' },
});
