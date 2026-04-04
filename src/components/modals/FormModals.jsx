import React from 'react';
import { useApp } from '../../context/AppContext';
import { ChevronDown, Camera, Trash2, Save, UserPlus, Plus, Map, Package, Weight, FileText, Upload, ImageIcon } from 'lucide-react';
import AsyncImage from '../AsyncImage';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { detectDocumentType, getDocumentTypeLabel } from '../../utils/documentFiles';

function ShipDocumentUploadVisual({ document }) {
  const type = detectDocumentType(document?.fileName, document?.mimeType);
  const badge = getDocumentTypeLabel(type);
  const isImage = type === 'image';
  const toneClass = {
    pdf: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
    word: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
    excel: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    powerpoint: 'text-orange-300 bg-orange-500/10 border-orange-500/20',
    image: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20',
    other: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  }[type] || 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20';

  const Icon = isImage ? ImageIcon : FileText;

  return (
    <div className={`relative w-11 h-11 rounded-xl border flex items-center justify-center ${toneClass}`}>
      <Icon className="w-5 h-5" />
      <span className="absolute -bottom-1 px-1.5 py-0.5 rounded-md bg-[#070b19] border border-current text-[8px] font-black tracking-widest leading-none">
        {badge}
      </span>
    </div>
  );
}

