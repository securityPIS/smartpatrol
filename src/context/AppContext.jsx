import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import {
  Sun, Cloud, CloudRain, Wind, Thermometer,
} from 'lucide-react';
import { createPosterDataUrl } from '../data/defaultData';
import { readFileAsDataUrl, readImageFileAsDataUrl } from '../utils/images';
import { sanitizeEmail, sanitizeMultilineText, sanitizePhone, sanitizeText, sanitizeUrl } from '../utils/sanitize';
import { loadImageFromDB, saveImageToDB } from '../utils/imageStore';
import { checkStorageQuota } from '../utils/storageQuota';

// --- DATA MOCKUP ---
const ACCESS_ROLES = {
  ADMIN: 'ADMIN',
  PIC: 'PIC',
  PETUGAS: 'PETUGAS'
};

const ACCESS_ROLE_VALUES = Object.values(ACCESS_ROLES);
const AUTH_SESSION_KEY = 'smartpatrol.auth.local.v1';
const APP_TIME_ZONE = 'Asia/Jakarta';
const SHIFT_SEQUENCE = [
  { id: 'shift-4', label: 'Shift 4', startHour: 0, endHour: 6, timeRange: '00:00 - 06:00' },
  { id: 'shift-1', label: 'Shift 1', startHour: 6, endHour: 12, timeRange: '06:00 - 12:00' },
  { id: 'shift-2', label: 'Shift 2', startHour: 12, endHour: 18, timeRange: '12:00 - 18:00' },
  { id: 'shift-3', label: 'Shift 3', startHour: 18, endHour: 24, timeRange: '18:00 - 24:00' },
];
const SHIFT_ORDER = SHIFT_SEQUENCE.reduce((accumulator, shift, index) => ({ ...accumulator, [shift.id]: index }), {});

const defaultLocationOptions = [
  'Cuaca', 'Haluan', 'Buritan', 'Deck', 'Sekoci', 'Anjungan', 'Radio Room',
  'Alat Navigasi', 'Solar Panel', 'Ruang Mesin', 'Ruang Pompa', 'Air Bersih',
  'Gudang Logistik', 'Gudang Spare Part', 'Alat Dapur', 'Fasilitas Pendukung'
];

const defaultAuthForm = { name: '', email: '', password: '', confirmPassword: '', phone: '', type: 'BUJP' };
const defaultUserForm = { name: '', role: ACCESS_ROLES.PETUGAS, type: 'BUJP', dob: '', email: '', password: '', phone: '', address: '', emergencyName: '', emergencyContact: '', emergencyRelation: 'Orang Tua', officeAddress: '', photoUrl: null };
const defaultShipForm = { name: '', type: 'Oil Tanker', route: '', cargoType: '', cargoAmount: '', status: 'UPP', customCheckpoints: [], photoUrl: null };
const defaultShipDocumentForm = { title: '', desc: '', fileUrl: null, fileName: '', mimeType: '' };
const defaultIncidentForm = { locType: 'default', location: defaultLocationOptions[0], customLocation: '', penyebab: '', deskripsi: '', tindakLanjut: '', photoUrl: null };

const createAuthFormState = (overrides = {}) => ({ ...defaultAuthForm, ...overrides });
const createUserFormState = () => ({ ...defaultUserForm });
const createShipFormState = () => ({ ...defaultShipForm });
const createShipDocumentState = () => ({ ...defaultShipDocumentForm });
const createIncidentFormState = () => ({ ...defaultIncidentForm });

function createUserAvatar(name, index = 0) {
  const initials = sanitizeText(name, 40).split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'SP';
  return createPosterDataUrl(initials, name, index, true);
}

const initialCheckpoints = defaultLocationOptions.map((name, index) => ({ id: index + 1, name, status: 'pending' }));
initialCheckpoints[0] = { ...initialCheckpoints[0], status: 'completed', completedBy: 'Cipto Mangunkusumo', time: '12:15', photoUrl: createPosterDataUrl('CUACA', 'Kondisi aman', 0, false), resultType: 'aman' };
initialCheckpoints[1] = { ...initialCheckpoints[1], status: 'completed', completedBy: 'Sertu Agus', time: '12:20', photoUrl: createPosterDataUrl('HALUAN', 'Temuan jangkar', 4, false), resultType: 'temuan', penyebab: 'Gesekan berlebih karena cuaca buruk', kejadian: 'Karat parah pada rantai jangkar kiri.', tindakLanjut: 'Lapor Chief Officer.' };

const mockUsersList = [
  { id: 'u1', name: 'Budi Santoso', role: ACCESS_ROLES.ADMIN, type: 'BUJP', status: 'active', shipAssigned: 'MT MENGGALA', email: 'admin@smartpatrol.local', hasCredential: true, passwordSalt: '4e7f1a9c2d6b8f10', passwordHash: 'e0b98996bdd6437310b21efdce9329a01a2212db84c43e6ea103d4ec908f2dd8', photoUrl: createPosterDataUrl('BS', 'Budi Santoso', 0, true) },
  { id: 'u2', name: 'Sertu Agus', role: ACCESS_ROLES.PIC, type: 'TNI', status: 'active', shipAssigned: 'MT MENGGALA', email: 'pic@smartpatrol.local', hasCredential: true, passwordSalt: '7ab31d8f22ce9014', passwordHash: 'ded78e74253898700b4c5c06479e492b8a918b427441094d84f837d9cde3aa1b', photoUrl: createPosterDataUrl('SA', 'Sertu Agus', 1, true) },
  { id: 'u3', name: 'Cipto Mangunkusumo', role: ACCESS_ROLES.PETUGAS, type: 'BUJP', status: 'active', shipAssigned: 'MT MENGGALA', email: 'petugas@smartpatrol.local', hasCredential: true, passwordSalt: '91c4ef0a5d7b2c38', passwordHash: 'f6df216170e0fa8cbfdffaa046b3d785e6e289627af9f8753addec4a11860a8b', photoUrl: createPosterDataUrl('CM', 'Cipto', 2, true) },
  { id: 'u4', name: 'Deni Setiawan', role: ACCESS_ROLES.PETUGAS, type: 'BUJP', status: 'off-duty', shipAssigned: null, email: 'deni@smartpatrol.local', hasCredential: true, passwordSalt: 'bc72ea19453f8d26', passwordHash: '79907b35981fa38d4b7cecb3554985d3ed0e668f0ecddee204e30b614247d9c2', photoUrl: createPosterDataUrl('DS', 'Deni', 3, true) },
  { id: 'u5', name: 'Kapten Eko', role: ACCESS_ROLES.PIC, type: 'INTERNAL', status: 'off-duty', shipAssigned: null, email: 'eko@smartpatrol.local', hasCredential: true, passwordSalt: 'f1ae0c4d739b2158', passwordHash: 'a4e99ec51c05d02c3f8e30b9ed98b67bef8f6abc10d4d6a9cd1ecaa4e29c0bb1', photoUrl: createPosterDataUrl('KE', 'Kapten Eko', 4, true) },
];

const seedUsersById = {};
const seedUsersByEmail = {};
mockUsersList.forEach(u => { seedUsersById[u.id] = u; if (u.email) seedUsersByEmail[u.email.toLowerCase()] = u; });

const initialShipsData = [
  { id: 's1', name: 'MT MENGGALA', type: 'Oil Tanker', lat: '-6.1021', lng: '106.8833', status: 'UPP', route: 'Jakarta - Singapore', cargoType: 'Crude Oil', cargoAmount: '50,000 MT', photoUrl: createPosterDataUrl('MT MENGGALA', 'Operasi patroli aktif', 0, false), personnel: ['u1', 'u2', 'u3'], personnelNextMonth: ['u1', 'u4', 'u5'], customCheckpoints: [{name: 'Cuaca', desc: 'Cek visibilitas dan gelombang.'}, {name: 'Ruang Mesin', desc: 'Pastikan suhu generator normal.'}], documents: [{title: 'Sertifikat Keselamatan', desc: 'Berlaku hingga 2027'}, {title: 'Izin Berlayar', desc: 'Dikeluarkan Syahbandar'}] },
  { id: 's2', name: 'MT SRIWIJAYA', type: 'Chemical Tanker', lat: '-5.9123', lng: '105.8122', status: 'NON UPP', route: 'Merak - Bakauheni', cargoType: 'Methanol', cargoAmount: '12,000 MT', photoUrl: createPosterDataUrl('MT SRIWIJAYA', 'Armada Cadangan', 1, false), personnel: [], personnelNextMonth: [], customCheckpoints: [{name: 'Pompa Kimia', desc: 'Pastikan tidak ada kebocoran'}], documents: [] },
];

const APP_STORAGE_KEY = 'smartpatrol.legacy.local.v1';
const WEATHER_STORAGE_KEY = 'smartpatrol.legacy.weather.v1';
const WEATHER_TTL_MS = 30 * 60 * 1000;

// --- UTILITY FUNCTIONS ---
function getJakartaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date).reduce((accumulator, part) => {
    if (part.type !== 'literal') accumulator[part.type] = part.value;
    return accumulator;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function toDateKey({ year, month, day }) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  return { year, month, day };
}

function formatDateLabel(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  const safeDate = new Date(Date.UTC(year, Math.max(month - 1, 0), day, 12, 0, 0));
  return safeDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: APP_TIME_ZONE });
}

function shiftMetaFromParts(dateKey, shiftId) {
  const definition = SHIFT_SEQUENCE.find(shift => shift.id === shiftId) || SHIFT_SEQUENCE[0];
  return {
    id: definition.id,
    key: `${dateKey}|${definition.id}`,
    label: definition.label,
    timeRange: definition.timeRange,
    dateKey,
    dateLabel: formatDateLabel(dateKey),
  };
}

function getShiftMeta(date = new Date()) {
  const parts = getJakartaDateParts(date);
  const definition = SHIFT_SEQUENCE.find(shift => parts.hour >= shift.startHour && parts.hour < shift.endHour) || SHIFT_SEQUENCE[0];
  return shiftMetaFromParts(toDateKey(parts), definition.id);
}

