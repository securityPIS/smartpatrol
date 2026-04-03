import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { 
  Camera, CheckCircle2, AlertTriangle, Lock, 
  Wifi, ChevronDown, ChevronUp, User, 
  Ship, ShieldAlert, Check, Send, X, 
  Home, Clock, CalendarDays, FileText, MapPin,
  Sun, Cloud, CloudRain, Thermometer, Wind, Trash2,
  Users, Anchor, PlusCircle, UserMinus, UserPlus, Map, Package, Weight, Plus, Save,
  AlertOctagon, Navigation, Image as ImageIcon, FilePlus, ExternalLink, CalendarClock, Search
} from 'lucide-react';
import { createPosterDataUrl } from './src/data/defaultData';
import { readImageFileAsDataUrl } from './src/utils/images';
import { sanitizeEmail, sanitizeMultilineText, sanitizePhone, sanitizeText, sanitizeUrl } from './src/utils/sanitize';

// --- DATA MOCKUP ---
const ACCESS_ROLES = {
  ADMIN: 'ADMIN',
  PIC: 'PIC',
  PETUGAS: 'PETUGAS'
};

const ACCESS_ROLE_VALUES = Object.values(ACCESS_ROLES);
const AUTH_SESSION_KEY = 'smartpatrol.auth.local.v1';

const defaultLocationOptions = [
  'Cuaca', 'Haluan', 'Buritan', 'Deck', 'Sekoci', 'Anjungan', 'Radio Room', 
  'Alat Navigasi', 'Solar Panel', 'Ruang Mesin', 'Ruang Pompa', 'Air Bersih', 
  'Gudang Logistik', 'Gudang Spare Part', 'Alat Dapur', 'Fasilitas Pendukung'
];

const defaultAuthForm = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  type: 'BUJP'
};

const defaultUserForm = {
  name: '',
  role: ACCESS_ROLES.PETUGAS,
  type: 'BUJP',
  dob: '',
  email: '',
  password: '',
  phone: '',
  address: '',
  emergencyName: '',
  emergencyContact: '',
  emergencyRelation: 'Orang Tua',
  officeAddress: '',
  photoUrl: null
};

const defaultShipForm = {
  name: '',
  type: 'Oil Tanker',
  route: '',
  cargoType: '',
  cargoAmount: '',
  status: 'UPP',
  customCheckpoints: []
};

const createAuthFormState = (overrides = {}) => ({ ...defaultAuthForm, ...overrides });
const createUserFormState = () => ({ ...defaultUserForm });
const createShipFormState = () => ({ ...defaultShipForm });

const defaultIncidentForm = {
  locType: 'default',
  location: defaultLocationOptions[0],
  customLocation: '',
  penyebab: '',
  deskripsi: '',
  tindakLanjut: '',
  photoUrl: null,
};

const createIncidentFormState = () => ({ ...defaultIncidentForm });

function createUserAvatar(name, index = 0) {
  const initials = sanitizeText(name, 40)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'SP';

  return createPosterDataUrl(initials, name, index, true);
}

const initialCheckpoints = defaultLocationOptions.map((name, index) => ({
  id: index + 1, name, status: 'pending'
}));
// Simulasi data terisi
initialCheckpoints[0] = { ...initialCheckpoints[0], status: 'completed', completedBy: 'Cipto Mangunkusumo', time: '12:15', photoUrl: createPosterDataUrl('CUACA', 'Kondisi aman', 0, false), resultType: 'aman' };
initialCheckpoints[1] = { ...initialCheckpoints[1], status: 'completed', completedBy: 'Sertu Agus', time: '12:20', photoUrl: createPosterDataUrl('HALUAN', 'Temuan jangkar', 4, false), resultType: 'temuan', penyebab: 'Gesekan berlebih karena cuaca buruk', kejadian: 'Karat parah pada rantai jangkar kiri.', tindakLanjut: 'Lapor Chief Officer.' };

const historyData = [
  { id: 101, date: '2 April 2026', shift: 'Shift 1', time: '06:00 - 12:00', ship: 'MT MENGGALA', points: 16, issue: 0 },
  { id: 102, date: '1 April 2026', shift: 'Shift 4', time: '24:00 - 06:00', ship: 'MT MENGGALA', points: 16, issue: 1 },
];

const mockUsersList = [
  {
    id: 'u1',
    name: 'Budi Santoso',
    role: ACCESS_ROLES.ADMIN,
    type: 'BUJP',
    status: 'active',
    shipAssigned: 'MT MENGGALA',
    email: 'admin@smartpatrol.local',
    hasCredential: true,
    passwordSalt: '4e7f1a9c2d6b8f10',
    passwordHash: 'e0b98996bdd6437310b21efdce9329a01a2212db84c43e6ea103d4ec908f2dd8',
    photoUrl: createPosterDataUrl('BS', 'Budi Santoso', 0, true)
  },
  {
    id: 'u2',
    name: 'Sertu Agus',
    role: ACCESS_ROLES.PIC,
    type: 'TNI',
    status: 'active',
    shipAssigned: 'MT MENGGALA',
    email: 'pic@smartpatrol.local',
    hasCredential: true,
    passwordSalt: '7ab31d8f22ce9014',
    passwordHash: 'ded78e74253898700b4c5c06479e492b8a918b427441094d84f837d9cde3aa1b',
    photoUrl: createPosterDataUrl('SA', 'Sertu Agus', 1, true)
  },
  {
    id: 'u3',
    name: 'Cipto Mangunkusumo',
    role: ACCESS_ROLES.PETUGAS,
    type: 'BUJP',
    status: 'active',
    shipAssigned: 'MT MENGGALA',
    email: 'petugas@smartpatrol.local',
    hasCredential: true,
    passwordSalt: '91c4ef0a5d7b2c38',
    passwordHash: 'f6df216170e0fa8cbfdffaa046b3d785e6e289627af9f8753addec4a11860a8b',
    photoUrl: createPosterDataUrl('CM', 'Cipto', 2, true)
  },
  {
    id: 'u4',
    name: 'Deni Setiawan',
    role: ACCESS_ROLES.PETUGAS,
    type: 'BUJP',
    status: 'off-duty',
    shipAssigned: null,
    email: 'deni@smartpatrol.local',
    hasCredential: true,
    passwordSalt: 'bc72ea19453f8d26',
    passwordHash: '79907b35981fa38d4b7cecb3554985d3ed0e668f0ecddee204e30b614247d9c2',
    photoUrl: createPosterDataUrl('DS', 'Deni', 3, true)
  },
  {
    id: 'u5',
    name: 'Kapten Eko',
    role: ACCESS_ROLES.PIC,
    type: 'TNI',
    status: 'off-duty',
    shipAssigned: null,
    email: 'eko@smartpatrol.local',
    hasCredential: true,
    passwordSalt: 'f02d8ab347c1e965',
    passwordHash: '42db3be010a374e28fd943c14ed78be9407fe41c0d766bdc81e7ee025bdc36c1',
    photoUrl: createPosterDataUrl('KE', 'Kapten Eko', 4, true)
  },
];

const seedUsersById = Object.fromEntries(mockUsersList.map(user => [user.id, user]));
const seedUsersByEmail = Object.fromEntries(mockUsersList.map(user => [user.email, user]));

const initialShipsData = [
  { 
    id: 's1', name: 'MT MENGGALA', type: 'Oil Tanker', lat: '-6.1021', lng: '106.8833', status: 'UPP', 
    photoUrl: createPosterDataUrl('MT MENGGALA', 'Patroli aktif', 0, false),
    personnel: ['u1', 'u2', 'u3'], personnelNextMonth: ['u1', 'u4', 'u5'],
    route: 'Jakarta - Singapore', cargoType: 'Crude Oil', cargoAmount: '50,000 MT', 
    customCheckpoints: [{name: 'Cuaca', desc: 'Cek kondisi langit'}, {name: 'Ruang Mesin', desc: 'Cek suhu generator'}],
    documents: [{title: 'Sertifikat Keselamatan', desc: 'Exp: 2027'}, {title: 'Izin Berlayar', desc: 'Dikeluarkan Syahbandar'}]
  },
  { 
    id: 's2', name: 'MT SRIWIJAYA', type: 'Chemical Tanker', lat: '-5.9123', lng: '105.8122', status: 'NON UPP', 
    photoUrl: createPosterDataUrl('MT SRIWIJAYA', 'Armada siaga', 1, false),
    personnel: [], personnelNextMonth: [],
    route: 'Merak - Bakauheni', cargoType: 'Methanol', cargoAmount: '12,000 MT', 
    customCheckpoints: [{name: 'Pompa Kimia', desc: 'Pastikan tidak ada kebocoran'}],
    documents: []
  },
];

const APP_STORAGE_KEY = 'smartpatrol.legacy.local.v1';
const WEATHER_STORAGE_KEY = 'smartpatrol.legacy.weather.v1';
const WEATHER_TTL_MS = 30 * 60 * 1000;

function loadAuthSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.userId === 'string' ? parsed.userId : null;
  } catch {
    return null;
  }
}

function saveAuthSession(userId) {
  if (typeof window === 'undefined') return;
  try {
    if (!userId) {
      window.localStorage.removeItem(AUTH_SESSION_KEY);
      return;
    }

    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
      userId,
      savedAt: new Date().toISOString()
    }));
  } catch (error) {
    console.error('Gagal menyimpan sesi login', error);
  }
}

function fallbackHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fallback-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) {
    return fallbackHash(value);
  }

  const encoded = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function createSalt() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`.slice(0, 32);
}

async function createPasswordCredential(password) {
  const sanitizedPassword = sanitizeText(password, 120);
  const passwordSalt = createSalt();
  const passwordHash = await sha256Hex(`${passwordSalt}:${sanitizedPassword}`);
  return { passwordSalt, passwordHash, hasCredential: true };
}

async function verifyPasswordCredential(user, password) {
  if (!user?.passwordHash || !user?.passwordSalt) return false;
  const sanitizedPassword = sanitizeText(password, 120);
  if (!sanitizedPassword) return false;
  return (await sha256Hex(`${user.passwordSalt}:${sanitizedPassword}`)) === user.passwordHash;
}

function createFallbackEmail(name, index = 0) {
  const slug = sanitizeText(name, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/(^[.]+|[.]+$)/g, '') || `user.${index + 1}`;

  return `${slug}@smartpatrol.local`;
}

function normalizeUserRole(user) {
  const rawRole = sanitizeText(user?.role || '', 20).toUpperCase();
  if (ACCESS_ROLE_VALUES.includes(rawRole)) {
    return rawRole;
  }

  if (user?.name === 'Budi Santoso') return ACCESS_ROLES.ADMIN;
  if (user?.name === 'Kapten Eko' || user?.name === 'Sertu Agus') return ACCESS_ROLES.PIC;
  return ACCESS_ROLES.PETUGAS;
}

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

  return {
    ...seedUser,
    ...user,
    id: user?.id || seedUser?.id || `u${Date.now()}${index}`,
    name: safeName,
    role,
    type: sanitizeText(user?.type || seedUser?.type || 'BUJP', 20) || 'BUJP',
    status: role === ACCESS_ROLES.PETUGAS && !shipAssigned ? 'off-duty' : status,
    shipAssigned,
    email: safeEmail,
    password: '',
    hasCredential,
    passwordSalt,
    passwordHash,
    phone: sanitizePhone(user?.phone || seedUser?.phone || ''),
    address: sanitizeMultilineText(user?.address || seedUser?.address || '', 180),
    emergencyName: sanitizeText(user?.emergencyName || seedUser?.emergencyName || '', 80),
    emergencyContact: sanitizePhone(user?.emergencyContact || seedUser?.emergencyContact || ''),
    emergencyRelation: sanitizeText(user?.emergencyRelation || seedUser?.emergencyRelation || 'Orang Tua', 40) || 'Orang Tua',
    officeAddress: sanitizeMultilineText(user?.officeAddress || seedUser?.officeAddress || '', 180),
    photoUrl: sanitizeUrl(user?.photoUrl || seedUser?.photoUrl || '') || createUserAvatar(safeName, index)
  };
}

function normalizeUsersCollection(users) {
  const sourceUsers = Array.isArray(users) && users.length > 0 ? users : mockUsersList;
  return sourceUsers.map((user, index) => normalizeUserRecord(user, index));
}

function loadPersistedState() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.version === 1 ? parsed.data : null;
  } catch {
    return null;
  }
}

function savePersistedState(data) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data }));
  } catch (error) {
    console.error('Gagal menyimpan data lokal', error);
  }
}

function loadWeatherCache() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WEATHER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || !parsed?.data) return null;
    if (Date.now() - new Date(parsed.savedAt).getTime() > WEATHER_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function saveWeatherCache(data) {
  if (typeof window === 'undefined' || !data) return;
  try {
    window.localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data }));
  } catch (error) {
    console.error('Gagal menyimpan cache cuaca', error);
  }
}

async function pickLocalImage() {
  if (typeof document === 'undefined') return null;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
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

const persistedState = loadPersistedState();

export default function App() {
  const [currentPage, setCurrentPage] = useState('home'); // home, history, incidents, users, ships
  const [sessionUserId, setSessionUserId] = useState(() => loadAuthSession());
  const [authMode, setAuthMode] = useState('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authForm, setAuthForm] = useState(() => createAuthFormState());
  
  // States
  const [checkpoints, setCheckpoints] = useState(() => persistedState?.checkpoints || initialCheckpoints);
  const [shipsData, setShipsData] = useState(() => persistedState?.shipsData || initialShipsData);
  const [usersData, setUsersData] = useState(() => normalizeUsersCollection(persistedState?.usersData || mockUsersList));
  const [incidentsData, setIncidentsData] = useState(() => persistedState?.incidentsData || []);
  
  // UI States
  const [activeForms, setActiveForms] = useState({});
  const [previewPhoto, setPreviewPhoto] = useState(null); 
  const [selectedReportDetail, setSelectedReportDetail] = useState(null); 
  const [newCustomNode, setNewCustomNode] = useState('');

  // States Halaman Temuan
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState(() => createIncidentFormState());

  // States Halaman Armada Detail
  const [activeShipId, setActiveShipId] = useState(null);
  const [shipDetailTab, setShipDetailTab] = useState('info');
  const [scheduleMonth, setScheduleMonth] = useState('current');
  const [isEditingShipInfo, setIsEditingShipInfo] = useState(false);
  const [editShipInfoData, setEditShipInfoData] = useState({});
  
  // Form States untuk Tambah Armada Baru
  const [showShipForm, setShowShipForm] = useState(false);
  const [shipFormData, setShipFormData] = useState(() => createShipFormState());
  const [newCheckpoint, setNewCheckpoint] = useState('');

  // Form States untuk Armada Detail
  const [newShipCp, setNewShipCp] = useState({name: '', desc: ''});
  const [newShipDoc, setNewShipDoc] = useState({title: '', desc: ''});

  // State Cuaca
  const [weatherInfo, setWeatherInfo] = useState(() => loadWeatherCache());
  const [weatherLoading, setWeatherLoading] = useState(() => !loadWeatherCache());

  const [selectedIncident, setSelectedIncident] = useState(null);
  const [incidentMeta, setIncidentMeta] = useState(() => persistedState?.incidentMeta || {});
  const [newProgress, setNewProgress] = useState({ comment: '', photoUrl: null });
  
  const [showUserForm, setShowUserForm] = useState(false);
  const [userFormData, setUserFormData] = useState(() => createUserFormState());
  const [selectedUser, setSelectedUser] = useState(null); // Detail & Edit User
  const [searchQuery, setSearchQuery] = useState(''); // State untuk pencarian
  const [patrolTab, setPatrolTab] = useState('checkpoint'); // State untuk tab Patroli
  
  // --- HELPERS & HANDLERS ---
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const currentUserRecord = useMemo(
    () => usersData.find(user => user.id === sessionUserId) || null,
    [usersData, sessionUserId]
  );
  const currentUser = currentUserRecord?.name || '';
  const currentUserRole = currentUserRecord?.role || ACCESS_ROLES.PETUGAS;
  const isAdmin = currentUserRole === ACCESS_ROLES.ADMIN;
  const isPic = currentUserRole === ACCESS_ROLES.PIC;
  const isPetugas = currentUserRole === ACCESS_ROLES.PETUGAS;
  const operationalShip = useMemo(() => {
    if (shipsData.length === 0) return null;
    if (currentUserRecord?.shipAssigned) {
      return shipsData.find(ship => ship.name === currentUserRecord.shipAssigned) || shipsData[0];
    }
    return shipsData[0];
  }, [shipsData, currentUserRecord?.shipAssigned]);
  const operationalShipName = operationalShip?.name || currentUserRecord?.shipAssigned || 'MT MENGGALA';
  const filteredCheckpoints = useMemo(
    () => checkpoints.filter(cp => cp.name.toLowerCase().includes(deferredSearchQuery.toLowerCase())),
    [checkpoints, deferredSearchQuery]
  );
  const incidentLocationOptions = useMemo(
    () => Array.from(new Set(checkpoints.map(cp => cp.name))),
    [checkpoints]
  );
  const completedCount = useMemo(() => checkpoints.filter(c => c.status === 'completed').length, [checkpoints]);
  const totalCount = checkpoints.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const activePatrolId = useMemo(() => Object.keys(activeForms)[0], [activeForms]);
  const activePatrolState = useMemo(() => activePatrolId ? activeForms[activePatrolId] : null, [activeForms, activePatrolId]);
  const activePatrolItem = useMemo(() => activePatrolId ? checkpoints.find(c => c.id === Number(activePatrolId)) : null, [activePatrolId, checkpoints]);
  const canPatrolCurrentShip = Boolean(currentUserRecord && (isAdmin || isPic || (isPetugas && currentUserRecord.shipAssigned && currentUserRecord.status === 'active')));

  const canManageIncident = (incident) => {
    if (!currentUserRecord || !incident) return false;
    if (isAdmin || isPic) return true;
    if (!isPetugas) return false;
    return Boolean(currentUserRecord.shipAssigned && incident.shipName === currentUserRecord.shipAssigned);
  };

  const handleActionClick = (id, type) => {
    if (!canPatrolCurrentShip) return;
    setActiveForms({ [id]: { type, penyebab: '', kejadian: '', tindakLanjut: '', photoUrl: null } });
  };

  const handleFormChange = (id, field, value) => {
    setActiveForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handlePhotoUpload = async (id, isIncident = false) => {
    const url = await pickLocalImage();
    if (!url) return;
    if(isIncident) {
      setIncidentForm(prev => ({...prev, photoUrl: url}));
    } else {
      handleFormChange(id, 'photoUrl', url);
    }
  };

  const handleSubmitPatrol = (id) => {
    if (!currentUserRecord) return;
    const timeString = new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
    const formState = activeForms[id];
    setCheckpoints(prev => prev.map(c => 
      c.id === id ? { ...c, status: 'completed', completedBy: currentUser, time: timeString, shipName: operationalShipName, photoUrl: sanitizeUrl(formState.photoUrl), resultType: formState.type, penyebab: sanitizeMultilineText(formState.penyebab, 240), kejadian: sanitizeMultilineText(formState.kejadian, 280), tindakLanjut: sanitizeMultilineText(formState.tindakLanjut, 240) } : c
    ));
    const newForms = { ...activeForms }; delete newForms[id]; setActiveForms(newForms);
  };

  const handleDeleteReport = (id) => {
    setCheckpoints(prev => prev.map(c => c.id === id ? { id: c.id, name: c.name, status: 'pending' } : c));
    setSelectedReportDetail(null); 
  };

  const handleOpenPatrolResult = (item) => {
    if (item.resultType === 'temuan') {
      setSelectedIncident({
        id: `p-${item.id}`,
        date: new Date().toLocaleDateString('id-ID'),
        time: item.time,
        location: item.name,
        shipName: item.shipName || operationalShipName,
        deskripsi: item.kejadian,
        penyebab: item.penyebab,
        tindakLanjut: item.tindakLanjut,
        reportedBy: item.completedBy,
        photoUrl: item.photoUrl,
        isPatrol: true
      });
      return;
    }

    setSelectedReportDetail(item);
  };

  const handleAddCustomPatrolNode = () => {
    const safeName = sanitizeText(newCustomNode, 80);
    if(safeName !== '') {
      setCheckpoints(prev => [...prev, { id: Date.now(), name: safeName, status: 'pending' }]);
      setNewCustomNode('');
    }
  };

  const openIncidentModal = () => {
    setIncidentForm(createIncidentFormState());
    setShowIncidentModal(true);
  };

  const closeIncidentModal = () => {
    setShowIncidentModal(false);
    setIncidentForm(createIncidentFormState());
  };

  const handleSubmitIncident = () => {
    if (!currentUserRecord) return;
    const loc = incidentForm.locType === 'custom' ? sanitizeText(incidentForm.customLocation, 80) : sanitizeText(incidentForm.location, 80);
    if (!loc || !sanitizeMultilineText(incidentForm.deskripsi, 320)) return;
    const newIncident = {
      ...incidentForm,
      id: Date.now(), time: new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'}), date: new Date().toLocaleDateString('id-ID'),
      reportedBy: currentUser,
      shipName: operationalShipName,
      location: loc,
      customLocation: incidentForm.locType === 'custom' ? loc : '',
      photoUrl: sanitizeUrl(incidentForm.photoUrl),
      penyebab: sanitizeMultilineText(incidentForm.penyebab, 240),
      deskripsi: sanitizeMultilineText(incidentForm.deskripsi, 320),
      tindakLanjut: sanitizeMultilineText(incidentForm.tindakLanjut, 240),
    };
    setIncidentsData(prev => [newIncident, ...prev]);
    closeIncidentModal();
  };

  // --- KUMPULKAN SEMUA TEMUAN (Manual + Patroli) ---
  const patrolIncidents = useMemo(() => checkpoints
    .filter(c => c.status === 'completed' && c.resultType === 'temuan')
    .map(c => ({
      id: `p-${c.id}`,
      date: new Date().toLocaleDateString('id-ID'),
      time: c.time,
      location: c.name,
      shipName: c.shipName || 'MT MENGGALA',
      deskripsi: c.kejadian,
      penyebab: c.penyebab,
      tindakLanjut: c.tindakLanjut,
      reportedBy: c.completedBy,
      photoUrl: c.photoUrl,
      isPatrol: true
    })), [checkpoints]);
  
  const allIncidents = useMemo(
    () => [...incidentsData, ...patrolIncidents].map(incident => ({
      ...incident,
      shipName: incident.shipName || 'MT MENGGALA'
    })),
    [incidentsData, patrolIncidents]
  );
  const visibleIncidents = useMemo(
    () => isPetugas && currentUserRecord?.shipAssigned
      ? allIncidents.filter(incident => incident.shipName === currentUserRecord.shipAssigned)
      : allIncidents,
    [allIncidents, currentUserRecord?.shipAssigned, isPetugas]
  );

  const activeShip = useMemo(() => shipsData.find(s => s.id === activeShipId), [shipsData, activeShipId]);
  const updateActiveShip = (updates) => {
    if (!isAdmin || !activeShipId) return;
    setShipsData(prev => prev.map(s => s.id === activeShipId ? { ...s, ...updates } : s));
  };

  const handleTogglePersonnel = (userId) => {
    if (!isAdmin || !activeShip) return;
    const targetArray = scheduleMonth === 'current' ? activeShip.personnel : activeShip.personnelNextMonth;
    const isAssigned = targetArray.includes(userId);
    
    if (isAssigned) {
      updateActiveShip({ [scheduleMonth === 'current' ? 'personnel' : 'personnelNextMonth']: targetArray.filter(id => id !== userId) });
      if(scheduleMonth === 'current') setUsersData(prev => prev.map(u => u.id === userId ? {...u, shipAssigned: null, status: 'off-duty'} : u));
    } else {
      updateActiveShip({ [scheduleMonth === 'current' ? 'personnel' : 'personnelNextMonth']: [...targetArray, userId] });
      if(scheduleMonth === 'current') setUsersData(prev => prev.map(u => u.id === userId ? {...u, shipAssigned: activeShip.name, status: 'active'} : u));
    }
  };

  const handleAddShipCp = () => {
    if (!isAdmin || !activeShip) return;
    const safeName = sanitizeText(newShipCp.name, 80);
    if(safeName) {
      updateActiveShip({ customCheckpoints: [...activeShip.customCheckpoints, { name: safeName, desc: sanitizeMultilineText(newShipCp.desc, 140) }] });
      setNewShipCp({name: '', desc: ''});
    }
  };
  const handleAddShipDoc = () => {
    if (!isAdmin || !activeShip) return;
    const safeTitle = sanitizeText(newShipDoc.title, 80);
    if(safeTitle) {
      updateActiveShip({ documents: [...activeShip.documents, { title: safeTitle, desc: sanitizeMultilineText(newShipDoc.desc, 140) }] });
      setNewShipDoc({title: '', desc: ''});
    }
  };

  const handleUserPhotoUpload = async () => {
    const url = await pickLocalImage();
    if (url) setUserFormData(prev => ({...prev, photoUrl: url}));
  };

  const handleSaveUser = async () => {
    if (!isAdmin) return;
    const safeName = sanitizeText(userFormData.name, 80);
    const safeEmail = sanitizeEmail(userFormData.email);
    const passwordInput = sanitizeText(userFormData.password, 120);
    if (!safeName || !safeEmail) return;
    if (safeEmail && usersData.some(u => (u.email || '').toLowerCase() === safeEmail)) return;
    const credential = passwordInput ? await createPasswordCredential(passwordInput) : { passwordSalt: '', passwordHash: '', hasCredential: false };
    const role = ACCESS_ROLE_VALUES.includes(userFormData.role) ? userFormData.role : ACCESS_ROLES.PETUGAS;
    const newUser = {
      id: 'u' + Date.now(),
      ...userFormData,
      name: safeName,
      role,
      email: safeEmail,
      password: '',
      hasCredential: credential.hasCredential,
      passwordSalt: credential.passwordSalt,
      passwordHash: credential.passwordHash,
      phone: sanitizePhone(userFormData.phone),
      address: sanitizeMultilineText(userFormData.address, 180),
      emergencyName: sanitizeText(userFormData.emergencyName, 80),
      emergencyContact: sanitizePhone(userFormData.emergencyContact),
      emergencyRelation: sanitizeText(userFormData.emergencyRelation, 40),
      officeAddress: sanitizeMultilineText(userFormData.officeAddress, 180),
      photoUrl: sanitizeUrl(userFormData.photoUrl) || createUserAvatar(safeName, usersData.length),
      status: role === ACCESS_ROLES.PETUGAS ? 'off-duty' : 'active',
      shipAssigned: null
    };
    setUsersData(prev => [...prev, normalizeUserRecord(newUser, prev.length)]);
    setShowUserForm(false);
    setUserFormData(createUserFormState());
  };

  const handleUpdateUser = async () => {
    if (!isAdmin) return;
    if (!selectedUser?.id) return;
    const safeEmail = sanitizeEmail(selectedUser.email || '');
    const safeName = sanitizeText(selectedUser.name, 80);
    if (!safeName || !safeEmail) return;
    if (safeEmail && usersData.some(u => u.id !== selectedUser.id && (u.email || '').toLowerCase() === safeEmail)) return;
    const passwordInput = sanitizeText(selectedUser.password || '', 120);
    const credential = passwordInput ? await createPasswordCredential(passwordInput) : null;
    setUsersData(prev => prev.map((u, index) => {
      if (u.id !== selectedUser.id) return u;

      const nextRole = ACCESS_ROLE_VALUES.includes(selectedUser.role) ? selectedUser.role : ACCESS_ROLES.PETUGAS;
      const nextShipAssigned = nextRole === ACCESS_ROLES.PETUGAS ? (selectedUser.shipAssigned || null) : (selectedUser.shipAssigned || null);
      const nextUser = {
        ...u,
        ...selectedUser,
        name: safeName,
        role: nextRole,
        email: safeEmail,
        password: '',
        hasCredential: credential?.hasCredential || u.hasCredential || false,
        passwordSalt: credential?.passwordSalt || u.passwordSalt || '',
        passwordHash: credential?.passwordHash || u.passwordHash || '',
        shipAssigned: nextShipAssigned,
        status: nextRole === ACCESS_ROLES.PETUGAS ? (nextShipAssigned ? (selectedUser.status || u.status || 'active') : 'off-duty') : (selectedUser.status || u.status || 'active'),
        phone: sanitizePhone(selectedUser.phone || ''),
        address: sanitizeMultilineText(selectedUser.address || '', 180),
        emergencyName: sanitizeText(selectedUser.emergencyName || '', 80),
        emergencyContact: sanitizePhone(selectedUser.emergencyContact || ''),
        emergencyRelation: sanitizeText(selectedUser.emergencyRelation || '', 40),
        officeAddress: sanitizeMultilineText(selectedUser.officeAddress || '', 180),
        photoUrl: sanitizeUrl(selectedUser.photoUrl || '') || u.photoUrl || createUserAvatar(safeName, index)
      };

      return normalizeUserRecord(nextUser, index);
    }));
    setSelectedUser(null);
  };

  const handleDeleteUser = (id) => {
    if (!isAdmin) return;
    setUsersData(prev => prev.filter(u => u.id !== id));
    setShipsData(prev => prev.map(ship => ({
      ...ship,
      personnel: ship.personnel.filter(userId => userId !== id),
      personnelNextMonth: ship.personnelNextMonth.filter(userId => userId !== id)
    })));
    if (sessionUserId === id) {
      setSessionUserId(null);
      setAuthMode('login');
      setAuthNotice('Akun sedang dipakai telah dihapus. Silakan login ulang.');
    }
    setSelectedUser(null);
  };

  const handleEditUserPhotoUpload = async () => {
    const url = await pickLocalImage();
    if (url) setSelectedUser(prev => ({...prev, photoUrl: url}));
  };

  const handleAddProgress = (incidentId) => {
     const incident = allIncidents.find(item => item.id === incidentId) || selectedIncident;
     if (!canManageIncident(incident)) return;
     const time = new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
     const date = new Date().toLocaleDateString('id-ID');
     setIncidentMeta(prev => ({
       ...prev,
       [incidentId]: {
         ...prev[incidentId],
         status: prev[incidentId]?.status || 'open',
          progress: [...(prev[incidentId]?.progress || []), { ...newProgress, comment: sanitizeMultilineText(newProgress.comment, 240), photoUrl: sanitizeUrl(newProgress.photoUrl), time, date, author: currentUser }]
        }
      }));
      setNewProgress({ comment: '', photoUrl: null });
  };

  const handleCloseIncident = (incidentId) => {
     const incident = allIncidents.find(item => item.id === incidentId) || selectedIncident;
     if (!canManageIncident(incident)) return;
     setIncidentMeta(prev => ({
       ...prev,
       [incidentId]: { ...(prev[incidentId] || {}), status: 'closed' }
     }));
  };

  const handlePhotoProgress = async () => {
     const url = await pickLocalImage();
     if (url) setNewProgress(prev => ({ ...prev, photoUrl: url }));
  };

  const handleSaveShip = () => {
    if (!isAdmin) return;
    const safeName = sanitizeText(shipFormData.name, 80);
    if (!safeName) return;
    const newShip = {
      id: 's' + Date.now(),
      ...shipFormData,
      name: safeName,
      route: sanitizeText(shipFormData.route, 100),
      cargoType: sanitizeText(shipFormData.cargoType, 80),
      cargoAmount: sanitizeText(shipFormData.cargoAmount, 40),
      lat: '-6.0000',
      lng: '106.0000',
      personnel: [],
      personnelNextMonth: [],
      documents: [],
      photoUrl: createPosterDataUrl(safeName, 'Armada Lokal', 2, false)
    };
    setShipsData(prev => [...prev, newShip]);
    setShowShipForm(false);
    setShipFormData(createShipFormState());
  };

  const handleAddCheckpointToForm = () => {
    const safeName = sanitizeText(newCheckpoint, 80);
    if(safeName !== '') {
      setShipFormData(prev => ({...prev, customCheckpoints: [...prev.customCheckpoints, { name: safeName, desc: '' }]}));
      setNewCheckpoint('');
    }
  };

  const handleRemoveCheckpointFromForm = (index) => {
    setShipFormData(prev => ({
      ...prev,
      customCheckpoints: prev.customCheckpoints.filter((_, i) => i !== index)
    }));
  };

  const handleLogout = (message = 'Sesi Anda telah berakhir. Silakan login kembali.') => {
    setSessionUserId(null);
    setCurrentPage('home');
    setActiveShipId(null);
    setSelectedIncident(null);
    setSelectedReportDetail(null);
    setSelectedUser(null);
    setShowUserForm(false);
    setShowShipForm(false);
    setActiveForms({});
    setNewProgress({ comment: '', photoUrl: null });
    setAuthMode('login');
    setAuthError('');
    setAuthNotice(message);
    setAuthForm(createAuthFormState());
  };

  const handleLogin = async () => {
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
      const user = usersData.find(item => (item.email || '').toLowerCase() === safeEmail);
      if (!user) {
        setAuthError('Akun tidak ditemukan.');
        return;
      }

      if (!user.hasCredential || !user.passwordHash || !user.passwordSalt) {
        setAuthError('Akun ini belum punya password aktif. Minta admin untuk mengatur ulang kredensial.');
        return;
      }

      const isValid = await verifyPasswordCredential(user, passwordInput);
      if (!isValid) {
        setAuthError('Password yang Anda masukkan tidak cocok.');
        return;
      }

      if (user.role === ACCESS_ROLES.PETUGAS && (!user.shipAssigned || user.status !== 'active')) {
        setAuthError('Petugas off-duty atau belum punya penugasan kapal tidak bisa login.');
        return;
      }

      setSessionUserId(user.id);
      setCurrentPage('home');
      setActiveShipId(null);
      setAuthMode('login');
      setAuthForm(createAuthFormState());
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRegister = async () => {
    const safeName = sanitizeText(authForm.name, 80);
    const safeEmail = sanitizeEmail(authForm.email);
    const passwordInput = sanitizeText(authForm.password, 120);
    const confirmPassword = sanitizeText(authForm.confirmPassword, 120);
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

    if (usersData.some(user => (user.email || '').toLowerCase() === safeEmail)) {
      setAuthError('Email ini sudah terdaftar.');
      return;
    }

    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');
    try {
      const credential = await createPasswordCredential(passwordInput);
      const nextUser = normalizeUserRecord({
        id: `u${Date.now()}`,
        name: safeName,
        role: ACCESS_ROLES.PETUGAS,
        type: sanitizeText(authForm.type, 20) || 'BUJP',
        status: 'off-duty',
        shipAssigned: null,
        email: safeEmail,
        password: '',
        hasCredential: credential.hasCredential,
        passwordSalt: credential.passwordSalt,
        passwordHash: credential.passwordHash,
        phone: sanitizePhone(authForm.phone),
        emergencyRelation: 'Orang Tua',
        photoUrl: createUserAvatar(safeName, usersData.length)
      }, usersData.length);

      setUsersData(prev => [...prev, nextUser]);
      setAuthMode('login');
      setAuthForm(createAuthFormState({ email: safeEmail }));
      setAuthNotice('Registrasi berhasil. Akun petugas baru bisa login setelah admin memberi penugasan kapal.');
    } finally {
      setAuthBusy(false);
    }
  };

  useEffect(() => {
    savePersistedState({ checkpoints, shipsData, usersData, incidentsData, incidentMeta });
  }, [checkpoints, shipsData, usersData, incidentsData, incidentMeta]);

  useEffect(() => {
    saveAuthSession(sessionUserId);
  }, [sessionUserId]);

  useEffect(() => {
    if (!sessionUserId) return;
    const activeUser = usersData.find(user => user.id === sessionUserId);
    if (!activeUser) {
      handleLogout('Sesi login tidak lagi valid.');
      return;
    }

    if (activeUser.role === ACCESS_ROLES.PETUGAS && (!activeUser.shipAssigned || activeUser.status !== 'active')) {
      handleLogout('Petugas off-duty atau tanpa penugasan kapal tidak bisa tetap login.');
    }
  }, [sessionUserId, usersData]);

  useEffect(() => {
    if (!currentUserRecord) return;
    if (!isAdmin && (currentPage === 'users' || currentPage === 'ships')) {
      setCurrentPage('home');
      setActiveShipId(null);
      setShowShipForm(false);
      setShowUserForm(false);
      setSelectedUser(null);
    }
  }, [currentPage, currentUserRecord, isAdmin]);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-6.1021&longitude=106.8833&current_weather=true');
        const data = await response.json();
        setWeatherInfo(data.current_weather);
        saveWeatherCache(data.current_weather);
      } catch (error) { console.error(error); } finally { setWeatherLoading(false); }
    };
    if (!weatherInfo) {
      fetchWeather();
    } else {
      setWeatherLoading(false);
    }
  }, []);

  const getWeatherDetail = (code) => {
    if (code === 0) return { text: 'Cerah', icon: <Sun className="w-5 h-5 text-cyan-400" /> };
    if (code >= 1 && code <= 3) return { text: 'Berawan', icon: <Cloud className="w-5 h-5 text-cyan-200" /> };
    if (code >= 51 && code <= 67) return { text: 'Hujan Ringan', icon: <CloudRain className="w-5 h-5 text-cyan-500" /> };
    if (code >= 80 && code <= 99) return { text: 'Hujan Badai', icon: <CloudRain className="w-5 h-5 text-yellow-500" /> };
    return { text: 'Tidak Diketahui', icon: <Cloud className="w-5 h-5 text-slate-500" /> };
  };

  if (!currentUserRecord) {
    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&display=swap');`}</style>
        <div style={{ fontFamily: '"Chakra Petch", sans-serif' }} className="w-full min-h-screen bg-[#070b19] text-cyan-50 sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 sm:shadow-[0_0_40px_rgba(6,182,212,0.1)] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_42%),radial-gradient(circle_at_bottom,_rgba(250,204,21,0.08),_transparent_35%)]"></div>
          <div className="relative min-h-screen flex flex-col justify-center px-5 py-8">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.12)]">
                  <ShieldAlert className="w-7 h-7 text-cyan-300" />
                </div>
                <div>
                  <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-[0.35em]">SmartPatrol Local</p>
                  <h1 className="text-3xl font-black text-white leading-none mt-1">Akses Sistem</h1>
                </div>
              </div>
              <p className="text-sm text-cyan-100/70 leading-relaxed">Login dulu sebelum masuk aplikasi. Registrasi publik akan membuat akun petugas baru, lalu admin perlu memberi penugasan kapal sebelum akun itu bisa aktif.</p>
            </div>

            <div className="bg-[#0b1229]/95 border border-cyan-800/50 rounded-3xl p-5 shadow-[0_20px_50px_rgba(2,6,23,0.45)] backdrop-blur-md">
              <div className="flex gap-2 bg-[#070b19] p-1.5 rounded-full border border-cyan-900/50 mb-5">
                <button onClick={() => { setAuthMode('login'); setAuthError(''); setAuthNotice(''); }} className={`flex-1 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-colors ${authMode === 'login' ? 'bg-cyan-600 text-white' : 'text-cyan-500'}`}>Login</button>
                <button onClick={() => { setAuthMode('register'); setAuthError(''); setAuthNotice(''); }} className={`flex-1 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-colors ${authMode === 'register' ? 'bg-yellow-500 text-[#070b19]' : 'text-cyan-500'}`}>Registrasi</button>
              </div>

              {authNotice && (
                <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-xs text-emerald-200 leading-relaxed">{authNotice}</div>
              )}
              {authError && (
                <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-xs text-rose-200 leading-relaxed">{authError}</div>
              )}

              <div className="space-y-4">
                {authMode === 'register' && (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-500 mb-1.5 block pl-1">Nama Lengkap</label>
                    <input type="text" value={authForm.name} onChange={e => setAuthForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Contoh: Joko Pratama" className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-500 mb-1.5 block pl-1">Email</label>
                  <input type="email" value={authForm.email} onChange={e => setAuthForm(prev => ({ ...prev, email: e.target.value }))} placeholder="email@domain.com" className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
                </div>

                {authMode === 'register' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-500 mb-1.5 block pl-1">Instansi</label>
                      <select value={authForm.type} onChange={e => setAuthForm(prev => ({ ...prev, type: e.target.value }))} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none">
                        <option value="BUJP">BUJP</option>
                        <option value="TNI">TNI</option>
                        <option value="POLRI">POLRI</option>
                        <option value="INTERNAL">INTERNAL</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-500 mb-1.5 block pl-1">No. WA</label>
                      <input type="tel" value={authForm.phone} onChange={e => setAuthForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="0812..." className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-500 mb-1.5 block pl-1">Password</label>
                  <input type="password" value={authForm.password} onChange={e => setAuthForm(prev => ({ ...prev, password: e.target.value }))} placeholder="Minimal 8 karakter" className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
                </div>

                {authMode === 'register' && (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-500 mb-1.5 block pl-1">Konfirmasi Password</label>
                    <input type="password" value={authForm.confirmPassword} onChange={e => setAuthForm(prev => ({ ...prev, confirmPassword: e.target.value }))} placeholder="Ulangi password" className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
                  </div>
                )}

                <button disabled={authBusy} onClick={authMode === 'login' ? handleLogin : handleRegister} className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-lg ${authMode === 'login' ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)]' : 'bg-yellow-500 hover:bg-yellow-400 text-[#070b19] shadow-[0_0_20px_rgba(250,204,21,0.22)]'} disabled:opacity-60`}>
                  {authBusy ? 'Memproses...' : (authMode === 'login' ? 'Masuk ke SmartPatrol' : 'Buat Akun Petugas')}
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3">
              {[
                { role: 'ADMIN', email: 'admin@smartpatrol.local', password: 'Admin123!', note: 'Akses penuh ke semua page.' },
                { role: 'PIC', email: 'pic@smartpatrol.local', password: 'Pic12345!', note: 'Bisa update progress temuan di kapal manapun.' },
                { role: 'PETUGAS', email: 'petugas@smartpatrol.local', password: 'Petugas123!', note: 'Hanya bisa update progress di kapal penugasan.' }
              ].map(account => (
                <button key={account.email} onClick={() => { setAuthMode('login'); setAuthError(''); setAuthNotice(''); setAuthForm(createAuthFormState({ email: account.email, password: account.password })); }} className="text-left bg-[#0b1229]/85 border border-cyan-900/50 rounded-2xl px-4 py-3 hover:border-cyan-500/40 transition-colors">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">{account.role}</p>
                      <p className="text-sm font-bold text-cyan-50 mt-1">{account.email}</p>
                      <p className="text-xs text-cyan-100/60 mt-1">Password: <span className="text-cyan-300">{account.password}</span></p>
                    </div>
                    <span className="text-[10px] text-cyan-600 uppercase tracking-widest">Isi Otomatis</span>
                  </div>
                  <p className="text-[11px] text-cyan-100/55 mt-2 leading-relaxed">{account.note}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&display=swap');`}</style>
    <div style={{ fontFamily: '"Chakra Petch", sans-serif' }} className="w-full min-h-screen bg-[#070b19] text-cyan-50 sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 sm:shadow-[0_0_40px_rgba(6,182,212,0.1)] relative flex flex-col">
      
      {/* HEADER */}
      <div className="sticky top-0 z-40 bg-[#0b1229]/90 backdrop-blur-md border-b border-cyan-800 px-4 py-3 flex justify-between items-center shadow-[0_4px_15px_rgba(6,182,212,0.1)]">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-cyan-50">SmartPatrol</h1>
              <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold tracking-widest uppercase ${isAdmin ? 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30' : isPic ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>{currentUserRole}</span>
            </div>
            <p className="text-[10px] text-cyan-500 mt-0.5">{currentUser}{currentUserRecord?.shipAssigned ? ` • ${currentUserRecord.shipAssigned}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 bg-cyan-950/50 text-cyan-300 rounded-full border border-cyan-500/30">
            <Wifi className="w-3 h-3" /> <span className="hidden sm:inline">Tersinkronisasi</span>
          </div>
          <button onClick={() => handleLogout('Anda berhasil logout dari SmartPatrol.')} className="px-3 py-1.5 rounded-full border border-cyan-700 text-cyan-300 hover:bg-cyan-900/40 transition-colors text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto pb-24">
        
        {/* --- PAGE: HOME (PATROLI) --- */}
        {currentPage === 'home' && (
          <div className="p-4 space-y-4 animate-in fade-in flex flex-col min-h-full">
            
            {/* Tab Navigation Patroli */}
            <div className="flex bg-[#0b1229] p-1 rounded-xl border border-cyan-800/50 shadow-sm shrink-0">
              <button onClick={() => setPatrolTab('checkpoint')} className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${patrolTab === 'checkpoint' ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 shadow-sm' : 'text-cyan-700 hover:text-cyan-500'}`}>
                <CheckCircle2 className="w-4 h-4"/> Checkpoint
              </button>
              <button onClick={() => setPatrolTab('info')} className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${patrolTab === 'info' ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 shadow-sm' : 'text-cyan-700 hover:text-cyan-500'}`}>
                <FileText className="w-4 h-4"/> Info
              </button>
            </div>

            {/* TAB CONTENT: INFO */}
            {patrolTab === 'info' && (
              <div className="animate-in fade-in space-y-6 pt-2">
                
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-cyan-400 mb-1 flex items-center gap-1 font-medium"><Ship className="w-4 h-4"/> Laporan Patroli</p>
                    <h2 className="text-2xl font-bold text-white tracking-wide mb-1">{operationalShip?.name || 'Belum Ada Kapal'}</h2>
                    <div className="text-[11px] text-cyan-200 mt-1 flex items-center gap-2 flex-wrap bg-[#070b19]/50 inline-flex px-2 py-1 rounded-md border border-cyan-900">
                       <a href={`https://maps.google.com/?q=${operationalShip?.lat || '-6.1021'},${operationalShip?.lng || '106.8833'}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-cyan-300 transition-colors group">
                          <MapPin className="w-3 h-3 text-cyan-400 group-hover:animate-bounce" /> 
                          <span className="underline underline-offset-2 decoration-cyan-800 group-hover:decoration-cyan-400">{operationalShip?.lat || '-6.1021'}, {operationalShip?.lng || '106.8833'}</span>
                          <ExternalLink className="w-2.5 h-2.5 text-cyan-600 group-hover:text-cyan-300 ml-0.5" />
                       </a>
                       <span className="text-cyan-700">|</span>
                       <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3 text-cyan-400" /> {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="inline-block px-3 py-1 bg-cyan-900/50 text-cyan-300 rounded-lg text-sm font-bold border border-cyan-700">Shift 2</span>
                    <p className="text-xs text-cyan-500 mt-1">12:00 - 18:00</p>
                  </div>
                </div>

                {/* Map GPS Google Maps (Colored) */}
                <div className="w-full h-44 rounded-2xl overflow-hidden border border-cyan-800/50 relative shadow-lg">
                  <iframe 
                    width="100%" 
                    height="100%" 
                    frameBorder="0" 
                    scrolling="no" 
                    marginHeight="0" 
                    marginWidth="0" 
                    src={`https://maps.google.com/maps?q=${operationalShip?.lat || '-6.1021'},${operationalShip?.lng || '106.8833'}&hl=id&z=14&output=embed`}
                    title="Map Location"
                  ></iframe>
                </div>

                {/* Weather Widget */}
                <div className="bg-[#0b1229] rounded-2xl p-4 border border-cyan-800/50 flex items-center justify-between relative shadow-sm">
                  {weatherLoading ? <p className="text-xs text-cyan-500 animate-pulse w-full text-center">Scanning Atmosphere...</p> : weatherInfo ? (
                    <>
                      <div className="flex items-center gap-3">
                         <div className="p-2 bg-cyan-900/20 rounded-xl">
                            {getWeatherDetail(weatherInfo.weathercode).icon}
                         </div>
                         <div className="flex flex-col">
                           <span className="text-[10px] text-cyan-500 font-medium uppercase tracking-wider">Kondisi</span>
                           <span className="text-sm font-bold text-cyan-50">{getWeatherDetail(weatherInfo.weathercode).text}</span>
                         </div>
                      </div>
                      <div className="flex items-center gap-4">
                         <div className="flex flex-col items-end">
                            <span className="text-[10px] text-cyan-500 flex items-center gap-1 uppercase tracking-wider"><Thermometer className="w-3 h-3 text-rose-400" /> Temp</span>
                            <span className="text-sm font-bold text-cyan-50">{weatherInfo.temperature}°C</span>
                         </div>
                         <div className="w-px h-6 bg-cyan-800"></div>
                         <div className="flex flex-col items-start">
                            <span className="text-[10px] text-cyan-500 flex items-center gap-1 uppercase tracking-wider"><Wind className="w-3 h-3 text-emerald-400" /> Wind</span>
                            <span className="text-sm font-bold text-cyan-50">{weatherInfo.windspeed} k/j</span>
                         </div>
                      </div>
                    </>
                  ) : null}
                </div>

                {/* Petugas Jaga List */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-1 pl-1">Petugas Jaga Aktif</h3>
                  {usersData.filter(u => u.shipAssigned === operationalShipName && u.status === 'active').map((u) => {
                    const completedPoints = checkpoints.filter(cp => cp.status === 'completed' && cp.completedBy === u.name).length;
                    
                    return (
                      <div key={u.id} className="bg-[#0b1229] rounded-2xl p-3 border border-cyan-800/50 flex items-center justify-between shadow-sm hover:border-cyan-500/50 transition-colors">
                         <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-[#070b19] border border-cyan-700/50 overflow-hidden shrink-0">
                              {u.photoUrl ? (
                                <img src={u.photoUrl} alt={u.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-cyan-500"><User className="w-6 h-6"/></div>
                              )}
                            </div>
                            <div>
                               <p className="text-sm font-bold text-cyan-50">{u.name}</p>
                               <p className="text-[10px] text-cyan-500 uppercase font-bold tracking-tight">{u.role}</p>
                            </div>
                         </div>
                         <div className="text-right bg-[#070b19] px-3 py-2 rounded-xl border border-cyan-900/50">
                            <span className="text-base font-black text-emerald-400">{completedPoints}</span>
                            <span className="text-[9px] text-cyan-600 uppercase font-bold tracking-widest ml-1.5">Titik</span>
                         </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB CONTENT: CHECKPOINT */}
            {patrolTab === 'checkpoint' && (
              <div className="relative animate-in fade-in flex-1 flex flex-col pb-32">
                <div className="sticky top-0 z-30 bg-[#070b19]/95 backdrop-blur-md py-3 -mx-4 px-4 border-b border-cyan-900/50 shadow-sm transition-all duration-300 mb-4">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari titik Patroli..." 
                      className="w-full bg-[#0b1229] border border-cyan-800/80 rounded-xl py-3 pl-10 pr-4 text-sm text-cyan-50 focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.2)] outline-none transition-all"
                    />
                    <Search className="w-4 h-4 text-cyan-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
                
                <div className="space-y-3 flex-1">
                  {filteredCheckpoints.length === 0 && (
                    <p className="text-xs text-cyan-700 italic border border-dashed border-cyan-900/50 p-4 rounded-xl text-center">Titik patroli "{searchQuery}" tidak ditemukan.</p>
                  )}
                  {filteredCheckpoints.map((item, idx) => {
                    if (item.status === 'completed') {
                      const isTemuan = item.resultType === 'temuan';
                      return (
                        <div key={item.id} onClick={() => handleOpenPatrolResult(item)} className={`p-3 border rounded-xl flex items-center justify-between cursor-pointer hover:shadow-lg transition-all ${isTemuan ? 'bg-yellow-950/20 border-yellow-500/30' : 'bg-emerald-950/20 border-emerald-500/30'}`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                               <p className={`font-bold ${isTemuan ? 'text-yellow-400' : 'text-emerald-400'}`}>{item.name}</p>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-cyan-200/60 mt-1">
                              {isTemuan ? <AlertTriangle className="w-3 h-3 text-yellow-500" /> : <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                              <span className="truncate">oleh {item.completedBy.split(' ')[0]} - {item.time}</span>
                            </div>
                          </div>
                          <div onClick={(e) => { e.stopPropagation(); setPreviewPhoto({url: item.photoUrl, author: item.completedBy, time: item.time}); }} className={`w-12 h-12 rounded-lg border overflow-hidden relative cursor-pointer hover:opacity-80 flex-shrink-0 bg-[#070b19] ${isTemuan ? 'border-yellow-500/40' : 'border-emerald-500/40'}`}>
                            <img src={item.photoUrl} className="w-full h-full object-cover" alt="Thumb" />
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={item.id} className="p-3 bg-[#0b1229] border border-cyan-800/50 rounded-xl">
                        <div className="flex items-center justify-between gap-2">
                           <p className="font-bold text-white truncate flex-1">{item.name}</p>
                           <div className="flex gap-2 shrink-0">
                             <button onClick={() => handleActionClick(item.id, 'aman')} className="flex items-center justify-center gap-1.5 bg-[#070b19] hover:bg-emerald-950/30 border border-emerald-900/50 hover:border-emerald-500/50 text-emerald-100 px-3 py-2 rounded-xl font-bold text-xs transition-colors shadow-sm">
                               <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> AMAN
                             </button>
                             <button onClick={() => handleActionClick(item.id, 'temuan')} className="flex items-center justify-center gap-1.5 bg-[#070b19] hover:bg-yellow-950/30 border border-yellow-900/50 hover:border-yellow-500/50 text-yellow-100 px-3 py-2 rounded-xl font-bold text-xs transition-colors shadow-sm">
                               <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" /> TEMUAN
                             </button>
                           </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* FITUR TAMBAH TITIK PATROLI DINAMIS */}
                <div className="mt-4 p-4 bg-[#0b1229] border border-cyan-800 border-dashed rounded-xl mb-6">
                   <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest mb-2 pl-1">Titik Patroli Tambahan</p>
                   <div className="flex gap-2">
                      <input 
                        type="text" value={newCustomNode} onChange={e => setNewCustomNode(e.target.value)} 
                        placeholder="Nama Lokasi Ekstra..." 
                        className="flex-1 bg-[#070b19] border border-cyan-800/50 rounded-lg p-2.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none" 
                      />
                      <button onClick={handleAddCustomPatrolNode} className="px-4 bg-cyan-900/50 hover:bg-cyan-600 border border-cyan-700 text-cyan-300 hover:text-white rounded-lg transition-colors flex items-center justify-center">
                        <Plus className="w-5 h-5"/>
                      </button>
                   </div>
                </div>

                {/* STICKY PROGRESS PATROLI */}
                <div className="fixed bottom-[65px] left-0 right-0 z-30 w-full sm:max-w-md sm:mx-auto bg-[#070b19]/95 backdrop-blur-md px-4 py-4 border-t border-cyan-900/50 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-cyan-500 font-bold uppercase tracking-widest">Progres Shift</span>
                    <span className="text-cyan-300 font-black">{completedCount}/{totalCount} <span className="font-normal text-[9px]">SELESAI</span></span>
                  </div>
                  <div className="w-full bg-[#0b1229] rounded-full h-3 border border-cyan-900/50 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-cyan-600 via-emerald-500 to-emerald-400 h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(52,211,153,0.5)]" 
                      style={{ width: `${progressPercentage}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- PAGE: TEMUAN BARU --- */}
        {currentPage === 'incidents' && (
          <div className="p-4 space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center mb-2">
               <h2 className="text-xl font-bold text-yellow-400 flex items-center gap-2 drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]">
                 <AlertOctagon className="w-5 h-5" /> Pelaporan Temuan
               </h2>
               <button onClick={openIncidentModal} className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 text-xs font-bold rounded-lg flex items-center gap-1 shadow-[0_0_10px_rgba(250,204,21,0.2)]">
                 <PlusCircle className="w-3.5 h-3.5" /> Lapor Baru
               </button>
            </div>
            
             {visibleIncidents.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-cyan-900/50 rounded-xl">
                  <AlertOctagon className="w-10 h-10 text-cyan-900 mx-auto mb-2" />
                  <p className="text-cyan-600 text-sm font-bold uppercase tracking-widest">Belum Ada Laporan Temuan</p>
                </div>
             ) : (
                <div className="space-y-3">
                  {visibleIncidents.map(inc => {
                     const meta = incidentMeta[inc.id] || { status: 'open' };
                     const isClosed = meta.status === 'closed';
                     return (
                    <div key={inc.id} onClick={() => setSelectedIncident(inc)} className={`p-4 ${isClosed ? 'bg-slate-900/40 border-slate-800' : 'bg-yellow-950/10 border-yellow-900/40 hover:border-yellow-500/50'} border rounded-xl transition-colors cursor-pointer group relative overflow-hidden flex gap-3`}>
                       <div className={`absolute left-0 top-0 bottom-0 w-1 ${isClosed ? 'bg-slate-700' : (inc.isPatrol ? 'bg-emerald-500' : 'bg-yellow-500')}`}></div>
                       
                       {/* Kolom Kiri: Teks & Pelapor */}
                       <div className="flex-1 ml-1 min-w-0 flex flex-col justify-between">
                          <div>
                             <div className="flex items-start justify-between gap-2 mb-2">
                               <h3 className={`font-bold text-lg leading-tight flex-1 min-w-0 ${isClosed ? 'text-slate-400' : 'text-yellow-400'}`}>{inc.location}</h3>
                               <span className="shrink-0 whitespace-nowrap text-[10px] text-cyan-500 font-mono bg-[#070b19] px-2 py-1 rounded border border-cyan-900 inline-block">{inc.date} | {inc.time}</span>
                             </div>
                             <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-600 mb-2">{inc.shipName || operationalShipName}</p>
                             <p className={`text-xs ${isClosed ? 'text-slate-500' : 'text-yellow-100/70'} line-clamp-2 leading-relaxed mb-3`}>"{inc.deskripsi}"</p>
                          </div>
                          <div className={`mt-auto flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold ${isClosed ? 'text-slate-600' : 'text-cyan-600'}`}>
                             <User className="w-3 h-3 shrink-0"/> <span className="truncate">oleh <span className={isClosed ? 'text-slate-500' : 'text-cyan-400'}>{inc.reportedBy}</span></span>
                          </div>
                       </div>

                       {/* Kolom Kanan: Gambar & Status (Sejajar bawah) */}
                       <div className="flex flex-col items-end justify-between shrink-0 gap-2">
                          {inc.photoUrl ? (
                             <div className={`w-20 h-20 rounded-lg overflow-hidden border shadow-sm ${isClosed ? 'border-slate-700' : 'border-yellow-700/50'}`}>
                                <img src={inc.photoUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Thumb"/>
                             </div>
                          ) : (
                             <div className="w-20 h-20"></div> // Spacer jika tidak ada foto
                          )}
                          {isClosed ? (
                             <span className="text-[9px] px-2 py-0.5 border border-slate-600 text-slate-400 bg-slate-800/50 rounded uppercase font-bold tracking-widest text-center mt-auto w-full">CLOSED</span>
                          ) : (
                             <span className="text-[9px] px-2 py-0.5 border border-yellow-500 text-yellow-400 bg-yellow-500/10 rounded uppercase font-bold tracking-widest text-center mt-auto w-full">OPEN</span>
                          )}
                       </div>
                    </div>
                    )
                 })}
               </div>
            )}
          </div>
        )}

        {/* --- MODAL FORM TEMUAN BARU --- */}
        {showIncidentModal && (
          <div className="fixed inset-0 z-[100] bg-[#070b19] sm:max-w-md sm:mx-auto sm:border-x sm:border-yellow-500/20 flex flex-col animate-in slide-in-from-right-4">
            <div className="p-4 border-b border-yellow-500/30 flex items-center gap-3 bg-[#0b1229] shrink-0 shadow-sm">
              <button onClick={closeIncidentModal} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors">
                <ChevronDown className="w-5 h-5 rotate-90"/>
              </button>
              <div>
                <span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Form Temuan</span>
                <h3 className="font-bold text-xl text-yellow-400 line-clamp-1">Lapor Baru</h3>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {!incidentForm.photoUrl ? (
                <button onClick={() => handlePhotoUpload(null, true)} className="w-full py-4 rounded-xl border-2 border-dashed border-yellow-500/40 bg-yellow-950/20 text-yellow-400 hover:bg-yellow-900/40 flex flex-col items-center gap-2 transition-colors">
                  <Camera className="w-6 h-6" />
                  <span className="text-sm font-bold uppercase tracking-wider">Unggah Foto Temuan</span>
                  <span className="text-[10px] text-yellow-200/60 uppercase tracking-widest">Opsional</span>
                </button>
              ) : (
                <div className="w-full h-40 bg-[#070b19] rounded-xl border border-yellow-500/40 overflow-hidden relative">
                  <img src={incidentForm.photoUrl} alt="Preview Temuan" className="w-full h-full object-cover" />
                  <button onClick={() => setIncidentForm(prev => ({ ...prev, photoUrl: null }))} className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-lg border border-yellow-500/50 text-white hover:bg-rose-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setIncidentForm(prev => ({ ...prev, locType: 'default' }))}
                  className={`py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-colors ${incidentForm.locType === 'default' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.12)]' : 'bg-[#0b1229] border-cyan-900/50 text-cyan-500 hover:border-cyan-700'}`}
                >
                  Lokasi Daftar
                </button>
                <button
                  onClick={() => setIncidentForm(prev => ({ ...prev, locType: 'custom' }))}
                  className={`py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-colors ${incidentForm.locType === 'custom' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.12)]' : 'bg-[#0b1229] border-cyan-900/50 text-cyan-500 hover:border-cyan-700'}`}
                >
                  Lokasi Manual
                </button>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold pl-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Lokasi Temuan
                </label>
                {incidentForm.locType === 'custom' ? (
                  <input
                    type="text"
                    value={incidentForm.customLocation}
                    onChange={e => setIncidentForm(prev => ({ ...prev, customLocation: e.target.value }))}
                    placeholder="Masukkan nama lokasi..."
                    className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-yellow-500 outline-none shadow-sm"
                  />
                ) : (
                  <select
                    value={incidentForm.location}
                    onChange={e => setIncidentForm(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-yellow-500 outline-none appearance-none shadow-sm"
                  >
                    {incidentLocationOptions.map(location => (
                      <option key={location} value={location}>{location}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold">Deskripsi Temuan</label>
                <textarea
                  rows={3}
                  value={incidentForm.deskripsi}
                  onChange={e => setIncidentForm(prev => ({ ...prev, deskripsi: e.target.value }))}
                  placeholder="Jelaskan detail temuan..."
                  className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-yellow-500 outline-none resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold">Penyebab Kejadian</label>
                <textarea
                  rows={2}
                  value={incidentForm.penyebab}
                  onChange={e => setIncidentForm(prev => ({ ...prev, penyebab: e.target.value }))}
                  placeholder="Apa indikasi penyebabnya..."
                  className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-yellow-500 outline-none resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold">Tindak Lanjut Awal</label>
                <textarea
                  rows={2}
                  value={incidentForm.tindakLanjut}
                  onChange={e => setIncidentForm(prev => ({ ...prev, tindakLanjut: e.target.value }))}
                  placeholder="Tindakan awal yang sudah dilakukan..."
                  className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-emerald-500 outline-none resize-none"
                />
              </div>
            </div>

            <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe flex gap-3">
              <button onClick={closeIncidentModal} className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs border border-cyan-800 text-cyan-300 hover:bg-cyan-900/30 transition-colors">
                Batal
              </button>
              <button
                onClick={handleSubmitIncident}
                disabled={!(incidentForm.locType === 'custom' ? incidentForm.customLocation.trim() : incidentForm.location.trim()) || !incidentForm.deskripsi.trim()}
                className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs bg-yellow-600 hover:bg-yellow-500 text-black disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(250,204,21,0.25)]"
              >
                <Save className="w-4 h-4" /> Simpan
              </button>
            </div>
          </div>
        )}

        {/* --- PAGE: HISTORY --- */}
        {currentPage === 'history' && (
          <div className="p-4 space-y-4 animate-in fade-in">
            <h2 className="text-xl font-bold text-cyan-50 mb-2">Riwayat Sistem</h2>
            {historyData.map((data) => (
              <div key={data.id} className="bg-[#0b1229] border border-cyan-800/50 rounded-xl p-4 cursor-pointer">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex gap-3">
                     <div className="w-10 h-10 rounded-lg bg-[#070b19] flex items-center justify-center text-cyan-500 border border-cyan-800"><FileText className="w-5 h-5" /></div>
                     <div>
                        <h3 className="font-bold text-cyan-50">{data.ship}</h3>
                        <p className="text-sm text-cyan-500/80 flex items-center gap-1 mt-0.5"><CalendarDays className="w-3 h-3" /> {data.date}</p>
                     </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2 py-1 bg-[#070b19] text-cyan-400 rounded text-xs font-bold border border-cyan-800">{data.shift}</span>
                    <p className="text-[10px] text-cyan-600 mt-1 flex items-center justify-end gap-1"><Clock className="w-3 h-3"/> {data.time}</p>
                  </div>
                </div>
                <div className="flex gap-2 border-t border-cyan-900/50 pt-3">
                   <div className="flex-1 bg-[#070b19] p-2 rounded-lg border border-cyan-900/30">
                      <p className="text-[10px] text-cyan-600 uppercase font-bold mb-0.5">Status Titik</p>
                      <p className="text-xs text-emerald-400 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {data.points}/{data.points} Selesai</p>
                   </div>
                   <div className="flex-1 bg-[#070b19] p-2 rounded-lg border border-cyan-900/30">
                      <p className="text-[10px] text-cyan-600 uppercase font-bold mb-0.5">Temuan</p>
                      {data.issue > 0 ? <p className="text-xs text-yellow-400 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> {data.issue} Temuan</p> : <p className="text-xs text-cyan-400 font-medium flex items-center gap-1"><Check className="w-3 h-3"/> Nihil</p>}
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* --- PAGE ADMIN: DATA USER --- */}
        {currentPage === 'users' && isAdmin && (
          <div className="p-4 space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-cyan-50 flex items-center gap-2"><Users className="w-5 h-5 text-cyan-400" /> DATA USER</h2>
              <button onClick={() => setShowUserForm(true)} className="px-3 py-1.5 bg-cyan-600/20 text-cyan-300 border border-cyan-500/50 text-xs font-bold rounded-lg flex items-center gap-1 hover:bg-cyan-600/40 transition-colors">
                <PlusCircle className="w-3.5 h-3.5" /> Tambah
              </button>
            </div>
            <div className="space-y-3">
              {usersData.map((user) => (
                <div key={user.id} onClick={() => setSelectedUser({...user})} className="bg-[#0b1229] p-3.5 rounded-xl border border-cyan-800/50 flex items-center gap-3 relative overflow-hidden cursor-pointer hover:border-cyan-500/50 transition-colors group shadow-sm">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${user.type === 'TNI' ? 'bg-fuchsia-500' : 'bg-cyan-400'}`}></div>
                  
                  {/* FOTO PROFIL (KIRI) */}
                  <div className="w-14 h-14 rounded-xl bg-[#070b19] border border-cyan-700/50 overflow-hidden shrink-0 ml-1 shadow-sm">
                    {user.photoUrl ? (
                      <img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-cyan-500"><User className="w-6 h-6"/></div>
                    )}
                  </div>

                  {/* DATA USER (KANAN) */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <div>
                         <h3 className="font-bold text-white text-base truncate">{user.name}</h3>
                         <div className="flex items-center gap-1.5 mt-0.5">
                           <span className="text-[10px] text-cyan-500 font-bold uppercase">{user.role}</span>
                           <span className={`text-[8px] px-1 py-0.5 border rounded font-black tracking-widest ${user.type==='TNI' ? 'bg-fuchsia-900/30 border-fuchsia-500 text-fuchsia-400' : 'bg-cyan-900/30 border-cyan-500 text-cyan-300'}`}>{user.type}</span>
                         </div>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 border rounded uppercase font-bold tracking-widest shrink-0 ${user.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                         {user.status === 'active' ? 'ON-DUTY' : 'OFF-DUTY'}
                      </span>
                    </div>
                    <div className="pt-2 mt-1 border-t border-cyan-900/30 flex items-center gap-1.5 text-[10px]">
                       <Ship className={`w-3 h-3 ${user.shipAssigned ? 'text-cyan-400' : 'text-slate-600'}`} />
                       {user.shipAssigned ? <span className="text-cyan-100">Penugasan: <span className="font-bold text-cyan-400">{user.shipAssigned}</span></span> : <span className="text-slate-500 italic">Belum ada penugasan.</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- PAGE ADMIN: ARMADA (LIST VIEW) --- */}
        {currentPage === 'ships' && isAdmin && !activeShipId && (
          <div className="p-4 space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center mb-4">
               <h2 className="text-xl font-bold text-cyan-50 flex items-center gap-2"><Anchor className="w-5 h-5 text-cyan-400" /> Armada Kapal</h2>
               <button 
                 onClick={() => setShowShipForm(true)}
                 className="px-3 py-1.5 bg-cyan-600/20 text-cyan-300 border border-cyan-500/50 text-xs font-bold rounded-lg flex items-center gap-1 hover:bg-cyan-600/40 transition-colors shadow-[0_0_10px_rgba(6,182,212,0.2)]"
               >
                 <PlusCircle className="w-3.5 h-3.5" /> Tambah
               </button>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {shipsData.map((ship) => (
                <div key={ship.id} onClick={() => setActiveShipId(ship.id)} className="bg-[#0b1229] rounded-xl border border-cyan-800/50 hover:border-cyan-400 transition-colors cursor-pointer flex overflow-hidden h-28 shadow-sm">
                   <div className="w-28 h-full bg-[#070b19] border-r border-cyan-900 flex-shrink-0 relative">
                     <img src={ship.photoUrl} alt={ship.name} className="w-full h-full object-cover opacity-80" />
                   </div>
                   <div className="p-3 flex-1 flex flex-col justify-center">
                      <div className="flex justify-between items-start mb-1">
                         <h3 className="font-bold text-white text-base tracking-wide">{ship.name}</h3>
                         <span className="text-[9px] px-1.5 py-0.5 bg-cyan-900/40 text-cyan-300 border border-cyan-700 rounded uppercase font-bold">{ship.status}</span>
                      </div>
                      <p className="text-[11px] text-cyan-500 font-medium mb-2">{ship.type}</p>
                      <div className="flex items-center gap-3 text-[10px] font-mono text-cyan-300/70">
                         <span className="flex items-center gap-1"><Users className="w-3 h-3"/> {ship.personnel.length} Kru</span>
                         <span className="flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> {ship.customCheckpoints.length} TITIK</span>
                      </div>
                   </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- PAGE ADMIN: DETAIL ARMADA --- */}
        {currentPage === 'ships' && isAdmin && activeShipId && activeShip && (
          <div className="p-4 space-y-4 animate-in slide-in-from-right-4 pb-10">
            {/* Header Cover */}
            <div className="h-40 rounded-2xl overflow-hidden relative border border-cyan-700 shadow-[0_0_20px_rgba(6,182,212,0.15)] group">
               <img src={activeShip.photoUrl} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity duration-500" alt="Cover"/>
               <div className="absolute inset-0 bg-gradient-to-t from-[#070b19] via-[#070b19]/60 to-transparent"></div>
               <button onClick={() => { setActiveShipId(null); setIsEditingShipInfo(false); }} className="absolute top-3 left-3 bg-[#0b1229]/80 p-2 rounded-full border border-cyan-500/50 text-cyan-300 hover:text-white backdrop-blur-sm z-10"><ChevronDown className="w-5 h-5 rotate-90"/></button>
               <div className="absolute bottom-3 left-4">
                 <h2 className="text-3xl font-black text-white tracking-widest drop-shadow-md">{activeShip.name}</h2>
                 <div className="flex items-center gap-2 mt-1">
                   <span className="text-[10px] px-2 py-0.5 bg-cyan-900/80 border border-cyan-500/50 text-cyan-300 rounded font-bold uppercase tracking-widest backdrop-blur-sm">{activeShip.status}</span>
                   <p className="text-xs text-cyan-400 font-bold uppercase tracking-widest">{activeShip.type}</p>
                 </div>
               </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex bg-[#0b1229] p-1 rounded-xl border border-cyan-800/50 overflow-x-auto no-scrollbar">
              {[
                {id: 'info', icon: <Ship className="w-4 h-4"/>, label: 'Data'},
                {id: 'personil', icon: <Users className="w-4 h-4"/>, label: 'Kru'},
                {id: 'checkpoints', icon: <ShieldAlert className="w-4 h-4"/>, label: 'TITIK'},
                {id: 'documents', icon: <FileText className="w-4 h-4"/>, label: 'Dokumen'}
              ].map(tab => (
                <button key={tab.id} onClick={() => setShipDetailTab(tab.id)} className={`flex-1 min-w-[80px] flex flex-col items-center gap-1 py-2 rounded-lg transition-all ${shipDetailTab === tab.id ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30' : 'text-cyan-700 hover:text-cyan-500'}`}>
                   {tab.icon} <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* TAB: INFO */}
            {shipDetailTab === 'info' && (
              <div className="space-y-3 animate-in fade-in">
                 <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-800/50 space-y-4 relative">
                    {!isEditingShipInfo ? (
                      <>
                        <button onClick={() => { setEditShipInfoData(activeShip); setIsEditingShipInfo(true); }} className="absolute top-4 right-4 text-[10px] bg-cyan-900/50 text-cyan-300 px-2.5 py-1.5 rounded-lg border border-cyan-700 hover:bg-cyan-600 hover:text-white transition-colors shadow-sm font-bold tracking-widest uppercase">Edit Data</button>
                        <div>
                          <p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">{activeShip.status === 'UPP' ? 'Lokasi Sandar' : 'Rute Pelayaran'}</p>
                          <p className="text-sm text-cyan-50 font-medium flex items-center gap-2"><Navigation className="w-4 h-4 text-cyan-400"/> {activeShip.route || 'Belum diatur'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">Kapasitas & Muatan</p>
                          <div className="flex gap-4">
                             <p className="text-sm text-emerald-400 font-bold flex items-center gap-2"><Package className="w-4 h-4"/> {activeShip.cargoType || '-'}</p>
                             <p className="text-sm text-yellow-400 font-bold flex items-center gap-2"><Weight className="w-4 h-4"/> {activeShip.cargoAmount || '-'}</p>
                           </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-cyan-900/50 pb-2">
                           <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Edit Informasi</h4>
                           <div className="flex gap-2">
                              <button onClick={() => setIsEditingShipInfo(false)} className="text-[10px] bg-rose-900/30 text-rose-400 px-2.5 py-1.5 rounded-lg border border-rose-800 hover:bg-rose-900 transition-colors font-bold uppercase tracking-widest">Batal</button>
                              <button onClick={() => { updateActiveShip(editShipInfoData); setIsEditingShipInfo(false); }} className="text-[10px] bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)]">Simpan</button>
                           </div>
                        </div>
                        
                        <div>
                          <label className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1.5 block">Status</label>
                          <select value={editShipInfoData.status} onChange={e => setEditShipInfoData({...editShipInfoData, status: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none">
                            <option value="UPP">UPP</option>
                            <option value="NON UPP">NON UPP</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1.5 block">{editShipInfoData.status === 'UPP' ? 'Lokasi Sandar' : 'Rute Pelayaran'}</label>
                          <input type="text" value={editShipInfoData.route} onChange={e => setEditShipInfoData({...editShipInfoData, route: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1.5 block">Jenis Muatan</label>
                            <input type="text" value={editShipInfoData.cargoType} onChange={e => setEditShipInfoData({...editShipInfoData, cargoType: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
                          </div>
                          <div>
                            <label className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1.5 block">Jumlah Muatan</label>
                            <input type="text" value={editShipInfoData.cargoAmount} onChange={e => setEditShipInfoData({...editShipInfoData, cargoAmount: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
                          </div>
                        </div>
                      </div>
                    )}
                 </div>
              </div>
            )}

            {/* TAB: PERSONIL (JADWAL BULAN DEPAN) */}
            {shipDetailTab === 'personil' && (
              <div className="space-y-4 animate-in fade-in">
                 {/* Switcher Jadwal */}
                 <div className="flex gap-2 bg-[#070b19] p-1.5 rounded-full border border-cyan-900/50">
                    <button onClick={() => setScheduleMonth('current')} className={`flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${scheduleMonth === 'current' ? 'bg-cyan-600 text-white' : 'text-cyan-600'}`}>Bulan Ini</button>
                    <button onClick={() => setScheduleMonth('next')} className={`flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-1 ${scheduleMonth === 'next' ? 'bg-fuchsia-600 text-white' : 'text-cyan-600'}`}>
                      <CalendarClock className="w-3.5 h-3.5"/> Bulan Depan
                    </button>
                 </div>

                 <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-800/50">
                    <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 border-b border-cyan-900/50 pb-2">Ditugaskan ({scheduleMonth === 'current' ? 'Sekarang' : 'Depan'})</h4>
                    <div className="space-y-2 mb-6">
                       {activeShip[scheduleMonth === 'current' ? 'personnel' : 'personnelNextMonth'].length === 0 ? (
                         <p className="text-xs text-rose-400 text-center py-3 italic border border-dashed border-rose-900/50 rounded-xl">Kosong</p>
                       ) : (
                         activeShip[scheduleMonth === 'current' ? 'personnel' : 'personnelNextMonth'].map(uid => {
                           const u = usersData.find(x => x.id === uid);
                           return (
                             <div key={uid} className="flex justify-between items-center p-2 bg-[#070b19] border border-cyan-800/50 rounded-lg">
                               <div className="flex flex-col"><span className="text-sm font-bold text-white">{u?.name}</span><span className="text-[10px] text-cyan-500">{u?.role}</span></div>
                               <button onClick={() => handleTogglePersonnel(uid)} className="p-1.5 bg-rose-500/10 text-rose-400 rounded"><UserMinus className="w-4 h-4"/></button>
                             </div>
                           )
                         })
                       )}
                    </div>

                    <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 border-b border-cyan-900/50 pb-2">Tersedia (Off-Duty)</h4>
                    <div className="space-y-2">
                       {usersData.filter(u => scheduleMonth === 'current' ? u.status === 'off-duty' : !activeShip.personnelNextMonth.includes(u.id)).map(u => (
                         <div key={u.id} className="flex justify-between items-center p-2 bg-[#070b19] border border-cyan-900/30 rounded-lg opacity-80 hover:opacity-100">
                           <div className="flex flex-col"><span className="text-sm font-bold text-slate-300">{u?.name}</span><span className="text-[10px] text-slate-500">{u?.role}</span></div>
                           <button onClick={() => handleTogglePersonnel(u.id)} className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded"><UserPlus className="w-4 h-4"/></button>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
            )}

            {/* TAB: TITIK */}
            {shipDetailTab === 'checkpoints' && (
              <div className="space-y-4 animate-in fade-in">
                 <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-800/50 space-y-3">
                    {activeShip.customCheckpoints.length === 0 ? (
                       <p className="text-xs text-slate-500 text-center italic">Belum ada titik periksa.</p>
                    ) : (
                       activeShip.customCheckpoints.map((cp, idx) => (
                         <div key={idx} className="p-3 bg-[#070b19] border border-cyan-800/50 rounded-xl flex justify-between items-start">
                           <div>
                              <p className="font-bold text-cyan-100 flex items-center gap-2"><span className="text-[9px] text-cyan-600 border border-cyan-800 px-1 rounded">TITIK-{idx+1}</span>{cp.name}</p>
                              <p className="text-xs text-cyan-500 mt-1">{cp.desc || 'Tanpa deskripsi'}</p>
                           </div>
                           <button onClick={() => updateActiveShip({customCheckpoints: activeShip.customCheckpoints.filter((_,i)=>i!==idx)})} className="p-1 text-rose-500 hover:bg-rose-500/20 rounded"><Trash2 className="w-4 h-4"/></button>
                         </div>
                       ))
                    )}
                    
                    <div className="pt-3 border-t border-cyan-900/50 space-y-2">
                       <input type="text" placeholder="Nama Titik..." value={newShipCp.name} onChange={e=>setNewShipCp({...newShipCp, name: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-lg p-2 text-sm focus:border-cyan-400 outline-none text-white"/>
                       <input type="text" placeholder="Deskripsi instruksi..." value={newShipCp.desc} onChange={e=>setNewShipCp({...newShipCp, desc: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-lg p-2 text-sm focus:border-cyan-400 outline-none text-white"/>
                       <button onClick={handleAddShipCp} className="w-full py-2 bg-cyan-900/50 hover:bg-cyan-600 text-cyan-300 hover:text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-colors">Tambah Titik</button>
                    </div>
                 </div>
              </div>
            )}

            {/* TAB: DOCUMENTS */}
            {shipDetailTab === 'documents' && (
              <div className="space-y-4 animate-in fade-in">
                 <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-800/50 space-y-3">
                    {activeShip.documents.length === 0 ? (
                       <p className="text-xs text-slate-500 text-center italic">Belum ada dokumen terlampir.</p>
                    ) : (
                       activeShip.documents.map((doc, idx) => (
                         <div key={idx} className="p-3 bg-[#070b19] border border-cyan-800/50 rounded-xl flex justify-between items-start">
                           <div className="flex gap-3 items-start">
                              <FilePlus className="w-5 h-5 text-emerald-400 mt-0.5" />
                              <div>
                                 <p className="font-bold text-cyan-100">{doc.title}</p>
                                 <p className="text-xs text-cyan-500 mt-1">{doc.desc}</p>
                              </div>
                           </div>
                           <button onClick={() => updateActiveShip({documents: activeShip.documents.filter((_,i)=>i!==idx)})} className="p-1 text-rose-500 hover:bg-rose-500/20 rounded"><Trash2 className="w-4 h-4"/></button>
                         </div>
                       ))
                    )}
                    
                    <div className="pt-3 border-t border-cyan-900/50 space-y-2">
                       <input type="text" placeholder="Judul Dokumen..." value={newShipDoc.title} onChange={e=>setNewShipDoc({...newShipDoc, title: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-lg p-2 text-sm focus:border-emerald-400 outline-none text-white"/>
                       <input type="text" placeholder="Keterangan / Masa Berlaku..." value={newShipDoc.desc} onChange={e=>setNewShipDoc({...newShipDoc, desc: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-lg p-2 text-sm focus:border-emerald-400 outline-none text-white"/>
                       <button onClick={handleAddShipDoc} className="w-full py-2 bg-emerald-900/30 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-800/50 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors">Lampirkan Dokumen</button>
                    </div>
                 </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- MODAL: FORMULIR PATROLI --- */}
      {activePatrolItem && activePatrolState && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#070b19]/90 backdrop-blur-sm p-4 animate-in fade-in">
          <div className={`w-full max-w-md bg-[#0b1229] border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-all ${activePatrolState.type === 'temuan' ? 'border-yellow-500/50 shadow-[0_0_50px_rgba(250,204,21,0.2)]' : 'border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.2)]'}`}>
            <div className="p-4 border-b border-cyan-900/50 flex justify-between items-center bg-[#070b19]">
               <div>
                 <span className="text-[10px] uppercase tracking-widest font-bold text-cyan-500">Formulir Patroli</span>
                 <h3 className="font-bold text-lg text-white">{activePatrolItem.name}</h3>
               </div>
               <div className="flex items-center gap-2">
                 <span className={`text-[10px] px-2 py-1 border rounded font-bold ${activePatrolState.type === 'temuan' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' : 'bg-emerald-500/10 border-emerald-500 text-emerald-400'}`}>
                    {activePatrolState.type === 'temuan' ? 'TEMUAN' : 'AMAN'}
                 </span>
                 <button onClick={() => setActiveForms({})} className="p-1.5 rounded-full hover:bg-rose-900/50 text-rose-400 transition-colors"><X className="w-5 h-5"/></button>
               </div>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {activePatrolState.type === 'temuan' ? (
                <>
                  {!activePatrolState.photoUrl ? (
                    <button onClick={() => handlePhotoUpload(activePatrolId)} className="w-full py-4 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors border-yellow-500/40 bg-yellow-950/20 text-yellow-400 hover:bg-yellow-900/40">
                      <Camera className="w-6 h-6" />
                      <span className="text-sm font-bold uppercase tracking-wider">Unggah Visual</span>
                    </button>
                  ) : (
                    <div className="w-full h-32 bg-[#070b19] rounded-xl border border-cyan-800 overflow-hidden relative">
                      <img src={activePatrolState.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                      <button onClick={() => handleFormChange(activePatrolId, 'photoUrl', null)} className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-lg border border-yellow-500/50 text-white hover:bg-rose-500 transition-colors"><X className="w-4 h-4" /></button>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold">Deskripsi Temuan</label>
                    <textarea placeholder="Jelaskan detail temuan..." rows={2} value={activePatrolState.kejadian} onChange={(e) => handleFormChange(activePatrolId, 'kejadian', e.target.value)} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-yellow-500 outline-none resize-none" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold">Penyebab Kejadian</label>
                    <textarea placeholder="Apa indikasi penyebabnya..." rows={2} value={activePatrolState.penyebab} onChange={(e) => handleFormChange(activePatrolId, 'penyebab', e.target.value)} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-yellow-500 outline-none resize-none" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold">Tindak Lanjut</label>
                    <textarea placeholder="Tindakan perbaikan..." rows={2} value={activePatrolState.tindakLanjut} onChange={(e) => handleFormChange(activePatrolId, 'tindakLanjut', e.target.value)} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-emerald-500 outline-none resize-none" />
                  </div>
                </>
              ) : (
                !activePatrolState.photoUrl ? (
                  <button onClick={() => handlePhotoUpload(activePatrolId)} className="w-full py-4 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors border-emerald-500/40 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-900/40">
                    <Camera className="w-6 h-6" /> <span className="text-sm font-bold uppercase tracking-wider">Unggah Visual</span>
                  </button>
                ) : (
                  <div className="w-full h-32 bg-[#070b19] rounded-xl border border-cyan-800 overflow-hidden relative">
                    <img src={activePatrolState.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                    <button onClick={() => handleFormChange(activePatrolId, 'photoUrl', null)} className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-lg border border-yellow-500/50 text-white hover:bg-rose-500 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                )
              )}
            </div>
            
            <div className="p-4 bg-[#070b19] border-t border-cyan-900/50">
              <button disabled={!activePatrolState.photoUrl} onClick={() => handleSubmitPatrol(activePatrolItem.id)} className={`w-full py-3.5 rounded-xl font-black tracking-widest uppercase text-xs flex items-center justify-center gap-2 transition-all ${activePatrolState.photoUrl ? (activePatrolState.type === 'temuan' ? 'bg-yellow-600 hover:bg-yellow-500 text-black shadow-[0_0_15px_rgba(250,204,21,0.4)]' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]') : 'bg-[#0b1229] border border-cyan-900 text-cyan-700 cursor-not-allowed'}`}>
                {activePatrolState.photoUrl ? <Send className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                {activePatrolState.photoUrl ? 'Sync Laporan' : 'Butuh Visual'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- PAGE: TAMBAH ARMADA (Admin Only) --- */}
      {showShipForm && (
        <div className="fixed inset-0 z-[100] bg-[#070b19] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 flex flex-col animate-in slide-in-from-right-4">
          
          {/* HEADER */}
          <div className="p-4 border-b border-cyan-500/30 flex items-center gap-3 bg-[#0b1229] shrink-0 shadow-sm">
             <button onClick={() => setShowShipForm(false)} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors"><ChevronDown className="w-5 h-5 rotate-90"/></button>
             <div>
                <span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Registrasi</span>
                <h3 className="font-bold text-xl text-cyan-50 line-clamp-1">Armada Baru</h3>
             </div>
          </div>

          {/* BODY CONTENT */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Nama Kapal</label>
                  <input type="text" value={shipFormData.name} onChange={e => setShipFormData({...shipFormData, name: e.target.value})} placeholder="Contoh: MT GATOTKACA" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Tipe Kapal</label>
                    <select value={shipFormData.type} onChange={e => setShipFormData({...shipFormData, type: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm">
                      <option>Oil Tanker</option>
                      <option>Chemical Tanker</option>
                      <option>Gas Carrier</option>
                      <option>Bulk Carrier</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Status</label>
                    <select value={shipFormData.status} onChange={e => setShipFormData({...shipFormData, status: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm">
                      <option value="UPP">UPP</option>
                      <option value="NON UPP">NON UPP</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1 flex items-center gap-1"><Map className="w-3 h-3"/> {shipFormData.status === 'UPP' ? 'Lokasi Sandar' : 'Rute Pelayaran'}</label>
                  <input type="text" value={shipFormData.route} onChange={e => setShipFormData({...shipFormData, route: e.target.value})} placeholder={shipFormData.status === 'UPP' ? "Contoh: Pelabuhan Merak" : "Contoh: Jakarta - Dumai"} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1 flex items-center gap-1"><Package className="w-3 h-3"/> Jenis Muatan</label>
                    <input type="text" value={shipFormData.cargoType} onChange={e => setShipFormData({...shipFormData, cargoType: e.target.value})} placeholder="Contoh: Crude Oil" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1 flex items-center gap-1"><Weight className="w-3 h-3"/> Jumlah Muatan</label>
                    <input type="text" value={shipFormData.cargoAmount} onChange={e => setShipFormData({...shipFormData, cargoAmount: e.target.value})} placeholder="Contoh: 30,000 MT" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                  </div>
                </div>
            </div>

            {/* Patrol Checkpoints Editor */}
            <div className="pt-2 border-t border-cyan-900/30">
              <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 pb-2">Daftar TITIK Periksa</h4>
              
              <div className="flex gap-2 mb-3">
                <input 
                  type="text" 
                  value={newCheckpoint} 
                  onChange={e => setNewCheckpoint(e.target.value)} 
                  onKeyPress={e => e.key === 'Enter' && handleAddCheckpointToForm()}
                  placeholder="Nama Titik Baru..." 
                  className="flex-1 bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" 
                />
                <button onClick={handleAddCheckpointToForm} className="px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-colors shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                  <Plus className="w-5 h-5"/>
                </button>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {shipFormData.customCheckpoints.map((cp, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-[#0b1229] border border-cyan-800/60 rounded-xl shadow-sm">
                    <span className="text-sm font-bold text-cyan-100 flex items-center gap-2">
                       <span className="text-[9px] text-cyan-600 font-mono border border-cyan-800 px-1.5 py-0.5 rounded">TITIK {String(idx+1).padStart(2,'0')}</span>
                       {cp.name}
                    </span>
                    <button onClick={() => handleRemoveCheckpointFromForm(idx)} className="p-1.5 text-rose-500/70 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                ))}
                {shipFormData.customCheckpoints.length === 0 && (
                  <p className="text-xs text-rose-400 text-center py-3 italic border border-dashed border-rose-900/50 rounded-xl">Belum ada titik periksa.</p>
                )}
              </div>
            </div>
          </div>

          {/* FOOTER ACTION */}
          <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe flex gap-3">
             <button onClick={() => setShowShipForm(false)} className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs border border-cyan-800 text-cyan-300 hover:bg-cyan-900/30 transition-colors">
               Cancel
             </button>
             <button onClick={handleSaveShip} disabled={!shipFormData.name} className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
               <Save className="w-4 h-4" /> Simpan Data
             </button>
          </div>
        </div>
      )}

      {/* --- PAGE: TAMBAH USER (Admin Only) --- */}
      {showUserForm && (
        <div className="fixed inset-0 z-[100] bg-[#070b19] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 flex flex-col animate-in slide-in-from-right-4">
          
          {/* HEADER */}
          <div className="p-4 border-b border-cyan-500/30 flex items-center gap-3 bg-[#0b1229] shrink-0 shadow-sm">
             <button onClick={() => setShowUserForm(false)} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors"><ChevronDown className="w-5 h-5 rotate-90"/></button>
             <div>
                <span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Registrasi</span>
                <h3 className="font-bold text-xl text-cyan-50 line-clamp-1">User Baru</h3>
             </div>
          </div>

          {/* BODY CONTENT */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <div className="space-y-4">
                
                {/* UPLOAD FOTO PROFIL */}
                <div className="flex flex-col items-center mb-6">
                  {!userFormData.photoUrl ? (
                    <button onClick={handleUserPhotoUpload} className="w-24 h-24 rounded-2xl border-2 border-dashed border-cyan-500/50 bg-[#070b19] flex flex-col items-center justify-center text-cyan-500 hover:text-cyan-300 hover:border-cyan-400 transition-colors shadow-sm">
                      <Camera className="w-6 h-6 mb-1"/>
                      <span className="text-[9px] font-bold">FOTO</span>
                    </button>
                  ) : (
                    <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-cyan-500 shadow-md">
                      <img src={userFormData.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                      <button onClick={() => setUserFormData({...userFormData, photoUrl: null})} className="absolute bottom-0 inset-x-0 bg-rose-500/90 py-1 text-[9px] text-white font-bold hover:bg-rose-600 transition-colors">HAPUS</button>
                    </div>
                  )}
                </div>

                {/* Bagian 1: Data Utama */}
                <div>
                  <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Nama Lengkap</label>
                  <input type="text" value={userFormData.name} onChange={e => setUserFormData({...userFormData, name: e.target.value})} placeholder="Contoh: Dedi Mulyadi" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">ROLE</label>
                    <select value={userFormData.role} onChange={e => setUserFormData({...userFormData, role: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm">
                      <option value="ADMIN">ADMIN</option>
                      <option value="PETUGAS">PETUGAS</option>
                      <option value="PIC">PIC</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Instansi / Tipe</label>
                    <select value={userFormData.type} onChange={e => setUserFormData({...userFormData, type: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm">
                      <option value="BUJP">BUJP</option>
                      <option value="TNI">TNI</option>
                      <option value="POLRI">POLRI</option>
                      <option value="INTERNAL">INTERNAL</option>
                    </select>
                  </div>
                </div>

                {/* Bagian 2: Kredensial Akun */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-cyan-900/30">
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Alamat Email</label>
                    <input type="email" value={userFormData.email} onChange={e => setUserFormData({...userFormData, email: e.target.value})} placeholder="email@domain.com" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Password</label>
                    <input type="password" value={userFormData.password} onChange={e => setUserFormData({...userFormData, password: e.target.value})} placeholder="••••••••" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                  </div>
                </div>

                {/* Bagian 3: Data Pribadi */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">No Telpon (WA)</label>
                    <input type="tel" value={userFormData.phone} onChange={e => setUserFormData({...userFormData, phone: e.target.value})} placeholder="0812..." className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Tanggal Lahir</label>
                    <input type="date" value={userFormData.dob} onChange={e => setUserFormData({...userFormData, dob: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm [color-scheme:dark]" />
                  </div>
                </div>

                {/* Bagian 4: Alamat */}
                <div>
                  <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Alamat Rumah</label>
                  <textarea rows={2} value={userFormData.address} onChange={e => setUserFormData({...userFormData, address: e.target.value})} placeholder="Alamat domisili saat ini..." className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Alamat Kantor</label>
                  <textarea rows={2} value={userFormData.officeAddress} onChange={e => setUserFormData({...userFormData, officeAddress: e.target.value})} placeholder="Alamat kantor penempatan..." className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm resize-none" />
                </div>

                {/* Bagian 5: Kontak Darurat */}
                <div className="p-4 border border-rose-900/50 bg-rose-950/10 rounded-xl space-y-4">
                   <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest border-b border-rose-900/30 pb-2">Kontak Darurat</p>
                   <div>
                     <label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">Nama Kontak</label>
                     <input type="text" value={userFormData.emergencyName} onChange={e => setUserFormData({...userFormData, emergencyName: e.target.value})} placeholder="Nama kontak darurat..." className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none shadow-sm" />
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                     <div>
                       <label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">No. Handphone</label>
                       <input type="tel" value={userFormData.emergencyContact} onChange={e => setUserFormData({...userFormData, emergencyContact: e.target.value})} placeholder="08..." className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none shadow-sm" />
                     </div>
                     <div>
                       <label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">Hubungan</label>
                       <select value={userFormData.emergencyRelation} onChange={e => setUserFormData({...userFormData, emergencyRelation: e.target.value})} className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none appearance-none shadow-sm">
                          <option value="Orang Tua">Orang Tua</option>
                          <option value="Suami/Istri">Suami/Istri</option>
                          <option value="Anak">Anak</option>
                          <option value="Saudara">Saudara</option>
                          <option value="Rekan Kerja">Rekan Kerja</option>
                       </select>
                     </div>
                   </div>
                </div>
            </div>
          </div>

          {/* FOOTER ACTION */}
          <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe flex gap-3">
             <button onClick={() => setShowUserForm(false)} className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs border border-cyan-800 text-cyan-300 hover:bg-cyan-900/30 transition-colors">
               Cancel
             </button>
             <button onClick={handleSaveUser} disabled={!userFormData.name} className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
               <UserPlus className="w-4 h-4" /> Add User
             </button>
          </div>
        </div>
      )}

      {/* --- PAGE: DETAIL & EDIT USER (Admin Only) --- */}
      {selectedUser && (
        <div className="fixed inset-0 z-[100] bg-[#070b19] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 flex flex-col animate-in slide-in-from-right-4">
          
          {/* HEADER */}
          <div className="p-4 border-b border-cyan-500/30 flex items-center justify-between bg-[#0b1229] shrink-0 shadow-sm">
             <div className="flex items-center gap-3">
               <button onClick={() => setSelectedUser(null)} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors"><ChevronDown className="w-5 h-5 rotate-90"/></button>
               <div>
                  <span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Profil</span>
                  <h3 className="font-bold text-xl text-cyan-50 line-clamp-1">Detail User</h3>
               </div>
             </div>
             <button onClick={() => handleDeleteUser(selectedUser.id)} className="p-2 bg-rose-500/10 text-rose-500 border border-rose-500/30 rounded-lg hover:bg-rose-500 hover:text-white transition-colors flex items-center gap-2">
               <Trash2 className="w-4 h-4"/> <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Hapus</span>
             </button>
          </div>

          {/* BODY CONTENT */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <div className="space-y-4">
                
                {/* UPLOAD FOTO PROFIL */}
                <div className="flex flex-col items-center mb-6">
                  {!selectedUser.photoUrl ? (
                    <button onClick={handleEditUserPhotoUpload} className="w-24 h-24 rounded-2xl border-2 border-dashed border-cyan-500/50 bg-[#070b19] flex flex-col items-center justify-center text-cyan-500 hover:text-cyan-300 hover:border-cyan-400 transition-colors shadow-sm">
                      <Camera className="w-6 h-6 mb-1"/>
                      <span className="text-[9px] font-bold">FOTO</span>
                    </button>
                  ) : (
                    <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-cyan-500 shadow-md">
                      <img src={selectedUser.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                      <button onClick={() => setSelectedUser({...selectedUser, photoUrl: null})} className="absolute bottom-0 inset-x-0 bg-rose-500/90 py-1 text-[9px] text-white font-bold hover:bg-rose-600 transition-colors">HAPUS</button>
                    </div>
                  )}
                </div>

                {/* Bagian 1: Data Utama */}
                <div>
                  <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Nama Lengkap</label>
                  <input type="text" value={selectedUser.name || ''} onChange={e => setSelectedUser({...selectedUser, name: e.target.value})} placeholder="Contoh: Dedi Mulyadi" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">ROLE</label>
                    <select value={selectedUser.role || 'PETUGAS'} onChange={e => setSelectedUser({...selectedUser, role: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm">
                      <option value="ADMIN">ADMIN</option>
                      <option value="PETUGAS">PETUGAS</option>
                      <option value="PIC">PIC</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Instansi / Tipe</label>
                    <select value={selectedUser.type || 'BUJP'} onChange={e => setSelectedUser({...selectedUser, type: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm">
                      <option value="BUJP">BUJP</option>
                      <option value="TNI">TNI</option>
                      <option value="POLRI">POLRI</option>
                      <option value="INTERNAL">INTERNAL</option>
                    </select>
                  </div>
                </div>

                {/* Bagian 2: Kredensial Akun */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-cyan-900/30">
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Alamat Email</label>
                    <input type="email" value={selectedUser.email || ''} onChange={e => setSelectedUser({...selectedUser, email: e.target.value})} placeholder="email@domain.com" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Password</label>
                    <input type="password" value={selectedUser.password || ''} onChange={e => setSelectedUser({...selectedUser, password: e.target.value})} placeholder="••••••••" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                  </div>
                </div>

                {/* Bagian 3: Data Pribadi */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">No Telpon (WA)</label>
                    <input type="tel" value={selectedUser.phone || ''} onChange={e => setSelectedUser({...selectedUser, phone: e.target.value})} placeholder="0812..." className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Tanggal Lahir</label>
                    <input type="date" value={selectedUser.dob || ''} onChange={e => setSelectedUser({...selectedUser, dob: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm [color-scheme:dark]" />
                  </div>
                </div>

                {/* Bagian 4: Alamat */}
                <div>
                  <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Alamat Rumah</label>
                  <textarea rows={2} value={selectedUser.address || ''} onChange={e => setSelectedUser({...selectedUser, address: e.target.value})} placeholder="Alamat domisili saat ini..." className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Alamat Kantor</label>
                  <textarea rows={2} value={selectedUser.officeAddress || ''} onChange={e => setSelectedUser({...selectedUser, officeAddress: e.target.value})} placeholder="Alamat kantor penempatan..." className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm resize-none" />
                </div>

                {/* Bagian 5: Kontak Darurat */}
                <div className="p-4 border border-rose-900/50 bg-rose-950/10 rounded-xl space-y-4">
                   <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest border-b border-rose-900/30 pb-2">Kontak Darurat</p>
                   <div>
                     <label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">Nama Kontak</label>
                     <input type="text" value={selectedUser.emergencyName || ''} onChange={e => setSelectedUser({...selectedUser, emergencyName: e.target.value})} placeholder="Nama kontak darurat..." className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none shadow-sm" />
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                     <div>
                       <label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">No. Handphone</label>
                       <input type="tel" value={selectedUser.emergencyContact || ''} onChange={e => setSelectedUser({...selectedUser, emergencyContact: e.target.value})} placeholder="08..." className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none shadow-sm" />
                     </div>
                     <div>
                       <label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">Hubungan</label>
                       <select value={selectedUser.emergencyRelation || 'Orang Tua'} onChange={e => setSelectedUser({...selectedUser, emergencyRelation: e.target.value})} className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none appearance-none shadow-sm">
                          <option value="Orang Tua">Orang Tua</option>
                          <option value="Suami/Istri">Suami/Istri</option>
                          <option value="Anak">Anak</option>
                          <option value="Saudara">Saudara</option>
                          <option value="Rekan Kerja">Rekan Kerja</option>
                       </select>
                     </div>
                   </div>
                </div>
            </div>
          </div>

          {/* FOOTER ACTION */}
          <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe">
             <button onClick={handleUpdateUser} disabled={!selectedUser.name} className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
               <Save className="w-4 h-4" /> Simpan Perubahan
             </button>
          </div>
        </div>
      )}

      {/* --- PAGE DETAIL LAPORAN PATROLI (Bisa untuk Aman/Temuan) --- */}
      {selectedReportDetail && (
        <div className="fixed inset-0 z-[100] bg-[#070b19] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 flex flex-col animate-in slide-in-from-right-4">
          
          {/* HEADER / COVER IMAGE */}
          <div className="w-full h-64 bg-[#0b1229] relative shrink-0 cursor-pointer group" onClick={() => setPreviewPhoto({url: selectedReportDetail.photoUrl, author: selectedReportDetail.completedBy, time: `${selectedReportDetail.time} WIB`})}>
             <img src={selectedReportDetail.photoUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt="Bukti Patroli" />
             <div className="absolute inset-0 bg-gradient-to-b from-[#070b19]/80 via-transparent to-[#070b19]"></div>
             
             {/* Tombol Back */}
             <button onClick={(e) => { e.stopPropagation(); setSelectedReportDetail(null); }} className="absolute top-4 left-4 p-2 bg-black/50 text-white rounded-full backdrop-blur-md border border-white/20 hover:bg-black/70 transition-colors z-10">
               <ChevronDown className="w-6 h-6 rotate-90"/>
             </button>
             
             {/* Tombol Hapus */}
             <button onClick={(e) => { e.stopPropagation(); handleDeleteReport(selectedReportDetail.id); }} className="absolute top-4 right-4 p-2 bg-rose-500/80 text-white rounded-full backdrop-blur-md border border-rose-500/50 hover:bg-rose-600 transition-colors z-10">
               <Trash2 className="w-5 h-5"/>
             </button>
             
             {/* Watermark Info */}
             <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs text-white/90 text-right border border-cyan-900/50 z-10 shadow-lg">
               <p className="font-bold text-cyan-400">{selectedReportDetail.completedBy}</p>
               <p className="text-[10px] text-cyan-100/70">{selectedReportDetail.time} WIB</p>
             </div>
             
             <div className="absolute bottom-4 left-4 right-36 z-10">
                <span className={`text-[10px] px-2 py-1 border rounded font-bold mb-2 inline-block shadow-sm ${selectedReportDetail.resultType === 'temuan' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' : 'bg-emerald-500/10 border-emerald-500 text-emerald-400'}`}>
                  {selectedReportDetail.resultType === 'temuan' ? 'TEMUAN' : 'AMAN'}
                </span>
                <span className="text-[10px] px-2 py-1 ml-2 border border-cyan-500/50 rounded font-bold text-cyan-400 bg-cyan-900/40 inline-block shadow-sm">Laporan Titik</span>
                <h2 className="text-2xl font-black text-white drop-shadow-md leading-tight line-clamp-2 mt-1">{selectedReportDetail.name}</h2>
             </div>
          </div>

          {/* BODY CONTENT */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
             <div className="grid grid-cols-2 gap-3">
               <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50 shadow-sm"><p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">Inspektur</p><p className="text-sm font-bold text-cyan-50 truncate">{selectedReportDetail.completedBy}</p></div>
               <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50 shadow-sm"><p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">Waktu Sync</p><p className="text-sm font-bold text-cyan-50">{selectedReportDetail.time} WIB</p></div>
             </div>
             
             {selectedReportDetail.resultType === 'temuan' && (
               <div className="space-y-3">
                 <div className="bg-yellow-950/20 p-4 rounded-xl border border-yellow-900/30">
                   <p className="text-[10px] text-yellow-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><AlertTriangle className="w-3 h-3" /> Deskripsi Temuan</p>
                   <p className="text-sm text-yellow-50/90 leading-relaxed">{selectedReportDetail.kejadian || '-'}</p>
                 </div>
                 <div className="bg-yellow-950/20 p-4 rounded-xl border border-yellow-900/30">
                   <p className="text-[10px] text-yellow-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><AlertTriangle className="w-3 h-3" /> Penyebab Kejadian</p>
                   <p className="text-sm text-yellow-50/90 leading-relaxed">{selectedReportDetail.penyebab || '-'}</p>
                 </div>
                 <div className="bg-emerald-950/20 p-4 rounded-xl border border-emerald-900/30">
                   <p className="text-[10px] text-emerald-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><CheckCircle2 className="w-3 h-3" /> Tindak Lanjut Awal</p>
                   <p className="text-sm text-emerald-50/90 leading-relaxed">{selectedReportDetail.tindakLanjut || '-'}</p>
                 </div>
               </div>
             )}
          </div>
        </div>
      )}

      {/* --- MODAL DETAIL TEMUAN & PROGRESS --- */}
      {selectedIncident && (
        <div className="fixed inset-0 z-[100] bg-[#070b19] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 flex flex-col animate-in slide-in-from-right-4">
          
          {/* HEADER / COVER IMAGE */}
          {selectedIncident.photoUrl ? (
            <div className="w-full h-64 bg-[#0b1229] relative shrink-0 cursor-pointer group" onClick={() => setPreviewPhoto({url: selectedIncident.photoUrl, author: selectedIncident.reportedBy, time: `${selectedIncident.date} ${selectedIncident.time}`})}>
               <img src={selectedIncident.photoUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt="Bukti Temuan" />
               <div className="absolute inset-0 bg-gradient-to-b from-[#070b19]/80 via-transparent to-[#070b19]"></div>
               
               <button onClick={(e) => { e.stopPropagation(); setSelectedIncident(null); }} className="absolute top-4 left-4 p-2 bg-black/50 text-white rounded-full backdrop-blur-md border border-white/20 hover:bg-black/70 transition-colors z-10"><ChevronDown className="w-6 h-6 rotate-90"/></button>
               
               <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs text-white/90 text-right border border-yellow-900/50 z-10 shadow-lg">
                 <p className="font-bold text-yellow-400">{selectedIncident.reportedBy}</p>
                 <p className="text-[10px] text-yellow-100/70">{selectedIncident.date} {selectedIncident.time}</p>
               </div>
               
               <div className="absolute bottom-4 left-4 right-36 z-10">
                  <span className="text-[10px] px-2 py-1 border rounded font-bold bg-yellow-500/10 border-yellow-500 text-yellow-400 mb-2 inline-block shadow-sm">TEMUAN</span>
                  <h2 className="text-2xl font-black text-white drop-shadow-md leading-tight line-clamp-2">{selectedIncident.location}</h2>
               </div>
            </div>
          ) : (
            <div className="p-4 border-b border-yellow-500/30 flex items-center gap-3 bg-[#0b1229] shrink-0 shadow-sm">
               <button onClick={(e) => { e.stopPropagation(); setSelectedIncident(null); }} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors"><ChevronDown className="w-5 h-5 rotate-90"/></button>
               <div>
                  <span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Detail Temuan</span>
                  <h3 className="font-bold text-xl text-yellow-400 line-clamp-1">{selectedIncident.location}</h3>
               </div>
            </div>
          )}

          {/* BODY CONTENT */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
             
             {/* Status Badge */}
             <div className="flex justify-between items-center bg-[#0b1229] p-3 rounded-xl border border-cyan-900/50 shadow-sm">
               <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Status Saat Ini</span>
               {incidentMeta[selectedIncident.id]?.status === 'closed' ? (
                 <span className="text-[10px] px-3 py-1.5 border rounded font-black bg-slate-800 border-slate-600 text-slate-400 tracking-widest shadow-inner">CLOSED</span>
               ) : (
                 <span className="text-[10px] px-3 py-1.5 border rounded font-black bg-yellow-500/10 border-yellow-500 text-yellow-400 tracking-widest shadow-inner">OPEN</span>
               )}
             </div>

             <div className="grid grid-cols-2 gap-3">
               <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50 shadow-sm"><p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">Pelapor</p><p className="text-sm font-bold text-cyan-50 truncate">{selectedIncident.reportedBy}</p></div>
               <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50 shadow-sm"><p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">Waktu Lapor</p><p className="text-sm font-bold text-cyan-50">{selectedIncident.date}<br/>{selectedIncident.time}</p></div>
             </div>
             <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50 shadow-sm">
               <p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">Kapal Terkait</p>
               <p className="text-sm font-bold text-cyan-50">{selectedIncident.shipName || '-'}</p>
             </div>
             
             <div className="space-y-3">
               <div className="bg-yellow-950/20 p-4 rounded-xl border border-yellow-900/30">
                 <p className="text-[10px] text-yellow-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><AlertTriangle className="w-3 h-3" /> Deskripsi Temuan</p>
                 <p className="text-sm text-yellow-50/90 leading-relaxed">{selectedIncident.deskripsi || '-'}</p>
               </div>
               <div className="bg-yellow-950/20 p-4 rounded-xl border border-yellow-900/30">
                 <p className="text-[10px] text-yellow-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><AlertTriangle className="w-3 h-3" /> Penyebab Kejadian</p>
                 <p className="text-sm text-yellow-50/90 leading-relaxed">{selectedIncident.penyebab || '-'}</p>
               </div>
               <div className="bg-emerald-950/20 p-4 rounded-xl border border-emerald-900/30">
                 <p className="text-[10px] text-emerald-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><CheckCircle2 className="w-3 h-3" /> Tindak Lanjut Awal</p>
                 <p className="text-sm text-emerald-50/90 leading-relaxed">{selectedIncident.tindakLanjut || '-'}</p>
               </div>
             </div>

             {/* PROGRESS UPDATES */}
             <div className="pt-2">
               <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-2"><FileText className="w-4 h-4"/> Progress Perbaikan</h4>
               <div className="space-y-5 border-l-2 border-cyan-800 ml-2 pl-5">
                 {incidentMeta[selectedIncident.id]?.progress?.map((prog, idx) => (
                   <div key={idx} className="relative">
                     <div className="absolute -left-[25px] top-0 w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] border-2 border-[#070b19]"></div>
                     <p className="text-[10px] font-mono text-cyan-500 mb-1.5">{prog.date} {prog.time} • <span className="text-emerald-400 font-bold">{prog.author}</span></p>
                     
                     <div className="flex gap-3 items-start bg-[#0b1229] p-3.5 rounded-xl border border-cyan-900/50 shadow-sm hover:border-cyan-700 transition-colors">
                       <p className="text-sm text-cyan-50 flex-1 whitespace-pre-wrap leading-relaxed">{prog.comment}</p>
                       {prog.photoUrl && (
                         <div className="w-20 h-20 rounded-lg overflow-hidden border border-cyan-800 flex-shrink-0 cursor-pointer hover:opacity-80 hover:shadow-lg transition-all relative group" onClick={() => setPreviewPhoto({url: prog.photoUrl, author: prog.author, time: `${prog.date} ${prog.time}`})}>
                           <img src={prog.photoUrl} className="w-full h-full object-cover" alt="Progress"/>
                           <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <ImageIcon className="w-6 h-6 text-white"/>
                           </div>
                         </div>
                       )}
                     </div>
                   </div>
                 ))}
                 {(!incidentMeta[selectedIncident.id]?.progress || incidentMeta[selectedIncident.id]?.progress.length === 0) && (
                   <p className="text-sm text-cyan-700 italic border border-dashed border-cyan-900/50 p-4 rounded-xl text-center">Belum ada pembaruan progress.</p>
                 )}
               </div>
             </div>

             {/* FORM ADD PROGRESS */}
             {(!incidentMeta[selectedIncident.id] || incidentMeta[selectedIncident.id].status !== 'closed') && canManageIncident(selectedIncident) && (
               <div className="bg-[#0b1229] p-4 rounded-xl border border-emerald-900/50 mt-6 space-y-3 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                 <label className="text-[10px] font-mono text-emerald-400 block uppercase tracking-widest font-bold">Update Progress Baru</label>
                 <textarea value={newProgress.comment} onChange={e => setNewProgress({...newProgress, comment: e.target.value})} placeholder="Tuliskan detail perbaikan yang telah dilakukan..." rows={2} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-lg p-3 text-sm text-cyan-50 focus:border-emerald-500 outline-none resize-none" />
                 <div className="flex gap-2">
                   {!newProgress.photoUrl ? (
                     <button onClick={handlePhotoProgress} className="flex-1 py-2.5 rounded-lg border border-dashed border-emerald-500/40 bg-emerald-950/20 text-emerald-400 text-xs font-bold flex items-center justify-center gap-2 hover:bg-emerald-900/40 transition-colors"><Camera className="w-4 h-4"/> Bukti Foto</button>
                   ) : (
                     <div className="flex-1 h-11 rounded-lg overflow-hidden relative border border-emerald-500/50">
                       <img src={newProgress.photoUrl} className="w-full h-full object-cover" alt="Preview"/>
                       <button onClick={() => setNewProgress({...newProgress, photoUrl:null})} className="absolute top-0 right-0 p-1 bg-black/60 text-white rounded-bl text-[10px] hover:bg-rose-500 transition-colors"><X className="w-3.5 h-3.5"/></button>
                     </div>
                   )}
                   <button disabled={!newProgress.comment && !newProgress.photoUrl} onClick={() => handleAddProgress(selectedIncident.id)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 rounded-lg text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1 shadow-md"><Plus className="w-4 h-4"/> Update</button>
                 </div>
               </div>
             )}
             {(!incidentMeta[selectedIncident.id] || incidentMeta[selectedIncident.id].status !== 'closed') && !canManageIncident(selectedIncident) && (
               <div className="bg-[#0b1229] p-4 rounded-xl border border-amber-900/50 mt-6">
                 <p className="text-xs text-amber-300 leading-relaxed">Anda bisa melihat detail temuan ini, tetapi update progress hanya tersedia untuk PIC semua kapal atau petugas yang sedang ditugaskan di kapal <span className="font-bold">{selectedIncident.shipName || '-'}</span>.</p>
               </div>
             )}
          </div>

          {/* FOOTER ACTION BAR */}
          {(!incidentMeta[selectedIncident.id] || incidentMeta[selectedIncident.id].status !== 'closed') && canManageIncident(selectedIncident) && (
             <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe">
                <button onClick={() => handleCloseIncident(selectedIncident.id)} className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs border border-rose-500 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(244,63,94,0.15)]"><CheckCircle2 className="w-5 h-5"/> Tutup Temuan (Selesai)</button>
             </div>
          )}
        </div>
      )}

      {/* Modal Foto Preview Besar (Dipanggil dari List) */}
      {previewPhoto && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#070b19]/95 p-4 animate-in fade-in" onClick={()=>setPreviewPhoto(null)}>
          <div className="relative">
            <img src={typeof previewPhoto === 'string' ? previewPhoto : previewPhoto.url} alt="Zoom" className="w-full max-w-lg h-auto rounded-xl border border-cyan-700 shadow-[0_0_30px_rgba(6,182,212,0.2)]" />
            {typeof previewPhoto === 'object' && previewPhoto.author && (
              <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs text-white/90 text-right border border-cyan-900/50">
                <p className="font-bold text-cyan-400">{previewPhoto.author}</p>
                <p className="text-[10px] text-cyan-100/70">{previewPhoto.time}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION (Dinamis berdasarkan Role) */}
      <div className="fixed bottom-0 w-full sm:max-w-md bg-[#0b1229] border-t border-cyan-800/50 pb-safe z-40">
        <div className="flex items-center justify-around p-1">
          {[
            {id: 'home', icon: <Home className="w-5 h-5 mb-0.5"/>, label: 'Patroli'},
            {id: 'incidents', icon: <AlertOctagon className="w-5 h-5 mb-0.5"/>, label: 'Temuan'},
            {id: 'history', icon: <FileText className="w-5 h-5 mb-0.5"/>, label: 'Riwayat'},
            ...(isAdmin ? [
               {id: 'users', icon: <Users className="w-5 h-5 mb-0.5"/>, label: 'USER'},
               {id: 'ships', icon: <Anchor className="w-5 h-5 mb-0.5"/>, label: 'Armada'}
            ] : [])
          ].map(tab => (
             <button 
               key={tab.id} onClick={() => {setCurrentPage(tab.id); setActiveShipId(null);}}
               className={`flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-colors ${currentPage === tab.id && !activeShipId ? (tab.id === 'incidents' ? 'text-yellow-400' : 'text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]') : 'text-cyan-700 hover:text-cyan-500'}`}
             >
               {tab.icon}
               <span className="text-[9px] font-bold uppercase tracking-widest line-clamp-1">{tab.label}</span>
             </button>
          ))}
        </div>
      </div>
      
    </div>
    </>
  );
}
