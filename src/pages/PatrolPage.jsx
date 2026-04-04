import React from 'react';
import { useApp } from '../context/AppContext';
import {
  CheckCircle2, AlertTriangle, Search, Plus, Ship, MapPin, ExternalLink, ArrowLeft,
  CalendarDays, User, Thermometer, Wind, FileText, CircleOff,
} from 'lucide-react';
import AsyncImage from '../components/AsyncImage';

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

const PatrolPage = React.memo(function PatrolPage() {
  const [summaryDetailType, setSummaryDetailType] = React.useState(null);
  const {
    patrolTab, setPatrolTab, searchQuery, setSearchQuery, filteredCheckpoints,
    handleActionClick, handleOpenPatrolResult, handleAddCustomPatrolNode,
    newCustomNode, setNewCustomNode, completedCount, totalCount, progressPercentage,
    operationalShip, operationalShipName, usersData, checkpoints,
    weatherInfo, weatherLoading, getWeatherDetail, setPreviewPhoto,
    currentShiftMeta, selectedHistoryEntry, closeHistoryEntry,
  } = useApp();

  const isHistoryMode = Boolean(selectedHistoryEntry);
  const activeCheckpoints = isHistoryMode ? (selectedHistoryEntry?.checkpoints || []) : checkpoints;
  const patrolSummary = React.useMemo(() => getPatrolSummary(activeCheckpoints), [activeCheckpoints]);
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
    ? (selectedHistoryEntry?.crewSnapshot || [])
    : usersData.filter(user => user.shipAssigned === operationalShipName && user.status === 'active');

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
    <div className="animate-in fade-in space-y-6 pt-2">
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className="text-sm text-cyan-400 mb-1 flex items-center gap-1 font-medium"><Ship className="w-4 h-4" /> Laporan Patroli</p>
          <h2 className="text-2xl font-bold text-white tracking-wide mb-1">{displayShip?.name || displayShipName || 'Belum Ada Kapal'}</h2>
          <div className="text-[11px] text-cyan-200 mt-1 flex items-center gap-2 flex-wrap bg-[#070b19]/50 inline-flex px-2 py-1 rounded-md border border-cyan-900">
            <a href={`https://maps.google.com/?q=${displayShip?.lat || '-6.1021'},${displayShip?.lng || '106.8833'}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-cyan-300 transition-colors group">
              <MapPin className="w-3 h-3 text-cyan-400 group-hover:animate-bounce" />
              <span className="underline underline-offset-2 decoration-cyan-800 group-hover:decoration-cyan-400">{displayShip?.lat || '-6.1021'}, {displayShip?.lng || '106.8833'}</span>
              <ExternalLink className="w-2.5 h-2.5 text-cyan-600 group-hover:text-cyan-300 ml-0.5" />
            </a>
            <span className="text-cyan-700">|</span>
            <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3 text-cyan-400" /> {displayDate}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="inline-block px-3 py-1 bg-cyan-900/50 text-cyan-300 rounded-lg text-sm font-bold border border-cyan-700">{displayShiftLabel}</span>
          <p className="text-xs text-cyan-500 mt-1">{displayShiftTime}</p>
        </div>
      </div>

      <div className="w-full h-44 rounded-2xl overflow-hidden border border-cyan-800/50 relative shadow-lg">
        <iframe width="100%" height="100%" frameBorder="0" scrolling="no" marginHeight="0" marginWidth="0" src={`https://maps.google.com/maps?q=${displayShip?.lat || '-6.1021'},${displayShip?.lng || '106.8833'}&hl=id&z=14&output=embed`} title="Map Location"></iframe>
      </div>

      <div className="bg-[#0b1229] rounded-2xl p-4 border border-cyan-800/50 flex items-center justify-between relative shadow-sm">
        {displayWeatherLoading ? (
          <p className="text-xs text-cyan-500 animate-pulse w-full text-center">Scanning Atmosphere...</p>
        ) : displayWeather ? (
          <>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-900/20 rounded-xl">{getWeatherDetail(displayWeather.weathercode).icon}</div>
              <div className="flex flex-col">
                <span className="text-[10px] text-cyan-500 font-medium uppercase tracking-wider">Kondisi</span>
                <span className="text-sm font-bold text-cyan-50">{getWeatherDetail(displayWeather.weathercode).text}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-cyan-500 flex items-center gap-1 uppercase tracking-wider"><Thermometer className="w-3 h-3 text-rose-400" /> Temp</span>
                <span className="text-sm font-bold text-cyan-50">{displayWeather.temperature}°C</span>
              </div>
              <div className="w-px h-6 bg-cyan-800"></div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] text-cyan-500 flex items-center gap-1 uppercase tracking-wider"><Wind className="w-3 h-3 text-emerald-400" /> Wind</span>
                <span className="text-sm font-bold text-cyan-50">{displayWeather.windspeed} k/j</span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-cyan-500 w-full text-center">Data cuaca tidak tersedia.</p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest pl-1">Patrol Summary</h3>
            <p className="text-xs text-cyan-600 mt-1 pl-1">Ringkasan hasil checkpoint pada shift ini.</p>
          </div>
          <div className="text-right bg-[#0b1229] px-3 py-2 rounded-xl border border-cyan-800/50 shadow-sm">
            <p className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Selesai</p>
            <p className="text-lg font-black text-cyan-50">{patrolSummary.completed}</p>
          </div>
        </div>

        <div className="space-y-3">
          {summaryCards.map((card) => {
            const meta = getSummaryCardMeta(card.type);
            return (
              <button
                key={card.type}
                type="button"
                onClick={() => handleOpenSummaryDetail(card.type)}
                className={`w-full text-left border rounded-2xl p-4 shadow-sm hover:-translate-y-0.5 transition-all ${meta.cardClass}`}
              >
                <div className="flex items-center gap-4">
                  <p className={`text-3xl font-black min-w-8 ${meta.countClass}`}>{card.count}</p>
                  <p className={`text-sm font-bold flex-1 ${meta.labelClass}`}>{meta.title}</p>
                  <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${meta.iconWrapClass}`}>
                    {meta.icon}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-1 pl-1">
          {isHistoryMode ? 'Petugas Tercatat' : 'Petugas Jaga Aktif'}
        </h3>
        {displayCrew.length === 0 && (
          <p className="text-xs text-cyan-700 italic border border-dashed border-cyan-900/50 p-4 rounded-xl text-center">
            Belum ada data petugas untuk shift ini.
          </p>
        )}
        {displayCrew.map((user) => {
          const completedPoints = activeCheckpoints.filter(cp => cp.status === 'completed' && cp.completedBy === user.name).length;
          return (
            <div key={user.id} className="bg-[#0b1229] rounded-2xl p-3 border border-cyan-800/50 flex items-center justify-between shadow-sm hover:border-cyan-500/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#070b19] border border-cyan-700/50 overflow-hidden shrink-0">
                  {user.photoUrl ? <AsyncImage src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-cyan-500"><User className="w-6 h-6" /></div>}
                </div>
                <div>
                  <p className="text-sm font-bold text-cyan-50">{user.name}</p>
                  <p className="text-[10px] text-cyan-500 uppercase font-bold tracking-tight">{user.role}</p>
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
  );

  return (
    <div className="p-4 space-y-4 animate-in fade-in flex flex-col min-h-full">
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

          {(isHistoryMode || patrolTab === 'info') && renderInfoContent()}

          {!isHistoryMode && patrolTab === 'checkpoint' && (
            <div className="relative animate-in fade-in flex-1 flex flex-col pb-32">
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

              <div className="mt-4 p-4 bg-[#0b1229] border border-cyan-800 border-dashed rounded-xl mb-6">
                <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest mb-2 pl-1">Titik Patroli Tambahan</p>
                <div className="flex gap-2">
                  <input type="text" value={newCustomNode} onChange={event => setNewCustomNode(event.target.value)} placeholder="Nama Lokasi Ekstra..." className="flex-1 bg-[#070b19] border border-cyan-800/50 rounded-lg p-2.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
                  <button onClick={handleAddCustomPatrolNode} className="px-4 bg-cyan-900/50 hover:bg-cyan-600 border border-cyan-700 text-cyan-300 hover:text-white rounded-lg transition-colors flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="fixed bottom-[65px] left-0 right-0 z-30 w-full sm:max-w-md sm:mx-auto bg-[#070b19]/95 backdrop-blur-md px-4 py-4 border-t border-cyan-900/50 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-cyan-500 font-bold uppercase tracking-widest">Progres Shift</span>
                  <span className="text-cyan-300 font-black">{completedCount}/{totalCount} <span className="font-normal text-[9px]">SELESAI</span></span>
                </div>
                <div className="w-full bg-[#0b1229] rounded-full h-3 border border-cyan-900/50 overflow-hidden">
                  <div className="bg-gradient-to-r from-cyan-600 via-emerald-500 to-emerald-400 h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(52,211,153,0.5)]" style={{ width: `${progressPercentage}%` }}></div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default PatrolPage;
