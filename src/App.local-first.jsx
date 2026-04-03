import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  Anchor,
  Clock,
  Cloud,
  CloudRain,
  ExternalLink,
  Home,
  MapPin,
  Navigation,
  Package,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Ship,
  Sun,
  Thermometer,
  Users,
  Weight,
  Wind,
  Wifi,
} from "lucide-react";
import {
  AGENCY_OPTIONS,
  createActivityEntry,
  createDefaultAppState,
  DEFAULT_CURRENT_USER,
  DEFAULT_LOCATION_OPTIONS,
  getEmptyIncidentDraft,
  getEmptyPatrolDraft,
  getEmptyProgressDraft,
  getEmptyShipDraft,
  getEmptyUserDraft,
  SHIP_STATUS_OPTIONS,
  SHIP_TYPE_OPTIONS,
  USER_ROLE_OPTIONS,
} from "./data/defaultData";
import { buildMapsUrl, formatDateTime, formatShortDate, getWeatherDescriptor } from "./utils/formatters";
import { loadAppState, loadWeatherCache, saveAppState, saveWeatherCache } from "./utils/persistence";
import { makeId, normalizeLookup, sanitizeCoordinate, sanitizeEmail, sanitizeMultilineText, sanitizePhone, sanitizeText, sanitizeUrl } from "./utils/sanitize";
import { CheckpointCard, IncidentCard, ShipCard, UserCard } from "./components/cards";
import { Field, ModalShell, SectionHeading, StatusPill, UploadField } from "./components/ui";

const navItems = [
  { id: "home", label: "Patroli", icon: Home },
  { id: "incidents", label: "Temuan", icon: AlertOctagon },
  { id: "history", label: "Riwayat", icon: Clock },
];

const adminNavItems = [
  { id: "users", label: "User", icon: Users },
  { id: "ships", label: "Armada", icon: Anchor },
];

const weatherIcons = {
  sun: Sun,
  cloud: Cloud,
  rain: CloudRain,
  storm: CloudRain,
};

