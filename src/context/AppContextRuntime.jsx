import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import {
  Sun, Cloud, CloudRain, Wind, Thermometer,
} from 'lucide-react';
import { createPosterDataUrl } from '../data/defaultData';
import { readFileAsDataUrl, readImageFileAsDataUrl } from '../utils/images';
import { sanitizeEmail, sanitizeMultilineText, sanitizePhone, sanitizeText, sanitizeUrl } from '../utils/sanitize';
import { loadImageFromDB, saveImageToDB } from '../utils/imageStore';
import { checkStorageQuota } from '../utils/storageQuota';
import {
  getFirebaseAuthErrorMessage,
  isFirebaseAuthEnabled,
  loginWithFirebaseEmail,
  logoutFirebaseUser,
  provisionFirebaseEmailUser,
  registerWithFirebaseEmail,
  subscribeToFirebaseAuthChanges,
} from '../services/firebase/auth';
import {
  isCloudSyncEnabled,
  isCloudWriteEnabled,
  saveCloudAppState,
  subscribeToCloudAppState,
  uploadCloudDataUrlAsset,
} from '../services/firebase/cloudState';

// --- DATA MOCKUP ---
const ACCESS_ROLES = {
  ADMIN: 'ADMIN',
  PIC: 'PIC',
  PETUGAS: 'PETUGAS'
};

const ACCESS_ROLE_VALUES = Object.values(ACCESS_ROLES);
const AUTH_SESSION_KEY = 'smartpatrol.auth.local.v1';
const APP_TIME_ZONE = 'Asia/Jakarta';
const APP_TIME_ZONE_UTC_OFFSET_HOURS = 7;
const SHIFT_NOTIFICATION_DEBUG_KEY = 'smartpatrol.debug.shiftNotifications';
const CLOUD_SYNC_DEBUG_KEY = 'smartpatrol.debug.cloudSync';
const ADMIN_RESET_EMAIL = 'admin@smartpatrol.local';

function getDefaultPageForRole(role) {
  return role === ACCESS_ROLES.ADMIN ? 'daily-report' : 'home';
}
const ADMIN_RESET_SALT = '8f2c4a6d1b3e5f709182a4c6e8f0b2d4';
const ADMIN_RESET_HASH = 'ffc2b0d9608c264ea137818121d7a93ddae483f971489a461ddf71393a7c8f6c';
const MINUTE_IN_MS = 60 * 1000;
const SHIFT_SEQUENCE = [
  {
    id: 'shift-pagi',
    label: 'Shift Pagi',
    startHour: 6,
    startMinute: 0,
    endHour: 10,
    endMinute: 0,
    timeRange: '06:00 - <10:00',
  },
  {
    id: 'shift-siang',
    label: 'Shift Siang',
    startHour: 10,
    startMinute: 0,
    endHour: 14,
    endMinute: 0,
    timeRange: '10:00 - <14:00',
  },
  {
    id: 'shift-sore',
    label: 'Shift Sore',
    startHour: 14,
    startMinute: 0,
    endHour: 18,
    endMinute: 0,
    timeRange: '14:00 - <18:00',
  },
  {
    id: 'shift-malam',
    label: 'Shift Malam',
    startHour: 18,
    startMinute: 0,
    endHour: 6,
    endMinute: 0,
    crossesMidnight: true,
    timeRange: '18:00 - <06:00 hari berikutnya',
  },
];
const LEGACY_SHIFT_SEQUENCE = [
  {
    id: 'shift-4',
    label: 'Shift 4',
    startHour: 0,
    startMinute: 0,
    endHour: 6,
    endMinute: 0,
    legacy: true,
    timeRange: '00:00 - <06:00',
  },
  {
    id: 'shift-1',
    label: 'Shift 1',
    startHour: 6,
    startMinute: 0,
    endHour: 12,
    endMinute: 0,
    legacy: true,
    timeRange: '06:00 - <12:00',
  },
  {
    id: 'shift-2',
    label: 'Shift 2',
    startHour: 12,
    startMinute: 0,
    endHour: 18,
    endMinute: 0,
    legacy: true,
    timeRange: '12:00 - <18:00',
  },
  {
    id: 'shift-3',
    label: 'Shift 3',
    startHour: 18,
    startMinute: 0,
    endHour: 0,
    endMinute: 0,
    crossesMidnight: true,
    legacy: true,
    timeRange: '18:00 - <00:00',
  },
];
const SHIFT_DEFINITION_MAP = [...SHIFT_SEQUENCE, ...LEGACY_SHIFT_SEQUENCE].reduce((accumulator, shift) => ({
  ...accumulator,
  [shift.id]: shift,
}), {});

const defaultLocationOptions = [
  'Cuaca', 'Haluan', 'Buritan', 'Deck', 'Sekoci', 'Anjungan', 'Radio Room',
  'Alat Navigasi', 'Solar Panel', 'Ruang Mesin', 'Ruang Pompa', 'Air Bersih',
  'Gudang Logistik', 'Gudang Spare Part', 'Alat Dapur', 'Fasilitas Pendukung'
];
const SHIP_STATUS_OPTIONS = ['Non Operasional', 'Operasional', 'Situasional'];

function createDefaultShipCheckpoints() {
  return defaultLocationOptions.map((name) => ({
    name,
    desc: '',
    isDefault: true,
  }));
}

function normalizeShipCheckpointDefinitions(checkpoints = []) {
  const normalizedCheckpoints = Array.isArray(checkpoints) ? checkpoints : [];
  const byName = new Map();

  normalizedCheckpoints.forEach((checkpoint) => {
    const safeName = sanitizeText(checkpoint?.name || '', 80);
    const key = createCheckpointNameKey(safeName);
    if (!key || byName.has(key)) return;
    byName.set(key, {
      name: safeName,
      desc: sanitizeMultilineText(checkpoint?.desc || '', 140),
      isDefault: Boolean(checkpoint?.isDefault),
    });
  });

  return Array.from(byName.values());
}

function initializeShipCheckpointDefinitions(checkpoints = []) {
  return normalizeShipCheckpointDefinitions([
    ...createDefaultShipCheckpoints(),
    ...(Array.isArray(checkpoints) ? checkpoints : []),
  ]);
}

function normalizeShipStatus(status) {
  const safeStatus = sanitizeText(status || '', 40);
  if (safeStatus === 'UPP') return 'Non Operasional';
  if (safeStatus === 'NON UPP') return 'Operasional';
  if (SHIP_STATUS_OPTIONS.includes(safeStatus)) return safeStatus;
  return 'Non Operasional';
}

function splitLegacyShipRoute(route) {
  const safeRoute = sanitizeText(route || '', 100);
  if (!safeRoute) {
    return { route: '', routeLoading: '', routeDischarge: '' };
  }

  const segments = safeRoute.split(/\s*-\s*/).map(part => sanitizeText(part, 100)).filter(Boolean);
  if (segments.length >= 2) {
    return {
      route: safeRoute,
      routeLoading: segments[0],
      routeDischarge: segments.slice(1).join(' - '),
    };
  }

  return {
    route: safeRoute,
    routeLoading: safeRoute,
    routeDischarge: '',
  };
}

function composeShipRoute(status, routeLoading, routeDischarge, fallbackRoute = '') {
  const normalizedStatus = normalizeShipStatus(status);
  const safeLoading = sanitizeText(routeLoading || '', 100);
  const safeDischarge = sanitizeText(routeDischarge || '', 100);
  const safeFallback = sanitizeText(fallbackRoute || '', 100);

  if (normalizedStatus === 'Non Operasional') {
    return safeLoading || safeFallback;
  }

  if (safeLoading && safeDischarge) return `${safeLoading} - ${safeDischarge}`;
  return safeLoading || safeDischarge || safeFallback;
}

function normalizeShipRouteFields(ship = {}) {
  const legacyRoute = splitLegacyShipRoute(ship?.route);
  const routeLoading = sanitizeText(ship?.routeLoading || legacyRoute.routeLoading || '', 100);
  const routeDischarge = sanitizeText(ship?.routeDischarge || legacyRoute.routeDischarge || '', 100);

  return {
    routeLoading,
    routeDischarge,
    route: composeShipRoute(ship?.status, routeLoading, routeDischarge, legacyRoute.route),
  };
}

function normalizeShipRecord(ship = {}) {
  const normalizedStatus = normalizeShipStatus(ship?.status);
  const routeFields = normalizeShipRouteFields({ ...ship, status: normalizedStatus });
  const sosRecipientShipIds = Array.from(new Set(
    (Array.isArray(ship?.sosRecipientShipIds) ? ship.sosRecipientShipIds : [])
      .map((shipId) => sanitizeText(shipId || '', 80))
      .filter(Boolean),
  ));

  return {
    ...ship,
    status: normalizedStatus,
    ...routeFields,
    imoNumber: sanitizeText(ship?.imoNumber || '', 20),
    documents: Array.isArray(ship?.documents)
      ? ship.documents.map(document => ({
        ...document,
        docDate: sanitizeText(document?.docDate || '', 20),
      }))
      : [],
    sosRecipientShipIds,
    defaultCheckpointsInitialized: true,
    customCheckpoints: ship?.defaultCheckpointsInitialized
      ? normalizeShipCheckpointDefinitions(ship?.customCheckpoints)
      : initializeShipCheckpointDefinitions(ship?.customCheckpoints),
  };
}

function normalizeShipsCollection(ships = []) {
  return (Array.isArray(ships) ? ships : []).map(ship => normalizeShipRecord(ship));
}

const defaultAuthForm = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  type: 'BUJP',
  workerNumber: '',
  phone: '',
  dob: '',
  address: '',
  officeAddress: '',
  emergencyName: '',
  emergencyContact: '',
  emergencyRelation: 'Orang Tua',
  photoUrl: null,
};
const defaultUserForm = { name: '', role: ACCESS_ROLES.PETUGAS, type: 'BUJP', workerNumber: '', dob: '', email: '', password: '', phone: '', address: '', emergencyName: '', emergencyContact: '', emergencyRelation: 'Orang Tua', officeAddress: '', photoUrl: null };
const defaultShipForm = { name: '', type: 'Oil Tanker', imoNumber: '', route: '', routeLoading: '', routeDischarge: '', cargoType: '', cargoAmount: '', status: 'Non Operasional', customCheckpoints: createDefaultShipCheckpoints(), photoUrl: null, sosRecipientShipIds: [] };
const defaultShipDocumentForm = { title: '', docDate: '', desc: '', fileUrl: null, fileName: '', mimeType: '' };
const defaultIncidentForm = { locType: 'default', location: '', customLocation: '', penyebab: '', deskripsi: '', tindakLanjut: '', photoUrl: null };

const createAuthFormState = (overrides = {}) => ({ ...defaultAuthForm, ...overrides });
const createUserFormState = () => ({ ...defaultUserForm });
const createShipFormState = () => ({
  ...defaultShipForm,
  customCheckpoints: createDefaultShipCheckpoints(),
});
const createShipDocumentState = () => ({ ...defaultShipDocumentForm });
const createIncidentFormState = () => ({ ...defaultIncidentForm });

function createUserAvatar(name, index = 0) {
  const initials = sanitizeText(name, 40).split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'SP';
  return createPosterDataUrl(initials, name, index, true);
}

const initialCheckpoints = defaultLocationOptions.map((name, index) => ({ id: index + 1, name, status: 'pending' }));
initialCheckpoints[0] = { ...initialCheckpoints[0], status: 'completed', completedBy: 'Cipto Mangunkusumo', time: '12:15', photoUrl: createPosterDataUrl('CUACA', 'Kondisi aman', 0, false), resultType: 'aman' };
initialCheckpoints[1] = { ...initialCheckpoints[1], status: 'completed', completedBy: 'Sertu Agus', time: '12:20', photoUrl: createPosterDataUrl('HALUAN', 'Temuan jangkar', 4, false), resultType: 'temuan', penyebab: 'Gesekan berlebih karena cuaca buruk', kejadian: 'Karat parah pada rantai jangkar kiri.', tindakLanjut: 'Lapor Chief Officer.' };

// Lazy-initialized to defer canvas rendering (createPosterDataUrl) until first access
let _mockUsersList = null;
function getMockUsersList() {
  if (_mockUsersList) return _mockUsersList;
  _mockUsersList = [
    { id: 'u1', name: 'Budi Santoso', role: ACCESS_ROLES.ADMIN, type: 'BUJP', status: 'active', shipAssigned: 'MT MENGGALA', email: ADMIN_RESET_EMAIL, hasCredential: true, passwordSalt: ADMIN_RESET_SALT, passwordHash: ADMIN_RESET_HASH, photoUrl: createPosterDataUrl('BS', 'Budi Santoso', 0, true) },
    { id: 'u2', name: 'Sertu Agus', role: ACCESS_ROLES.PIC, type: 'TNI', status: 'active', shipAssigned: 'MT MENGGALA', email: 'pic@smartpatrol.local', hasCredential: true, passwordSalt: '7ab31d8f22ce9014', passwordHash: 'ded78e74253898700b4c5c06479e492b8a918b427441094d84f837d9cde3aa1b', photoUrl: createPosterDataUrl('SA', 'Sertu Agus', 1, true) },
    { id: 'u3', name: 'Cipto Mangunkusumo', role: ACCESS_ROLES.PETUGAS, type: 'BUJP', status: 'active', shipAssigned: 'MT MENGGALA', email: 'petugas@smartpatrol.local', hasCredential: true, passwordSalt: '91c4ef0a5d7b2c38', passwordHash: 'f6df216170e0fa8cbfdffaa046b3d785e6e289627af9f8753addec4a11860a8b', photoUrl: createPosterDataUrl('CM', 'Cipto', 2, true) },
    { id: 'u4', name: 'Deni Setiawan', role: ACCESS_ROLES.PETUGAS, type: 'BUJP', status: 'off-duty', shipAssigned: null, email: 'deni@smartpatrol.local', hasCredential: true, passwordSalt: 'bc72ea19453f8d26', passwordHash: '79907b35981fa38d4b7cecb3554985d3ed0e668f0ecddee204e30b614247d9c2', photoUrl: createPosterDataUrl('DS', 'Deni', 3, true) },
    { id: 'u5', name: 'Kapten Eko', role: ACCESS_ROLES.PIC, type: 'INTERNAL', status: 'off-duty', shipAssigned: null, email: 'eko@smartpatrol.local', hasCredential: true, passwordSalt: 'f1ae0c4d739b2158', passwordHash: 'a4e99ec51c05d02c3f8e30b9ed98b67bef8f6abc10d4d6a9cd1ecaa4e29c0bb1', photoUrl: createPosterDataUrl('KE', 'Kapten Eko', 4, true) },
  ];
  return _mockUsersList;
}

const seedUsersById = {};
const seedUsersByEmail = {};
function buildSeedLookups() {
  if (Object.keys(seedUsersById).length > 0) return;
  getMockUsersList().forEach(u => { seedUsersById[u.id] = u; if (u.email) seedUsersByEmail[u.email.toLowerCase()] = u; });
}

let _initialShipsData = null;
function getInitialShipsData() {
  if (_initialShipsData) return _initialShipsData;
  _initialShipsData = [
    { id: 's1', name: 'MT MENGGALA', type: 'Oil Tanker', imoNumber: '9387421', lat: '-6.1021', lng: '106.8833', status: 'UPP', route: 'Jakarta - Singapore', cargoType: 'Crude Oil', cargoAmount: '50,000 MT', photoUrl: createPosterDataUrl('MT MENGGALA', 'Operasi patroli aktif', 0, false), personnel: ['u1', 'u2', 'u3'], personnelNextMonth: ['u1', 'u4', 'u5'], customCheckpoints: [{name: 'Cuaca', desc: 'Cek visibilitas dan gelombang.'}, {name: 'Ruang Mesin', desc: 'Pastikan suhu generator normal.'}], documents: [{title: 'Sertifikat Keselamatan', docDate: '2026-01-12', desc: 'Berlaku hingga 2027'}, {title: 'Izin Berlayar', docDate: '2026-02-03', desc: 'Dikeluarkan Syahbandar'}], sosRecipientShipIds: [] },
    { id: 's2', name: 'MT SRIWIJAYA', type: 'Chemical Tanker', imoNumber: '9471208', lat: '-5.9123', lng: '105.8122', status: 'NON UPP', route: 'Merak - Bakauheni', cargoType: 'Methanol', cargoAmount: '12,000 MT', photoUrl: createPosterDataUrl('MT SRIWIJAYA', 'Armada Cadangan', 1, false), personnel: [], personnelNextMonth: [], customCheckpoints: [{name: 'Pompa Kimia', desc: 'Pastikan tidak ada kebocoran'}], documents: [], sosRecipientShipIds: [] },
  ];
  return _initialShipsData;
}

const APP_STORAGE_KEY = 'smartpatrol.legacy.local.v1';
const WEATHER_STORAGE_KEY = 'smartpatrol.legacy.weather.v1';
const WEATHER_TTL_MS = 30 * 60 * 1000;

// --- MODULE-LEVEL CACHED FORMATTERS (avoids recreating Intl instances on every call) ---
const _jakartaDatePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

// --- SHALLOW EQUALITY HELPERS (replaces JSON.stringify comparisons) ---
function shallowEqualObjects(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(key => a[key] === b[key]);
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

// --- UTILITY FUNCTIONS ---
function getJakartaDateParts(date = new Date()) {
  // Reuses module-level cached formatter — avoids recreating Intl instance on every call
  const parts = _jakartaDatePartsFormatter.formatToParts(date).reduce((accumulator, part) => {
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

function formatAppDate(value = new Date()) {
  const safeDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(safeDate.getTime())) return '';
  return safeDate.toLocaleDateString('id-ID', { timeZone: APP_TIME_ZONE });
}

function formatAppTime(value = new Date()) {
  const safeDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(safeDate.getTime())) return '';
  return safeDate.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  });
}

function createJakartaDate(dateKey, hour = 0, minute = 0) {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(
    year,
    Math.max(month - 1, 0),
    day,
    hour - APP_TIME_ZONE_UTC_OFFSET_HOURS,
    minute,
    0,
  ));
}

function getShiftStartMinutes(shift) {
  return ((shift?.startHour || 0) * 60) + (shift?.startMinute || 0);
}

function getShiftEndMinutes(shift) {
  return ((shift?.endHour || 0) * 60) + (shift?.endMinute || 0);
}

function isOvernightShift(shift) {
  if (!shift) return false;
  if (shift.crossesMidnight) return true;
  return getShiftEndMinutes(shift) <= getShiftStartMinutes(shift);
}

function getShiftDefinition(shiftId) {
  return SHIFT_DEFINITION_MAP[shiftId] || SHIFT_SEQUENCE[0];
}

function getCurrentShiftDefinitionByParts(parts) {
  const currentMinutes = (parts.hour * 60) + parts.minute;

  return SHIFT_SEQUENCE.find((shift) => {
    const startMinutes = getShiftStartMinutes(shift);
    const endMinutes = getShiftEndMinutes(shift);

    if (isOvernightShift(shift)) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }) || SHIFT_SEQUENCE[0];
}

function isLegacyShiftDefinition(shift) {
  return Boolean(shift?.legacy);
}

function getShiftScheduleTimes(meta) {
  const safeMeta = meta || getShiftMeta();
  const definition = getShiftDefinition(safeMeta.id);
  const startAt = createJakartaDate(
    safeMeta.dateKey,
    definition.startHour || 0,
    definition.startMinute || 0,
  );
  const endDateKey = isOvernightShift(definition)
    ? addDaysToDateKey(safeMeta.dateKey, 1)
    : safeMeta.dateKey;
  const endAt = createJakartaDate(
    endDateKey,
    definition.endHour || 0,
    definition.endMinute || 0,
  );

  return {
    definition,
    startAt,
    endAt,
    checkpointPendingAt: new Date(endAt.getTime() - (60 * MINUTE_IN_MS)),
    shiftEndingSoonAt: new Date(endAt.getTime() - (15 * MINUTE_IN_MS)),
  };
}

function shiftMetaFromParts(dateKey, shiftId) {
  const definition = getShiftDefinition(shiftId);
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
  const definition = getCurrentShiftDefinitionByParts(parts);
  const currentDateKey = toDateKey(parts);
  const currentMinutes = (parts.hour * 60) + parts.minute;
  const dateKey = isOvernightShift(definition) && currentMinutes < getShiftEndMinutes(definition)
    ? addDaysToDateKey(currentDateKey, -1)
    : currentDateKey;
  return shiftMetaFromParts(dateKey, definition.id);
}

function getShiftMetaFromKey(key) {
  const [dateKey, shiftId] = String(key || '').split('|');
  if (!dateKey || !shiftId) return null;
  return shiftMetaFromParts(dateKey, shiftId);
}

