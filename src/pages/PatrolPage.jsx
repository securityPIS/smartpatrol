import React from 'react';
import { ACCESS_ROLES, useHistory, useIncidents, usePatrol, useReports, useShips, useWeather } from '../context/AppContextRuntime';
import {
  CheckCircle2, AlertTriangle, Search, Ship, MapPin, ExternalLink, ArrowLeft, Plus,
  CalendarDays, User, Thermometer, Wind, FileText, CircleOff, TimerReset,
} from 'lucide-react';
import AsyncImage from '../components/AsyncImage';
import HistoryDetailView from '../components/views/HistoryDetailView';

function getPatrolSummary(checkpoints) {
  return checkpoints.reduce((summary, checkpoint) => {
    summary.total += 1;
    if (checkpoint.status === 'completed') {
      summary.completed += 1;
      if (checkpoint.resultType === 'aman') summary.aman += 1;
      if (checkpoint.resultType === 'temuan') summary.temuan += 1;
    }
    if (checkpoint.status === 'missed' || checkpoint.resultType === 'missed') summary.missed += 1;
    return summary;
  }, { aman: 0, temuan: 0, missed: 0, completed: 0, total: 0 });
}

function getSummaryCardMeta(type) {
  if (type === 'aman') {
    return {
      title: 'Kondisi Normal',
      cardClass: 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-400/60',
      countClass: 'text-emerald-200',
      labelClass: 'text-emerald-300',
      iconWrapClass: 'bg-emerald-500/10 border-emerald-500/20',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
      itemClass: 'bg-emerald-950/20 border-emerald-500/30',
      itemTextClass: 'text-emerald-400',
      itemIcon: <CheckCircle2 className="w-3 h-3 text-emerald-500" />,
      emptyLabel: 'kondisi normal',
    };
  }
  if (type === 'temuan') {
    return {
      title: 'Kondisi Temuan',
      cardClass: 'bg-yellow-950/20 border-yellow-500/30 hover:border-yellow-400/60',
      countClass: 'text-yellow-200',
      labelClass: 'text-yellow-300',
      iconWrapClass: 'bg-yellow-500/10 border-yellow-500/20',
      icon: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
      itemClass: 'bg-yellow-950/20 border-yellow-500/30',
      itemTextClass: 'text-yellow-400',
      itemIcon: <AlertTriangle className="w-3 h-3 text-yellow-500" />,
      emptyLabel: 'temuan',
    };
  }
  return {
    title: 'Status Missed',
    cardClass: 'bg-rose-950/20 border-rose-500/30 hover:border-rose-400/60',
    countClass: 'text-rose-200',
    labelClass: 'text-rose-300',
    iconWrapClass: 'bg-rose-500/10 border-rose-500/20',
    icon: <CircleOff className="w-5 h-5 text-rose-400" />,
    itemClass: 'bg-rose-950/20 border-rose-500/30',
    itemTextClass: 'text-rose-400',
    itemIcon: <CircleOff className="w-3 h-3 text-rose-500" />,
    emptyLabel: 'status missed',
  };
}

function formatShiftCountdown(remainingMs) {
  if (remainingMs <= 0) return '00:00:00';

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
}

import PatrolFormView from '../components/views/PatrolFormView';
import IncidentDetailView from '../components/views/IncidentDetailView';
import ReportDetailView from '../components/views/ReportDetailView';

