import React from 'react';
import { useApp } from '../../context/AppContext';
import { ChevronDown, AlertTriangle, CheckCircle2, Camera, X, Plus, FileText, ImageIcon } from 'lucide-react';
import AsyncImage from '../AsyncImage';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export default function IncidentDetailModal() {
  const { selectedIncident, setSelectedIncident, incidentMeta, canManageIncident, canCloseIncident, handleAddProgress, handleCloseIncident, newProgress, setNewProgress, handlePhotoProgress, setPreviewPhoto } = useApp();
  const modalRef = useFocusTrap(!!selectedIncident);
  if (!selectedIncident) return null;
  const isReadOnly = Boolean(selectedIncident.readOnly);

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 flex flex-col animate-in slide-in-from-right-4">
      {selectedIncident.photoUrl ? (
        <div className="w-full h-64 bg-[#0b1229] relative shrink-0 cursor-pointer group" onClick={() => setPreviewPhoto({url: selectedIncident.photoUrl, author: selectedIncident.reportedBy, time: `${selectedIncident.date} ${selectedIncident.time}`})}>
           <AsyncImage src={selectedIncident.photoUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt="Bukti" />
           <div className="absolute inset-0 bg-gradient-to-b from-[#070b19]/80 via-transparent to-[#070b19]"></div>
           <button onClick={(e) => { e.stopPropagation(); setSelectedIncident(null); }} className="absolute top-4 left-4 p-2 bg-black/50 text-white rounded-full backdrop-blur-md border border-white/20 hover:bg-black/70 transition-colors z-10" aria-label="Tutup detail"><ChevronDown className="w-6 h-6 rotate-90"/></button>
           <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs text-white/90 text-right border border-yellow-900/50 z-10 shadow-lg"><p className="font-bold text-yellow-400">{selectedIncident.reportedBy}</p><p className="text-[10px] text-yellow-100/70">{selectedIncident.date} {selectedIncident.time}</p></div>
           <div className="absolute bottom-4 left-4 right-36 z-10"><span className="text-[10px] px-2 py-1 border rounded font-bold bg-yellow-500/10 border-yellow-500 text-yellow-400 mb-2 inline-block shadow-sm">TEMUAN</span><h2 className="text-2xl font-black text-white drop-shadow-md leading-tight line-clamp-2">{selectedIncident.location}</h2></div>
        </div>
      ) : (
        <div className="p-4 border-b border-yellow-500/30 flex items-center gap-3 bg-[#0b1229] shrink-0 shadow-sm">
           <button onClick={() => setSelectedIncident(null)} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Tutup detail"><ChevronDown className="w-5 h-5 rotate-90"/></button>
           <div><span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Detail Temuan</span><h3 className="font-bold text-xl text-yellow-400 line-clamp-1">{selectedIncident.location}</h3></div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
         <div className="flex justify-between items-center bg-[#0b1229] p-3 rounded-xl border border-cyan-900/50 shadow-sm">
           <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Status</span>
           {incidentMeta[selectedIncident.id]?.status === 'closed' ? <span className="text-[10px] px-3 py-1.5 border rounded font-black bg-slate-800 border-slate-600 text-slate-400 tracking-widest">CLOSED</span> : <span className="text-[10px] px-3 py-1.5 border rounded font-black bg-yellow-500/10 border-yellow-500 text-yellow-400 tracking-widest">OPEN</span>}
         </div>
         <div className="grid grid-cols-2 gap-3">
           <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50 shadow-sm"><p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">Pelapor</p><p className="text-sm font-bold text-cyan-50 truncate">{selectedIncident.reportedBy}</p></div>
           <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50 shadow-sm"><p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">Waktu Lapor</p><p className="text-sm font-bold text-cyan-50">{selectedIncident.date}<br/>{selectedIncident.time}</p></div>
         </div>
         <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50 shadow-sm"><p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">Kapal Terkait</p><p className="text-sm font-bold text-cyan-50">{selectedIncident.shipName || '-'}</p></div>
         <div className="space-y-3">
           <div className="bg-yellow-950/20 p-4 rounded-xl border border-yellow-900/30"><p className="text-[10px] text-yellow-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><AlertTriangle className="w-3 h-3" /> Deskripsi</p><p className="text-sm text-yellow-50/90 leading-relaxed">{selectedIncident.deskripsi || '-'}</p></div>
           <div className="bg-yellow-950/20 p-4 rounded-xl border border-yellow-900/30"><p className="text-[10px] text-yellow-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><AlertTriangle className="w-3 h-3" /> Penyebab</p><p className="text-sm text-yellow-50/90 leading-relaxed">{selectedIncident.penyebab || '-'}</p></div>
           <div className="bg-emerald-950/20 p-4 rounded-xl border border-emerald-900/30"><p className="text-[10px] text-emerald-600 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-widest"><CheckCircle2 className="w-3 h-3" /> Tindak Lanjut</p><p className="text-sm text-emerald-50/90 leading-relaxed">{selectedIncident.tindakLanjut || '-'}</p></div>
         </div>

         {/* Progress */}
         <div className="pt-2">
           <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-2"><FileText className="w-4 h-4"/> Progress Perbaikan</h4>
           <div className="space-y-5 border-l-2 border-cyan-800 ml-2 pl-5">
             {incidentMeta[selectedIncident.id]?.progress?.map((prog, idx) => (
               <div key={idx} className="relative">
                 <div className="absolute -left-[25px] top-0 w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] border-2 border-[#070b19]"></div>
                 <p className="text-[10px] font-mono text-cyan-500 mb-1.5">{prog.date} {prog.time} · <span className="text-emerald-400 font-bold">{prog.author}</span></p>
                 <div className="flex gap-3 items-start bg-[#0b1229] p-3.5 rounded-xl border border-cyan-900/50 shadow-sm hover:border-cyan-700 transition-colors">
                   <p className="text-sm text-cyan-50 flex-1 whitespace-pre-wrap leading-relaxed">{prog.comment}</p>
                   {prog.photoUrl && <div className="w-20 h-20 rounded-lg overflow-hidden border border-cyan-800 flex-shrink-0 cursor-pointer hover:opacity-80 transition-all relative group" onClick={() => setPreviewPhoto({url: prog.photoUrl, author: prog.author, time: `${prog.date} ${prog.time}`})}><AsyncImage src={prog.photoUrl} className="w-full h-full object-cover" alt="Progress"/><div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><ImageIcon className="w-6 h-6 text-white"/></div></div>}
                 </div>
               </div>
             ))}
             {(!incidentMeta[selectedIncident.id]?.progress || incidentMeta[selectedIncident.id]?.progress.length === 0) && (
               <p className="text-sm text-cyan-700 italic border border-dashed border-cyan-900/50 p-4 rounded-xl text-center">Belum ada pembaruan progress.</p>
             )}
           </div>
         </div>

         {/* Add progress form */}
         {isReadOnly && (
           <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50 mt-6">
             <p className="text-xs text-cyan-300 leading-relaxed">Detail temuan ini berasal dari riwayat shift dan hanya bisa dibaca.</p>
           </div>
         )}
         {(!isReadOnly && (!incidentMeta[selectedIncident.id] || incidentMeta[selectedIncident.id].status !== 'closed') && canManageIncident(selectedIncident)) && (
           <div className="bg-[#0b1229] p-4 rounded-xl border border-emerald-900/50 mt-6 space-y-3 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
             <label className="text-[10px] font-mono text-emerald-400 block uppercase tracking-widest font-bold">Update Progress Baru</label>
             <textarea value={newProgress.comment} onChange={e => setNewProgress({...newProgress, comment: e.target.value})} placeholder="Tuliskan detail perbaikan..." rows={2} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-lg p-3 text-sm text-cyan-50 focus:border-emerald-500 outline-none resize-none" />
             <div className="flex gap-2">
               {!newProgress.photoUrl ? (
                 <button onClick={handlePhotoProgress} className="flex-1 py-2.5 rounded-lg border border-dashed border-emerald-500/40 bg-emerald-950/20 text-emerald-400 text-xs font-bold flex items-center justify-center gap-2 hover:bg-emerald-900/40 transition-colors"><Camera className="w-4 h-4"/> Bukti Foto</button>
               ) : (
                 <div className="flex-1 h-11 rounded-lg overflow-hidden relative border border-emerald-500/50"><AsyncImage src={newProgress.photoUrl} className="w-full h-full object-cover" alt="Preview"/><button onClick={() => setNewProgress({...newProgress, photoUrl:null})} className="absolute top-0 right-0 p-1 bg-black/60 text-white rounded-bl text-[10px] hover:bg-rose-500 transition-colors" aria-label="Hapus foto"><X className="w-3.5 h-3.5"/></button></div>
               )}
               <button disabled={!newProgress.comment && !newProgress.photoUrl} onClick={() => handleAddProgress(selectedIncident.id)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 rounded-lg text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1 shadow-md"><Plus className="w-4 h-4"/> Update</button>
             </div>
           </div>
         )}
         {(!isReadOnly && (!incidentMeta[selectedIncident.id] || incidentMeta[selectedIncident.id].status !== 'closed') && !canManageIncident(selectedIncident)) && (
           <div className="bg-[#0b1229] p-4 rounded-xl border border-amber-900/50 mt-6"><p className="text-xs text-amber-300 leading-relaxed">Update progress hanya tersedia untuk PIC atau petugas yang ditugaskan di kapal <span className="font-bold">{selectedIncident.shipName || '-'}</span>.</p></div>
         )}
         {(!isReadOnly && (!incidentMeta[selectedIncident.id] || incidentMeta[selectedIncident.id].status !== 'closed') && canManageIncident(selectedIncident) && !canCloseIncident(selectedIncident)) && (
           <div className="bg-[#0b1229] p-4 rounded-xl border border-rose-900/50 mt-6">
             <p className="text-xs text-rose-300 leading-relaxed">Tutup temuan hanya dapat dilakukan oleh pengguna dengan role <span className="font-bold">PIC</span>.</p>
           </div>
         )}
      </div>

      {(!isReadOnly && (!incidentMeta[selectedIncident.id] || incidentMeta[selectedIncident.id].status !== 'closed') && canCloseIncident(selectedIncident)) && (
         <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe">
            <button onClick={() => handleCloseIncident(selectedIncident.id)} className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs border border-rose-500 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(244,63,94,0.15)]"><CheckCircle2 className="w-5 h-5"/> Tutup Temuan (Selesai)</button>
         </div>
      )}
    </div>
  );
}
