import React from 'react';
import { useApp, ACCESS_ROLES } from '../../context/AppContext';
import { ChevronDown, Trash2, Camera, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import AsyncImage from '../AsyncImage';

export default function UserDetailView({ isInline = false }) {
  const { selectedUser, setSelectedUser, handleUpdateUser, handleDeleteUser, handleEditUserPhotoUpload } = useApp();

  if (!selectedUser) {
    if (isInline) return (
      <div className="h-full flex flex-col items-center justify-center text-cyan-800 p-8 text-center border-2 border-dashed border-cyan-900/30 rounded-3xl m-4">
        <div className="w-16 h-16 rounded-full bg-cyan-900/20 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 opacity-20" />
        </div>
        <p className="text-sm font-bold uppercase tracking-widest mb-1">Detail Pengguna</p>
        <p className="text-xs opacity-60">Pilih salah satu pengguna di sebelah kiri untuk melihat profil lengkap atau mengubah data.</p>
      </div>
    );
    return null;
  }

  return (
    <div className={`flex flex-col h-full bg-[#070b19] ${isInline ? 'border-l border-cyan-900/50' : 'fixed inset-0 z-[100] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50'}`}>
      <div className="p-4 border-b border-cyan-500/30 flex items-center justify-between bg-[#0b1229] shrink-0 shadow-sm">
         <div className="flex items-center gap-3">
           {!isInline && (
             <button onClick={() => setSelectedUser(null)} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Kembali"><ChevronDown className="w-5 h-5 rotate-90"/></button>
           )}
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
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">ROLE</label><select value={selectedUser.role || 'PETUGAS'} onChange={e => setSelectedUser({...selectedUser, role: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm"><option value={ACCESS_ROLES.ADMIN}>ADMIN</option><option value={ACCESS_ROLES.PETUGAS}>PETUGAS</option><option value={ACCESS_ROLES.PIC}>PIC</option></select></div>
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
