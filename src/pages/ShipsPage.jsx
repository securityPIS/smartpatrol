import React from 'react';
import { useApp } from '../context/AppContext';
import {
  Anchor, PlusCircle, Users, ShieldAlert, Ship, ChevronDown, ImageIcon,
  Navigation, Package, Weight, CalendarClock, UserMinus, UserPlus, Trash2, FilePlus, FileText, Download
} from 'lucide-react';
import AsyncImage from '../components/AsyncImage';
import { detectDocumentType, getDocumentTypeLabel } from '../utils/documentFiles';

function DocumentTypeIcon({ document }) {
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

import ShipFormView from '../components/views/ShipFormView';
import ShipDocumentFormView from '../components/views/ShipDocumentFormView';

const ShipsPage = React.memo(function ShipsPage() {
  const {
    isAdmin, shipsData, activeShipId, setActiveShipId, activeShip,
    setShowShipForm, showShipForm, shipDetailTab, setShipDetailTab, scheduleMonth, setScheduleMonth,
    isEditingShipInfo, setIsEditingShipInfo, editShipInfoData, setEditShipInfoData,
    updateActiveShip, handleTogglePersonnel, handleAddShipCp, handleShipPhotoUpdate,
    handleChangeSchedule, handleDownloadShipDoc, openShipDocForm, closeShipDocForm, showShipDocForm, newShipCp, setNewShipCp,
    usersData, handleDeleteShip
  } = useApp();

  if (!isAdmin) return null;

  const showRightPane = activeShipId || showShipForm || showShipDocForm;
  const handleShipSelect = (shipId) => {
    if (showShipForm) {
      setShowShipForm(false);
    }
    if (showShipDocForm) {
      closeShipDocForm();
    }
    if (isEditingShipInfo) {
      setIsEditingShipInfo(false);
    }
    setActiveShipId(shipId);
  };

  const renderShipsList = () => (
    <div className="p-4 space-y-4 animate-in fade-in">
      <div className="flex justify-between items-center mb-4">
         <h2 className="text-xl font-bold text-cyan-50 flex items-center gap-2"><Anchor className="w-5 h-5 text-cyan-400" /> Armada Kapal</h2>
         <button onClick={() => setShowShipForm(true)} className="px-3 py-1.5 bg-cyan-600/20 text-cyan-300 border border-cyan-500/50 text-xs font-bold rounded-lg flex items-center gap-1 hover:bg-cyan-600/40 transition-colors shadow-[0_0_10px_rgba(6,182,212,0.2)]">
           <PlusCircle className="w-3.5 h-3.5" /> Tambah
         </button>
      </div>
        <div className="grid grid-cols-1 gap-3">
          {shipsData.map((ship) => (
          <div key={ship.id} onClick={() => handleShipSelect(ship.id)} className={`bg-[#0b1229] rounded-xl border transition-all cursor-pointer flex overflow-hidden h-28 shadow-sm ${activeShipId === ship.id ? 'border-cyan-400 bg-cyan-900/10' : 'border-cyan-800/50 hover:border-cyan-400'}`}>
             <div className="w-28 h-full bg-[#070b19] border-r border-cyan-900 flex-shrink-0 relative">
               <AsyncImage src={ship.photoUrl} alt={ship.name} className={`w-full h-full object-cover transition-opacity ${activeShipId === ship.id ? 'opacity-100' : 'opacity-70'}`} />
             </div>
             <div className="p-3 flex-1 flex flex-col justify-center">
                <div className="flex justify-between items-start mb-1">
                   <h3 className={`font-bold text-base tracking-wide ${activeShipId === ship.id ? 'text-white' : 'text-cyan-50'}`}>{ship.name}</h3>
                   <span className="text-[9px] px-1.5 py-0.5 bg-cyan-900/40 text-cyan-300 border border-cyan-700 rounded uppercase font-bold">{ship.status}</span>
                </div>
                <p className="text-[11px] text-cyan-500 font-medium mb-2">{ship.type}</p>
                <div className="flex items-center gap-3 text-[10px] font-mono text-cyan-300/70">
                   <span className="flex items-center gap-1"><Users className="w-3 h-3"/> {ship.personnel.length} Kru</span>
                   <span className="flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> {ship.customCheckpoints.length} TITIK</span>
                </div>
             </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderShipDetail = () => {
    if (!activeShip) return null;
    return (
      <div className="p-4 space-y-4 animate-in slide-in-from-right-4 pb-10">
        <div className="h-40 rounded-2xl overflow-hidden relative border border-cyan-700 shadow-[0_0_20px_rgba(6,182,212,0.15)] group">
           <AsyncImage src={activeShip.photoUrl} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity duration-500" alt="Cover"/>
           <div className="absolute inset-0 bg-gradient-to-t from-[#070b19] via-[#070b19]/60 to-transparent"></div>
           <button onClick={() => { setActiveShipId(null); setIsEditingShipInfo(false); }} className="absolute top-3 left-3 bg-[#0b1229]/80 p-2 rounded-full border border-cyan-500/50 text-cyan-300 hover:text-white backdrop-blur-sm z-10 lg:hidden" aria-label="Kembali"><ChevronDown className="w-5 h-5 rotate-90"/></button>
           <button onClick={() => handleDeleteShip(activeShip.id)} className="absolute top-3 right-14 bg-rose-900/30 p-2 rounded-full border border-rose-500/50 text-rose-400 hover:bg-rose-500 hover:text-white backdrop-blur-sm z-10" title="Hapus Armada" aria-label="Hapus armada"><Trash2 className="w-4 h-4"/></button>
           <button onClick={handleShipPhotoUpdate} className="absolute top-3 right-3 bg-[#0b1229]/80 p-2 rounded-full border border-cyan-500/50 text-cyan-300 hover:text-white backdrop-blur-sm z-10" title="Edit Foto Armada" aria-label="Edit foto armada"><ImageIcon className="w-4 h-4"/></button>
           <div className="absolute bottom-3 left-4">
             <h2 className="text-3xl font-black text-white tracking-widest drop-shadow-md">{activeShip.name}</h2>
             <div className="flex items-center gap-2 mt-1">
               <span className="text-[10px] px-2 py-0.5 bg-cyan-900/80 border border-cyan-500/50 text-cyan-300 rounded font-bold uppercase tracking-widest backdrop-blur-sm">{activeShip.status}</span>
               <p className="text-xs text-cyan-400 font-bold uppercase tracking-widest">{activeShip.type}</p>
             </div>
           </div>
        </div>

        <div className="flex bg-[#0b1229] p-1 rounded-xl border border-cyan-800/50 overflow-x-auto no-scrollbar">
          {[
            {id: 'info', icon: <Ship className="w-4 h-4"/>, label: 'Data'},
            {id: 'personil', icon: <Users className="w-4 h-4"/>, label: 'Kru'},
            {id: 'checkpoints', icon: <ShieldAlert className="w-4 h-4"/>, label: 'TITIK'},
            {id: 'documents', icon: <FileText className="w-4 h-4"/>, label: 'Dokumen'}
          ].map(tab => (
            <button key={tab.id} onClick={() => setShipDetailTab(tab.id)} className={`flex-1 min-w-[80px] flex flex-col items-center gap-1 py-2 rounded-lg transition-all ${shipDetailTab === tab.id ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30' : 'text-cyan-700 hover:text-cyan-500'}`}>
               {tab.icon} <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
            </button>
          ))}
        </div>

        {shipDetailTab === 'info' && (
          <div className="space-y-3 animate-in fade-in">
             <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-800/50 space-y-4 relative text-left">
                {!isEditingShipInfo ? (
                  <>
                    <button onClick={() => { setEditShipInfoData(activeShip); setIsEditingShipInfo(true); }} className="absolute top-4 right-4 text-[10px] bg-cyan-900/50 text-cyan-300 px-2.5 py-1.5 rounded-lg border border-cyan-700 hover:bg-cyan-600 hover:text-white transition-colors shadow-sm font-bold tracking-widest uppercase">Edit Data</button>
                    <div>
                      <p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">{activeShip.status === 'UPP' ? 'Lokasi Sandar' : 'Rute Pelayaran'}</p>
                      <p className="text-sm text-cyan-50 font-medium flex items-center gap-2"><Navigation className="w-4 h-4 text-cyan-400"/> {activeShip.route || 'Belum diatur'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">Kapasitas & Muatan</p>
                      <div className="flex gap-4">
                         <p className="text-sm text-emerald-400 font-bold flex items-center gap-2"><Package className="w-4 h-4"/> {activeShip.cargoType || '-'}</p>
                         <p className="text-sm text-yellow-400 font-bold flex items-center gap-2"><Weight className="w-4 h-4"/> {activeShip.cargoAmount || '-'}</p>
                       </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-cyan-900/50 pb-2">
                       <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Edit Informasi</h4>
                       <div className="flex gap-2">
                          <button onClick={() => setIsEditingShipInfo(false)} className="text-[10px] bg-rose-900/30 text-rose-400 px-2.5 py-1.5 rounded-lg border border-rose-800 hover:bg-rose-900 transition-colors font-bold uppercase tracking-widest">Batal</button>
                          <button onClick={() => { updateActiveShip(editShipInfoData); setIsEditingShipInfo(false); }} className="text-[10px] bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)]">Simpan</button>
                       </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1.5 block">Status</label>
                      <select value={editShipInfoData.status} onChange={e => setEditShipInfoData({...editShipInfoData, status: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none">
                        <option value="UPP">UPP</option>
                        <option value="NON UPP">NON UPP</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1.5 block">{editShipInfoData.status === 'UPP' ? 'Lokasi Sandar' : 'Rute Pelayaran'}</label>
                      <input type="text" value={editShipInfoData.route} onChange={e => setEditShipInfoData({...editShipInfoData, route: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1.5 block">Jenis Muatan</label>
                        <input type="text" value={editShipInfoData.cargoType} onChange={e => setEditShipInfoData({...editShipInfoData, cargoType: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1.5 block">Jumlah Muatan</label>
                        <input type="text" value={editShipInfoData.cargoAmount} onChange={e => setEditShipInfoData({...editShipInfoData, cargoAmount: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-cyan-400 outline-none" />
                      </div>
                    </div>
                  </div>
                )}
             </div>
          </div>
        )}

        {shipDetailTab === 'personil' && (
          <div className="space-y-4 animate-in fade-in">
             <div className="flex gap-2 bg-[#070b19] p-1.5 rounded-full border border-cyan-900/50">
                <button onClick={() => setScheduleMonth('current')} className={`flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${scheduleMonth === 'current' ? 'bg-cyan-600 text-white' : 'text-cyan-600'}`}>Bulan Ini</button>
                <button onClick={() => setScheduleMonth('next')} className={`flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-1 ${scheduleMonth === 'next' ? 'bg-fuchsia-600 text-white' : 'text-cyan-600'}`}>
                  <CalendarClock className="w-3.5 h-3.5"/> Bulan Depan
                </button>
             </div>

             <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-800/50 text-left">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 border-b border-cyan-900/50 pb-2">Ditugaskan ({scheduleMonth === 'current' ? 'Sekarang' : 'Depan'})</h4>
                <div className="space-y-2 mb-6">
                   {activeShip[scheduleMonth === 'current' ? 'personnel' : 'personnelNextMonth'].length === 0 ? (
                     <p className="text-xs text-rose-400 text-center py-3 italic border border-dashed border-rose-900/50 rounded-xl">Kosong</p>
                   ) : (
                     activeShip[scheduleMonth === 'current' ? 'personnel' : 'personnelNextMonth'].map(uid => {
                       const u = usersData.find(x => x.id === uid);
                       const schedule = activeShip.personnelSchedules?.[uid] || {};
                       return (
                         <div key={uid} className="flex flex-col gap-2 p-2 bg-[#070b19] border border-cyan-800/50 rounded-lg">
                           <div className="flex justify-between items-center">
                             <div className="flex flex-col">
                               <span className="text-sm font-bold text-white">{u?.name}</span>
                               <span className="text-[10px] text-cyan-500">{u?.role}</span>
                             </div>
                             <button onClick={() => handleTogglePersonnel(uid)} className="p-1.5 bg-rose-500/10 text-rose-400 rounded" aria-label="Hapus kru dari penugasan"><UserMinus className="w-4 h-4"/></button>
                           </div>
                           {scheduleMonth === 'next' ? (
                             <div className="flex gap-2 mt-1">
                               <div className="flex-1">
                                 <label className="text-[9px] text-cyan-600 font-bold uppercase block mb-1">Mulai Tgl</label>
                                 <input type="date" value={schedule.startDate || ''} onChange={e => handleChangeSchedule(uid, 'startDate', e.target.value)} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-lg p-1.5 text-[10px] text-cyan-300 focus:border-cyan-400 outline-none" />
                               </div>
                               <div className="flex-1">
                                 <label className="text-[9px] text-cyan-600 font-bold uppercase block mb-1">Berakhir Tgl</label>
                                 <input type="date" value={schedule.endDate || ''} onChange={e => handleChangeSchedule(uid, 'endDate', e.target.value)} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-lg p-1.5 text-[10px] text-cyan-300 focus:border-cyan-400 outline-none" />
                               </div>
                             </div>
                           ) : (
                             (schedule.startDate || schedule.endDate) && (
                               <div className="text-[10px] text-emerald-400 bg-emerald-900/20 px-2 py-1 rounded inline-block font-medium mt-0.5 self-start">
                                  Priode Aktif: {schedule.startDate || 'Sekarang'} s/d {schedule.endDate || '-'}
                               </div>
                             )
                           )}
                         </div>
                       );
                     })
                   )}
                </div>

                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 border-b border-cyan-900/50 pb-2">Tersedia (Off-Duty)</h4>
                <div className="space-y-2">
                   {usersData.filter(u => scheduleMonth === 'current' ? u.status === 'off-duty' : !activeShip.personnelNextMonth.includes(u.id)).map(u => (
                     <div key={u.id} className="flex justify-between items-center p-2 bg-[#070b19] border border-cyan-900/30 rounded-lg opacity-80 hover:opacity-100">
                       <div className="flex flex-col text-left"><span className="text-sm font-bold text-slate-300">{u?.name}</span><span className="text-[10px] text-slate-500">{u?.role}</span></div>
                       <button onClick={() => handleTogglePersonnel(u.id)} className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded" aria-label="Tambah kru ke penugasan"><UserPlus className="w-4 h-4"/></button>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        )}

        {shipDetailTab === 'checkpoints' && (
          <div className="space-y-4 animate-in fade-in">
             <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-800/50 space-y-3 text-left">
                {activeShip.customCheckpoints.length === 0 ? (
                   <p className="text-xs text-slate-500 text-center italic">Belum ada titik periksa.</p>
                ) : (
                   activeShip.customCheckpoints.map((cp, idx) => (
                     <div key={idx} className="p-3 bg-[#070b19] border border-cyan-800/50 rounded-xl flex justify-between items-start">
                       <div>
                          <p className="font-bold text-cyan-100 flex items-center gap-2 text-left">
                            <span className="text-[9px] text-cyan-600 border border-cyan-800 px-1 rounded shrink-0">TITIK-{idx+1}</span>
                            {cp.name}
                            {cp.isDefault && <span className="text-[9px] uppercase tracking-widest text-emerald-300 border border-emerald-500/40 px-1 rounded shrink-0">Default</span>}
                          </p>
                          <p className="text-xs text-cyan-500 mt-1">{cp.desc || 'Tanpa deskripsi'}</p>
                       </div>
                       <button onClick={() => updateActiveShip({customCheckpoints: activeShip.customCheckpoints.filter((_,i)=>i!==idx)})} className="p-1 rounded text-rose-500 hover:bg-rose-500/20" aria-label="Hapus titik periksa"><Trash2 className="w-4 h-4"/></button>
                     </div>
                   ))
                )}
                <div className="pt-3 border-t border-cyan-900/50 space-y-2">
                   <input type="text" placeholder="Nama Titik..." value={newShipCp.name} onChange={e=>setNewShipCp({...newShipCp, name: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-lg p-2 text-sm focus:border-cyan-400 outline-none text-white"/>
                   <input type="text" placeholder="Deskripsi instruksi..." value={newShipCp.desc} onChange={e=>setNewShipCp({...newShipCp, desc: e.target.value})} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-lg p-2 text-sm focus:border-cyan-400 outline-none text-white"/>
                   <button onClick={handleAddShipCp} className="w-full py-2 bg-cyan-900/50 hover:bg-cyan-600 text-cyan-300 hover:text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-colors">Tambah Titik</button>
                </div>
             </div>
          </div>
        )}

        {shipDetailTab === 'documents' && (
          <div className="space-y-4 animate-in fade-in">
             <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-800/50 space-y-3 text-left">
                <div className="flex items-center justify-between gap-3 border-b border-cyan-900/50 pb-3">
                   <div>
                      <p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest">Dokumen Armada</p>
                      <p className="text-xs text-cyan-400 mt-1">Upload arsip kapal melalui form dokumen.</p>
                   </div>
                   <button onClick={openShipDocForm} className="px-3 py-2 bg-emerald-900/30 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-800/50 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5">
                     <FilePlus className="w-3.5 h-3.5" /> Add New
                   </button>
                </div>
                {activeShip.documents.length === 0 ? (
                   <p className="text-xs text-slate-500 text-center italic">Belum ada dokumen terlampir.</p>
                ) : (
                   activeShip.documents.map((doc, idx) => (
                     <div key={idx} className="p-3 bg-[#070b19] border border-cyan-800/50 rounded-xl flex justify-between items-start gap-3">
                       <div className="flex gap-3 items-start">
                          <DocumentTypeIcon document={doc} />
                          <div>
                             <p className="font-bold text-cyan-100">{doc.title}</p>
                             <p className="text-xs text-cyan-500 mt-1">{doc.desc}</p>
                             <p className="text-[11px] text-emerald-300 mt-2">{doc.fileName || 'Tanpa file digital'}</p>
                          </div>
                       </div>
                       <div className="flex items-center gap-1">
                         {doc.fileUrl && (
                           <button onClick={() => handleDownloadShipDoc(doc)} className="p-1.5 text-emerald-400 hover:bg-emerald-500/15 rounded-lg" aria-label="Unduh dokumen">
                             <Download className="w-4 h-4"/>
                           </button>
                         )}
                         <button onClick={() => updateActiveShip({documents: activeShip.documents.filter((_,i)=>i!==idx)})} className="p-1.5 text-rose-500 hover:bg-rose-500/20 rounded-lg" aria-label="Hapus dokumen"><Trash2 className="w-4 h-4"/></button>
                       </div>
                     </div>
                   ))
                )}
             </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Pane: List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-cyan-900/50 lg:border-r lg:border-cyan-900/50">
        <div className="lg:hidden">
           {!activeShipId ? renderShipsList() : renderShipDetail()}
        </div>
        <div className="hidden lg:block">
           {renderShipsList()}
        </div>
      </div>

      {/* Right Pane: Detail or Form */}
      <div className="hidden lg:block flex-1 bg-[#070b19] shrink-0 overflow-y-auto scrollbar-thin scrollbar-thumb-cyan-900/50 relative border-l border-cyan-900/50">
         {showShipForm && <ShipFormView isInline={true} />}
         {(!showShipForm && showShipDocForm) && <ShipDocumentFormView isInline={true} />}
         {(!showShipForm && !showShipDocForm && activeShipId) && renderShipDetail()}
         
         {!showRightPane && (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-cyan-800">
               <div className="w-16 h-16 rounded-full bg-cyan-900/20 flex items-center justify-center mb-4">
                  <Anchor className="w-8 h-8 opacity-20" />
               </div>
               <p className="text-sm font-bold uppercase tracking-widest mb-1">Manajemen Armada</p>
               <p className="text-xs opacity-60">Pilih armada kapal di sebelah kiri untuk mengelola personil, rute patroli, dan dokumen sertifikasi kapal.</p>
            </div>
         )}
      </div>
    </div>
  );
});

export default ShipsPage;
