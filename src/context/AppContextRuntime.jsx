/*
Tujuan: Menjadi pusat state, flow bisnis, dan sinkronisasi SmartPatrol.
Caller: Root app melalui AppProvider dan seluruh hook domain aplikasi.
Dependensi: Seed data, Firebase service (auth/cloud/access), trusted time, utilitas sanitasi, dan IndexedDB image store.
Main Functions: Mengelola auth Firebase, onboarding approval, kapal, checkpoint patroli, incidents, history, SOS, dan cloud sync.
Side Effects: Menulis state lokal/cloud, memanggil callable security, menginisialisasi checklist kapal, dan memigrasikan data shift aktif.
*/

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import {
  Sun, Cloud, CloudRain, Wind, Thermometer,
} from 'lucide-react';
import { createPosterDataUrl, DEFAULT_LOCATION_OPTIONS } from '../data/defaultData';
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
  fetchCloudAppState,
  isCloudSyncEnabled,
  isCloudWriteEnabled,
  saveCloudAppState,
  subscribeToCloudAppState,
  uploadCloudDataUrlAsset,
} from '../services/firebase/cloudState';
import {
  approvePendingRegistration,
  createPendingRegistration,
  rejectPendingRegistration,
  resolveOperationalAccess,
  revokeOperationalUserAccess,
  subscribeToPendingRegistrations,
  syncOperationalUserAccess,
  uploadRegistrationPhotoAsset,
} from '../services/firebase/access';
import {
  createTrustedTimestampRecord,
  getTrustedDate,
  getTrustedNowMs,
  initializeTrustedTime,
} from '../services/time/trustedTime';
import {
  extractTimeAuditFields,
  markTimeAuditRecordReceived,
  normalizeTimeAuditRecord,
} from '../services/time/timeAudit';

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

function getDefaultPageForRole(role) {
  return role === ACCESS_ROLES.ADMIN ? 'daily-report' : 'home';
}
const MINUTE_IN_MS = 60 * 1000;
const SHIFT_SEQUENCE = [
  {
    id: 'shift-1-active',
    label: 'Shift 1',
    startHour: 6,
    startMinute: 0,
    endHour: 12,
    endMinute: 0,
    timeRange: '06:00 - 12:00',
  },
  {
    id: 'shift-2-active',
    label: 'Shift 2',
    startHour: 12,
    startMinute: 0,
    endHour: 18,
    endMinute: 0,
    timeRange: '12:00 - 18:00',
  },
  {
    id: 'shift-3-active',
    label: 'Shift 3',
    startHour: 18,
    startMinute: 0,
    endHour: 6,
    endMinute: 0,
    crossesMidnight: true,
    timeRange: '18:00 - 06:00',
  },
];
const COMPAT_SHIFT_SEQUENCE = [
  {
    id: 'shift-pagi',
    label: 'Shift Pagi',
    startHour: 6,
    startMinute: 0,
    endHour: 10,
    endMinute: 0,
    compat: true,
    timeRange: '06:00 - 10:00',
  },
  {
    id: 'shift-siang',
    label: 'Shift Siang',
    startHour: 10,
    startMinute: 0,
    endHour: 14,
    endMinute: 0,
    compat: true,
    timeRange: '10:00 - 14:00',
  },
  {
    id: 'shift-sore',
    label: 'Shift Sore',
    startHour: 14,
    startMinute: 0,
    endHour: 18,
    endMinute: 0,
    compat: true,
    timeRange: '14:00 - 18:00',
  },
  {
    id: 'shift-malam',
    label: 'Shift Malam',
    startHour: 18,
    startMinute: 0,
    endHour: 6,
    endMinute: 0,
    crossesMidnight: true,
    compat: true,
    timeRange: '18:00 - 06:00',
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
    compat: true,
    legacy: true,
    timeRange: '00:00 - 06:00',
  },
  {
    id: 'shift-1',
    label: 'Shift 1',
    startHour: 6,
    startMinute: 0,
    endHour: 12,
    endMinute: 0,
    compat: true,
    legacy: true,
    timeRange: '06:00 - 12:00',
  },
  {
    id: 'shift-2',
    label: 'Shift 2',
    startHour: 12,
    startMinute: 0,
    endHour: 18,
    endMinute: 0,
    compat: true,
    legacy: true,
    timeRange: '12:00 - 18:00',
  },
  {
    id: 'shift-3',
    label: 'Shift 3',
    startHour: 18,
    startMinute: 0,
    endHour: 0,
    endMinute: 0,
    crossesMidnight: true,
    compat: true,
    legacy: true,
    timeRange: '18:00 - 00:00',
  },
];
const SHIFT_DEFINITION_MAP = [...SHIFT_SEQUENCE, ...COMPAT_SHIFT_SEQUENCE, ...LEGACY_SHIFT_SEQUENCE].reduce((accumulator, shift) => ({
  ...accumulator,
  [shift.id]: shift,
}), {});

const defaultLocationOptions = [...DEFAULT_LOCATION_OPTIONS];
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
    // Pastikan checklist wajib selalu ada pada semua kapal, termasuk data lama yang sudah tersimpan.
    customCheckpoints: initializeShipCheckpointDefinitions(ship?.customCheckpoints),
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
    { id: 'u1', name: 'Budi Santoso', role: ACCESS_ROLES.ADMIN, type: 'BUJP', status: 'active', shipAssigned: 'MT MENGGALA', email: 'admin@smartpatrol.local', authProvider: 'none', firebaseUid: null, photoUrl: createPosterDataUrl('BS', 'Budi Santoso', 0, true) },
    { id: 'u2', name: 'Sertu Agus', role: ACCESS_ROLES.PIC, type: 'TNI', status: 'active', shipAssigned: 'MT MENGGALA', email: 'pic@smartpatrol.local', authProvider: 'none', firebaseUid: null, photoUrl: createPosterDataUrl('SA', 'Sertu Agus', 1, true) },
    { id: 'u3', name: 'Cipto Mangunkusumo', role: ACCESS_ROLES.PETUGAS, type: 'BUJP', status: 'active', shipAssigned: 'MT MENGGALA', email: 'petugas@smartpatrol.local', authProvider: 'none', firebaseUid: null, photoUrl: createPosterDataUrl('CM', 'Cipto', 2, true) },
    { id: 'u4', name: 'Deni Setiawan', role: ACCESS_ROLES.PETUGAS, type: 'BUJP', status: 'off-duty', shipAssigned: null, email: 'deni@smartpatrol.local', authProvider: 'none', firebaseUid: null, photoUrl: createPosterDataUrl('DS', 'Deni', 3, true) },
    { id: 'u5', name: 'Kapten Eko', role: ACCESS_ROLES.PIC, type: 'INTERNAL', status: 'off-duty', shipAssigned: null, email: 'eko@smartpatrol.local', authProvider: 'none', firebaseUid: null, photoUrl: createPosterDataUrl('KE', 'Kapten Eko', 4, true) },
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

const APP_STORAGE_KEY = 'smartpatrol.secure.local.v2';
const LEGACY_APP_STORAGE_KEY = 'smartpatrol.legacy.local.v1';
const WEATHER_STORAGE_KEY = 'smartpatrol.weather.local.v2';
const LEGACY_WEATHER_STORAGE_KEY = 'smartpatrol.legacy.weather.v1';
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

function ensureArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function ensureObject(value) {
  return value && typeof value === 'object' ? value : null;
}

function isNavigatorOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
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

function isCompatShiftDefinition(shift) {
  return Boolean(shift?.compat || shift?.legacy);
}