function normalizeShiftKeyForCloudSync(shiftKey, fallbackMeta = getShiftMeta()) {
  const persistedShiftMeta = getShiftMetaFromKey(shiftKey);
  if (!persistedShiftMeta) return fallbackMeta.key;

  const persistedShiftDefinition = getShiftDefinition(persistedShiftMeta.id);
  if (isLegacyShiftDefinition(persistedShiftDefinition)) return fallbackMeta.key;

  const persistedShiftStartAt = getShiftScheduleTimes(persistedShiftMeta).startAt.getTime();
  const fallbackShiftStartAt = getShiftScheduleTimes(fallbackMeta).startAt.getTime();

  if (persistedShiftStartAt > fallbackShiftStartAt) return fallbackMeta.key;
  return persistedShiftMeta.key;
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

function createCheckpointNameKey(name) {
  return sanitizeText(name || '', 120).trim().toLowerCase();
}

function createShipCheckpointId(ship, checkpointName, index) {
  const slug = sanitizeText(checkpointName || '', 120)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `checkpoint-${index + 1}`;

  return `${ship?.id || ship?.name || 'ship'}::${slug}::${index + 1}`;
}

function createBaseCheckpointRecord(ship, checkpoint, index) {
  return {
    id: createShipCheckpointId(ship, checkpoint?.name, index),
    name: sanitizeText(checkpoint?.name || '', 80) || `Checkpoint ${index + 1}`,
    desc: sanitizeMultilineText(checkpoint?.desc || '', 140),
    status: 'pending',
    updatedAt: null,
    shipId: ship?.id || null,
    shipName: ship?.name || '',
  };
}

function createShipCheckpointCollection(ship) {
  if (!ship) return [];
  return (ship.customCheckpoints || []).map((checkpoint, index) => createBaseCheckpointRecord(ship, checkpoint, index));
}

function resetCheckpointForShift(checkpoint, options = {}) {
  const { updatedAt = new Date().toISOString(), shiftKey = null } = options;
  return {
    id: checkpoint.id,
    name: checkpoint.name,
    desc: checkpoint.desc || '',
    status: 'pending',
    updatedAt,
    shiftKey,
    shipId: checkpoint.shipId || null,
    shipName: checkpoint.shipName || '',
  };
}

function createCheckpointGalleryPhotoRecord(photoUrl, options = {}) {
  const createdAt = options.createdAt || new Date().toISOString();
  return {
    id: options.id || `checkpoint-gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    photoUrl,
    author: sanitizeText(options.author || '', 80) || '-',
    date: options.date || formatAppDate(new Date(createdAt)),
    time: options.time || formatAppTime(new Date(createdAt)),
    createdAt,
  };
}

function resetCheckpointCollection(checkpoints, options = {}) {
  return checkpoints
    .filter(checkpoint => !checkpoint.isTemporaryShiftNode)
    .map(checkpoint => resetCheckpointForShift(checkpoint, options));
}

function shouldResetCheckpointForActiveShift(checkpoint, activeShiftKey) {
  if (!checkpoint || checkpoint.status === 'pending' || checkpoint.isTemporaryShiftNode) return false;
  if (!activeShiftKey) return false;

  if (checkpoint.shiftKey && checkpoint.shiftKey !== activeShiftKey) {
    return true;
  }

  const activeShiftMeta = getShiftMetaFromKey(activeShiftKey);
  if (!activeShiftMeta) return false;

  const checkpointTimestamp = new Date(
    checkpoint?.updatedAt
    || checkpoint?.completedAt
    || checkpoint?.createdAt
    || '',
  ).getTime();

  if (Number.isNaN(checkpointTimestamp) || checkpointTimestamp <= 0) return false;

  const activeShiftStartTimestamp = getShiftScheduleTimes(activeShiftMeta).startAt.getTime();
  return checkpointTimestamp < activeShiftStartTimestamp;
}

function normalizeShipScopedCheckpoints(ship, checkpoints = [], activeShiftKey = null) {
  const baseCheckpoints = createShipCheckpointCollection(ship);
  const checkpointsById = new Map((checkpoints || []).map(checkpoint => [String(checkpoint.id), checkpoint]));
  const checkpointsByName = new Map((checkpoints || []).map(checkpoint => [createCheckpointNameKey(checkpoint.name), checkpoint]));

  return baseCheckpoints.map((baseCheckpoint) => {
    const matchedCheckpoint = checkpointsById.get(String(baseCheckpoint.id))
      || checkpointsByName.get(createCheckpointNameKey(baseCheckpoint.name));

    if (!matchedCheckpoint) return baseCheckpoint;

    const normalizedCheckpoint = shouldResetCheckpointForActiveShift(matchedCheckpoint, activeShiftKey)
      ? resetCheckpointForShift(matchedCheckpoint, { shiftKey: activeShiftKey })
      : matchedCheckpoint;

    return {
      ...baseCheckpoint,
      ...normalizedCheckpoint,
      id: baseCheckpoint.id,
      name: baseCheckpoint.name,
      desc: baseCheckpoint.desc,
      shipId: ship?.id || normalizedCheckpoint.shipId || null,
      shipName: ship?.name || normalizedCheckpoint.shipName || '',
    };
  });
}

function createCheckpointsByShipState(ships = [], savedCheckpointsByShip = {}, legacyCheckpoints = null, activeShiftKey = null) {
  const savedState = savedCheckpointsByShip && typeof savedCheckpointsByShip === 'object'
    ? savedCheckpointsByShip
    : {};
  const fallbackShip = ships[0] || null;

  return ships.reduce((collection, ship) => {
    const savedForShip = Array.isArray(savedState[ship.id])
      ? savedState[ship.id]
      : Array.isArray(savedState[ship.name])
        ? savedState[ship.name]
        : fallbackShip?.id === ship.id && Array.isArray(legacyCheckpoints)
          ? legacyCheckpoints
          : [];

    collection[ship.id] = normalizeShipScopedCheckpoints(ship, savedForShip, activeShiftKey);
    return collection;
  }, {});
}

function createHistoryEntryKey(ship, shiftMeta) {
  const shipToken = sanitizeText(ship?.id || ship?.name || 'ship', 120)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'ship';

  return `${shipToken}|${shiftMeta.key}`;
}

function createPatrolIncidentId(checkpoint) {
  const existingIncidentId = sanitizeText(checkpoint?.incidentId || '', 200).trim();
  if (existingIncidentId) return existingIncidentId;

  const checkpointToken = sanitizeText(checkpoint?.id || 'checkpoint', 120)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'checkpoint';

  const completedToken = sanitizeText(checkpoint?.completedAt || '', 120)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return completedToken ? `p-${checkpointToken}-${completedToken}` : `p-${checkpoint.id}`;
}

function getIncidentDateLabel(value) {
  if (!value) return formatAppDate();
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return String(value);
  return formatAppDate(parsedDate);
}

function getIncidentSortTimestamp(incident) {
  const directTimestamp = new Date(
    incident?.completedAt
    || incident?.createdAt
    || incident?.reportedAt
    || '',
  ).getTime();

  if (!Number.isNaN(directTimestamp) && directTimestamp > 0) {
    return directTimestamp;
  }

  if (typeof incident?.id === 'number') {
    return incident.id;
  }

  return 0;
}

function createPatrolIncidentRecord(checkpoint, options = {}) {
  const {
    fallbackShipName = '',
    fallbackDate = '',
    readOnly = false,
  } = options;

  return {
    id: createPatrolIncidentId(checkpoint),
    date: checkpoint?.date || getIncidentDateLabel(checkpoint?.completedAt || fallbackDate),
    time: checkpoint?.time || '-',
    location: checkpoint?.name || '-',
    shipName: checkpoint?.shipName || fallbackShipName || '',
    deskripsi: checkpoint?.kejadian || '',
    penyebab: checkpoint?.penyebab || '',
    tindakLanjut: checkpoint?.tindakLanjut || '',
    reportedBy: checkpoint?.completedBy || '-',
    photoUrl: checkpoint?.photoUrl || null,
    isPatrol: true,
    readOnly: readOnly || Boolean(checkpoint?.readOnly),
    completedAt: checkpoint?.completedAt || null,
    checkpointId: checkpoint?.id || null,
  };
}

function formatSOSCoordinate(value) {
  const numeric = typeof value === 'number'
    ? value
    : Number(String(value ?? '').replace(',', '.'));

  if (!Number.isFinite(numeric)) return '-';
  return numeric.toFixed(6);
}

function createSOSIncidentRecord(sos) {
  if (!sos) return null;

  const shipName = sanitizeText(sos.shipName || '', 80) || 'Tidak diketahui';
  const senderName = sanitizeText(sos.senderName || '', 80) || 'Petugas';
  const triggeredAt = sos.triggeredAt || sos.createdAt || null;
  const resolvedAt = sos.resolvedAt || null;
  const confirmedCount = Array.isArray(sos.confirmedBy) ? sos.confirmedBy.length : 0;
  const targetShipNames = Array.from(new Set([
    shipName,
    ...((Array.isArray(sos.targetShipNames) ? sos.targetShipNames : [])
      .map((name) => sanitizeText(name || '', 80))
      .filter(Boolean)),
  ]));
  const formattedLat = formatSOSCoordinate(sos.lat);
  const formattedLng = formatSOSCoordinate(sos.lng);
  const isResolved = sanitizeText(sos.status || '', 20).toLowerCase() === 'resolved';
  const resolutionLabel = isResolved
    ? `SOS telah ditangani oleh ${sanitizeText(sos.resolvedBy || '', 80) || 'Sistem'}${resolvedAt ? ` pada ${getIncidentDateLabel(resolvedAt)} ${formatAppTime(new Date(resolvedAt))}` : ''}.`
    : `Menunggu tindak lanjut darurat${confirmedCount > 0 ? ` dan sudah dikonfirmasi ${confirmedCount} petugas` : ''}.`;

  return {
    id: sos.id,
    date: getIncidentDateLabel(triggeredAt),
    time: triggeredAt ? formatAppTime(new Date(triggeredAt)) : '-',
    location: 'SOS Darurat',
    shipName,
    deskripsi: `Sinyal SOS dikirim oleh ${senderName} dari kapal ${shipName}.${formattedLat !== '-' && formattedLng !== '-' ? ` Koordinat terakhir ${formattedLat}, ${formattedLng}.` : ' Koordinat terakhir belum tersedia.'}`,
    penyebab: 'Tombol SOS diaktifkan untuk meminta bantuan darurat di lapangan.',
    tindakLanjut: resolutionLabel,
    reportedBy: senderName,
    photoUrl: null,
    isSOS: true,
    readOnly: true,
    createdAt: triggeredAt,
    sosStatus: isResolved ? 'resolved' : 'active',
    targetShipNames,
    lat: sos.lat ?? null,
    lng: sos.lng ?? null,
  };
}

function createMissedCheckpoint(checkpoint, shiftMeta) {
  const { endAt } = getShiftScheduleTimes(shiftMeta);
  return {
    id: checkpoint.id,
    name: checkpoint.name,
    status: 'missed',
    resultType: 'missed',
    completedBy: '-',
    time: formatAppTime(endAt) || '-',
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

function createGuardNameKey(name) {
  return sanitizeText(name || '', 80).trim().toLowerCase();
}

function buildGuardScoreMaps(checkpoints = []) {
  return checkpoints.reduce((accumulator, checkpoint) => {
    if (checkpoint.status !== 'completed') return accumulator;

    if (checkpoint.completedByUserId) {
      accumulator.byId.set(
        checkpoint.completedByUserId,
        (accumulator.byId.get(checkpoint.completedByUserId) || 0) + 1,
      );
    }

    const guardNameKey = createGuardNameKey(checkpoint.completedBy);
    if (guardNameKey) {
      accumulator.byName.set(
        guardNameKey,
        (accumulator.byName.get(guardNameKey) || 0) + 1,
      );
    }

    return accumulator;
  }, { byId: new Map(), byName: new Map() });
}

function buildGuardShiftSnapshot(users, shipName, checkpoints = []) {
  const scoreMaps = buildGuardScoreMaps(checkpoints);
  return users
    .filter(user => user.shipAssigned === shipName && user.status === 'active' && user.role === ACCESS_ROLES.PETUGAS)
    .map(user => ({
      id: user.id,
      name: user.name,
      role: user.role,
      photoUrl: user.photoUrl || null,
      score: scoreMaps.byId.get(user.id) || scoreMaps.byName.get(createGuardNameKey(user.name)) || 0,
    }));
}

function buildHistoryEntry({ shiftMeta, checkpoints, ship, users, weatherInfo }) {
  const historyKey = createHistoryEntryKey(ship, shiftMeta);
  const historyId = `history-${historyKey}`;
  const { endAt } = getShiftScheduleTimes(shiftMeta);
  const snapshotCheckpoints = checkpoints.map(checkpoint => (
    checkpoint.status === 'completed'
      ? { ...checkpoint, readOnly: true, historyId, date: shiftMeta.dateLabel }
      : { ...createMissedCheckpoint(checkpoint, shiftMeta), readOnly: true, historyId, date: shiftMeta.dateLabel, shipName: ship?.name || checkpoint.shipName || '' }
  ));
  const summary = summarizePatrolCheckpoints(snapshotCheckpoints);
  const shipName = ship?.name || 'Belum Ada Kapal';

  return {
    id: historyId,
    key: historyKey,
    date: shiftMeta.dateLabel,
    dateKey: shiftMeta.dateKey,
    shift: shiftMeta.label,
    shiftId: shiftMeta.id,
    time: shiftMeta.timeRange,
    ship: shipName,
    shipSnapshot: ship ? { id: ship.id, name: ship.name, lat: ship.lat, lng: ship.lng } : null,
    crewSnapshot: buildGuardShiftSnapshot(users, shipName, snapshotCheckpoints),
    weatherSnapshot: weatherInfo ? { ...weatherInfo } : null,
    checkpoints: snapshotCheckpoints,
    summary,
    points: summary.total,
    issue: summary.temuan,
    missed: summary.missed,
    createdAt: endAt.toISOString(),
  };
}

function normalizeSnapshotCoordinate(value, digits = 6) {
  const numeric = typeof value === 'number'
    ? value
    : Number(String(value ?? '').replace(',', '.'));

  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(digits));
}

function createShipLocationSnapshot(ship) {
  if (!ship) return null;

  const lat = normalizeSnapshotCoordinate(ship.lat);
  const lng = normalizeSnapshotCoordinate(ship.lng);

  return {
    id: ship.id || null,
    name: ship.name || '',
    lat,
    lng,
  };
}

function requestCurrentGeolocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: normalizeSnapshotCoordinate(position.coords.latitude),
          lng: normalizeSnapshotCoordinate(position.coords.longitude),
          accuracy: Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy)
            : null,
        });
      },
      (error) => {
        console.warn('GPS patroli tidak tersedia saat sync laporan', error);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      },
    );
  });
}

async function fetchWeatherSnapshotForCoordinates(gpsSnapshot) {
  if (gpsSnapshot?.lat == null || gpsSnapshot?.lng == null) return null;

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${gpsSnapshot.lat}&longitude=${gpsSnapshot.lng}&current_weather=true`);
    if (!response.ok) return null;

    const payload = await response.json();
    if (!payload?.current_weather) return null;

    return {
      ...payload.current_weather,
      capturedAt: gpsSnapshot.capturedAt,
      source: gpsSnapshot.source,
      lat: gpsSnapshot.lat,
      lng: gpsSnapshot.lng,
    };
  } catch (error) {
    console.error('Gagal mengambil snapshot cuaca patroli', error);
    return null;
  }
}

async function capturePatrolEnvironmentSnapshot(ship) {
  const capturedAt = new Date().toISOString();
  const shipSnapshot = createShipLocationSnapshot(ship);
  const deviceLocation = await requestCurrentGeolocation();

  const gpsSnapshot = deviceLocation
    ? {
        ...deviceLocation,
        source: 'device',
        capturedAt,
      }
    : (shipSnapshot?.lat != null && shipSnapshot?.lng != null)
      ? {
          lat: shipSnapshot.lat,
          lng: shipSnapshot.lng,
          accuracy: null,
          source: 'ship',
          capturedAt,
        }
      : null;

  const weatherSnapshot = await fetchWeatherSnapshotForCoordinates(gpsSnapshot);

  return {
    shipSnapshot,
    gpsSnapshot,
    weatherSnapshot,
  };
}

function sortHistoryEntries(entries) {
  return [...entries].sort((left, right) => {
    const leftTimestamp = new Date(left.createdAt || '').getTime();
    const rightTimestamp = new Date(right.createdAt || '').getTime();

    if (!Number.isNaN(leftTimestamp) && !Number.isNaN(rightTimestamp) && leftTimestamp !== rightTimestamp) {
      return rightTimestamp - leftTimestamp;
    }

    if (left.dateKey !== right.dateKey) return right.dateKey.localeCompare(left.dateKey);
    return String(right.shift || '').localeCompare(String(left.shift || ''));
  });
}

function mergeHistoryEntries(previousEntries, nextEntries) {
  const merged = new Map(previousEntries.map(entry => [entry.key || entry.id, entry]));
  nextEntries.forEach(entry => {
    merged.set(entry.key || entry.id, entry);
  });
  return sortHistoryEntries(Array.from(merged.values()));
}

function getCheckpointMergeKey(checkpoint) {
  return String(checkpoint?.id || createCheckpointNameKey(checkpoint?.name) || '');
}

function getCheckpointPriority(checkpoint) {
  if (checkpoint?.status === 'completed') return 3;
  if (checkpoint?.status === 'missed' || checkpoint?.resultType === 'missed') return 2;
  if (checkpoint?.status === 'pending') return 1;
  return 0;
}

function getCheckpointEffectiveTimestamp(checkpoint) {
  const directTimestamp = new Date(
    checkpoint?.updatedAt
    || checkpoint?.completedAt
    || checkpoint?.createdAt
    || '',
  ).getTime();

  if (!Number.isNaN(directTimestamp) && directTimestamp > 0) return directTimestamp;
  return getCheckpointPriority(checkpoint);
}

function mergeCheckpointRecord(baseCheckpoint, nextCheckpoint) {
  if (!baseCheckpoint) return nextCheckpoint;
  if (!nextCheckpoint) return baseCheckpoint;

  const baseTimestamp = getCheckpointEffectiveTimestamp(baseCheckpoint);
  const nextTimestamp = getCheckpointEffectiveTimestamp(nextCheckpoint);
  const shouldUseNext = (
    nextTimestamp > baseTimestamp
    || (nextTimestamp === baseTimestamp && getCheckpointPriority(nextCheckpoint) >= getCheckpointPriority(baseCheckpoint))
  );

  const preferredCheckpoint = shouldUseNext ? nextCheckpoint : baseCheckpoint;
  const fallbackCheckpoint = shouldUseNext ? baseCheckpoint : nextCheckpoint;

  return {
    ...fallbackCheckpoint,
    ...preferredCheckpoint,
    id: preferredCheckpoint.id || fallbackCheckpoint.id,
    name: preferredCheckpoint.name || fallbackCheckpoint.name,
  };
}

function mergeCheckpointsCollection(baseCheckpoints = [], nextCheckpoints = []) {
  const merged = new Map();

  [...baseCheckpoints, ...nextCheckpoints].forEach((checkpoint) => {
    const mergeKey = getCheckpointMergeKey(checkpoint);
    if (!mergeKey) return;
    const existingCheckpoint = merged.get(mergeKey);
    merged.set(mergeKey, mergeCheckpointRecord(existingCheckpoint, checkpoint));
  });

  return Array.from(merged.values());
}

function getNotificationMergeKey(notification) {
  return String(notification?.dedupeKey || notification?.id || '');
}

