import React from 'react';
import { useApp } from '../../context/AppContext';
import { ChevronDown, Trash2, Camera, Save, AlertTriangle, CheckCircle2, ImageIcon } from 'lucide-react';
import AsyncImage from '../AsyncImage';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export function UserDetailModal() {
  const { selectedUser, setSelectedUser, handleUpdateUser, handleDeleteUser, handleEditUserPhotoUpload } = useApp();
  const modalRef = useFocusTrap(!!selectedUser);
  if (!selectedUser) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 flex flex-col animate-in slide-in-from-right-4">
      <div className="p-4 border-b border-cyan-500/30 flex items-center justify-between bg-[#0b1229] shrink-0 shadow-sm">
         <div className="flex items-center gap-3">
           <button onClick={() => setSelectedUser(null)} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Kembali"><ChevronDown className="w-5 h-5 rotate-90"/></button>
           <div><span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Profil</span><h3 className="font-bold text-xl text-cyan-50 line-clamp-1">Detail User</h3></div>
         </div>
         <button onClick={() => handleDeleteUser(selectedUser.id)} className="p-2 bg-rose-500/10 text-rose-500 border border-rose-500/30 rounded-lg hover:bg-rose-500 hover:text-white transition-colors flex items-center gap-2" aria-label="Hapus pengguna"><Trash2 className="w-4 h-4"/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <div className="space-y-4">
          <div className="flex flex-col items-center mb-6">
            {!selectedUser.photoUrl ? (
              <button onClick={handleEditUserPhotoUpload} className="w-24 h-24 rounded-2xl border-2 border-dashed border-cyan-500/50 bg-[#070b19] flex flex-col items-center justify-center text-cyan-500 hover:text-cyan-300 hover:border-cyan-400 transition-colors shadow-sm"><Camera className="w-6 h-6 mb-1"/><span className="text-[9px] font-bold">FOTO</span></button>
            ) : (
              <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-cyan-500 shadow-md"><AsyncImage src={selectedUser.photoUrl} alt="Profile" className="w-full h-full object-cover" /><button onClick={() => setSelectedUser({...selectedUser, photoUrl: null})} className="absolute bottom-0 inset-x-0 bg-rose-500/90 py-1 text-[9px] text-white font-bold hover:bg-rose-600 transition-colors">HAPUS</button></div>
            )}
          </div>
          <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Nama Lengkap</label><input type="text" value={selectedUser.name || ''} onChange={e => setSelectedUser({...selectedUser, name: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">ROLE</label><select value={selectedUser.role || 'PETUGAS'} onChange={e => setSelectedUser({...selectedUser, role: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm"><option value="ADMIN">ADMIN</option><option value="PETUGAS">PETUGAS</option><option value="PIC">PIC</option></select></div>
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Instansi</label><select value={selectedUser.type || 'BUJP'} onChange={e => setSelectedUser({...selectedUser, type: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm"><option value="BUJP">BUJP</option><option value="TNI">TNI</option><option value="POLRI">POLRI</option><option value="INTERNAL">INTERNAL</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-cyan-900/30">
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Email</label><input type="email" value={selectedUser.email || ''} onChange={e => setSelectedUser({...selectedUser, email: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" /></div>
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Password</label><input type="password" value={selectedUser.password || ''} onChange={e => setSelectedUser({...selectedUser, password: e.target.value})} placeholder="••••••••" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">No Telpon</label><input type="tel" value={selectedUser.phone || ''} onChange={e => setSelectedUser({...selectedUser, phone: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" /></div>
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Tgl Lahir</label><input type="date" value={selectedUser.dob || ''} onChange={e => setSelectedUser({...selectedUser, dob: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm [color-scheme:dark]" /></div>
          </div>
          <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Alamat Rumah</label><textarea rows={2} value={selectedUser.address || ''} onChange={e => setSelectedUser({...selectedUser, address: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm resize-none" /></div>
          <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Alamat Kantor</label><textarea rows={2} value={selectedUser.officeAddress || ''} onChange={e => setSelectedUser({...selectedUser, officeAddress: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm resize-none" /></div>
          <div className="p-4 border border-rose-900/50 bg-rose-950/10 rounded-xl space-y-4">
             <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest border-b border-rose-900/30 pb-2">Kontak Darurat</p>
             <div><label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">Nama</label><input type="text" value={selectedUser.emergencyName || ''} onChange={e => setSelectedUser({...selectedUser, emergencyName: e.target.value})} className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none shadow-sm" /></div>
             <div className="grid grid-cols-2 gap-3">
               <div><label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">No. HP</label><input type="tel" value={selectedUser.emergencyContact || ''} onChange={e => setSelectedUser({...selectedUser, emergencyContact: e.target.value})} className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none shadow-sm" /></div>
               <div><label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">Hubungan</label><select value={selectedUser.emergencyRelation || 'Orang Tua'} onChange={e => setSelectedUser({...selectedUser, emergencyRelation: e.target.value})} className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none appearance-none shadow-sm"><option value="Orang Tua">Orang Tua</option><option value="Suami/Istri">Suami/Istri</option><option value="Anak">Anak</option><option value="Saudara">Saudara</option><option value="Rekan Kerja">Rekan Kerja</option></select></div>
             </div>
          </div>
        </div>
      </div>
      <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe">
         <button onClick={handleUpdateUser} disabled={!selectedUser.name} className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)]"><Save className="w-4 h-4" /> Simpan Perubahan</button>
      </div>
    </div>
  );
}

export function ReportDetailModal() {
  const { selectedReportDetail, setSelectedReportDetail, setPreviewPhoto, handleDeleteReport } = useApp();
  const modalRef = useFocusTrap(!!selectedReportDetail);
  if (!selectedReportDetail) return null;
  const isMissed = selectedReportDetail.resultType === 'missed' || selectedReportDetail.status === 'missed';
  const isReadOnly = Boolean(selectedReportDetail.readOnly);
  const headerToneClass = isMissed ? 'bg-rose-500/10 border-rose-500 text-rose-400' : selectedReportDetail.resultType === 'temuan' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' : 'bg-emerald-500/10 border-emerald-500 text-emerald-400';

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 flex flex-col animate-in slide-in-from-right-4">
      {selectedReportDetail.photoUrl ? (
        <div className="w-full h-64 bg-[#0b1229] relative shrink-0 cursor-pointer group" onClick={() => setPreviewPhoto({url: selectedReportDetail.photoUrl, author: selectedReportDetail.completedBy, time: `${selectedReportDetail.time || '-'} WIB`})}>
           <AsyncImage src={selectedReportDetail.photoUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt="Bukti" />
           <div className="absolute inset-0 bg-gradient-to-b from-[#070b19]/80 via-transparent to-[#070b19]"></div>
           <button onClick={(e) => { e.stopPropagation(); setSelectedReportDetail(null); }} className="absolute top-4 left-4 p-2 bg-black/50 text-white rounded-full backdrop-blur-md border border-white/20 hover:bg-black/70 transition-colors z-10" aria-label="Tutup laporan"><ChevronDown className="w-6 h-6 rotate-90"/></button>
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
            <button onClick={() => setSelectedReportDetail(null)} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Tutup laporan"><ChevronDown className="w-5 h-5 rotate-90"/></button>
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

export function PhotoPreviewModal() {
  const { previewPhoto, setPreviewPhoto } = useApp();
  const modalRef = useFocusTrap(!!previewPhoto);
  if (!previewPhoto) return null;
  return (
    <div ref={modalRef} className="fixed inset-0 z-[110] flex items-center justify-center bg-[#070b19]/95 p-4 animate-in fade-in" onClick={()=>setPreviewPhoto(null)}>
      <div className="relative">
        <AsyncImage src={typeof previewPhoto === 'string' ? previewPhoto : previewPhoto.url} alt="Zoom" className="w-full max-w-lg h-auto rounded-xl border border-cyan-700 shadow-[0_0_30px_rgba(6,182,212,0.2)]" />
        {typeof previewPhoto === 'object' && previewPhoto.author && (
          <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs text-white/90 text-right border border-cyan-900/50"><p className="font-bold text-cyan-400">{previewPhoto.author}</p><p className="text-[10px] text-cyan-100/70">{previewPhoto.time}</p></div>
        )}
      </div>
    </div>
  );
}