function getCheckpointShiftTimestamp(checkpoint) {
  const candidates = [
    checkpoint?.completedAt,
    checkpoint?.updatedAt,
    checkpoint?.createdAt,
  ];

  for (let index = 0; index < candidates.length; index += 1) {
    const timestamp = new Date(candidates[index] || '').getTime();
    if (!Number.isNaN(timestamp) && timestamp > 0) {
      return timestamp;
    }
  }

  return null;
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

function getShiftMeta(date = getTrustedDate()) {
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

function getCanonicalShiftMeta(meta) {
  if (!meta) return null;
  const definition = getShiftDefinition(meta.id);
  if (!definition) return null;
  if (!isCompatShiftDefinition(definition)) return meta;

  const { startAt } = getShiftScheduleTimes(meta);
  return getShiftMeta(new Date(startAt.getTime() + 1000));
}

function getCanonicalShiftMetaFromKey(key) {
  return getCanonicalShiftMeta(getShiftMetaFromKey(key));
}

function getCanonicalShiftMetaForCheckpoint(checkpoint, fallbackMeta = null) {
  const checkpointTimestamp = getCheckpointShiftTimestamp(checkpoint);
  if (checkpointTimestamp) {
    return getShiftMeta(new Date(checkpointTimestamp));
  }

  const checkpointShiftMeta = getCanonicalShiftMetaFromKey(checkpoint?.shiftKey);
  if (checkpointShiftMeta) return checkpointShiftMeta;

  return getCanonicalShiftMeta(fallbackMeta);
}

function normalizeShiftKeyForCloudSync(shiftKey, fallbackMeta = getShiftMeta()) {
  const safeFallbackMeta = getCanonicalShiftMeta(fallbackMeta) || fallbackMeta || getShiftMeta();
  const persistedShiftMeta = getCanonicalShiftMetaFromKey(shiftKey);
  if (!persistedShiftMeta) return safeFallbackMeta.key;

  const persistedShiftStartAt = getShiftScheduleTimes(persistedShiftMeta).startAt.getTime();
  const fallbackShiftStartAt = getShiftScheduleTimes(safeFallbackMeta).startAt.getTime();

  if (persistedShiftStartAt > fallbackShiftStartAt) return safeFallbackMeta.key;
  return persistedShiftMeta.key;
}

function resolveLatestShiftKey(shiftKeys = [], fallbackMeta = getShiftMeta()) {
  const safeFallbackMeta = fallbackMeta || getShiftMeta();
  let latestShiftMeta = null;
  let latestShiftStartAt = Number.NEGATIVE_INFINITY;

  ensureArray(Array.isArray(shiftKeys) ? shiftKeys : [shiftKeys]).forEach((shiftKey) => {
    const normalizedShiftKey = normalizeShiftKeyForCloudSync(shiftKey, safeFallbackMeta);
    const candidateShiftMeta = getShiftMetaFromKey(normalizedShiftKey);
    if (!candidateShiftMeta) return;

    const candidateShiftStartAt = getShiftScheduleTimes(candidateShiftMeta).startAt.getTime();
    if (candidateShiftStartAt >= latestShiftStartAt) {
      latestShiftMeta = candidateShiftMeta;
      latestShiftStartAt = candidateShiftStartAt;
    }
  });

  // Jangan langsung meloncat ke fallback shift saat ini jika state lama
  // masih membawa shift yang belum direkonsiliasi ke riwayat.
  if (!latestShiftMeta) {
    latestShiftMeta = getShiftMetaFromKey(safeFallbackMeta.key) || safeFallbackMeta;
  }

  return latestShiftMeta?.key || safeFallbackMeta.key;
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
  const safeMeta = getCanonicalShiftMeta(meta) || meta || getShiftMeta();
  const { endAt } = getShiftScheduleTimes(safeMeta);
  return getShiftMeta(new Date(endAt.getTime() + 1000));
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
  return ensureArray(ship.customCheckpoints).map((checkpoint, index) => (
    createBaseCheckpointRecord(ship, checkpoint, index)
  ));
}

function resetCheckpointForShift(checkpoint, options = {}) {
  const {
    updatedAt = getTrustedDate().toISOString(),
    shiftKey = null,
    pendingOrigin = 'shift-reset',
  } = options;
  return {
    id: checkpoint.id,
    name: checkpoint.name,
    desc: checkpoint.desc || '',
    status: 'pending',
    updatedAt,
    shiftKey,
    pendingOrigin,
    shipId: checkpoint.shipId || null,
    shipName: checkpoint.shipName || '',
  };
}

function createCheckpointGalleryPhotoRecord(photoUrl, options = {}) {
  const trustedTimestamp = options.trustedTimestamp || createTrustedTimestampRecord();
  const createdAt = options.createdAt || trustedTimestamp.occurredAtTrustedIso;
  return normalizeTimeAuditRecord({
    id: options.id || `checkpoint-gallery-${trustedTimestamp.occurredAtTrustedMs}-${Math.random().toString(36).slice(2, 8)}`,
    photoUrl,
    author: sanitizeText(options.author || '', 80) || '-',
    date: options.date || formatAppDate(new Date(createdAt)),
    time: options.time || formatAppTime(new Date(createdAt)),
    createdAt,
    ...trustedTimestamp,
  }, {
    fallbackTimestampKeys: ['createdAt'],
  });
}

function resetCheckpointCollection(checkpoints, options = {}) {
  return ensureArray(checkpoints)
    .filter(checkpoint => !checkpoint.isTemporaryShiftNode)
    .map(checkpoint => resetCheckpointForShift(checkpoint, options));
}

function shouldResetCheckpointForActiveShift(checkpoint, activeShiftKey) {
  if (!checkpoint || checkpoint.status === 'pending' || checkpoint.isTemporaryShiftNode) return false;
  if (!activeShiftKey) return false;

  const activeShiftMeta = getCanonicalShiftMetaFromKey(activeShiftKey) || getShiftMetaFromKey(activeShiftKey);
  if (!activeShiftMeta) return false;

  const checkpointShiftMeta = getCanonicalShiftMetaForCheckpoint(checkpoint, activeShiftMeta);
  const checkpointTimestamp = getCheckpointShiftTimestamp(checkpoint);
  const activeShiftStartTimestamp = getShiftScheduleTimes(activeShiftMeta).startAt.getTime();

  if (checkpointShiftMeta?.key && checkpointShiftMeta.key !== activeShiftMeta.key) {
    const checkpointShiftStartTimestamp = getShiftScheduleTimes(checkpointShiftMeta).startAt.getTime();
    return checkpointShiftStartTimestamp < activeShiftStartTimestamp;
  }

  if (Number.isNaN(checkpointTimestamp) || checkpointTimestamp <= 0) return false;

  return checkpointTimestamp < activeShiftStartTimestamp;
}

function getShiftResetTimestamp(activeShiftKey, fallbackTimestamp = getTrustedDate().toISOString()) {
  const activeShiftMeta = getShiftMetaFromKey(activeShiftKey);
  if (!activeShiftMeta) return fallbackTimestamp;
  return getShiftScheduleTimes(activeShiftMeta).startAt.toISOString();
}

function normalizeShipScopedCheckpoints(ship, checkpoints = [], activeShiftKey = null) {
  const baseCheckpoints = createShipCheckpointCollection(ship);
  const safeCheckpoints = ensureArray(checkpoints).filter(checkpoint => ensureObject(checkpoint));
  const checkpointsById = new Map(safeCheckpoints.map(checkpoint => [String(checkpoint.id), checkpoint]));
  const checkpointsByName = new Map(safeCheckpoints.map(checkpoint => [createCheckpointNameKey(checkpoint.name), checkpoint]));

  return baseCheckpoints.map((baseCheckpoint) => {
    const matchedCheckpoint = checkpointsById.get(String(baseCheckpoint.id))
      || checkpointsByName.get(createCheckpointNameKey(baseCheckpoint.name));

    if (!matchedCheckpoint) return baseCheckpoint;

    const normalizedCheckpoint = shouldResetCheckpointForActiveShift(matchedCheckpoint, activeShiftKey)
      ? resetCheckpointForShift(matchedCheckpoint, {
          shiftKey: activeShiftKey,
          updatedAt: getShiftResetTimestamp(activeShiftKey),
          pendingOrigin: 'shift-reset',
        })
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
  const directTimestamp = (
    Number.isFinite(incident?.occurredAtTrustedMs)
      ? incident.occurredAtTrustedMs
      : new Date(
        incident?.occurredAtTrustedIso
        || incident?.completedAt
        || incident?.createdAt
        || incident?.reportedAt
        || '',
      ).getTime()
  );

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

  return normalizeTimeAuditRecord({
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
    gpsSnapshot: checkpoint?.gpsSnapshot || null,
    shipSnapshot: checkpoint?.shipSnapshot || null,
    ...extractTimeAuditFields(checkpoint),
  }, {
    fallbackTimestampKeys: ['completedAt', 'updatedAt', 'createdAt'],
  });
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

  return normalizeTimeAuditRecord({
    id: sos.id,
    date: getIncidentDateLabel(triggeredAt),
    time: triggeredAt ? formatAppTime(new Date(triggeredAt)) : '-',
    reportedAt: triggeredAt,
    triggeredAt,
    source: 'sos',
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
    senderUserId: sos.senderUserId || null,
    targetUserIds: Array.isArray(sos.targetUserIds) ? sos.targetUserIds : [],
    senderAcknowledgedAt: sos.senderAcknowledgedAt || null,
    senderAcknowledgedBy: sos.senderAcknowledgedBy || null,
    targetShipNames,
    lat: sos.lat ?? null,
    lng: sos.lng ?? null,
    ...extractTimeAuditFields(sos),
  }, {
    fallbackTimestampKeys: ['triggeredAt', 'createdAt'],
  });
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
  return ensureArray(checkpoints).reduce((summary, checkpoint) => {
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

const SHIFT_GUARD_STATUS = Object.freeze({
  PATROLI: 'patroli',
  ISTIRAHAT: 'istirahat',
});

function createShiftStatusRecordKey(shipId, shiftKey) {
  const safeShipId = sanitizeText(String(shipId || ''), 120).trim();
  const safeShiftKey = sanitizeText(String(shiftKey || ''), 160).trim();
  if (!safeShipId || !safeShiftKey) return '';
  return `${safeShipId}|${safeShiftKey}`;
}

function normalizeShiftGuardStatusValue(value) {
  const normalizedValue = sanitizeText(String(value || ''), 40).trim().toLowerCase();
  return normalizedValue === SHIFT_GUARD_STATUS.ISTIRAHAT
    ? SHIFT_GUARD_STATUS.ISTIRAHAT
    : SHIFT_GUARD_STATUS.PATROLI;
}

function normalizeShiftStatusItems(items = []) {
  const seenItemKeys = new Set();

  return ensureArray(items).reduce((normalizedItems, item) => {
    const userId = sanitizeText(String(item?.userId || ''), 120).trim();
    const name = sanitizeText(item?.name || '', 120).trim();
    const itemKey = userId || createGuardNameKey(name);
    if (!itemKey || seenItemKeys.has(itemKey)) return normalizedItems;

    seenItemKeys.add(itemKey);
    normalizedItems.push({
      userId: userId || null,
      name,
      role: ACCESS_ROLES.PETUGAS,
      status: normalizeShiftGuardStatusValue(item?.status),
    });

    return normalizedItems;
  }, []);
}

function normalizeShiftStatusRecord(record = {}) {
  if (!record || typeof record !== 'object') return null;

  const shipId = sanitizeText(String(record.shipId || ''), 120).trim();
  const shiftKey = sanitizeText(String(record.shiftKey || ''), 160).trim();
  const recordKey = createShiftStatusRecordKey(shipId, shiftKey);
  if (!recordKey) return null;

  const filledAtTrustedIso = sanitizeText(record.filledAtTrustedIso || record.updatedAt || '', 80).trim() || null;
  const filledAtTrustedMs = Number.isFinite(record.filledAtTrustedMs)
    ? record.filledAtTrustedMs
    : new Date(filledAtTrustedIso || '').getTime();

  return {
    key: recordKey,
    shipId,
    shipName: sanitizeText(record.shipName || '', 120).trim() || null,
    shiftKey,
    filledByUserId: sanitizeText(String(record.filledByUserId || ''), 120).trim() || null,
    filledByName: sanitizeText(record.filledByName || '', 120).trim() || null,
    filledAtTrustedIso,
    filledAtTrustedMs: Number.isFinite(filledAtTrustedMs) ? filledAtTrustedMs : null,
    filledAtClientMs: Number.isFinite(record.filledAtClientMs) ? record.filledAtClientMs : null,
    timeTrustLevel: sanitizeText(record.timeTrustLevel || '', 40).trim() || null,
    clockTamperDetected: Boolean(record.clockTamperDetected),
    items: normalizeShiftStatusItems(record.items),
    updatedAt: filledAtTrustedIso,
  };
}

function getShiftStatusRecordTimestamp(record) {
  if (!record) return 0;
  if (Number.isFinite(record.filledAtTrustedMs)) return record.filledAtTrustedMs;

  const parsedTimestamp = new Date(record.filledAtTrustedIso || record.updatedAt || '').getTime();
  return Number.isNaN(parsedTimestamp) ? 0 : parsedTimestamp;
}

function mergeShiftStatusRecord(baseRecord, nextRecord) {
  if (!baseRecord) return nextRecord;
  if (!nextRecord) return baseRecord;

  const baseTimestamp = getShiftStatusRecordTimestamp(baseRecord);
  const nextTimestamp = getShiftStatusRecordTimestamp(nextRecord);
  const shouldUseNext = (
    Number.isNaN(baseTimestamp)
    || (!Number.isNaN(nextTimestamp) && nextTimestamp >= baseTimestamp)
  );
  const preferredRecord = shouldUseNext ? nextRecord : baseRecord;
  const fallbackRecord = shouldUseNext ? baseRecord : nextRecord;

  return {
    ...fallbackRecord,
    ...preferredRecord,
    key: preferredRecord.key || fallbackRecord.key,
    shipId: preferredRecord.shipId || fallbackRecord.shipId,
    shiftKey: preferredRecord.shiftKey || fallbackRecord.shiftKey,
    items: preferredRecord.items?.length ? preferredRecord.items : (fallbackRecord.items || []),
  };
}

function mergeShiftStatusRecords(baseRecords = {}, nextRecords = {}) {
  const mergedRecords = new Map();

  [
    ...Object.values(baseRecords || {}),
    ...Object.values(nextRecords || {}),
  ].forEach((record) => {
    const normalizedRecord = normalizeShiftStatusRecord(record);
    if (!normalizedRecord) return;

    const existingRecord = mergedRecords.get(normalizedRecord.key);
    mergedRecords.set(
      normalizedRecord.key,
      existingRecord ? mergeShiftStatusRecord(existingRecord, normalizedRecord) : normalizedRecord,
    );
  });

  return Object.fromEntries(mergedRecords.entries());
}

function getShiftStatusRecordForShipShift(records = {}, shipId, shiftKey) {
  const recordKey = createShiftStatusRecordKey(shipId, shiftKey);
  if (!recordKey) return null;
  return normalizeShiftStatusRecord(records?.[recordKey]);
}

function doesShiftStatusRecordCoverGuards(record, guards = []) {
  const normalizedRecord = normalizeShiftStatusRecord(record);
  const normalizedGuards = ensureArray(guards).filter(user => user?.id || user?.name);
  if (!normalizedRecord || normalizedGuards.length === 0) return false;

  const coveredGuardKeys = new Set(normalizedRecord.items.flatMap((item) => ([
    item.userId,
    createGuardNameKey(item.name),
  ])).filter(Boolean));

  return normalizedGuards.every((guard) => (
    coveredGuardKeys.has(guard.id)
    || coveredGuardKeys.has(createGuardNameKey(guard.name))
  ));
}

function retainShiftStatusRecordsForShift(records = {}, shiftKey = null) {
  if (!shiftKey) return {};

  return Object.values(records || {}).reduce((collection, record) => {
    const normalizedRecord = normalizeShiftStatusRecord(record);
    if (!normalizedRecord || normalizedRecord.shiftKey !== shiftKey) return collection;

    collection[normalizedRecord.key] = normalizedRecord;
    return collection;
  }, {});
}

function buildGuardShiftSnapshot(users, shipName, checkpoints = [], shiftStatusRecord = null) {
  const scoreMaps = buildGuardScoreMaps(checkpoints);
  const normalizedShiftStatusRecord = normalizeShiftStatusRecord(shiftStatusRecord);
  const statusByUserId = new Map();
  const statusByName = new Map();

  normalizedShiftStatusRecord?.items?.forEach((item) => {
    if (item.userId) statusByUserId.set(item.userId, item.status);

    const guardNameKey = createGuardNameKey(item.name);
    if (guardNameKey) statusByName.set(guardNameKey, item.status);
  });

  return ensureArray(users)
    .filter(user => user.shipAssigned === shipName && user.status === 'active' && user.role === ACCESS_ROLES.PETUGAS)
    .map((user) => {
      const shiftStatus = statusByUserId.get(user.id) || statusByName.get(createGuardNameKey(user.name)) || null;

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        photoUrl: user.photoUrl || null,
        score: scoreMaps.byId.get(user.id) || scoreMaps.byName.get(createGuardNameKey(user.name)) || 0,
        shiftStatus,
        shiftStatusLabel: shiftStatus === SHIFT_GUARD_STATUS.ISTIRAHAT
          ? 'ISTIRAHAT'
          : shiftStatus === SHIFT_GUARD_STATUS.PATROLI
            ? 'PATROLI'
            : null,
      };
    });
}

function buildHistoryEntry({ shiftMeta, checkpoints, ship, users, weatherInfo, shiftStatusRecords = {} }) {
  const historyKey = createHistoryEntryKey(ship, shiftMeta);
  const historyId = `history-${historyKey}`;
  const { endAt } = getShiftScheduleTimes(shiftMeta);
  const shiftStatusRecord = getShiftStatusRecordForShipShift(shiftStatusRecords, ship?.id, shiftMeta.key);
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
    crewSnapshot: buildGuardShiftSnapshot(users, shipName, snapshotCheckpoints, shiftStatusRecord),
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

function createFallbackWeatherSnapshot(fallbackWeather, gpsSnapshot) {
  const safeFallbackWeather = ensureObject(fallbackWeather);
  if (!safeFallbackWeather || gpsSnapshot?.lat == null || gpsSnapshot?.lng == null) return null;

  return {
    ...safeFallbackWeather,
    capturedAt: gpsSnapshot.capturedAt,
    source: `${gpsSnapshot.source || 'cache'}-cache`,
    lat: gpsSnapshot.lat,
    lng: gpsSnapshot.lng,
  };
}

function buildLiveHistoryEntry({ shiftMeta, checkpoints, ship, users, shiftStatusRecord = null }) {
  if (!shiftMeta?.key || !ship) return null;

  const shipName = ship?.name || 'Belum Ada Kapal';
  const liveEntryKey = `live-${ship?.id || shipName}-${shiftMeta.key}`;
  const shipSnapshot = createShipLocationSnapshot(ship);
  const liveCheckpoints = ensureArray(checkpoints)
    .filter(checkpoint => ensureObject(checkpoint))
    .map(checkpoint => ({
      ...checkpoint,
      date: shiftMeta.dateLabel,
      shipName: checkpoint.shipName || shipName,
      shipSnapshot: checkpoint.shipSnapshot || shipSnapshot,
    }));
  const summary = summarizePatrolCheckpoints(liveCheckpoints);

  return {
    id: liveEntryKey,
    key: liveEntryKey,
    date: shiftMeta.dateLabel,
    dateKey: shiftMeta.dateKey,
    shift: shiftMeta.label,
    shiftId: shiftMeta.id,
    time: shiftMeta.timeRange,
    ship: shipName,
    shipSnapshot,
    crewSnapshot: buildGuardShiftSnapshot(users, shipName, liveCheckpoints, shiftStatusRecord),
    weatherSnapshot: null,
    checkpoints: liveCheckpoints,
    summary,
    points: summary.total,
    issue: summary.temuan,
    missed: summary.missed,
    createdAt: getTrustedDate().toISOString(),
    isLive: true,
    readOnly: true,
  };
}

function normalizeCheckpointRecordForShip(baseCheckpoint, checkpoint, ship, shiftKey = checkpoint?.shiftKey || null) {
  if (!checkpoint) return { ...baseCheckpoint };

  return {
    ...baseCheckpoint,
    ...checkpoint,
    id: baseCheckpoint.id,
    name: baseCheckpoint.name,
    desc: baseCheckpoint.desc,
    shipId: ship?.id || checkpoint?.shipId || null,
    shipName: ship?.name || checkpoint?.shipName || '',
    shiftKey,
  };
}

function migrateCheckpointStateToCurrentShift({
  ships = [],
  checkpointsByShip = {},
  historyEntries = [],
  shiftStatusRecords = {},
  users = [],
  currentShiftMeta = getShiftMeta(),
}) {
  const safeCurrentShiftMeta = getCanonicalShiftMeta(currentShiftMeta) || currentShiftMeta || getShiftMeta();
  const currentShiftStartAt = getShiftScheduleTimes(safeCurrentShiftMeta).startAt.getTime();
  let nextHistoryEntries = sortHistoryEntries(historyEntries);
  let didMigrate = false;

  const nextCheckpointsByShip = ensureArray(ships).reduce((collection, ship) => {
    const baseCheckpoints = createShipCheckpointCollection(ship);
    const savedCheckpoints = ensureArray(checkpointsByShip?.[ship.id]).filter(checkpoint => ensureObject(checkpoint));
    const checkpointsById = new Map(savedCheckpoints.map(checkpoint => [String(checkpoint.id), checkpoint]));
    const checkpointsByName = new Map(savedCheckpoints.map(checkpoint => [createCheckpointNameKey(checkpoint.name), checkpoint]));
    const matchedCheckpoints = baseCheckpoints.map((baseCheckpoint) => (
      checkpointsById.get(String(baseCheckpoint.id))
      || checkpointsByName.get(createCheckpointNameKey(baseCheckpoint.name))
      || null
    ));
    const pastShiftGroups = new Map();
    const currentShiftCheckpoints = new Map();

    matchedCheckpoints.forEach((matchedCheckpoint, index) => {
      if (!matchedCheckpoint || matchedCheckpoint.status !== 'completed' || matchedCheckpoint.isTemporaryShiftNode) return;

      const baseCheckpoint = baseCheckpoints[index];
      const canonicalShiftMeta = getCanonicalShiftMetaForCheckpoint(matchedCheckpoint, safeCurrentShiftMeta);
      if (!canonicalShiftMeta) return;

      const canonicalShiftStartAt = getShiftScheduleTimes(canonicalShiftMeta).startAt.getTime();
      const normalizedCheckpoint = normalizeCheckpointRecordForShip(
        baseCheckpoint,
        matchedCheckpoint,
        ship,
        canonicalShiftMeta.key,
      );

      if (canonicalShiftStartAt < currentShiftStartAt) {
        const shiftGroup = pastShiftGroups.get(canonicalShiftMeta.key) || new Map();
        shiftGroup.set(String(baseCheckpoint.id), normalizedCheckpoint);
        pastShiftGroups.set(canonicalShiftMeta.key, shiftGroup);
        didMigrate = true;
        return;
      }

      const normalizedCurrentCheckpoint = canonicalShiftStartAt > currentShiftStartAt
        ? {
            ...normalizedCheckpoint,
            shiftKey: safeCurrentShiftMeta.key,
          }
        : normalizedCheckpoint;

      if (matchedCheckpoint.shiftKey !== normalizedCurrentCheckpoint.shiftKey) {
        didMigrate = true;
      }

      currentShiftCheckpoints.set(String(baseCheckpoint.id), normalizedCurrentCheckpoint);
    });

    pastShiftGroups.forEach((shiftGroup, shiftKey) => {
      const shiftMeta = getShiftMetaFromKey(shiftKey);
      if (!shiftMeta) return;

      const historyCheckpoints = baseCheckpoints.map((baseCheckpoint) => (
        shiftGroup.get(String(baseCheckpoint.id)) || { ...baseCheckpoint }
      ));

      nextHistoryEntries = mergeHistoryEntries(nextHistoryEntries, [
        buildHistoryEntry({
          shiftMeta,
          checkpoints: historyCheckpoints,
          ship,
          shiftStatusRecords,
          users,
          weatherInfo: null,
        }),
      ]);
    });

    collection[ship.id] = baseCheckpoints.map((baseCheckpoint, index) => {
      const currentShiftCheckpoint = currentShiftCheckpoints.get(String(baseCheckpoint.id));
      if (currentShiftCheckpoint) return currentShiftCheckpoint;

      const matchedCheckpoint = matchedCheckpoints[index];
      if (matchedCheckpoint && matchedCheckpoint.status === 'pending' && !matchedCheckpoint.isTemporaryShiftNode) {
        const normalizedPendingCheckpoint = normalizeCheckpointRecordForShip(
          baseCheckpoint,
          matchedCheckpoint,
          ship,
          safeCurrentShiftMeta.key,
        );

        if (matchedCheckpoint.shiftKey !== normalizedPendingCheckpoint.shiftKey) {
          didMigrate = true;
        }

        return normalizedPendingCheckpoint;
      }

      return { ...baseCheckpoint };
    });

    return collection;
  }, {});

  return {
    activeShiftKey: safeCurrentShiftMeta.key,
    checkpointsByShip: nextCheckpointsByShip,
    historyEntries: sortHistoryEntries(nextHistoryEntries),
    shiftStatusRecords: retainShiftStatusRecordsForShift(shiftStatusRecords, safeCurrentShiftMeta.key),
    migrated: didMigrate,
  };
}

async function fetchWeatherSnapshotForCoordinates(gpsSnapshot, fallbackWeather = null) {
  if (gpsSnapshot?.lat == null || gpsSnapshot?.lng == null) return null;
  if (!isNavigatorOnline()) {
    return createFallbackWeatherSnapshot(fallbackWeather, gpsSnapshot);
  }

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${gpsSnapshot.lat}&longitude=${gpsSnapshot.lng}&current_weather=true`);
    if (!response.ok) return createFallbackWeatherSnapshot(fallbackWeather, gpsSnapshot);

    const payload = await response.json();
    if (!payload?.current_weather) return createFallbackWeatherSnapshot(fallbackWeather, gpsSnapshot);

    return {
      ...payload.current_weather,
      capturedAt: gpsSnapshot.capturedAt,
      source: gpsSnapshot.source,
      lat: gpsSnapshot.lat,
      lng: gpsSnapshot.lng,
    };
  } catch (error) {
    console.error('Gagal mengambil snapshot cuaca patroli', error);
    return createFallbackWeatherSnapshot(fallbackWeather, gpsSnapshot);
  }
}

async function capturePatrolEnvironmentSnapshot(ship, capturedAt = getTrustedDate().toISOString(), options = {}) {
  const { fallbackWeather = null } = options;
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

  const weatherSnapshot = await fetchWeatherSnapshotForCoordinates(gpsSnapshot, fallbackWeather);

  return {
    shipSnapshot,
    gpsSnapshot,
    weatherSnapshot,
  };
}

function sortHistoryEntries(entries) {
  return ensureArray(entries)
    .filter(entry => ensureObject(entry))
    .sort((left, right) => {
    const leftTimestamp = new Date(left.createdAt || '').getTime();
    const rightTimestamp = new Date(right.createdAt || '').getTime();

    if (!Number.isNaN(leftTimestamp) && !Number.isNaN(rightTimestamp) && leftTimestamp !== rightTimestamp) {
      return rightTimestamp - leftTimestamp;
    }

    const leftDateKey = String(left.dateKey || '');
    const rightDateKey = String(right.dateKey || '');
    if (leftDateKey !== rightDateKey) return rightDateKey.localeCompare(leftDateKey);
    return String(right.shift || '').localeCompare(String(left.shift || ''));
  });
}

function mergeCrewSnapshots(baseCrew = [], nextCrew = []) {
  return mergeEntitiesById(baseCrew, nextCrew, {
    getId: (item) => item?.id || item?.name,
    merge: (baseItem, nextItem) => ({ ...baseItem, ...nextItem }),
  });
}

function mergeHistoryEntryRecord(baseEntry, nextEntry) {
  if (!baseEntry) return nextEntry;
  if (!nextEntry) return baseEntry;

  const baseTimestamp = new Date(baseEntry?.createdAt || '').getTime();
  const nextTimestamp = new Date(nextEntry?.createdAt || '').getTime();
  const shouldUseNext = (
    Number.isNaN(baseTimestamp)
    || (!Number.isNaN(nextTimestamp) && nextTimestamp >= baseTimestamp)
  );
  const preferredEntry = shouldUseNext ? nextEntry : baseEntry;
  const fallbackEntry = shouldUseNext ? baseEntry : nextEntry;
  const mergedCheckpoints = mergeCheckpointsCollection(
    baseEntry?.checkpoints || [],
    nextEntry?.checkpoints || [],
  ).map((checkpoint) => ({
    ...checkpoint,
    readOnly: true,
    historyId: preferredEntry?.id || fallbackEntry?.id || checkpoint?.historyId || null,
    date: preferredEntry?.date || fallbackEntry?.date || checkpoint?.date || '',
  }));
  const mergedSummary = summarizePatrolCheckpoints(mergedCheckpoints);

  return {
    ...fallbackEntry,
    ...preferredEntry,
    id: preferredEntry?.id || fallbackEntry?.id,
    key: preferredEntry?.key || fallbackEntry?.key,
    crewSnapshot: mergeCrewSnapshots(
      baseEntry?.crewSnapshot || [],
      nextEntry?.crewSnapshot || [],
    ),
    checkpoints: mergedCheckpoints,
    summary: mergedSummary,
    points: mergedSummary.total,
    issue: mergedSummary.temuan,
    missed: mergedSummary.missed,
  };
}

function mergeHistoryEntries(previousEntries, nextEntries) {
  const merged = new Map();

  [...ensureArray(previousEntries), ...ensureArray(nextEntries)].forEach((entry) => {
    const mergeKey = entry?.key || entry?.id;
    if (!mergeKey) return;

    const existingEntry = merged.get(mergeKey);
    merged.set(mergeKey, existingEntry ? mergeHistoryEntryRecord(existingEntry, entry) : entry);
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

function getCheckpointVerificationPriority(checkpoint) {
  const auditFields = extractTimeAuditFields(checkpoint || {});

  if (Number.isFinite(auditFields.receivedAtServerMs) || auditFields.verificationStatus === 'verified') {
    return 3;
  }

  if (auditFields.verificationStatus === 'needs-review') return 2;
  if (auditFields.verificationStatus === 'pending-sync') return 1;
  return 0;
}

function getCheckpointEffectiveTimestamp(checkpoint) {
  const directTimestamp = (
    Number.isFinite(checkpoint?.occurredAtTrustedMs)
      ? checkpoint.occurredAtTrustedMs
      : new Date(
        checkpoint?.occurredAtTrustedIso
        || checkpoint?.updatedAt
        || checkpoint?.completedAt
        || checkpoint?.createdAt
        || '',
      ).getTime()
  );

  if (!Number.isNaN(directTimestamp) && directTimestamp > 0) return directTimestamp;
  return getCheckpointPriority(checkpoint);
}

function getCheckpointShiftStartTimestamp(checkpoint) {
  const shiftMeta = getShiftMetaFromKey(checkpoint?.shiftKey);
  if (!shiftMeta) return null;

  const shiftStartTimestamp = getShiftScheduleTimes(shiftMeta).startAt.getTime();
  return Number.isNaN(shiftStartTimestamp) ? null : shiftStartTimestamp;
}

function getCheckpointPendingOrigin(checkpoint) {
  return typeof checkpoint?.pendingOrigin === 'string'
    ? checkpoint.pendingOrigin
    : null;
}

function mergeCheckpointRecord(baseCheckpoint, nextCheckpoint) {
  if (!baseCheckpoint) return nextCheckpoint;
  if (!nextCheckpoint) return baseCheckpoint;

  const baseTimestamp = getCheckpointEffectiveTimestamp(baseCheckpoint);
  const nextTimestamp = getCheckpointEffectiveTimestamp(nextCheckpoint);
  const basePriority = getCheckpointPriority(baseCheckpoint);
  const nextPriority = getCheckpointPriority(nextCheckpoint);
  const baseVerificationPriority = getCheckpointVerificationPriority(baseCheckpoint);
  const nextVerificationPriority = getCheckpointVerificationPriority(nextCheckpoint);
  const baseShiftStartTimestamp = getCheckpointShiftStartTimestamp(baseCheckpoint);
  const nextShiftStartTimestamp = getCheckpointShiftStartTimestamp(nextCheckpoint);

  if (
    Number.isFinite(baseShiftStartTimestamp)
    && Number.isFinite(nextShiftStartTimestamp)
    && baseShiftStartTimestamp !== nextShiftStartTimestamp
  ) {
    const preferredCheckpoint = nextShiftStartTimestamp > baseShiftStartTimestamp
      ? nextCheckpoint
      : baseCheckpoint;
    const fallbackCheckpoint = preferredCheckpoint === nextCheckpoint
      ? baseCheckpoint
      : nextCheckpoint;

    return {
      ...fallbackCheckpoint,
      ...preferredCheckpoint,
      id: preferredCheckpoint.id || fallbackCheckpoint.id,
      name: preferredCheckpoint.name || fallbackCheckpoint.name,
    };
  }

  const baseIsPending = baseCheckpoint?.status === 'pending';
  const nextIsPending = nextCheckpoint?.status === 'pending';
  if (baseIsPending !== nextIsPending) {
    const pendingCheckpoint = baseIsPending ? baseCheckpoint : nextCheckpoint;
    const nonPendingCheckpoint = baseIsPending ? nextCheckpoint : baseCheckpoint;
    const pendingOrigin = getCheckpointPendingOrigin(pendingCheckpoint);
    const pendingTimestamp = getCheckpointEffectiveTimestamp(pendingCheckpoint);
    const nonPendingTimestamp = getCheckpointEffectiveTimestamp(nonPendingCheckpoint);
    const pendingShiftKey = String(pendingCheckpoint?.shiftKey || '');
    const nonPendingShiftKey = String(nonPendingCheckpoint?.shiftKey || '');
    const isSameShiftKey = Boolean(
      pendingShiftKey
      && nonPendingShiftKey
      && pendingShiftKey === nonPendingShiftKey
    );
    const shouldPreferPendingManualReset = (
      pendingOrigin === 'manual-reset'
      && pendingTimestamp >= nonPendingTimestamp
    );

    if (isSameShiftKey && !shouldPreferPendingManualReset) {
      return {
        ...pendingCheckpoint,
        ...nonPendingCheckpoint,
        id: nonPendingCheckpoint.id || pendingCheckpoint.id,
        name: nonPendingCheckpoint.name || pendingCheckpoint.name,
        photoUrl: resolveMergedAssetUrl(nonPendingCheckpoint.photoUrl, pendingCheckpoint.photoUrl),
      };
    }
  }

  const shouldUseNext = (
    nextTimestamp > baseTimestamp
    || (
      nextTimestamp === baseTimestamp
      && (
        nextPriority > basePriority
        || (
          nextPriority === basePriority
          && nextVerificationPriority >= baseVerificationPriority
        )
      )
    )
  );

  const preferredCheckpoint = shouldUseNext ? nextCheckpoint : baseCheckpoint;
  const fallbackCheckpoint = shouldUseNext ? baseCheckpoint : nextCheckpoint;

  return {
    ...fallbackCheckpoint,
    ...preferredCheckpoint,
    id: preferredCheckpoint.id || fallbackCheckpoint.id,
    name: preferredCheckpoint.name || fallbackCheckpoint.name,
    photoUrl: resolveMergedAssetUrl(preferredCheckpoint.photoUrl, fallbackCheckpoint.photoUrl),
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

function getAssetUrlPriority(url) {
  if (typeof url !== 'string' || !url) return 0;
  if (url.startsWith('https://')) return 4;
  if (url.startsWith('data:image/')) return 3;
  if (url.startsWith('idb://')) return 2;
  return 1;
}

function isPortableInlineAssetUrl(url) {
  return typeof url === 'string' && url.startsWith('data:image/svg+xml');
}

function isLocalOnlyAssetUrl(url) {
  return typeof url === 'string'
    && (
      url.startsWith('idb://')
      || (url.startsWith('data:image/') && !isPortableInlineAssetUrl(url))
    );
}

function collectLocalOnlyAssetUrls(stateSnapshot = {}) {
  const urls = new Set();
  const pushUrl = (url) => {
    if (isLocalOnlyAssetUrl(url)) {
      urls.add(url);
    }
  };

  Object.values(stateSnapshot.checkpointsByShip || {}).forEach((shipCheckpoints) => {
    ensureArray(shipCheckpoints).forEach((checkpoint) => {
      pushUrl(checkpoint?.photoUrl);
      ensureArray(checkpoint?.galleryPhotos).forEach((galleryPhoto) => pushUrl(galleryPhoto?.photoUrl));
    });
  });

  ensureArray(stateSnapshot.shipsData).forEach((ship) => pushUrl(ship?.photoUrl));
  ensureArray(stateSnapshot.usersData).forEach((user) => pushUrl(user?.photoUrl));
  ensureArray(stateSnapshot.incidentsData).forEach((incident) => pushUrl(incident?.photoUrl));

  Object.values(stateSnapshot.incidentMeta || {}).forEach((meta) => {
    ensureArray(meta?.documentation).forEach((item) => pushUrl(item?.photoUrl));
    ensureArray(meta?.progress).forEach((item) => pushUrl(item?.photoUrl));
  });

  ensureArray(stateSnapshot.historyEntries).forEach((entry) => {
    ensureArray(entry?.crewSnapshot).forEach((crew) => pushUrl(crew?.photoUrl));
    ensureArray(entry?.checkpoints).forEach((checkpoint) => {
      pushUrl(checkpoint?.photoUrl);
      ensureArray(checkpoint?.galleryPhotos).forEach((galleryPhoto) => pushUrl(galleryPhoto?.photoUrl));
    });
  });

  return Array.from(urls);
}

function resolveMergedAssetUrl(preferredUrl, fallbackUrl) {
  const safePreferredUrl = typeof preferredUrl === 'string' ? preferredUrl : '';
  const safeFallbackUrl = typeof fallbackUrl === 'string' ? fallbackUrl : '';
  const preferredPriority = getAssetUrlPriority(safePreferredUrl);
  const fallbackPriority = getAssetUrlPriority(safeFallbackUrl);

  // Prioritaskan URL aset yang bisa dipakai lintas-device agar snapshot cloud
  // tidak diturunkan lagi menjadi idb:// lokal milik perangkat lain.
  if (fallbackPriority > preferredPriority) {
    return safeFallbackUrl || safePreferredUrl || null;
  }

  return safePreferredUrl || safeFallbackUrl || null;
}

function mergeProgressItems(baseProgress = [], nextProgress = []) {
  return mergeEntitiesById(baseProgress, nextProgress, {
    getId: (item) => item?.id || item?.createdAt || item?.comment,
    merge: (baseItem, nextItem) => {
      const baseTimestamp = new Date(baseItem?.createdAt || '').getTime();
      const nextTimestamp = new Date(nextItem?.createdAt || '').getTime();
      const preferred = nextTimestamp >= baseTimestamp ? nextItem : baseItem;
      const fallback = nextTimestamp >= baseTimestamp ? baseItem : nextItem;
      return {
        ...fallback,
        ...preferred,
        comment: preferred.comment || fallback.comment || '',
        photoUrl: resolveMergedAssetUrl(preferred.photoUrl, fallback.photoUrl),
        author: preferred.author || fallback.author || '',
      };
    },
  });
}

function mergeDocumentationItems(baseDocumentation = [], nextDocumentation = []) {
  return mergeEntitiesById(baseDocumentation, nextDocumentation, {
    getId: (item) => item?.id || item?.createdAt || item?.photoUrl,
    merge: (baseItem, nextItem) => {
      const baseTimestamp = new Date(baseItem?.createdAt || '').getTime();
      const nextTimestamp = new Date(nextItem?.createdAt || '').getTime();
      const preferred = nextTimestamp >= baseTimestamp ? nextItem : baseItem;
      const fallback = nextTimestamp >= baseTimestamp ? baseItem : nextItem;
      return {
        ...fallback,
        ...preferred,
        photoUrl: resolveMergedAssetUrl(preferred.photoUrl, fallback.photoUrl),
        author: preferred.author || fallback.author || '',
      };
    },
  }).sort((left, right) => {
    const leftTimestamp = new Date(left?.createdAt || '').getTime();
    const rightTimestamp = new Date(right?.createdAt || '').getTime();
    return rightTimestamp - leftTimestamp;
  });
}

function getCheckpointContextShipKey(checkpoint) {
  return String(checkpoint?.shipId || checkpoint?.shipName || '');
}

function getCheckpointContextHistoryKey(checkpoint) {
  return String(checkpoint?.historyId || '');
}

function isCheckpointReadOnlyContext(checkpoint) {
  return Boolean(checkpoint?.readOnly || checkpoint?.historyId);
}

function isCheckpointContextCompatible(sourceCheckpoint, candidateCheckpoint) {
  if (!sourceCheckpoint || !candidateCheckpoint) return false;

  const sourceShipKey = getCheckpointContextShipKey(sourceCheckpoint);
  const candidateShipKey = getCheckpointContextShipKey(candidateCheckpoint);
  if (sourceShipKey && candidateShipKey && sourceShipKey !== candidateShipKey) {
    return false;
  }

  const sourceHistoryKey = getCheckpointContextHistoryKey(sourceCheckpoint);
  const candidateHistoryKey = getCheckpointContextHistoryKey(candidateCheckpoint);
  if (sourceHistoryKey || candidateHistoryKey) {
    return Boolean(sourceHistoryKey && sourceHistoryKey === candidateHistoryKey);
  }

  if (isCheckpointReadOnlyContext(sourceCheckpoint) !== isCheckpointReadOnlyContext(candidateCheckpoint)) {
    return false;
  }

  const sourceShiftKey = String(sourceCheckpoint?.shiftKey || '');
  const candidateShiftKey = String(candidateCheckpoint?.shiftKey || '');
  if (sourceShiftKey && candidateShiftKey && sourceShiftKey !== candidateShiftKey) {
    return false;
  }

  const sourceDateKey = String(sourceCheckpoint?.date || '');
  const candidateDateKey = String(candidateCheckpoint?.date || '');
  if (sourceDateKey && candidateDateKey && sourceDateKey !== candidateDateKey) {
    return false;
  }

  return true;
}

function resolveCanonicalCheckpointRecord(checkpoint, checkpointsByShip = {}, historyEntries = []) {
  if (!checkpoint) return null;

  const mergeKey = getCheckpointMergeKey(checkpoint);
  if (!mergeKey) return checkpoint;

  let bestCheckpoint = checkpoint;

  Object.values(checkpointsByShip || {}).forEach((shipCheckpoints) => {
    ensureArray(shipCheckpoints).forEach((candidateCheckpoint) => {
      if (getCheckpointMergeKey(candidateCheckpoint) !== mergeKey) return;
      if (!isCheckpointContextCompatible(checkpoint, candidateCheckpoint)) return;
      bestCheckpoint = mergeCheckpointRecord(bestCheckpoint, candidateCheckpoint);
    });
  });

  ensureArray(historyEntries).forEach((entry) => {
    ensureArray(entry?.checkpoints).forEach((candidateCheckpoint) => {
      if (getCheckpointMergeKey(candidateCheckpoint) !== mergeKey) return;
      if (!isCheckpointContextCompatible(checkpoint, candidateCheckpoint)) return;
      bestCheckpoint = mergeCheckpointRecord(bestCheckpoint, candidateCheckpoint);
    });
  });

  return bestCheckpoint;
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

function mergeIncidentMetaCollection(baseMeta = {}, nextMeta = {}) {
  const mergedMeta = { ...(baseMeta || {}) };

  Object.entries(nextMeta || {}).forEach(([incidentId, nextValue]) => {
    const baseValue = mergedMeta[incidentId] || {};
    mergedMeta[incidentId] = {
      ...baseValue,
      ...nextValue,
      status: nextValue?.status || baseValue.status || null,
      infoOverrides: {
        ...(baseValue.infoOverrides || {}),
        ...(nextValue?.infoOverrides || {}),
      },
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

function getSOSRecordTimestamp(sos) {
  const directTimestamp = (
    Number.isFinite(sos?.resolvedAtClientMs)
      ? sos.resolvedAtClientMs
      : Number.isFinite(sos?.updatedAtClientMs)
        ? sos.updatedAtClientMs
        : Number.isFinite(sos?.senderAcknowledgedAtClientMs)
          ? sos.senderAcknowledgedAtClientMs
          : Number.isFinite(sos?.occurredAtTrustedMs)
            ? sos.occurredAtTrustedMs
            : Number.isFinite(sos?.createdAtClientMs)
              ? sos.createdAtClientMs
              : new Date(
                sos?.resolvedAt
                || sos?.updatedAt
                || sos?.senderAcknowledgedAt
                || sos?.triggeredAt
                || sos?.createdAt
                || sos?.occurredAtTrustedIso
                || '',
              ).getTime()
  );

  if (!Number.isNaN(directTimestamp) && directTimestamp > 0) {
    return directTimestamp;
  }

  if (typeof sos?.id === 'number') {
    return sos.id;
  }

  return 0;
}

function mergeSOSRecordArrays(...collections) {
  return Array.from(new Set(
    collections
      .flatMap((collection) => (Array.isArray(collection) ? collection : []))
      .filter(Boolean),
  ));
}

function mergeSOSRecords(baseSOS = {}, nextSOS = {}) {
  const nextIsNewer = getSOSRecordTimestamp(nextSOS) >= getSOSRecordTimestamp(baseSOS);
  const newerSOS = nextIsNewer ? nextSOS : baseSOS;
  const olderSOS = nextIsNewer ? baseSOS : nextSOS;

  return {
    ...olderSOS,
    ...newerSOS,
    confirmedBy: mergeSOSRecordArrays(baseSOS.confirmedBy, nextSOS.confirmedBy),
    targetUserIds: mergeSOSRecordArrays(baseSOS.targetUserIds, nextSOS.targetUserIds),
    targetShipIds: mergeSOSRecordArrays(baseSOS.targetShipIds, nextSOS.targetShipIds),
    targetShipNames: mergeSOSRecordArrays(baseSOS.targetShipNames, nextSOS.targetShipNames),
  };
}

function mergeSOSHistoryCollection(baseHistory = [], nextHistory = []) {
  return mergeEntitiesById(baseHistory, nextHistory, {
    merge: (baseSOS, nextSOS) => mergeSOSRecords(baseSOS, nextSOS),
  }).sort((left, right) => getSOSRecordTimestamp(right) - getSOSRecordTimestamp(left));
}

function upsertSOSHistoryEntry(previousHistory = [], nextSOS) {
  return mergeSOSHistoryCollection(previousHistory, nextSOS ? [nextSOS] : []);
}

function resolveLatestActiveSOSAlert(sosEntries = []) {
  return sosEntries.find((entry) => sanitizeText(entry?.status || '', 20).toLowerCase() !== 'resolved') || null;
}

function mergeSharedStateSnapshots(baseState = {}, nextState = {}) {
  const deletedRecords = mergeDeletedRecords(baseState.deletedRecords || {}, nextState.deletedRecords || {});
  const resolvedActiveShiftKey = nextState.activeShiftKey || baseState.activeShiftKey || null;
  const baseUsers = normalizeUsersCollection(baseState.usersData || []);
  const nextUsers = normalizeUsersCollection(nextState.usersData || []);
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
  const mergedSOSHistory = mergeSOSHistoryCollection(
    [
      ...(Array.isArray(baseState.sosHistory) ? baseState.sosHistory : []),
      baseState.activeSOSAlert,
    ].filter(Boolean),
    [
      ...(Array.isArray(nextState.sosHistory) ? nextState.sosHistory : []),
      nextState.activeSOSAlert,
    ].filter(Boolean),
  );
  const mergedShiftStatusRecords = mergeShiftStatusRecords(
    baseState.shiftStatusRecords || {},
    nextState.shiftStatusRecords || {},
  );

  return createSharedStateSnapshot({
    activeShiftKey: resolvedActiveShiftKey,
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
    shiftStatusRecords: resolvedActiveShiftKey
      ? retainShiftStatusRecordsForShift(mergedShiftStatusRecords, resolvedActiveShiftKey)
      : mergedShiftStatusRecords,
    activeSOSAlert: resolveLatestActiveSOSAlert(mergedSOSHistory),
    sosHistory: mergedSOSHistory,
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
  return ensureArray(notifications)
    .filter(notification => ensureObject(notification))
    .sort((left, right) => new Date(right.createdAt || '').getTime() - new Date(left.createdAt || '').getTime());
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
function createFallbackEmail(name, index = 0) { const slug = sanitizeText(name, 80).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/(^[.]+|[.]+$)/g, '') || `user.${index + 1}`; return `${slug}@smartpatrol.local`; }
function normalizeUserRole(user) {
  const raw = sanitizeText(user?.role || '', 20).toUpperCase();
  if (ACCESS_ROLE_VALUES.includes(raw)) return raw;
  return ACCESS_ROLES.PETUGAS;
}

function normalizeUserRecord(user, index = 0) {
  const safeName = sanitizeText(user?.name || '', 80) || `User ${index + 1}`;
  const safeEmail = sanitizeEmail(user?.email || '') || sanitizeEmail(seedUsersById[user?.id]?.email || seedUsersByEmail[sanitizeEmail(user?.email || '')]?.email || createFallbackEmail(safeName, index));
  const seedUser = seedUsersById[user?.id] || seedUsersByEmail[safeEmail];
  const role = normalizeUserRole({ ...seedUser, ...user, name: safeName });
  const shipAssigned = sanitizeText(user?.shipAssigned || seedUser?.shipAssigned || '', 80) || null;
  const firebaseUid = sanitizeText(user?.firebaseUid || seedUser?.firebaseUid || '', 160) || '';
  const authProvider = firebaseUid
    ? 'firebase'
    : sanitizeText(user?.authProvider || seedUser?.authProvider || 'none', 20).toLowerCase();
  const fallbackStatus = role === ACCESS_ROLES.PETUGAS ? (shipAssigned ? 'active' : 'off-duty') : 'active';
  const status = sanitizeText(user?.status || seedUser?.status || fallbackStatus, 20).toLowerCase() || fallbackStatus;
  return {
    ...seedUser,
    ...user,
    id: user?.id || seedUser?.id || `u${Date.now()}${index}`,
    name: safeName,
    role,
    type: sanitizeText(user?.type || seedUser?.type || 'BUJP', 20) || 'BUJP',
    workerNumber: sanitizeText(user?.workerNumber || seedUser?.workerNumber || '', 40),
    status: role === ACCESS_ROLES.PETUGAS && !shipAssigned && status !== 'disabled' ? 'off-duty' : status,
    shipAssigned,
    email: safeEmail,
    password: '',
    hasCredential: false,
    passwordSalt: '',
    passwordHash: '',
    authProvider,
    firebaseUid: firebaseUid || null,
    phone: sanitizePhone(user?.phone || seedUser?.phone || ''),
    dob: sanitizeText(user?.dob || seedUser?.dob || '', 20),
    address: sanitizeMultilineText(user?.address || seedUser?.address || '', 180),
    emergencyName: sanitizeText(user?.emergencyName || seedUser?.emergencyName || '', 80),
    emergencyContact: sanitizePhone(user?.emergencyContact || seedUser?.emergencyContact || ''),
    emergencyRelation: sanitizeText(user?.emergencyRelation || seedUser?.emergencyRelation || 'Orang Tua', 40) || 'Orang Tua',
    officeAddress: sanitizeMultilineText(user?.officeAddress || seedUser?.officeAddress || '', 180),
    photoUrl: sanitizeUrl(user?.photoUrl || seedUser?.photoUrl || '') || createUserAvatar(safeName, index),
  };
}

function normalizeUsersCollection(users) {
  const sourceUsers = Array.isArray(users) && users.length > 0 ? users : getMockUsersList();
  const normalized = sourceUsers.map((user, index) => normalizeUserRecord(user, index));
  const adminSeed = getMockUsersList().find(u => u.id === 'u1');
  if (adminSeed && !normalized.some(u => u.id === 'u1')) normalized.unshift(normalizeUserRecord(adminSeed, 0));
  return normalized;
}

function getUserIdentityEmail(user) {
  return sanitizeEmail(user?.email || '');
}

function getUserIdentityFirebaseUid(user) {
  return sanitizeText(user?.firebaseUid || '', 160) || '';
}

function resolvePreferredUserRecord(users = [], options = {}) {
  const safeUsers = ensureArray(users).filter(user => ensureObject(user));
  if (safeUsers.length === 0) return null;

  const sessionUserId = sanitizeText(options.sessionUserId || '', 160) || '';
  const firebaseAuthEmail = getUserIdentityEmail({ email: options.firebaseAuthEmail });
  const firebaseAuthUid = getUserIdentityFirebaseUid({ firebaseUid: options.firebaseAuthUid });
  const sessionUser = sessionUserId
    ? safeUsers.find((user) => String(user?.id) === sessionUserId) || null
    : null;
  const sessionEmail = getUserIdentityEmail(sessionUser);
  const sessionFirebaseUid = getUserIdentityFirebaseUid(sessionUser);
  const hasIdentityContext = Boolean(
    sessionUserId
    || sessionEmail
    || sessionFirebaseUid
    || firebaseAuthEmail
    || firebaseAuthUid
  );

  let bestUser = sessionUser;
  let bestScore = sessionUser ? 1 : -1;

  safeUsers.forEach((user) => {
    const userEmail = getUserIdentityEmail(user);
    const userFirebaseUid = getUserIdentityFirebaseUid(user);
    const hasIdentityMatch = Boolean(
      (sessionUserId && String(user?.id) === sessionUserId)
      || (firebaseAuthUid && userFirebaseUid && userFirebaseUid === firebaseAuthUid)
      || (firebaseAuthEmail && userEmail && userEmail === firebaseAuthEmail)
      || (sessionEmail && userEmail && userEmail === sessionEmail)
      || (sessionFirebaseUid && userFirebaseUid && userFirebaseUid === sessionFirebaseUid)
    );

    if (hasIdentityContext && !hasIdentityMatch) return;

    let score = 0;
    if (sessionUserId && String(user?.id) === sessionUserId) score += 12;
    if (firebaseAuthUid && userFirebaseUid && userFirebaseUid === firebaseAuthUid) score += 120;
    if (firebaseAuthEmail && userEmail && userEmail === firebaseAuthEmail) score += 90;
    if (sessionEmail && userEmail && userEmail === sessionEmail) score += 18;
    if (sessionFirebaseUid && userFirebaseUid && userFirebaseUid === sessionFirebaseUid) score += 18;
    if (user?.status === 'active') score += 24;
    if (user?.shipAssigned) score += 24;
    if (userFirebaseUid) score += 6;
    if (user?.authProvider === 'firebase') score += 4;

    if (score > bestScore) {
      bestUser = user;
      bestScore = score;
    }
  });

  if (hasIdentityContext) {
    return bestUser || sessionUser || null;
  }

  return bestUser || safeUsers[0] || null;
}

function resolveAssignedShipForUser(user, ships = []) {
  if (!user || user.role === ACCESS_ROLES.ADMIN) return null;
  if (user.status !== 'active') return null;

  const safeShipAssigned = sanitizeText(user.shipAssigned || '', 80);
  if (!safeShipAssigned) return null;

  const matchingShips = ensureArray(ships).filter((ship) => ship?.name === safeShipAssigned);
  if (matchingShips.length === 0) return null;

  return matchingShips.find((ship) => (
    Array.isArray(ship?.personnel) && ship.personnel.includes(user.id)
  )) || matchingShips[0] || null;
}

function isFirebaseManagedUser(user) {
  return Boolean(user?.authProvider === 'firebase' || user?.firebaseUid);
}

function canUserAccessApplication(user) {
  if (!user) return false;
  if (user.role !== ACCESS_ROLES.PETUGAS) return true;
  return Boolean(user.shipAssigned && user.status === 'active');
}

function buildOperationalUserRecordFromAccess({
  access = {},
  profile = {},
  authUser = null,
  existingUser = null,
  users = [],
} = {}) {
  const safeEmail = sanitizeEmail(
    access.email
    || profile.email
    || authUser?.email
    || existingUser?.email
    || '',
  );
  const safeName = sanitizeText(
    profile.name
    || access.name
    || authUser?.displayName
    || existingUser?.name
    || safeEmail.split('@')[0]
    || 'Personil Operasional',
    80,
  ) || 'Personil Operasional';
  const nextUserId = existingUser?.id || profile.id || access.legacyUserId || `u${Date.now()}`;

  return normalizeUserRecord({
    ...(existingUser || {}),
    id: nextUserId,
    name: safeName,
    role: access.role || profile.role || existingUser?.role || ACCESS_ROLES.PETUGAS,
    type: profile.type || access.type || existingUser?.type || 'BUJP',
    workerNumber: profile.workerNumber || access.workerNumber || existingUser?.workerNumber || '',
    status: access.status || profile.status || existingUser?.status || 'off-duty',
    shipAssigned: access.shipAssigned || profile.shipAssigned || existingUser?.shipAssigned || null,
    email: safeEmail,
    phone: sanitizePhone(profile.phone || authUser?.phoneNumber || existingUser?.phone || ''),
    photoUrl: sanitizeUrl(profile.photoUrl || authUser?.photoURL || existingUser?.photoUrl || '') || createUserAvatar(safeName, users.length),
    authProvider: 'firebase',
    firebaseUid: authUser?.uid || access.uid || existingUser?.firebaseUid || null,
    hasCredential: false,
    passwordSalt: '',
    passwordHash: '',
  }, users.length);
}

function upsertOperationalUserRecord(users = [], payload = {}) {
  const safeUsers = Array.isArray(users) ? users : [];
  const access = payload?.access || {};
  const authUser = payload?.authUser || null;
  const profile = payload?.profile || {};
  const targetUser = safeUsers.find((user) => (
    (access.legacyUserId && String(user?.id) === String(access.legacyUserId))
    || (authUser?.uid && String(user?.firebaseUid || '') === String(authUser.uid))
    || (access.email && sanitizeEmail(user?.email || '') === sanitizeEmail(access.email))
  )) || null;
  const nextRecord = buildOperationalUserRecordFromAccess({
    access,
    profile,
    authUser,
    existingUser: targetUser,
    users: safeUsers,
  });

  if (!targetUser) {
    return [...safeUsers, nextRecord];
  }

  return safeUsers.map((user, index) => (
    user.id !== targetUser.id
      ? user
      : normalizeUserRecord({
          ...user,
          ...nextRecord,
          id: targetUser.id,
        }, index)
  ));
}

function readStorageSnapshot(primaryKey, legacyKey = '') {
  const keys = [primaryKey, legacyKey].filter(Boolean);
  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return raw;
    } catch {
      return null;
    }
  }
  return null;
}

function createPersistedUserSnapshot(user, sessionUserId = null) {
  const isSessionUser = Boolean(sessionUserId && String(user?.id) === String(sessionUserId));
  return {
    id: user?.id || null,
    name: sanitizeText(user?.name || '', 80) || 'User',
    role: normalizeUserRole(user),
    type: sanitizeText(user?.type || 'BUJP', 20) || 'BUJP',
    workerNumber: sanitizeText(user?.workerNumber || '', 40),
    status: sanitizeText(user?.status || '', 20) || 'off-duty',
    shipAssigned: sanitizeText(user?.shipAssigned || '', 80) || null,
    email: sanitizeEmail(user?.email || ''),
    phone: sanitizePhone(user?.phone || ''),
    photoUrl: sanitizeUrl(user?.photoUrl || '') || '',
    authProvider: sanitizeText(user?.authProvider || 'none', 20).toLowerCase(),
    firebaseUid: sanitizeText(user?.firebaseUid || '', 160) || null,
    ...(isSessionUser
      ? {
          dob: sanitizeText(user?.dob || '', 20),
          address: sanitizeMultilineText(user?.address || '', 180),
          officeAddress: sanitizeMultilineText(user?.officeAddress || '', 180),
          emergencyName: sanitizeText(user?.emergencyName || '', 80),
          emergencyContact: sanitizePhone(user?.emergencyContact || ''),
          emergencyRelation: sanitizeText(user?.emergencyRelation || '', 40) || 'Orang Tua',
        }
      : {}),
  };
}

function sanitizeStateForLocalPersistence(data, options = {}) {
  const sessionUserId = sanitizeText(options.sessionUserId || '', 160) || null;
  return {
    ...data,
    usersData: Array.isArray(data?.usersData)
      ? data.usersData.map((user) => createPersistedUserSnapshot(user, sessionUserId))
      : [],
  };
}

function loadPersistedState() {
  try {
    const raw = readStorageSnapshot(APP_STORAGE_KEY, LEGACY_APP_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !parsed?.data || typeof parsed.data !== 'object') {
      return null;
    }

    const normalizedData = normalizeSharedStateTimeAudit(parsed.data);
    return {
      ...parsed.data,
      ...normalizedData,
    };
  } catch {
    return null;
  }
}
function savePersistedState(data, options = {}) {
  try {
    const persistedData = sanitizeStateForLocalPersistence(data, options);
    window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data: persistedData }));
    window.localStorage.removeItem(LEGACY_APP_STORAGE_KEY);
    checkStorageQuota();
  } catch (error) {
    console.error('Gagal menyimpan data lokal', error);
  }
}
function loadWeatherCache() { try { const raw = readStorageSnapshot(WEATHER_STORAGE_KEY, LEGACY_WEATHER_STORAGE_KEY); if (!raw) return null; const parsed = JSON.parse(raw); if (!parsed?.savedAt || !parsed?.data) return null; if (Date.now() - new Date(parsed.savedAt).getTime() > WEATHER_TTL_MS) return null; return parsed.data; } catch { return null; } }
function saveWeatherCache(data) { try { window.localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data })); window.localStorage.removeItem(LEGACY_WEATHER_STORAGE_KEY); } catch (error) { console.error('Gagal menyimpan cache cuaca', error); } }
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

const CLOUD_SYNC_DEBOUNCE_MS = 600;
const URGENT_CLOUD_SYNC_DEBOUNCE_MS = 120;

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
  shiftStatusRecords,
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
    shiftStatusRecords: shiftStatusRecords && typeof shiftStatusRecords === 'object' ? shiftStatusRecords : {},
    activeSOSAlert,
    sosHistory,
  };
}

const CLOUD_SYNC_HISTORY_LIMIT_PER_SHIP = 12;
const CLOUD_SYNC_HISTORY_LIMIT_TOTAL = 24;
const CLOUD_SYNC_NOTIFICATION_LIMIT = 120;

function limitHistoryEntriesForCloudSync(entries = []) {
  const groupedEntries = new Map();

  sortHistoryEntries(entries).forEach((entry) => {
    const shipKey = String(entry?.shipId || entry?.ship || 'unknown');
    const shipEntries = groupedEntries.get(shipKey) || [];
    if (shipEntries.length >= CLOUD_SYNC_HISTORY_LIMIT_PER_SHIP) return;
    shipEntries.push(entry);
    groupedEntries.set(shipKey, shipEntries);
  });

  return sortHistoryEntries(Array.from(groupedEntries.values()).flat())
    .slice(0, CLOUD_SYNC_HISTORY_LIMIT_TOTAL);
}

function limitNotificationsForCloudSync(notifications = []) {
  return sortNotifications(notifications).slice(0, CLOUD_SYNC_NOTIFICATION_LIMIT);
}

function createCloudSyncStateSnapshot(stateSnapshot = {}) {
  return createSharedStateSnapshot({
    activeShiftKey: stateSnapshot.activeShiftKey,
    checkpointsByShip: stateSnapshot.checkpointsByShip,
    deletedRecords: stateSnapshot.deletedRecords,
    historyEntries: limitHistoryEntriesForCloudSync(stateSnapshot.historyEntries || []),
    incidentMeta: stateSnapshot.incidentMeta,
    incidentsData: stateSnapshot.incidentsData,
    notifications: limitNotificationsForCloudSync(stateSnapshot.notifications || []),
    shipsData: stateSnapshot.shipsData,
    usersData: stateSnapshot.usersData,
    shiftStatusRecords: retainShiftStatusRecordsForShift(
      stateSnapshot.shiftStatusRecords,
      stateSnapshot.activeShiftKey,
    ),
    activeSOSAlert: stateSnapshot.activeSOSAlert || null,
    sosHistory: stateSnapshot.sosHistory || [],
  });
}

function mapAuditableRecord(record, mapper, options = {}) {
  if (!record || typeof record !== 'object') return record;
  return mapper(record, options);
}

function mapAuditableRecordList(records = [], mapper, options = {}) {
  return Array.isArray(records)
    ? records.map((record) => mapAuditableRecord(record, mapper, options))
    : [];
}

function mapCheckpointAuditRecord(checkpoint, mapper) {
  if (!checkpoint || typeof checkpoint !== 'object') return checkpoint;

  return {
    ...mapAuditableRecord(checkpoint, mapper, {
      fallbackTimestampKeys: ['completedAt', 'updatedAt', 'createdAt'],
    }),
    galleryPhotos: mapAuditableRecordList(checkpoint.galleryPhotos || [], mapper, {
      fallbackTimestampKeys: ['createdAt'],
    }),
  };
}

function mapIncidentMetaAuditCollection(incidentMeta = {}, mapper) {
  return Object.fromEntries(
    Object.entries(incidentMeta || {}).map(([incidentId, meta]) => ([
      incidentId,
      {
        ...meta,
        documentation: mapAuditableRecordList(meta?.documentation || [], mapper, {
          fallbackTimestampKeys: ['createdAt'],
        }),
        progress: mapAuditableRecordList(meta?.progress || [], mapper, {
          fallbackTimestampKeys: ['createdAt'],
        }),
      },
    ])),
  );
}

function mapSharedStateTimeAudit(stateSnapshot = {}, mapper) {
  const snapshot = stateSnapshot && typeof stateSnapshot === 'object' ? stateSnapshot : {};

  return createSharedStateSnapshot({
    activeShiftKey: snapshot.activeShiftKey,
    checkpointsByShip: Object.fromEntries(
      Object.entries(snapshot.checkpointsByShip || {}).map(([shipId, shipCheckpoints]) => ([
        shipId,
        mapAuditableRecordList(shipCheckpoints || [], (record) => mapCheckpointAuditRecord(record, mapper)),
      ])),
    ),
    deletedRecords: snapshot.deletedRecords,
    historyEntries: mapAuditableRecordList(snapshot.historyEntries || [], (entry) => ({
      ...entry,
      checkpoints: mapAuditableRecordList(entry?.checkpoints || [], (record) => mapCheckpointAuditRecord(record, mapper)),
      crewSnapshot: Array.isArray(entry?.crewSnapshot) ? entry.crewSnapshot : [],
    })),
    incidentMeta: mapIncidentMetaAuditCollection(snapshot.incidentMeta, mapper),
    incidentsData: mapAuditableRecordList(snapshot.incidentsData || [], mapper, {
      fallbackTimestampKeys: ['completedAt', 'createdAt'],
    }),
    notifications: snapshot.notifications || [],
    shipsData: snapshot.shipsData || [],
    usersData: snapshot.usersData || [],
    shiftStatusRecords: retainShiftStatusRecordsForShift(
      snapshot.shiftStatusRecords,
      snapshot.activeShiftKey,
    ),
    activeSOSAlert: mapAuditableRecord(snapshot.activeSOSAlert, mapper, {
      fallbackTimestampKeys: ['triggeredAt', 'createdAt'],
    }),
    sosHistory: mapAuditableRecordList(snapshot.sosHistory || [], mapper, {
      fallbackTimestampKeys: ['triggeredAt', 'createdAt'],
    }),
  });
}

function normalizeSharedStateTimeAudit(stateSnapshot = {}) {
  return mapSharedStateTimeAudit(stateSnapshot, (record, options) => normalizeTimeAuditRecord(record, options));
}

function markSharedStateTimeAuditReceived(stateSnapshot = {}, receivedAtServerMs) {
  if (!Number.isFinite(receivedAtServerMs)) {
    return normalizeSharedStateTimeAudit(stateSnapshot);
  }

  return mapSharedStateTimeAudit(
    normalizeSharedStateTimeAudit(stateSnapshot),
    (record, options) => markTimeAuditRecordReceived(record, receivedAtServerMs, options),
  );
}

function resolveExternalTimestampMs(value) {
  if (Number.isFinite(value)) return value;

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  if (typeof value?.toMillis === 'function') {
    const timestamp = value.toMillis();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  if (typeof value === 'string' && value.trim()) {
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  return null;
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
  input.multiple = false;
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';
  if (cameraOnly) {
    input.capture = 'environment';
    input.setAttribute('capture', 'environment');
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      input.onchange = null;
      input.oncancel = null;
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }
      try {
        const dataUrl = await readImageFileAsDataUrl(file);
        cleanup();
        resolve(dataUrl);
      } catch (error) {
        console.error(error);
        cleanup();
        resolve(null);
      }
    };
    input.oncancel = () => {
      cleanup();
      resolve(null);
    };

    document.body.appendChild(input);
    input.click();
  });
}

async function pickLocalFile(accept = '.pdf,.doc,.docx,.xls,.xlsx,image/*') {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = false;
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';
  return new Promise((resolve) => {
    const cleanup = () => {
      input.onchange = null;
      input.oncancel = null;
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        cleanup();
        resolve({
          dataUrl,
          name: file.name,
          type: file.type,
        });
      } catch (error) {
        console.error(error);
        cleanup();
        resolve(null);
      }
    };
    input.oncancel = () => {
      cleanup();
      resolve(null);
    };

    document.body.appendChild(input);
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
      shiftMeta: shiftMetaFromParts('2026-04-02', 'shift-1-active'),
      checkpoints: firstShiftCheckpoints,
      ship,
      users: getMockUsersList(),
      weatherInfo: { temperature: 30, windspeed: 12, weathercode: 1 },
    }),
    buildHistoryEntry({
      shiftMeta: shiftMetaFromParts('2026-04-01', 'shift-3-active'),
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
  const initialCurrentShiftMeta = getShiftMeta(getTrustedDate());
  const initialShipsCollection = normalizeShipsCollection(persistedState?.shipsData || getInitialShipsData());
  const initialUsersCollection = normalizeUsersCollection(persistedState?.usersData || getMockUsersList());
  const initialRawCheckpointsByShip = createCheckpointsByShipState(
    initialShipsCollection,
    persistedState?.checkpointsByShip,
    persistedState?.checkpoints,
    null,
  );
  const initialShiftState = migrateCheckpointStateToCurrentShift({
    ships: initialShipsCollection,
    checkpointsByShip: initialRawCheckpointsByShip,
    historyEntries: sortHistoryEntries(persistedState?.historyEntries || createSeedHistoryEntries()),
    shiftStatusRecords: persistedState?.shiftStatusRecords || {},
    users: initialUsersCollection,
    currentShiftMeta: initialCurrentShiftMeta,
  });

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

  useEffect(() => initializeTrustedTime(), []);

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
  const [authAccessState, setAuthAccessState] = useState(null);
  const [authAccessBusy, setAuthAccessBusy] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authForm, setAuthForm] = useState(() => createAuthFormState());

  // Core data
  const [activeShiftKey, setActiveShiftKey] = useState(() => initialShiftState.activeShiftKey);
  const [checkpointsByShip, setCheckpointsByShip] = useState(() => initialShiftState.checkpointsByShip);
  const [shipsData, setShipsData] = useState(() => initialShipsCollection);
  const [usersData, setUsersData] = useState(() => initialUsersCollection);
  const [incidentsData, setIncidentsData] = useState(() => persistedState?.incidentsData || []);
  const [historyEntries, setHistoryEntries] = useState(() => initialShiftState.historyEntries);
  const [shiftStatusRecords, setShiftStatusRecords] = useState(() => initialShiftState.shiftStatusRecords || {});
  const [notifications, setNotifications] = useState(() => sortNotifications(persistedState?.notifications || []));
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [shiftClock, setShiftClock] = useState(() => getTrustedNowMs());
  const [activeSOSAlert, setActiveSOSAlert] = useState(() => persistedState?.activeSOSAlert || null);
  const [sosHistory, setSosHistory] = useState(() => persistedState?.sosHistory || []);
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const hasAppliedRoleLandingRef = useRef(false);
  const publicRegistrationFlowRef = useRef(false);

  // Crew migration effect
  useEffect(() => {
    if (shipsData.length === 0) return;
    const todayStr = getTrustedDate().toISOString().split('T')[0];
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
  const [showShiftStatusModal, setShowShiftStatusModal] = useState(false);
  const [cloudSyncBootstrapped, setCloudSyncBootstrapped] = useState(() => !isCloudSyncEnabled);
  const previousUsersDataRef = useRef(usersData);
  const lastSharedStateRef = useRef('');
  const lastCloudSharedStateRef = useRef('');
  const latestCloudSharedStateRef = useRef(null);
  const cloudAssetCacheRef = useRef(new Map());
  const localAssetAvailabilityRef = useRef(new Map());
  const cloudSyncPriorityRef = useRef('normal');
  const cloudSyncPriorityVersionRef = useRef(0);
  const cloudSaveQueueRef = useRef(Promise.resolve());
  const cloudFetchInFlightRef = useRef(false);
  const localSharedStateRef = useRef(null);
  const [cloudSyncKick, setCloudSyncKick] = useState(0);
  const requestCloudSync = useCallback((priority = 'normal') => {
    if (priority === 'urgent') {
      cloudSyncPriorityRef.current = 'urgent';
      cloudSyncPriorityVersionRef.current += 1;
    }

    setCloudSyncKick((previousValue) => previousValue + 1);
  }, []);

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
  const firebaseAuthUid = sanitizeText(firebaseAuthUser?.uid || '', 160) || '';
  const authAccessStatus = sanitizeText(authAccessState?.status || '', 20).toLowerCase() || 'anonymous';
  const authAccessEnabled = Boolean(authAccessState?.access?.enabled);
  const currentUserRecord = useMemo(() => {
    if (isFirebaseAuthEnabled) {
      if (!firebaseAuthReady || !firebaseAuthUser || !firebaseAuthEmail || !authAccessEnabled) {
        return null;
      }

      return resolvePreferredUserRecord(usersData, {
        sessionUserId,
        firebaseAuthEmail,
        firebaseAuthUid,
      }) || sessionUserRecord || null;
    }
    return resolvePreferredUserRecord(usersData, {
      sessionUserId,
      firebaseAuthUid: sessionUserRecord?.firebaseUid || '',
      firebaseAuthEmail: sessionUserRecord?.email || '',
    }) || sessionUserRecord;
  }, [authAccessEnabled, firebaseAuthEmail, firebaseAuthReady, firebaseAuthUid, firebaseAuthUser, sessionUserId, sessionUserRecord, usersData]);
  const effectiveSessionUser = isFirebaseAuthEnabled
    ? currentUserRecord
    : (currentUserRecord || sessionUserRecord || null);
  const currentUser = effectiveSessionUser?.name || '';
  const currentUserRole = effectiveSessionUser?.role || ACCESS_ROLES.PETUGAS;
  const isAdmin = currentUserRole === ACCESS_ROLES.ADMIN;
  const isPic = currentUserRole === ACCESS_ROLES.PIC;
  const isPetugas = currentUserRole === ACCESS_ROLES.PETUGAS;
  const currentUserId = effectiveSessionUser?.id || null;
  const hasOperationalCloudAccess = useMemo(() => {
    if (!isCloudSyncEnabled) return true;
    if (!isFirebaseAuthEnabled) return Boolean(sessionUserId);
    return Boolean(firebaseAuthUser && authAccessEnabled);
  }, [authAccessEnabled, firebaseAuthUser, sessionUserId]);
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
    const landingUser = effectiveSessionUser;

    if (!landingUser) {
      hasAppliedRoleLandingRef.current = false;
      return;
    }

    if (hasAppliedRoleLandingRef.current) return;

    const landingPage = getDefaultPageForRole(landingUser.role);
    setCurrentPage(landingPage);
    setNotificationReturnPage(landingPage);
    hasAppliedRoleLandingRef.current = true;
  }, [effectiveSessionUser]);

  const handleSOSTrigger = useCallback((lat, lng) => {
    if (!currentUserRecord) return;
    const trustedTimestamp = createTrustedTimestampRecord();
    const eventTimestampIso = trustedTimestamp.occurredAtTrustedIso;
    const senderShipName = sanitizeText(currentUserRecord.shipAssigned || '', 80) || 'Tidak diketahui';
    const sourceShip = shipsData.find((ship) => ship.name === senderShipName) || null;
    const targetShipIds = Array.from(new Set([
      sourceShip?.id || null,
      ...((sourceShip?.sosRecipientShipIds || []).filter(Boolean)),
    ].filter(Boolean)));
    const targetShipNames = targetShipIds
      .map((shipId) => shipsData.find((ship) => ship.id === shipId)?.name || '')
      .filter(Boolean);
    const targetUserIds = getSOSRecipientUserIds(senderShipName)
      .filter((userId) => userId !== currentUserRecord.id);
    const rawSOS = {
      id: `sos-${trustedTimestamp.occurredAtTrustedMs}-${Math.random().toString(36).slice(2, 8)}`,
      senderUserId: currentUserRecord.id || 'unknown',
      senderName: currentUserRecord.name || 'Unknown',
      senderRole: currentUserRecord.role || 'petugas',
      shipName: senderShipName,
      lat: lat !== undefined ? lat : null,
      lng: lng !== undefined ? lng : null,
      triggeredAt: eventTimestampIso,
      createdAt: eventTimestampIso,
      updatedAt: eventTimestampIso,
      targetUserIds,
      targetShipIds,
      targetShipNames,
      confirmedBy: [],
      status: 'active',
      ...trustedTimestamp,
    };
    
    // Default broad notification implementation
    const rawNotif = {
      id: `notif-sos-${trustedTimestamp.occurredAtTrustedMs}-${Math.random().toString(36).slice(2, 6)}`,
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
      createdAt: eventTimestampIso,
      timeTrustLevel: trustedTimestamp.timeTrustLevel,
      clockTamperDetected: trustedTimestamp.clockTamperDetected,
    };

    // Spread is sufficient — SOS and notification objects are flat (no nested Date/Map/circular refs)
    const newSOS = { ...rawSOS };
    const notification = { ...rawNotif };
    const nextSOSIncident = createSOSIncidentRecord(newSOS);

    setActiveSOSAlert(newSOS);
    setSosHistory((previousHistory) => upsertSOSHistoryEntry(previousHistory, newSOS));
    setNotifications(prev => [notification, ...prev]);
    setSelectedHistoryId(null);
    setSelectedReportDetail(null);
    setShowIncidentModal(false);
    setCurrentPage('incidents');
    if (nextSOSIncident) {
      setSelectedIncident(nextSOSIncident);
    }
    requestCloudSync('urgent');
  }, [currentUserRecord, getSOSRecipientUserIds, requestCloudSync, shipsData]);

  const resolveSOSActionTarget = useCallback((targetSOS = null) => {
    const targetId = typeof targetSOS === 'string'
      ? targetSOS
      : targetSOS?.id || activeSOSAlert?.id || null;

    if (!targetId) return null;
    if (activeSOSAlert?.id === targetId) return activeSOSAlert;
    return sosHistory.find((entry) => entry.id === targetId) || (typeof targetSOS === 'object' ? targetSOS : null);
  }, [activeSOSAlert, sosHistory]);

  const handleSOSConfirm = useCallback((targetSOS = null) => {
    const actionableSOS = resolveSOSActionTarget(targetSOS);
    if (!actionableSOS || !currentUserId) return;
    if (Array.isArray(actionableSOS.targetUserIds) && !actionableSOS.targetUserIds.includes(currentUserId)) return;

    const trustedTimestamp = createTrustedTimestampRecord();
    const updatedSOS = {
      ...actionableSOS,
      confirmedBy: [...new Set([...(actionableSOS.confirmedBy || []), currentUserId])],
      updatedAt: trustedTimestamp.occurredAtTrustedIso,
      updatedAtClientMs: trustedTimestamp.occurredAtClientMs,
      updatedTimeTrustLevel: trustedTimestamp.timeTrustLevel,
      updatedClockTamperDetected: trustedTimestamp.clockTamperDetected,
    };

    setActiveSOSAlert((previousAlert) => (
      previousAlert?.id === updatedSOS.id ? updatedSOS : previousAlert
    ));
    setSosHistory((previousHistory) => upsertSOSHistoryEntry(previousHistory, updatedSOS));
    requestCloudSync('urgent');
  }, [currentUserId, requestCloudSync, resolveSOSActionTarget]);

  const handleSOSAcknowledgeSelf = useCallback((targetSOS = null) => {
    const actionableSOS = resolveSOSActionTarget(targetSOS);
    if (!actionableSOS || !currentUserId) return;
    if (actionableSOS.senderUserId !== currentUserId) return;

    const trustedTimestamp = createTrustedTimestampRecord();
    const updatedSOS = {
      ...actionableSOS,
      senderAcknowledgedAt: trustedTimestamp.occurredAtTrustedIso,
      senderAcknowledgedBy: currentUserId,
      senderAcknowledgedAtClientMs: trustedTimestamp.occurredAtClientMs,
      senderAcknowledgedTimeTrustLevel: trustedTimestamp.timeTrustLevel,
      senderAcknowledgedClockTamperDetected: trustedTimestamp.clockTamperDetected,
      updatedAt: trustedTimestamp.occurredAtTrustedIso,
      updatedAtClientMs: trustedTimestamp.occurredAtClientMs,
      updatedTimeTrustLevel: trustedTimestamp.timeTrustLevel,
      updatedClockTamperDetected: trustedTimestamp.clockTamperDetected,
    };

    setActiveSOSAlert((previousAlert) => (
      previousAlert?.id === updatedSOS.id ? updatedSOS : previousAlert
    ));
    setSosHistory((previousHistory) => upsertSOSHistoryEntry(previousHistory, updatedSOS));
    requestCloudSync('urgent');
  }, [currentUserId, requestCloudSync, resolveSOSActionTarget]);

  const handleSOSDismiss = useCallback((targetSOS = null) => {
    const actionableSOS = resolveSOSActionTarget(targetSOS);
    if (!actionableSOS) return;
    const trustedTimestamp = createTrustedTimestampRecord();
    
    const updatedSOS = {
      ...actionableSOS,
      status: 'resolved',
      resolvedAt: trustedTimestamp.occurredAtTrustedIso,
      resolvedBy: currentUserRecord?.name || 'Sistem',
      resolvedAtClientMs: trustedTimestamp.occurredAtClientMs,
      resolvedTimeTrustLevel: trustedTimestamp.timeTrustLevel,
      resolvedClockTamperDetected: trustedTimestamp.clockTamperDetected,
      updatedAt: trustedTimestamp.occurredAtTrustedIso,
      updatedAtClientMs: trustedTimestamp.occurredAtClientMs,
      updatedTimeTrustLevel: trustedTimestamp.timeTrustLevel,
      updatedClockTamperDetected: trustedTimestamp.clockTamperDetected,
    };

    setActiveSOSAlert((previousAlert) => (
      previousAlert?.id === updatedSOS.id ? null : previousAlert
    ));
    setSosHistory((previousHistory) => upsertSOSHistoryEntry(previousHistory, updatedSOS));
    requestCloudSync('urgent');
  }, [currentUserRecord, requestCloudSync, resolveSOSActionTarget]);

  const assignedShipForCurrentUser = useMemo(() => {
    return resolveAssignedShipForUser(currentUserRecord, shipsData);
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
  const activeOperationalGuards = useMemo(
    () => ensureArray(usersData).filter(user => (
      user.shipAssigned === operationalShipName
      && user.status === 'active'
      && user.role === ACCESS_ROLES.PETUGAS
    )),
    [operationalShipName, usersData],
  );
  const currentShiftStatusRecord = useMemo(
    () => getShiftStatusRecordForShipShift(shiftStatusRecords, operationalShip?.id, currentShiftMeta.key),
    [currentShiftMeta.key, operationalShip?.id, shiftStatusRecords],
  );
  const checkpoints = useMemo(() => {
    if (!operationalShip?.id) return [];
    return ensureArray(checkpointsByShip[operationalShip.id]).filter(checkpoint => ensureObject(checkpoint));
  }, [checkpointsByShip, operationalShip?.id]);
  const adminLiveHistoryEntries = useMemo(() => {
    if (!isAdmin || !currentUserRecord || !currentShiftMeta?.key) return [];

    return ensureArray(shipsData)
      .filter(ship => ensureObject(ship) && (ship.id || ship.name))
      .map((ship) => {
        const shipCheckpoints = ensureArray(checkpointsByShip?.[ship.id]).filter(checkpoint => ensureObject(checkpoint));
        const shipShiftStatusRecord = getShiftStatusRecordForShipShift(shiftStatusRecords, ship.id, currentShiftMeta.key);
        const liveEntry = buildLiveHistoryEntry({
          shiftMeta: currentShiftMeta,
          checkpoints: shipCheckpoints,
          ship,
          users: usersData,
          shiftStatusRecord: shipShiftStatusRecord,
        });

        if (!liveEntry) return null;

        const hasOngoingPatrol = liveEntry.crewSnapshot.length > 0
          || ensureArray(shipShiftStatusRecord?.items).length > 0
          || liveEntry.summary.completed > 0;

        return hasOngoingPatrol ? liveEntry : null;
      })
      .filter(Boolean)
      .sort((left, right) => (
        (Number(right?.summary?.completed) || 0) - (Number(left?.summary?.completed) || 0)
        || String(left?.ship || '').localeCompare(String(right?.ship || ''))
      ));
  }, [checkpointsByShip, currentShiftMeta, currentUserRecord, isAdmin, shiftStatusRecords, shipsData, usersData]);
  const visibleHistoryEntries = useMemo(() => {
    if (!currentUserRecord) return [];
    const safeHistoryEntries = ensureArray(historyEntries).filter(entry => ensureObject(entry));
    if (isAdmin) return [...adminLiveHistoryEntries, ...safeHistoryEntries];
    if (isPic) return safeHistoryEntries;
    if (!assignedShipForCurrentUser) return [];
    return safeHistoryEntries.filter(entry => (
      entry.shipSnapshot?.id === assignedShipForCurrentUser.id
      || entry.ship === assignedShipForCurrentUser.name
    ));
  }, [adminLiveHistoryEntries, assignedShipForCurrentUser, currentUserRecord, historyEntries, isAdmin, isPic]);
  const selectedHistoryEntry = useMemo(() => visibleHistoryEntries.find(entry => entry.id === selectedHistoryId) || null, [visibleHistoryEntries, selectedHistoryId]);
  const notificationRecipientIds = useMemo(() => Array.from(new Set([
    currentUserId,
    firebaseAuthUid,
  ].filter(Boolean))), [currentUserId, firebaseAuthUid]);
  const notificationReadIdentityIds = notificationRecipientIds;
  const notificationWriteIdentityId = currentUserId || firebaseAuthUid || '';
  const visibleNotifications = useMemo(() => {
    if (notificationRecipientIds.length === 0) return [];
    return ensureArray(notifications).filter((notification) => (
      ensureObject(notification)
      && Array.isArray(notification.targetUserIds)
      && notification.targetUserIds.some((targetUserId) => notificationRecipientIds.includes(targetUserId))
    ));
  }, [notificationRecipientIds, notifications]);
  const unreadNotificationCount = useMemo(() => {
    if (notificationReadIdentityIds.length === 0) return 0;
    return visibleNotifications.filter((notification) => !(
      Array.isArray(notification?.readByUserIds) ? notification.readByUserIds : []
    ).some((readIdentity) => notificationReadIdentityIds.includes(readIdentity))).length;
  }, [notificationReadIdentityIds, visibleNotifications]);
  const filteredCheckpoints = useMemo(() => {
    const safeLookup = String(deferredSearchQuery || '').toLowerCase();
    return checkpoints.filter(checkpoint => String(checkpoint?.name || '').toLowerCase().includes(safeLookup));
  }, [checkpoints, deferredSearchQuery]);
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
  const completedCount = useMemo(() => checkpoints.filter(checkpoint => checkpoint?.status === 'completed').length, [checkpoints]);
  const totalCount = checkpoints.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const activePatrolId = useMemo(() => Object.keys(ensureObject(activeForms) || {})[0], [activeForms]);
  const activePatrolState = useMemo(() => activePatrolId ? activeForms[activePatrolId] : null, [activeForms, activePatrolId]);
  const activePatrolItem = useMemo(() => activePatrolId ? checkpoints.find(c => String(c.id) === String(activePatrolId)) : null, [activePatrolId, checkpoints]);
  const canPatrolCurrentShip = Boolean(currentUserRecord && operationalShip && (isPic || (isPetugas && assignedShipForCurrentUser?.id === operationalShip.id)));
  const isShiftStatusRequired = Boolean(
    canPatrolCurrentShip
    && operationalShip?.id
    && !selectedHistoryEntry
    && activeOperationalGuards.length > 0
  );
  const isCurrentShiftStatusCompleted = !isShiftStatusRequired || doesShiftStatusRecordCoverGuards(
    currentShiftStatusRecord,
    activeOperationalGuards,
  );
  const canAddTemporaryPatrolNode = Boolean(isPetugas && canPatrolCurrentShip && operationalShip && !selectedHistoryEntry);
  const shouldForcePatrolCameraCapture = isMobilePatrolViewport();

  const canManageIncident = useCallback((incident) => {
    if (!currentUserRecord || !incident) return false;
    if (isAdmin || isPic) return true;
    if (!isPetugas) return false;
    return Boolean(assignedShipForCurrentUser && incident.shipName === assignedShipForCurrentUser.name);
  }, [assignedShipForCurrentUser, currentUserRecord, isAdmin, isPic, isPetugas]);
  const canCloseIncident = useCallback((incident) => Boolean(currentUserRecord && incident && (isAdmin || isPic)), [currentUserRecord, isAdmin, isPic]);
  const getCanonicalCheckpointRecord = useCallback((checkpoint) => (
    resolveCanonicalCheckpointRecord(checkpoint, checkpointsByShip, historyEntries)
  ), [checkpointsByShip, historyEntries]);
  const sharedState = useMemo(() => normalizeSharedStateTimeAudit(createSharedStateSnapshot({
    activeShiftKey,
    checkpointsByShip,
    deletedRecords,
    historyEntries,
    incidentMeta,
    incidentsData,
    notifications,
    shipsData,
    usersData,
    shiftStatusRecords,
    activeSOSAlert,
    sosHistory,
  })), [
    activeShiftKey,
    checkpointsByShip,
    deletedRecords,
    historyEntries,
    incidentMeta,
    incidentsData,
    notifications,
    shipsData,
    usersData,
    shiftStatusRecords,
    activeSOSAlert,
    sosHistory,
  ]);
  useEffect(() => {
    localSharedStateRef.current = sharedState;
  }, [sharedState]);
  const hasUploadableLocalAssets = useCallback(async (stateSnapshot) => {
    const candidateUrls = collectLocalOnlyAssetUrls(stateSnapshot);

    for (const photoUrl of candidateUrls) {
      if (photoUrl.startsWith('data:image/')) {
        return true;
      }

      const cachedAvailability = localAssetAvailabilityRef.current.get(photoUrl);
      if (cachedAvailability === true) {
        return true;
      }

      if (cachedAvailability === false) {
        continue;
      }

      try {
        const dataUrl = await loadImageFromDB(photoUrl);
        const isAvailable = Boolean(dataUrl);
        localAssetAvailabilityRef.current.set(photoUrl, isAvailable);
        if (isAvailable) {
          return true;
        }
      } catch {
        localAssetAvailabilityRef.current.set(photoUrl, false);
      }
    }

    return false;
  }, []);
  const prepareCloudPhotoUrl = useCallback(async (photoUrl, pathSegments) => {
    if (!photoUrl || typeof photoUrl !== 'string') return photoUrl || null;
    if (cloudAssetCacheRef.current.has(photoUrl)) {
      return cloudAssetCacheRef.current.get(photoUrl) || null;
    }

    if (isPortableInlineAssetUrl(photoUrl)) {
      cloudAssetCacheRef.current.set(photoUrl, photoUrl);
      return photoUrl;
    }

    const isIndexedDbAsset = photoUrl.startsWith('idb://');
    const isInlineDataAsset = photoUrl.startsWith('data:');
    if (!isIndexedDbAsset && !isInlineDataAsset) return photoUrl;
    if (isIndexedDbAsset && localAssetAvailabilityRef.current.get(photoUrl) === false) {
      return photoUrl;
    }

    const dataUrl = isInlineDataAsset ? photoUrl : await loadImageFromDB(photoUrl);
    if (!dataUrl) {
      localAssetAvailabilityRef.current.set(photoUrl, false);
      return photoUrl;
    }

    if (isIndexedDbAsset) {
      localAssetAvailabilityRef.current.set(photoUrl, true);
    }

    try {
      const uploadedUrl = await uploadCloudDataUrlAsset({
        dataUrl,
        path: createCloudAssetPath(...pathSegments),
      });

      const resolvedUrl = uploadedUrl || photoUrl;
      cloudAssetCacheRef.current.set(photoUrl, resolvedUrl);
      return resolvedUrl;
    } catch (error) {
      console.error('Gagal upload aset patroli ke cloud', error);
      return photoUrl;
    }
  }, []);
  const prepareSharedStateForCloudSync = useCallback(async (stateSnapshot) => {
    const boundedStateSnapshot = createCloudSyncStateSnapshot(stateSnapshot);
    const preparedCheckpointsByShip = Object.fromEntries(await Promise.all(
      Object.entries(boundedStateSnapshot.checkpointsByShip || {}).map(async ([shipId, shipCheckpoints]) => ([
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

    const preparedShipsData = await Promise.all((boundedStateSnapshot.shipsData || []).map(async (ship) => ({
      ...ship,
      photoUrl: await prepareCloudPhotoUrl(
        ship.photoUrl,
        ['ships', ship.id, 'cover', ship.photoUrl],
      ),
    })));

    const preparedUsersData = await Promise.all((boundedStateSnapshot.usersData || []).map(async (user) => ({
      ...user,
      photoUrl: await prepareCloudPhotoUrl(
        user.photoUrl,
        ['users', user.id, 'avatar', user.photoUrl],
      ),
    })));

    const preparedIncidentsData = await Promise.all((boundedStateSnapshot.incidentsData || []).map(async (incident) => ({
      ...incident,
      photoUrl: await prepareCloudPhotoUrl(
        incident.photoUrl,
        ['incidents', incident.id, 'photo', incident.photoUrl],
      ),
    })));

    const preparedIncidentMeta = Object.fromEntries(await Promise.all(
      Object.entries(boundedStateSnapshot.incidentMeta || {}).map(async ([incidentId, meta]) => ([
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

    const preparedHistoryEntries = await Promise.all((boundedStateSnapshot.historyEntries || []).map(async (entry) => ({
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

    return createCloudSyncStateSnapshot({
      activeShiftKey: boundedStateSnapshot.activeShiftKey,
      checkpointsByShip: preparedCheckpointsByShip,
      deletedRecords: boundedStateSnapshot.deletedRecords,
      historyEntries: preparedHistoryEntries,
      incidentMeta: preparedIncidentMeta,
      incidentsData: preparedIncidentsData,
      notifications: boundedStateSnapshot.notifications || [],
      shipsData: preparedShipsData,
      usersData: preparedUsersData,
      shiftStatusRecords: boundedStateSnapshot.shiftStatusRecords || {},
      activeSOSAlert: boundedStateSnapshot.activeSOSAlert || null,
      sosHistory: boundedStateSnapshot.sosHistory || [],
    });
  }, [prepareCloudPhotoUrl]);
  const applyCloudSharedState = useCallback((nextState, options = {}) => {
    if (!nextState || typeof nextState !== 'object') return null;
    const receivedAtServerMs = resolveExternalTimestampMs(options.receivedAtServerMs);

    const nextShips = normalizeShipsCollection(nextState.shipsData || getInitialShipsData());
    const nextUsers = normalizeUsersCollection(nextState.usersData || getMockUsersList());
    const nextCheckpointsByShip = createCheckpointsByShipState(
      nextShips,
      nextState.checkpointsByShip,
      nextState.checkpoints,
      null,
    );
    const incomingShiftState = migrateCheckpointStateToCurrentShift({
      ships: nextShips,
      checkpointsByShip: nextCheckpointsByShip,
      historyEntries: sortHistoryEntries(nextState.historyEntries || createSeedHistoryEntries()),
      shiftStatusRecords: nextState.shiftStatusRecords || {},
      users: nextUsers,
      currentShiftMeta: getShiftMeta(),
    });
    const incomingState = normalizeSharedStateTimeAudit(createSharedStateSnapshot({
      activeShiftKey: incomingShiftState.activeShiftKey,
      checkpointsByShip: incomingShiftState.checkpointsByShip,
      deletedRecords: nextState.deletedRecords,
      historyEntries: incomingShiftState.historyEntries,
      incidentMeta: nextState.incidentMeta && typeof nextState.incidentMeta === 'object' ? nextState.incidentMeta : {},
      incidentsData: Array.isArray(nextState.incidentsData) ? nextState.incidentsData : [],
      notifications: sortNotifications(nextState.notifications || []),
      shipsData: nextShips,
      usersData: nextUsers,
      shiftStatusRecords: incomingShiftState.shiftStatusRecords || {},
      activeSOSAlert: nextState.activeSOSAlert || null,
      sosHistory: nextState.sosHistory || [],
    }));
    const auditedIncomingState = receivedAtServerMs !== null
      ? markSharedStateTimeAuditReceived(incomingState, receivedAtServerMs)
      : incomingState;
    const normalizedCloudState = mergeSharedStateSnapshots({}, auditedIncomingState);
    const serializedCloudState = serializeSharedStateSnapshot(normalizedCloudState);
    const currentLocalState = localSharedStateRef.current || {};
    const resolvedActiveShiftKey = resolveLatestShiftKey(
      [currentLocalState.activeShiftKey, normalizedCloudState.activeShiftKey],
      getShiftMeta(),
    );
    const mergedState = createSharedStateSnapshot({
      ...mergeSharedStateSnapshots(currentLocalState, normalizedCloudState),
      activeShiftKey: resolvedActiveShiftKey,
    });
    const normalizedShiftState = migrateCheckpointStateToCurrentShift({
      ships: mergedState.shipsData,
      checkpointsByShip: mergedState.checkpointsByShip,
      historyEntries: mergedState.historyEntries,
      shiftStatusRecords: mergedState.shiftStatusRecords || {},
      users: mergedState.usersData,
      currentShiftMeta: getShiftMeta(),
    });
    const normalizedState = createSharedStateSnapshot({
      ...mergedState,
      activeShiftKey: normalizedShiftState.activeShiftKey,
      checkpointsByShip: normalizedShiftState.checkpointsByShip,
      historyEntries: normalizedShiftState.historyEntries,
      shiftStatusRecords: normalizedShiftState.shiftStatusRecords || {},
    });
    const serializedState = serializeSharedStateSnapshot(normalizedState);
    latestCloudSharedStateRef.current = normalizedCloudState;
    lastCloudSharedStateRef.current = serializedCloudState;

    if (serializedState === lastSharedStateRef.current) return normalizedState;

    const flattenedCheckpoints = [
      ...Object.values(normalizedState.checkpointsByShip || {}).flat(),
      ...normalizedState.historyEntries.flatMap((entry) => entry.checkpoints || []),
    ];

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
    setShiftStatusRecords(normalizedState.shiftStatusRecords || {});
    setNotifications(normalizedState.notifications);
    setActiveSOSAlert(normalizedState.activeSOSAlert);
    setSosHistory(normalizedState.sosHistory);
    setSelectedReportDetail((previousReport) => {
      if (!previousReport) return previousReport;

      // Prefer a context-compatible checkpoint (matching historyId for read-only
      // history reports) to avoid overwriting documentation with a pending
      // current-shift checkpoint that shares the same id but has no data.
      const matchedCheckpoint = flattenedCheckpoints.find((checkpoint) => (
        String(checkpoint?.id) === String(previousReport.id)
        && isCheckpointContextCompatible(previousReport, checkpoint)
      )) || (
        // Fallback to any id match ONLY if the report is NOT a read-only
        // history entry — prevents pending checkpoints wiping documentation.
        !previousReport.readOnly && !previousReport.historyId
        && flattenedCheckpoints.find((checkpoint) => (
          String(checkpoint?.id) === String(previousReport.id)
        ))
      );

      if (!matchedCheckpoint) return previousReport;

      return {
        ...previousReport,
        ...matchedCheckpoint,
        // Preserve the display-critical flags from the original report context
        readOnly: previousReport.readOnly,
        historyId: previousReport.historyId || matchedCheckpoint.historyId || null,
        // Preserve documentation fields — use matched if present, else keep original
        resultType: matchedCheckpoint.resultType || previousReport.resultType,
        photoUrl: resolveMergedAssetUrl(matchedCheckpoint.photoUrl, previousReport.photoUrl),
        galleryPhotos: (matchedCheckpoint.galleryPhotos?.length ? matchedCheckpoint.galleryPhotos : null)
          || previousReport.galleryPhotos || [],
        kejadian: matchedCheckpoint.kejadian || previousReport.kejadian || '',
        penyebab: matchedCheckpoint.penyebab || previousReport.penyebab || '',
        tindakLanjut: matchedCheckpoint.tindakLanjut || previousReport.tindakLanjut || '',
        shipName: matchedCheckpoint.shipName || previousReport.shipName,
        date: matchedCheckpoint.date || previousReport.date,
        shipSnapshot: matchedCheckpoint.shipSnapshot ?? previousReport.shipSnapshot ?? null,
        gpsSnapshot: matchedCheckpoint.gpsSnapshot ?? previousReport.gpsSnapshot ?? null,
        weatherSnapshot: matchedCheckpoint.weatherSnapshot ?? previousReport.weatherSnapshot ?? null,
      };
    });
    setSelectedIncident((previousIncident) => {
      if (!previousIncident) return previousIncident;

      if (previousIncident.isSOS) {
        const matchedSOS = (
          normalizedState.activeSOSAlert?.id === previousIncident.id
            ? normalizedState.activeSOSAlert
            : normalizedState.sosHistory.find((entry) => entry.id === previousIncident.id)
        );

        if (!matchedSOS) return previousIncident;
        return {
          ...previousIncident,
          ...createSOSIncidentRecord(matchedSOS),
        };
      }

      if (previousIncident.isPatrol) {
        if (previousIncident.readOnly) return previousIncident;

        const matchedCheckpoint = flattenedCheckpoints.find((checkpoint) => (
          createPatrolIncidentId(checkpoint) === previousIncident.id
          && checkpoint.resultType === 'temuan'
        ));

        if (!matchedCheckpoint) return previousIncident;
        return {
          ...previousIncident,
          ...createPatrolIncidentRecord(matchedCheckpoint, {
            fallbackShipName: matchedCheckpoint.shipName || previousIncident.shipName,
            fallbackDate: matchedCheckpoint.date || previousIncident.date,
            readOnly: previousIncident.readOnly,
          }),
        };
      }

      const matchedIncident = normalizedState.incidentsData.find((incident) => (
        String(incident?.id) === String(previousIncident.id)
      ));

      return matchedIncident
        ? { ...previousIncident, ...matchedIncident }
        : previousIncident;
    });
    return normalizedState;
  }, []);
  const handleIncomingCloudPayload = useCallback((cloudPayload, options = {}) => {
    const shouldClearState = options.clearWhenEmpty !== false;
    const payloadState = cloudPayload?.state && typeof cloudPayload.state === 'object'
      ? cloudPayload.state
      : null;

    setCloudSyncBootstrapped(true);

    logCloudSyncDebug('snapshot-received', {
      source: options.source || 'snapshot',
      hasState: Boolean(payloadState),
      activeShiftKey: payloadState?.activeShiftKey || null,
      notifications: Array.isArray(payloadState?.notifications) ? payloadState.notifications.length : 0,
      historyEntries: Array.isArray(payloadState?.historyEntries) ? payloadState.historyEntries.length : 0,
    });

    if (!payloadState) {
      if (shouldClearState) {
        latestCloudSharedStateRef.current = null;
        lastCloudSharedStateRef.current = '';
      }
      return null;
    }

    const cloudReceivedAtMs = resolveExternalTimestampMs(cloudPayload?.updatedAt)
      || resolveExternalTimestampMs(cloudPayload?.clientUpdatedAt)
      || resolveExternalTimestampMs(options.receivedAtServerMs)
      || getTrustedNowMs();

    return applyCloudSharedState(payloadState, {
      receivedAtServerMs: cloudReceivedAtMs,
    });
  }, [applyCloudSharedState]);
  const refreshCloudSharedState = useCallback(async (options = {}) => {
    if (!isCloudSyncEnabled || cloudFetchInFlightRef.current) return null;

    cloudFetchInFlightRef.current = true;
    try {
      const cloudPayload = await fetchCloudAppState({
        preferServer: options.preferServer !== false,
      });
      return handleIncomingCloudPayload(cloudPayload, {
        source: options.source || 'manual-refresh',
        clearWhenEmpty: options.clearWhenEmpty,
        receivedAtServerMs: options.receivedAtServerMs,
      });
    } catch (error) {
      setCloudSyncBootstrapped(true);
      console.error('Gagal menarik state patroli cloud', error);
      return null;
    } finally {
      cloudFetchInFlightRef.current = false;
    }
  }, [handleIncomingCloudPayload]);
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
    if (!notificationWriteIdentityId) return;
    setNotifications(previousNotifications => ensureArray(previousNotifications).map((notification) => {
      const readByUserIds = Array.isArray(notification?.readByUserIds) ? notification.readByUserIds : [];
      if (notification?.id !== notificationId || readByUserIds.includes(notificationWriteIdentityId)) return notification;
      return { ...notification, readByUserIds: [...readByUserIds, notificationWriteIdentityId] };
    }));
  }, [notificationWriteIdentityId]);
  const markAllNotificationsAsRead = useCallback(() => {
    if (!notificationWriteIdentityId) return;
    setNotifications(previousNotifications => ensureArray(previousNotifications).map((notification) => (
      Array.isArray(notification?.targetUserIds)
      && notification.targetUserIds.some((targetUserId) => notificationRecipientIds.includes(targetUserId))
      && !(Array.isArray(notification?.readByUserIds) ? notification.readByUserIds : []).some((readIdentity) => notificationReadIdentityIds.includes(readIdentity))
        ? { ...notification, readByUserIds: [...(Array.isArray(notification?.readByUserIds) ? notification.readByUserIds : []), notificationWriteIdentityId] }
        : notification
    )));
  }, [notificationReadIdentityIds, notificationRecipientIds, notificationWriteIdentityId]);
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
    () => (operationalShipName ? buildGuardShiftSnapshot(usersData, operationalShipName, checkpoints, currentShiftStatusRecord) : []),
    [checkpoints, currentShiftStatusRecord, operationalShipName, usersData],
  );

  useEffect(() => {
    setShowShiftStatusModal(false);
  }, [currentShiftMeta.key, operationalShip?.id]);

  const handleNotificationClick = useCallback((notification) => {
    if (!notification) return;
    markNotificationAsRead(notification.id);
    setShowNotificationsDropdown(false);

    if (notification.route === 'incidents/detail') {
      const incidentId = notification.routeParams?.incidentId || notification.incidentId;
      const incident = allIncidents.find(item => item.id === incidentId)
        || (activeSOSAlert?.id === incidentId ? createSOSIncidentRecord(activeSOSAlert) : null)
        || createSOSIncidentRecord(sosHistory.find((entry) => entry.id === incidentId));
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

    if (notification.route === 'users/list') {
      closeHistoryEntry();
      setSelectedIncident(null);
      setSelectedReportDetail(null);
      setCurrentPage('users');
      return;
    }

    closeHistoryEntry();
  }, [activeSOSAlert, allIncidents, closeHistoryEntry, markNotificationAsRead, navigateToLivePatrol, openHistoryEntry, sosHistory]);

  useEffect(() => {
    const timerId = window.setInterval(() => setShiftClock(getTrustedNowMs()), 60 * 1000);
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
    setSelectedReportDetail((previousReport) => {
      if (!previousReport) return previousReport;

      const canonicalCheckpoint = getCanonicalCheckpointRecord(previousReport);
      if (!canonicalCheckpoint) return previousReport;

      const nextReport = {
        ...previousReport,
        ...canonicalCheckpoint,
        // Preserve display-critical flags from the original report context
        readOnly: previousReport.readOnly,
        historyId: previousReport.historyId || canonicalCheckpoint.historyId || null,
        // Preserve documentation fields — use canonical if present, else keep original
        resultType: canonicalCheckpoint.resultType || previousReport.resultType,
        photoUrl: resolveMergedAssetUrl(canonicalCheckpoint.photoUrl, previousReport.photoUrl),
        galleryPhotos: (canonicalCheckpoint.galleryPhotos?.length ? canonicalCheckpoint.galleryPhotos : null)
          || previousReport.galleryPhotos || [],
        kejadian: canonicalCheckpoint.kejadian || previousReport.kejadian || '',
        penyebab: canonicalCheckpoint.penyebab || previousReport.penyebab || '',
        tindakLanjut: canonicalCheckpoint.tindakLanjut || previousReport.tindakLanjut || '',
        shipName: canonicalCheckpoint.shipName || previousReport.shipName,
        date: canonicalCheckpoint.date || previousReport.date,
        shipSnapshot: canonicalCheckpoint.shipSnapshot ?? previousReport.shipSnapshot ?? null,
        gpsSnapshot: canonicalCheckpoint.gpsSnapshot ?? previousReport.gpsSnapshot ?? null,
        weatherSnapshot: canonicalCheckpoint.weatherSnapshot ?? previousReport.weatherSnapshot ?? null,
      };

      return serializeSharedStateSnapshot(nextReport) === serializeSharedStateSnapshot(previousReport)
        ? previousReport
        : nextReport;
    });
    setSelectedIncident((previousIncident) => {
      if (!previousIncident?.isPatrol) return previousIncident;
      if (previousIncident.readOnly) return previousIncident;

      const checkpointId = previousIncident?.checkpointId
        || String(previousIncident.id || '').replace(/^p-/, '');
      if (!checkpointId) return previousIncident;

      const canonicalCheckpoint = getCanonicalCheckpointRecord({ id: checkpointId });
      if (!canonicalCheckpoint || canonicalCheckpoint.resultType !== 'temuan') return previousIncident;

      const nextIncident = {
        ...previousIncident,
        ...createPatrolIncidentRecord(canonicalCheckpoint, {
          fallbackShipName: canonicalCheckpoint.shipName || previousIncident.shipName,
          fallbackDate: canonicalCheckpoint.date || previousIncident.date,
          readOnly: previousIncident.readOnly,
        }),
      };

      return serializeSharedStateSnapshot(nextIncident) === serializeSharedStateSnapshot(previousIncident)
        ? previousIncident
        : nextIncident;
    });
  }, [getCanonicalCheckpointRecord]);

  useEffect(() => {
    setUsersData((previousUsers) => {
      const nextUsers = previousUsers;
      // Effect ini mempertahankan referensi users tanpa mutasi tambahan saat boot awal.
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
    const persistedShiftMeta = getCanonicalShiftMetaFromKey(activeShiftKey) || getShiftMetaFromKey(activeShiftKey);
    if (!persistedShiftMeta || persistedShiftMeta.key === currentShiftMeta.key) return;

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
    const resetTimestamp = getTrustedDate().toISOString();

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
          shiftStatusRecords,
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
    setShiftStatusRecords((previousRecords) => retainShiftStatusRecordsForShift(previousRecords, currentShiftMeta.key));
    setActiveForms({});
    setShowShiftStatusModal(false);
    setPendingPatrolCameraCapture(null);
    setSelectedReportDetail(null);
    setSelectedIncident(null);
    setActiveShiftKey(currentShiftMeta.key);
  }, [activeShiftKey, appendNotifications, checkpointsByShip, currentShiftMeta.key, getShipRecipients, shiftStatusRecords, shipsData, usersData, weatherInfo]);

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
  const openShiftStatusModal = useCallback(() => {
    if (!isShiftStatusRequired) return;
    setShowShiftStatusModal(true);
  }, [isShiftStatusRequired]);
  const closeShiftStatusModal = useCallback(() => {
    setShowShiftStatusModal(false);
  }, []);
  const handleSaveCurrentShiftStatus = useCallback((items = []) => {
    if (!operationalShip?.id || !currentUserRecord) return false;

    const guardSnapshot = ensureArray(activeShiftGuardSnapshot).filter(user => user?.id || user?.name);
    if (guardSnapshot.length === 0) {
      setShowShiftStatusModal(false);
      return false;
    }

    const trustedTimestamp = createTrustedTimestampRecord();
    const normalizedItems = normalizeShiftStatusItems(items);
    const itemsByUserId = new Map(normalizedItems.filter(item => item.userId).map(item => [item.userId, item]));
    const itemsByName = new Map(
      normalizedItems
        .map(item => [createGuardNameKey(item.name), item])
        .filter(([guardNameKey]) => Boolean(guardNameKey)),
    );

    const resolvedItems = guardSnapshot.map((guard) => {
      const matchedItem = itemsByUserId.get(guard.id) || itemsByName.get(createGuardNameKey(guard.name));
      return {
        userId: guard.id || null,
        name: guard.name,
        role: ACCESS_ROLES.PETUGAS,
        status: normalizeShiftGuardStatusValue(
          matchedItem?.status || guard.shiftStatus || SHIFT_GUARD_STATUS.PATROLI,
        ),
      };
    });

    const nextRecord = normalizeShiftStatusRecord({
      shipId: operationalShip.id,
      shipName: operationalShipName,
      shiftKey: currentShiftMeta.key,
      filledByUserId: currentUserRecord.id,
      filledByName: currentUserRecord.name || currentUser,
      filledAtTrustedIso: trustedTimestamp.occurredAtTrustedIso,
      filledAtTrustedMs: trustedTimestamp.occurredAtTrustedMs,
      filledAtClientMs: trustedTimestamp.occurredAtClientMs,
      timeTrustLevel: trustedTimestamp.timeTrustLevel,
      clockTamperDetected: trustedTimestamp.clockTamperDetected,
      items: resolvedItems,
    });
    if (!nextRecord) return false;

    setShiftStatusRecords((previousRecords) => ({
      ...retainShiftStatusRecordsForShift(previousRecords, currentShiftMeta.key),
      [nextRecord.key]: nextRecord,
    }));
    setShowShiftStatusModal(false);
    return true;
  }, [activeShiftGuardSnapshot, currentShiftMeta.key, currentUser, currentUserRecord, operationalShip?.id, operationalShipName]);

  // Patrol handlers
  const handleActionClick = useCallback(async (id, type) => {
    if (!canPatrolCurrentShip) return;
    if (!isCurrentShiftStatusCompleted) {
      setShowShiftStatusModal(true);
      return;
    }

    const nextForm = { type, penyebab: '', kejadian: '', tindakLanjut: '', photoUrl: null };
    if (shouldForcePatrolCameraCapture && type === 'aman') {
      setPendingPatrolCameraCapture({ id, type });
      return;
    }

    setActiveForms({ [id]: nextForm });
  }, [canPatrolCurrentShip, isCurrentShiftStatusCompleted, shouldForcePatrolCameraCapture]);
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
    if (!isCurrentShiftStatusCompleted) {
      setShowShiftStatusModal(true);
      return;
    }
    const currentCheckpoint = checkpoints.find(checkpoint => String(checkpoint.id) === String(id));
    if (!currentCheckpoint) return;
    const formState = activeForms[id];
    if (!formState || submittingPatrolId === id) return;

    setSubmittingPatrolId(id);

    try {
      const trustedTimestamp = createTrustedTimestampRecord();
      const trustedNow = new Date(trustedTimestamp.occurredAtTrustedMs);
      const timeString = formatAppTime(trustedNow);
      const dateString = formatAppDate(trustedNow);
      const environmentSnapshot = await capturePatrolEnvironmentSnapshot(
        operationalShip,
        trustedTimestamp.occurredAtTrustedIso,
        { fallbackWeather: weatherInfo },
      );

      const submittedItem = {
        ...currentCheckpoint,
        incidentId: formState.type === 'temuan'
          ? `p-${currentCheckpoint.id}-${trustedTimestamp.occurredAtTrustedIso.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
          : null,
        status: 'completed',
        pendingOrigin: null,
        completedBy: currentUser,
        completedByUserId: currentUserRecord.id,
        date: dateString,
        time: timeString,
        completedAt: trustedTimestamp.occurredAtTrustedIso,
        updatedAt: trustedTimestamp.occurredAtTrustedIso,
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
        ...trustedTimestamp,
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
      requestCloudSync('urgent');
    } finally {
      setSubmittingPatrolId(previousId => (previousId === id ? null : previousId));
    }
  }, [activeForms, appendNotifications, checkpoints, currentShiftMeta.key, currentUser, currentUserRecord, currentUserRole, getShipRecipients, isCurrentShiftStatusCompleted, operationalShip, operationalShipName, requestCloudSync, submittingPatrolId, updateOperationalShipCheckpoints, weatherInfo]);
  const handleDeleteReport = useCallback((id) => { 
    setConfirmDialog({ 
      title: 'Hapus Laporan', 
      message: 'Apakah Anda yakin ingin menghapus laporan patroli ini?', 
      confirmText: 'YA, HAPUS',
      cancelText: 'BATAL',
      onConfirm: () => { 
        updateOperationalShipCheckpoints(prev => prev.map(c => (
          String(c.id) === String(id)
            ? resetCheckpointForShift(c, {
                shiftKey: currentShiftMeta.key,
                pendingOrigin: 'manual-reset',
              })
            : c
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
    requestCloudSync('urgent');
  }, [currentUser, requestCloudSync, selectedReportDetail?.completedBy, selectedReportDetail?.readOnly, updateOperationalShipCheckpoints]);
  const handleOpenPatrolResult = useCallback((item) => {
    const canonicalItem = getCanonicalCheckpointRecord(item) || item;
    setActiveForms({});
    setPendingPatrolCameraCapture(null);
    const isReadOnly = Boolean(canonicalItem?.readOnly || canonicalItem?.historyId || selectedHistoryEntry);
    if (canonicalItem.resultType === 'temuan') {
      setSelectedReportDetail(null);
      setSelectedIncident(createPatrolIncidentRecord(canonicalItem, {
        fallbackShipName: selectedHistoryEntry?.ship || operationalShipName,
        fallbackDate: selectedHistoryEntry?.date || formatAppDate(),
        readOnly: isReadOnly,
      }));
      return;
    }
    setSelectedIncident(null);
    setSelectedReportDetail({
      ...canonicalItem,
      shipName: canonicalItem.shipName || selectedHistoryEntry?.ship || operationalShipName,
      date: canonicalItem.date || selectedHistoryEntry?.date || formatAppDate(),
      shipSnapshot: canonicalItem.shipSnapshot || null,
      gpsSnapshot: canonicalItem.gpsSnapshot || null,
      weatherSnapshot: canonicalItem.weatherSnapshot || null,
      readOnly: isReadOnly,
    });
  }, [getCanonicalCheckpointRecord, selectedHistoryEntry, operationalShipName, setActiveForms, setSelectedIncident, setSelectedReportDetail]);
  const handleAddCustomPatrolNode = useCallback(() => {
    if (!canAddTemporaryPatrolNode || !operationalShip) return;
    if (!isCurrentShiftStatusCompleted) {
      setShowShiftStatusModal(true);
      return;
    }

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
  }, [canAddTemporaryPatrolNode, checkpoints, currentShiftMeta.key, isCurrentShiftStatusCompleted, newCustomNode, operationalShip, updateOperationalShipCheckpoints]);
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
    const trustedTimestamp = createTrustedTimestampRecord();
    const trustedNow = new Date(trustedTimestamp.occurredAtTrustedMs);
    const createdAt = trustedTimestamp.occurredAtTrustedIso;
    const shipSnapshot = createShipLocationSnapshot(operationalShip);
    const newIncident = {
      ...incidentForm,
      id: `incident-${trustedTimestamp.occurredAtTrustedMs}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt,
      time: formatAppTime(trustedNow),
      date: formatAppDate(trustedNow),
      reportedBy: currentUser,
      shipName: operationalShipName,
      location: loc,
      customLocation: incidentForm.locType === 'custom' ? loc : '',
      photoUrl: incidentForm.photoUrl,
      shipSnapshot,
      penyebab: sanitizeMultilineText(incidentForm.penyebab, 240),
      deskripsi: sanitizeMultilineText(incidentForm.deskripsi, 320),
      tindakLanjut: sanitizeMultilineText(incidentForm.tindakLanjut, 240),
      ...trustedTimestamp,
    };
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
    requestCloudSync('urgent');
  }, [appendNotifications, closeIncidentModal, currentUser, currentUserRecord, currentUserRole, getShipRecipients, incidentForm, operationalShip, operationalShipName, requestCloudSync]);

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
  const syncManagedUserOperationalAccess = useCallback(async (userRecord, overrides = {}) => {
    if (!isAdmin || !hasOperationalCloudAccess || !isFirebaseAuthEnabled) return true;

    const firebaseUid = sanitizeText(overrides.uid || userRecord?.firebaseUid || '', 160) || '';
    const safeEmail = sanitizeEmail(overrides.email || userRecord?.email || '');
    if (!firebaseUid || !safeEmail) return true;

    try {
      await syncOperationalUserAccess({
        uid: firebaseUid,
        email: safeEmail,
        name: sanitizeText(overrides.name || userRecord?.name || '', 80) || safeEmail.split('@')[0] || 'Personil',
        role: ACCESS_ROLE_VALUES.includes(overrides.role || userRecord?.role)
          ? (overrides.role || userRecord?.role)
          : ACCESS_ROLES.PETUGAS,
        status: sanitizeText(overrides.status || userRecord?.status || '', 20).toLowerCase() || 'off-duty',
        shipAssigned: sanitizeText(overrides.shipAssigned || userRecord?.shipAssigned || '', 80),
        type: sanitizeText(overrides.type || userRecord?.type || 'BUJP', 20) || 'BUJP',
        workerNumber: sanitizeText(overrides.workerNumber || userRecord?.workerNumber || '', 40),
        legacyUserId: sanitizeText(overrides.legacyUserId || userRecord?.id || '', 160) || null,
      });
      return true;
    } catch (error) {
      console.error('Gagal sinkronisasi akses operasional personel', error);
      setUserFormNotice('Perubahan penugasan tersimpan, tetapi akses login cloud user perlu disinkronkan ulang oleh admin.');
      return false;
    }
  }, [hasOperationalCloudAccess, isAdmin]);
  const handleTogglePersonnel = useCallback(async (userId) => { 
    if (!isAdmin || !activeShip) return; 
    const targetArray = scheduleMonth === 'current' ? activeShip.personnel : activeShip.personnelNextMonth; 
    const isAssigned = targetArray.includes(userId); 
    const targetUser = usersData.find(u => u.id === userId) || null;
    if (isAssigned) { 
      updateActiveShip({ [scheduleMonth === 'current' ? 'personnel' : 'personnelNextMonth']: targetArray.filter(id => id !== userId) }); 
      if(scheduleMonth === 'current') {
        setUsersData(prev => prev.map(u => u.id === userId ? {...u, shipAssigned: null, status: 'off-duty'} : u));
        await syncManagedUserOperationalAccess(targetUser, {
          shipAssigned: '',
          status: 'off-duty',
        });
      }
    } else { 
      setAssignPopupData({ userId, name: targetUser?.name, role: targetUser?.role, scheduleType: scheduleMonth });
      setShowAssignPopup(true);
    } 
  }, [isAdmin, activeShip, scheduleMonth, syncManagedUserOperationalAccess, updateActiveShip, usersData]);

  const handleConfirmAssign = useCallback(async (userId, startDate, endDate, isTBC) => {
    if (!isAdmin || !activeShip || !assignPopupData) return;
    
    const scheduleType = assignPopupData.scheduleType || 'current';
    const targetUser = usersData.find((user) => user.id === userId) || null;
    
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
      await syncManagedUserOperationalAccess(targetUser, {
        shipAssigned: activeShip.name,
        status: 'active',
      });
    } else {
      setUsersData(prev => prev.map(u => u.id === userId && u.status !== 'active' ? {...u, shipAssigned: null, status: 'off-duty'} : u));
    }
    
    setShowAssignPopup(false);
    setAssignPopupData(null);
  }, [isAdmin, activeShip, assignPopupData, syncManagedUserOperationalAccess, updateActiveShip, usersData]);
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
    if (passwordInput && !isFirebaseAuthEnabled) {
      setUserFormError('Firebase Auth wajib aktif untuk membuat user operasional baru.');
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
      }
    } else {
      setUserFormNotice('User disimpan sebagai profil operasional. Akses login akan aktif setelah akun Firebase diikat.');
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
    if (nextUserRecord.firebaseUid) {
      try {
        await syncOperationalUserAccess({
          uid: nextUserRecord.firebaseUid,
          email: nextUserRecord.email,
          name: nextUserRecord.name,
          role: nextUserRecord.role,
          status: nextUserRecord.status,
          shipAssigned: nextUserRecord.shipAssigned || '',
          type: nextUserRecord.type,
          workerNumber: nextUserRecord.workerNumber || '',
          legacyUserId: nextUserRecord.id,
        });
      } catch (error) {
        console.error('Gagal sinkronisasi akses user baru', error);
        setUserFormNotice('Profil user tersimpan, tetapi akses cloud perlu disinkronkan ulang oleh admin.');
      }
    }
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
    if (!isFirebaseUser && passwordInput && !isFirebaseAuthEnabled) {
      setUserFormError('Firebase Auth wajib aktif untuk mengikat ulang kredensial user.');
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
      }
    }

    const selectedUserIndex = Math.max(usersData.findIndex(u => u.id === selectedUser.id), 0);
    const preservedRole = currentRecord?.role || ACCESS_ROLES.PETUGAS;
    const nextRole = isAdmin
      ? (ACCESS_ROLE_VALUES.includes(selectedUser.role) ? selectedUser.role : ACCESS_ROLES.PETUGAS)
      : preservedRole;
    const requestedStatus = sanitizeText(selectedUser.status || currentRecord?.status || '', 20).toLowerCase();
    const wantsInactive = requestedStatus === 'disabled';
    if (isEditingOwnProfile && wantsInactive) {
      setUserFormError('Akun yang sedang dipakai tidak bisa dinonaktifkan dari sesi ini.');
      return;
    }
    const nextShipAssigned = wantsInactive
      ? null
      : (sanitizeText(selectedUser.shipAssigned || '', 80) || null);
    const nextOperationalStatus = nextRole === ACCESS_ROLES.PETUGAS
      ? (wantsInactive ? 'disabled' : (nextShipAssigned ? 'active' : 'off-duty'))
      : (wantsInactive ? 'disabled' : 'active');
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
      status: nextOperationalStatus,
      workerNumber: sanitizeText(selectedUser.workerNumber || '', 40),
      phone: sanitizePhone(selectedUser.phone || ''),
      address: sanitizeMultilineText(selectedUser.address || '', 180),
      emergencyName: sanitizeText(selectedUser.emergencyName || '', 80),
      emergencyContact: sanitizePhone(selectedUser.emergencyContact || ''),
      emergencyRelation: sanitizeText(selectedUser.emergencyRelation || '', 40),
      officeAddress: sanitizeMultilineText(selectedUser.officeAddress || '', 180),
      photoUrl: selectedUser.photoUrl || currentRecord?.photoUrl || createUserAvatar(safeName, selectedUserIndex),
    }, selectedUserIndex);

    if (previewUser.firebaseUid) {
      try {
        await syncOperationalUserAccess({
          uid: previewUser.firebaseUid,
          email: previewUser.email,
          name: previewUser.name,
          role: previewUser.role,
          status: previewUser.status,
          shipAssigned: previewUser.shipAssigned || '',
          type: previewUser.type,
          workerNumber: previewUser.workerNumber || '',
          legacyUserId: previewUser.id,
        });
      } catch (error) {
        console.error('Gagal sinkronisasi akses user terpilih', error);
        setUserFormNotice('Perubahan profil tersimpan lokal, tetapi akses cloud belum sinkron penuh.');
      }
    }

    setUsersData(prev => prev.map((u, index) => {
      if (u.id !== selectedUser.id) return u;
      const nextUser = {
        ...u,
        ...previewUser,
      };
      return normalizeUserRecord(nextUser, index);
    }));
    if (previewUser.status === 'disabled') {
      setShipsData((previousShips) => previousShips.map((ship) => {
        const nextSchedules = { ...(ship.personnelSchedules || {}) };
        delete nextSchedules[selectedUser.id];
        return {
          ...ship,
          personnel: ensureArray(ship.personnel).filter((userId) => userId !== selectedUser.id),
          personnelNextMonth: ensureArray(ship.personnelNextMonth).filter((userId) => userId !== selectedUser.id),
          personnelSchedules: nextSchedules,
        };
      }));
    }
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
      onConfirm: async () => {
        const deletedAt = new Date().toISOString();
        if (targetUser?.firebaseUid) {
          try {
            await revokeOperationalUserAccess({
              uid: targetUser.firebaseUid,
            });
          } catch (error) {
            console.error('Gagal revoke akses operasional user', error);
          }
        }
        setDeletedRecords(previousDeletedRecords => markDeletedRecord(previousDeletedRecords, 'users', id, deletedAt));
        setUsersData(prev => prev.filter(u => u.id !== id)); 
        setShipsData(prev => prev.map(ship => ({ ...ship, personnel: ship.personnel.filter(userId => userId !== id), personnelNextMonth: ship.personnelNextMonth.filter(userId => userId !== id) }))); 
        if (sessionUserId === id) { setSessionUserId(null); setAuthMode('login'); setAuthNotice('Akun sedang dipakai telah dihapus. Silakan login ulang.'); } 
        setSelectedUser(null);
      }
    });
  }, [isAdmin, usersData, sessionUserId]);
  const handleEditUserPhotoUpload = useCallback(async () => { const dataUrl = await pickLocalImage(); if(!dataUrl) return; const url = await saveImageToDB(dataUrl); if (url) setSelectedUser(prev => ({...prev, photoUrl: url})); }, []);
  const handleApprovePendingUser = useCallback(async (pendingRegistration) => {
    if (!isAdmin || !pendingRegistration?.uid) return;

    clearUserManagementFeedback();
    try {
      const approvalResult = await approvePendingRegistration({
        uid: pendingRegistration.uid,
        role: ACCESS_ROLES.PETUGAS,
        status: 'off-duty',
        shipAssigned: '',
        type: pendingRegistration.type || 'BUJP',
        workerNumber: pendingRegistration.workerNumber || '',
      });
      const profileSeed = {
        id: `u${Date.now()}`,
        name: pendingRegistration.name,
        email: pendingRegistration.email,
        phone: pendingRegistration.phone,
        photoUrl: pendingRegistration.photoUrl,
        type: pendingRegistration.type || 'BUJP',
        workerNumber: pendingRegistration.workerNumber || '',
      };
      setUsersData((previousUsers) => upsertOperationalUserRecord(previousUsers, {
        access: approvalResult?.access || {},
        profile: profileSeed,
        authUser: {
          uid: pendingRegistration.uid,
          email: pendingRegistration.email,
          displayName: pendingRegistration.name,
          phoneNumber: pendingRegistration.phone,
          photoURL: pendingRegistration.photoUrl,
        },
      }));
      setUserFormNotice(`Registrasi ${pendingRegistration.name} disetujui. Aktivasi login penuh menunggu penugasan kapal.`);
    } catch (error) {
      console.error('Gagal approve onboarding pending', error);
      setUserFormError('Approval onboarding gagal diproses. Coba lagi.');
    }
  }, [clearUserManagementFeedback, isAdmin]);
  const handleRejectPendingUser = useCallback(async (pendingRegistration) => {
    if (!isAdmin || !pendingRegistration?.uid) return;

    clearUserManagementFeedback();
    try {
      await rejectPendingRegistration({
        uid: pendingRegistration.uid,
      });
      setUserFormNotice(`Registrasi ${pendingRegistration.name} ditolak.`);
    } catch (error) {
      console.error('Gagal reject onboarding pending', error);
      setUserFormError('Penolakan onboarding gagal diproses. Coba lagi.');
    }
  }, [clearUserManagementFeedback, isAdmin]);

  // Progress & incident meta handlers
  const handleAddProgress = useCallback((incidentId) => {
    const incident = allIncidents.find(item => item.id === incidentId) || selectedIncident;
    if (!canManageIncident(incident)) return;
    const trustedTimestamp = createTrustedTimestampRecord();
    const trustedNow = new Date(trustedTimestamp.occurredAtTrustedMs);
    const createdAt = trustedTimestamp.occurredAtTrustedIso;
    const time = formatAppTime(trustedNow);
    const date = formatAppDate(trustedNow);
    setIncidentMeta(prev => ({ ...prev, [incidentId]: { ...prev[incidentId], status: prev[incidentId]?.status || 'open', progress: [...(prev[incidentId]?.progress || []), { id: `progress-${trustedTimestamp.occurredAtTrustedMs}-${Math.random().toString(36).slice(2, 8)}`, ...newProgress, comment: sanitizeMultilineText(newProgress.comment, 240), photoUrl: newProgress.photoUrl, time, date, author: currentUser, createdAt, ...trustedTimestamp }] } }));
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
    requestCloudSync('urgent');
  }, [allIncidents, appendNotifications, canManageIncident, currentUser, currentUserRole, getShipRecipients, newProgress, operationalShipName, requestCloudSync, selectedIncident, usersData]);
  const handleAddIncidentDocumentation = useCallback(async (incidentId) => {
    const incident = allIncidents.find(item => item.id === incidentId) || selectedIncident;
    if (!canManageIncident(incident)) return;
    const dataUrl = await pickLocalImage();
    if (!dataUrl) return;
    const photoUrl = await saveImageToDB(dataUrl);
    if (!photoUrl) return;

    const trustedTimestamp = createTrustedTimestampRecord();
    const trustedNow = new Date(trustedTimestamp.occurredAtTrustedMs);
    const createdAt = trustedTimestamp.occurredAtTrustedIso;
    const time = formatAppTime(trustedNow);
    const date = formatAppDate(trustedNow);

    setIncidentMeta((previousMeta) => ({
      ...previousMeta,
      [incidentId]: {
        ...previousMeta[incidentId],
        status: previousMeta[incidentId]?.status || 'open',
        documentation: [
          {
            id: `doc-${trustedTimestamp.occurredAtTrustedMs}-${Math.random().toString(36).slice(2, 8)}`,
            photoUrl,
            createdAt,
            date,
            time,
            author: currentUser,
            ...trustedTimestamp,
          },
          ...(previousMeta[incidentId]?.documentation || []),
        ],
      },
    }));
    requestCloudSync('urgent');
  }, [allIncidents, canManageIncident, currentUser, requestCloudSync, selectedIncident]);
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
            (createPatrolIncidentId(checkpoint) === incidentId || String(checkpoint.id) === String(checkpointId)) && !checkpoint.readOnly
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
        const trustedTimestamp = createTrustedTimestampRecord();
        const createdAt = trustedTimestamp.occurredAtTrustedIso;
        setIncidentMeta(prev => ({ ...prev, [incidentId]: { ...(prev[incidentId] || {}), status: 'closed' } }));
        if (incident?.isSOS) {
          const resolvedSOS = {
            ...(activeSOSAlert?.id === incidentId ? activeSOSAlert : incident),
            status: 'resolved',
            resolvedAt: createdAt,
            resolvedBy: currentUser || 'Sistem',
            resolvedAtClientMs: trustedTimestamp.occurredAtClientMs,
            resolvedTimeTrustLevel: trustedTimestamp.timeTrustLevel,
            resolvedClockTamperDetected: trustedTimestamp.clockTamperDetected,
            updatedAt: createdAt,
            updatedAtClientMs: trustedTimestamp.occurredAtClientMs,
            updatedTimeTrustLevel: trustedTimestamp.timeTrustLevel,
            updatedClockTamperDetected: trustedTimestamp.clockTamperDetected,
          };
          setActiveSOSAlert((previousAlert) => (
            previousAlert?.id === incidentId ? null : previousAlert
          ));
          setSosHistory((previousHistory) => upsertSOSHistoryEntry(previousHistory, resolvedSOS));
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
        requestCloudSync('urgent');
      } 
    }); 
  }, [activeSOSAlert, allIncidents, appendNotifications, canCloseIncident, currentUser, currentUserRole, getShipRecipients, operationalShipName, requestCloudSync, selectedIncident, usersData]);
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
                return resetCheckpointForShift(checkpoint, {
                  shiftKey: currentShiftMeta.key,
                  pendingOrigin: 'manual-reset',
                });
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
        requestCloudSync('urgent');
      },
    });
  }, [allIncidents, currentShiftMeta.key, isAdmin, requestCloudSync, selectedIncident]);
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
    requestCloudSync('urgent');
  }, [requestCloudSync]);

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
    setAuthAccessState(null);
    setAuthAccessBusy(false);
    setPendingRegistrations([]);
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
  const finalizeAuthorizedLogin = useCallback((resolvedUser) => {
    const landingPage = getDefaultPageForRole(resolvedUser.role);
    setSessionUserId(resolvedUser.id);
    setCurrentPage(landingPage);
    setActiveShipId(null);
    setNotificationReturnPage(landingPage);
    hasAppliedRoleLandingRef.current = true;
    setAuthMode('login');
    setAuthForm(createAuthFormState());
  }, []);
  const handleLogin = useCallback(async () => {
    const safeEmail = sanitizeEmail(authForm.email);
    const passwordInput = sanitizeText(authForm.password, 120);
    if (!safeEmail || !passwordInput) {
      setAuthError('Email dan password wajib diisi.');
      return;
    }
    if (!isFirebaseAuthEnabled) {
      setAuthError('Firebase Auth tidak aktif pada build aplikasi ini. Muat ulang aplikasi, hapus cache PWA bila perlu, lalu pastikan bundle yang dideploy memuat config Firebase SmartPatrol.');
      return;
    }

    setAuthBusy(true);
    setAuthAccessBusy(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const localUser = usersData.find(item => (item.email || '').toLowerCase() === safeEmail) || null;
      const credential = await loginWithFirebaseEmail(safeEmail, passwordInput);
      setFirebaseAuthUser(credential.user);
      setFirebaseAuthReady(true);
      const accessResult = await resolveOperationalAccess();
      setAuthAccessState(accessResult || null);

      if (!accessResult?.access) {
        await logoutFirebaseUser();
        if (accessResult?.status === 'pending') {
          setAuthError('Registrasi Anda masih menunggu approval admin.');
          return;
        }
        if (accessResult?.status === 'rejected') {
          setAuthError('Registrasi Anda ditolak admin. Hubungi admin operasional.');
          return;
        }
        setAuthError('Akun Firebase ini belum memiliki akses operasional SmartPatrol.');
        return;
      }

      const resolvedUser = buildOperationalUserRecordFromAccess({
        access: accessResult.access,
        profile: accessResult.profile,
        authUser: credential.user,
        existingUser: localUser,
        users: usersData,
      });
      setUsersData((previousUsers) => upsertOperationalUserRecord(previousUsers, {
        access: accessResult.access,
        profile: accessResult.profile,
        authUser: credential.user,
      }));

      if (!accessResult.access.enabled || !canUserAccessApplication(resolvedUser)) {
        await logoutFirebaseUser();
        setAuthError('Akun Anda sudah tervalidasi, tetapi belum aktif untuk operasi. Tunggu assignment admin.');
        return;
      }

      finalizeAuthorizedLogin(resolvedUser);
    } catch (error) {
      try {
        await logoutFirebaseUser();
      } catch {
        // Abaikan cleanup logout jika login memang gagal sebelum sesi Firebase terbentuk.
      }
      setAuthAccessState(null);
      setAuthError(getFirebaseAuthErrorMessage(error));
    } finally {
      setAuthBusy(false);
      setAuthAccessBusy(false);
    }
  }, [authForm, finalizeAuthorizedLogin, usersData]);
  const handleRegister = useCallback(async () => {
    const safeName = sanitizeText(authForm.name, 80);
    const safeEmail = sanitizeEmail(authForm.email);
    const passwordInput = sanitizeText(authForm.password, 120);
    const confirmPassword = sanitizeText(authForm.confirmPassword, 120);
    const safeType = sanitizeText(authForm.type, 20) || 'BUJP';
    const safeWorkerNumber = sanitizeText(authForm.workerNumber, 40);
    const safePhone = sanitizePhone(authForm.phone);
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
    if (existingUser && isFirebaseManagedUser(existingUser)) {
      setAuthError('Email ini sudah terdaftar di Firebase.');
      return;
    }
    if (!isFirebaseAuthEnabled) {
      setAuthError('Firebase Auth belum aktif. Registrasi cloud belum bisa dipakai.');
      return;
    }

    publicRegistrationFlowRef.current = true;
    setAuthBusy(true);
    setAuthAccessBusy(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const credential = await registerWithFirebaseEmail(safeEmail, passwordInput);
      let uploadedPhoto = {
        photoUrl: '',
        photoPath: '',
      };

      if (authForm.photoUrl) {
        try {
          uploadedPhoto = await uploadRegistrationPhotoAsset({
            uid: credential.user.uid,
            photoUrl: authForm.photoUrl,
          });
        } catch (photoError) {
          console.error('Gagal upload foto registrasi ke storage onboarding', photoError);
        }
      }

      await createPendingRegistration({
        uid: credential.user.uid,
        email: safeEmail,
        name: safeName,
        phone: safePhone,
        photoUrl: uploadedPhoto.photoUrl,
        photoPath: uploadedPhoto.photoPath,
        type: safeType,
        workerNumber: safeWorkerNumber,
      });

      await logoutFirebaseUser();
      setSessionUserId(null);
      setAuthAccessState(null);
      setAuthMode('login');
      setCurrentPage('home');
      setNotificationReturnPage('home');
      setAuthForm(createAuthFormState({ email: safeEmail }));
      setAuthNotice('Registrasi berhasil dikirim. Silakan tunggu approval admin sebelum akun diaktifkan.');
      setConfirmDialog({
        title: 'Registrasi Berhasil',
        message: 'Akun Anda sudah terdaftar di antrean onboarding SmartPatrol. Silakan tunggu approval admin sebelum login operasional dijalankan.',
        confirmText: 'MENGERTI',
        isAlert: true,
        onConfirm: () => {},
      });
    } catch (error) {
      try {
        await logoutFirebaseUser();
      } catch {
        // Abaikan cleanup logout jika registrasi gagal sebelum sesi Firebase terbentuk.
      }
      setAuthAccessState(null);
      setAuthError(getFirebaseAuthErrorMessage(error));
      publicRegistrationFlowRef.current = false;
    } finally {
      setAuthBusy(false);
      setAuthAccessBusy(false);
    }
  }, [authForm, usersData]);

  // Persistence effects
  useEffect(() => {
    const timerId = setTimeout(() => {
      savePersistedState({
        ...sharedState,
        theme,
      }, {
        sessionUserId,
      });
    }, 1000); // Debounce local persistence 1s
    return () => clearTimeout(timerId);
  }, [sessionUserId, sharedState, theme]);
  useEffect(() => {
    if (!isCloudSyncEnabled || !hasOperationalCloudAccess) return () => {};

    return subscribeToCloudAppState((cloudPayload) => {
      handleIncomingCloudPayload(cloudPayload, {
        source: 'realtime-snapshot',
        clearWhenEmpty: true,
      });
    }, (error) => {
      setCloudSyncBootstrapped(true);
      console.error('Gagal subscribe data patroli cloud', error);
    });
  }, [handleIncomingCloudPayload, hasOperationalCloudAccess]);
  useEffect(() => {
    if (!isCloudSyncEnabled || !hasOperationalCloudAccess) return () => {};

    let isDisposed = false;

    const runRefresh = (source, options = {}) => {
      if (isDisposed) return;
      refreshCloudSharedState({
        source,
        ...options,
      });
    };

    runRefresh('bootstrap', {
      preferServer: isNavigatorOnline(),
      clearWhenEmpty: true,
    });

    const handleOnline = () => {
      runRefresh('online', {
        preferServer: true,
        clearWhenEmpty: false,
      });
    };

    const handleFocus = () => {
      runRefresh('focus', {
        preferServer: isNavigatorOnline(),
        clearWhenEmpty: false,
      });
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      runRefresh('visibility-visible', {
        preferServer: isNavigatorOnline(),
        clearWhenEmpty: false,
      });
    };

    const refreshIntervalId = typeof window !== 'undefined'
      ? window.setInterval(() => {
          if (!isNavigatorOnline()) return;
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

          runRefresh('interval', {
            preferServer: true,
            clearWhenEmpty: false,
          });
        }, 45000)
      : null;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('focus', handleFocus);
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isDisposed = true;

      if (refreshIntervalId !== null && typeof window !== 'undefined') {
        window.clearInterval(refreshIntervalId);
      }

      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('focus', handleFocus);
      }

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [hasOperationalCloudAccess, refreshCloudSharedState]);
  useEffect(() => {
    if (!isCloudSyncEnabled || !isCloudWriteEnabled || !hasOperationalCloudAccess || isOffline || !cloudSyncBootstrapped) return;

    const scheduledPriorityVersion = cloudSyncPriorityVersionRef.current;
    const syncDelayMs = cloudSyncPriorityRef.current === 'urgent'
      ? URGENT_CLOUD_SYNC_DEBOUNCE_MS
      : CLOUD_SYNC_DEBOUNCE_MS;

    const timerId = setTimeout(() => {
      const cloudReadyState = createCloudSyncStateSnapshot(mergeSharedStateSnapshots(
        latestCloudSharedStateRef.current || {},
        createSharedStateSnapshot({
          ...sharedState,
          activeShiftKey: currentShiftMeta.key,
        }),
      ));
      const serializedState = serializeSharedStateSnapshot(cloudReadyState);
      const hasPendingLocalAssets = collectLocalOnlyAssetUrls(cloudReadyState).length > 0;
      if (!serializedState || (serializedState === lastCloudSharedStateRef.current && !hasPendingLocalAssets)) return;

      cloudSaveQueueRef.current = cloudSaveQueueRef.current
        .catch(() => {})
        .then(async () => {
          try {
            const latestStateForWrite = createCloudSyncStateSnapshot(mergeSharedStateSnapshots(
              latestCloudSharedStateRef.current || {},
              createSharedStateSnapshot({
                ...sharedState,
                activeShiftKey: currentShiftMeta.key,
              }),
            ));
            const latestSerializedState = serializeSharedStateSnapshot(latestStateForWrite);
            const latestHasPendingLocalAssets = collectLocalOnlyAssetUrls(latestStateForWrite).length > 0;
            if (!latestSerializedState) return;
            if (latestSerializedState === lastCloudSharedStateRef.current) {
              if (!latestHasPendingLocalAssets) return;
              const hasSyncableLocalAssets = await hasUploadableLocalAssets(latestStateForWrite);
              if (!hasSyncableLocalAssets) return;
            }

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
            const receivedAtServerMs = getTrustedNowMs();
            const verifiedPreparedState = markSharedStateTimeAuditReceived(
              mergeSharedStateSnapshots({}, preparedState),
              receivedAtServerMs,
            );
            const savedState = await saveCloudAppState(verifiedPreparedState, {
              mergeState: (cloudState, pendingState) => createCloudSyncStateSnapshot(
                mergeSharedStateSnapshots(cloudState || {}, pendingState || {}),
              ),
            });
            const committedState = markSharedStateTimeAuditReceived(
              mergeSharedStateSnapshots({}, savedState || verifiedPreparedState),
              receivedAtServerMs,
            );
            const committedSerializedState = serializeSharedStateSnapshot(committedState);

            if (!committedSerializedState) return;

            applyCloudSharedState(committedState, {
              receivedAtServerMs,
            });
          } finally {
            if (cloudSyncPriorityVersionRef.current === scheduledPriorityVersion) {
              cloudSyncPriorityRef.current = 'normal';
            }
          }
        })
        .catch((error) => {
          console.error('Gagal mengirim laporan patroli ke cloud', error);
        });
    }, syncDelayMs);

    return () => clearTimeout(timerId);
  }, [applyCloudSharedState, cloudSyncBootstrapped, cloudSyncKick, currentShiftMeta.key, hasOperationalCloudAccess, hasUploadableLocalAssets, isOffline, prepareSharedStateForCloudSync, sharedState]);
  useEffect(() => { saveAuthSession(sessionUserId); }, [sessionUserId]);
  useEffect(() => {
    if (!isFirebaseAuthEnabled) {
      setFirebaseAuthReady(true);
      return () => {};
    }

    return subscribeToFirebaseAuthChanges((nextUser) => {
      setFirebaseAuthUser(nextUser);
      setFirebaseAuthReady(true);
      if (!nextUser) {
        publicRegistrationFlowRef.current = false;
        setAuthAccessState(null);
        setAuthAccessBusy(false);
      }
    });
  }, []);
  useEffect(() => {
    if (!isFirebaseAuthEnabled || !firebaseAuthReady) return;
    if (publicRegistrationFlowRef.current) {
      setAuthAccessState(null);
      setAuthAccessBusy(false);
      return;
    }
    if (!firebaseAuthUser) {
      setAuthAccessState(null);
      return;
    }

    let cancelled = false;
    setAuthAccessBusy(true);

    resolveOperationalAccess()
      .then((accessResult) => {
        if (cancelled) return;
        setAuthAccessState(accessResult || null);
        if (accessResult?.access) {
          setUsersData((previousUsers) => upsertOperationalUserRecord(previousUsers, {
            access: accessResult.access,
            profile: accessResult.profile,
            authUser: firebaseAuthUser,
          }));
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Gagal memuat akses operasional user aktif', error);
        setAuthAccessState(null);
      })
      .finally(() => {
        if (!cancelled) {
          setAuthAccessBusy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [firebaseAuthReady, firebaseAuthUser]);
  useEffect(() => {
    if (!isFirebaseAuthEnabled || !firebaseAuthUser || !authAccessState?.access) return;
    const matchedUser = resolvePreferredUserRecord(usersData, {
      sessionUserId,
      firebaseAuthEmail: firebaseAuthUser.email || '',
      firebaseAuthUid: firebaseAuthUser.uid || '',
    });
    if (matchedUser?.id && matchedUser.id !== sessionUserId) {
      setSessionUserId(matchedUser.id);
    }
  }, [authAccessState, firebaseAuthUser, sessionUserId, usersData]);
  useEffect(() => {
    if (!isFirebaseAuthEnabled || !firebaseAuthReady) return;
    if (authBusy || authAccessBusy || firebaseAuthUser || !sessionUserId) return;
    resetAuthSession('Sesi cloud Anda telah berakhir. Silakan login kembali.');
  }, [authAccessBusy, authBusy, firebaseAuthReady, firebaseAuthUser, resetAuthSession, sessionUserId]);
  useEffect(() => {
    if (!isAdmin || !hasOperationalCloudAccess) {
      setPendingRegistrations([]);
      return () => {};
    }

    return subscribeToPendingRegistrations((entries) => {
      setPendingRegistrations(entries);
    }, (error) => {
      console.error('Gagal memuat onboarding pending', error);
    });
  }, [hasOperationalCloudAccess, isAdmin]);
  useEffect(() => {
    if (!sessionUserId) return;
    const activeUser = currentUserRecord || usersData.find(user => user.id === sessionUserId);
    if (!activeUser) {
      resetAuthSession('Sesi login tidak lagi valid.');
      return;
    }

    if (isFirebaseAuthEnabled) {
      if (!firebaseAuthReady || authBusy || authAccessBusy) return;
      if (!firebaseAuthUser || !authAccessEnabled) {
        resetAuthSession('Sesi cloud Anda telah berakhir. Silakan login kembali.');
        return;
      }
      if (authAccessStatus === 'restricted') {
        handleLogout('Akses operasional Anda sedang nonaktif. Hubungi admin untuk assignment ulang.');
        return;
      }
      if (authAccessStatus === 'rejected') {
        handleLogout('Registrasi Anda ditolak admin operasional.');
        return;
      }
      if (authAccessStatus === 'pending') {
        handleLogout('Registrasi Anda masih menunggu approval admin.');
        return;
      }
    }

    if (!canUserAccessApplication(activeUser)) {
      handleLogout('Petugas off-duty atau tanpa penugasan kapal tidak bisa tetap login.');
      return;
    }
    if (activeUser.role === ACCESS_ROLES.PETUGAS && !assignedShipForCurrentUser) {
      handleLogout('Petugas yang tidak lagi terdaftar di armada aktif tidak bisa tetap login.');
    }
  }, [assignedShipForCurrentUser, authAccessBusy, authAccessEnabled, authAccessStatus, authBusy, currentUserRecord, firebaseAuthReady, firebaseAuthUser, handleLogout, resetAuthSession, sessionUserId, usersData]);
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
  useEffect(() => {
    let cancelled = false;

    const hydrateWeather = async () => {
      const cachedWeather = loadWeatherCache();

      if (weatherInfo) {
        if (!cancelled) setWeatherLoading(false);
        return;
      }

      if (!isNavigatorOnline()) {
        if (!cancelled && ensureObject(cachedWeather)) {
          setWeatherInfo(cachedWeather);
        }
        if (!cancelled) setWeatherLoading(false);
        return;
      }

      try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-6.1021&longitude=106.8833&current_weather=true');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const currentWeather = ensureObject(data?.current_weather);

        if (cancelled) return;

        if (currentWeather) {
          setWeatherInfo(currentWeather);
          saveWeatherCache(currentWeather);
        } else if (ensureObject(cachedWeather)) {
          setWeatherInfo(cachedWeather);
        }
      } catch (error) {
        console.error('Gagal memuat cuaca operasional', error);
        if (!cancelled && ensureObject(cachedWeather)) {
          setWeatherInfo(cachedWeather);
        }
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };

    hydrateWeather();
    return () => {
      cancelled = true;
    };
  }, [weatherInfo]);
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
    authAccessStatus,
    authAccessBusy,
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
    authAccessBusy,
    authAccessStatus,
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
    currentShiftStatusRecord,
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
    isShiftStatusRequired,
    isCurrentShiftStatusCompleted,
    showShiftStatusModal,
    canAddTemporaryPatrolNode,
    shouldForcePatrolCameraCapture,
    pendingPatrolCameraCapture,
    submittingPatrolId,
    completedCount,
    totalCount,
    progressPercentage,
    newCustomNode,
    setNewCustomNode,
    openShiftStatusModal,
    closeShiftStatusModal,
    handleSaveCurrentShiftStatus,
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
    closeShiftStatusModal,
    closePatrolCameraCapture,
    completedCount,
    currentShiftStatusRecord,
    currentShiftMeta,
    currentShiftSchedule,
    filteredCheckpoints,
    handleSaveCurrentShiftStatus,
    handleActionClick,
    handleAddCustomPatrolNode,
    handleAddReportGalleryPhoto,
    handleDeleteReport,
    handleFormChange,
    handleOpenPatrolResult,
    handlePatrolCameraCapture,
    handlePhotoUpload,
    handleSubmitPatrol,
    isCurrentShiftStatusCompleted,
    isShiftStatusRequired,
    newCustomNode,
    openShiftStatusModal,
    patrolTab,
    pendingPatrolCameraCapture,
    progressPercentage,
    searchQuery,
    showShiftStatusModal,
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
    pendingRegistrations,
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
    handleApprovePendingUser,
    handleRejectPendingUser,
  }), [
    clearUserManagementFeedback,
    handleApprovePendingUser,
    handleDeleteUser,
    handleEditUserPhotoUpload,
    handleRejectPendingUser,
    handleSaveUser,
    handleUpdateUser,
    handleUserPhotoUpload,
    pendingRegistrations,
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
    handleOpenPatrolResult,
  }), [
    closeHistoryEntry,
    handleDeleteHistoryEntry,
    handleOpenPatrolResult,
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
    handleSOSAcknowledgeSelf,
    handleSOSDismiss,
  }), [
    activeSOSAlert,
    handleSOSAcknowledgeSelf,
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
