import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ModalShell } from '../ui';
import { CalendarClock, Infinity, UserCheck } from 'lucide-react';

export default function AssignDueDatePopup() {
  const { showAssignPopup, setShowAssignPopup, assignPopupData, handleConfirmAssign } = useApp();
  const [endDate, setEndDate] = useState('');
  
  if (!showAssignPopup || !assignPopupData) return null;

  const handleTBC = () => {
    handleConfirmAssign(assignPopupData.userId, '', true);
  };

  const handleConfirmDate = () => {
    if (!endDate) {
      window.alert('Silakan pilih tanggal berakhir atau gunakan opsi TBC.');
      return;
    }
    handleConfirmAssign(assignPopupData.userId, endDate, false);
  };

  return (
    <ModalShell
      title="Assign Petugas"
      subtitle="Tentukan batas penugasan (onduty)"
      onClose={() => setShowAssignPopup(false)}
      maxWidth="max-w-lg"
    >
      <div className="grid gap-5">
        <div className="bg-[#0b1229] border border-cyan-800/50 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-100">{assignPopupData.name}</p>
            <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">{assignPopupData.role}</p>
          </div>
          <div className="bg-cyan-900/30 w-10 h-10 rounded-full flex items-center justify-center border border-cyan-700">
            <UserCheck className="w-5 h-5 text-cyan-400" />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest block mb-2">Tanggal Berakhir Penugasan</label>
          <div className="relative">
            <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500" />
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl py-3 pl-10 pr-4 text-sm text-cyan-50 focus:border-cyan-400 outline-none transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 py-1">
          <div className="h-px bg-cyan-900/50 flex-1"></div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">ATAU</span>
          <div className="h-px bg-cyan-900/50 flex-1"></div>
        </div>

        <button 
          onClick={handleTBC}
          className="w-full relative overflow-hidden group bg-cyan-950/20 border border-cyan-800 hover:border-cyan-400 rounded-xl p-4 transition-colors text-left"
        >
          <div className="flex items-center gap-3 relative z-10">
            <div className="bg-cyan-900/50 p-2 rounded-lg text-cyan-400 group-hover:bg-cyan-400 group-hover:text-cyan-950 transition-colors">
              <Infinity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-cyan-100">Set sebagai TBC</p>
              <p className="text-[10px] text-cyan-500 mt-0.5">Petugas akan onduty tanpa batas waktu</p>
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-900/0 via-cyan-900/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
        </button>

        <div className="flex gap-3 pt-2">
          <button 
            onClick={() => setShowAssignPopup(false)}
            className="flex-1 py-3 bg-[#0b1229] border border-slate-700 hover:border-slate-500 text-slate-300 rounded-xl text-xs font-bold tracking-widest uppercase transition-colors"
          >
            Batal
          </button>
          <button 
            onClick={handleConfirmDate}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold tracking-widest uppercase transition-colors shadow-[0_0_15px_rgba(16,185,129,0.2)]"
          >
            Konfirmasi Tanggal
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