function getShiftMetaFromKey(key) {
  const [dateKey, shiftId] = String(key || '').split('|');
  if (!dateKey || !shiftId) return null;
  return shiftMetaFromParts(dateKey, shiftId);
}

function addDaysToDateKey(dateKey, days) {
  const { year, month, day } = parseDateKey(dateKey);
  const safeDate = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return toDateKey({
    year: safeDate.getUTCFullYear(),
    month: safeDate.getUTCMonth() + 1,
    day: safeDate.getUTCDate(),
  });
}

function getNextShiftMeta(meta) {
  const currentIndex = SHIFT_SEQUENCE.findIndex(shift => shift.id === meta?.id);
  if (currentIndex === -1) return shiftMetaFromParts(meta?.dateKey || toDateKey(getJakartaDateParts()), SHIFT_SEQUENCE[0].id);
  if (currentIndex === SHIFT_SEQUENCE.length - 1) {
    return shiftMetaFromParts(addDaysToDateKey(meta.dateKey, 1), SHIFT_SEQUENCE[0].id);
  }
  return shiftMetaFromParts(meta.dateKey, SHIFT_SEQUENCE[currentIndex + 1].id);
}

function resetCheckpointForShift(checkpoint) {
  return { id: checkpoint.id, name: checkpoint.name, status: 'pending' };
}

function resetCheckpointCollection(checkpoints) {
  return checkpoints.map(resetCheckpointForShift);
}

function createMissedCheckpoint(checkpoint, shiftMeta) {
  return {
    id: checkpoint.id,
    name: checkpoint.name,
    status: 'missed',
    resultType: 'missed',
    completedBy: '-',
    time: shiftMeta.timeRange.split(' - ')[1] || '-',
    shipName: checkpoint.shipName || '',
    photoUrl: null,
    penyebab: '',
    kejadian: 'Titik ini tidak dipatroli pada shift dan tanggal tersebut.',
    tindakLanjut: 'Masuk status missed pada akhir shift.',
  };
}

function summarizePatrolCheckpoints(checkpoints) {
  return checkpoints.reduce((summary, checkpoint) => {
    summary.total += 1;
    if (checkpoint.status === 'completed') {
      summary.completed += 1;
      if (checkpoint.resultType === 'aman') summary.aman += 1;
      if (checkpoint.resultType === 'temuan') summary.temuan += 1;
    }
    if (checkpoint.status === 'missed' || checkpoint.resultType === 'missed') {
      summary.missed += 1;
    }
    return summary;
  }, { aman: 0, temuan: 0, missed: 0, completed: 0, total: 0 });
}

function buildCrewSnapshot(users, shipName) {
  return users
    .filter(user => user.shipAssigned === shipName && user.status === 'active')
    .map(user => ({
      id: user.id,
      name: user.name,
      role: user.role,
      photoUrl: user.photoUrl || null,
    }));
}

function buildHistoryEntry({ shiftMeta, checkpoints, ship, users, weatherInfo }) {
  const historyId = `history-${shiftMeta.key}`;
  const snapshotCheckpoints = checkpoints.map(checkpoint => (
    checkpoint.status === 'completed'
      ? { ...checkpoint, readOnly: true, historyId, date: shiftMeta.dateLabel }
      : { ...createMissedCheckpoint(checkpoint, shiftMeta), readOnly: true, historyId, date: shiftMeta.dateLabel, shipName: ship?.name || checkpoint.shipName || '' }
  ));
  const summary = summarizePatrolCheckpoints(snapshotCheckpoints);
  const shipName = ship?.name || 'Belum Ada Kapal';

  return {
    id: historyId,
    key: shiftMeta.key,
    date: shiftMeta.dateLabel,
    dateKey: shiftMeta.dateKey,
    shift: shiftMeta.label,
    shiftId: shiftMeta.id,
    time: shiftMeta.timeRange,
    ship: shipName,
    shipSnapshot: ship ? { id: ship.id, name: ship.name, lat: ship.lat, lng: ship.lng } : null,
    crewSnapshot: buildCrewSnapshot(users, shipName),
    weatherSnapshot: weatherInfo ? { ...weatherInfo } : null,
    checkpoints: snapshotCheckpoints,
    summary,
    points: summary.total,
    issue: summary.temuan,
    missed: summary.missed,
    createdAt: new Date().toISOString(),
  };
}

function sortHistoryEntries(entries) {
  return [...entries].sort((left, right) => {
    if (left.dateKey !== right.dateKey) return right.dateKey.localeCompare(left.dateKey);
    return (SHIFT_ORDER[right.shiftId] ?? -1) - (SHIFT_ORDER[left.shiftId] ?? -1);
  });
}

function mergeHistoryEntries(previousEntries, nextEntries) {
  const merged = new Map(previousEntries.map(entry => [entry.key || entry.id, entry]));
  nextEntries.forEach(entry => {
    merged.set(entry.key || entry.id, entry);
  });
  return sortHistoryEntries(Array.from(merged.values()));
}