function getNotificationTimestamp(notification) {
  const timestamp = new Date(notification?.createdAt || '').getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function mergeNotificationRecord(baseNotification, nextNotification) {
  if (!baseNotification) return nextNotification;
  if (!nextNotification) return baseNotification;

  const shouldUseNext = getNotificationTimestamp(nextNotification) >= getNotificationTimestamp(baseNotification);
  const preferredNotification = shouldUseNext ? nextNotification : baseNotification;
  const fallbackNotification = shouldUseNext ? baseNotification : nextNotification;
  const mergedTargetUserIds = Array.from(new Set([
    ...(Array.isArray(baseNotification?.targetUserIds) ? baseNotification.targetUserIds : []),
    ...(Array.isArray(nextNotification?.targetUserIds) ? nextNotification.targetUserIds : []),
  ]));

  return {
    ...fallbackNotification,
    ...preferredNotification,
    id: preferredNotification.id || fallbackNotification.id || createNotificationId(),
    dedupeKey: preferredNotification.dedupeKey || fallbackNotification.dedupeKey || '',
    targetUserIds: mergedTargetUserIds,
    readByUserIds: Array.from(new Set([
      ...(Array.isArray(baseNotification?.readByUserIds) ? baseNotification.readByUserIds : []),
      ...(Array.isArray(nextNotification?.readByUserIds) ? nextNotification.readByUserIds : []),
    ])).filter(userId => mergedTargetUserIds.includes(userId)),
  };
}

function mergeNotificationsCollection(baseNotifications = [], nextNotifications = []) {
  const merged = new Map();

  [...baseNotifications, ...nextNotifications].forEach((notification) => {
    const mergeKey = getNotificationMergeKey(notification);
    if (!mergeKey) return;
    const existingNotification = merged.get(mergeKey);
    merged.set(mergeKey, mergeNotificationRecord(existingNotification, notification));
  });

  return sortNotifications(Array.from(merged.values()));
}

function mergeEntitiesById(baseItems = [], nextItems = [], options = {}) {
  const {
    getId = (item) => item?.id,
    merge = (baseItem, nextItem) => ({ ...baseItem, ...nextItem }),
  } = options;
  const merged = new Map();

  [...baseItems, ...nextItems].forEach((item) => {
    const itemId = getId(item);
    if (!itemId) return;
    const existingItem = merged.get(itemId);
    merged.set(itemId, existingItem ? merge(existingItem, item) : item);
  });

  return Array.from(merged.values());
}

function mergeProgressItems(baseProgress = [], nextProgress = []) {
  return mergeEntitiesById(baseProgress, nextProgress, {
    getId: (item) => item?.id || item?.createdAt || item?.comment,
    merge: (baseItem, nextItem) => {
      const baseTimestamp = new Date(baseItem?.createdAt || '').getTime();
      const nextTimestamp = new Date(nextItem?.createdAt || '').getTime();
      return nextTimestamp >= baseTimestamp
        ? { ...baseItem, ...nextItem }
        : { ...nextItem, ...baseItem };
    },
  });
}

function mergeDocumentationItems(baseDocumentation = [], nextDocumentation = []) {
  return mergeEntitiesById(baseDocumentation, nextDocumentation, {
    getId: (item) => item?.id || item?.createdAt || item?.photoUrl,
    merge: (baseItem, nextItem) => {
      const baseTimestamp = new Date(baseItem?.createdAt || '').getTime();
      const nextTimestamp = new Date(nextItem?.createdAt || '').getTime();
      return nextTimestamp >= baseTimestamp
        ? { ...baseItem, ...nextItem }
        : { ...nextItem, ...baseItem };
    },
  }).sort((left, right) => {
    const leftTimestamp = new Date(left?.createdAt || '').getTime();
    const rightTimestamp = new Date(right?.createdAt || '').getTime();
    return rightTimestamp - leftTimestamp;
  });
}

function mergeIncidentMetaCollection(baseMeta = {}, nextMeta = {}) {
  const mergedMeta = { ...(baseMeta || {}) };

  Object.entries(nextMeta || {}).forEach(([incidentId, nextValue]) => {
    const baseValue = mergedMeta[incidentId] || {};
    mergedMeta[incidentId] = {
      ...baseValue,
      ...nextValue,
      documentation: mergeDocumentationItems(baseValue.documentation || [], nextValue?.documentation || []),
      progress: mergeProgressItems(baseValue.progress || [], nextValue?.progress || []),
    };
  });

  return mergedMeta;
}

function mergeIncidentsCollection(baseIncidents = [], nextIncidents = []) {
  return mergeEntitiesById(baseIncidents, nextIncidents, {
    merge: (baseIncident, nextIncident) => (
      getIncidentSortTimestamp(nextIncident) >= getIncidentSortTimestamp(baseIncident)
        ? { ...baseIncident, ...nextIncident }
        : { ...nextIncident, ...baseIncident }
    ),
  }).sort((left, right) => getIncidentSortTimestamp(right) - getIncidentSortTimestamp(left));
}

function createDeletedRecordsState(deletedRecords = {}) {
  const sourceRecords = deletedRecords && typeof deletedRecords === 'object' ? deletedRecords : {};
  return {
    historyEntries: { ...(sourceRecords.historyEntries || {}) },
    incidents: { ...(sourceRecords.incidents || {}) },
    ships: { ...(sourceRecords.ships || {}) },
    users: { ...(sourceRecords.users || {}) },
  };
}

function markDeletedRecord(previousDeletedRecords, groupKey, recordId, deletedAt = new Date().toISOString()) {
  const nextDeletedRecords = createDeletedRecordsState(previousDeletedRecords);
  if (!recordId || !Object.prototype.hasOwnProperty.call(nextDeletedRecords, groupKey)) {
    return nextDeletedRecords;
  }

  nextDeletedRecords[groupKey][recordId] = deletedAt;
  return nextDeletedRecords;
}

function mergeDeletedRecordGroup(baseGroup = {}, nextGroup = {}) {
  const mergedGroup = { ...(baseGroup || {}) };

  Object.entries(nextGroup || {}).forEach(([recordId, deletedAt]) => {
    if (!recordId || !deletedAt) return;

    const baseTimestamp = new Date(mergedGroup[recordId] || '').getTime();
    const nextTimestamp = new Date(deletedAt || '').getTime();

    if (Number.isNaN(baseTimestamp) || nextTimestamp >= baseTimestamp) {
      mergedGroup[recordId] = deletedAt;
    }
  });

  return mergedGroup;
}

function mergeDeletedRecords(baseDeletedRecords = {}, nextDeletedRecords = {}) {
  const baseState = createDeletedRecordsState(baseDeletedRecords);
  const nextState = createDeletedRecordsState(nextDeletedRecords);

  return {
    historyEntries: mergeDeletedRecordGroup(baseState.historyEntries, nextState.historyEntries),
    incidents: mergeDeletedRecordGroup(baseState.incidents, nextState.incidents),
    ships: mergeDeletedRecordGroup(baseState.ships, nextState.ships),
    users: mergeDeletedRecordGroup(baseState.users, nextState.users),
  };
}

function omitDeletedEntities(items = [], deletedRecords = {}) {
  return items.filter((item) => !deletedRecords[item?.id]);
}

function pruneShipPersonnelAssignments(ships = [], users = []) {
  const activeUserIds = new Set(users.map(user => user.id).filter(Boolean));
  return ships.map((ship) => ({
    ...ship,
    personnel: Array.isArray(ship?.personnel)
      ? ship.personnel.filter(userId => activeUserIds.has(userId))
      : [],
    personnelNextMonth: Array.isArray(ship?.personnelNextMonth)
      ? ship.personnelNextMonth.filter(userId => activeUserIds.has(userId))
      : [],
  }));
}

function mergeSharedStateSnapshots(baseState = {}, nextState = {}) {
  const deletedRecords = mergeDeletedRecords(baseState.deletedRecords || {}, nextState.deletedRecords || {});
  const baseUsers = applyAdminCredentialReset(normalizeUsersCollection(baseState.usersData || []));
  const nextUsers = applyAdminCredentialReset(normalizeUsersCollection(nextState.usersData || []));
  const mergedUsers = omitDeletedEntities(mergeEntitiesById(baseUsers, nextUsers), deletedRecords.users);
  const baseShips = normalizeShipsCollection(baseState.shipsData || []);
  const nextShips = normalizeShipsCollection(nextState.shipsData || []);
  const mergedShips = pruneShipPersonnelAssignments(
    omitDeletedEntities(mergeEntitiesById(baseShips, nextShips), deletedRecords.ships),
    mergedUsers,
  );
  const shipIds = Array.from(new Set([
    ...Object.keys(baseState.checkpointsByShip || {}),
    ...Object.keys(nextState.checkpointsByShip || {}),
    ...mergedShips.map(ship => ship.id).filter(Boolean),
  ])).filter(shipId => !deletedRecords.ships[shipId]);

  const checkpointsByShip = shipIds.reduce((collection, shipId) => {
    const baseCheckpoints = Array.isArray(baseState.checkpointsByShip?.[shipId]) ? baseState.checkpointsByShip[shipId] : [];
    const nextCheckpoints = Array.isArray(nextState.checkpointsByShip?.[shipId]) ? nextState.checkpointsByShip[shipId] : [];
    collection[shipId] = mergeCheckpointsCollection(baseCheckpoints, nextCheckpoints);
    return collection;
  }, {});

  return createSharedStateSnapshot({
    activeShiftKey: nextState.activeShiftKey || baseState.activeShiftKey,
    checkpointsByShip,
    deletedRecords,
    historyEntries: omitDeletedEntities(
      mergeHistoryEntries(baseState.historyEntries || [], nextState.historyEntries || []),
      deletedRecords.historyEntries,
    ),
    incidentMeta: mergeIncidentMetaCollection(baseState.incidentMeta || {}, nextState.incidentMeta || {}),
    incidentsData: omitDeletedEntities(
      mergeIncidentsCollection(baseState.incidentsData || [], nextState.incidentsData || []),
      deletedRecords.incidents,
    ),
    notifications: mergeNotificationsCollection(baseState.notifications || [], nextState.notifications || []),
    shipsData: mergedShips,
    usersData: mergedUsers,
    activeSOSAlert: nextState.activeSOSAlert || baseState.activeSOSAlert || null,
    sosHistory: nextState.sosHistory || baseState.sosHistory || [],
  });
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

function isShiftNotificationDebugEnabled() {
  try {
    return window.localStorage.getItem(SHIFT_NOTIFICATION_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

function isShiftNotificationType(type) {
  return type === 'shift_started' || type === 'shift_ending_soon' || type === 'checkpoint_pending';
}

function logShiftNotificationDebug(event, payload) {
  if (!isShiftNotificationDebugEnabled()) return;
  console.info(`[SmartPatrol][shift-notif] ${event}`, payload);
}

function isCloudSyncDebugEnabled() {
  try {
    return window.localStorage.getItem(CLOUD_SYNC_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

function logCloudSyncDebug(event, payload) {
  if (!isCloudSyncDebugEnabled()) return;
  let serializedPayload = '';
  try {
    serializedPayload = payload ? ` ${JSON.stringify(payload)}` : '';
  } catch {
    serializedPayload = ' [unserializable]';
  }
  console.info(`[SmartPatrol][cloud-sync] ${event}${serializedPayload}`);
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
  const firebaseUid = sanitizeText(user?.firebaseUid || seedUser?.firebaseUid || '', 160) || '';
  const authProvider = firebaseUid
    ? 'firebase'
    : sanitizeText(user?.authProvider || seedUser?.authProvider || (hasCredential ? 'legacy' : 'none'), 20).toLowerCase();
  const fallbackStatus = role === ACCESS_ROLES.PETUGAS ? (shipAssigned ? 'active' : 'off-duty') : 'active';
  const status = sanitizeText(user?.status || seedUser?.status || fallbackStatus, 20) || fallbackStatus;
  return { ...seedUser, ...user, id: user?.id || seedUser?.id || `u${Date.now()}${index}`, name: safeName, role, type: sanitizeText(user?.type || seedUser?.type || 'BUJP', 20) || 'BUJP', workerNumber: sanitizeText(user?.workerNumber || seedUser?.workerNumber || '', 40), status: role === ACCESS_ROLES.PETUGAS && !shipAssigned ? 'off-duty' : status, shipAssigned, email: safeEmail, password: '', hasCredential, passwordSalt, passwordHash, authProvider, firebaseUid: firebaseUid || null, phone: sanitizePhone(user?.phone || seedUser?.phone || ''), address: sanitizeMultilineText(user?.address || seedUser?.address || '', 180), emergencyName: sanitizeText(user?.emergencyName || seedUser?.emergencyName || '', 80), emergencyContact: sanitizePhone(user?.emergencyContact || seedUser?.emergencyContact || ''), emergencyRelation: sanitizeText(user?.emergencyRelation || seedUser?.emergencyRelation || 'Orang Tua', 40) || 'Orang Tua', officeAddress: sanitizeMultilineText(user?.officeAddress || seedUser?.officeAddress || '', 180), photoUrl: sanitizeUrl(user?.photoUrl || seedUser?.photoUrl || '') || createUserAvatar(safeName, index) };
}

function normalizeUsersCollection(users) {
  const sourceUsers = Array.isArray(users) && users.length > 0 ? users : getMockUsersList();
  const normalized = sourceUsers.map((user, index) => normalizeUserRecord(user, index));
  const adminSeed = getMockUsersList().find(u => u.id === 'u1');
  if (adminSeed && !normalized.some(u => u.id === 'u1')) normalized.unshift(normalizeUserRecord(adminSeed, 0));
  return normalized;
}

function applyAdminCredentialReset(users = []) {
  return users.map((user) => {
    const normalizedEmail = sanitizeEmail(user?.email || '');
    const isAdminTarget = user?.id === 'u1' || normalizedEmail === ADMIN_RESET_EMAIL;
    if (!isAdminTarget) return user;

    return {
      ...user,
      email: ADMIN_RESET_EMAIL,
      hasCredential: true,
      passwordSalt: ADMIN_RESET_SALT,
      passwordHash: ADMIN_RESET_HASH,
      authProvider: 'legacy',
      firebaseUid: null,
    };
  });
}

function isFirebaseManagedUser(user) {
  return Boolean(user?.authProvider === 'firebase' || user?.firebaseUid);
}

function canUserAccessApplication(user) {
  if (!user) return false;
  if (user.role !== ACCESS_ROLES.PETUGAS) return true;
  return Boolean(user.shipAssigned && user.status === 'active');
}

function createFirebaseBackedUserRecord(authUser, users = []) {
  const safeEmail = sanitizeEmail(authUser?.email || '');
  const displayName = sanitizeText(authUser?.displayName || safeEmail.split('@')[0] || 'Petugas Baru', 80) || 'Petugas Baru';
  return normalizeUserRecord({
    id: `u${Date.now()}`,
    name: displayName,
    role: ACCESS_ROLES.PETUGAS,
    type: 'BUJP',
    status: 'off-duty',
    shipAssigned: null,
    email: safeEmail,
    phone: sanitizePhone(authUser?.phoneNumber || ''),
    emergencyRelation: 'Orang Tua',
    photoUrl: sanitizeUrl(authUser?.photoURL || '') || createUserAvatar(displayName, users.length),
    authProvider: 'firebase',
    firebaseUid: authUser?.uid || null,
    hasCredential: false,
    passwordSalt: '',
    passwordHash: '',
  }, users.length);
}

function loadPersistedState() { try { const raw = window.localStorage.getItem(APP_STORAGE_KEY); if (!raw) return null; const parsed = JSON.parse(raw); return parsed?.version === 1 ? parsed.data : null; } catch { return null; } }
function savePersistedState(data) { try { window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data })); checkStorageQuota(); } catch (error) { console.error('Gagal menyimpan data lokal', error); } }
function loadWeatherCache() { try { const raw = window.localStorage.getItem(WEATHER_STORAGE_KEY); if (!raw) return null; const parsed = JSON.parse(raw); if (!parsed?.savedAt || !parsed?.data) return null; if (Date.now() - new Date(parsed.savedAt).getTime() > WEATHER_TTL_MS) return null; return parsed.data; } catch { return null; } }
function saveWeatherCache(data) { try { window.localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data })); } catch (error) { console.error('Gagal menyimpan cache cuaca', error); } }
function sanitizeCloudAssetSegment(value, fallback = 'asset') {
  return sanitizeText(String(value || ''), 120)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/(^-|-$)/g, '') || fallback;
}

function createCloudAssetPath(...segments) {
  return ['state-assets', ...segments]
    .map((segment, index) => sanitizeCloudAssetSegment(segment, `part-${index + 1}`))
    .join('/');
}

function createSharedStateSnapshot({
  activeShiftKey,
  checkpointsByShip,
  deletedRecords,
  historyEntries,
  incidentMeta,
  incidentsData,
  notifications,
  shipsData,
  usersData,
  activeSOSAlert,
  sosHistory,
}) {
  return {
    checkpointsByShip,
    shipsData,
    usersData,
    incidentsData,
    incidentMeta,
    historyEntries,
    deletedRecords: createDeletedRecordsState(deletedRecords),
    activeShiftKey,
    notifications,
    activeSOSAlert,
    sosHistory,
  };
}

function serializeSharedStateSnapshot(snapshot) {
  try {
    return JSON.stringify(snapshot);
  } catch {
    return '';
  }
}

function isMobilePatrolViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 1023px)').matches;
}

async function pickLocalImage(options = {}) {
  const { cameraOnly = false } = options;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (cameraOnly) {
    input.capture = 'environment';
    input.setAttribute('capture', 'environment');
  }

  return new Promise((resolve) => {
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const dataUrl = await readImageFileAsDataUrl(file);
        resolve(dataUrl);
      } catch (error) {
        console.error(error);
        resolve(null);
      }
    };
    input.click();
  });
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
  const ship = getInitialShipsData()[0];
  const firstShiftCheckpoints = createShipCheckpointCollection(ship).map(checkpoint => ({ ...checkpoint }));
  const secondShiftCheckpoints = createShipCheckpointCollection(ship).map(checkpoint => ({ ...checkpoint }));

  if (firstShiftCheckpoints[0]) {
    firstShiftCheckpoints[0] = {
      ...firstShiftCheckpoints[0],
      status: 'completed',
      completedBy: 'Cipto Mangunkusumo',
      completedByUserId: 'u3',
      time: '08:15',
      shipName: ship.name,
      photoUrl: createPosterDataUrl('CUACA', 'Kondisi aman', 0, false),
      resultType: 'aman',
      kejadian: 'Visibilitas baik dan gelombang stabil.',
      penyebab: '',
      tindakLanjut: 'Lanjut patroli rutin.',
    };
  }

  if (firstShiftCheckpoints[1]) {
    firstShiftCheckpoints[1] = {
      ...firstShiftCheckpoints[1],
      status: 'completed',
      completedBy: 'Sertu Agus',
      completedByUserId: 'u2',
      time: '08:40',
      shipName: ship.name,
      photoUrl: createPosterDataUrl('MESIN', 'Perlu tindak lanjut', 4, false),
      resultType: 'temuan',
      kejadian: 'Suhu generator naik di atas ambang normal.',
      penyebab: 'Sirkulasi udara ruang mesin terhambat.',
      tindakLanjut: 'Lapor Chief Engineer dan buka ventilasi tambahan.',
    };
  }

  if (secondShiftCheckpoints[1]) {
    secondShiftCheckpoints[1] = {
      ...secondShiftCheckpoints[1],
      status: 'completed',
      completedBy: 'Cipto Mangunkusumo',
      completedByUserId: 'u3',
      time: '05:10',
      shipName: ship.name,
      photoUrl: createPosterDataUrl('MESIN', 'Inspeksi selesai', 0, false),
      resultType: 'aman',
      kejadian: 'Ruang mesin aman dan peralatan beroperasi normal.',
      penyebab: '',
      tindakLanjut: 'Lanjut patroli rutin.',
    };
  }

  return sortHistoryEntries([
    buildHistoryEntry({
      shiftMeta: shiftMetaFromParts('2026-04-02', 'shift-pagi'),
      checkpoints: firstShiftCheckpoints,
      ship,
      users: getMockUsersList(),
      weatherInfo: { temperature: 30, windspeed: 12, weathercode: 1 },
    }),
    buildHistoryEntry({
      shiftMeta: shiftMetaFromParts('2026-04-01', 'shift-malam'),
      checkpoints: secondShiftCheckpoints,
      ship,
      users: getMockUsersList(),
      weatherInfo: { temperature: 28, windspeed: 9, weathercode: 3 },
    }),
  ]);
}

const persistedState = loadPersistedState();

// --- CONTEXT ---
const AppContext = createContext(null);
const UIContext = createContext(null);
const AuthContext = createContext(null);
const RoleContext = createContext(null);
const PatrolContext = createContext(null);
const ShipContext = createContext(null);
const IncidentContext = createContext(null);
const UserManagementContext = createContext(null);
const ReportContext = createContext(null);
const WeatherContext = createContext(null);
const HistoryContext = createContext(null);
const NotificationContext = createContext(null);
const SOSContext = createContext(null);

function useRequiredContext(context, name) {
  const value = useContext(context);
  if (value === null) {
    throw new Error(`${name} must be used within AppProvider`);
  }
  return value;
}

export const useApp = () => useRequiredContext(AppContext, 'useApp');
export const useUI = () => useRequiredContext(UIContext, 'useUI');
export const useAuth = () => useRequiredContext(AuthContext, 'useAuth');
export const useRole = () => useRequiredContext(RoleContext, 'useRole');
export const usePatrol = () => useRequiredContext(PatrolContext, 'usePatrol');
export const useShips = () => useRequiredContext(ShipContext, 'useShips');
export const useIncidents = () => useRequiredContext(IncidentContext, 'useIncidents');
export const useUsers = () => useRequiredContext(UserManagementContext, 'useUsers');
export const useReports = () => useRequiredContext(ReportContext, 'useReports');
export const useWeather = () => useRequiredContext(WeatherContext, 'useWeather');
export const useHistory = () => useRequiredContext(HistoryContext, 'useHistory');
export const useNotifications = () => useRequiredContext(NotificationContext, 'useNotifications');
export const useSOS = () => useRequiredContext(SOSContext, 'useSOS');
export { ACCESS_ROLES, defaultLocationOptions, SHIP_STATUS_OPTIONS };