const PatrolPage = React.memo(function PatrolPage() {
  const [summaryDetailType, setSummaryDetailType] = React.useState(null);
  const {
    patrolTab, setPatrolTab, searchQuery, setSearchQuery, filteredCheckpoints,
    handleActionClick, handleOpenPatrolResult, handleAddCustomPatrolNode,
    completedCount, totalCount, progressPercentage, newCustomNode, setNewCustomNode,
    checkpoints, activeShiftGuardSnapshot, currentShiftMeta, currentShiftSchedule, canPatrolCurrentShip, canAddTemporaryPatrolNode,
    activeForms,
  } = usePatrol();
  const { operationalShip, operationalShipName } = useShips();
  const { weatherInfo, weatherLoading, getWeatherDetail } = useWeather();
  const { setPreviewPhoto, selectedReportDetail } = useReports();
  const { selectedHistoryEntry, closeHistoryEntry } = useHistory();
  const { selectedIncident } = useIncidents();
  const [countdownNow, setCountdownNow] = React.useState(() => Date.now());

  const isHistoryMode = Boolean(selectedHistoryEntry);
  const activeCheckpoints = isHistoryMode ? (selectedHistoryEntry?.checkpoints || []) : checkpoints;
  const patrolSummary = React.useMemo(() => getPatrolSummary(activeCheckpoints), [activeCheckpoints]);
  
  // Check if any form or detail is active
  const hasActiveForm = Object.keys(activeForms).length > 0;
  const showRightPane = hasActiveForm || (selectedIncident && selectedIncident.isPatrol) || selectedReportDetail;

  const summaryCards = React.useMemo(() => ([
    { type: 'aman', count: patrolSummary.aman },
    { type: 'temuan', count: patrolSummary.temuan },
    { type: 'missed', count: patrolSummary.missed },
  ]), [patrolSummary]);
  const summaryDetailItems = React.useMemo(() => {
    if (!summaryDetailType) return [];
    return activeCheckpoints.filter((item) => {
      if (summaryDetailType === 'missed') return item.status === 'missed' || item.resultType === 'missed';
      return item.status === 'completed' && item.resultType === summaryDetailType;
    });
  }, [activeCheckpoints, summaryDetailType]);

  const displayShip = isHistoryMode ? selectedHistoryEntry?.shipSnapshot : operationalShip;
  const displayShipName = isHistoryMode ? selectedHistoryEntry?.ship : operationalShipName;
  const displayDate = isHistoryMode ? selectedHistoryEntry?.date : currentShiftMeta?.dateLabel;
  const displayShiftLabel = isHistoryMode ? selectedHistoryEntry?.shift : currentShiftMeta?.label;
  const displayShiftTime = isHistoryMode ? selectedHistoryEntry?.time : currentShiftMeta?.timeRange;
  const displayWeather = isHistoryMode ? selectedHistoryEntry?.weatherSnapshot : weatherInfo;
  const displayWeatherLoading = isHistoryMode ? false : weatherLoading;
  const displayCrew = isHistoryMode
    ? (selectedHistoryEntry?.crewSnapshot || []).filter(user => user.role === ACCESS_ROLES.PETUGAS)
    : activeShiftGuardSnapshot;
  const infoEntryData = React.useMemo(() => (
    isHistoryMode
      ? selectedHistoryEntry
      : {
          id: 'live-patrol-info',
          isLive: true,
          ship: displayShipName,
          shipSnapshot: displayShip,
          date: displayDate,
          shift: displayShiftLabel,
          time: displayShiftTime,
          weatherSnapshot: displayWeather,
          summary: patrolSummary,
          issue: patrolSummary.temuan,
          missed: patrolSummary.missed,
          crewSnapshot: displayCrew,
        }
  ), [
    isHistoryMode,
    selectedHistoryEntry,
    displayShipName,
    displayShip,
    displayDate,
    displayShiftLabel,
    displayShiftTime,
    displayWeather,
    patrolSummary,
    displayCrew,
  ]);

  React.useEffect(() => {
    if (isHistoryMode) return undefined;
    const intervalId = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [isHistoryMode]);

  const shiftCountdown = React.useMemo(() => {
    if (isHistoryMode || !currentShiftSchedule?.endAt) return null;

    const endTimestamp = new Date(currentShiftSchedule.endAt).getTime();
    if (Number.isNaN(endTimestamp)) return null;

    return formatShiftCountdown(Math.max(0, endTimestamp - countdownNow));
  }, [countdownNow, currentShiftSchedule, isHistoryMode]);

  React.useEffect(() => {
    setSummaryDetailType(null);
  }, [selectedHistoryEntry?.id]);

  const handleOpenSummaryDetail = React.useCallback((type) => {
    setSummaryDetailType(type);
  }, []);

  const handleBackToSummary = React.useCallback(() => {
    setSummaryDetailType(null);
    setPatrolTab('info');
  }, [setPatrolTab]);

  const renderSummaryListItem = React.useCallback((item) => {
    const isTemuan = item.resultType === 'temuan';
    const isMissed = item.status === 'missed' || item.resultType === 'missed';
    const meta = getSummaryCardMeta(isMissed ? 'missed' : isTemuan ? 'temuan' : 'aman');

    return (
      <div
        key={`${item.historyId || 'live'}-${item.id}`}
        onClick={() => handleOpenPatrolResult(item)}
        className={`p-3 border rounded-xl flex items-center justify-between cursor-pointer hover:shadow-lg transition-all ${meta.itemClass}`}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={`font-bold ${meta.itemTextClass}`}>{item.name}</p>
            {item.isTemporaryShiftNode && (
              <span className="text-[9px] uppercase tracking-widest text-yellow-300 border border-yellow-500/40 px-1.5 py-0.5 rounded">
                Tambahan Shift
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-cyan-200/60 mt-1">
            {meta.itemIcon}
            <span className="truncate">
              {isMissed ? `Tidak dipatroli - ${item.time || displayShiftTime || '-'}` : `oleh ${item.completedBy?.split(' ')[0] || '-'} - ${item.time || '-'}`}
            </span>
          </div>
        </div>
        <div
          onClick={(event) => {
            if (!item.photoUrl) return;
            event.stopPropagation();
            setPreviewPhoto({ url: item.photoUrl, author: item.completedBy, time: item.time });
          }}
          className={`w-12 h-12 rounded-lg border overflow-hidden relative flex-shrink-0 bg-[#070b19] ${isMissed ? 'border-rose-500/40' : isTemuan ? 'border-yellow-500/40' : 'border-emerald-500/40'} ${item.photoUrl ? 'cursor-pointer hover:opacity-80' : ''}`}
        >
          {item.photoUrl ? (
            <AsyncImage src={item.photoUrl} className="w-full h-full object-cover" alt="Thumb" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-cyan-700">
              {isMissed ? <CircleOff className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </div>
          )}
        </div>
      </div>
    );
  }, [displayShiftTime, handleOpenPatrolResult, setPreviewPhoto]);

  const renderInfoContent = () => (
    <HistoryDetailView
      isInline={true}
      entryData={infoEntryData}
      onSummaryCardClick={handleOpenSummaryDetail}
    />
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Pane: List and Search */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-in fade-in flex flex-col min-h-full scrollbar-thin scrollbar-thumb-cyan-900/50">
        {summaryDetailType ? (
          <div className="animate-in fade-in flex-1 flex flex-col space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBackToSummary}
                className="w-10 h-10 rounded-xl border border-cyan-700/60 bg-[#0b1229] text-cyan-300 flex items-center justify-center hover:bg-cyan-900/40 transition-colors"
                aria-label="Kembali ke patrol summary"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Patrol Summary</p>
                <h2 className="text-xl font-black text-white">{getSummaryCardMeta(summaryDetailType).title}</h2>
              </div>
            </div>

            <div className="space-y-3 flex-1">
              {summaryDetailItems.length === 0 && (
                <p className="text-xs text-cyan-700 italic border border-dashed border-cyan-900/50 p-4 rounded-xl text-center">
                  Belum ada data {getSummaryCardMeta(summaryDetailType).emptyLabel} untuk patroli ini.
                </p>
              )}
              {summaryDetailItems.map(renderSummaryListItem)}
            </div>
          </div>
        ) : (
          <>
            {isHistoryMode ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeHistoryEntry}
                  className="w-10 h-10 rounded-xl border border-cyan-700/60 bg-[#0b1229] text-cyan-300 flex items-center justify-center hover:bg-cyan-900/40 transition-colors"
                  aria-label="Kembali ke riwayat"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Riwayat Shift</p>
                  <h2 className="text-xl font-black text-white">Info Patroli</h2>
                </div>
              </div>
            ) : (
              <div className="flex bg-[#0b1229] p-1 rounded-xl border border-cyan-800/50 shadow-sm shrink-0">
                <button onClick={() => setPatrolTab('checkpoint')} className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${patrolTab === 'checkpoint' ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 shadow-sm' : 'text-cyan-700 hover:text-cyan-500'}`}>
                  <CheckCircle2 className="w-4 h-4" /> Checkpoint
                </button>
                <button onClick={() => setPatrolTab('info')} className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${patrolTab === 'info' ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 shadow-sm' : 'text-cyan-700 hover:text-cyan-500'}`}>
                  <FileText className="w-4 h-4" /> Info
                </button>
              </div>
            )}

            <div className="lg:hidden">
              {(isHistoryMode || patrolTab === 'info') && renderInfoContent()}
            </div>
            
            <div className="hidden lg:block">
               {patrolTab === 'info' && renderInfoContent()}
            </div>

            {!isHistoryMode && patrolTab === 'checkpoint' && (
              <div className="relative animate-in fade-in flex-1 flex flex-col pb-32 lg:pb-20">
                <div className="sticky top-0 z-30 bg-[#070b19]/95 backdrop-blur-md py-3 -mx-4 px-4 border-b border-cyan-900/50 shadow-sm transition-all duration-300 mb-4">
                  <div className="relative">
                    <input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cari titik Patroli..." className="w-full bg-[#0b1229] border border-cyan-800/80 rounded-xl py-3 pl-10 pr-4 text-sm text-cyan-50 focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.2)] outline-none transition-all" />
                    <Search className="w-4 h-4 text-cyan-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="space-y-3 flex-1">
                  {filteredCheckpoints.length === 0 && (
                    <p className="text-xs text-cyan-700 italic border border-dashed border-cyan-900/50 p-4 rounded-xl text-center">
                      {searchQuery ? `Titik patroli "${searchQuery}" tidak ditemukan.` : 'Belum ada titik patroli yang tersedia.'}
                    </p>
                  )}
                  {filteredCheckpoints.map((item) => {
                    if (item.status === 'completed') return renderSummaryListItem(item);

                    return (
                      <div key={item.id} className="p-3 bg-[#0b1229] border border-cyan-800/50 rounded-xl transition-all hover:border-cyan-500/30">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <p className="font-bold text-white truncate">{item.name}</p>
                            {item.isTemporaryShiftNode && (
                              <span className="shrink-0 text-[9px] uppercase tracking-widest text-yellow-300 border border-yellow-500/40 px-1.5 py-0.5 rounded">
                                Tambahan Shift
                              </span>
                            )}
                          </div>
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

                {canAddTemporaryPatrolNode && (
                  <div className="mt-4 p-4 bg-[#0b1229] border border-yellow-500/20 rounded-xl mb-2">
                    <p className="text-[10px] text-yellow-300 font-bold uppercase tracking-widest mb-1 pl-1">Titik Tambahan Shift</p>
                    <p className="text-xs text-cyan-300/80 mb-3">
                      Tambahkan titik patroli sementara jika lokasi yang Anda cek tidak ada di daftar. Titik ini hanya berlaku untuk kapal ini pada shift berjalan dan tetap masuk riwayat shift.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCustomNode}
                        onChange={event => setNewCustomNode(event.target.value)}
                        placeholder="Nama titik tambahan..."
                        className="flex-1 bg-[#070b19] border border-cyan-800/50 rounded-lg p-2.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none"
                      />
                      <button onClick={handleAddCustomPatrolNode} className="px-4 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-200 rounded-lg transition-colors flex items-center justify-center">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="fixed lg:absolute bottom-[65px] lg:bottom-0 left-0 right-0 z-30 w-full sm:max-w-md lg:max-w-none sm:mx-auto lg:mx-0 bg-[#070b19]/95 backdrop-blur-md px-4 py-4 border-t border-cyan-900/50 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
                  <div className="flex items-stretch gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-2">
                        <span className="text-cyan-500 font-bold uppercase tracking-widest">Progress Patroli</span>
                        <span className="text-cyan-300 font-black">{completedCount}/{totalCount} <span className="font-normal text-[9px]">SELESAI</span></span>
                      </div>
                      <div className="w-full bg-[#0b1229] rounded-full h-2.5 border border-cyan-900/50 overflow-hidden">
                        <div className="bg-gradient-to-r from-cyan-600 via-emerald-500 to-emerald-400 h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(52,211,153,0.5)]" style={{ width: `${progressPercentage}%` }}></div>
                      </div>
                    </div>
                    <div className="shrink-0 min-w-[108px] rounded-xl border border-cyan-500/20 bg-[#0b1229] px-3 py-2 flex flex-col justify-center shadow-[0_0_18px_rgba(8,145,178,0.12)]">
                      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-500">
                        <TimerReset className="w-3.5 h-3.5 text-cyan-400" />
                        Sisa Shift
                      </div>
                      <div className="mt-1 text-right text-base font-black tabular-nums text-cyan-100">
                        {shiftCountdown || '00:00:00'}
                      </div>
                    </div>
                  </div>
                 </div>
               </div>
             )}
           </>
         )}
       </div>

       {/* Right Pane: Detail Component */}
        <div className="hidden lg:block flex-1 border-l border-cyan-900/50 bg-[#070b19] shrink-0 overflow-hidden relative">
          {hasActiveForm && <PatrolFormView isInline={true} />}
          {(!hasActiveForm && selectedReportDetail) && <ReportDetailView isInline={true} />}
          {(!hasActiveForm && !selectedReportDetail && selectedIncident && selectedIncident.isPatrol) && <IncidentDetailView isInline={true} />}
          
          {/* Placeholder when nothing is selected */}
          {!showRightPane && (
            <div className="h-full flex flex-col">
               <div className="p-4 border-b border-cyan-900/50 bg-[#0b1229]/30">
                  <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest">Info Lokasi & Armada</h3>
               </div>
               <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-cyan-900/50">
                  {renderInfoContent()}
               </div>
            </div>
          )}
       </div>
    </div>
  );
});

export default PatrolPage;