export function ShipFormModal() {
  const { showShipForm, setShowShipForm, shipFormData, setShipFormData, newCheckpoint, setNewCheckpoint, handleSaveShip, handleAddCheckpointToForm, handleRemoveCheckpointFromForm, handleShipFormPhotoUpload } = useApp();
  const modalRef = useFocusTrap(showShipForm);
  if (!showShipForm) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 flex flex-col animate-in slide-in-from-right-4">
      <div className="p-4 border-b border-cyan-500/30 flex items-center gap-3 bg-[#0b1229] shrink-0 shadow-sm">
         <button onClick={() => setShowShipForm(false)} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Tutup form kapal"><ChevronDown className="w-5 h-5 rotate-90"/></button>
         <div><span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Registrasi</span><h3 className="font-bold text-xl text-cyan-50 line-clamp-1">Armada Baru</h3></div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <div className="space-y-4">
          <div className="flex flex-col items-center mb-6">
            {!shipFormData.photoUrl ? (
              <button onClick={handleShipFormPhotoUpload} className="w-28 h-28 rounded-2xl border-2 border-dashed border-cyan-500/50 bg-[#070b19] flex flex-col items-center justify-center text-cyan-500 hover:text-cyan-300 hover:border-cyan-400 transition-colors shadow-sm">
                <Camera className="w-7 h-7 mb-2"/>
                <span className="text-[10px] font-bold tracking-widest">FOTO KAPAL</span>
              </button>
            ) : (
              <div className="relative w-full max-w-[180px] h-28 rounded-2xl overflow-hidden border border-cyan-500/60 shadow-md">
                <AsyncImage src={shipFormData.photoUrl} alt="Foto kapal" className="w-full h-full object-cover" />
                <button onClick={() => setShipFormData({ ...shipFormData, photoUrl: null })} className="absolute bottom-0 inset-x-0 bg-rose-500/90 py-1.5 text-[9px] text-white font-bold tracking-widest hover:bg-rose-600 transition-colors">HAPUS FOTO</button>
              </div>
            )}
          </div>
          <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Nama Kapal</label><input type="text" value={shipFormData.name} onChange={e => setShipFormData({...shipFormData, name: e.target.value})} placeholder="Contoh: MT GATOTKACA" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Tipe Kapal</label><select value={shipFormData.type} onChange={e => setShipFormData({...shipFormData, type: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm"><option>Oil Tanker</option><option>Chemical Tanker</option><option>Gas Carrier</option><option>Bulk Carrier</option></select></div>
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Status</label><select value={shipFormData.status} onChange={e => setShipFormData({...shipFormData, status: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm"><option value="UPP">UPP</option><option value="NON UPP">NON UPP</option></select></div>
          </div>
          <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1 flex items-center gap-1"><Map className="w-3 h-3"/> {shipFormData.status === 'UPP' ? 'Lokasi Sandar' : 'Rute Pelayaran'}</label><input type="text" value={shipFormData.route} onChange={e => setShipFormData({...shipFormData, route: e.target.value})} placeholder={shipFormData.status === 'UPP' ? "Contoh: Pelabuhan Merak" : "Contoh: Jakarta - Dumai"} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1 flex items-center gap-1"><Package className="w-3 h-3"/> Jenis Muatan</label><input type="text" value={shipFormData.cargoType} onChange={e => setShipFormData({...shipFormData, cargoType: e.target.value})} placeholder="Crude Oil" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" /></div>
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1 flex items-center gap-1"><Weight className="w-3 h-3"/> Jumlah</label><input type="text" value={shipFormData.cargoAmount} onChange={e => setShipFormData({...shipFormData, cargoAmount: e.target.value})} placeholder="30,000 MT" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" /></div>
          </div>
        </div>
        <div className="pt-2 border-t border-cyan-900/30">
          <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 pb-2">Daftar TITIK Periksa</h4>
          <div className="flex gap-2 mb-3">
            <input type="text" value={newCheckpoint} onChange={e => setNewCheckpoint(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleAddCheckpointToForm()} placeholder="Nama Titik Baru..." className="flex-1 bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
            <button onClick={handleAddCheckpointToForm} className="px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-colors shadow-[0_0_10px_rgba(6,182,212,0.3)]"><Plus className="w-5 h-5"/></button>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {shipFormData.customCheckpoints.map((cp, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-[#0b1229] border border-cyan-800/60 rounded-xl shadow-sm">
                <span className="text-sm font-bold text-cyan-100 flex items-center gap-2"><span className="text-[9px] text-cyan-600 font-mono border border-cyan-800 px-1.5 py-0.5 rounded">TITIK {String(idx+1).padStart(2,'0')}</span>{cp.name}</span>
                <button onClick={() => handleRemoveCheckpointFromForm(idx)} className="p-1.5 text-rose-500/70 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" aria-label="Hapus titik periksa"><Trash2 className="w-4 h-4"/></button>
              </div>
            ))}
            {shipFormData.customCheckpoints.length === 0 && <p className="text-xs text-rose-400 text-center py-3 italic border border-dashed border-rose-900/50 rounded-xl">Belum ada titik periksa.</p>}
          </div>
        </div>
      </div>
      <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe flex gap-3">
        <button onClick={() => setShowShipForm(false)} className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs border border-cyan-800 text-cyan-300 hover:bg-cyan-900/30 transition-colors">Cancel</button>
        <button onClick={handleSaveShip} disabled={!shipFormData.name} className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)]"><Save className="w-4 h-4" /> Simpan Data</button>
      </div>
    </div>
  );
}

export function ShipDocumentFormModal() {
  const { showShipDocForm, closeShipDocForm, newShipDoc, setNewShipDoc, handleShipDocUpload, handleAddShipDoc } = useApp();
  const modalRef = useFocusTrap(showShipDocForm);
  if (!showShipDocForm) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in">
      <div ref={modalRef} className="w-full max-w-sm bg-[#0b1229] border border-cyan-800/60 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-cyan-900/50 flex items-center gap-3 bg-[#0f1734]">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-300">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">Dokumen Armada</p>
            <h3 className="text-lg font-bold text-cyan-50">Upload Dokumen Baru</h3>
          </div>
          <button onClick={closeShipDocForm} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Tutup form dokumen">
            <ChevronDown className="w-5 h-5 rotate-90"/>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Judul Dokumen</label>
            <input type="text" value={newShipDoc.title} onChange={e => setNewShipDoc({ ...newShipDoc, title: e.target.value })} placeholder="Contoh: Sertifikat Keselamatan" className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Keterangan</label>
            <input type="text" value={newShipDoc.desc} onChange={e => setNewShipDoc({ ...newShipDoc, desc: e.target.value })} placeholder="Contoh: Berlaku hingga 2027" className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-mono text-cyan-400 block uppercase tracking-widest pl-1">File Dokumen</label>
            <button onClick={handleShipDocUpload} className="w-full rounded-2xl border border-dashed border-emerald-700/70 bg-emerald-950/10 px-4 py-5 text-left hover:border-emerald-400 hover:bg-emerald-900/20 transition-colors">
              <div className="flex items-center gap-3">
                {newShipDoc.fileName ? (
                  <ShipDocumentUploadVisual document={newShipDoc} />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-300">
                    <Upload className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-emerald-300">{newShipDoc.fileName || 'Pilih file dokumen'}</p>
                  <p className="text-[11px] text-cyan-500">PDF, DOC, XLS, PPT, atau gambar dokumen</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="p-4 bg-[#070b19] border-t border-cyan-900/50 flex gap-3">
          <button onClick={closeShipDocForm} className="flex-1 py-3 rounded-xl font-black tracking-widest uppercase text-[11px] border border-cyan-800 text-cyan-300 hover:bg-cyan-900/30 transition-colors">Batal</button>
          <button onClick={handleAddShipDoc} disabled={!newShipDoc.title || !newShipDoc.fileUrl} className="flex-1 py-3 rounded-xl font-black tracking-widest uppercase text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.25)]">
            <Save className="w-4 h-4" /> Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

export function UserFormModal() {
  const { showUserForm, setShowUserForm, userFormData, setUserFormData, handleSaveUser, handleUserPhotoUpload } = useApp();
  const modalRef = useFocusTrap(showUserForm);
  if (!showUserForm) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 flex flex-col animate-in slide-in-from-right-4">
      <div className="p-4 border-b border-cyan-500/30 flex items-center gap-3 bg-[#0b1229] shrink-0 shadow-sm">
         <button onClick={() => setShowUserForm(false)} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Tutup form user"><ChevronDown className="w-5 h-5 rotate-90"/></button>
         <div><span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Registrasi</span><h3 className="font-bold text-xl text-cyan-50 line-clamp-1">User Baru</h3></div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <div className="space-y-4">
          <div className="flex flex-col items-center mb-6">
            {!userFormData.photoUrl ? (
              <button onClick={handleUserPhotoUpload} className="w-24 h-24 rounded-2xl border-2 border-dashed border-cyan-500/50 bg-[#070b19] flex flex-col items-center justify-center text-cyan-500 hover:text-cyan-300 hover:border-cyan-400 transition-colors shadow-sm"><Camera className="w-6 h-6 mb-1"/><span className="text-[9px] font-bold">FOTO</span></button>
            ) : (
              <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-cyan-500 shadow-md"><AsyncImage src={userFormData.photoUrl} alt="Profile" className="w-full h-full object-cover" /><button onClick={() => setUserFormData({...userFormData, photoUrl: null})} className="absolute bottom-0 inset-x-0 bg-rose-500/90 py-1 text-[9px] text-white font-bold hover:bg-rose-600 transition-colors">HAPUS</button></div>
            )}
          </div>
          <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Nama Lengkap</label><input type="text" value={userFormData.name} onChange={e => setUserFormData({...userFormData, name: e.target.value})} placeholder="Contoh: Dedi Mulyadi" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">ROLE</label><select value={userFormData.role} onChange={e => setUserFormData({...userFormData, role: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm"><option value="ADMIN">ADMIN</option><option value="PETUGAS">PETUGAS</option><option value="PIC">PIC</option></select></div>
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Instansi</label><select value={userFormData.type} onChange={e => setUserFormData({...userFormData, type: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm"><option value="BUJP">BUJP</option><option value="TNI">TNI</option><option value="POLRI">POLRI</option><option value="INTERNAL">INTERNAL</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-cyan-900/30">
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Email</label><input type="email" value={userFormData.email} onChange={e => setUserFormData({...userFormData, email: e.target.value})} placeholder="email@domain.com" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" /></div>
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Password</label><input type="password" value={userFormData.password} onChange={e => setUserFormData({...userFormData, password: e.target.value})} placeholder="••••••••" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">No Telpon</label><input type="tel" value={userFormData.phone} onChange={e => setUserFormData({...userFormData, phone: e.target.value})} placeholder="0812..." className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" /></div>
            <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Tgl Lahir</label><input type="date" value={userFormData.dob} onChange={e => setUserFormData({...userFormData, dob: e.target.value})} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm [color-scheme:dark]" /></div>
          </div>
          <div><label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Alamat</label><textarea rows={2} value={userFormData.address} onChange={e => setUserFormData({...userFormData, address: e.target.value})} placeholder="Alamat domisili..." className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm resize-none" /></div>
          <div className="p-4 border border-rose-900/50 bg-rose-950/10 rounded-xl space-y-4">
             <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest border-b border-rose-900/30 pb-2">Kontak Darurat</p>
             <div><label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">Nama</label><input type="text" value={userFormData.emergencyName} onChange={e => setUserFormData({...userFormData, emergencyName: e.target.value})} placeholder="Nama kontak darurat" className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none shadow-sm" /></div>
             <div className="grid grid-cols-2 gap-3">
               <div><label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">No. HP</label><input type="tel" value={userFormData.emergencyContact} onChange={e => setUserFormData({...userFormData, emergencyContact: e.target.value})} placeholder="08..." className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none shadow-sm" /></div>
               <div><label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">Hubungan</label><select value={userFormData.emergencyRelation} onChange={e => setUserFormData({...userFormData, emergencyRelation: e.target.value})} className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none appearance-none shadow-sm"><option value="Orang Tua">Orang Tua</option><option value="Suami/Istri">Suami/Istri</option><option value="Anak">Anak</option><option value="Saudara">Saudara</option></select></div>
             </div>
          </div>
        </div>
      </div>
      <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe flex gap-3">
        <button onClick={() => setShowUserForm(false)} className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs border border-cyan-800 text-cyan-300 hover:bg-cyan-900/30 transition-colors">Cancel</button>
        <button onClick={handleSaveUser} disabled={!userFormData.name} className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)]"><UserPlus className="w-4 h-4" /> Add User</button>
      </div>
    </div>
  );
}