function createNotificationId() {
  return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createNotificationRecord(notification) {
  return {
    id: createNotificationId(),
    type: notification.type || 'general',
    title: notification.title || 'Notifikasi Sistem',
    message: notification.message || '',
    senderName: notification.senderName || 'Sistem',
    senderRole: notification.senderRole || 'SYSTEM',
    targetUserIds: Array.isArray(notification.targetUserIds) ? notification.targetUserIds : [],
    route: notification.route || 'history/list',
    routeParams: notification.routeParams || {},
    shipName: notification.shipName || '',
    shiftKey: notification.shiftKey || '',
    incidentId: notification.incidentId || '',
    historyId: notification.historyId || '',
    dedupeKey: notification.dedupeKey || '',
    readByUserIds: Array.isArray(notification.readByUserIds) ? notification.readByUserIds : [],
    createdAt: notification.createdAt || new Date().toISOString(),
  };
}

function sortNotifications(notifications) {
  return [...notifications].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function loadAuthSession() { try { const raw = window.localStorage.getItem(AUTH_SESSION_KEY); if (!raw) return null; const parsed = JSON.parse(raw); return typeof parsed?.userId === 'string' ? parsed.userId : null; } catch { return null; } }
function saveAuthSession(userId) { try { if (!userId) { window.localStorage.removeItem(AUTH_SESSION_KEY); return; } window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ userId, savedAt: new Date().toISOString() })); } catch (error) { console.error('Gagal menyimpan sesi login', error); } }
function fallbackHash(value) { let hash = 2166136261; for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24); } return `fallback-${(hash >>> 0).toString(16).padStart(8, '0')}`; }
async function sha256Hex(value) { if (!globalThis.crypto?.subtle) return fallbackHash(value); const encoded = new TextEncoder().encode(value); const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded); return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function createSalt() { if (globalThis.crypto?.getRandomValues) { const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes); return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join(''); } return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`.slice(0, 32); }
async function createPasswordCredential(password) { const s = sanitizeText(password, 120); const salt = createSalt(); const hash = await sha256Hex(`${salt}:${s}`); return { passwordSalt: salt, passwordHash: hash, hasCredential: true }; }
async function verifyPasswordCredential(user, password) { if (!user?.passwordHash || !user?.passwordSalt) return false; const s = sanitizeText(password, 120); if (!s) return false; return (await sha256Hex(`${user.passwordSalt}:${s}`)) === user.passwordHash; }
function createFallbackEmail(name, index = 0) { const slug = sanitizeText(name, 80).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/(^[.]+|[.]+$)/g, '') || `user.${index + 1}`; return `${slug}@smartpatrol.local`; }
function normalizeUserRole(user) { const raw = sanitizeText(user?.role || '', 20).toUpperCase(); if (ACCESS_ROLE_VALUES.includes(raw)) return raw; if (user?.name === 'Budi Santoso') return ACCESS_ROLES.ADMIN; if (user?.name === 'Kapten Eko' || user?.name === 'Sertu Agus') return ACCESS_ROLES.PIC; return ACCESS_ROLES.PETUGAS; }

function normalizeUserRecord(user, index = 0) {
  const safeName = sanitizeText(user?.name || '', 80) || `User ${index + 1}`;
  const safeEmail = sanitizeEmail(user?.email || '') || sanitizeEmail(seedUsersById[user?.id]?.email || seedUsersByEmail[sanitizeEmail(user?.email || '')]?.email || createFallbackEmail(safeName, index));
  const seedUser = seedUsersById[user?.id] || seedUsersByEmail[safeEmail];
  const role = normalizeUserRole({ ...seedUser, ...user, name: safeName });
  const shipAssigned = sanitizeText(user?.shipAssigned || seedUser?.shipAssigned || '', 80) || null;
  const passwordSalt = user?.passwordSalt || seedUser?.passwordSalt || '';
  const passwordHash = user?.passwordHash || seedUser?.passwordHash || '';
  const hasCredential = Boolean(passwordSalt && passwordHash);
  const fallbackStatus = role === ACCESS_ROLES.PETUGAS ? (shipAssigned ? 'active' : 'off-duty') : 'active';
  const status = sanitizeText(user?.status || seedUser?.status || fallbackStatus, 20) || fallbackStatus;
  return { ...seedUser, ...user, id: user?.id || seedUser?.id || `u${Date.now()}${index}`, name: safeName, role, type: sanitizeText(user?.type || seedUser?.type || 'BUJP', 20) || 'BUJP', status: role === ACCESS_ROLES.PETUGAS && !shipAssigned ? 'off-duty' : status, shipAssigned, email: safeEmail, password: '', hasCredential, passwordSalt, passwordHash, phone: sanitizePhone(user?.phone || seedUser?.phone || ''), address: sanitizeMultilineText(user?.address || seedUser?.address || '', 180), emergencyName: sanitizeText(user?.emergencyName || seedUser?.emergencyName || '', 80), emergencyContact: sanitizePhone(user?.emergencyContact || seedUser?.emergencyContact || ''), emergencyRelation: sanitizeText(user?.emergencyRelation || seedUser?.emergencyRelation || 'Orang Tua', 40) || 'Orang Tua', officeAddress: sanitizeMultilineText(user?.officeAddress || seedUser?.officeAddress || '', 180), photoUrl: sanitizeUrl(user?.photoUrl || seedUser?.photoUrl || '') || createUserAvatar(safeName, index) };
}

function normalizeUsersCollection(users) {
  const sourceUsers = Array.isArray(users) && users.length > 0 ? users : mockUsersList;
  const normalized = sourceUsers.map((user, index) => normalizeUserRecord(user, index));
  const adminSeed = mockUsersList.find(u => u.id === 'u1');
  if (adminSeed && !normalized.some(u => u.id === 'u1')) normalized.unshift(normalizeUserRecord(adminSeed, 0));
  return normalized;
}

function loadPersistedState() { try { const raw = window.localStorage.getItem(APP_STORAGE_KEY); if (!raw) return null; const parsed = JSON.parse(raw); return parsed?.version === 1 ? parsed.data : null; } catch { return null; } }
function savePersistedState(data) { try { window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data })); checkStorageQuota(); } catch (error) { console.error('Gagal menyimpan data lokal', error); } }
function loadWeatherCache() { try { const raw = window.localStorage.getItem(WEATHER_STORAGE_KEY); if (!raw) return null; const parsed = JSON.parse(raw); if (!parsed?.savedAt || !parsed?.data) return null; if (Date.now() - new Date(parsed.savedAt).getTime() > WEATHER_TTL_MS) return null; return parsed.data; } catch { return null; } }
function saveWeatherCache(data) { try { window.localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data })); } catch (error) { console.error('Gagal menyimpan cache cuaca', error); } }

async function pickLocalImage() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
  return new Promise((resolve) => { input.onchange = async () => { const file = input.files?.[0]; if (!file) { resolve(null); return; } try { const dataUrl = await readImageFileAsDataUrl(file); resolve(dataUrl); } catch (error) { console.error(error); resolve(null); } }; input.click(); });
}

async function pickLocalFile(accept = '.pdf,.doc,.docx,.xls,.xlsx,image/*') {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  return new Promise((resolve) => {
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        resolve({
          dataUrl,
          name: file.name,
          type: file.type,
        });
      } catch (error) {
        console.error(error);
        resolve(null);
      }
    };
    input.click();
  });
}

function createSeedHistoryEntries() {
  const ship = initialShipsData[0];

  const firstShiftCheckpoints = initialCheckpoints.map((checkpoint) => ({ ...checkpoint }));
  const secondShiftCheckpoints = resetCheckpointCollection(initialCheckpoints);
  secondShiftCheckpoints[2] = {
    ...secondShiftCheckpoints[2],
    status: 'completed',
    completedBy: 'Cipto Mangunkusumo',
    time: '05:10',
    shipName: ship.name,
    photoUrl: createPosterDataUrl('BURITAN', 'Inspeksi selesai', 0, false),
    resultType: 'aman',
    kejadian: 'Kondisi buritan aman dan tidak ada hambatan.',
    penyebab: '',
    tindakLanjut: 'Lanjut patroli rutin.',
  };
  secondShiftCheckpoints[3] = {
    ...secondShiftCheckpoints[3],
    status: 'completed',
    completedBy: 'Sertu Agus',
    time: '05:35',
    shipName: ship.name,
    photoUrl: createPosterDataUrl('DECK', 'Permukaan licin', 4, false),
    resultType: 'temuan',
    kejadian: 'Ada genangan oli tipis di sisi deck kanan.',
    penyebab: 'Sisa tetesan dari perawatan pompa sebelumnya.',
    tindakLanjut: 'Pasang tanda bahaya dan bersihkan area deck.',
  };

  return sortHistoryEntries([
    buildHistoryEntry({
      shiftMeta: shiftMetaFromParts('2026-04-02', 'shift-1'),
      checkpoints: firstShiftCheckpoints,
      ship,
      users: mockUsersList,
      weatherInfo: { temperature: 30, windspeed: 12, weathercode: 1 },
    }),
    buildHistoryEntry({
      shiftMeta: shiftMetaFromParts('2026-04-01', 'shift-4'),
      checkpoints: secondShiftCheckpoints,
      ship,
      users: mockUsersList,
      weatherInfo: { temperature: 28, windspeed: 9, weathercode: 3 },
    }),
  ]);
}

const persistedState = loadPersistedState();

// --- CONTEXT ---
const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
export { ACCESS_ROLES, defaultLocationOptions };

export function AppProvider({ children }) {
  // Theme & connectivity
  const [currentPage, setCurrentPage] = useState('home');
  const [theme, setTheme] = useState('dark');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [notificationReturnPage, setNotificationReturnPage] = useState('home');
  const [confirmDialog, setConfirmDialog] = useState(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  // Auth
  const [sessionUserId, setSessionUserId] = useState(() => loadAuthSession());
  const [authMode, setAuthMode] = useState('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authForm, setAuthForm] = useState(() => createAuthFormState());

  // Core data
  const [activeShiftKey, setActiveShiftKey] = useState(() => persistedState?.activeShiftKey || getShiftMeta().key);
  const [checkpoints, setCheckpoints] = useState(() => persistedState?.checkpoints || initialCheckpoints);
  const [shipsData, setShipsData] = useState(() => persistedState?.shipsData || initialShipsData);
  const [usersData, setUsersData] = useState(() => normalizeUsersCollection(persistedState?.usersData || mockUsersList));
  const [incidentsData, setIncidentsData] = useState(() => persistedState?.incidentsData || []);
  const [historyEntries, setHistoryEntries] = useState(() => sortHistoryEntries(persistedState?.historyEntries || createSeedHistoryEntries()));
  const [notifications, setNotifications] = useState(() => sortNotifications(persistedState?.notifications || []));
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [shiftClock, setShiftClock] = useState(() => Date.now());

  // Crew migration effect
  useEffect(() => {
    if (shipsData.length === 0) return;
    const todayStr = new Date().toISOString().split('T')[0];
    let shipsChanged = false;
    let usersToUpdate = [];
    const updatedShips = shipsData.map(ship => {
      let newPersonnel = [...(ship.personnel || [])];
      let newNextMonth = [...(ship.personnelNextMonth || [])];
      let newSchedules = { ...(ship.personnelSchedules || {}) };
      let shipModified = false;
      newNextMonth.forEach(uId => {
        const schedule = newSchedules[uId];
        if (schedule && schedule.startDate && schedule.startDate <= todayStr) {
          if (!newPersonnel.includes(uId)) newPersonnel.push(uId);
          newNextMonth = newNextMonth.filter(id => id !== uId);
          usersToUpdate.push({ userId: uId, shipAssigned: ship.name });
          shipModified = true; shipsChanged = true;
        }
      });
      if (shipModified) return { ...ship, personnel: newPersonnel, personnelNextMonth: newNextMonth, personnelSchedules: newSchedules };
      return ship;
    });
    if (shipsChanged) {
      setShipsData(updatedShips);
      setUsersData(prev => prev.map(u => { const update = usersToUpdate.find(x => x.userId === u.id); if (update) return { ...u, shipAssigned: update.shipAssigned, status: 'active' }; return u; }));
    }
  }, []);

  // UI states
  const [activeForms, setActiveForms] = useState({});
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [selectedReportDetail, setSelectedReportDetail] = useState(null);
  const [newCustomNode, setNewCustomNode] = useState('');
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState(() => createIncidentFormState());
  const [activeShipId, setActiveShipId] = useState(null);
  const [shipDetailTab, setShipDetailTab] = useState('info');
  const [scheduleMonth, setScheduleMonth] = useState('current');
  const [isEditingShipInfo, setIsEditingShipInfo] = useState(false);
  const [editShipInfoData, setEditShipInfoData] = useState({});
  const [showShipForm, setShowShipForm] = useState(false);
  const [shipFormData, setShipFormData] = useState(() => createShipFormState());
  const [newCheckpoint, setNewCheckpoint] = useState('');
  const [newShipCp, setNewShipCp] = useState({name: '', desc: ''});
  const [showShipDocForm, setShowShipDocForm] = useState(false);
  const [newShipDoc, setNewShipDoc] = useState(() => createShipDocumentState());
  const [weatherInfo, setWeatherInfo] = useState(() => loadWeatherCache());
  const [weatherLoading, setWeatherLoading] = useState(() => !loadWeatherCache());
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [incidentMeta, setIncidentMeta] = useState(() => persistedState?.incidentMeta || {});
  const [newProgress, setNewProgress] = useState({ comment: '', photoUrl: null });
  const [showUserForm, setShowUserForm] = useState(false);
  const [userFormData, setUserFormData] = useState(() => createUserFormState());
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [patrolTab, setPatrolTab] = useState('checkpoint');
  const previousUsersDataRef = useRef(usersData);

  // Computed values
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const currentShiftMeta = useMemo(() => getShiftMeta(new Date(shiftClock)), [shiftClock]);
  const currentUserRecord = useMemo(() => usersData.find(user => user.id === sessionUserId) || null, [usersData, sessionUserId]);
  const currentUser = currentUserRecord?.name || '';
  const currentUserRole = currentUserRecord?.role || ACCESS_ROLES.PETUGAS;
  const isAdmin = currentUserRole === ACCESS_ROLES.ADMIN;
  const isPic = currentUserRole === ACCESS_ROLES.PIC;
  const isPetugas = currentUserRole === ACCESS_ROLES.PETUGAS;
  const currentUserId = currentUserRecord?.id || null;
  const operationalShip = useMemo(() => { if (shipsData.length === 0) return null; if (currentUserRecord?.shipAssigned) return shipsData.find(ship => ship.name === currentUserRecord.shipAssigned) || shipsData[0]; return shipsData[0]; }, [shipsData, currentUserRecord?.shipAssigned]);
  const operationalShipName = operationalShip?.name || currentUserRecord?.shipAssigned || 'MT MENGGALA';
  const selectedHistoryEntry = useMemo(() => historyEntries.find(entry => entry.id === selectedHistoryId) || null, [historyEntries, selectedHistoryId]);
  const visibleNotifications = useMemo(() => {
    if (!currentUserId) return [];
    return notifications.filter(notification => notification.targetUserIds.includes(currentUserId));
  }, [notifications, currentUserId]);
  const unreadNotificationCount = useMemo(() => {
    if (!currentUserId) return 0;
    return visibleNotifications.filter(notification => !notification.readByUserIds.includes(currentUserId)).length;
  }, [visibleNotifications, currentUserId]);
  const filteredCheckpoints = useMemo(() => checkpoints.filter(cp => cp.name.toLowerCase().includes(deferredSearchQuery.toLowerCase())), [checkpoints, deferredSearchQuery]);
  const incidentLocationOptions = useMemo(() => Array.from(new Set(checkpoints.map(cp => cp.name))), [checkpoints]);
  const completedCount = useMemo(() => checkpoints.filter(c => c.status === 'completed').length, [checkpoints]);
  const totalCount = checkpoints.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const activePatrolId = useMemo(() => Object.keys(activeForms)[0], [activeForms]);
  const activePatrolState = useMemo(() => activePatrolId ? activeForms[activePatrolId] : null, [activeForms, activePatrolId]);
  const activePatrolItem = useMemo(() => activePatrolId ? checkpoints.find(c => c.id === Number(activePatrolId)) : null, [activePatrolId, checkpoints]);
  const canPatrolCurrentShip = Boolean(currentUserRecord && (isAdmin || isPic || (isPetugas && currentUserRecord.shipAssigned && currentUserRecord.status === 'active')));

  const canManageIncident = useCallback((incident) => { if (!currentUserRecord || !incident) return false; if (isAdmin || isPic) return true; if (!isPetugas) return false; return Boolean(currentUserRecord.shipAssigned && incident.shipName === currentUserRecord.shipAssigned); }, [currentUserRecord, isAdmin, isPic, isPetugas]);
  const canCloseIncident = useCallback((incident) => Boolean(currentUserRecord && incident && isPic), [currentUserRecord, isPic]);
  const getUsersByRole = useCallback((roles) => (
    usersData.filter(user => roles.includes(user.role)).map(user => user.id)
  ), [usersData]);
  const getShipRecipients = useCallback((shipName, options = {}) => {
    const { includeAdmins = false, includePic = false, includePetugas = false, includeUserIds = [] } = options;
    const recipients = new Set(includeUserIds.filter(Boolean));
    usersData.forEach((user) => {
      if (includeAdmins && user.role === ACCESS_ROLES.ADMIN) recipients.add(user.id);
      if (shipName && includePic && user.role === ACCESS_ROLES.PIC && user.shipAssigned === shipName) recipients.add(user.id);
      if (shipName && includePetugas && user.role === ACCESS_ROLES.PETUGAS && user.shipAssigned === shipName && user.status === 'active') recipients.add(user.id);
    });
    return Array.from(recipients);
  }, [usersData]);
  const appendNotifications = useCallback((nextNotifications) => {
    if (!Array.isArray(nextNotifications) || nextNotifications.length === 0) return;
    setNotifications((previousNotifications) => {
      const dedupeSet = new Set(previousNotifications.map(notification => notification.dedupeKey).filter(Boolean));
      const additions = [];
      nextNotifications.forEach((notification) => {
        if (!notification?.targetUserIds?.length) return;
        if (notification.dedupeKey && dedupeSet.has(notification.dedupeKey)) return;
        const record = createNotificationRecord(notification);
        if (record.dedupeKey) dedupeSet.add(record.dedupeKey);
        additions.push(record);
      });
      if (additions.length === 0) return previousNotifications;
      return sortNotifications([...additions, ...previousNotifications]);
    });
  }, []);
  const markNotificationAsRead = useCallback((notificationId) => {
    if (!currentUserId) return;
    setNotifications(previousNotifications => previousNotifications.map((notification) => {
      if (notification.id !== notificationId || notification.readByUserIds.includes(currentUserId)) return notification;
      return { ...notification, readByUserIds: [...notification.readByUserIds, currentUserId] };
    }));
  }, [currentUserId]);
  const markAllNotificationsAsRead = useCallback(() => {
    if (!currentUserId) return;
    setNotifications(previousNotifications => previousNotifications.map((notification) => (
      notification.targetUserIds.includes(currentUserId) && !notification.readByUserIds.includes(currentUserId)
        ? { ...notification, readByUserIds: [...notification.readByUserIds, currentUserId] }
        : notification
    )));
  }, [currentUserId]);
  const navigateToLivePatrol = useCallback((tab = 'checkpoint') => {
    setSelectedHistoryId(null);
    setCurrentPage('home');
    setPatrolTab(tab);
    setSearchQuery('');
    setActiveForms({});
    setSelectedReportDetail(null);
    setSelectedIncident(null);
  }, []);
  const openNotificationsPage = useCallback(() => {
    setNotificationReturnPage(currentPage);
    setShowSettingsDropdown(false);
    setShowNotificationsDropdown(false);
    setCurrentPage('notifications');
  }, [currentPage]);
  const closeNotificationsPage = useCallback(() => {
    setCurrentPage(notificationReturnPage || 'home');
  }, [notificationReturnPage]);
  const openHistoryEntry = useCallback((historyId) => {
    setSelectedHistoryId(historyId);
    setCurrentPage('home');
    setPatrolTab('info');
    setSearchQuery('');
    setActiveForms({});
    setSelectedReportDetail(null);
    setSelectedIncident(null);
  }, []);
  const closeHistoryEntry = useCallback(() => {
    setSelectedHistoryId(null);
    setCurrentPage('history');
    setPatrolTab('checkpoint');
    setSearchQuery('');
  }, []);
  const handleDeleteHistoryEntry = useCallback((historyId) => {
    if (!isAdmin) return;
    const targetEntry = historyEntries.find(entry => entry.id === historyId);
    if (!targetEntry) return;
    setConfirmDialog({
      title: 'Hapus Riwayat Patroli',
      message: `Anda yakin ingin menghapus riwayat ${targetEntry.ship} - ${targetEntry.shift} (${targetEntry.date})?`,
      confirmText: 'YA, HAPUS',
      cancelText: 'BATAL',
      onConfirm: () => {
        setHistoryEntries(previousEntries => previousEntries.filter(entry => entry.id !== historyId));
        appendNotifications([{
          type: 'history_deleted',
          title: 'Riwayat patroli dihapus',
          message: `${targetEntry.ship} - ${targetEntry.shift} (${targetEntry.date}) dihapus oleh ${currentUser || 'Admin'}.`,
          senderName: currentUser || 'Admin',
          senderRole: currentUserRole,
          targetUserIds: getUsersByRole([ACCESS_ROLES.ADMIN]),
          route: 'history/list',
          historyId,
        }]);
        if (selectedHistoryId === historyId) {
          setSelectedHistoryId(null);
          setCurrentPage('history');
          setPatrolTab('checkpoint');
        }
      }
    });
  }, [appendNotifications, currentUser, currentUserRole, getUsersByRole, historyEntries, isAdmin, selectedHistoryId]);

  // Computed incident lists
  const patrolIncidents = useMemo(() => checkpoints.filter(c => c.status === 'completed' && c.resultType === 'temuan').map(c => ({ id: `p-${c.id}`, date: new Date().toLocaleDateString('id-ID'), time: c.time, location: c.name, shipName: c.shipName || 'MT MENGGALA', deskripsi: c.kejadian, penyebab: c.penyebab, tindakLanjut: c.tindakLanjut, reportedBy: c.completedBy, photoUrl: c.photoUrl, isPatrol: true })), [checkpoints]);
  const allIncidents = useMemo(() => [...incidentsData, ...patrolIncidents].map(incident => ({ ...incident, shipName: incident.shipName || 'MT MENGGALA' })), [incidentsData, patrolIncidents]);
  const visibleIncidents = useMemo(() => isPetugas && currentUserRecord?.shipAssigned ? allIncidents.filter(incident => incident.shipName === currentUserRecord.shipAssigned) : allIncidents, [allIncidents, currentUserRecord?.shipAssigned, isPetugas]);

  const handleNotificationClick = useCallback((notification) => {
    if (!notification) return;
    markNotificationAsRead(notification.id);
    setShowNotificationsDropdown(false);

    if (notification.route === 'incidents/detail') {
      const incident = allIncidents.find(item => item.id === notification.routeParams?.incidentId || item.id === notification.incidentId);
      setSelectedHistoryId(null);
      setCurrentPage('incidents');
      setPatrolTab('checkpoint');
      setSearchQuery('');
      setActiveForms({});
      setSelectedReportDetail(null);
      if (incident) setSelectedIncident(incident);
      return;
    }

    if (notification.route === 'history/detail') {
      openHistoryEntry(notification.routeParams?.historyId || notification.historyId);
      return;
    }

    if (notification.route === 'patrol/info') {
      navigateToLivePatrol('info');
      return;
    }

    if (notification.route === 'patrol/checkpoint') {
      navigateToLivePatrol('checkpoint');
      return;
    }

    closeHistoryEntry();
  }, [allIncidents, closeHistoryEntry, markNotificationAsRead, navigateToLivePatrol, openHistoryEntry]);

  useEffect(() => {
    const timerId = window.setInterval(() => setShiftClock(Date.now()), 60 * 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!operationalShipName) return;
    appendNotifications([{
      type: 'shift_started',
      title: 'Shift patroli dimulai',
      message: `${currentShiftMeta.label} ${currentShiftMeta.timeRange} untuk ${operationalShipName} telah dimulai.`,
      senderName: 'Sistem',
      senderRole: 'SYSTEM',
      targetUserIds: getShipRecipients(operationalShipName, { includePic: true, includePetugas: true }),
      route: 'patrol/checkpoint',
      shipName: operationalShipName,
      shiftKey: currentShiftMeta.key,
      dedupeKey: `shift-started:${operationalShipName}:${currentShiftMeta.key}`,
    }]);
  }, [appendNotifications, currentShiftMeta.key, currentShiftMeta.label, currentShiftMeta.timeRange, getShipRecipients, operationalShipName]);

  useEffect(() => {
    const shiftDefinition = SHIFT_SEQUENCE.find(shift => shift.id === currentShiftMeta.id);
    if (!shiftDefinition || !operationalShipName) return;
    const parts = getJakartaDateParts(new Date(shiftClock));
    const remainingMinutes = (shiftDefinition.endHour * 60) - ((parts.hour * 60) + parts.minute);
    const pendingCheckpoints = checkpoints.filter(checkpoint => checkpoint.status === 'pending').length;
    if (remainingMinutes > 30 || remainingMinutes <= 0) return;

    appendNotifications([
      {
        type: 'shift_ending_soon',
        title: 'Shift akan berakhir',
        message: `${currentShiftMeta.label} akan selesai dalam ${remainingMinutes} menit.`,
        senderName: 'Sistem',
        senderRole: 'SYSTEM',
        targetUserIds: getShipRecipients(operationalShipName, { includePic: true, includePetugas: true }),
        route: 'patrol/info',
        shipName: operationalShipName,
        shiftKey: currentShiftMeta.key,
        dedupeKey: `shift-ending-soon:${operationalShipName}:${currentShiftMeta.key}`,
      },
      ...(pendingCheckpoints > 0 ? [{
        type: 'checkpoint_pending',
        title: 'Masih ada checkpoint pending',
        message: `${pendingCheckpoints} checkpoint belum dipatroli pada ${currentShiftMeta.label}.`,
        senderName: 'Sistem',
        senderRole: 'SYSTEM',
        targetUserIds: getShipRecipients(operationalShipName, { includePic: true, includePetugas: true }),
        route: 'patrol/checkpoint',
        shipName: operationalShipName,
        shiftKey: currentShiftMeta.key,
        dedupeKey: `checkpoint-pending:${operationalShipName}:${currentShiftMeta.key}`,
      }] : []),
    ]);
  }, [appendNotifications, checkpoints, currentShiftMeta.id, currentShiftMeta.key, currentShiftMeta.label, getShipRecipients, operationalShipName, shiftClock]);

  useEffect(() => {
    const persistedShiftMeta = getShiftMetaFromKey(activeShiftKey);
    if (!persistedShiftMeta || persistedShiftMeta.key === currentShiftMeta.key) return;

    const shipSnapshot = operationalShip || shipsData[0] || null;
    const nextHistoryBatch = [];
    let workingShiftMeta = persistedShiftMeta;
    let workingCheckpoints = checkpoints;

    while (workingShiftMeta.key !== currentShiftMeta.key) {
      nextHistoryBatch.push(buildHistoryEntry({
        shiftMeta: workingShiftMeta,
        checkpoints: workingCheckpoints,
        ship: shipSnapshot,
        users: usersData,
        weatherInfo,
      }));
      workingCheckpoints = resetCheckpointCollection(workingCheckpoints);
      workingShiftMeta = getNextShiftMeta(workingShiftMeta);
    }

    setHistoryEntries(previousEntries => mergeHistoryEntries(previousEntries, nextHistoryBatch));
    appendNotifications(nextHistoryBatch.flatMap((entry) => {
      const notificationsBatch = [
        {
          type: 'shift_history_created',
          title: 'Riwayat shift tersimpan',
          message: `${entry.ship} ${entry.shift} berhasil disimpan ke riwayat patroli.`,
          senderName: 'Sistem',
          senderRole: 'SYSTEM',
          targetUserIds: getShipRecipients(entry.ship, { includeAdmins: true, includePic: true }),
          route: 'history/detail',
          routeParams: { historyId: entry.id },
          historyId: entry.id,
          shipName: entry.ship,
          shiftKey: entry.key,
          dedupeKey: `shift-history-created:${entry.key}`,
        },
      ];

      if (entry.missed > 0) {
        notificationsBatch.push({
          type: 'checkpoint_missed',
          title: 'Ada checkpoint missed',
          message: `${entry.missed} titik patroli missed pada ${entry.ship} ${entry.shift}.`,
          senderName: 'Sistem',
          senderRole: 'SYSTEM',
          targetUserIds: getShipRecipients(entry.ship, { includeAdmins: true, includePic: true }),
          route: 'history/detail',
          routeParams: { historyId: entry.id },
          historyId: entry.id,
          shipName: entry.ship,
          shiftKey: entry.key,
          dedupeKey: `checkpoint-missed:${entry.key}`,
        });
      }

      return notificationsBatch;
    }));
    setCheckpoints(workingCheckpoints);
    setActiveForms({});
    setSelectedReportDetail(null);
    setSelectedIncident(null);
    setActiveShiftKey(currentShiftMeta.key);
  }, [activeShiftKey, appendNotifications, checkpoints, currentShiftMeta.key, getShipRecipients, operationalShip, shipsData, usersData, weatherInfo]);

  // Patrol handlers
  const handleActionClick = useCallback((id, type) => { if (!canPatrolCurrentShip) return; setActiveForms({ [id]: { type, penyebab: '', kejadian: '', tindakLanjut: '', photoUrl: null } }); }, [canPatrolCurrentShip]);
  const handleFormChange = useCallback((id, field, value) => { setActiveForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } })); }, []);
  const handlePhotoUpload = useCallback(async (id, isIncident = false) => { const dataUrl = await pickLocalImage(); if (!dataUrl) return; const url = await saveImageToDB(dataUrl); if(!url) return; if(isIncident) setIncidentForm(prev => ({...prev, photoUrl: url})); else setActiveForms(prev => ({ ...prev, [id]: { ...prev[id], photoUrl: url } })); }, []);
  const handleSubmitPatrol = useCallback((id) => {
    if (!currentUserRecord) return;
    const now = new Date();
    const timeString = now.toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
    const currentCheckpoint = checkpoints.find(checkpoint => checkpoint.id === id);
    if (!currentCheckpoint) return;
    const formState = activeForms[id];
    if (!formState) return;
    const submittedItem = {
      ...currentCheckpoint,
      status: 'completed',
      completedBy: currentUser,
      time: timeString,
      completedAt: now.toISOString(),
      shipName: operationalShipName,
      photoUrl: formState.photoUrl,
      resultType: formState.type,
      penyebab: sanitizeMultilineText(formState.penyebab, 240),
      kejadian: sanitizeMultilineText(formState.kejadian, 280),
      tindakLanjut: sanitizeMultilineText(formState.tindakLanjut, 240),
    };
    setActiveForms(prev => {
      setCheckpoints(cp => cp.map((checkpoint) => checkpoint.id === id ? submittedItem : checkpoint));
      const newForms = { ...prev };
      delete newForms[id];
      return newForms;
    });

    if (submittedItem?.resultType === 'temuan') {
      appendNotifications([{
        type: 'incident_created',
        title: 'Temuan patroli baru',
        message: `${submittedItem.name} dilaporkan sebagai temuan oleh ${currentUser}.`,
        senderName: currentUser,
        senderRole: currentUserRole,
        targetUserIds: getShipRecipients(operationalShipName, { includeAdmins: true, includePic: true }),
        route: 'incidents/detail',
        routeParams: { incidentId: `p-${submittedItem.id}` },
        incidentId: `p-${submittedItem.id}`,
        shipName: operationalShipName,
      }]);
    }
  }, [activeForms, appendNotifications, checkpoints, currentUser, currentUserRecord, currentUserRole, getShipRecipients, operationalShipName]);
  const handleDeleteReport = useCallback((id) => { 
    setConfirmDialog({ 
      title: 'Hapus Laporan', 
      message: 'Apakah Anda yakin ingin menghapus laporan patroli ini?', 
      confirmText: 'YA, HAPUS',
      cancelText: 'BATAL',
      onConfirm: () => { 
        setCheckpoints(prev => prev.map(c => c.id === id ? { id: c.id, name: c.name, status: 'pending' } : c)); 
        setSelectedReportDetail(null); 
      } 
    }); 
  }, []);
  const handleOpenPatrolResult = useCallback((item) => {
    const isReadOnly = Boolean(item?.readOnly || item?.historyId || selectedHistoryEntry);
    if (item.resultType === 'temuan') {
      setSelectedIncident({
        id: item.incidentId || `p-${item.id}`,
        date: item.date || selectedHistoryEntry?.date || new Date().toLocaleDateString('id-ID'),
        time: item.time,
        location: item.name,
        shipName: item.shipName || selectedHistoryEntry?.ship || operationalShipName,
        deskripsi: item.kejadian,
        penyebab: item.penyebab,
        tindakLanjut: item.tindakLanjut,
        reportedBy: item.completedBy,
        photoUrl: item.photoUrl,
        isPatrol: true,
        readOnly: isReadOnly,
      });
      return;
    }
    setSelectedReportDetail({
      ...item,
      shipName: item.shipName || selectedHistoryEntry?.ship || operationalShipName,
      date: item.date || selectedHistoryEntry?.date || new Date().toLocaleDateString('id-ID'),
      readOnly: isReadOnly,
    });
  }, [operationalShipName, selectedHistoryEntry]);
  const handleAddCustomPatrolNode = useCallback(() => { setNewCustomNode(prev => { const safeName = sanitizeText(prev, 80); if(safeName !== '') { setCheckpoints(cp => [...cp, { id: Date.now(), name: safeName, status: 'pending' }]); return ''; } return prev; }); }, []);

  // Incident handlers
  const openIncidentModal = useCallback(() => { setIncidentForm(createIncidentFormState()); setShowIncidentModal(true); }, []);
  const closeIncidentModal = useCallback(() => { setShowIncidentModal(false); setIncidentForm(createIncidentFormState()); }, []);
  const handleSubmitIncident = useCallback(() => {
    if (!currentUserRecord) return;
    const loc = incidentForm.locType === 'custom' ? sanitizeText(incidentForm.customLocation, 80) : sanitizeText(incidentForm.location, 80);
    if (!loc || !sanitizeMultilineText(incidentForm.deskripsi, 320)) return;
    const newIncident = { ...incidentForm, id: Date.now(), time: new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'}), date: new Date().toLocaleDateString('id-ID'), reportedBy: currentUser, shipName: operationalShipName, location: loc, customLocation: incidentForm.locType === 'custom' ? loc : '', photoUrl: incidentForm.photoUrl, penyebab: sanitizeMultilineText(incidentForm.penyebab, 240), deskripsi: sanitizeMultilineText(incidentForm.deskripsi, 320), tindakLanjut: sanitizeMultilineText(incidentForm.tindakLanjut, 240) };
    setIncidentsData(prev => [newIncident, ...prev]);
    appendNotifications([{
      type: 'incident_created',
      title: 'Laporan temuan baru',
      message: `${loc} dilaporkan sebagai temuan baru oleh ${currentUser}.`,
      senderName: currentUser,
      senderRole: currentUserRole,
      targetUserIds: getShipRecipients(operationalShipName, { includeAdmins: true, includePic: true }),
      route: 'incidents/detail',
      routeParams: { incidentId: newIncident.id },
      incidentId: newIncident.id,
      shipName: operationalShipName,
    }]);
    closeIncidentModal();
  }, [appendNotifications, closeIncidentModal, currentUser, currentUserRecord, currentUserRole, getShipRecipients, incidentForm, operationalShipName]);

  // Ship handlers
  const activeShip = useMemo(() => shipsData.find(s => s.id === activeShipId), [shipsData, activeShipId]);
  const updateActiveShip = useCallback((updates) => { if (!isAdmin || !activeShipId) return; setShipsData(prev => prev.map(s => s.id === activeShipId ? { ...s, ...updates } : s)); }, [isAdmin, activeShipId]);
  const openShipDocForm = useCallback(() => {
    if (!isAdmin || !activeShip) return;
    setNewShipDoc(createShipDocumentState());
    setShowShipDocForm(true);
  }, [isAdmin, activeShip]);
  const closeShipDocForm = useCallback(() => {
    setShowShipDocForm(false);
    setNewShipDoc(createShipDocumentState());
  }, []);
  const handleTogglePersonnel = useCallback((userId) => { if (!isAdmin || !activeShip) return; const targetArray = scheduleMonth === 'current' ? activeShip.personnel : activeShip.personnelNextMonth; const isAssigned = targetArray.includes(userId); if (isAssigned) { updateActiveShip({ [scheduleMonth === 'current' ? 'personnel' : 'personnelNextMonth']: targetArray.filter(id => id !== userId) }); if(scheduleMonth === 'current') setUsersData(prev => prev.map(u => u.id === userId ? {...u, shipAssigned: null, status: 'off-duty'} : u)); } else { updateActiveShip({ [scheduleMonth === 'current' ? 'personnel' : 'personnelNextMonth']: [...targetArray, userId] }); if(scheduleMonth === 'current') setUsersData(prev => prev.map(u => u.id === userId ? {...u, shipAssigned: activeShip.name, status: 'active'} : u)); } }, [isAdmin, activeShip, scheduleMonth, updateActiveShip]);
  const handleAddShipCp = useCallback(() => { if (!isAdmin || !activeShip) return; const safeName = sanitizeText(newShipCp.name, 80); if(safeName) { updateActiveShip({ customCheckpoints: [...activeShip.customCheckpoints, { name: safeName, desc: sanitizeMultilineText(newShipCp.desc, 140) }] }); setNewShipCp({name: '', desc: ''}); } }, [isAdmin, activeShip, newShipCp, updateActiveShip]);
  const handleShipPhotoUpdate = useCallback(async () => { if (!isAdmin || !activeShipId) return; const dataUrl = await pickLocalImage(); if (!dataUrl) return; const url = await saveImageToDB(dataUrl); if (url) updateActiveShip({ photoUrl: url }); }, [isAdmin, activeShipId, updateActiveShip]);
  const handleChangeSchedule = useCallback((userId, field, value) => { if (!isAdmin || !activeShip) return; const currentSchedules = activeShip.personnelSchedules || {}; const newSchedules = { ...currentSchedules, [userId]: { ...(currentSchedules[userId] || {}), [field]: value } }; updateActiveShip({ personnelSchedules: newSchedules }); }, [isAdmin, activeShip, updateActiveShip]);
  const handleShipFormPhotoUpload = useCallback(async () => {
    const dataUrl = await pickLocalImage();
    if (!dataUrl) return;
    const url = await saveImageToDB(dataUrl);
    if (url) setShipFormData(prev => ({ ...prev, photoUrl: url }));
  }, []);
  const handleShipDocUpload = useCallback(async () => {
    if (!isAdmin || !activeShip) return;
    const pickedFile = await pickLocalFile();
    if (!pickedFile?.dataUrl) return;
    const url = await saveImageToDB(pickedFile.dataUrl);
    if (!url) return;
    setNewShipDoc(prev => ({
      ...prev,
      fileUrl: url,
      fileName: sanitizeText(pickedFile.name, 120),
      mimeType: sanitizeText(pickedFile.type || 'application/octet-stream', 120) || 'application/octet-stream',
    }));
  }, [isAdmin, activeShip]);
  const handleAddShipDoc = useCallback(() => {
    if (!isAdmin || !activeShip) return;
    const safeTitle = sanitizeText(newShipDoc.title, 80);
    if (!safeTitle || !newShipDoc.fileUrl) return;
    updateActiveShip({
      documents: [
        ...activeShip.documents,
        {
          title: safeTitle,
          desc: sanitizeMultilineText(newShipDoc.desc, 140),
          fileUrl: newShipDoc.fileUrl,
          fileName: sanitizeText(newShipDoc.fileName, 120),
          mimeType: sanitizeText(newShipDoc.mimeType, 120),
          uploadedAt: new Date().toISOString(),
        }
      ]
    });
    closeShipDocForm();
  }, [isAdmin, activeShip, newShipDoc, updateActiveShip, closeShipDocForm]);
  const handleDownloadShipDoc = useCallback(async (shipDocument) => {
    if (!shipDocument?.fileUrl) return;
    const dataUrl = shipDocument.fileUrl.startsWith('idb://') ? await loadImageFromDB(shipDocument.fileUrl) : shipDocument.fileUrl;
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = shipDocument.fileName || `${sanitizeText(shipDocument.title || 'dokumen', 40) || 'dokumen'}`;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);
  const handleDeleteShip = useCallback((id) => {
    if (!isAdmin) return;
    const targetShip = shipsData.find(s => s.id === id);
    if (!targetShip) return;
    
    if (targetShip.personnel.length > 0 || targetShip.personnelNextMonth.length > 0) {
      setConfirmDialog({
        title: 'Gagal Menghapus',
        message: `Armada ${targetShip.name} masih memiliki kru yang ditugaskan. Kosongkan kru terlebih dahulu.`,
        isAlert: true,
        confirmText: 'MENGERTI',
        onConfirm: () => {} 
      });
      return;
    }

    setConfirmDialog({
      title: 'Hapus Armada',
      message: `Anda yakin ingin menghapus armada ${targetShip.name}? Semua data titik dan laporan terkait tidak akan ikut terhapus namun armada tidak lagi tersedia.`,
      confirmText: 'YA, HAPUS',
      cancelText: 'BATAL',
      onConfirm: () => {
        setShipsData(prev => prev.filter(s => s.id !== id));
        if (activeShipId === id) setActiveShipId(null);
        closeShipDocForm();
      }
    });
  }, [isAdmin, shipsData, activeShipId, closeShipDocForm]);

  // User handlers
  const handleUserPhotoUpload = useCallback(async () => { const dataUrl = await pickLocalImage(); if (!dataUrl) return; const url = await saveImageToDB(dataUrl); if (url) setUserFormData(prev => ({...prev, photoUrl: url})); }, []);
  const handleSaveUser = useCallback(async () => { if (!isAdmin) return; const safeName = sanitizeText(userFormData.name, 80); const safeEmail = sanitizeEmail(userFormData.email); const passwordInput = sanitizeText(userFormData.password, 120); if (!safeName || !safeEmail) return; if (safeEmail && usersData.some(u => (u.email || '').toLowerCase() === safeEmail)) return; const credential = passwordInput ? await createPasswordCredential(passwordInput) : { passwordSalt: '', passwordHash: '', hasCredential: false }; const role = ACCESS_ROLE_VALUES.includes(userFormData.role) ? userFormData.role : ACCESS_ROLES.PETUGAS; const newUser = { id: 'u' + Date.now(), ...userFormData, name: safeName, role, email: safeEmail, password: '', hasCredential: credential.hasCredential, passwordSalt: credential.passwordSalt, passwordHash: credential.passwordHash, phone: sanitizePhone(userFormData.phone), address: sanitizeMultilineText(userFormData.address, 180), emergencyName: sanitizeText(userFormData.emergencyName, 80), emergencyContact: sanitizePhone(userFormData.emergencyContact), emergencyRelation: sanitizeText(userFormData.emergencyRelation, 40), officeAddress: sanitizeMultilineText(userFormData.officeAddress, 180), photoUrl: userFormData.photoUrl || createUserAvatar(safeName, usersData.length), status: role === ACCESS_ROLES.PETUGAS ? 'off-duty' : 'active', shipAssigned: null }; setUsersData(prev => [...prev, normalizeUserRecord(newUser, prev.length)]); setShowUserForm(false); setUserFormData(createUserFormState()); }, [isAdmin, userFormData, usersData]);
  const handleUpdateUser = useCallback(async () => { if (!isAdmin) return; if (!selectedUser?.id) return; const safeEmail = sanitizeEmail(selectedUser.email || ''); const safeName = sanitizeText(selectedUser.name, 80); if (!safeName || !safeEmail) return; if (safeEmail && usersData.some(u => u.id !== selectedUser.id && (u.email || '').toLowerCase() === safeEmail)) return; const passwordInput = sanitizeText(selectedUser.password || '', 120); const credential = passwordInput ? await createPasswordCredential(passwordInput) : null; setUsersData(prev => prev.map((u, index) => { if (u.id !== selectedUser.id) return u; const nextRole = ACCESS_ROLE_VALUES.includes(selectedUser.role) ? selectedUser.role : ACCESS_ROLES.PETUGAS; const nextShipAssigned = selectedUser.shipAssigned || null; const nextUser = { ...u, ...selectedUser, name: safeName, role: nextRole, email: safeEmail, password: '', hasCredential: credential?.hasCredential || u.hasCredential || false, passwordSalt: credential?.passwordSalt || u.passwordSalt || '', passwordHash: credential?.passwordHash || u.passwordHash || '', shipAssigned: nextShipAssigned, status: nextRole === ACCESS_ROLES.PETUGAS ? (nextShipAssigned ? (selectedUser.status || u.status || 'active') : 'off-duty') : (selectedUser.status || u.status || 'active'), phone: sanitizePhone(selectedUser.phone || ''), address: sanitizeMultilineText(selectedUser.address || '', 180), emergencyName: sanitizeText(selectedUser.emergencyName || '', 80), emergencyContact: sanitizePhone(selectedUser.emergencyContact || ''), emergencyRelation: sanitizeText(selectedUser.emergencyRelation || '', 40), officeAddress: sanitizeMultilineText(selectedUser.officeAddress || '', 180), photoUrl: selectedUser.photoUrl || u.photoUrl || createUserAvatar(safeName, index) }; return normalizeUserRecord(nextUser, index); })); setSelectedUser(null); }, [isAdmin, selectedUser, usersData]);
  const handleDeleteUser = useCallback((id) => {
    if (!isAdmin) return; 
    const targetUser = usersData.find(u => u.id === id); 
    if (targetUser?.role === ACCESS_ROLES.ADMIN) return;
    setConfirmDialog({
      title: 'Hapus Pengguna',
      message: `Anda yakin ingin menghapus akun ${targetUser.name}? Seluruh data penugasan akan dihapus.`,
      confirmText: 'YA, HAPUS',
      cancelText: 'BATAL',
      onConfirm: () => {
        setUsersData(prev => prev.filter(u => u.id !== id)); 
        setShipsData(prev => prev.map(ship => ({ ...ship, personnel: ship.personnel.filter(userId => userId !== id), personnelNextMonth: ship.personnelNextMonth.filter(userId => userId !== id) }))); 
        if (sessionUserId === id) { setSessionUserId(null); setAuthMode('login'); setAuthNotice('Akun sedang dipakai telah dihapus. Silakan login ulang.'); } 
        setSelectedUser(null);
      }
    });
  }, [isAdmin, usersData, sessionUserId]);
  const handleEditUserPhotoUpload = useCallback(async () => { const dataUrl = await pickLocalImage(); if(!dataUrl) return; const url = await saveImageToDB(dataUrl); if (url) setSelectedUser(prev => ({...prev, photoUrl: url})); }, []);

  // Progress & incident meta handlers
  const handleAddProgress = useCallback((incidentId) => {
    const incident = allIncidents.find(item => item.id === incidentId) || selectedIncident;
    if (!canManageIncident(incident)) return;
    const time = new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
    const date = new Date().toLocaleDateString('id-ID');
    setIncidentMeta(prev => ({ ...prev, [incidentId]: { ...prev[incidentId], status: prev[incidentId]?.status || 'open', progress: [...(prev[incidentId]?.progress || []), { ...newProgress, comment: sanitizeMultilineText(newProgress.comment, 240), photoUrl: newProgress.photoUrl, time, date, author: currentUser }] } }));
    appendNotifications([{
      type: 'incident_progress_updated',
      title: 'Progress temuan diperbarui',
      message: `${incident?.location || 'Temuan'} mendapat update progress dari ${currentUser}.`,
      senderName: currentUser,
      senderRole: currentUserRole,
      targetUserIds: getShipRecipients(incident?.shipName || operationalShipName, { includeAdmins: true, includePic: true, includeUserIds: incident?.reportedBy ? usersData.filter(user => user.name === incident.reportedBy).map(user => user.id) : [] }),
      route: 'incidents/detail',
      routeParams: { incidentId },
      incidentId,
      shipName: incident?.shipName || operationalShipName,
    }]);
    setNewProgress({ comment: '', photoUrl: null });
  }, [allIncidents, appendNotifications, canManageIncident, currentUser, currentUserRole, getShipRecipients, newProgress, operationalShipName, selectedIncident, usersData]);
  const handleCloseIncident = useCallback((incidentId) => { 
    const incident = allIncidents.find(item => item.id === incidentId) || selectedIncident; 
    if (!canCloseIncident(incident)) return; 
    setConfirmDialog({ 
      title: 'Tutup Laporan', 
      message: 'Apakah Anda yakin masalah ini sudah selesai diselesaikan?', 
      confirmText: 'YA, TUTUP',
      cancelText: 'BELUM',
      onConfirm: () => {
        setIncidentMeta(prev => ({ ...prev, [incidentId]: { ...(prev[incidentId] || {}), status: 'closed' } }));
        appendNotifications([{
          type: 'incident_closed',
          title: 'Temuan ditutup',
          message: `${incident?.location || 'Temuan'} telah ditutup oleh ${currentUser}.`,
          senderName: currentUser,
          senderRole: currentUserRole,
          targetUserIds: getShipRecipients(incident?.shipName || operationalShipName, { includeAdmins: true, includePic: true, includePetugas: true, includeUserIds: incident?.reportedBy ? usersData.filter(user => user.name === incident.reportedBy).map(user => user.id) : [] }),
          route: 'incidents/detail',
          routeParams: { incidentId },
          incidentId,
          shipName: incident?.shipName || operationalShipName,
        }]);
      } 
    }); 
  }, [allIncidents, appendNotifications, canCloseIncident, currentUser, currentUserRole, getShipRecipients, operationalShipName, selectedIncident, usersData]);
  const handlePhotoProgress = useCallback(async () => { const dataUrl = await pickLocalImage(); if(!dataUrl) return; const url = await saveImageToDB(dataUrl); if (url) setNewProgress(prev => ({ ...prev, photoUrl: url })); }, []);

  // Ship form handlers
  const handleSaveShip = useCallback(() => { if (!isAdmin) return; const safeName = sanitizeText(shipFormData.name, 80); if (!safeName) return; const newShip = { id: 's' + Date.now(), ...shipFormData, name: safeName, route: sanitizeText(shipFormData.route, 100), cargoType: sanitizeText(shipFormData.cargoType, 80), cargoAmount: sanitizeText(shipFormData.cargoAmount, 40), lat: '-6.0000', lng: '106.0000', personnel: [], personnelNextMonth: [], documents: [], photoUrl: shipFormData.photoUrl || createPosterDataUrl(safeName, 'Armada Lokal', 2, false) }; setShipsData(prev => [...prev, newShip]); setShowShipForm(false); setShipFormData(createShipFormState()); setNewCheckpoint(''); }, [isAdmin, shipFormData]);
  const handleAddCheckpointToForm = useCallback(() => { setNewCheckpoint(prev => { const safeName = sanitizeText(prev, 80); if(safeName !== '') { setShipFormData(fd => ({...fd, customCheckpoints: [...fd.customCheckpoints, { name: safeName, desc: '' }]})); return ''; } return prev; }); }, []);
  const handleRemoveCheckpointFromForm = useCallback((index) => { setShipFormData(prev => ({ ...prev, customCheckpoints: prev.customCheckpoints.filter((_, i) => i !== index) })); }, []);

  // Auth handlers
  const handleLogout = useCallback((message = 'Sesi Anda telah berakhir. Silakan login kembali.') => { setSessionUserId(null); setCurrentPage('home'); setActiveShipId(null); setSelectedIncident(null); setSelectedReportDetail(null); setSelectedUser(null); setSelectedHistoryId(null); setShowUserForm(false); setShowShipForm(false); setShowShipDocForm(false); setShowNotificationsDropdown(false); setNotificationReturnPage('home'); setActiveForms({}); setNewProgress({ comment: '', photoUrl: null }); setNewShipDoc(createShipDocumentState()); setAuthMode('login'); setAuthError(''); setAuthNotice(message); setAuthForm(createAuthFormState()); }, []);
  const handleLogin = useCallback(async () => { const safeEmail = sanitizeEmail(authForm.email); const passwordInput = sanitizeText(authForm.password, 120); if (!safeEmail || !passwordInput) { setAuthError('Email dan password wajib diisi.'); return; } setAuthBusy(true); setAuthError(''); setAuthNotice(''); try { const user = usersData.find(item => (item.email || '').toLowerCase() === safeEmail); if (!user) { setAuthError('Akun tidak ditemukan.'); return; } if (!user.hasCredential || !user.passwordHash || !user.passwordSalt) { setAuthError('Akun ini belum punya password aktif. Minta admin untuk mengatur ulang kredensial.'); return; } const isValid = await verifyPasswordCredential(user, passwordInput); if (!isValid) { setAuthError('Password yang Anda masukkan tidak cocok.'); return; } if (user.role === ACCESS_ROLES.PETUGAS && (!user.shipAssigned || user.status !== 'active')) { setAuthError('Petugas off-duty atau belum punya penugasan kapal tidak bisa login.'); return; } setSessionUserId(user.id); setCurrentPage('home'); setActiveShipId(null); setAuthMode('login'); setAuthForm(createAuthFormState()); } finally { setAuthBusy(false); } }, [authForm, usersData]);
  const handleRegister = useCallback(async () => { const safeName = sanitizeText(authForm.name, 80); const safeEmail = sanitizeEmail(authForm.email); const passwordInput = sanitizeText(authForm.password, 120); const confirmPassword = sanitizeText(authForm.confirmPassword, 120); if (!safeName || !safeEmail || !passwordInput || !confirmPassword) { setAuthError('Nama, email, password, dan konfirmasi password wajib diisi.'); return; } if (passwordInput.length < 8) { setAuthError('Password minimal 8 karakter.'); return; } if (passwordInput !== confirmPassword) { setAuthError('Konfirmasi password belum sama.'); return; } if (usersData.some(user => (user.email || '').toLowerCase() === safeEmail)) { setAuthError('Email ini sudah terdaftar.'); return; } setAuthBusy(true); setAuthError(''); setAuthNotice(''); try { const credential = await createPasswordCredential(passwordInput); const nextUser = normalizeUserRecord({ id: `u${Date.now()}`, name: safeName, role: ACCESS_ROLES.PETUGAS, type: sanitizeText(authForm.type, 20) || 'BUJP', status: 'off-duty', shipAssigned: null, email: safeEmail, password: '', hasCredential: credential.hasCredential, passwordSalt: credential.passwordSalt, passwordHash: credential.passwordHash, phone: sanitizePhone(authForm.phone), emergencyRelation: 'Orang Tua', photoUrl: createUserAvatar(safeName, usersData.length) }, usersData.length); setUsersData(prev => [...prev, nextUser]); setAuthMode('login'); setAuthForm(createAuthFormState({ email: safeEmail })); setAuthNotice('Registrasi berhasil. Akun petugas baru bisa login setelah admin memberi penugasan kapal.'); } finally { setAuthBusy(false); } }, [authForm, usersData]);

  // Persistence effects
  useEffect(() => { savePersistedState({ checkpoints, shipsData, usersData, incidentsData, incidentMeta, historyEntries, activeShiftKey, notifications }); }, [checkpoints, shipsData, usersData, incidentsData, incidentMeta, historyEntries, activeShiftKey, notifications]);
  useEffect(() => { saveAuthSession(sessionUserId); }, [sessionUserId]);
  useEffect(() => { if (!sessionUserId) return; const activeUser = usersData.find(user => user.id === sessionUserId); if (!activeUser) { handleLogout('Sesi login tidak lagi valid.'); return; } if (activeUser.role === ACCESS_ROLES.PETUGAS && (!activeUser.shipAssigned || activeUser.status !== 'active')) { handleLogout('Petugas off-duty atau tanpa penugasan kapal tidak bisa tetap login.'); } }, [sessionUserId, usersData]);
  useEffect(() => { if (!currentUserRecord) return; if (!isAdmin && (currentPage === 'users' || currentPage === 'ships')) { setCurrentPage('home'); setActiveShipId(null); setShowShipForm(false); setShowShipDocForm(false); setShowUserForm(false); setSelectedUser(null); } }, [currentPage, currentUserRecord, isAdmin]);
  useEffect(() => { if (activeShipId) return; setShowShipDocForm(false); }, [activeShipId]);
  useEffect(() => {
    if (!selectedHistoryId) return;
    if (currentPage !== 'home' && currentPage !== 'history') setSelectedHistoryId(null);
  }, [currentPage, selectedHistoryId]);
  useEffect(() => {
    const previousUsers = previousUsersDataRef.current;
    if (!previousUsers?.length) {
      previousUsersDataRef.current = usersData;
      return;
    }

    const assignmentNotifications = [];
    usersData.forEach((user) => {
      const previousUser = previousUsers.find(item => item.id === user.id);
      if (!previousUser) return;
      if (previousUser.shipAssigned === user.shipAssigned && previousUser.status === user.status) return;
      if (!user.shipAssigned) return;

      assignmentNotifications.push({
        type: 'assignment_changed',
        title: 'Penugasan patroli diperbarui',
        message: `${user.name} sekarang ditugaskan ke ${user.shipAssigned}.`,
        senderName: 'Sistem',
        senderRole: 'SYSTEM',
        targetUserIds: getShipRecipients(user.shipAssigned, { includePic: true, includeUserIds: [user.id] }),
        route: 'patrol/info',
        shipName: user.shipAssigned,
        dedupeKey: `assignment-changed:${user.id}:${user.shipAssigned}:${user.status}`,
      });
    });

    previousUsersDataRef.current = usersData;
    appendNotifications(assignmentNotifications);
  }, [appendNotifications, getShipRecipients, usersData]);

  // Weather
  useEffect(() => { const fetchWeather = async () => { try { const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-6.1021&longitude=106.8833&current_weather=true'); const data = await response.json(); setWeatherInfo(data.current_weather); saveWeatherCache(data.current_weather); } catch (error) { console.error(error); } finally { setWeatherLoading(false); } }; if (!weatherInfo) fetchWeather(); else setWeatherLoading(false); }, []);
  const getWeatherDetail = useCallback((code) => { if (code === 0) return { text: 'Cerah', icon: <Sun className="w-5 h-5 text-cyan-400" /> }; if (code >= 1 && code <= 3) return { text: 'Berawan', icon: <Cloud className="w-5 h-5 text-cyan-200" /> }; if (code >= 51 && code <= 67) return { text: 'Hujan Ringan', icon: <CloudRain className="w-5 h-5 text-cyan-500" /> }; if (code >= 80 && code <= 99) return { text: 'Hujan Badai', icon: <CloudRain className="w-5 h-5 text-yellow-500" /> }; return { text: 'Tidak Diketahui', icon: <Cloud className="w-5 h-5 text-slate-500" /> }; }, []);

  const value = useMemo(() => ({
    // Theme
    currentPage, setCurrentPage, theme, setTheme, isOffline, showSettingsDropdown, setShowSettingsDropdown, showNotificationsDropdown, setShowNotificationsDropdown, notificationReturnPage, openNotificationsPage, closeNotificationsPage, confirmDialog, setConfirmDialog,
    // Auth
    sessionUserId, authMode, setAuthMode, authBusy, authError, authNotice, authForm, setAuthForm, handleLogin, handleRegister, handleLogout,
    // User role
    currentUserRecord, currentUser, currentUserRole, isAdmin, isPic, isPetugas,
    // Core data
    checkpoints, shipsData, usersData, incidentsData, incidentMeta, currentShiftMeta, activeShiftKey,
    // Patrol
    filteredCheckpoints, searchQuery, setSearchQuery, patrolTab, setPatrolTab, activeForms, setActiveForms, activePatrolId, activePatrolState, activePatrolItem, canPatrolCurrentShip, completedCount, totalCount, progressPercentage, newCustomNode, setNewCustomNode,
    handleActionClick, handleFormChange, handlePhotoUpload, handleSubmitPatrol, handleDeleteReport, handleOpenPatrolResult, handleAddCustomPatrolNode,
    // Ship
    operationalShip, operationalShipName, activeShipId, setActiveShipId, activeShip, shipDetailTab, setShipDetailTab, scheduleMonth, setScheduleMonth, isEditingShipInfo, setIsEditingShipInfo, editShipInfoData, setEditShipInfoData, updateActiveShip, handleTogglePersonnel, handleAddShipCp, handleShipPhotoUpdate, handleChangeSchedule, handleAddShipDoc, handleShipDocUpload, handleDownloadShipDoc, newShipCp, setNewShipCp, newShipDoc, setNewShipDoc, showShipDocForm, openShipDocForm, closeShipDocForm,
    showShipForm, setShowShipForm, shipFormData, setShipFormData, newCheckpoint, setNewCheckpoint, handleSaveShip, handleDeleteShip, handleAddCheckpointToForm, handleRemoveCheckpointFromForm, handleShipFormPhotoUpload,
    // Incidents
    allIncidents, visibleIncidents, showIncidentModal, incidentForm, setIncidentForm, incidentLocationOptions, selectedIncident, setSelectedIncident, openIncidentModal, closeIncidentModal, handleSubmitIncident, canManageIncident, canCloseIncident,
    handleAddProgress, handleCloseIncident, newProgress, setNewProgress, handlePhotoProgress,
    // Users
    showUserForm, setShowUserForm, userFormData, setUserFormData, selectedUser, setSelectedUser, handleSaveUser, handleUpdateUser, handleDeleteUser, handleUserPhotoUpload, handleEditUserPhotoUpload,
    // Reports
    selectedReportDetail, setSelectedReportDetail, previewPhoto, setPreviewPhoto,
    // Weather
    weatherInfo, weatherLoading, getWeatherDetail,
    // History
    historyEntries, selectedHistoryEntry, openHistoryEntry, closeHistoryEntry, handleDeleteHistoryEntry,
    // Notifications
    notifications, visibleNotifications, unreadNotificationCount, appendNotifications, markNotificationAsRead, markAllNotificationsAsRead, handleNotificationClick,
  }), [
    currentPage, theme, isOffline, showSettingsDropdown, showNotificationsDropdown, notificationReturnPage, openNotificationsPage, closeNotificationsPage, confirmDialog,
    sessionUserId, authMode, authBusy, authError, authNotice, authForm, handleLogin, handleRegister, handleLogout,
    currentUserRecord, currentUser, currentUserRole, isAdmin, isPic, isPetugas,
    checkpoints, shipsData, usersData, incidentsData, incidentMeta, currentShiftMeta, activeShiftKey,
    filteredCheckpoints, searchQuery, patrolTab, activeForms, activePatrolId, activePatrolState, activePatrolItem, canPatrolCurrentShip, completedCount, totalCount, progressPercentage, newCustomNode,
    handleActionClick, handleFormChange, handlePhotoUpload, handleSubmitPatrol, handleDeleteReport, handleOpenPatrolResult, handleAddCustomPatrolNode,
    operationalShip, operationalShipName, activeShipId, activeShip, shipDetailTab, scheduleMonth, isEditingShipInfo, editShipInfoData, updateActiveShip, handleTogglePersonnel, handleAddShipCp, handleShipPhotoUpdate, handleChangeSchedule, handleAddShipDoc, handleShipDocUpload, handleDownloadShipDoc, newShipCp, newShipDoc, showShipDocForm, openShipDocForm, closeShipDocForm,
    showShipForm, shipFormData, newCheckpoint, handleSaveShip, handleDeleteShip, handleAddCheckpointToForm, handleRemoveCheckpointFromForm, handleShipFormPhotoUpload,
    allIncidents, visibleIncidents, showIncidentModal, incidentForm, incidentLocationOptions, selectedIncident, openIncidentModal, closeIncidentModal, handleSubmitIncident, canManageIncident, canCloseIncident,
    handleAddProgress, handleCloseIncident, newProgress, handlePhotoProgress,
    showUserForm, userFormData, selectedUser, handleSaveUser, handleUpdateUser, handleDeleteUser, handleUserPhotoUpload, handleEditUserPhotoUpload,
    selectedReportDetail, previewPhoto,
    weatherInfo, weatherLoading, getWeatherDetail,
    historyEntries, selectedHistoryEntry, openHistoryEntry, closeHistoryEntry, handleDeleteHistoryEntry,
    notifications, visibleNotifications, unreadNotificationCount, appendNotifications, markNotificationAsRead, markAllNotificationsAsRead, handleNotificationClick,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
