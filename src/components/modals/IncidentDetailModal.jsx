import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ChevronDown, AlertTriangle, CheckCircle2, Camera, X, Plus, FileText, ImageIcon } from 'lucide-react';
import AsyncImage from '../AsyncImage';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export default function IncidentDetailModal() {
  const { selectedIncident, setSelectedIncident, incidentMeta, canManageIncident, canCloseIncident, handleAddProgress, handleCloseIncident, newProgress, setNewProgress, handlePhotoProgress, handleUpdateIncidentPhoto, setPreviewPhoto } = useApp();
  const [activeTab, setActiveTab] = useState('update');
  const [showUpdateForm, setShowUpdateForm] = useState(false);
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
           {!isReadOnly && canManageIncident(selectedIncident) && (
              <button onClick={(e) => { e.stopPropagation(); handleUpdateIncidentPhoto(selectedIncident.id); }} className="absolute top-4 right-4 p-2 bg-emerald-500/80 text-white rounded-full backdrop-blur-md border border-emerald-400/50 hover:bg-emerald-500 transition-all z-20 shadow-lg" title="Ganti Foto Bukti">
                <Camera className="w-5 h-5"/>
              </button>
            )}
           <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs text-white/90 text-right border border-yellow-900/50 z-10 shadow-lg"><p className="font-bold text-yellow-400">{selectedIncident.reportedBy}</p><p className="text-[10px] text-yellow-100/70">{selectedIncident.date} {selectedIncident.time}</p></div>
           <div className="absolute bottom-4 left-4 right-36 z-10"><span className="text-[10px] px-2 py-1 border rounded font-bold bg-yellow-500/10 border-yellow-500 text-yellow-400 mb-2 inline-block shadow-sm">TEMUAN</span><h2 className="text-2xl font-black text-white drop-shadow-md leading-tight line-clamp-2">{selectedIncident.location}</h2></div>
        </div>
      ) : (
        <div className="p-4 border-b border-yellow-500/30 flex items-center gap-3 bg-[#0b1229] shrink-0 shadow-sm">
           <button onClick={() => setSelectedIncident(null)} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Tutup detail"><ChevronDown className="w-5 h-5 rotate-90"/></button>
           <div className="flex-1">
             <span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Detail Temuan</span>
             <h3 className="font-bold text-xl text-yellow-400 line-clamp-1">{selectedIncident.location}</h3>
           </div>
           {!isReadOnly && canManageIncident(selectedIncident) && (
             <button onClick={() => handleUpdateIncidentPhoto(selectedIncident.id)} className="p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-all flex items-center gap-2 text-[10px] font-bold" title="Tambah Foto">
               <Camera className="w-4 h-4"/> FOTO
             </button>
           )}
        </div>
      )}

       {/* Tab Navigation */}
       <div className="flex bg-[#0b1229] border-b border-cyan-900/50 shrink-0">
         <button 
           onClick={() => setActiveTab('update')}
           className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === 'update' ? 'text-emerald-400 border-emerald-500 bg-emerald-500/5' : 'text-cyan-600 border-transparent hover:text-cyan-400'}`}
         >
           Update
         </button>
         <button 
           onClick={() => setActiveTab('info')}
           className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === 'info' ? 'text-yellow-400 border-yellow-500 bg-yellow-500/5' : 'text-cyan-600 border-transparent hover:text-cyan-400'}`}
         >
           Info (5W1H)
         </button>
       </div>

       <div className="flex-1 overflow-y-auto p-5 space-y-6 text-cyan-50">
         {activeTab === 'info' ? (
           <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
             {/* WHAT */}
             <div className="bg-yellow-950/20 p-4 rounded-xl border border-yellow-900/30">
               <p className="text-[10px] text-yellow-600 font-bold mb-2 flex items-center gap-1.5 uppercase tracking-widest">
                 <AlertTriangle className="w-3 h-3" /> WHAT : Deskripsi
               </p>
               <p className="text-sm text-yellow-50/90 leading-relaxed font-medium">{selectedIncident.deskripsi || '-'}</p>
             </div>

             {/* WHERE */}
             <div className="bg-cyan-950/20 p-4 rounded-xl border border-cyan-900/30">
               <p className="text-[10px] text-cyan-600 font-bold mb-2 uppercase tracking-widest">WHERE : Lokasi & Kapal</p>
               <div className="space-y-1">
                 <p className="text-sm font-bold text-cyan-50">{selectedIncident.location}</p>
                 <p className="text-xs text-cyan-400/70">{selectedIncident.shipName}</p>
               </div>
             </div>

             {/* WHEN */}
             <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50">
               <p className="text-[10px] text-cyan-600 font-bold mb-2 uppercase tracking-widest">WHEN : Waktu Kejadian</p>
               <p className="text-sm font-bold text-cyan-50">{selectedIncident.date} · {selectedIncident.time}</p>
             </div>

             {/* WHY */}
             <div className="bg-yellow-950/10 p-4 rounded-xl border border-yellow-900/20">
               <p className="text-[10px] text-yellow-700 font-bold mb-2 uppercase tracking-widest">WHY : Penyebab</p>
               <p className="text-sm text-yellow-50/80 leading-relaxed italic">{selectedIncident.penyebab || '-'}</p>
             </div>

             {/* WHO */}
             <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50">
               <p className="text-[10px] text-cyan-600 font-bold mb-2 uppercase tracking-widest">WHO : Petugas Pelapor</p>
               <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-[10px] font-bold text-cyan-400">
                   {selectedIncident.reportedBy?.[0] || 'S'}
                 </div>
                 <p className="text-sm font-bold text-cyan-50">{selectedIncident.reportedBy}</p>
               </div>
             </div>

             {/* HOW */}
             <div className="bg-emerald-950/20 p-4 rounded-xl border border-emerald-900/30">
               <p className="text-[10px] text-emerald-600 font-bold mb-2 flex items-center gap-1.5 uppercase tracking-widest">
                 <CheckCircle2 className="w-3 h-3" /> HOW : Tindak Lanjut
               </p>
               <p className="text-sm text-emerald-50/90 leading-relaxed">{selectedIncident.tindakLanjut || '-'}</p>
             </div>
           </div>
         ) : (
           <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="flex justify-between items-center bg-[#0b1229] p-3 rounded-xl border border-cyan-900/50 shadow-sm">
               <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Status Terkini</span>
               {incidentMeta[selectedIncident.id]?.status === 'closed' ? 
                 <span className="text-[10px] px-3 py-1.5 border rounded font-black bg-slate-800 border-slate-600 text-slate-400 tracking-widest">CLOSED</span> : 
                 <span className="text-[10px] px-3 py-1.5 border rounded font-black bg-yellow-500/10 border-yellow-500 text-yellow-400 tracking-widest">OPEN</span>
               }
             </div>

             {/* Progress List */}
             <div className="pt-2">
               <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-2"><FileText className="w-4 h-4"/> RIWAYAT UPDATE</h4>
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
                   <p className="text-sm text-cyan-700 italic border border-dashed border-cyan-900/50 p-4 rounded-xl text-center">Belum ada update progres.</p>
                 )}
               </div>
             </div>

             {/* Add progress form trigger */}
             {isReadOnly ? (
               <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50 mt-6">
                 <p className="text-xs text-cyan-300 leading-relaxed">Detail temuan ini berasal dari riwayat shift dan hanya bisa dibaca.</p>
               </div>
             ) : (
               (!incidentMeta[selectedIncident.id] || incidentMeta[selectedIncident.id].status !== 'closed') && (
                 canManageIncident(selectedIncident) ? (
                   <div className="pt-2">
                     <button 
                       onClick={() => setShowUpdateForm(true)}
                       className="w-full py-4 bg-emerald-600/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-600 hover:text-white transition-all shadow-lg shadow-emerald-900/20 active:scale-[0.98]"
                     >
                       <Plus className="w-5 h-5"/> Tambah Update
                     </button>
                   </div>
                 ) : (
                   <div className="bg-[#0b1229] p-4 rounded-xl border border-amber-900/50 mt-6"><p className="text-xs text-amber-300 leading-relaxed">Update hanya tersedia untuk PIC atau petugas yang ditugaskan di kapal <span className="font-bold">{selectedIncident.shipName || '-'}</span>.</p></div>
                 )
               )
             )}
             
             {(!isReadOnly && (!incidentMeta[selectedIncident.id] || incidentMeta[selectedIncident.id].status !== 'closed') && canManageIncident(selectedIncident) && !canCloseIncident(selectedIncident)) && (
               <div className="bg-[#0b1229] p-4 rounded-xl border border-rose-900/50 mt-6 text-center">
                 <p className="text-[10px] text-rose-400 leading-relaxed uppercase tracking-widest font-bold">Tutup temuan hanya untuk PIC</p>
               </div>
             )}
           </div>
         )}
       </div>

      {(!isReadOnly && (!incidentMeta[selectedIncident.id] || incidentMeta[selectedIncident.id].status !== 'closed') && canCloseIncident(selectedIncident)) && (
         <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe">
            <button onClick={() => handleCloseIncident(selectedIncident.id)} className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs border border-rose-500 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(244,63,94,0.15)]"><CheckCircle2 className="w-5 h-5"/> Tutup Temuan (Selesai)</button>
         </div>
      )}

      {/* Update Form Modal */}
      {showUpdateForm && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#070b19]/90 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowUpdateForm(false)}></div>
          <div className="bg-[#0b1229] w-full max-w-sm rounded-[2rem] border border-cyan-900/50 shadow-2xl relative animate-in slide-in-from-bottom-10 duration-300 overflow-hidden ring-1 ring-white/5">
            <div className="p-5 border-b border-cyan-800/30 flex justify-between items-center bg-[#070b19]/40 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                  <Plus className="w-5 h-5 text-emerald-400"/>
                </div>
                <h3 className="font-bold text-cyan-50">Update Baru</h3>
              </div>
              <button onClick={() => setShowUpdateForm(false)} className="p-2 hover:bg-white/5 rounded-xl transition-all active:scale-90"><X className="w-5 h-5 text-cyan-700"/></button>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="text-[10px] font-mono text-cyan-500 block uppercase tracking-widest font-bold mb-2.5 ml-1">Detail Perkembangan</label>
                <textarea 
                  autoFocus
                  value={newProgress.comment} 
                  onChange={e => setNewProgress({...newProgress, comment: e.target.value})} 
                  placeholder="Ceritakan perkembangan terbaru atau tindakan yang telah diambil..." 
                  rows={4} 
                  className="w-full bg-[#070b19]/60 border border-cyan-800/40 rounded-2xl p-4 text-sm text-cyan-50 focus:border-emerald-500/50 focus:bg-[#070b19] focus:ring-4 focus:ring-emerald-500/5 outline-none resize-none transition-all placeholder:text-cyan-900" 
                />
              </div>
              
              <div className="space-y-2.5">
                <label className="text-[10px] font-mono text-cyan-500 block uppercase tracking-widest font-bold mb-1 ml-1">Lampiran Foto</label>
                {!newProgress.photoUrl ? (
                  <button onClick={handlePhotoProgress} className="w-full py-8 rounded-2xl border-2 border-dashed border-cyan-800/30 bg-[#070b19]/40 text-cyan-600 text-xs font-bold flex flex-col items-center justify-center gap-3 hover:bg-cyan-900/10 hover:border-emerald-500/30 hover:text-cyan-400 transition-all group">
                    <div className="p-3 rounded-full bg-cyan-900/20 group-hover:bg-emerald-500/10 transition-all">
                      <Camera className="w-6 h-6 text-cyan-700 group-hover:text-emerald-500"/> 
                    </div>
                    <span className="tracking-widest uppercase text-[10px]">Ketuk untuk mengambil foto</span>
                  </button>
                ) : (
                  <div className="relative aspect-video rounded-2xl overflow-hidden border border-emerald-500/30 shadow-2xl group ring-1 ring-emerald-500/20">
                    <AsyncImage src={newProgress.photoUrl} className="w-full h-full object-cover" alt="Preview"/>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <button onClick={() => setNewProgress({...newProgress, photoUrl:null})} className="absolute top-3 right-3 p-2 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-all shadow-xl shadow-rose-900/20 active:scale-95" aria-label="Hapus foto"><X className="w-4 h-4"/></button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-5 bg-[#070b19]/40 border-t border-cyan-800/30 flex gap-4">
              <button onClick={() => setShowUpdateForm(false)} className="flex-1 py-4 text-xs font-bold text-cyan-700 hover:text-cyan-400 transition-colors uppercase tracking-widest active:scale-95">Batal</button>
              <button 
                disabled={!newProgress.comment && !newProgress.photoUrl} 
                onClick={() => { handleAddProgress(selectedIncident.id); setShowUpdateForm(false); }} 
                className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 active:scale-95 border border-emerald-400/20"
              >
                Simpan Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
