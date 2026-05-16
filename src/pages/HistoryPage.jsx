/*
Tujuan: Menampilkan riwayat patroli dan shift aktif agar admin bisa memonitor progres secara cepat.
Caller: App shell saat user membuka halaman riwayat.
Dependensi: History context, reports context, incidents context, dan HistoryDetailView.
Main Functions: Menyaring daftar riwayat, menonjolkan entry ON GOING, dan membuka detail ringkasan patroli.
Side Effects: Mengubah selected history, membuka detail laporan/temuan, dan menghapus riwayat arsip bila diizinkan.
*/

import React, { useEffect, useMemo, useState } from 'react';
import { useHistory, useIncidents, useReports, useRole } from '../context/AppContextRuntime';
import { FileText, CalendarDays, Clock, CheckCircle2, AlertTriangle, CircleOff, Check, Trash2, ArrowLeft, Ship, Filter, FilterX } from 'lucide-react';
import HistoryDetailView from '../components/views/HistoryDetailView';
import ReportDetailView from '../components/views/ReportDetailView';
import IncidentDetailView from '../components/views/IncidentDetailView';
import AsyncImage from '../components/AsyncImage';

export default function HistoryPage() {
  const { historyEntries, closeHistoryEntry, handleDeleteHistoryEntry, selectedHistoryEntry, setSelectedHistoryId, handleOpenPatrolResult } = useHistory();
  const { isAdmin } = useRole();
  const { selectedReportDetail, setSelectedReportDetail, setPreviewPhoto } = useReports();
  const { selectedIncident, setSelectedIncident } = useIncidents();
  const [summaryDetailType, setSummaryDetailType] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [shipFilter, setShipFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  const shipOptions = useMemo(() => (
    Array.from(new Set(historyEntries.map(entry => entry.ship).filter(Boolean))).sort((left, right) => left.localeCompare(right))
  ), [historyEntries]);
  const shiftOptions = useMemo(() => (
    Array.from(
      new Set(
        historyEntries
          .map(entry => entry.shift)
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right))
  ), [historyEntries]);

  const filteredHistoryEntries = useMemo(() => historyEntries.filter((entry) => {
    const entryDateKey = String(entry.dateKey || '');
    if (shipFilter && entry.ship !== shipFilter) return false;
    if (shiftFilter && entry.shift !== shiftFilter) return false;
    if (startDateFilter && entryDateKey && entryDateKey < startDateFilter) return false;
    if (endDateFilter && entryDateKey && entryDateKey > endDateFilter) return false;
    return true;
  }), [endDateFilter, historyEntries, shipFilter, shiftFilter, startDateFilter]);

  const hasActiveFilter = Boolean(shipFilter || shiftFilter || startDateFilter || endDateFilter);
  const showMobileDetail = Boolean(selectedHistoryEntry);

  const handleEntryClick = (id) => {
    setSelectedHistoryId(id);
  };

  useEffect(() => {
    setSummaryDetailType(null);
    setSelectedReportDetail(null);
    setSelectedIncident(null);
  }, [selectedHistoryEntry?.id, setSelectedIncident, setSelectedReportDetail]);

  useEffect(() => {
    if (!selectedHistoryEntry?.id) return;
    if (filteredHistoryEntries.some(entry => entry.id === selectedHistoryEntry.id)) return;
    setSelectedHistoryId(null);
  }, [filteredHistoryEntries, selectedHistoryEntry?.id, setSelectedHistoryId]);

  const summaryDetailItems = useMemo(() => {
    if (!selectedHistoryEntry || !summaryDetailType) return [];
    return (selectedHistoryEntry.checkpoints || []).filter((item) => {
      if (summaryDetailType === 'missed') return item.status === 'missed' || item.resultType === 'missed';
      return item.status === 'completed' && item.resultType === summaryDetailType;
    });
  }, [selectedHistoryEntry, summaryDetailType]);

  const getSummaryMeta = (type) => {
    if (type === 'aman') {
      return {
        title: 'Kondisi Normal',
        itemClass: 'bg-emerald-950/20 border-emerald-500/30',
        itemTextClass: 'text-emerald-400',
        itemIcon: <CheckCircle2 className="w-3 h-3 text-emerald-500" />,
        emptyLabel: 'kondisi normal',
      };
    }
    if (type === 'temuan') {
      return {
        title: 'Kondisi Temuan',
        itemClass: 'bg-yellow-950/20 border-yellow-500/30',
        itemTextClass: 'text-yellow-400',
        itemIcon: <AlertTriangle className="w-3 h-3 text-yellow-500" />,
        emptyLabel: 'temuan',
      };
    }
    return {
      title: 'Status Missed',
      itemClass: 'bg-rose-950/20 border-rose-500/30',
      itemTextClass: 'text-rose-400',
      itemIcon: <CircleOff className="w-3 h-3 text-rose-500" />,
      emptyLabel: 'status missed',
    };
  };

  const handleOpenSummaryDetail = (type) => {
    setSelectedReportDetail(null);
    setSelectedIncident(null);
    setSummaryDetailType(type);
  };

  const handleBackToHistorySummary = () => {
    setSelectedReportDetail(null);
    setSelectedIncident(null);
    setSummaryDetailType(null);
  };

  const renderSummaryListItem = (item) => {
    const isTemuan = item.resultType === 'temuan';
    const isMissed = item.status === 'missed' || item.resultType === 'missed';
    const meta = getSummaryMeta(isMissed ? 'missed' : isTemuan ? 'temuan' : 'aman');

    return (
      <div
        key={`${item.historyId || 'history'}-${item.id}`}
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
              {isMissed ? `Tidak dipatroli - ${item.time || '-'}` : `oleh ${item.completedBy?.split(' ')[0] || '-'} - ${item.time || '-'}`}
            </span>
          </div>
        </div>
        <div
          onClick={(event) => {
            if (!item.photoUrl) return;
            event.stopPropagation();
            setPreviewPhoto({ url: item.photoUrl, author: item.completedBy, time: `${selectedHistoryEntry?.date || '-'} ${item.time || '-'}` });
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
  };

  const renderRightPane = () => {
    if (selectedIncident?.readOnly) {
      return (
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-cyan-900/50 bg-[#0b1229] flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedIncident(null)}
              className="w-10 h-10 rounded-xl border border-cyan-700/60 bg-[#070b19] text-cyan-300 flex items-center justify-center hover:bg-cyan-900/40 transition-colors"
              aria-label="Kembali ke patrol summary"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Riwayat Shift</p>
              <h3 className="text-lg font-black text-white">Detail Temuan</h3>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <IncidentDetailView isInline={true} />
          </div>
        </div>
      );
    }

    if (selectedReportDetail?.readOnly) {
      return (
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-cyan-900/50 bg-[#0b1229] flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedReportDetail(null)}
              className="w-10 h-10 rounded-xl border border-cyan-700/60 bg-[#070b19] text-cyan-300 flex items-center justify-center hover:bg-cyan-900/40 transition-colors"
              aria-label="Kembali ke patrol summary"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Riwayat Shift</p>
              <h3 className="text-lg font-black text-white">Detail Laporan</h3>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <ReportDetailView isInline={true} />
          </div>
        </div>
      );
    }

    if (summaryDetailType) {
      return (
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-cyan-900/50 bg-[#0b1229] flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToHistorySummary}
              className="w-10 h-10 rounded-xl border border-cyan-700/60 bg-[#070b19] text-cyan-300 flex items-center justify-center hover:bg-cyan-900/40 transition-colors"
              aria-label="Kembali ke ringkasan riwayat"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Patrol Summary</p>
              <h3 className="text-lg font-black text-white">{getSummaryMeta(summaryDetailType).title}</h3>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-cyan-900/50">
            {summaryDetailItems.length === 0 && (
              <p className="text-xs text-cyan-700 italic border border-dashed border-cyan-900/50 p-4 rounded-xl text-center">
                Belum ada data {getSummaryMeta(summaryDetailType).emptyLabel} untuk riwayat ini.
              </p>
            )}
            {summaryDetailItems.map(renderSummaryListItem)}
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col">
        {selectedHistoryEntry && (
          <div className="p-4 border-b border-cyan-900/50 bg-[#0b1229] flex items-center gap-3">
            <button
              type="button"
              onClick={closeHistoryEntry}
              className="w-10 h-10 rounded-xl border border-cyan-700/60 bg-[#070b19] text-cyan-300 flex items-center justify-center hover:bg-cyan-900/40 transition-colors"
              aria-label="Kembali ke daftar riwayat"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Riwayat Shift</p>
              <h3 className="text-lg font-black text-white">Detail Ringkasan</h3>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <HistoryDetailView isInline={true} onSummaryCardClick={handleOpenSummaryDetail} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden animate-in fade-in">
      {/* Left Pane: List */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-4 lg:border-r lg:border-cyan-900/50 ${showMobileDetail ? 'hidden lg:block' : ''}`}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-xl font-bold text-cyan-50">Riwayat Sistem</h2>
          <button
            type="button"
            onClick={() => setShowFilters(previousValue => !previousValue)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 ${
              showFilters || hasActiveFilter
                ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200'
                : 'border-cyan-800/60 text-cyan-400 hover:bg-cyan-900/30'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>
        {showFilters && (
          <div className="bg-[#0b1229] border border-cyan-800/50 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest mb-1.5 block">Nama Kapal</label>
                <div className="relative">
                  <select value={shipFilter} onChange={(event) => setShipFilter(event.target.value)} className="w-full appearance-none bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 pl-10 text-sm text-cyan-50 focus:border-cyan-400 outline-none">
                    <option value="">Semua Kapal</option>
                    {shipOptions.map((shipName) => (
                      <option key={shipName} value={shipName}>{shipName}</option>
                    ))}
                  </select>
                  <Ship className="w-4 h-4 text-cyan-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest mb-1.5 block">Shift</label>
                <div className="relative">
                  <select value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)} className="w-full appearance-none bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 pl-10 text-sm text-cyan-50 focus:border-cyan-400 outline-none">
                    <option value="">Semua Shift</option>
                    {shiftOptions.map((shiftName) => (
                      <option key={shiftName} value={shiftName}>{shiftName}</option>
                    ))}
                  </select>
                  <Clock className="w-4 h-4 text-cyan-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest mb-1.5 block">Dari Tanggal</label>
                <input type="date" value={startDateFilter} onChange={(event) => setStartDateFilter(event.target.value)} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest mb-1.5 block">Sampai Tanggal</label>
                <input type="date" value={endDateFilter} onChange={(event) => setEndDateFilter(event.target.value)} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
              </div>
              <div className="flex items-end lg:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setShipFilter('');
                    setShiftFilter('');
                    setStartDateFilter('');
                    setEndDateFilter('');
                  }}
                  className="w-full lg:w-auto px-4 py-3 rounded-xl border border-cyan-700/60 text-cyan-300 hover:bg-cyan-900/30 transition-colors flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest"
                >
                  <FilterX className="w-4 h-4" />
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}
        {filteredHistoryEntries.length === 0 && (
          <div className="p-8 text-center border border-dashed border-cyan-900/50 rounded-xl">
            <FileText className="w-10 h-10 text-cyan-900 mx-auto mb-2" />
            <p className="text-cyan-600 text-sm font-bold uppercase tracking-widest">{hasActiveFilter ? 'Riwayat Tidak Ditemukan' : 'Belum Ada Riwayat Shift'}</p>
            {hasActiveFilter && (
              <p className="text-xs text-cyan-700 mt-2">Ubah filter nama kapal atau rentang tanggal untuk melihat data lain.</p>
            )}
          </div>
        )}
        {filteredHistoryEntries.map((data) => {
          const isLiveEntry = Boolean(data.isLive);
          const isSelectedEntry = selectedHistoryEntry?.id === data.id;
          const cardClassName = isLiveEntry
            ? (isSelectedEntry
              ? 'border-emerald-400 ring-1 ring-emerald-400/30 shadow-[0_0_18px_rgba(16,185,129,0.18)] bg-emerald-500/10'
              : 'border-emerald-700/60 bg-emerald-950/20 hover:border-emerald-500/60 hover:shadow-[0_0_22px_rgba(16,185,129,0.14)]')
            : (isSelectedEntry
              ? 'border-cyan-400 ring-1 ring-cyan-400/30 shadow-[0_0_15px_rgba(34,211,238,0.15)] bg-[#0f1734]'
              : 'border-cyan-800/50 hover:border-cyan-500/50 hover:shadow-[0_0_20px_rgba(6,182,212,0.1)]');
          const summary = data.summary || {};
          const totalCount = summary.total || 0;
          const amanCount = summary.aman || 0;
          const temuanCount = summary.temuan ?? data.issue ?? 0;
          const statusCount = isLiveEntry
            ? (summary.pending ?? data.pending ?? 0)
            : (summary.missed ?? data.missed ?? 0);
          const completionCount = amanCount + temuanCount;
          const completionBoxClassName = isLiveEntry
            ? (isSelectedEntry
              ? 'bg-emerald-400 text-[#052e1d] border-emerald-300'
              : 'bg-emerald-500/10 text-emerald-200 border-emerald-700/60')
            : (isSelectedEntry
              ? 'bg-cyan-500 text-[#070b19] border-cyan-400'
              : 'bg-[#070b19] text-cyan-300 border-cyan-800');
          const badgeClassName = isLiveEntry
            ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-400/40'
            : 'bg-[#070b19] text-cyan-400 border border-cyan-800';

          return (
          <div 
            key={data.id} 
            onClick={() => handleEntryClick(data.id)} 
            className={`border rounded-xl p-4 cursor-pointer transition-all ${cardClassName}`}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex gap-3 min-w-0">
                <div className={`w-16 aspect-square rounded-lg flex items-center justify-center border transition-colors shrink-0 ${completionBoxClassName}`}>
                  <p className="text-sm font-black leading-none tabular-nums">{completionCount}/{totalCount}</p>
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-cyan-50">{data.ship}</h3>
                      {isLiveEntry && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] bg-emerald-400/15 text-emerald-200 border border-emerald-400/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                          ON GOING
                        </span>
                      )}
                    </div>
                    <p className={`text-sm flex items-center gap-1 mt-0.5 ${isLiveEntry ? 'text-emerald-200/80' : 'text-cyan-500/80'}`}><CalendarDays className="w-3 h-3" /> {data.date || '-'}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${badgeClassName}`}>{data.shift}</span>
                  {isAdmin && !isLiveEntry && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteHistoryEntry(data.id);
                      }}
                      className="p-2 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors"
                      aria-label="Hapus riwayat patroli"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-cyan-600 mt-1 flex items-center justify-end gap-1"><Clock className="w-3 h-3"/> {data.time}</p>
              </div>
            </div>
            <div className={`grid grid-cols-3 gap-2 pt-3 opacity-80 group-hover:opacity-100 ${isLiveEntry ? 'border-t border-emerald-900/40' : 'border-t border-cyan-900/50'}`}>
              <div className={`flex-1 p-2 rounded-lg border ${isLiveEntry ? 'bg-emerald-950/20 border-emerald-800/30' : 'bg-[#070b19] border-cyan-900/30'}`}>
                  <p className="text-[10px] text-cyan-600 uppercase font-bold mb-0.5">Aman</p>
                  <p className="text-xs text-emerald-400 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {amanCount} Aman</p>
              </div>
              <div className={`flex-1 p-2 rounded-lg border ${isLiveEntry ? 'bg-emerald-950/20 border-emerald-800/30' : 'bg-[#070b19] border-cyan-900/30'}`}>
                  <p className="text-[10px] text-cyan-600 uppercase font-bold mb-0.5">Temuan</p>
                  {temuanCount > 0 ? <p className="text-xs text-yellow-400 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> {temuanCount} Temuan</p> : <p className="text-xs text-cyan-400 font-medium flex items-center gap-1"><Check className="w-3 h-3"/> Nihil</p>}
              </div>
              <div className={`flex-1 p-2 rounded-lg border ${isLiveEntry ? 'bg-emerald-950/20 border-emerald-800/30' : 'bg-[#070b19] border-cyan-900/30'}`}>
                  <p className="text-[10px] text-cyan-600 uppercase font-bold mb-0.5">{isLiveEntry ? 'Pending' : 'Missed'}</p>
                  {statusCount > 0 ? <p className={`text-xs font-medium flex items-center gap-1 ${isLiveEntry ? 'text-slate-300' : 'text-rose-400'}`}>{isLiveEntry ? <Clock className="w-3 h-3"/> : <CircleOff className="w-3 h-3"/>} {statusCount} Titik</p> : <p className="text-xs text-cyan-400 font-medium flex items-center gap-1"><Check className="w-3 h-3"/> Nihil</p>}
              </div>
            </div>
          </div>
        )})}
      </div>

      {/* Right Pane: Detail View */}
      <div className={`${showMobileDetail ? 'block' : 'hidden'} lg:block flex-1 bg-[#070b19] overflow-hidden relative`}>
        {renderRightPane()}
      </div>
    </div>
  );
}
