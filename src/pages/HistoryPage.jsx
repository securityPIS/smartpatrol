import React from 'react';
import { useApp } from '../context/AppContext';
import { FileText, CalendarDays, Clock, CheckCircle2, AlertTriangle, CircleOff, Check, Trash2 } from 'lucide-react';

const HistoryPage = React.memo(function HistoryPage() {
  const { historyEntries, openHistoryEntry, handleDeleteHistoryEntry, isAdmin } = useApp();

  return (
    <div className="p-4 space-y-4 animate-in fade-in">
      <h2 className="text-xl font-bold text-cyan-50 mb-2">Riwayat Sistem</h2>
      {historyEntries.length === 0 && (
        <div className="p-8 text-center border border-dashed border-cyan-900/50 rounded-xl">
          <FileText className="w-10 h-10 text-cyan-900 mx-auto mb-2" />
          <p className="text-cyan-600 text-sm font-bold uppercase tracking-widest">Belum Ada Riwayat Shift</p>
        </div>
      )}
      {historyEntries.map((data) => (
        <div key={data.id} onClick={() => openHistoryEntry(data.id)} className="bg-[#0b1229] border border-cyan-800/50 rounded-xl p-4 cursor-pointer hover:border-cyan-500/50 transition-colors">
          <div className="flex justify-between items-start mb-3">
            <div className="flex gap-3">
               <div className="w-10 h-10 rounded-lg bg-[#070b19] flex items-center justify-center text-cyan-500 border border-cyan-800"><FileText className="w-5 h-5" /></div>
               <div>
                  <h3 className="font-bold text-cyan-50">{data.ship}</h3>
                  <p className="text-sm text-cyan-500/80 flex items-center gap-1 mt-0.5"><CalendarDays className="w-3 h-3" /> {data.date}</p>
               </div>
            </div>
            <div className="text-right flex items-start gap-2">
              {isAdmin && (
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
              <div className="text-right">
              <span className="inline-block px-2 py-1 bg-[#070b19] text-cyan-400 rounded text-xs font-bold border border-cyan-800">{data.shift}</span>
              <p className="text-[10px] text-cyan-600 mt-1 flex items-center justify-end gap-1"><Clock className="w-3 h-3"/> {data.time}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-cyan-900/50 pt-3">
             <div className="flex-1 bg-[#070b19] p-2 rounded-lg border border-cyan-900/30">
                <p className="text-[10px] text-cyan-600 uppercase font-bold mb-0.5">Status Titik</p>
                <p className="text-xs text-emerald-400 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {data.summary?.completed || 0}/{data.summary?.total || data.points || 0} Selesai</p>
             </div>
             <div className="flex-1 bg-[#070b19] p-2 rounded-lg border border-cyan-900/30">
                <p className="text-[10px] text-cyan-600 uppercase font-bold mb-0.5">Temuan</p>
                {data.issue > 0 ? <p className="text-xs text-yellow-400 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> {data.issue} Temuan</p> : <p className="text-xs text-cyan-400 font-medium flex items-center gap-1"><Check className="w-3 h-3"/> Nihil</p>}
             </div>
             <div className="flex-1 bg-[#070b19] p-2 rounded-lg border border-cyan-900/30">
                <p className="text-[10px] text-cyan-600 uppercase font-bold mb-0.5">Missed</p>
                {data.missed > 0 ? <p className="text-xs text-rose-400 font-medium flex items-center gap-1"><CircleOff className="w-3 h-3"/> {data.missed} Titik</p> : <p className="text-xs text-cyan-400 font-medium flex items-center gap-1"><Check className="w-3 h-3"/> Nihil</p>}
             </div>
          </div>
        </div>
      ))}
    </div>
  );
});

export default HistoryPage;