export function AppProvider({ children }) {
  const initialShipsCollection = normalizeShipsCollection(persistedState?.shipsData || getInitialShipsData());
  const initialUsersCollection = applyAdminCredentialReset(
    normalizeUsersCollection(persistedState?.usersData || getMockUsersList()),
  );
  const initialCheckpointsByShip = createCheckpointsByShipState(
    initialShipsCollection,
    persistedState?.checkpointsByShip,
    persistedState?.checkpoints,
    normalizeShiftKeyForCloudSync(persistedState?.activeShiftKey, getShiftMeta()),
  );

  // Theme & connectivity
  const [currentPage, setCurrentPage] = useState('home');
  const [theme, setTheme] = useState(() => persistedState?.theme || 'dark');
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

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('pertamina-light');
    } else {
      document.documentElement.classList.remove('pertamina-light');
    }
  }, [theme]);

  // Auth
  const [sessionUserId, setSessionUserId] = useState(() => loadAuthSession());
  const [firebaseAuthUser, setFirebaseAuthUser] = useState(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(() => !isFirebaseAuthEnabled);
  const [authMode, setAuthMode] = useState('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authForm, setAuthForm] = useState(() => createAuthFormState());

  // Core data
  const [activeShiftKey, setActiveShiftKey] = useState(() => persistedState?.activeShiftKey || getShiftMeta().key);
  const [checkpointsByShip, setCheckpointsByShip] = useState(() => initialCheckpointsByShip);
  const [shipsData, setShipsData] = useState(() => initialShipsCollection);
  const [usersData, setUsersData] = useState(() => initialUsersCollection);
  const [incidentsData, setIncidentsData] = useState(() => persistedState?.incidentsData || []);
  const [historyEntries, setHistoryEntries] = useState(() => sortHistoryEntries(persistedState?.historyEntries || createSeedHistoryEntries()));
  const [notifications, setNotifications] = useState(() => sortNotifications(persistedState?.notifications || []));
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [shiftClock, setShiftClock] = useState(() => Date.now());
  const [activeSOSAlert, setActiveSOSAlert] = useState(() => persistedState?.activeSOSAlert || null);
  const [sosHistory, setSosHistory] = useState(() => persistedState?.sosHistory || []);
  const hasAppliedRoleLandingRef = useRef(false);

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
          usersToUpdate.push({ userId: uId, shipAssigned: ship.name, status: 'active' });
          shipModified = true; shipsChanged = true;
        }
      });

      [...newPersonnel].forEach(uId => {
        const schedule = newSchedules[uId];
        if (schedule && schedule.startDate && schedule.startDate > todayStr) {
          if (!newNextMonth.includes(uId)) newNextMonth.push(uId);
          newPersonnel = newPersonnel.filter(id => id !== uId);
          usersToUpdate.push({ userId: uId, shipAssigned: null, status: 'off-duty' });
          shipModified = true; shipsChanged = true;
        }
      });

      if (shipModified) return { ...ship, personnel: newPersonnel, personnelNextMonth: newNextMonth, personnelSchedules: newSchedules };
      return ship;
    });
    if (shipsChanged) {
      setShipsData(updatedShips);
      setUsersData(prev => prev.map(u => { 
        const update = usersToUpdate.find(x => x.userId === u.id); 
        if (update) return { ...u, shipAssigned: update.shipAssigned, status: update.status }; 
        return u; 
      }));
    }
  }, []);

  // UI states
  const [activeForms, setActiveForms] = useState({});
  const [pendingPatrolCameraCapture, setPendingPatrolCameraCapture] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [selectedReportDetail, setSelectedReportDetail] = useState(null);
  const [newCustomNode, setNewCustomNode] = useState('');
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState(() => createIncidentFormState());
  const [activeShipId, setActiveShipId] = useState(null);
  const [shipDetailTab, setShipDetailTab] = useState('info');
  const [scheduleMonth, setScheduleMonth] = useState('current');
  const [showAssignPopup, setShowAssignPopup] = useState(false);
  const [assignPopupData, setAssignPopupData] = useState(null);
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
  const [submittingPatrolId, setSubmittingPatrolId] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [incidentMeta, setIncidentMeta] = useState(() => persistedState?.incidentMeta || {});
  const [deletedRecords, setDeletedRecords] = useState(() => createDeletedRecordsState(persistedState?.deletedRecords));
  const [newProgress, setNewProgress] = useState({ comment: '', photoUrl: null });
  const [showUserForm, setShowUserForm] = useState(false);
  const [userFormData, setUserFormData] = useState(() => createUserFormState());
  const [userFormError, setUserFormError] = useState('');
  const [userFormNotice, setUserFormNotice] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [patrolTab, setPatrolTab] = useState('checkpoint');
  const [cloudSyncBootstrapped, setCloudSyncBootstrapped] = useState(() => !isCloudSyncEnabled);
  const previousUsersDataRef = useRef(usersData);
  const lastSharedStateRef = useRef('');
  const latestCloudSharedStateRef = useRef(null);
  const cloudAssetCacheRef = useRef(new Map());
  const cloudSaveQueueRef = useRef(Promise.resolve());

