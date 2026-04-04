import React from 'react';
import { useApp } from '../../context/AppContext';
import { ChevronDown, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import AsyncImage from '../AsyncImage';

export default function ReportDetailView({ isInline = false }) {
  const { selectedReportDetail, setSelectedReportDetail, setPreviewPhoto, handleDeleteReport } = useApp();

  if (!selectedReportDetail) {
    if (isInline) return (
      <div className="h-full flex flex-col items-center justify-center text-cyan-800 p-8 text-center border-2 border-dashed border-cyan-900/30 rounded-3xl m-4">
        <div className="w-16 h-16 rounded-full bg-cyan-900/20 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 opacity-20" />
        </div>
        <p className="text-sm font-bold uppercase tracking-widest mb-1">Detail Laporan</p>
        <p className="text-xs opacity-60">Pilih salah satu histori laporan untuk melihat detail temuan, bukti visual, dan petugas pelapor.</p>
      </div>
    );
    return null;
  }

  const isMissed = selectedReportDetail.resultType === 'missed' || selectedReportDetail.status === 'missed';
  const isReadOnly = Boolean(selectedReportDetail.readOnly);
  const headerToneClass = isMissed ? 'bg-rose-500/10 border-rose-500 text-rose-400' : selectedReportDetail.resultType === 'temuan' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' : 'bg-emerald-500/10 border-emerald-500 text-emerald-400';

  return (
    <div className={`flex flex-col h-full bg-[#070b19] ${isInline ? 'border-l border-cyan-900/50' : 'fixed inset-0 z-[100] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50'}`}>
      {selectedReportDetail.photoUrl ? (
        <div className="w-full h-64 bg-[#0b1229] relative shrink-0 cursor-pointer group" onClick={() => setPreviewPhoto({url: selectedReportDetail.photoUrl, author: selectedReportDetail.completedBy, time: `${selectedReportDetail.time || '-'} WIB`})}>
           <AsyncImage src={selectedReportDetail.photoUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt="Bukti" />
           <div className="absolute inset-0 bg-gradient-to-b from-[#070b19]/80 via-transparent to-[#070b19]"></div>
           {!isInline && (
             <button onClick={(e) => { e.stopPropagation(); setSelectedReportDetail(null); }} className="absolute top-4 left-4 p-2 bg-black/50 text-white rounded-full backdrop-blur-md border border-white/20 hover:bg-black/70 transition-colors z-10" aria-label="Tutup laporan"><ChevronDown className="w-6 h-6 rotate-90"/></button>
           )}
           {!isReadOnly && (
             <button onClick={(e) => { e.stopPropagation(); handleDeleteReport(selectedReportDetail.id); }} className="absolute top-4 right-4 p-2 bg-rose-500/80 text-white rounded-full backdrop-blur-md border border-rose-500/50 hover:bg-rose-600 transition-colors z-10" aria-label="Hapus laporan"><Trash2 className="w-5 h-5"/></button>
           )}
           <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs text-white/90 text-right border border-cyan-900/50 z-10 shadow-lg"><p className="font-bold text-cyan-400">{selectedReportDetail.completedBy || '-'}</p><p className="text-[10px] text-cyan-100/70">{selectedReportDetail.time || '-'} WIB</p></div>
           <div className="absolute bottom-4 left-4 right-36 z-10">
              <span className={`text-[10px] px-2 py-1 border rounded font-bold mb-2 inline-block shadow-sm ${headerToneClass}`}>{isMissed ? 'MISSED' : selectedReportDetail.resultType === 'temuan' ? 'TEMUAN' : 'AMAN'}</span>
              <span className="text-[10px] px-2 py-1 ml-2 border border-cyan-500/50 rounded font-bold text-cyan-400 bg-cyan-900/40 inline-block shadow-sm">{isReadOnly ? 'Riwayat Shift' : 'Laporan Titik'}</span>
              <h2 className="text-2xl font-black text-white drop-shadow-md leading-tight line-clamp-2 mt-1">{selectedReportDetail.name}</h2>
           </div>
        </div>
      ) : (
        <div className="p-4 border-b border-cyan-900/50 flex items-center justify-between gap-3 bg-[#0b1229] shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            {!isInline && (
              <button onClick={() => setSelectedReportDetail(null)} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Tutup laporan"><ChevronDown className="w-5 h-5 rotate-90"/></button>
            )}
            <div>
              <span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">{isReadOnly ? 'Riwayat Shift' : 'Laporan Titik'}</span>
              <h3 className="font-bold text-xl text-cyan-50 line-clamp-1">{selectedReportDetail.name}</h3>
            </div>
          </div>
          {!isReadOnly && (
            <button onClick={() => handleDeleteReport(selectedReportDetail.id)} className="p-2 bg-rose-500/10 text-rose-500 border border-rose-500/30 rounded-lg hover:bg-rose-500 hover:text-white transition-colors flex items-center gap-2" aria-label="Hapus laporan"><Trash2 className="w-4 h-4"/></button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
         <div className="grid grid-cols-2 gap-3">
           <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50 shadow-sm"><p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">{isMissed ? 'Status' : 'Inspektur'}</p><p className="text-sm font-bold text-cyan-50 truncate">{isMissed ? 'Missed Patrol' : (selectedReportDetail.completedBy || '-')}</p></div>
           <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50 shadow-sm">
             <p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">{isReadOnly ? 'Shift' : 'Waktu Sync'}</p>
             {isReadOnly && selectedReportDetail.date ? (
               <p className="text-sm font-bold text-cyan-50">
                 <span className="block">{selectedReportDetail.date}</span>
                 <span className="block">{selectedReportDetail.time || '-'}</span>
               </p>
             ) : (
               <p className="text-sm font-bold text-cyan-50">{selectedReportDetail.time || '-'} WIB</p>
             )}
           </div>
         </div>
         {isMissed ? (
           <div className="bg-rose-950/20 p-4 rounded-xl border border-rose-900/30">
             <p className="text-[10px] text-rose-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><AlertTriangle className="w-3 h-3" /> Keterangan</p>
             <p className="text-sm text-rose-50/90 leading-relaxed">{selectedReportDetail.kejadian || 'Titik ini tidak dipatroli pada shift tersebut.'}</p>
           </div>
         ) : selectedReportDetail.resultType === 'temuan' && (
           <div className="space-y-3">
             <div className="bg-yellow-950/20 p-4 rounded-xl border border-yellow-900/30"><p className="text-[10px] text-yellow-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><AlertTriangle className="w-3 h-3" /> Deskripsi</p><p className="text-sm text-yellow-50/90 leading-relaxed">{selectedReportDetail.kejadian || '-'}</p></div>
             <div className="bg-yellow-950/20 p-4 rounded-xl border border-yellow-900/30"><p className="text-[10px] text-yellow-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><AlertTriangle className="w-3 h-3" /> Penyebab</p><p className="text-sm text-yellow-50/90 leading-relaxed">{selectedReportDetail.penyebab || '-'}</p></div>
             <div className="bg-emerald-950/20 p-4 rounded-xl border border-emerald-900/30"><p className="text-[10px] text-emerald-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><CheckCircle2 className="w-3 h-3" /> Tindak Lanjut</p><p className="text-sm text-emerald-50/90 leading-relaxed">{selectedReportDetail.tindakLanjut || '-'}</p></div>
           </div>
         )}
         {selectedReportDetail.resultType === 'aman' && (
           <div className="bg-emerald-950/20 p-4 rounded-xl border border-emerald-900/30">
             <p className="text-[10px] text-emerald-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><CheckCircle2 className="w-3 h-3" /> Catatan</p>
             <p className="text-sm text-emerald-50/90 leading-relaxed">{selectedReportDetail.kejadian || 'Checkpoint dilaporkan dalam kondisi aman.'}</p>
           </div>
         )}
      </div>
    </div>
  );
}
