import React from 'react';
import { useApp } from '../../context/AppContext';
import { X, Camera, Send, Lock } from 'lucide-react';
import AsyncImage from '../AsyncImage';

export default function PatrolFormView({ isInline = false }) {
  const { activePatrolItem, activePatrolState, activePatrolId, setActiveForms, handleFormChange, handlePhotoUpload, handleSubmitPatrol, shouldForcePatrolCameraCapture } = useApp();

  if (!activePatrolItem || !activePatrolState) {
    if (isInline) return (
      <div className="h-full flex flex-col items-center justify-center text-cyan-800 p-8 text-center border-2 border-dashed border-cyan-900/30 rounded-3xl m-4">
        <div className="w-16 h-16 rounded-full bg-cyan-900/20 flex items-center justify-center mb-4">
          <Camera className="w-8 h-8 opacity-20" />
        </div>
        <p className="text-sm font-bold uppercase tracking-widest mb-1">Detail Patroli</p>
        <p className="text-xs opacity-60">Pilih titik patroli di sebelah kiri untuk mengisi laporan atau melihat detail.</p>
      </div>
    );
    return null;
  }

  return (
    <div className={`flex flex-col h-full bg-[#0b1229] ${isInline ? 'border-l border-cyan-900/50' : 'max-w-md w-full border rounded-2xl shadow-2xl overflow-hidden' } transition-all ${activePatrolState.type === 'temuan' ? 'border-yellow-500/50 shadow-[0_0_50px_rgba(250,204,21,0.1)]' : 'border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.1)]'}`}>
      <div className="p-4 border-b border-cyan-900/50 flex justify-between items-center bg-[#070b19]">
        <div>
          <span className="text-[10px] uppercase tracking-widest font-bold text-cyan-500">Formulir Patroli</span>
          <h3 className="font-bold text-lg text-white">{activePatrolItem.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-1 border rounded font-bold ${activePatrolState.type === 'temuan' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' : 'bg-emerald-500/10 border-emerald-500 text-emerald-400'}`}>
            {activePatrolState.type === 'temuan' ? 'TEMUAN' : 'AMAN'}
          </span>
          {!isInline && (
            <button onClick={() => setActiveForms({})} className="p-1.5 rounded-full hover:bg-rose-900/50 text-rose-400 transition-colors" aria-label="Tutup"><X className="w-5 h-5"/></button>
          )}
        </div>
      </div>
      
      <div className="p-5 overflow-y-auto flex-1 space-y-4">
        {activePatrolState.type === 'temuan' ? (
          <>
            {!activePatrolState.photoUrl ? (
              <button onClick={() => handlePhotoUpload(activePatrolId, false, { cameraOnly: shouldForcePatrolCameraCapture })} className="w-full py-8 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors border-yellow-500/40 bg-yellow-950/20 text-yellow-400 hover:bg-yellow-900/40">
                <Camera className="w-8 h-8" />
                <span className="text-sm font-bold uppercase tracking-wider">{shouldForcePatrolCameraCapture ? 'Ambil Foto Temuan' : 'Unggah Visual Temuan'}</span>
              </button>
            ) : (
              <div className="w-full aspect-[4/5] bg-[#070b19] rounded-xl border border-cyan-800 overflow-hidden relative">
                <AsyncImage src={activePatrolState.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                <button onClick={() => handleFormChange(activePatrolId, 'photoUrl', null)} className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-lg border border-yellow-500/50 text-white hover:bg-rose-500 transition-colors" aria-label="Hapus foto"><X className="w-4 h-4" /></button>
              </div>
            )}
            <div>
              <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold">Deskripsi Temuan</label>
              <textarea placeholder="Jelaskan detail temuan..." rows={3} value={activePatrolState.kejadian} onChange={(e) => handleFormChange(activePatrolId, 'kejadian', e.target.value)} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-yellow-500 outline-none resize-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold">Penyebab Kejadian</label>
              <textarea placeholder="Apa indikasi penyebabnya..." rows={3} value={activePatrolState.penyebab} onChange={(e) => handleFormChange(activePatrolId, 'penyebab', e.target.value)} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-yellow-500 outline-none resize-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold">Tindak Lanjut</label>
              <textarea placeholder="Tindakan / Update..." rows={3} value={activePatrolState.tindakLanjut} onChange={(e) => handleFormChange(activePatrolId, 'tindakLanjut', e.target.value)} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-emerald-500 outline-none resize-none" />
            </div>
          </>
        ) : (
          !activePatrolState.photoUrl ? (
            <button onClick={() => handlePhotoUpload(activePatrolId, false, { cameraOnly: shouldForcePatrolCameraCapture })} className="w-full py-8 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors border-emerald-500/40 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-900/40">
              <Camera className="w-8 h-8" /> 
              <span className="text-sm font-bold uppercase tracking-wider">{shouldForcePatrolCameraCapture ? 'Ambil Foto Aman' : 'Unggah Visual Aman'}</span>
            </button>
          ) : (
            <div className="w-full aspect-[4/5] bg-[#070b19] rounded-xl border border-cyan-800 overflow-hidden relative">
              <AsyncImage src={activePatrolState.photoUrl} alt="Preview" className="w-full h-full object-cover" />
              <button onClick={() => handleFormChange(activePatrolId, 'photoUrl', null)} className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-lg border border-yellow-500/50 text-white hover:bg-rose-500 transition-colors" aria-label="Hapus foto"><X className="w-4 h-4" /></button>
            </div>
          )
        )}
      </div>
      
      <div className="p-4 bg-[#070b19] border-t border-cyan-900/50">
        <button 
          disabled={!activePatrolState.photoUrl} 
          onClick={() => handleSubmitPatrol(activePatrolItem.id)} 
          className={`w-full py-4 rounded-xl font-black tracking-widest uppercase text-xs flex items-center justify-center gap-2 transition-all ${activePatrolState.photoUrl ? (activePatrolState.type === 'temuan' ? 'bg-yellow-600 hover:bg-yellow-500 text-black shadow-[0_0_15px_rgba(250,204,21,0.3)]' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]') : 'bg-[#0b1229] border border-cyan-900 text-cyan-700 cursor-not-allowed'}`}
        >
          {activePatrolState.photoUrl ? <Send className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          {activePatrolState.photoUrl ? 'Sync Laporan' : 'Butuh Visual'}
        </button>
      </div>
    </div>
  );
}