function App() {
  const defaultState = useMemo(() => createDefaultAppState(), []);
  const [appState, setAppState] = useState(() => loadAppState(defaultState));
  const [isAdmin, setIsAdmin] = useState(true);
  const [currentPage, setCurrentPage] = useState("home");
  const [patrolTab, setPatrolTab] = useState("checkpoint");
  const [searchQuery, setSearchQuery] = useState("");
  const [activePatrolId, setActivePatrolId] = useState(null);
  const [patrolDraft, setPatrolDraft] = useState(() => getEmptyPatrolDraft());
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentDraft, setIncidentDraft] = useState(() => getEmptyIncidentDraft());
  const [showUserForm, setShowUserForm] = useState(false);
  const [userDraft, setUserDraft] = useState(() => getEmptyUserDraft());
  const [showShipForm, setShowShipForm] = useState(false);
  const [shipDraft, setShipDraft] = useState(() => getEmptyShipDraft());
  const [selectedShipId, setSelectedShipId] = useState(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState("");
  const [progressDraft, setProgressDraft] = useState(() => getEmptyProgressDraft());
  const [newCustomCheckpoint, setNewCustomCheckpoint] = useState("");
  const [scheduleMonth, setScheduleMonth] = useState("current");
  const [weatherState, setWeatherState] = useState(() => {
    const cached = loadWeatherCache();
    return { data: cached, loading: !cached };
  });

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const primaryShip = useMemo(() => appState.ships[0] ?? null, [appState.ships]);
  const selectedShip = useMemo(() => appState.ships.find((ship) => ship.id === selectedShipId) ?? null, [appState.ships, selectedShipId]);
  const activeCrew = useMemo(() => appState.users.filter((user) => user.shipAssigned === primaryShip?.name && user.status === "active"), [appState.users, primaryShip?.name]);
  const filteredCheckpoints = useMemo(() => {
    const lookup = normalizeLookup(deferredSearchQuery);
    return lookup ? appState.checkpoints.filter((checkpoint) => normalizeLookup(checkpoint.name).includes(lookup)) : appState.checkpoints;
  }, [appState.checkpoints, deferredSearchQuery]);
  const completedCount = useMemo(() => appState.checkpoints.filter((checkpoint) => checkpoint.status === "completed").length, [appState.checkpoints]);
  const progressPercentage = useMemo(() => Math.round((completedCount / Math.max(appState.checkpoints.length, 1)) * 100), [completedCount, appState.checkpoints.length]);
  const patrolIncidents = useMemo(
    () =>
      appState.checkpoints
        .filter((checkpoint) => checkpoint.status === "completed" && checkpoint.resultType === "temuan")
        .map((checkpoint) => ({
          id: `patrol-${checkpoint.id}`,
          source: "patrol",
          location: checkpoint.name,
          deskripsi: checkpoint.kejadian,
          penyebab: checkpoint.penyebab,
          tindakLanjut: checkpoint.tindakLanjut,
          photoUrl: checkpoint.photoUrl,
          reportedAt: checkpoint.completedAt,
          reportedBy: checkpoint.completedBy,
        })),
    [appState.checkpoints],
  );
  const allIncidents = useMemo(() => [...appState.incidents, ...patrolIncidents].sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt)), [appState.incidents, patrolIncidents]);
  const selectedIncident = useMemo(() => allIncidents.find((incident) => incident.id === selectedIncidentId) ?? null, [allIncidents, selectedIncidentId]);
  const selectedReport = useMemo(() => appState.checkpoints.find((checkpoint) => checkpoint.id === selectedReportId) ?? null, [appState.checkpoints, selectedReportId]);
  const selectedIncidentMeta = selectedIncidentId ? appState.incidentMeta[selectedIncidentId] ?? { status: "open", progress: [] } : { status: "open", progress: [] };

  useEffect(() => {
    saveAppState(appState);
  }, [appState]);

  useEffect(() => {
    if (!primaryShip?.lat || !primaryShip?.lng) {
      return undefined;
    }
    const controller = new AbortController();
    async function fetchWeather() {
      try {
        setWeatherState((previous) => ({ data: previous.data, loading: !previous.data }));
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${primaryShip.lat}&longitude=${primaryShip.lng}&current_weather=true`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (payload?.current_weather) {
          saveWeatherCache(payload.current_weather);
          setWeatherState({ data: payload.current_weather, loading: false });
        }
      } catch {
        if (!controller.signal.aborted) {
          setWeatherState((previous) => ({ data: previous.data, loading: false }));
        }
      }
    }
    fetchWeather();
    return () => controller.abort();
  }, [primaryShip?.lat, primaryShip?.lng]);

  const weatherDescriptor = getWeatherDescriptor(weatherState.data?.weathercode);
  const WeatherIcon = weatherIcons[weatherDescriptor.tone] ?? Cloud;

  function appendActivity(updater, entry) {
    setAppState((previous) => {
      const nextState = updater(previous);
      return { ...nextState, activityLog: [entry, ...nextState.activityLog].slice(0, 150) };
    });
  }

  function navigate(pageId) {
    startTransition(() => {
      setCurrentPage(pageId);
      setSelectedShipId(null);
    });
  }

  function openPatrolForm(checkpointId, type) {
    setActivePatrolId(checkpointId);
    setPatrolDraft(getEmptyPatrolDraft(type));
  }

  function handlePatrolSubmit() {
    const payload = {
      status: "completed",
      completedBy: DEFAULT_CURRENT_USER,
      completedAt: new Date().toISOString(),
      resultType: patrolDraft.type,
      kejadian: sanitizeMultilineText(patrolDraft.kejadian, 480),
      penyebab: sanitizeMultilineText(patrolDraft.penyebab, 360),
      tindakLanjut: sanitizeMultilineText(patrolDraft.tindakLanjut, 360),
      photoUrl: sanitizeUrl(patrolDraft.photoUrl),
    };
    appendActivity(
      (previous) => ({
        ...previous,
        checkpoints: previous.checkpoints.map((checkpoint) => (checkpoint.id === activePatrolId ? { ...checkpoint, ...payload } : checkpoint)),
        incidentMeta: patrolDraft.type === "temuan" ? { ...previous.incidentMeta, [`patrol-${activePatrolId}`]: previous.incidentMeta[`patrol-${activePatrolId}`] ?? { status: "open", progress: [] } } : previous.incidentMeta,
      }),
      createActivityEntry({ title: "Checkpoint patroli disimpan", detail: `Laporan untuk titik patroli tersimpan di staging lokal.`, tone: patrolDraft.type === "temuan" ? "warning" : "success", actor: DEFAULT_CURRENT_USER }),
    );
    setActivePatrolId(null);
    setPatrolDraft(getEmptyPatrolDraft());
  }

  function handleSubmitIncident() {
    const location = incidentDraft.locType === "custom" ? sanitizeText(incidentDraft.customLocation, 80) : sanitizeText(incidentDraft.location, 80);
    const description = sanitizeMultilineText(incidentDraft.deskripsi, 480);
    if (!location || !description) {
      window.alert("Lokasi dan deskripsi wajib diisi.");
      return;
    }
    const incidentId = makeId("inc");
    appendActivity(
      (previous) => ({
        ...previous,
        incidents: [{ id: incidentId, source: "manual", reportedAt: new Date().toISOString(), reportedBy: DEFAULT_CURRENT_USER, location, deskripsi: description, penyebab: sanitizeMultilineText(incidentDraft.penyebab, 360), tindakLanjut: sanitizeMultilineText(incidentDraft.tindakLanjut, 360), photoUrl: sanitizeUrl(incidentDraft.photoUrl) }, ...previous.incidents],
        incidentMeta: { ...previous.incidentMeta, [incidentId]: { status: "open", progress: [] } },
      }),
      createActivityEntry({ title: "Temuan manual baru", detail: `${location} masuk ke daftar tindak lanjut.`, tone: "warning", actor: DEFAULT_CURRENT_USER }),
    );
    setShowIncidentForm(false);
    setIncidentDraft(getEmptyIncidentDraft());
  }

  function handleSaveUser() {
    const name = sanitizeText(userDraft.name, 80);
    if (!name) {
      window.alert("Nama user wajib diisi.");
      return;
    }
    const email = sanitizeEmail(userDraft.email);
    if (email && appState.users.some((user) => normalizeLookup(user.email) === normalizeLookup(email))) {
      window.alert("Email user sudah dipakai.");
      return;
    }
    appendActivity(
      (previous) => ({
        ...previous,
        users: [{ id: makeId("user"), name, role: userDraft.role, type: userDraft.type, status: "off-duty", shipAssigned: null, email, phone: sanitizePhone(userDraft.phone), dob: userDraft.dob, address: sanitizeMultilineText(userDraft.address, 240), officeAddress: sanitizeMultilineText(userDraft.officeAddress, 240), emergencyName: sanitizeText(userDraft.emergencyName, 80), emergencyContact: sanitizePhone(userDraft.emergencyContact), emergencyRelation: sanitizeText(userDraft.emergencyRelation, 40), hasCredential: userDraft.password.trim().length > 0, credentialUpdatedAt: userDraft.password.trim().length > 0 ? new Date().toISOString() : "", photoUrl: sanitizeUrl(userDraft.photoUrl) }, ...previous.users],
      }),
      createActivityEntry({ title: "User lokal baru", detail: `${name} siap dipakai untuk pengujian input data.`, tone: "info", actor: DEFAULT_CURRENT_USER }),
    );
    setShowUserForm(false);
    setUserDraft(getEmptyUserDraft());
  }

  function handleSaveShip() {
    const name = sanitizeText(shipDraft.name, 80);
    if (!name) {
      window.alert("Nama kapal wajib diisi.");
      return;
    }
    appendActivity(
      (previous) => ({
        ...previous,
        ships: [...previous.ships, { id: makeId("ship"), name, type: shipDraft.type, status: shipDraft.status, route: sanitizeText(shipDraft.route, 100), cargoType: sanitizeText(shipDraft.cargoType, 80), cargoAmount: sanitizeText(shipDraft.cargoAmount, 40), lat: sanitizeCoordinate(shipDraft.lat) || "-6.1021", lng: sanitizeCoordinate(shipDraft.lng) || "106.8833", personnel: [], personnelNextMonth: [], customCheckpoints: [], documents: [], photoUrl: sanitizeUrl(shipDraft.photoUrl) }],
      }),
      createActivityEntry({ title: "Armada lokal baru", detail: `${name} tersedia untuk uji input armada.`, tone: "info", actor: DEFAULT_CURRENT_USER }),
    );
    setShowShipForm(false);
    setShipDraft(getEmptyShipDraft());
  }

  function handleAddProgress() {
    const comment = sanitizeMultilineText(progressDraft.comment, 360);
    if (!comment && !progressDraft.photoUrl) {
      return;
    }
    appendActivity(
      (previous) => ({
        ...previous,
        incidentMeta: {
          ...previous.incidentMeta,
          [selectedIncidentId]: {
            status: previous.incidentMeta[selectedIncidentId]?.status ?? "open",
            progress: [{ id: makeId("progress"), comment, photoUrl: sanitizeUrl(progressDraft.photoUrl), author: DEFAULT_CURRENT_USER, createdAt: new Date().toISOString() }, ...(previous.incidentMeta[selectedIncidentId]?.progress ?? [])],
          },
        },
      }),
      createActivityEntry({ title: "Progress temuan", detail: `Update baru ditambahkan ke kasus ${selectedIncident?.location ?? "-"}.`, tone: "info", actor: DEFAULT_CURRENT_USER }),
    );
    setProgressDraft(getEmptyProgressDraft());
  }

  function handleTogglePersonnel(userId) {
    if (!selectedShip) {
      return;
    }
    const targetKey = scheduleMonth === "current" ? "personnel" : "personnelNextMonth";
    const assigned = selectedShip[targetKey].includes(userId);
    appendActivity(
      (previous) => ({
        ...previous,
        ships: previous.ships.map((ship) => (ship.id === selectedShip.id ? { ...ship, [targetKey]: assigned ? ship[targetKey].filter((id) => id !== userId) : [...ship[targetKey], userId] } : ship)),
        users: scheduleMonth === "current" ? previous.users.map((user) => (user.id === userId ? { ...user, shipAssigned: assigned ? null : selectedShip.name, status: assigned ? "off-duty" : "active" } : user)) : previous.users,
      }),
      createActivityEntry({ title: "Jadwal personel berubah", detail: `Penugasan personel pada ${selectedShip.name} diperbarui.`, tone: assigned ? "danger" : "success", actor: DEFAULT_CURRENT_USER }),
    );
  }

  function handleAddCustomCheckpoint() {
    const name = sanitizeText(newCustomCheckpoint, 80);
    if (!name) {
      return;
    }
    appendActivity(
      (previous) => ({ ...previous, checkpoints: [...previous.checkpoints, { id: makeId("cp"), name, status: "pending" }] }),
      createActivityEntry({ title: "Titik patroli baru", detail: `${name} ditambahkan untuk pengujian lokal.`, tone: "info", actor: DEFAULT_CURRENT_USER }),
    );
    setNewCustomCheckpoint("");
  }

  const visibleNavItems = isAdmin ? [...navItems, ...adminNavItems] : navItems;

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-4 md:px-6 md:py-6">
      <div className="app-shell min-h-[calc(100vh-2rem)] rounded-[36px] border border-cyan-500/14 px-4 pb-24 pt-4 text-slate-100 soft-outline md:px-6 md:pb-28">
        <header className="glass-card sticky top-4 z-30 rounded-[28px] border border-cyan-500/14 px-4 py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-200"><ShieldAlert className="h-6 w-6" /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-400">SmartPatrol</p>
                <h1 className="text-2xl font-black text-slate-50">Local First Staging</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="info"><Wifi className="h-3.5 w-3.5" /> Local Storage</StatusPill>
              <StatusPill tone={isAdmin ? "warning" : "neutral"}><Settings className="h-3.5 w-3.5" /> {isAdmin ? "Admin View" : "Petugas View"}</StatusPill>
              <button type="button" onClick={() => { setIsAdmin((previous) => !previous); navigate("home"); }} className="rounded-full border border-cyan-400/30 bg-cyan-400/8 px-4 py-2 text-sm font-bold text-cyan-200 transition hover:border-cyan-300/50 hover:text-white">Toggle Role</button>
            </div>
          </div>
        </header>

        <main className="mt-6 grid gap-6">
          {currentPage === "home" ? (
            <section className="grid gap-6">
              <div className="glass-card rounded-[30px] border border-cyan-500/14 p-4 md:p-5">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => startTransition(() => setPatrolTab("checkpoint"))} className={`rounded-full px-4 py-2 text-sm font-bold transition ${patrolTab === "checkpoint" ? "bg-cyan-400/14 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}>Checkpoint</button>
                  <button type="button" onClick={() => startTransition(() => setPatrolTab("info"))} className={`rounded-full px-4 py-2 text-sm font-bold transition ${patrolTab === "info" ? "bg-cyan-400/14 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}>Info Operasional</button>
                </div>
              </div>

              {patrolTab === "info" ? (
                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="glass-card rounded-[30px] border border-cyan-500/14 p-5 md:p-6">
                    <SectionHeading icon={Ship} title="Laporan patroli" subtitle="Ringkasan operasional kapal aktif untuk pengujian lokal." />
                    <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                      <div className="rounded-[28px] border border-cyan-400/12 bg-slate-950/80 p-5">
                        <h2 className="text-3xl font-black text-slate-50">{primaryShip?.name ?? "-"}</h2>
                        <p className="mt-2 text-cyan-200">{primaryShip?.route || "-"}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <StatusPill tone="info">{primaryShip?.status || "-"}</StatusPill>
                          <StatusPill tone="neutral">Shift 2 • 12:00 - 18:00</StatusPill>
                          <StatusPill tone="neutral">{formatShortDate(new Date().toISOString())}</StatusPill>
                        </div>
                        <div className="mt-6 rounded-[24px] border border-cyan-500/12 bg-cyan-400/6 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Koordinat aktif</p>
                              <p className="mt-1 text-lg font-semibold text-slate-50">{primaryShip?.lat}, {primaryShip?.lng}</p>
                            </div>
                            <a href={buildMapsUrl(primaryShip?.lat ?? "", primaryShip?.lng ?? "")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/8 px-4 py-2 text-sm font-bold text-cyan-200 transition hover:border-cyan-300/50 hover:text-white">
                              <MapPin className="h-4 w-4" />
                              Buka Google Maps
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-[28px] border border-cyan-500/12 bg-slate-950/80 p-5">
                        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Cuaca terkini</p>
                        <div className="mt-5 flex items-center gap-3">
                          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-100"><WeatherIcon className="h-8 w-8" /></div>
                          <div>
                            <p className="text-lg font-bold text-slate-50">{weatherDescriptor.label}</p>
                            <p className="text-sm text-slate-400">{weatherState.loading ? "Memuat ulang data cuaca..." : "Cache 30 menit untuk hemat request."}</p>
                          </div>
                        </div>
                        <div className="mt-6 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-cyan-500/12 bg-slate-900/70 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Temperatur</p>
                            <p className="mt-2 flex items-center gap-2 text-xl font-bold text-slate-50"><Thermometer className="h-5 w-5 text-rose-300" />{weatherState.data ? `${weatherState.data.temperature}°C` : "-"}</p>
                          </div>
                          <div className="rounded-2xl border border-cyan-500/12 bg-slate-900/70 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Kecepatan angin</p>
                            <p className="mt-2 flex items-center gap-2 text-xl font-bold text-slate-50"><Wind className="h-5 w-5 text-emerald-300" />{weatherState.data ? `${weatherState.data.windspeed} km/jam` : "-"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card rounded-[30px] border border-cyan-500/14 p-5 md:p-6">
                    <SectionHeading icon={Users} title="Petugas aktif" subtitle="Personel yang sedang tercatat di armada aktif." />
                    <div className="mt-5 space-y-3">
                      {activeCrew.map((member) => (
                        <div key={member.id} className="content-auto flex items-center gap-4 rounded-[24px] border border-cyan-500/12 bg-slate-900/70 p-4">
                          <img src={member.photoUrl} alt={member.name} className="h-14 w-14 rounded-2xl border border-white/10 object-cover" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-lg font-bold text-slate-50">{member.name}</p>
                            <p className="text-sm text-cyan-200">{member.role}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 xl:grid-cols-[1fr_0.38fr]">
                  <div className="glass-card rounded-[30px] border border-cyan-500/14 p-5">
                    <SectionHeading icon={Search} title="Checklist patroli" subtitle="Cari titik patroli, isi laporan aman atau temuan, lalu simpan ke staging lokal." />
                    <div className="mt-5">
                      <label className="relative block">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cari titik patroli..." className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 py-3 pl-11 pr-4 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" />
                      </label>
                    </div>
                    <div className="mt-5 space-y-3">
                      {filteredCheckpoints.map((checkpoint) => (
                        <CheckpointCard key={checkpoint.id} item={checkpoint} onAction={openPatrolForm} onPreview={setSelectedPhotoUrl} onOpenDetail={setSelectedReportId} />
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-6">
                    <div className="glass-card rounded-[30px] border border-cyan-500/14 p-5">
                      <SectionHeading icon={Clock} title="Progres shift" subtitle="Derivasi langsung dari data checkpoint." />
                      <div className="mt-5 rounded-[24px] border border-cyan-500/12 bg-slate-950/70 p-4">
                        <div className="flex items-end justify-between gap-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Selesai</p>
                            <p className="mt-1 text-3xl font-black text-slate-50">{completedCount}/{appState.checkpoints.length}</p>
                          </div>
                          <StatusPill tone={progressPercentage === 100 ? "success" : "info"}>{progressPercentage}%</StatusPill>
                        </div>
                        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-emerald-300" style={{ width: `${progressPercentage}%` }} /></div>
                      </div>
                    </div>
                    <div className="glass-card rounded-[30px] border border-cyan-500/14 p-5">
                      <SectionHeading icon={Plus} title="Titik tambahan" subtitle="Tambahkan node patroli baru tanpa menyentuh Firebase dulu." />
                      <div className="mt-5 flex gap-2">
                        <input type="text" value={newCustomCheckpoint} onChange={(event) => setNewCustomCheckpoint(event.target.value)} placeholder="Nama lokasi baru..." className="min-w-0 flex-1 rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" />
                        <button type="button" onClick={handleAddCustomCheckpoint} className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-bold text-cyan-200 transition hover:border-cyan-300/50 hover:text-white">Tambah</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {currentPage === "incidents" ? (
            <section className="glass-card rounded-[30px] border border-cyan-500/14 p-5 md:p-6">
              <SectionHeading icon={AlertOctagon} title="Pelaporan temuan" subtitle="Semua temuan manual dan hasil patroli dikonsolidasikan dalam satu alur tindak lanjut." action={<button type="button" onClick={() => setShowIncidentForm(true)} className="rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-200 transition hover:border-amber-300/50 hover:text-white">Lapor baru</button>} />
              <div className="mt-6 space-y-3">
                {allIncidents.map((incident) => (
                  <IncidentCard key={incident.id} incident={incident} meta={appState.incidentMeta[incident.id]} onOpen={setSelectedIncidentId} />
                ))}
              </div>
            </section>
          ) : null}

          {currentPage === "history" ? (
            <section className="glass-card rounded-[30px] border border-cyan-500/14 p-5 md:p-6">
              <SectionHeading icon={Clock} title="Riwayat aktivitas" subtitle="Log lokal dipotong maksimal 150 entri agar penyimpanan tetap ringan." />
              <div className="mt-6 space-y-3">
                {appState.activityLog.map((entry) => (
                  <div key={entry.id} className="content-auto rounded-[26px] border border-cyan-500/12 bg-slate-900/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2"><StatusPill tone={entry.tone === "warning" ? "warning" : entry.tone === "success" ? "success" : entry.tone === "danger" ? "danger" : "info"}>{entry.actor}</StatusPill><p className="text-lg font-bold text-slate-50">{entry.title}</p></div>
                      <p className="text-sm text-slate-500">{formatDateTime(entry.createdAt)}</p>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-400">{entry.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {currentPage === "users" && isAdmin ? (
            <section className="glass-card rounded-[30px] border border-cyan-500/14 p-5 md:p-6">
              <SectionHeading icon={Users} title="Data user" subtitle="Password tidak disimpan mentah di local storage. Hanya status kredensial yang dicatat." action={<button type="button" onClick={() => { setUserDraft(getEmptyUserDraft()); setShowUserForm(true); }} className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-200 transition hover:border-cyan-300/50 hover:text-white">Tambah user</button>} />
              <div className="mt-6 grid gap-3">{appState.users.map((user) => <UserCard key={user.id} user={user} onOpen={() => {}} />)}</div>
            </section>
          ) : null}

          {currentPage === "ships" && isAdmin ? (
            <section className="glass-card rounded-[30px] border border-cyan-500/14 p-5 md:p-6">
              <SectionHeading icon={Anchor} title="Armada kapal" subtitle="Mode lokal sudah siap untuk uji data armada dan penugasan personel." action={<button type="button" onClick={() => { setShipDraft(getEmptyShipDraft()); setShowShipForm(true); }} className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-200 transition hover:border-cyan-300/50 hover:text-white">Tambah armada</button>} />
              <div className="mt-6 grid gap-4 lg:grid-cols-2">{appState.ships.map((ship) => <ShipCard key={ship.id} ship={ship} onOpen={(item) => setSelectedShipId(item.id)} />)}</div>
            </section>
          ) : null}
        </main>

        <nav className="glass-card fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 gap-1 rounded-[28px] border border-cyan-500/14 p-2 md:w-[calc(100%-3rem)]">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button key={item.id} type="button" onClick={() => navigate(item.id)} className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[22px] px-3 py-3 text-sm font-bold transition ${active ? "bg-cyan-400/12 text-cyan-100" : "text-slate-500 hover:text-slate-200"}`}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {activePatrolId ? (
          <ModalShell
            title={appState.checkpoints.find((checkpoint) => checkpoint.id === activePatrolId)?.name ?? "Checkpoint"}
            subtitle={`Form patroli • ${patrolDraft.type === "temuan" ? "Temuan" : "Aman"}`}
            onClose={() => {
              setActivePatrolId(null);
              setPatrolDraft(getEmptyPatrolDraft());
            }}
            actions={
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => { setActivePatrolId(null); setPatrolDraft(getEmptyPatrolDraft()); }} className="flex-1 rounded-2xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-300 transition hover:border-slate-500 hover:text-white">Batal</button>
                <button type="button" onClick={handlePatrolSubmit} className={`flex-1 rounded-2xl px-4 py-3 text-sm font-black transition ${patrolDraft.type === "temuan" ? "bg-amber-400 text-slate-950 hover:bg-amber-300" : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"}`}>Simpan laporan</button>
              </div>
            }
            maxWidth="max-w-2xl"
          >
            <div className="grid gap-4">
              <Field label={patrolDraft.type === "temuan" ? "Deskripsi temuan" : "Catatan aman"} hint={patrolDraft.type === "temuan" ? "" : "Opsional"}>
                <textarea rows="3" value={patrolDraft.kejadian} onChange={(event) => setPatrolDraft((previous) => ({ ...previous, kejadian: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" />
              </Field>
              {patrolDraft.type === "temuan" ? (
                <Field label="Penyebab kejadian">
                  <textarea rows="3" value={patrolDraft.penyebab} onChange={(event) => setPatrolDraft((previous) => ({ ...previous, penyebab: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-amber-400/40" />
                </Field>
              ) : null}
              <Field label="Tindak lanjut awal" hint="Opsional">
                <textarea rows="3" value={patrolDraft.tindakLanjut} onChange={(event) => setPatrolDraft((previous) => ({ ...previous, tindakLanjut: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" />
              </Field>
              <UploadField label="Bukti visual lokal" hint="Foto akan otomatis dikompresi agar hemat local storage." previewUrl={patrolDraft.photoUrl} onPick={({ url, name }) => setPatrolDraft((previous) => ({ ...previous, photoUrl: url, photoName: name }))} onClear={() => setPatrolDraft((previous) => ({ ...previous, photoUrl: "", photoName: "" }))} accent={patrolDraft.type === "temuan" ? "warning" : "success"} />
            </div>
          </ModalShell>
        ) : null}

        {showIncidentForm ? (
          <ModalShell
            title="Laporan Temuan Baru"
            subtitle="Input temuan manual"
            onClose={() => {
              setShowIncidentForm(false);
              setIncidentDraft(getEmptyIncidentDraft());
            }}
            actions={
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => { setShowIncidentForm(false); setIncidentDraft(getEmptyIncidentDraft()); }} className="flex-1 rounded-2xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-300 transition hover:border-slate-500 hover:text-white">Batal</button>
                <button type="button" onClick={handleSubmitIncident} className="flex-1 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-300">Simpan temuan</button>
              </div>
            }
            maxWidth="max-w-2xl"
          >
            <div className="grid gap-4">
              <Field label="Mode lokasi">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setIncidentDraft((previous) => ({ ...previous, locType: "default" }))} className={`rounded-full px-4 py-2 text-sm font-bold transition ${incidentDraft.locType === "default" ? "bg-cyan-400/14 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}>Dari daftar</button>
                  <button type="button" onClick={() => setIncidentDraft((previous) => ({ ...previous, locType: "custom" }))} className={`rounded-full px-4 py-2 text-sm font-bold transition ${incidentDraft.locType === "custom" ? "bg-cyan-400/14 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}>Custom</button>
                </div>
              </Field>
              {incidentDraft.locType === "default" ? (
                <Field label="Lokasi">
                  <select value={incidentDraft.location} onChange={(event) => setIncidentDraft((previous) => ({ ...previous, location: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40">
                    {DEFAULT_LOCATION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
              ) : (
                <Field label="Lokasi custom">
                  <input type="text" value={incidentDraft.customLocation} onChange={(event) => setIncidentDraft((previous) => ({ ...previous, customLocation: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" />
                </Field>
              )}
              <Field label="Deskripsi temuan">
                <textarea rows="3" value={incidentDraft.deskripsi} onChange={(event) => setIncidentDraft((previous) => ({ ...previous, deskripsi: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" />
              </Field>
              <Field label="Penyebab kejadian" hint="Opsional">
                <textarea rows="3" value={incidentDraft.penyebab} onChange={(event) => setIncidentDraft((previous) => ({ ...previous, penyebab: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" />
              </Field>
              <Field label="Tindak lanjut awal" hint="Opsional">
                <textarea rows="3" value={incidentDraft.tindakLanjut} onChange={(event) => setIncidentDraft((previous) => ({ ...previous, tindakLanjut: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" />
              </Field>
              <UploadField label="Bukti visual" hint="Foto manual akan dikompresi sebelum masuk local storage." previewUrl={incidentDraft.photoUrl} onPick={({ url, name }) => setIncidentDraft((previous) => ({ ...previous, photoUrl: url, photoName: name }))} onClear={() => setIncidentDraft((previous) => ({ ...previous, photoUrl: "", photoName: "" }))} accent="warning" />
            </div>
          </ModalShell>
        ) : null}

        {showUserForm ? (
          <ModalShell
            title="User Baru"
            subtitle="Registrasi staging lokal"
            onClose={() => {
              setShowUserForm(false);
              setUserDraft(getEmptyUserDraft());
            }}
            actions={
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => { setShowUserForm(false); setUserDraft(getEmptyUserDraft()); }} className="flex-1 rounded-2xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-300 transition hover:border-slate-500 hover:text-white">Batal</button>
                <button type="button" onClick={handleSaveUser} className="flex-1 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300">Simpan user</button>
              </div>
            }
            maxWidth="max-w-4xl"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <UploadField label="Foto profil" hint="Opsional. Jika kosong, aplikasi membuat avatar lokal otomatis." previewUrl={userDraft.photoUrl} onPick={({ url, name }) => setUserDraft((previous) => ({ ...previous, photoUrl: url, photoName: name }))} onClear={() => setUserDraft((previous) => ({ ...previous, photoUrl: "", photoName: "" }))} />
              <div className="grid gap-4">
                <Field label="Nama lengkap"><input type="text" value={userDraft.name} onChange={(event) => setUserDraft((previous) => ({ ...previous, name: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" /></Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Role"><select value={userDraft.role} onChange={(event) => setUserDraft((previous) => ({ ...previous, role: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40">{USER_ROLE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>
                  <Field label="Instansi"><select value={userDraft.type} onChange={(event) => setUserDraft((previous) => ({ ...previous, type: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40">{AGENCY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Email"><input type="email" value={userDraft.email} onChange={(event) => setUserDraft((previous) => ({ ...previous, email: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" /></Field>
                  <Field label="Password" hint="Tidak disimpan mentah"><input type="password" value={userDraft.password} onChange={(event) => setUserDraft((previous) => ({ ...previous, password: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" /></Field>
                </div>
                <Field label="No. WA"><input type="tel" value={userDraft.phone} onChange={(event) => setUserDraft((previous) => ({ ...previous, phone: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" /></Field>
              </div>
            </div>
          </ModalShell>
        ) : null}

        {showShipForm ? (
          <ModalShell
            title="Armada Baru"
            subtitle="Tambah kapal ke staging lokal"
            onClose={() => {
              setShowShipForm(false);
              setShipDraft(getEmptyShipDraft());
            }}
            actions={
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => { setShowShipForm(false); setShipDraft(getEmptyShipDraft()); }} className="flex-1 rounded-2xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-300 transition hover:border-slate-500 hover:text-white">Batal</button>
                <button type="button" onClick={handleSaveShip} className="flex-1 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300">Simpan armada</button>
              </div>
            }
            maxWidth="max-w-4xl"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <UploadField label="Foto / cover kapal" hint="Opsional. Jika kosong, cover lokal dibuat otomatis." previewUrl={shipDraft.photoUrl} onPick={({ url, name }) => setShipDraft((previous) => ({ ...previous, photoUrl: url, photoName: name }))} onClear={() => setShipDraft((previous) => ({ ...previous, photoUrl: "", photoName: "" }))} />
              <div className="grid gap-4">
                <Field label="Nama kapal"><input type="text" value={shipDraft.name} onChange={(event) => setShipDraft((previous) => ({ ...previous, name: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" /></Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Tipe kapal"><select value={shipDraft.type} onChange={(event) => setShipDraft((previous) => ({ ...previous, type: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40">{SHIP_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>
                  <Field label="Status"><select value={shipDraft.status} onChange={(event) => setShipDraft((previous) => ({ ...previous, status: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40">{SHIP_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>
                </div>
                <Field label="Rute / lokasi sandar"><input type="text" value={shipDraft.route} onChange={(event) => setShipDraft((previous) => ({ ...previous, route: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" /></Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Jenis muatan"><input type="text" value={shipDraft.cargoType} onChange={(event) => setShipDraft((previous) => ({ ...previous, cargoType: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" /></Field>
                  <Field label="Jumlah muatan"><input type="text" value={shipDraft.cargoAmount} onChange={(event) => setShipDraft((previous) => ({ ...previous, cargoAmount: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" /></Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Latitude"><input type="text" value={shipDraft.lat} onChange={(event) => setShipDraft((previous) => ({ ...previous, lat: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" /></Field>
                  <Field label="Longitude"><input type="text" value={shipDraft.lng} onChange={(event) => setShipDraft((previous) => ({ ...previous, lng: event.target.value }))} className="w-full rounded-2xl border border-cyan-500/12 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40" /></Field>
                </div>
              </div>
            </div>
          </ModalShell>
        ) : null}

        {selectedShip ? (
          <ModalShell title={selectedShip.name} subtitle="Detail armada" onClose={() => setSelectedShipId(null)} maxWidth="max-w-5xl">
            <div className="grid gap-6 lg:grid-cols-[1fr_0.42fr]">
              <div className="grid gap-4">
                <div className="overflow-hidden rounded-[28px] border border-cyan-500/12">
                  <img src={selectedShip.photoUrl} alt={selectedShip.name} className="h-72 w-full object-cover" />
                </div>
                <div className="rounded-[28px] border border-cyan-500/12 bg-slate-900/70 p-5">
                  <SectionHeading icon={Ship} title="Profil armada" subtitle={`${selectedShip.type} • ${selectedShip.status}`} />
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-[24px] border border-cyan-500/12 bg-slate-950/70 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Rute / sandar</p>
                      <p className="mt-2 text-sm text-slate-300">{selectedShip.route || "-"}</p>
                    </div>
                    <div className="rounded-[24px] border border-cyan-500/12 bg-slate-950/70 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Koordinat</p>
                      <p className="mt-2 text-sm text-slate-300">{selectedShip.lat}, {selectedShip.lng}</p>
                      <a href={buildMapsUrl(selectedShip.lat, selectedShip.lng)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-cyan-200 hover:text-white"><Navigation className="h-4 w-4" /> Buka peta</a>
                    </div>
                    <div className="rounded-[24px] border border-cyan-500/12 bg-slate-950/70 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Jenis muatan</p>
                      <p className="mt-2 flex items-center gap-2 text-sm text-slate-300"><Package className="h-4 w-4 text-cyan-200" /> {selectedShip.cargoType || "-"}</p>
                    </div>
                    <div className="rounded-[24px] border border-cyan-500/12 bg-slate-950/70 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Jumlah muatan</p>
                      <p className="mt-2 flex items-center gap-2 text-sm text-slate-300"><Weight className="h-4 w-4 text-amber-200" /> {selectedShip.cargoAmount || "-"}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-4">
                <div className="rounded-[28px] border border-cyan-500/12 bg-slate-900/70 p-5">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setScheduleMonth("current")} className={`rounded-full px-4 py-2 text-sm font-bold transition ${scheduleMonth === "current" ? "bg-cyan-400/14 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}>Bulan ini</button>
                    <button type="button" onClick={() => setScheduleMonth("next")} className={`rounded-full px-4 py-2 text-sm font-bold transition ${scheduleMonth === "next" ? "bg-cyan-400/14 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}>Bulan depan</button>
                  </div>
                  <div className="mt-5 space-y-3">
                    {appState.users.map((user) => {
                      const assigned = (scheduleMonth === "current" ? selectedShip.personnel : selectedShip.personnelNextMonth).includes(user.id);
                      return (
                        <div key={user.id} className="content-auto flex items-center gap-3 rounded-[24px] border border-cyan-500/12 bg-slate-950/70 p-4">
                          <img src={user.photoUrl} alt={user.name} className="h-12 w-12 rounded-2xl border border-white/10 object-cover" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-50">{user.name}</p>
                            <p className="text-xs text-cyan-200">{user.role}</p>
                          </div>
                          <button type="button" onClick={() => handleTogglePersonnel(user.id)} className={`rounded-2xl px-3 py-2 text-xs font-bold transition ${assigned ? "border border-rose-400/30 bg-rose-400/10 text-rose-200" : "border border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>{assigned ? "Lepas" : "Assign"}</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </ModalShell>
        ) : null}

        {selectedIncident ? (
          <ModalShell
            title={selectedIncident.location}
            subtitle="Detail temuan & progress"
            onClose={() => {
              setSelectedIncidentId(null);
              setProgressDraft(getEmptyProgressDraft());
            }}
            actions={
              selectedIncidentMeta.status !== "closed" ? (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={() => appendActivity((previous) => ({ ...previous, incidentMeta: { ...previous.incidentMeta, [selectedIncidentId]: { status: "closed", progress: previous.incidentMeta[selectedIncidentId]?.progress ?? [] } } }), createActivityEntry({ title: "Temuan ditutup", detail: `${selectedIncident.location} ditandai selesai.`, tone: "success", actor: DEFAULT_CURRENT_USER }))} className="flex-1 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-200 transition hover:border-emerald-300/50 hover:text-white">Tandai selesai</button>
                </div>
              ) : null
            }
            maxWidth="max-w-4xl"
          >
            <div className="grid gap-6 lg:grid-cols-[1fr_0.42fr]">
              <div className="grid gap-4">
                {selectedIncident.photoUrl ? <button type="button" onClick={() => setSelectedPhotoUrl(selectedIncident.photoUrl)} className="overflow-hidden rounded-[28px] border border-cyan-500/12"><img src={selectedIncident.photoUrl} alt={selectedIncident.location} className="h-72 w-full object-cover" /></button> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={selectedIncidentMeta.status === "closed" ? "neutral" : "warning"}>{selectedIncidentMeta.status === "closed" ? "Closed" : "Open"}</StatusPill>
                  <StatusPill tone={selectedIncident.source === "patrol" ? "success" : "warning"}>{selectedIncident.source === "patrol" ? "Dari patroli" : "Manual"}</StatusPill>
                  <StatusPill tone="neutral">{selectedIncident.reportedBy}</StatusPill>
                </div>
                <div className="rounded-[28px] border border-cyan-500/12 bg-slate-900/70 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Deskripsi temuan</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{selectedIncident.deskripsi || "-"}</p>
                  <p className="mt-4 text-sm text-slate-400">Penyebab: {selectedIncident.penyebab || "-"}</p>
                  <p className="mt-1 text-sm text-slate-400">Tindak lanjut awal: {selectedIncident.tindakLanjut || "-"}</p>
                </div>
                <div className="rounded-[28px] border border-cyan-500/12 bg-slate-900/70 p-5">
                  <SectionHeading icon={Clock} title="Progress tindak lanjut" />
                  <div className="mt-5 space-y-4">
                    {(selectedIncidentMeta.progress ?? []).length === 0 ? <div className="rounded-[24px] border border-dashed border-cyan-500/14 px-4 py-6 text-center text-sm text-slate-500">Belum ada pembaruan progress.</div> : selectedIncidentMeta.progress.map((progress) => (
                      <div key={progress.id} className="content-auto rounded-[24px] border border-cyan-500/12 bg-slate-950/70 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2"><StatusPill tone="info">{progress.author}</StatusPill><p className="text-sm text-slate-500">{formatDateTime(progress.createdAt)}</p></div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{progress.comment || "Bukti visual ditambahkan."}</p>
                        {progress.photoUrl ? <button type="button" onClick={() => setSelectedPhotoUrl(progress.photoUrl)} className="mt-4 overflow-hidden rounded-2xl border border-white/10"><img src={progress.photoUrl} alt="Progress" className="h-40 w-full object-cover" /></button> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid gap-4">
                {selectedIncidentMeta.status !== "closed" ? (
                  <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-400/6 p-5">
                    <SectionHeading icon={Plus} title="Tambah progress" />
                    <div className="mt-5 grid gap-4">
                      <Field label="Catatan progress"><textarea rows="4" value={progressDraft.comment} onChange={(event) => setProgressDraft((previous) => ({ ...previous, comment: event.target.value }))} className="w-full rounded-2xl border border-emerald-400/16 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-300/40" /></Field>
                      <UploadField label="Bukti tambahan" hint="Opsional." previewUrl={progressDraft.photoUrl} onPick={({ url, name }) => setProgressDraft((previous) => ({ ...previous, photoUrl: url, photoName: name }))} onClear={() => setProgressDraft((previous) => ({ ...previous, photoUrl: "", photoName: "" }))} accent="success" />
                      <button type="button" onClick={handleAddProgress} className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300">Update progress</button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </ModalShell>
        ) : null}

        {selectedReport ? (
          <ModalShell title={selectedReport.name} subtitle="Detail laporan patroli" onClose={() => setSelectedReportId(null)} maxWidth="max-w-3xl">
            <div className="grid gap-4">
              {selectedReport.photoUrl ? <button type="button" onClick={() => setSelectedPhotoUrl(selectedReport.photoUrl)} className="overflow-hidden rounded-[28px] border border-cyan-500/12"><img src={selectedReport.photoUrl} alt={selectedReport.name} className="h-72 w-full object-cover" /></button> : null}
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={selectedReport.resultType === "temuan" ? "warning" : "success"}>{selectedReport.resultType === "temuan" ? "Temuan" : "Aman"}</StatusPill>
                <StatusPill tone="neutral">{selectedReport.completedBy}</StatusPill>
                <StatusPill tone="neutral">{formatDateTime(selectedReport.completedAt)}</StatusPill>
              </div>
              <div className="rounded-[24px] border border-cyan-500/12 bg-slate-900/70 p-4">
                <p className="text-sm text-slate-300">Deskripsi: {selectedReport.kejadian || "-"}</p>
                <p className="mt-2 text-sm text-slate-400">Penyebab: {selectedReport.penyebab || "-"}</p>
                <p className="mt-2 text-sm text-slate-400">Tindak lanjut: {selectedReport.tindakLanjut || "-"}</p>
              </div>
            </div>
          </ModalShell>
        ) : null}

        {selectedPhotoUrl ? (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm" onClick={() => setSelectedPhotoUrl("")}>
            <img src={selectedPhotoUrl} alt="Preview" className="max-h-[90vh] max-w-5xl rounded-[28px] border border-cyan-500/18 object-contain soft-outline" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default App;