// SOS Hooks moved to resolve TDZ

  // Computed values
  const deferredSearchQuery = useDeferredValue(searchQuery);
  // Phase 5.1: Stabilize currentShiftMeta to prevent cascading global re-renders
  const rawShiftMeta = getShiftMeta(new Date(shiftClock));
  const currentShiftMetaRef = useRef(rawShiftMeta);
  if (currentShiftMetaRef.current.key !== rawShiftMeta.key) {
    currentShiftMetaRef.current = rawShiftMeta;
  }
  const currentShiftMeta = currentShiftMetaRef.current;
  const currentShiftSchedule = useMemo(() => getShiftScheduleTimes(currentShiftMeta), [currentShiftMeta]);
  const sessionUserRecord = useMemo(() => usersData.find(user => user.id === sessionUserId) || null, [usersData, sessionUserId]);
  const firebaseAuthEmail = sanitizeEmail(firebaseAuthUser?.email || '');
  const currentUserRecord = useMemo(() => {
    if (firebaseAuthEmail) {
      return usersData.find(user => (user.email || '').toLowerCase() === firebaseAuthEmail) || sessionUserRecord || null;
    }
    if (!firebaseAuthReady && isFirebaseManagedUser(sessionUserRecord)) {
      return null;
    }
    return sessionUserRecord;
  }, [firebaseAuthEmail, firebaseAuthReady, sessionUserRecord, usersData]);
  const effectiveSessionUser = currentUserRecord || sessionUserRecord || null;
  const currentUser = effectiveSessionUser?.name || '';
  const currentUserRole = effectiveSessionUser?.role || ACCESS_ROLES.PETUGAS;
  const isAdmin = currentUserRole === ACCESS_ROLES.ADMIN;
  const isPic = currentUserRole === ACCESS_ROLES.PIC;
  const isPetugas = currentUserRole === ACCESS_ROLES.PETUGAS;
  const currentUserId = effectiveSessionUser?.id || null;
  const getSOSRecipientUserIds = useCallback((shipName) => {
    const safeShipName = sanitizeText(shipName || '', 80);
    if (!safeShipName) return [];

    const sourceShip = shipsData.find((ship) => ship.name === safeShipName) || null;
    const recipientShipNames = new Set([safeShipName]);

    (sourceShip?.sosRecipientShipIds || []).forEach((shipId) => {
      const linkedShip = shipsData.find((ship) => ship.id === shipId);
      if (linkedShip?.name) recipientShipNames.add(linkedShip.name);
    });

    return Array.from(new Set(
      usersData
        .filter((user) => {
          if (user.role === ACCESS_ROLES.ADMIN || user.role === ACCESS_ROLES.PIC) return true;
          if (!recipientShipNames.has(user.shipAssigned)) return false;
          if (user.role === ACCESS_ROLES.PETUGAS) return user.status === 'active';
          return false;
        })
        .map((user) => user.id)
        .filter(Boolean),
    ));
  }, [shipsData, usersData]);

  useEffect(() => {
    const landingUser = currentUserRecord || sessionUserRecord;

    if (!landingUser) {
      hasAppliedRoleLandingRef.current = false;
      return;
    }

    if (hasAppliedRoleLandingRef.current) return;

    const landingPage = getDefaultPageForRole(landingUser.role);
    setCurrentPage(landingPage);
    setNotificationReturnPage(landingPage);
    hasAppliedRoleLandingRef.current = true;
  }, [currentUserRecord, sessionUserRecord]);

  const handleSOSTrigger = useCallback((lat, lng) => {
    if (!currentUserRecord) return;
    const senderShipName = sanitizeText(currentUserRecord.shipAssigned || '', 80) || 'Tidak diketahui';
    const sourceShip = shipsData.find((ship) => ship.name === senderShipName) || null;
    const targetShipIds = Array.from(new Set([
      sourceShip?.id || null,
      ...((sourceShip?.sosRecipientShipIds || []).filter(Boolean)),
    ].filter(Boolean)));
    const targetShipNames = targetShipIds
      .map((shipId) => shipsData.find((ship) => ship.id === shipId)?.name || '')
      .filter(Boolean);
    const targetUserIds = getSOSRecipientUserIds(senderShipName);
    const rawSOS = {
      id: `sos-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      senderUserId: currentUserRecord.id || 'unknown',
      senderName: currentUserRecord.name || 'Unknown',
      senderRole: currentUserRecord.role || 'petugas',
      shipName: senderShipName,
      lat: lat !== undefined ? lat : null,
      lng: lng !== undefined ? lng : null,
      triggeredAt: new Date().toISOString(),
      targetUserIds,
      targetShipIds,
      targetShipNames,
      confirmedBy: [],
      status: 'active'
    };
    
    // Default broad notification implementation
    const rawNotif = {
      id: `notif-sos-${Date.now()}`,
      type: 'sos',
      title: '🚨 DARURAT SOS',
      message: `Tanda darurat dikirim oleh ${currentUserRecord.name || 'Seseorang'} dari ${senderShipName}.`,
      senderName: currentUserRecord.name || 'Unknown',
      senderRole: currentUserRecord.role || 'petugas',
      targetUserIds,
      readByUserIds: [],
      route: 'incidents/detail',
      routeParams: { incidentId: rawSOS.id },
      incidentId: rawSOS.id,
      shipName: senderShipName,
      createdAt: new Date().toISOString(),
    };

    // Spread is sufficient — SOS and notification objects are flat (no nested Date/Map/circular refs)
    const newSOS = { ...rawSOS };
    const notification = { ...rawNotif };

    setActiveSOSAlert(newSOS);
    setSosHistory(prev => [newSOS, ...prev]);
    setNotifications(prev => [notification, ...prev]); 
  }, [currentUserRecord, getSOSRecipientUserIds, shipsData]);

  const handleSOSConfirm = useCallback(() => {
    if (!activeSOSAlert || !currentUserId) return;
    if (Array.isArray(activeSOSAlert.targetUserIds) && !activeSOSAlert.targetUserIds.includes(currentUserId)) return;
    
    const updatedSOS = {
      ...activeSOSAlert,
      confirmedBy: [...new Set([...activeSOSAlert.confirmedBy, currentUserId])],
    };
    
    setActiveSOSAlert(updatedSOS);
    setSosHistory(prev => prev.map(s => s.id === updatedSOS.id ? updatedSOS : s));
  }, [activeSOSAlert, currentUserId]);

  const handleSOSDismiss = useCallback(() => {
    if (!activeSOSAlert) return;
    
    const updatedSOS = {
      ...activeSOSAlert,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy: currentUserRecord?.name || 'Sistem',
    };
    
    setActiveSOSAlert(null); // Clear active alert
    setSosHistory(prev => prev.map(s => s.id === updatedSOS.id ? updatedSOS : s));
  }, [activeSOSAlert, currentUserRecord]);

  const assignedShipForCurrentUser = useMemo(() => {
    if (!currentUserRecord) return null;
    if (currentUserRecord.role === ACCESS_ROLES.ADMIN) return null;
    return shipsData.find((ship) => (
      ship.name === currentUserRecord.shipAssigned
      && Array.isArray(ship.personnel)
      && ship.personnel.includes(currentUserRecord.id)
      && currentUserRecord.status === 'active'
    )) || null;
  }, [currentUserRecord, shipsData]);
  const operationalShip = useMemo(() => {
    if (currentUserRecord?.role === ACCESS_ROLES.ADMIN) return null;
    if (shipsData.length === 0) return null;
    if (isPetugas) return assignedShipForCurrentUser;
    if (currentUserRecord?.shipAssigned) {
      return shipsData.find(ship => ship.name === currentUserRecord.shipAssigned) || assignedShipForCurrentUser || shipsData[0];
    }
    return assignedShipForCurrentUser || shipsData[0];
  }, [assignedShipForCurrentUser, currentUserRecord?.role, currentUserRecord?.shipAssigned, isPetugas, shipsData]);
  const operationalShipName = currentUserRecord?.role === ACCESS_ROLES.ADMIN
    ? null
    : (operationalShip?.name || (isPetugas ? null : currentUserRecord?.shipAssigned || shipsData[0]?.name || null));
  const checkpoints = useMemo(() => {
    if (!operationalShip?.id) return [];
    return checkpointsByShip[operationalShip.id] || [];
  }, [checkpointsByShip, operationalShip?.id]);
  const visibleHistoryEntries = useMemo(() => {
    if (!currentUserRecord) return [];
    if (isAdmin || isPic) return historyEntries;
    if (!assignedShipForCurrentUser) return [];
    return historyEntries.filter(entry => (
      entry.shipSnapshot?.id === assignedShipForCurrentUser.id
      || entry.ship === assignedShipForCurrentUser.name
    ));
  }, [assignedShipForCurrentUser, currentUserRecord, historyEntries, isAdmin, isPic]);
  const selectedHistoryEntry = useMemo(() => visibleHistoryEntries.find(entry => entry.id === selectedHistoryId) || null, [visibleHistoryEntries, selectedHistoryId]);
  const visibleNotifications = useMemo(() => {
    if (!currentUserId) return [];
    return notifications.filter(notification => notification.targetUserIds.includes(currentUserId));
  }, [notifications, currentUserId]);
  const unreadNotificationCount = useMemo(() => {
    if (!currentUserId) return 0;
    return visibleNotifications.filter(notification => !notification.readByUserIds.includes(currentUserId)).length;
  }, [visibleNotifications, currentUserId]);
  const filteredCheckpoints = useMemo(() => checkpoints.filter(cp => cp.name.toLowerCase().includes(deferredSearchQuery.toLowerCase())), [checkpoints, deferredSearchQuery]);
  const incidentLocationOptions = useMemo(() => {
    const checkpointDefinitions = (
      operationalShip?.customCheckpoints?.length
        ? operationalShip.customCheckpoints
        : assignedShipForCurrentUser?.customCheckpoints?.length
          ? assignedShipForCurrentUser.customCheckpoints
          : shipsData.find((ship) => Array.isArray(ship.customCheckpoints) && ship.customCheckpoints.length > 0)?.customCheckpoints || []
    );

    return Array.from(new Set(
      checkpointDefinitions
        .map((checkpoint) => sanitizeText(checkpoint?.name || '', 80))
        .filter(Boolean),
    ));
  }, [assignedShipForCurrentUser, operationalShip, shipsData]);
  const completedCount = useMemo(() => checkpoints.filter(c => c.status === 'completed').length, [checkpoints]);
  const totalCount = checkpoints.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const activePatrolId = useMemo(() => Object.keys(activeForms)[0], [activeForms]);
  const activePatrolState = useMemo(() => activePatrolId ? activeForms[activePatrolId] : null, [activeForms, activePatrolId]);
  const activePatrolItem = useMemo(() => activePatrolId ? checkpoints.find(c => String(c.id) === String(activePatrolId)) : null, [activePatrolId, checkpoints]);
  const canPatrolCurrentShip = Boolean(currentUserRecord && operationalShip && (isPic || (isPetugas && assignedShipForCurrentUser?.id === operationalShip.id)));
  const canAddTemporaryPatrolNode = Boolean(isPetugas && canPatrolCurrentShip && operationalShip && !selectedHistoryEntry);
  const shouldForcePatrolCameraCapture = isMobilePatrolViewport();

  const canManageIncident = useCallback((incident) => {
    if (!currentUserRecord || !incident) return false;
    if (isAdmin || isPic) return true;
    if (!isPetugas) return false;
    return Boolean(assignedShipForCurrentUser && incident.shipName === assignedShipForCurrentUser.name);
  }, [assignedShipForCurrentUser, currentUserRecord, isAdmin, isPic, isPetugas]);
  const canCloseIncident = useCallback((incident) => Boolean(currentUserRecord && incident && (isAdmin || isPic)), [currentUserRecord, isAdmin, isPic]);
  const sharedState = useMemo(() => createSharedStateSnapshot({
    activeShiftKey,
    checkpointsByShip,
    deletedRecords,
    historyEntries,
    incidentMeta,
    incidentsData,
    notifications,
    shipsData,
    usersData,
    activeSOSAlert,
    sosHistory,
  }), [
    activeShiftKey,
    checkpointsByShip,
    deletedRecords,
    historyEntries,
    incidentMeta,
    incidentsData,
    notifications,
    shipsData,
    usersData,
    activeSOSAlert,
    sosHistory,
  ]);
  const prepareCloudPhotoUrl = useCallback(async (photoUrl, pathSegments) => {
    if (!photoUrl || typeof photoUrl !== 'string') return photoUrl || null;
    if (!photoUrl.startsWith('idb://')) return photoUrl;

    const cachedUrl = cloudAssetCacheRef.current.get(photoUrl);
    if (cachedUrl) return cachedUrl;

    const dataUrl = await loadImageFromDB(photoUrl);
    if (!dataUrl) return null;

    try {
      const uploadedUrl = await uploadCloudDataUrlAsset({
        dataUrl,
        path: createCloudAssetPath(...pathSegments),
      });

      const resolvedUrl = uploadedUrl || dataUrl;
      cloudAssetCacheRef.current.set(photoUrl, resolvedUrl);
      return resolvedUrl;
    } catch (error) {
      console.error('Gagal upload aset patroli ke cloud', error);
      cloudAssetCacheRef.current.set(photoUrl, dataUrl);
      return dataUrl;
    }
  }, []);
  const prepareSharedStateForCloudSync = useCallback(async (stateSnapshot) => {
    const preparedCheckpointsByShip = Object.fromEntries(await Promise.all(
      Object.entries(stateSnapshot.checkpointsByShip || {}).map(async ([shipId, shipCheckpoints]) => ([
        shipId,
        await Promise.all((shipCheckpoints || []).map(async (checkpoint) => ({
          ...checkpoint,
          photoUrl: await prepareCloudPhotoUrl(
            checkpoint.photoUrl,
            ['checkpoints', shipId, checkpoint.id, checkpoint.photoUrl],
          ),
          galleryPhotos: await Promise.all((checkpoint.galleryPhotos || []).map(async (galleryPhoto, galleryIndex) => ({
            ...galleryPhoto,
            photoUrl: await prepareCloudPhotoUrl(
              galleryPhoto.photoUrl,
              ['checkpoints-gallery', shipId, checkpoint.id, galleryPhoto.id || galleryIndex, galleryPhoto.photoUrl],
            ),
          }))),
        }))),
      ])),
    ));

    const preparedShipsData = await Promise.all((stateSnapshot.shipsData || []).map(async (ship) => ({
      ...ship,
      photoUrl: await prepareCloudPhotoUrl(
        ship.photoUrl,
        ['ships', ship.id, 'cover', ship.photoUrl],
      ),
    })));

    const preparedUsersData = await Promise.all((stateSnapshot.usersData || []).map(async (user) => ({
      ...user,
      photoUrl: await prepareCloudPhotoUrl(
        user.photoUrl,
        ['users', user.id, 'avatar', user.photoUrl],
      ),
    })));

    const preparedIncidentsData = await Promise.all((stateSnapshot.incidentsData || []).map(async (incident) => ({
      ...incident,
      photoUrl: await prepareCloudPhotoUrl(
        incident.photoUrl,
        ['incidents', incident.id, 'photo', incident.photoUrl],
      ),
    })));

    const preparedIncidentMeta = Object.fromEntries(await Promise.all(
      Object.entries(stateSnapshot.incidentMeta || {}).map(async ([incidentId, meta]) => ([
        incidentId,
        {
          ...meta,
          documentation: await Promise.all((meta?.documentation || []).map(async (documentationItem, documentationIndex) => ({
            ...documentationItem,
            photoUrl: await prepareCloudPhotoUrl(
              documentationItem.photoUrl,
              ['incident-documentation', incidentId, documentationItem.id || documentationIndex, documentationItem.photoUrl],
            ),
          }))),
          progress: await Promise.all((meta?.progress || []).map(async (progressItem, progressIndex) => ({
            ...progressItem,
            photoUrl: await prepareCloudPhotoUrl(
              progressItem.photoUrl,
              ['incident-progress', incidentId, progressItem.id || progressIndex, progressItem.photoUrl],
            ),
          }))),
        },
      ])),
    ));

    const preparedHistoryEntries = await Promise.all((stateSnapshot.historyEntries || []).map(async (entry) => ({
      ...entry,
      checkpoints: await Promise.all((entry.checkpoints || []).map(async (checkpoint) => ({
        ...checkpoint,
        photoUrl: await prepareCloudPhotoUrl(
          checkpoint.photoUrl,
          ['history', entry.id || entry.key, checkpoint.id, checkpoint.photoUrl],
        ),
        galleryPhotos: await Promise.all((checkpoint.galleryPhotos || []).map(async (galleryPhoto, galleryIndex) => ({
          ...galleryPhoto,
          photoUrl: await prepareCloudPhotoUrl(
            galleryPhoto.photoUrl,
            ['history-gallery', entry.id || entry.key, checkpoint.id, galleryPhoto.id || galleryIndex, galleryPhoto.photoUrl],
          ),
        }))),
      }))),
      crewSnapshot: await Promise.all((entry.crewSnapshot || []).map(async (crew) => ({
        ...crew,
        photoUrl: await prepareCloudPhotoUrl(
          crew.photoUrl,
          ['history-crew', entry.id || entry.key, crew.id || crew.name, crew.photoUrl],
        ),
      }))),
    })));

    return createSharedStateSnapshot({
      activeShiftKey: stateSnapshot.activeShiftKey,
      checkpointsByShip: preparedCheckpointsByShip,
      deletedRecords: stateSnapshot.deletedRecords,
      historyEntries: preparedHistoryEntries,
      incidentMeta: preparedIncidentMeta,
      incidentsData: preparedIncidentsData,
      notifications: stateSnapshot.notifications || [],
      shipsData: preparedShipsData,
      usersData: preparedUsersData,
      activeSOSAlert: stateSnapshot.activeSOSAlert || null,
      sosHistory: stateSnapshot.sosHistory || [],
    });
  }, [prepareCloudPhotoUrl]);
  const applyCloudSharedState = useCallback((nextState) => {
    if (!nextState || typeof nextState !== 'object') return null;

    const nextShips = normalizeShipsCollection(nextState.shipsData || getInitialShipsData());
    const nextUsers = applyAdminCredentialReset(
      normalizeUsersCollection(nextState.usersData || getMockUsersList()),
    );
    const nextCheckpointsByShip = createCheckpointsByShipState(
      nextShips,
      nextState.checkpointsByShip,
      nextState.checkpoints,
      normalizeShiftKeyForCloudSync(nextState.activeShiftKey, getShiftMeta()),
    );
    const incomingState = createSharedStateSnapshot({
      activeShiftKey: normalizeShiftKeyForCloudSync(nextState.activeShiftKey, getShiftMeta()),
      checkpointsByShip: nextCheckpointsByShip,
      deletedRecords: nextState.deletedRecords,
      historyEntries: sortHistoryEntries(nextState.historyEntries || createSeedHistoryEntries()),
      incidentMeta: nextState.incidentMeta && typeof nextState.incidentMeta === 'object' ? nextState.incidentMeta : {},
      incidentsData: Array.isArray(nextState.incidentsData) ? nextState.incidentsData : [],
      notifications: sortNotifications(nextState.notifications || []),
      shipsData: nextShips,
      usersData: nextUsers,
      activeSOSAlert: nextState.activeSOSAlert || null,
      sosHistory: nextState.sosHistory || [],
    });
    const normalizedState = mergeSharedStateSnapshots({}, incomingState);
    const serializedState = serializeSharedStateSnapshot(normalizedState);
    latestCloudSharedStateRef.current = normalizedState;

    if (serializedState === lastSharedStateRef.current) return normalizedState;

    logCloudSyncDebug('apply-shared-state', {
      activeShiftKey: normalizedState.activeShiftKey,
      deletedHistory: Object.keys(normalizedState.deletedRecords?.historyEntries || {}).length,
      deletedIncidents: Object.keys(normalizedState.deletedRecords?.incidents || {}).length,
      deletedShips: Object.keys(normalizedState.deletedRecords?.ships || {}).length,
      deletedUsers: Object.keys(normalizedState.deletedRecords?.users || {}).length,
      notifications: normalizedState.notifications.length,
      historyEntries: normalizedState.historyEntries.length,
      ships: normalizedState.shipsData.length,
      users: normalizedState.usersData.length,
      checkpointShips: Object.keys(normalizedState.checkpointsByShip || {}).length,
    });

    lastSharedStateRef.current = serializedState;
    setActiveShiftKey(normalizedState.activeShiftKey);
    setCheckpointsByShip(normalizedState.checkpointsByShip);
    setShipsData(normalizedState.shipsData);
    setUsersData(normalizedState.usersData);
    setIncidentsData(normalizedState.incidentsData);
    setIncidentMeta(normalizedState.incidentMeta);
    setDeletedRecords(normalizedState.deletedRecords);
    setHistoryEntries(normalizedState.historyEntries);
    setNotifications(normalizedState.notifications);
    setActiveSOSAlert(normalizedState.activeSOSAlert);
    setSosHistory(normalizedState.sosHistory);
    return normalizedState;
  }, []);
  const getUsersByRole = useCallback((roles) => (
    usersData.filter(user => roles.includes(user.role)).map(user => user.id)
  ), [usersData]);
  const getShipRecipients = useCallback((shipName, options = {}) => {
    const { includeAdmins = false, includePic = false, includePetugas = false, includeUserIds = [] } = options;
    const recipients = new Set(includeUserIds.filter(Boolean));
    usersData.forEach((user) => {
      if (includeAdmins && user.role === ACCESS_ROLES.ADMIN) recipients.add(user.id);
      if (shipName && includePic && user.role === ACCESS_ROLES.PIC && user.shipAssigned === shipName) recipients.add(user.id);
      if (
        shipName
        && includePetugas
        && user.role === ACCESS_ROLES.PETUGAS
        && user.shipAssigned === shipName
        && user.status === 'active'
      ) {
        recipients.add(user.id);
      }
    });
    return Array.from(recipients);
  }, [usersData]);
  const appendNotifications = useCallback((nextNotifications) => {
    if (!Array.isArray(nextNotifications) || nextNotifications.length === 0) return;
    setNotifications((previousNotifications) => {
      const workingNotifications = [...previousNotifications];
      const dedupeIndexMap = new Map();

      workingNotifications.forEach((notification, index) => {
        if (notification?.dedupeKey) dedupeIndexMap.set(notification.dedupeKey, index);
      });

      let didChange = false;

      nextNotifications.forEach((notification) => {
        const targetUserIds = Array.from(new Set(
          (Array.isArray(notification?.targetUserIds) ? notification.targetUserIds : []).filter(Boolean),
        ));
        if (targetUserIds.length === 0) return;

        if (notification.dedupeKey && dedupeIndexMap.has(notification.dedupeKey)) {
          const existingIndex = dedupeIndexMap.get(notification.dedupeKey);
          const existingNotification = workingNotifications[existingIndex];
          const mergedTargetUserIds = Array.from(new Set([
            ...(Array.isArray(existingNotification?.targetUserIds) ? existingNotification.targetUserIds : []),
            ...targetUserIds,
          ]));
          const nextRecord = {
            ...existingNotification,
            ...notification,
            id: existingNotification.id,
            dedupeKey: existingNotification.dedupeKey,
            createdAt: existingNotification.createdAt,
            targetUserIds: mergedTargetUserIds,
            readByUserIds: (Array.isArray(existingNotification?.readByUserIds) ? existingNotification.readByUserIds : [])
              .filter(userId => mergedTargetUserIds.includes(userId)),
          };

          const hasChanged = (
            existingNotification.title !== nextRecord.title
            || existingNotification.message !== nextRecord.message
            || existingNotification.senderName !== nextRecord.senderName
            || existingNotification.senderRole !== nextRecord.senderRole
            || existingNotification.route !== nextRecord.route
            || existingNotification.shipName !== nextRecord.shipName
            || existingNotification.shiftKey !== nextRecord.shiftKey
            || existingNotification.incidentId !== nextRecord.incidentId
            || existingNotification.historyId !== nextRecord.historyId
            || JSON.stringify(existingNotification.routeParams || {}) !== JSON.stringify(nextRecord.routeParams || {})
            || JSON.stringify(existingNotification.targetUserIds || []) !== JSON.stringify(mergedTargetUserIds)
          );

          if (hasChanged) {
            workingNotifications[existingIndex] = nextRecord;
            didChange = true;
            if (isShiftNotificationType(nextRecord.type)) {
              logShiftNotificationDebug('merge', {
                dedupeKey: nextRecord.dedupeKey,
                type: nextRecord.type,
                shipName: nextRecord.shipName,
                shiftKey: nextRecord.shiftKey,
                targetUserIds: nextRecord.targetUserIds,
                message: nextRecord.message,
              });
            }
          }
          return;
        }

        const record = createNotificationRecord({ ...notification, targetUserIds });
        workingNotifications.push(record);
        if (record.dedupeKey) dedupeIndexMap.set(record.dedupeKey, workingNotifications.length - 1);
        didChange = true;
        if (isShiftNotificationType(record.type)) {
          logShiftNotificationDebug('add', {
            dedupeKey: record.dedupeKey,
            type: record.type,
            shipName: record.shipName,
            shiftKey: record.shiftKey,
            targetUserIds: record.targetUserIds,
            message: record.message,
          });
        }
      });

      if (!didChange) return previousNotifications;
      logCloudSyncDebug('notifications-updated', {
        previousCount: previousNotifications.length,
        nextCount: workingNotifications.length,
        dedupeKeys: nextNotifications.map(notification => notification?.dedupeKey).filter(Boolean),
        types: nextNotifications.map(notification => notification?.type).filter(Boolean),
      });
      return sortNotifications(workingNotifications);
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
    setPendingPatrolCameraCapture(null);
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
    if (!visibleHistoryEntries.some(entry => entry.id === historyId)) return;
    setSelectedHistoryId(historyId);
    setCurrentPage('history');
    setPatrolTab('info');
    setSearchQuery('');
    setActiveForms({});
    setPendingPatrolCameraCapture(null);
    setSelectedReportDetail(null);
    setSelectedIncident(null);
  }, [visibleHistoryEntries]);
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
        const deletedAt = new Date().toISOString();
        setDeletedRecords(previousDeletedRecords => markDeletedRecord(previousDeletedRecords, 'historyEntries', historyId, deletedAt));
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
  const patrolIncidents = useMemo(() => (
    Object.values(checkpointsByShip)
      .flat()
      .filter(checkpoint => checkpoint.status === 'completed' && checkpoint.resultType === 'temuan')
      .map(checkpoint => createPatrolIncidentRecord(checkpoint, {
        fallbackShipName: checkpoint.shipName || operationalShipName || '',
      }))
  ), [checkpointsByShip, operationalShipName]);
  const historyPatrolIncidents = useMemo(() => (
    historyEntries.flatMap((entry) => (
      (entry.checkpoints || [])
        .filter(checkpoint => checkpoint.status === 'completed' && checkpoint.resultType === 'temuan')
        .map(checkpoint => createPatrolIncidentRecord(checkpoint, {
          fallbackShipName: entry.ship,
          fallbackDate: entry.date,
        }))
    ))
  ), [historyEntries]);
  const sosIncidents = useMemo(() => (
    Array.from(
      [...(Array.isArray(sosHistory) ? sosHistory : []), activeSOSAlert]
        .filter(Boolean)
        .reduce((sosMap, sosEntry) => sosMap.set(sosEntry.id, sosEntry), new Map())
        .values(),
    )
      .map(createSOSIncidentRecord)
      .filter(Boolean)
  ), [activeSOSAlert, sosHistory]);
  const allIncidents = useMemo(() => (
    Array.from(
      [...incidentsData, ...patrolIncidents, ...historyPatrolIncidents, ...sosIncidents].reduce((incidentMap, incident) => {
        const infoOverrides = incidentMeta[incident.id]?.infoOverrides || {};
        const normalizedIncident = {
          ...incident,
          ...infoOverrides,
          shipName: incident.shipName || operationalShipName || '',
        };
        const existingIncident = incidentMap.get(normalizedIncident.id);
        if (!existingIncident || getIncidentSortTimestamp(normalizedIncident) >= getIncidentSortTimestamp(existingIncident)) {
          incidentMap.set(normalizedIncident.id, normalizedIncident);
        }
        return incidentMap;
      }, new Map()).values(),
    )
      .filter((incident) => incidentMeta[incident.id]?.deleted !== true)
      .sort((left, right) => getIncidentSortTimestamp(right) - getIncidentSortTimestamp(left))
  ), [historyPatrolIncidents, incidentMeta, incidentsData, operationalShipName, patrolIncidents, sosIncidents]);
  const visibleIncidents = useMemo(() => (
    isPetugas && assignedShipForCurrentUser
      ? allIncidents.filter((incident) => (
          incident.shipName === assignedShipForCurrentUser.name
          || (Array.isArray(incident.targetShipNames) && incident.targetShipNames.includes(assignedShipForCurrentUser.name))
        ))
      : allIncidents
  ), [allIncidents, assignedShipForCurrentUser, isPetugas]);
  const activeShiftGuardSnapshot = useMemo(
    () => (operationalShipName ? buildGuardShiftSnapshot(usersData, operationalShipName, checkpoints) : []),
    [checkpoints, operationalShipName, usersData],
  );

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
    setCheckpointsByShip((previousState) => {
      const nextState = createCheckpointsByShipState(shipsData, previousState, null, activeShiftKey);
      // shallowEqualObjects checks top-level ship-id keys — avoids full JSON.stringify on all checkpoints
      return shallowEqualObjects(previousState, nextState) ? previousState : nextState;
    });
  }, [activeShiftKey, shipsData]);

  useEffect(() => {
    if (!selectedHistoryId) return;
    if (selectedHistoryEntry) return;
    setSelectedHistoryId(null);
  }, [selectedHistoryEntry, selectedHistoryId]);

  useEffect(() => {
    setUsersData((previousUsers) => {
      const nextUsers = applyAdminCredentialReset(previousUsers);
      // Reference equality is sufficient here — applyAdminCredentialReset returns same array if unchanged
      return previousUsers === nextUsers ? previousUsers : nextUsers;
    });
  }, []);

  useEffect(() => {
    if (!operationalShipName) return;
    const { startAt, endAt } = currentShiftSchedule;
    const now = new Date(shiftClock);
    if (now < startAt || now >= endAt) return;
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
      createdAt: startAt.toISOString(),
    }]);
  }, [appendNotifications, currentShiftMeta, currentShiftSchedule, getShipRecipients, operationalShipName, shiftClock]);

  useEffect(() => {
    if (!operationalShipName) return;
    const { endAt, checkpointPendingAt, shiftEndingSoonAt } = currentShiftSchedule;
    const now = new Date(shiftClock);
    const remainingMinutes = Math.ceil((endAt.getTime() - now.getTime()) / MINUTE_IN_MS);
    const pendingCheckpoints = checkpoints.filter(checkpoint => checkpoint.status === 'pending').length;
    const targetUserIds = getShipRecipients(operationalShipName, { includePic: true, includePetugas: true });

    logShiftNotificationDebug('evaluate', {
      shipName: operationalShipName,
      shiftKey: currentShiftMeta.key,
      shiftLabel: currentShiftMeta.label,
      now: now.toISOString(),
      remainingMinutes,
      pendingCheckpoints,
      targetUserIds,
      checkpointPendingAt: checkpointPendingAt.toISOString(),
      shiftEndingSoonAt: shiftEndingSoonAt.toISOString(),
    });

    if (now >= endAt) {
      logShiftNotificationDebug('skip-window', {
        shipName: operationalShipName,
        shiftKey: currentShiftMeta.key,
        remainingMinutes,
      });
      return;
    }

    const scheduledNotifications = [];

    if (now >= shiftEndingSoonAt) {
      scheduledNotifications.push({
        type: 'shift_ending_soon',
        title: 'Shift akan berakhir',
        message: 'Shift akan berakhir 15 menit lagi silahkan cek kembali laporan patroli anda',
        senderName: 'Sistem',
        senderRole: 'SYSTEM',
        targetUserIds,
        route: 'patrol/info',
        shipName: operationalShipName,
        shiftKey: currentShiftMeta.key,
        dedupeKey: `shift-ending-soon:${operationalShipName}:${currentShiftMeta.key}`,
        createdAt: shiftEndingSoonAt.toISOString(),
      });
    }

    if (pendingCheckpoints > 0 && now >= checkpointPendingAt) {
      scheduledNotifications.push({
        type: 'checkpoint_pending',
        title: 'Masih ada checkpoint pending',
        message: `${pendingCheckpoints} checkpoint belum dipatroli pada ${currentShiftMeta.label}.`,
        senderName: 'Sistem',
        senderRole: 'SYSTEM',
        targetUserIds,
        route: 'patrol/checkpoint',
        shipName: operationalShipName,
        shiftKey: currentShiftMeta.key,
        dedupeKey: `checkpoint-pending:${operationalShipName}:${currentShiftMeta.key}`,
        createdAt: checkpointPendingAt.toISOString(),
      });
    }

    appendNotifications(scheduledNotifications);
  }, [appendNotifications, checkpoints, currentShiftMeta, currentShiftSchedule, getShipRecipients, operationalShipName, shiftClock]);

  useEffect(() => {
    const persistedShiftMeta = getShiftMetaFromKey(activeShiftKey);
    if (!persistedShiftMeta || persistedShiftMeta.key === currentShiftMeta.key) return;

    const persistedShiftDefinition = getShiftDefinition(persistedShiftMeta.id);

    if (isLegacyShiftDefinition(persistedShiftDefinition)) {
      logCloudSyncDebug('skip-legacy-shift-history', {
        persistedShiftKey: persistedShiftMeta.key,
        currentShiftKey: currentShiftMeta.key,
      });
      setActiveShiftKey(previousKey => (
        previousKey === currentShiftMeta.key ? previousKey : currentShiftMeta.key
      ));
      return;
    }

    const persistedShiftStartAt = getShiftScheduleTimes(persistedShiftMeta).startAt.getTime();
    const currentShiftStartAt = getShiftScheduleTimes(currentShiftMeta).startAt.getTime();

    if (persistedShiftStartAt >= currentShiftStartAt) {
      logCloudSyncDebug('skip-future-shift-history', {
        persistedShiftKey: persistedShiftMeta.key,
        currentShiftKey: currentShiftMeta.key,
      });
      setActiveShiftKey(previousKey => (
        previousKey === currentShiftMeta.key ? previousKey : currentShiftMeta.key
      ));
      return;
    }

    logCloudSyncDebug('reconcile-shift-history', {
      persistedShiftKey: persistedShiftMeta.key,
      currentShiftKey: currentShiftMeta.key,
      shipCount: shipsData.length,
    });

    const nextHistoryBatch = [];
    let workingShiftMeta = persistedShiftMeta;
    let workingCheckpointsByShip = { ...checkpointsByShip };
    const resetTimestamp = new Date().toISOString();

    let iterations = 0;
    while (workingShiftMeta.key !== currentShiftMeta.key) {
      if (iterations++ > 31) {
        console.warn('MAX_ITERATIONS reached during shift reconciliation.', {
           persistedKey: persistedShiftMeta.key,
           currentKey: currentShiftMeta.key,
        });
        break;
      }
      shipsData.forEach((ship) => {
        const shipCheckpoints = workingCheckpointsByShip[ship.id] || createShipCheckpointCollection(ship);
        nextHistoryBatch.push(buildHistoryEntry({
          shiftMeta: workingShiftMeta,
          checkpoints: shipCheckpoints,
          ship,
          users: usersData,
          weatherInfo,
        }));
        workingCheckpointsByShip[ship.id] = resetCheckpointCollection(shipCheckpoints, {
          updatedAt: resetTimestamp,
          shiftKey: currentShiftMeta.key,
        });
      });
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
          createdAt: entry.createdAt,
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
          createdAt: entry.createdAt,
        });
      }

      return notificationsBatch;
    }));
    setCheckpointsByShip(workingCheckpointsByShip);
    setActiveForms({});
    setPendingPatrolCameraCapture(null);
    setSelectedReportDetail(null);
    setSelectedIncident(null);
    setActiveShiftKey(currentShiftMeta.key);
  }, [activeShiftKey, appendNotifications, checkpointsByShip, currentShiftMeta.key, getShipRecipients, shipsData, usersData, weatherInfo]);

  const updateOperationalShipCheckpoints = useCallback((updater) => {
    if (!operationalShip?.id) return;
    setCheckpointsByShip((previousState) => {
      const currentShipCheckpoints = previousState[operationalShip.id] || [];
      const nextShipCheckpoints = typeof updater === 'function'
        ? updater(currentShipCheckpoints)
        : updater;

      return {
        ...previousState,
        [operationalShip.id]: nextShipCheckpoints,
      };
    });
  }, [operationalShip?.id]);

  // Patrol handlers
  const handleActionClick = useCallback(async (id, type) => {
    if (!canPatrolCurrentShip) return;

    const nextForm = { type, penyebab: '', kejadian: '', tindakLanjut: '', photoUrl: null };
    if (shouldForcePatrolCameraCapture && type === 'aman') {
      setPendingPatrolCameraCapture({ id, type });
      return;
    }

    setActiveForms({ [id]: nextForm });
  }, [canPatrolCurrentShip, shouldForcePatrolCameraCapture]);
  const handleFormChange = useCallback((id, field, value) => { setActiveForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } })); }, []);
  const handlePhotoUpload = useCallback(async (id, isIncident = false, options = {}) => {
    const useCameraOnly = Boolean(options.cameraOnly);
    if (!isIncident && useCameraOnly && shouldForcePatrolCameraCapture) {
      const patrolType = activeForms[id]?.type || 'aman';
      setPendingPatrolCameraCapture({ id, type: patrolType });
      return;
    }
    const dataUrl = await pickLocalImage({ cameraOnly: useCameraOnly });
    if (!dataUrl) return;
    const url = await saveImageToDB(dataUrl);
    if(!url) return;
    if(isIncident) setIncidentForm(prev => ({...prev, photoUrl: url}));
    else setActiveForms(prev => ({ ...prev, [id]: { ...prev[id], photoUrl: url } }));
  }, [activeForms, shouldForcePatrolCameraCapture]);
  const handleSubmitPatrol = useCallback(async (id) => {
    if (!currentUserRecord || !operationalShip) return;
    const currentCheckpoint = checkpoints.find(checkpoint => String(checkpoint.id) === String(id));
    if (!currentCheckpoint) return;
    const formState = activeForms[id];
    if (!formState || submittingPatrolId === id) return;

    setSubmittingPatrolId(id);

    try {
      const now = new Date();
      const timeString = formatAppTime(now);
      const environmentSnapshot = await capturePatrolEnvironmentSnapshot(operationalShip);

    const submittedItem = {
      ...currentCheckpoint,
      incidentId: formState.type === 'temuan'
        ? `p-${currentCheckpoint.id}-${now.toISOString().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
        : null,
      status: 'completed',
      completedBy: currentUser,
      completedByUserId: currentUserRecord.id,
      time: timeString,
      completedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      shiftKey: currentShiftMeta.key,
      shipName: operationalShipName,
      shipSnapshot: environmentSnapshot.shipSnapshot,
      gpsSnapshot: environmentSnapshot.gpsSnapshot,
      weatherSnapshot: environmentSnapshot.weatherSnapshot,
      photoUrl: formState.photoUrl,
      resultType: formState.type,
      penyebab: sanitizeMultilineText(formState.penyebab, 240),
      kejadian: sanitizeMultilineText(formState.kejadian, 280),
      tindakLanjut: sanitizeMultilineText(formState.tindakLanjut, 240),
    };
    setActiveForms(prev => {
      updateOperationalShipCheckpoints(shipCheckpoints => shipCheckpoints.map((checkpoint) => (
        String(checkpoint.id) === String(id) ? submittedItem : checkpoint
      )));
      const newForms = { ...prev };
      delete newForms[id];
      return newForms;
    });
    setPendingPatrolCameraCapture(null);

    if (submittedItem?.resultType === 'temuan') {
      appendNotifications([{
        type: 'incident_created',
        title: 'Temuan patroli baru',
        message: `${submittedItem.name} dilaporkan sebagai temuan oleh ${currentUser}.`,
        senderName: currentUser,
        senderRole: currentUserRole,
        targetUserIds: getShipRecipients(operationalShipName, { includeAdmins: true, includePic: true, includePetugas: true }),
        route: 'incidents/detail',
        routeParams: { incidentId: submittedItem.incidentId },
        incidentId: submittedItem.incidentId,
        shipName: operationalShipName,
        createdAt: submittedItem.completedAt,
      }]);
    }
    } finally {
      setSubmittingPatrolId(previousId => (previousId === id ? null : previousId));
    }
  }, [activeForms, appendNotifications, checkpoints, currentShiftMeta.key, currentUser, currentUserRecord, currentUserRole, getShipRecipients, operationalShip, operationalShipName, submittingPatrolId, updateOperationalShipCheckpoints]);
  const handleDeleteReport = useCallback((id) => { 
    setConfirmDialog({ 
      title: 'Hapus Laporan', 
      message: 'Apakah Anda yakin ingin menghapus laporan patroli ini?', 
      confirmText: 'YA, HAPUS',
      cancelText: 'BATAL',
      onConfirm: () => { 
        updateOperationalShipCheckpoints(prev => prev.map(c => (
          String(c.id) === String(id) ? resetCheckpointForShift(c, { shiftKey: currentShiftMeta.key }) : c
        )));
        setSelectedReportDetail(null); 
      } 
    }); 
  }, [currentShiftMeta.key, updateOperationalShipCheckpoints]);
  const handleAddReportGalleryPhoto = useCallback(async (reportId) => {
    if (!reportId || selectedReportDetail?.readOnly) return;

    const dataUrl = await pickLocalImage();
    if (!dataUrl) return;

    const photoUrl = await saveImageToDB(dataUrl);
    if (!photoUrl) return;

    const galleryPhoto = createCheckpointGalleryPhotoRecord(photoUrl, {
      author: currentUser || selectedReportDetail?.completedBy || '',
    });

    updateOperationalShipCheckpoints((previousCheckpoints) => previousCheckpoints.map((checkpoint) => (
      String(checkpoint.id) === String(reportId)
        ? {
          ...checkpoint,
          updatedAt: galleryPhoto.createdAt,
          galleryPhotos: [...(checkpoint.galleryPhotos || []), galleryPhoto],
        }
        : checkpoint
    )));

    setSelectedReportDetail((previousReport) => (
      previousReport && String(previousReport.id) === String(reportId)
        ? {
          ...previousReport,
          updatedAt: galleryPhoto.createdAt,
          galleryPhotos: [...(previousReport.galleryPhotos || []), galleryPhoto],
        }
        : previousReport
    ));
  }, [currentUser, selectedReportDetail?.completedBy, selectedReportDetail?.readOnly, updateOperationalShipCheckpoints]);
  const handleOpenPatrolResult = useCallback((item) => {
    setActiveForms({});
    setPendingPatrolCameraCapture(null);
    const isReadOnly = Boolean(item?.readOnly || item?.historyId || selectedHistoryEntry);
    if (item.resultType === 'temuan') {
      setSelectedReportDetail(null);
      setSelectedIncident({
        id: createPatrolIncidentId(item),
        date: item.date || selectedHistoryEntry?.date || formatAppDate(),
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
    setSelectedIncident(null);
    setSelectedReportDetail({
      ...item,
      shipName: item.shipName || selectedHistoryEntry?.ship || operationalShipName,
      date: item.date || selectedHistoryEntry?.date || formatAppDate(),
      shipSnapshot: item.shipSnapshot || null,
      gpsSnapshot: item.gpsSnapshot || null,
      weatherSnapshot: item.weatherSnapshot || null,
      readOnly: isReadOnly,
    });
  }, [selectedHistoryEntry, operationalShipName, setActiveForms, setSelectedIncident, setSelectedReportDetail]);
  const handleAddCustomPatrolNode = useCallback(() => {
    if (!canAddTemporaryPatrolNode || !operationalShip) return;

    const safeName = sanitizeText(newCustomNode, 80);
    if (!safeName) return;

    const nameKey = createCheckpointNameKey(safeName);
    if (checkpoints.some(checkpoint => createCheckpointNameKey(checkpoint.name) === nameKey)) {
      setNewCustomNode('');
      return;
    }

    updateOperationalShipCheckpoints((previousCheckpoints) => ([
      ...previousCheckpoints,
      {
        id: `${operationalShip.id}::temporary::${Date.now()}`,
        name: safeName,
        desc: 'Titik tambahan sementara untuk shift berjalan.',
        status: 'pending',
        shipId: operationalShip.id,
        shipName: operationalShip.name,
        isTemporaryShiftNode: true,
        createdInShiftKey: currentShiftMeta.key,
      },
    ]));
    setNewCustomNode('');
  }, [canAddTemporaryPatrolNode, checkpoints, currentShiftMeta.key, newCustomNode, operationalShip, updateOperationalShipCheckpoints]);
  const closePatrolCameraCapture = useCallback(() => {
    setPendingPatrolCameraCapture(null);
  }, []);
  const handlePatrolCameraCapture = useCallback(async (dataUrl) => {
    const captureRequest = pendingPatrolCameraCapture;
    if (!captureRequest?.id || !captureRequest?.type || !dataUrl) return;
    const url = await saveImageToDB(dataUrl);
    if (!url) return;
    setActiveForms({
      [captureRequest.id]: {
        type: captureRequest.type,
        penyebab: '',
        kejadian: '',
        tindakLanjut: '',
        photoUrl: url,
      },
    });
    setPendingPatrolCameraCapture(null);
  }, [pendingPatrolCameraCapture]);

  // Incident handlers
  const openIncidentModal = useCallback(() => { setIncidentForm(createIncidentFormState()); setShowIncidentModal(true); }, []);
  const closeIncidentModal = useCallback(() => { setShowIncidentModal(false); setIncidentForm(createIncidentFormState()); }, []);
  const handleSubmitIncident = useCallback(() => {
    if (!currentUserRecord) return;
    const loc = incidentForm.locType === 'custom' ? sanitizeText(incidentForm.customLocation, 80) : sanitizeText(incidentForm.location, 80);
    if (!loc || !sanitizeMultilineText(incidentForm.deskripsi, 320)) return;
    const now = new Date();
    const createdAt = now.toISOString();
    const newIncident = { ...incidentForm, id: Date.now(), createdAt, time: formatAppTime(now), date: formatAppDate(now), reportedBy: currentUser, shipName: operationalShipName, location: loc, customLocation: incidentForm.locType === 'custom' ? loc : '', photoUrl: incidentForm.photoUrl, penyebab: sanitizeMultilineText(incidentForm.penyebab, 240), deskripsi: sanitizeMultilineText(incidentForm.deskripsi, 320), tindakLanjut: sanitizeMultilineText(incidentForm.tindakLanjut, 240) };
    setIncidentsData(prev => [newIncident, ...prev]);
    appendNotifications([{
      type: 'incident_created',
      title: 'Laporan temuan baru',
      message: `${loc} dilaporkan sebagai temuan baru oleh ${currentUser}.`,
      senderName: currentUser,
      senderRole: currentUserRole,
      targetUserIds: getShipRecipients(operationalShipName, { includeAdmins: true, includePic: true, includePetugas: true }),
      route: 'incidents/detail',
      routeParams: { incidentId: newIncident.id },
      incidentId: newIncident.id,
      shipName: operationalShipName,
      createdAt,
    }]);
    closeIncidentModal();
  }, [appendNotifications, closeIncidentModal, currentUser, currentUserRecord, currentUserRole, getShipRecipients, incidentForm, operationalShipName]);

  // Ship handlers
  const activeShip = useMemo(() => shipsData.find(s => s.id === activeShipId), [shipsData, activeShipId]);
  const updateActiveShip = useCallback((updates) => {
    if (!isAdmin || !activeShipId) return;
    setShipsData(prev => prev.map((ship) => {
      if (ship.id !== activeShipId) return ship;
      return normalizeShipRecord({ ...ship, ...updates });
    }));
  }, [isAdmin, activeShipId]);
  const openShipDocForm = useCallback(() => {
    if (!isAdmin || !activeShip) return;
    setNewShipDoc(createShipDocumentState());
    setShowShipDocForm(true);
  }, [isAdmin, activeShip]);
  const closeShipDocForm = useCallback(() => {
    setShowShipDocForm(false);
    setNewShipDoc(createShipDocumentState());
  }, []);
  const handleTogglePersonnel = useCallback((userId) => { 
    if (!isAdmin || !activeShip) return; 
    const targetArray = scheduleMonth === 'current' ? activeShip.personnel : activeShip.personnelNextMonth; 
    const isAssigned = targetArray.includes(userId); 
    if (isAssigned) { 
      updateActiveShip({ [scheduleMonth === 'current' ? 'personnel' : 'personnelNextMonth']: targetArray.filter(id => id !== userId) }); 
      if(scheduleMonth === 'current') setUsersData(prev => prev.map(u => u.id === userId ? {...u, shipAssigned: null, status: 'off-duty'} : u)); 
    } else { 
      const user = usersData.find(u => u.id === userId);
      setAssignPopupData({ userId, name: user?.name, role: user?.role, scheduleType: scheduleMonth });
      setShowAssignPopup(true);
    } 
  }, [isAdmin, activeShip, scheduleMonth, updateActiveShip, usersData]);

  const handleConfirmAssign = useCallback((userId, startDate, endDate, isTBC) => {
    if (!isAdmin || !activeShip || !assignPopupData) return;
    
    const scheduleType = assignPopupData.scheduleType || 'current';
    
    // Automatically route to 'next assignment' or 'current' based on the date,
    // falling back to the tab they initiated it from if no start date is provided.
    const todayStr = new Date().toISOString().split('T')[0];
    let finalScheduleType = scheduleType;
    
    if (startDate && startDate > todayStr) {
      finalScheduleType = 'next';
    } else if (startDate && startDate <= todayStr) {
      finalScheduleType = 'current';
    }
    
    let newPersonnel = activeShip.personnel.filter(id => id !== userId);
    let newNextMonth = activeShip.personnelNextMonth.filter(id => id !== userId);
    
    if (finalScheduleType === 'current') {
      newPersonnel.push(userId);
    } else {
      newNextMonth.push(userId);
    }
    
    updateActiveShip({ 
      personnel: newPersonnel,
      personnelNextMonth: newNextMonth,
      personnelSchedules: {
        ...(activeShip.personnelSchedules || {}),
        [userId]: {
          ...(activeShip.personnelSchedules?.[userId] || {}),
          startDate: startDate,
          endDate: endDate,
          isTBC: isTBC
        }
      }
    });

    if (finalScheduleType === 'current') {
      setUsersData(prev => prev.map(u => u.id === userId ? {...u, shipAssigned: activeShip.name, status: 'active'} : u));
    } else {
      setUsersData(prev => prev.map(u => u.id === userId && u.status !== 'active' ? {...u, shipAssigned: null, status: 'off-duty'} : u));
    }
    
    setShowAssignPopup(false);
    setAssignPopupData(null);
  }, [isAdmin, activeShip, updateActiveShip, assignPopupData]);
  const handleAddShipCp = useCallback(() => {
    if (!isAdmin || !activeShip) return;
    const safeName = sanitizeText(newShipCp.name, 80);
    if (!safeName) return;
    if (activeShip.customCheckpoints.some(checkpoint => createCheckpointNameKey(checkpoint.name) === createCheckpointNameKey(safeName))) {
      setNewShipCp({ name: '', desc: '' });
      return;
    }
    updateActiveShip({
      customCheckpoints: [
        ...activeShip.customCheckpoints,
        { name: safeName, desc: sanitizeMultilineText(newShipCp.desc, 140), isDefault: false },
      ],
    });
    setNewShipCp({name: '', desc: ''});
  }, [isAdmin, activeShip, newShipCp, updateActiveShip]);
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
          docDate: sanitizeText(newShipDoc.docDate, 20),
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
        const deletedAt = new Date().toISOString();
        setDeletedRecords(previousDeletedRecords => markDeletedRecord(previousDeletedRecords, 'ships', id, deletedAt));
        setShipsData(prev => prev
          .filter(s => s.id !== id)
          .map((ship) => normalizeShipRecord({
            ...ship,
            sosRecipientShipIds: (ship.sosRecipientShipIds || []).filter((shipId) => shipId !== id),
          })));
        if (activeShipId === id) setActiveShipId(null);
        closeShipDocForm();
      }
    });
  }, [isAdmin, shipsData, activeShipId, closeShipDocForm]);

  // User handlers
  const clearUserManagementFeedback = useCallback(() => {
    setUserFormError('');
    setUserFormNotice('');
  }, []);
  const handleAuthPhotoUpload = useCallback(async () => {
    const dataUrl = await pickLocalImage();
    if (!dataUrl) return;
    const url = await saveImageToDB(dataUrl);
    if (url) {
      setAuthForm(prev => ({ ...prev, photoUrl: url }));
    }
  }, []);
  const handleUserPhotoUpload = useCallback(async () => { const dataUrl = await pickLocalImage(); if (!dataUrl) return; const url = await saveImageToDB(dataUrl); if (url) setUserFormData(prev => ({...prev, photoUrl: url})); }, []);
  const handleSaveUser = useCallback(async () => {
    if (!isAdmin) return;

    clearUserManagementFeedback();
    const safeName = sanitizeText(userFormData.name, 80);
    const safeEmail = sanitizeEmail(userFormData.email);
    const passwordInput = sanitizeText(userFormData.password, 120);

    if (!safeName || !safeEmail) {
      setUserFormError('Nama dan email user wajib diisi.');
      return;
    }
    if (safeEmail && usersData.some(u => (u.email || '').toLowerCase() === safeEmail)) {
      setUserFormError('Email user sudah dipakai oleh akun lain.');
      return;
    }
    if (passwordInput && passwordInput.length < 8) {
      setUserFormError('Password user minimal 8 karakter.');
      return;
    }

    let authPayload = {
      hasCredential: false,
      passwordSalt: '',
      passwordHash: '',
      authProvider: 'none',
      firebaseUid: null,
    };

    if (passwordInput) {
      if (isFirebaseAuthEnabled) {
        try {
          const provisioned = await provisionFirebaseEmailUser({
            email: safeEmail,
            password: passwordInput,
            displayName: safeName,
          });
          authPayload = {
            hasCredential: false,
            passwordSalt: '',
            passwordHash: '',
            authProvider: 'firebase',
            firebaseUid: provisioned.user.uid,
          };
          setUserFormNotice('User baru berhasil dibuat dan langsung terhubung ke Firebase Auth.');
        } catch (error) {
          setUserFormError(getFirebaseAuthErrorMessage(error));
          return;
        }
      } else {
        const credential = await createPasswordCredential(passwordInput);
        authPayload = {
          hasCredential: credential.hasCredential,
          passwordSalt: credential.passwordSalt,
          passwordHash: credential.passwordHash,
          authProvider: 'legacy',
          firebaseUid: null,
        };
        setUserFormNotice('Firebase Auth belum aktif, jadi user disimpan dengan kredensial lokal.');
      }
    } else {
      setUserFormNotice('User disimpan tanpa password. Kredensial bisa diaktifkan nanti dari panel admin atau register mandiri.');
    }

    const role = ACCESS_ROLE_VALUES.includes(userFormData.role) ? userFormData.role : ACCESS_ROLES.PETUGAS;
    const newUser = {
      id: `u${Date.now()}`,
      ...userFormData,
      name: safeName,
      role,
      workerNumber: sanitizeText(userFormData.workerNumber, 40),
      email: safeEmail,
      password: '',
      ...authPayload,
      phone: sanitizePhone(userFormData.phone),
      address: sanitizeMultilineText(userFormData.address, 180),
      emergencyName: sanitizeText(userFormData.emergencyName, 80),
      emergencyContact: sanitizePhone(userFormData.emergencyContact),
      emergencyRelation: sanitizeText(userFormData.emergencyRelation, 40),
      officeAddress: sanitizeMultilineText(userFormData.officeAddress, 180),
      photoUrl: userFormData.photoUrl || createUserAvatar(safeName, usersData.length),
      status: role === ACCESS_ROLES.PETUGAS ? 'off-duty' : 'active',
      shipAssigned: null,
    };
    const nextUserRecord = normalizeUserRecord(newUser, usersData.length);
    setUsersData(prev => [...prev, nextUserRecord]);
    setShowUserForm(false);
    setUserFormData(createUserFormState());
    setSelectedUser(nextUserRecord);
  }, [clearUserManagementFeedback, isAdmin, userFormData, usersData]);
  const handleUpdateUser = useCallback(async () => {
    if (!selectedUser?.id) return;
    const isEditingOwnProfile = selectedUser.id === sessionUserId;
    if (!isAdmin && !isEditingOwnProfile) return;

    clearUserManagementFeedback();
    const currentRecord = usersData.find(u => u.id === selectedUser.id) || null;
    const isFirebaseUser = isFirebaseManagedUser(currentRecord || selectedUser);
    const nextEmail = isFirebaseUser ? sanitizeEmail(currentRecord?.email || selectedUser.email || '') : sanitizeEmail(selectedUser.email || '');
    const safeName = sanitizeText(selectedUser.name, 80);

    if (!safeName || !nextEmail) {
      setUserFormError('Nama dan email user wajib diisi.');
      return;
    }
    if (nextEmail && usersData.some(u => u.id !== selectedUser.id && (u.email || '').toLowerCase() === nextEmail)) {
      setUserFormError('Email user sudah dipakai oleh akun lain.');
      return;
    }

    const passwordInput = sanitizeText(selectedUser.password || '', 120);
    if (passwordInput && passwordInput.length < 8) {
      setUserFormError('Password user minimal 8 karakter.');
      return;
    }

    let authPayload = null;
    if (!isFirebaseUser && passwordInput) {
      if (isFirebaseAuthEnabled) {
        try {
          const provisioned = await provisionFirebaseEmailUser({
            email: nextEmail,
            password: passwordInput,
            displayName: safeName,
          });
          authPayload = {
            hasCredential: false,
            passwordSalt: '',
            passwordHash: '',
            authProvider: 'firebase',
            firebaseUid: provisioned.user.uid,
          };
          setUserFormNotice('User berhasil dihubungkan ke Firebase Auth.');
        } catch (error) {
          setUserFormError(getFirebaseAuthErrorMessage(error));
          return;
        }
      } else {
        const credential = await createPasswordCredential(passwordInput);
        authPayload = {
          hasCredential: credential.hasCredential,
          passwordSalt: credential.passwordSalt,
          passwordHash: credential.passwordHash,
          authProvider: 'legacy',
          firebaseUid: null,
        };
        setUserFormNotice('Firebase Auth belum aktif, jadi password baru disimpan secara lokal.');
      }
    }

    const selectedUserIndex = Math.max(usersData.findIndex(u => u.id === selectedUser.id), 0);
    const preservedRole = currentRecord?.role || ACCESS_ROLES.PETUGAS;
    const nextRole = isAdmin
      ? (ACCESS_ROLE_VALUES.includes(selectedUser.role) ? selectedUser.role : ACCESS_ROLES.PETUGAS)
      : preservedRole;
    const nextShipAssigned = selectedUser.shipAssigned || null;
    const previewUser = normalizeUserRecord({
      ...(currentRecord || {}),
      ...selectedUser,
      name: safeName,
      role: nextRole,
      email: nextEmail,
      password: '',
      hasCredential: isFirebaseUser ? false : (authPayload?.hasCredential ?? currentRecord?.hasCredential ?? false),
      passwordSalt: isFirebaseUser ? '' : (authPayload?.passwordSalt ?? currentRecord?.passwordSalt ?? ''),
      passwordHash: isFirebaseUser ? '' : (authPayload?.passwordHash ?? currentRecord?.passwordHash ?? ''),
      authProvider: isFirebaseUser ? 'firebase' : (authPayload?.authProvider ?? currentRecord?.authProvider ?? 'none'),
      firebaseUid: isFirebaseUser ? (currentRecord?.firebaseUid || selectedUser.firebaseUid || null) : (authPayload?.firebaseUid ?? currentRecord?.firebaseUid ?? null),
      shipAssigned: nextShipAssigned,
      status: nextRole === ACCESS_ROLES.PETUGAS ? (nextShipAssigned ? (selectedUser.status || currentRecord?.status || 'active') : 'off-duty') : (selectedUser.status || currentRecord?.status || 'active'),
      workerNumber: sanitizeText(selectedUser.workerNumber || '', 40),
      phone: sanitizePhone(selectedUser.phone || ''),
      address: sanitizeMultilineText(selectedUser.address || '', 180),
      emergencyName: sanitizeText(selectedUser.emergencyName || '', 80),
      emergencyContact: sanitizePhone(selectedUser.emergencyContact || ''),
      emergencyRelation: sanitizeText(selectedUser.emergencyRelation || '', 40),
      officeAddress: sanitizeMultilineText(selectedUser.officeAddress || '', 180),
      photoUrl: selectedUser.photoUrl || currentRecord?.photoUrl || createUserAvatar(safeName, selectedUserIndex),
    }, selectedUserIndex);

    setUsersData(prev => prev.map((u, index) => {
      if (u.id !== selectedUser.id) return u;
      const nextUser = {
        ...u,
        ...previewUser,
      };
      return normalizeUserRecord(nextUser, index);
    }));
    setSelectedUser({ ...previewUser, password: '' });
  }, [clearUserManagementFeedback, isAdmin, selectedUser, sessionUserId, usersData]);
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
        const deletedAt = new Date().toISOString();
        setDeletedRecords(previousDeletedRecords => markDeletedRecord(previousDeletedRecords, 'users', id, deletedAt));
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
    const now = new Date();
    const createdAt = now.toISOString();
    const time = formatAppTime(now);
    const date = formatAppDate(now);
    setIncidentMeta(prev => ({ ...prev, [incidentId]: { ...prev[incidentId], status: prev[incidentId]?.status || 'open', progress: [...(prev[incidentId]?.progress || []), { ...newProgress, comment: sanitizeMultilineText(newProgress.comment, 240), photoUrl: newProgress.photoUrl, time, date, author: currentUser }] } }));
    appendNotifications([{
      type: 'incident_progress_updated',
      title: 'Update temuan baru',
      message: `${incident?.location || 'Temuan'} mendapat update baru dari ${currentUser}.`,
      senderName: currentUser,
      senderRole: currentUserRole,
      targetUserIds: getShipRecipients(incident?.shipName || operationalShipName, { includeAdmins: true, includePic: true, includePetugas: true, includeUserIds: incident?.reportedBy ? usersData.filter(user => user.name === incident.reportedBy).map(user => user.id) : [] }),
      route: 'incidents/detail',
      routeParams: { incidentId },
      incidentId,
      shipName: incident?.shipName || operationalShipName,
      createdAt,
    }]);
    setNewProgress({ comment: '', photoUrl: null });
  }, [allIncidents, appendNotifications, canManageIncident, currentUser, currentUserRole, getShipRecipients, newProgress, operationalShipName, selectedIncident, usersData]);
  const handleAddIncidentDocumentation = useCallback(async (incidentId) => {
    const incident = allIncidents.find(item => item.id === incidentId) || selectedIncident;
    if (!canManageIncident(incident)) return;
    const dataUrl = await pickLocalImage();
    if (!dataUrl) return;
    const photoUrl = await saveImageToDB(dataUrl);
    if (!photoUrl) return;

    const now = new Date();
    const createdAt = now.toISOString();
    const time = formatAppTime(now);
    const date = formatAppDate(now);

    setIncidentMeta((previousMeta) => ({
      ...previousMeta,
      [incidentId]: {
        ...previousMeta[incidentId],
        status: previousMeta[incidentId]?.status || 'open',
        documentation: [
          {
            id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            photoUrl,
            createdAt,
            date,
            time,
            author: currentUser,
          },
          ...(previousMeta[incidentId]?.documentation || []),
        ],
      },
    }));
  }, [allIncidents, canManageIncident, currentUser, selectedIncident]);
  const handleUpdateIncidentInfo = useCallback((incidentId, updates) => {
    const incident = allIncidents.find(item => item.id === incidentId) || selectedIncident;
    if (!incident || !canManageIncident(incident)) return false;

    const nextIncidentInfo = {
      deskripsi: sanitizeMultilineText(updates?.deskripsi || '', 320),
      penyebab: sanitizeMultilineText(updates?.penyebab || '', 240),
      tindakLanjut: sanitizeMultilineText(updates?.tindakLanjut || '', 240),
    };

    setIncidentMeta((previousMeta) => ({
      ...previousMeta,
      [incidentId]: {
        ...previousMeta[incidentId],
        infoOverrides: nextIncidentInfo,
      },
    }));

    if (!incident.readOnly && typeof incidentId === 'string' && incidentId.startsWith('p-')) {
      const checkpointId = incidentId.replace('p-', '');
      setCheckpointsByShip((previousState) => Object.fromEntries(
        Object.entries(previousState).map(([shipId, shipCheckpoints]) => ([
          shipId,
          shipCheckpoints.map((checkpoint) => (
            String(checkpoint.id) === String(checkpointId) && !checkpoint.readOnly
              ? {
                  ...checkpoint,
                  kejadian: nextIncidentInfo.deskripsi,
                  penyebab: nextIncidentInfo.penyebab,
                  tindakLanjut: nextIncidentInfo.tindakLanjut,
                }
              : checkpoint
          )),
        ])),
      ));
    } else if (!incident.readOnly) {
      setIncidentsData((previousIncidents) => previousIncidents.map((entry) => (
        entry.id === incidentId
          ? {
              ...entry,
              deskripsi: nextIncidentInfo.deskripsi,
              penyebab: nextIncidentInfo.penyebab,
              tindakLanjut: nextIncidentInfo.tindakLanjut,
            }
          : entry
      )));
    }

    setSelectedIncident((previousIncident) => (
      previousIncident?.id === incidentId
        ? { ...previousIncident, ...nextIncidentInfo }
        : previousIncident
    ));

    return true;
  }, [allIncidents, canManageIncident, selectedIncident]);
  const handleCloseIncident = useCallback((incidentId) => { 
    const incident = allIncidents.find(item => item.id === incidentId) || selectedIncident; 
    if (!canCloseIncident(incident)) return; 
    setConfirmDialog({ 
      title: incident?.isSOS ? 'Tutup Laporan SOS' : 'Tutup Laporan', 
      message: incident?.isSOS ? 'Apakah Anda yakin kondisi SOS ini sudah selesai ditangani?' : 'Apakah Anda yakin masalah ini sudah selesai diselesaikan?', 
      confirmText: 'YA, TUTUP',
      cancelText: 'BELUM',
      onConfirm: () => {
        const createdAt = new Date().toISOString();
        setIncidentMeta(prev => ({ ...prev, [incidentId]: { ...(prev[incidentId] || {}), status: 'closed' } }));
        if (incident?.isSOS) {
          const resolvedSOS = {
            ...(activeSOSAlert?.id === incidentId ? activeSOSAlert : incident),
            status: 'resolved',
            resolvedAt: createdAt,
            resolvedBy: currentUser || 'Sistem',
          };
          setActiveSOSAlert((previousAlert) => (
            previousAlert?.id === incidentId ? null : previousAlert
          ));
          setSosHistory((previousHistory) => previousHistory.map((entry) => (
            entry.id === incidentId ? { ...entry, ...resolvedSOS } : entry
          )));
        }
        appendNotifications([{
          type: incident?.isSOS ? 'sos_closed' : 'incident_closed',
          title: incident?.isSOS ? 'SOS ditutup' : 'Temuan ditutup',
          message: `${incident?.location || (incident?.isSOS ? 'SOS' : 'Temuan')} telah ditutup oleh ${currentUser}.`,
          senderName: currentUser,
          senderRole: currentUserRole,
          targetUserIds: getShipRecipients(incident?.shipName || operationalShipName, { includeAdmins: true, includePic: true, includePetugas: true, includeUserIds: incident?.reportedBy ? usersData.filter(user => user.name === incident.reportedBy).map(user => user.id) : [] }),
          route: 'incidents/detail',
          routeParams: { incidentId },
          incidentId,
          shipName: incident?.shipName || operationalShipName,
          createdAt,
        }]);
      } 
    }); 
  }, [activeSOSAlert, allIncidents, appendNotifications, canCloseIncident, currentUser, currentUserRole, getShipRecipients, operationalShipName, selectedIncident, usersData]);
  const handleDeleteIncident = useCallback((incidentId) => {
    if (!isAdmin) return;

    const incident = allIncidents.find(item => item.id === incidentId) || selectedIncident;
    if (!incident) return;

    setConfirmDialog({
      title: incident.isSOS ? 'Hapus SOS' : 'Hapus Temuan',
      message: `Anda yakin ingin menghapus ${incident.isSOS ? 'SOS' : 'temuan'} ${incident.location || 'ini'}?`,
      confirmText: 'YA, HAPUS',
      cancelText: 'BATAL',
      onConfirm: () => {
        if (incident.isSOS) {
          setActiveSOSAlert((previousAlert) => (
            previousAlert?.id === incidentId ? null : previousAlert
          ));
          setSosHistory((previousHistory) => previousHistory.filter((entry) => entry.id !== incidentId));
          setIncidentMeta((previousMeta) => ({
            ...previousMeta,
            [incidentId]: {
              ...(previousMeta[incidentId] || {}),
              deleted: true,
            },
          }));
        } else if (incident.isPatrol) {
          let removedFromActiveShift = false;

          setCheckpointsByShip((previousState) => Object.fromEntries(
            Object.entries(previousState).map(([shipId, shipCheckpoints]) => ([
              shipId,
              shipCheckpoints.map((checkpoint) => {
                if (createPatrolIncidentId(checkpoint) !== incidentId) return checkpoint;
                removedFromActiveShift = true;
                return resetCheckpointForShift(checkpoint, { shiftKey: currentShiftMeta.key });
              }),
            ])),
          ));

          if (!removedFromActiveShift) {
            setIncidentMeta((previousMeta) => ({
              ...previousMeta,
              [incidentId]: {
                ...(previousMeta[incidentId] || {}),
                deleted: true,
              },
            }));
          } else {
            setIncidentMeta((previousMeta) => {
              if (!previousMeta[incidentId]) return previousMeta;
              const nextMeta = { ...previousMeta };
              delete nextMeta[incidentId];
              return nextMeta;
            });
          }
        } else {
          const deletedAt = new Date().toISOString();
          setDeletedRecords((previousDeletedRecords) => markDeletedRecord(previousDeletedRecords, 'incidents', incidentId, deletedAt));
          setIncidentsData((previousIncidents) => previousIncidents.filter((entry) => entry.id !== incidentId));
          setIncidentMeta((previousMeta) => {
            if (!previousMeta[incidentId]) return previousMeta;
            const nextMeta = { ...previousMeta };
            delete nextMeta[incidentId];
            return nextMeta;
          });
        }

        setSelectedIncident((previousIncident) => (
          previousIncident?.id === incidentId ? null : previousIncident
        ));
      },
    });
  }, [allIncidents, currentShiftMeta.key, isAdmin, selectedIncident]);
  const handlePhotoProgress = useCallback(async () => { const dataUrl = await pickLocalImage(); if(!dataUrl) return; const url = await saveImageToDB(dataUrl); if (url) setNewProgress(prev => ({ ...prev, photoUrl: url })); }, []);
  const handleUpdateIncidentPhoto = useCallback(async (incidentId) => {
    const dataUrl = await pickLocalImage();
    if (!dataUrl) return;
    const url = await saveImageToDB(dataUrl);
    if (!url) return;
    if (typeof incidentId === 'string' && incidentId.startsWith('p-')) {
      const checkpointId = incidentId.replace('p-', '');
      setCheckpointsByShip(previousState => Object.fromEntries(
        Object.entries(previousState).map(([shipId, shipCheckpoints]) => ([
          shipId,
          shipCheckpoints.map(checkpoint => (
            String(checkpoint.id) === String(checkpointId)
              ? { ...checkpoint, photoUrl: url }
              : checkpoint
          )),
        ])),
      ));
    } else {
      setIncidentsData(prev => prev.map(inc => inc.id === incidentId ? { ...inc, photoUrl: url } : inc));
    }
    setSelectedIncident(prev => prev && prev.id === incidentId ? { ...prev, photoUrl: url } : prev);
  }, []);

  // Ship form handlers
  const handleSaveShip = useCallback(() => {
    if (!isAdmin) return;
    const safeName = sanitizeText(shipFormData.name, 80);
    if (!safeName) return;
    const newShip = normalizeShipRecord({
      id: 's' + Date.now(),
      ...shipFormData,
      name: safeName,
      imoNumber: sanitizeText(shipFormData.imoNumber, 20),
      routeLoading: sanitizeText(shipFormData.routeLoading, 100),
      routeDischarge: sanitizeText(shipFormData.routeDischarge, 100),
      cargoType: sanitizeText(shipFormData.cargoType, 80),
      cargoAmount: sanitizeText(shipFormData.cargoAmount, 40),
      defaultCheckpointsInitialized: true,
      customCheckpoints: normalizeShipCheckpointDefinitions(shipFormData.customCheckpoints),
      lat: '-6.0000',
      lng: '106.0000',
      personnel: [],
      personnelNextMonth: [],
      documents: [],
      photoUrl: shipFormData.photoUrl || createPosterDataUrl(safeName, 'Armada Lokal', 2, false),
    });
    setShipsData(prev => [...prev, newShip]);
    setShowShipForm(false);
    setShipFormData(createShipFormState());
    setNewCheckpoint('');
  }, [isAdmin, shipFormData]);
  const handleAddCheckpointToForm = useCallback(() => {
    setNewCheckpoint((previousValue) => {
      const safeName = sanitizeText(previousValue, 80);
      if (!safeName) return previousValue;
      setShipFormData((formData) => {
        if (formData.customCheckpoints.some(checkpoint => createCheckpointNameKey(checkpoint.name) === createCheckpointNameKey(safeName))) {
          return formData;
        }
        return {
          ...formData,
          customCheckpoints: [
            ...formData.customCheckpoints,
            { name: safeName, desc: '', isDefault: false },
          ],
        };
      });
      return '';
    });
  }, []);
  const handleRemoveCheckpointFromForm = useCallback((index) => {
    setShipFormData((previousFormData) => {
      return {
        ...previousFormData,
        customCheckpoints: previousFormData.customCheckpoints.filter((_, checkpointIndex) => checkpointIndex !== index),
      };
    });
  }, []);

  // Auth handlers
  const resetAuthSession = useCallback((message = 'Sesi Anda telah berakhir. Silakan login kembali.') => {
    setSessionUserId(null);
    setCurrentPage('home');
    setActiveShipId(null);
    setSelectedIncident(null);
    setSelectedReportDetail(null);
    setSelectedUser(null);
    setSelectedHistoryId(null);
    setShowUserForm(false);
    setShowShipForm(false);
    setShowShipDocForm(false);
    setShowNotificationsDropdown(false);
    setNotificationReturnPage('home');
    hasAppliedRoleLandingRef.current = false;
    setActiveForms({});
    setPendingPatrolCameraCapture(null);
    setNewProgress({ comment: '', photoUrl: null });
    setNewShipDoc(createShipDocumentState());
    setAuthMode('login');
    setAuthError('');
    setAuthNotice(message);
    setAuthForm(createAuthFormState());
  }, []);
  const handleLogout = useCallback(async (message = 'Sesi Anda telah berakhir. Silakan login kembali.') => {
    if (firebaseAuthUser) {
      try {
        await logoutFirebaseUser();
      } catch (error) {
        console.error('Gagal logout Firebase', error);
      }
    }
    resetAuthSession(message);
  }, [firebaseAuthUser, resetAuthSession]);
  const handleLogin = useCallback(async () => {
    const safeEmail = sanitizeEmail(authForm.email);
    const passwordInput = sanitizeText(authForm.password, 120);
    if (!safeEmail || !passwordInput) {
      setAuthError('Email dan password wajib diisi.');
      return;
    }

    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const localUser = usersData.find(item => (item.email || '').toLowerCase() === safeEmail) || null;
      if (isFirebaseAuthEnabled) {
        try {
          const credential = await loginWithFirebaseEmail(safeEmail, passwordInput);
          let resolvedUser = localUser;

          if (!resolvedUser) {
            resolvedUser = createFirebaseBackedUserRecord(credential.user, usersData);
            setUsersData(prev => [...prev, resolvedUser]);
          }

          if (!canUserAccessApplication(resolvedUser)) {
            await logoutFirebaseUser();
            setAuthError('Petugas off-duty atau belum punya penugasan kapal tidak bisa login.');
            return;
          }

          const landingPage = getDefaultPageForRole(resolvedUser.role);
          setSessionUserId(resolvedUser.id);
          setCurrentPage(landingPage);
          setActiveShipId(null);
          setNotificationReturnPage(landingPage);
          hasAppliedRoleLandingRef.current = true;
          setAuthMode('login');
          setAuthForm(createAuthFormState());
          return;
        } catch (error) {
          const canFallbackToLegacy = Boolean(
            localUser
            && !isFirebaseManagedUser(localUser)
            && localUser.hasCredential
            && localUser.passwordHash
            && localUser.passwordSalt,
          );

          if (!canFallbackToLegacy) {
            setAuthError(getFirebaseAuthErrorMessage(error));
            return;
          }
        }
      }

      if (!localUser) {
        setAuthError('Akun tidak ditemukan.');
        return;
      }
      if (!localUser.hasCredential || !localUser.passwordHash || !localUser.passwordSalt) {
        setAuthError('Akun ini belum punya password aktif. Minta admin untuk mengatur ulang kredensial.');
        return;
      }

      const isValid = await verifyPasswordCredential(localUser, passwordInput);
      if (!isValid) {
        setAuthError('Password yang Anda masukkan tidak cocok.');
        return;
      }
      if (!canUserAccessApplication(localUser)) {
        setAuthError('Petugas off-duty atau belum punya penugasan kapal tidak bisa login.');
        return;
      }

      const landingPage = getDefaultPageForRole(localUser.role);
      setSessionUserId(localUser.id);
      setCurrentPage(landingPage);
      setActiveShipId(null);
      setNotificationReturnPage(landingPage);
      hasAppliedRoleLandingRef.current = true;
      setAuthMode('login');
      setAuthForm(createAuthFormState());
    } finally {
      setAuthBusy(false);
    }
  }, [authForm, usersData]);
  const handleRegister = useCallback(async () => {
    const safeName = sanitizeText(authForm.name, 80);
    const safeEmail = sanitizeEmail(authForm.email);
    const passwordInput = sanitizeText(authForm.password, 120);
    const confirmPassword = sanitizeText(authForm.confirmPassword, 120);
    const safeType = sanitizeText(authForm.type, 20) || 'BUJP';
    const safeWorkerNumber = sanitizeText(authForm.workerNumber, 40);
    const safePhone = sanitizePhone(authForm.phone);
    const safeDob = sanitizeText(authForm.dob, 20);
    const safeAddress = sanitizeMultilineText(authForm.address, 180);
    const safeOfficeAddress = sanitizeMultilineText(authForm.officeAddress, 180);
    const safeEmergencyName = sanitizeText(authForm.emergencyName, 80);
    const safeEmergencyContact = sanitizePhone(authForm.emergencyContact);
    const safeEmergencyRelation = sanitizeText(authForm.emergencyRelation, 40) || 'Orang Tua';
    const existingUser = usersData.find(user => (user.email || '').toLowerCase() === safeEmail) || null;

    if (!safeName || !safeEmail || !passwordInput || !confirmPassword) {
      setAuthError('Nama, email, password, dan konfirmasi password wajib diisi.');
      return;
    }
    if (passwordInput.length < 8) {
      setAuthError('Password minimal 8 karakter.');
      return;
    }
    if (passwordInput !== confirmPassword) {
      setAuthError('Konfirmasi password belum sama.');
      return;
    }
    if (existingUser?.role && existingUser.role !== ACCESS_ROLES.PETUGAS) {
      setAuthError('Akun ADMIN atau PIC harus dimigrasikan manual oleh pengelola sistem.');
      return;
    }
    if (existingUser && isFirebaseManagedUser(existingUser)) {
      setAuthError('Email ini sudah terdaftar di Firebase.');
      return;
    }
    if (!isFirebaseAuthEnabled) {
      setAuthError('Firebase Auth belum aktif. Registrasi cloud belum bisa dipakai.');
      return;
    }

    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const credential = await registerWithFirebaseEmail(safeEmail, passwordInput);
      const nextUser = normalizeUserRecord({
        ...(existingUser || {}),
        id: existingUser?.id || `u${Date.now()}`,
        name: existingUser?.name || safeName,
        role: existingUser?.role || ACCESS_ROLES.PETUGAS,
        type: existingUser?.type || safeType,
        workerNumber: existingUser?.workerNumber || safeWorkerNumber,
        status: existingUser?.status || 'off-duty',
        shipAssigned: existingUser?.shipAssigned || null,
        email: safeEmail,
        password: '',
        hasCredential: false,
        passwordSalt: '',
        passwordHash: '',
        authProvider: 'firebase',
        firebaseUid: credential.user.uid,
        phone: existingUser?.phone || safePhone,
        dob: existingUser?.dob || safeDob,
        address: existingUser?.address || safeAddress,
        officeAddress: existingUser?.officeAddress || safeOfficeAddress,
        emergencyName: existingUser?.emergencyName || safeEmergencyName,
        emergencyContact: existingUser?.emergencyContact || safeEmergencyContact,
        emergencyRelation: existingUser?.emergencyRelation || safeEmergencyRelation,
        photoUrl: existingUser?.photoUrl || authForm.photoUrl || createUserAvatar(existingUser?.name || safeName, usersData.length),
      }, usersData.length);

      setUsersData(prev => (
        existingUser
          ? prev.map((user, index) => (user.id === existingUser.id ? normalizeUserRecord(nextUser, index) : user))
          : [...prev, nextUser]
      ));

      await logoutFirebaseUser();
      setAuthMode('login');
      setAuthForm(createAuthFormState({ email: safeEmail }));
      setAuthNotice(existingUser
        ? 'Aktivasi Firebase Auth berhasil. Silakan login kembali dengan akun cloud Anda.'
        : 'Registrasi berhasil. Akun petugas baru bisa login setelah admin memberi penugasan kapal.');
    } catch (error) {
      setAuthError(getFirebaseAuthErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }, [authForm, usersData]);

  // Persistence effects
  useEffect(() => {
    const timerId = setTimeout(() => {
      savePersistedState({
        ...sharedState,
        theme,
      });
    }, 1000); // Debounce local persistence 1s
    return () => clearTimeout(timerId);
  }, [sharedState, theme]);
  useEffect(() => {
    if (!isCloudSyncEnabled) return () => {};

    return subscribeToCloudAppState((cloudPayload) => {
      setCloudSyncBootstrapped(true);

      logCloudSyncDebug('snapshot-received', {
        hasState: Boolean(cloudPayload?.state),
        activeShiftKey: cloudPayload?.state?.activeShiftKey || null,
        notifications: Array.isArray(cloudPayload?.state?.notifications) ? cloudPayload.state.notifications.length : 0,
        historyEntries: Array.isArray(cloudPayload?.state?.historyEntries) ? cloudPayload.state.historyEntries.length : 0,
      });

      if (!cloudPayload?.state) {
        latestCloudSharedStateRef.current = null;
        return;
      }
      applyCloudSharedState(cloudPayload.state);
    }, (error) => {
      setCloudSyncBootstrapped(true);
      console.error('Gagal subscribe data patroli cloud', error);
    });
  }, [applyCloudSharedState]);
  useEffect(() => {
    if (!isCloudSyncEnabled || !isCloudWriteEnabled || isOffline || !cloudSyncBootstrapped) return;

    const timerId = setTimeout(() => {
      const cloudReadyState = mergeSharedStateSnapshots(
        latestCloudSharedStateRef.current || {},
        createSharedStateSnapshot({
          ...sharedState,
          activeShiftKey: currentShiftMeta.key,
        }),
      );
      const serializedState = serializeSharedStateSnapshot(cloudReadyState);
      if (!serializedState || serializedState === lastSharedStateRef.current) return;

      cloudSaveQueueRef.current = cloudSaveQueueRef.current
        .catch(() => {})
        .then(async () => {
          const latestStateForWrite = mergeSharedStateSnapshots(
            latestCloudSharedStateRef.current || {},
            createSharedStateSnapshot({
              ...sharedState,
              activeShiftKey: currentShiftMeta.key,
            }),
          );
          const latestSerializedState = serializeSharedStateSnapshot(latestStateForWrite);
          if (!latestSerializedState || latestSerializedState === lastSharedStateRef.current) return;

          logCloudSyncDebug('save-shared-state', {
            activeShiftKey: latestStateForWrite.activeShiftKey,
            deletedHistory: Object.keys(latestStateForWrite.deletedRecords?.historyEntries || {}).length,
            deletedIncidents: Object.keys(latestStateForWrite.deletedRecords?.incidents || {}).length,
            deletedShips: Object.keys(latestStateForWrite.deletedRecords?.ships || {}).length,
            deletedUsers: Object.keys(latestStateForWrite.deletedRecords?.users || {}).length,
            historyEntries: latestStateForWrite.historyEntries.length,
            incidents: latestStateForWrite.incidentsData.length,
            notifications: latestStateForWrite.notifications.length,
            ships: latestStateForWrite.shipsData.length,
            users: latestStateForWrite.usersData.length,
          });

          const preparedState = await prepareSharedStateForCloudSync(latestStateForWrite);
          const savedState = await saveCloudAppState(preparedState, {
            mergeState: (cloudState, pendingState) => mergeSharedStateSnapshots(cloudState || {}, pendingState || {}),
          });
          const committedState = mergeSharedStateSnapshots({}, savedState || preparedState);
          const committedSerializedState = serializeSharedStateSnapshot(committedState);

          if (!committedSerializedState) return;

          latestCloudSharedStateRef.current = committedState;
          lastSharedStateRef.current = committedSerializedState;
        })
        .catch((error) => {
          console.error('Gagal mengirim laporan patroli ke cloud', error);
        });
    }, 2000); // Debounce cloud sync 2s

    return () => clearTimeout(timerId);
  }, [cloudSyncBootstrapped, currentShiftMeta.key, isOffline, prepareSharedStateForCloudSync, sharedState]);
  useEffect(() => { saveAuthSession(sessionUserId); }, [sessionUserId]);
  useEffect(() => {
    if (!isFirebaseAuthEnabled) {
      setFirebaseAuthReady(true);
      return () => {};
    }

    return subscribeToFirebaseAuthChanges((nextUser) => {
      setFirebaseAuthUser(nextUser);
      setFirebaseAuthReady(true);
    });
  }, []);
  useEffect(() => {
    if (!firebaseAuthReady) return;
    const safeEmail = sanitizeEmail(firebaseAuthUser?.email || '');
    if (!safeEmail) return;

    const matchedUser = usersData.find(user => (user.email || '').toLowerCase() === safeEmail) || null;
    if (!matchedUser) {
      setUsersData(prev => [...prev, createFirebaseBackedUserRecord(firebaseAuthUser, prev)]);
      return;
    }

    const needsFirebaseBinding = matchedUser.authProvider !== 'firebase' || matchedUser.firebaseUid !== firebaseAuthUser.uid;
    if (needsFirebaseBinding) {
      setUsersData(prev => prev.map((user, index) => (
        user.id !== matchedUser.id
          ? user
          : normalizeUserRecord({
            ...user,
            authProvider: 'firebase',
            firebaseUid: firebaseAuthUser.uid,
            hasCredential: false,
            passwordSalt: '',
            passwordHash: '',
          }, index)
      )));
    }

    if (sessionUserId !== matchedUser.id) {
      setSessionUserId(matchedUser.id);
    }
  }, [firebaseAuthReady, firebaseAuthUser, sessionUserId, usersData]);
  useEffect(() => {
    if (!sessionUserId) return;
    const activeUser = usersData.find(user => user.id === sessionUserId);
    if (!activeUser) {
      handleLogout('Sesi login tidak lagi valid.');
      return;
    }
    // Graceful session handling: Jangan tendang user jika mereka punya kredensial lokal (hybrid/legacy)
    // atau jika mereka adalah Admin/PIC yang sedang mengelola sistem.
    const isStrictFirebaseUser = isFirebaseManagedUser(activeUser) && !activeUser.hasCredential;
    const isAuthMissing = isFirebaseAuthEnabled && firebaseAuthReady && !firebaseAuthUser;
    
    if (isStrictFirebaseUser && isAuthMissing && !isAdmin && !isPic) {
      resetAuthSession('Sesi cloud Anda telah berakhir. Silakan login kembali.');
      return;
    }
    
    if (!canUserAccessApplication(activeUser)) {
      handleLogout('Petugas off-duty atau tanpa penugasan kapal tidak bisa tetap login.');
      return;
    }

    if (activeUser.role === ACCESS_ROLES.PETUGAS && !assignedShipForCurrentUser) {
      handleLogout('Petugas yang tidak lagi terdaftar di armada aktif tidak bisa tetap login.');
    }
  }, [assignedShipForCurrentUser, firebaseAuthReady, firebaseAuthUser, handleLogout, resetAuthSession, sessionUserId, usersData]);
  useEffect(() => { if (!currentUserRecord) return; if (!isAdmin && (currentPage === 'users' || currentPage === 'ships' || currentPage === 'daily-report')) { setCurrentPage('home'); setActiveShipId(null); setShowShipForm(false); setShowShipDocForm(false); setShowUserForm(false); setSelectedUser(null); } }, [currentPage, currentUserRecord, isAdmin]);
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

  const uiValue = useMemo(() => ({
    currentPage,
    setCurrentPage,
    theme,
    setTheme,
    isOffline,
    showSettingsDropdown,
    setShowSettingsDropdown,
    showNotificationsDropdown,
    setShowNotificationsDropdown,
    notificationReturnPage,
    openNotificationsPage,
    closeNotificationsPage,
    confirmDialog,
    setConfirmDialog,
  }), [
    closeNotificationsPage,
    confirmDialog,
    currentPage,
    isOffline,
    notificationReturnPage,
    openNotificationsPage,
    setConfirmDialog,
    showNotificationsDropdown,
    showSettingsDropdown,
    theme,
  ]);
  const authValue = useMemo(() => ({
    sessionUserId,
    authMode,
    setAuthMode,
    authBusy,
    authError,
    authNotice,
    authForm,
    setAuthForm,
    handleLogin,
    handleRegister,
    handleLogout,
    handleAuthPhotoUpload,
  }), [
    authBusy,
    authError,
    authForm,
    authMode,
    authNotice,
    handleAuthPhotoUpload,
    handleLogin,
    handleLogout,
    handleRegister,
    sessionUserId,
  ]);
  const roleValue = useMemo(() => ({
    currentUserRecord,
    currentUser,
    currentUserId,
    currentUserRole,
    isAdmin,
    isPic,
    isPetugas,
  }), [
    currentUser,
    currentUserId,
    currentUserRecord,
    currentUserRole,
    isAdmin,
    isPetugas,
    isPic,
  ]);
  const patrolValue = useMemo(() => ({
    checkpoints,
    currentShiftMeta,
    currentShiftSchedule,
    activeShiftKey,
    activeShiftGuardSnapshot,
    filteredCheckpoints,
    searchQuery,
    setSearchQuery,
    patrolTab,
    setPatrolTab,
    activeForms,
    setActiveForms,
    activePatrolId,
    activePatrolState,
    activePatrolItem,
    canPatrolCurrentShip,
    canAddTemporaryPatrolNode,
    shouldForcePatrolCameraCapture,
    pendingPatrolCameraCapture,
    submittingPatrolId,
    completedCount,
    totalCount,
    progressPercentage,
    newCustomNode,
    setNewCustomNode,
    handleActionClick,
    handleFormChange,
    handlePhotoUpload,
    handleSubmitPatrol,
    handleDeleteReport,
    handleAddReportGalleryPhoto,
    handleOpenPatrolResult,
    handleAddCustomPatrolNode,
    closePatrolCameraCapture,
    handlePatrolCameraCapture,
  }), [
    activeForms,
    activePatrolId,
    activePatrolItem,
    activePatrolState,
    activeShiftGuardSnapshot,
    activeShiftKey,
    canAddTemporaryPatrolNode,
    canPatrolCurrentShip,
    checkpoints,
    closePatrolCameraCapture,
    completedCount,
    currentShiftMeta,
    currentShiftSchedule,
    filteredCheckpoints,
    handleActionClick,
    handleAddCustomPatrolNode,
    handleAddReportGalleryPhoto,
    handleDeleteReport,
    handleFormChange,
    handleOpenPatrolResult,
    handlePatrolCameraCapture,
    handlePhotoUpload,
    handleSubmitPatrol,
    newCustomNode,
    patrolTab,
    pendingPatrolCameraCapture,
    progressPercentage,
    searchQuery,
    shouldForcePatrolCameraCapture,
    submittingPatrolId,
    totalCount,
  ]);
  const shipValue = useMemo(() => ({
    shipsData,
    operationalShip,
    operationalShipName,
    activeShipId,
    setActiveShipId,
    activeShip,
    shipDetailTab,
    setShipDetailTab,
    scheduleMonth,
    setScheduleMonth,
    showAssignPopup,
    setShowAssignPopup,
    assignPopupData,
    setAssignPopupData,
    handleConfirmAssign,
    isEditingShipInfo,
    setIsEditingShipInfo,
    editShipInfoData,
    setEditShipInfoData,
    updateActiveShip,
    handleTogglePersonnel,
    handleAddShipCp,
    handleShipPhotoUpdate,
    handleChangeSchedule,
    handleAddShipDoc,
    handleShipDocUpload,
    handleDownloadShipDoc,
    newShipCp,
    setNewShipCp,
    newShipDoc,
    setNewShipDoc,
    showShipDocForm,
    openShipDocForm,
    closeShipDocForm,
    showShipForm,
    setShowShipForm,
    shipFormData,
    setShipFormData,
    newCheckpoint,
    setNewCheckpoint,
    handleSaveShip,
    handleDeleteShip,
    handleAddCheckpointToForm,
    handleRemoveCheckpointFromForm,
    handleShipFormPhotoUpload,
  }), [
    activeShip,
    activeShipId,
    assignPopupData,
    closeShipDocForm,
    editShipInfoData,
    handleAddCheckpointToForm,
    handleAddShipCp,
    handleAddShipDoc,
    handleChangeSchedule,
    handleConfirmAssign,
    handleDeleteShip,
    handleDownloadShipDoc,
    handleRemoveCheckpointFromForm,
    handleSaveShip,
    handleShipDocUpload,
    handleShipFormPhotoUpload,
    handleShipPhotoUpdate,
    handleTogglePersonnel,
    isEditingShipInfo,
    newCheckpoint,
    newShipCp,
    newShipDoc,
    operationalShip,
    operationalShipName,
    openShipDocForm,
    scheduleMonth,
    shipDetailTab,
    shipFormData,
    shipsData,
    showAssignPopup,
    showShipDocForm,
    showShipForm,
    updateActiveShip,
  ]);
  const incidentValue = useMemo(() => ({
    incidentsData,
    incidentMeta,
    allIncidents,
    visibleIncidents,
    showIncidentModal,
    incidentForm,
    setIncidentForm,
    incidentLocationOptions,
    selectedIncident,
    setSelectedIncident,
    openIncidentModal,
    closeIncidentModal,
    handleSubmitIncident,
    canManageIncident,
    canCloseIncident,
    handleAddProgress,
    handleAddIncidentDocumentation,
    handleUpdateIncidentInfo,
    handleCloseIncident,
    handleDeleteIncident,
    newProgress,
    setNewProgress,
    handlePhotoProgress,
    handleUpdateIncidentPhoto,
  }), [
    allIncidents,
    canCloseIncident,
    canManageIncident,
    closeIncidentModal,
    handleAddIncidentDocumentation,
    handleAddProgress,
    handleCloseIncident,
    handleDeleteIncident,
    handleUpdateIncidentInfo,
    handlePhotoProgress,
    handleSubmitIncident,
    handleUpdateIncidentPhoto,
    incidentForm,
    incidentLocationOptions,
    incidentMeta,
    incidentsData,
    newProgress,
    openIncidentModal,
    selectedIncident,
    showIncidentModal,
    visibleIncidents,
  ]);
  const userManagementValue = useMemo(() => ({
    usersData,
    showUserForm,
    setShowUserForm,
    userFormData,
    setUserFormData,
    userFormError,
    userFormNotice,
    clearUserManagementFeedback,
    selectedUser,
    setSelectedUser,
    handleSaveUser,
    handleUpdateUser,
    handleDeleteUser,
    handleUserPhotoUpload,
    handleEditUserPhotoUpload,
  }), [
    clearUserManagementFeedback,
    handleDeleteUser,
    handleEditUserPhotoUpload,
    handleSaveUser,
    handleUpdateUser,
    handleUserPhotoUpload,
    selectedUser,
    showUserForm,
    userFormData,
    userFormError,
    userFormNotice,
    usersData,
  ]);
  const reportValue = useMemo(() => ({
    selectedReportDetail,
    setSelectedReportDetail,
    previewPhoto,
    setPreviewPhoto,
  }), [previewPhoto, selectedReportDetail]);
  const weatherValue = useMemo(() => ({
    weatherInfo,
    weatherLoading,
    getWeatherDetail,
  }), [getWeatherDetail, weatherInfo, weatherLoading]);
  const historyValue = useMemo(() => ({
    historyEntries: visibleHistoryEntries,
    selectedHistoryEntry,
    setSelectedHistoryId,
    openHistoryEntry,
    closeHistoryEntry,
    handleDeleteHistoryEntry,
  }), [
    closeHistoryEntry,
    handleDeleteHistoryEntry,
    openHistoryEntry,
    selectedHistoryEntry,
    visibleHistoryEntries,
  ]);
  const notificationValue = useMemo(() => ({
    notifications,
    visibleNotifications,
    unreadNotificationCount,
    appendNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    handleNotificationClick,
  }), [
    appendNotifications,
    handleNotificationClick,
    markAllNotificationsAsRead,
    markNotificationAsRead,
    notifications,
    unreadNotificationCount,
    visibleNotifications,
  ]);
  const sosValue = useMemo(() => ({
    activeSOSAlert,
    sosHistory,
    handleSOSTrigger,
    handleSOSConfirm,
    handleSOSDismiss,
  }), [
    activeSOSAlert,
    handleSOSConfirm,
    handleSOSDismiss,
    handleSOSTrigger,
    sosHistory,
  ]);
  const appValue = useMemo(() => ({
    ...uiValue,
    ...authValue,
    ...roleValue,
    ...patrolValue,
    ...shipValue,
    ...incidentValue,
    ...userManagementValue,
    ...reportValue,
    ...weatherValue,
    ...historyValue,
    ...notificationValue,
    ...sosValue,
  }), [
    authValue,
    historyValue,
    incidentValue,
    notificationValue,
    patrolValue,
    reportValue,
    roleValue,
    shipValue,
    sosValue,
    uiValue,
    userManagementValue,
    weatherValue,
  ]);

  return (
    <AppContext.Provider value={appValue}>
      <UIContext.Provider value={uiValue}>
        <AuthContext.Provider value={authValue}>
          <RoleContext.Provider value={roleValue}>
            <PatrolContext.Provider value={patrolValue}>
              <ShipContext.Provider value={shipValue}>
                <IncidentContext.Provider value={incidentValue}>
                  <UserManagementContext.Provider value={userManagementValue}>
                    <ReportContext.Provider value={reportValue}>
                      <WeatherContext.Provider value={weatherValue}>
                        <HistoryContext.Provider value={historyValue}>
                          <NotificationContext.Provider value={notificationValue}>
                            <SOSContext.Provider value={sosValue}>
                              {children}
                            </SOSContext.Provider>
                          </NotificationContext.Provider>
                        </HistoryContext.Provider>
                      </WeatherContext.Provider>
                    </ReportContext.Provider>
                  </UserManagementContext.Provider>
                </IncidentContext.Provider>
              </ShipContext.Provider>
            </PatrolContext.Provider>
          </RoleContext.Provider>
        </AuthContext.Provider>
      </UIContext.Provider>
    </AppContext.Provider>
  );
}
