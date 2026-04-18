import React, { useEffect, useState } from 'react';
import { useIncidents, useReports, useRole } from '../../context/AppContextRuntime';
import { ChevronDown, AlertTriangle, CheckCircle2, Camera, X, Plus, FileText, Trash2, Images, Pencil, Save } from 'lucide-react';
import AsyncImage from '../AsyncImage';
import { TimeAuditPills, TimeAuditRecordCard } from '../TimeAuditStatus';

function getIncidentStatus(selectedIncident, incidentMeta) {
  const metaStatus = incidentMeta[selectedIncident?.id]?.status;
  if (metaStatus) return metaStatus;
  if (selectedIncident?.isSOS) {
    return selectedIncident.sosStatus === 'resolved' ? 'closed' : 'open';
  }
  return 'open';
}

function createIncidentInfoState(incident) {
  return {
    deskripsi: incident?.deskripsi || '',
    penyebab: incident?.penyebab || '',
    tindakLanjut: incident?.tindakLanjut || '',
  };
}

export default function IncidentDetailView({ isInline = false }) {
  const {
    selectedIncident, setSelectedIncident, incidentMeta, canManageIncident,
    canCloseIncident, handleAddProgress, handleCloseIncident, handleDeleteIncident, newProgress,
    setNewProgress, handlePhotoProgress, handleUpdateIncidentPhoto, handleAddIncidentDocumentation,
    handleUpdateIncidentInfo,
  } = useIncidents();
  const { isAdmin, isPic } = useRole();
  const { setPreviewPhoto } = useReports();

  const [activeTab, setActiveTab] = useState('update');
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [incidentInfoForm, setIncidentInfoForm] = useState(() => createIncidentInfoState(null));

  useEffect(() => {
    setIncidentInfoForm(createIncidentInfoState(selectedIncident));
    setIsEditingInfo(false);
  }, [selectedIncident]);

  if (!selectedIncident) {
    if (isInline) return (
      <div className="h-full flex flex-col items-center justify-center text-cyan-800 p-8 text-center border-2 border-dashed border-cyan-900/30 rounded-3xl m-4">
        <div className="w-16 h-16 rounded-full bg-cyan-900/20 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 opacity-20" />
        </div>
        <p className="text-sm font-bold uppercase tracking-widest mb-1">Detail Temuan</p>
        <p className="text-xs opacity-60">Pilih salah satu temuan untuk melihat detail perkembangan atau statistik update.</p>
      </div>
    );
    return null;
  }

  const isReadOnly = Boolean(selectedIncident.readOnly);
  const isSOSIncident = Boolean(selectedIncident.isSOS);
  const incidentStatus = getIncidentStatus(selectedIncident, incidentMeta);
  const documentationItems = incidentMeta[selectedIncident.id]?.documentation || [];
  const canManageDetailActions = incidentStatus !== 'closed' && canManageIncident(selectedIncident);
  const canUploadDocumentation = canManageDetailActions;
  const canEditInfo = canManageIncident(selectedIncident);
  const canReplacePhoto = isAdmin && !isReadOnly && !isSOSIncident;
  const canDeleteIncident = isAdmin;
  const typeBadgeClass = isSOSIncident
    ? 'bg-rose-500/10 border-rose-500 text-rose-300'
    : 'bg-yellow-500/10 border-yellow-500 text-yellow-400';
  const titleClass = isSOSIncident ? 'text-rose-300' : 'text-yellow-400';
  const panelBorderClass = isSOSIncident ? 'border-rose-900/30' : 'border-yellow-900/30';
  const panelClass = isSOSIncident ? 'bg-rose-950/20' : 'bg-yellow-950/20';

  const saveIncidentInfo = () => {
    const didUpdate = handleUpdateIncidentInfo(selectedIncident.id, incidentInfoForm);
    if (didUpdate) {
      setIsEditingInfo(false);
    }
  };

  const renderInfoValue = (value, className = '') => (
    <p className={`text-sm leading-relaxed ${className}`}>{value || '-'}</p>
  );

  return (
    <div className={`flex flex-col h-full bg-[#070b19] ${isInline ? 'border-l border-cyan-900/50' : 'fixed inset-0 z-[100] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50'}`}>
      {selectedIncident.photoUrl ? (
        <div className="w-full h-64 bg-[#0b1229] relative shrink-0 cursor-pointer group" onClick={() => setPreviewPhoto({ url: selectedIncident.photoUrl, author: selectedIncident.reportedBy, time: `${selectedIncident.date} ${selectedIncident.time}` })}>
          <AsyncImage src={selectedIncident.photoUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt="Bukti" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#070b19]/80 via-transparent to-[#070b19]"></div>
          {!isInline && (
            <button onClick={(event) => { event.stopPropagation(); setSelectedIncident(null); }} className="absolute top-4 left-4 p-2 bg-black/50 text-white rounded-full backdrop-blur-md border border-white/20 hover:bg-black/70 transition-colors z-10" aria-label="Tutup detail"><ChevronDown className="w-6 h-6 rotate-90" /></button>
          )}
          {isAdmin && (
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
              {canReplacePhoto && (
                <button onClick={(event) => { event.stopPropagation(); handleUpdateIncidentPhoto(selectedIncident.id); }} className="p-2 bg-emerald-500/80 text-white rounded-full backdrop-blur-md border border-emerald-400/50 hover:bg-emerald-500 transition-all shadow-lg" title="Ganti Foto Bukti" aria-label="Ganti Foto Bukti">
                  <Camera className="w-5 h-5" />
                </button>
              )}
              {canDeleteIncident && (
                <button onClick={(event) => { event.stopPropagation(); handleDeleteIncident(selectedIncident.id); }} className="p-2 bg-rose-500/80 text-white rounded-full backdrop-blur-md border border-rose-400/50 hover:bg-rose-500 transition-all shadow-lg" title="Hapus Temuan" aria-label="Hapus Temuan">
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
          <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs text-white/90 text-right border border-cyan-900/50 z-10 shadow-lg">
            <p className={`font-bold ${isSOSIncident ? 'text-rose-300' : 'text-yellow-400'}`}>{selectedIncident.reportedBy}</p>
            <p className="text-[10px] text-cyan-100/70">{selectedIncident.date} {selectedIncident.time}</p>
          </div>
          <div className="absolute bottom-4 left-4 right-36 z-10">
            <span className={`text-[10px] px-2 py-1 border rounded font-bold mb-2 inline-block shadow-sm ${typeBadgeClass}`}>{isSOSIncident ? 'SOS DARURAT' : 'TEMUAN'}</span>
            <h2 className="text-2xl font-black text-white drop-shadow-md leading-tight line-clamp-2">{selectedIncident.location}</h2>
          </div>
        </div>
      ) : (
        <div className={`p-4 border-b flex items-center gap-3 bg-[#0b1229] shrink-0 shadow-sm ${isSOSIncident ? 'border-rose-500/30' : 'border-yellow-500/30'}`}>
          {!isInline && (
            <button onClick={() => setSelectedIncident(null)} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Tutup detail"><ChevronDown className="w-5 h-5 rotate-90" /></button>
          )}
          <div className="flex-1">
            <span className={`text-[10px] uppercase tracking-widest font-bold ${isSOSIncident ? 'text-rose-400' : 'text-cyan-500'}`}>{isSOSIncident ? 'Informasi SOS' : 'Detail Temuan'}</span>
            <h3 className={`font-bold text-xl line-clamp-1 ${titleClass}`}>{selectedIncident.location}</h3>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              {canReplacePhoto && (
                <button onClick={() => handleUpdateIncidentPhoto(selectedIncident.id)} className="p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-all" title="Ganti Foto Bukti" aria-label="Ganti Foto Bukti">
                  <Camera className="w-4 h-4" />
                </button>
              )}
              {canDeleteIncident && (
                <button onClick={() => handleDeleteIncident(selectedIncident.id)} className="p-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg hover:bg-rose-500/20 transition-all" title="Hapus Temuan" aria-label="Hapus Temuan">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex bg-[#0b1229] border-b border-cyan-900/50 shrink-0">
        <button onClick={() => setActiveTab('update')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === 'update' ? 'text-emerald-400 border-emerald-500 bg-emerald-500/5' : 'text-cyan-600 border-transparent hover:text-cyan-400'}`}>Update</button>
        <button onClick={() => setActiveTab('documentation')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === 'documentation' ? 'text-fuchsia-400 border-fuchsia-500 bg-fuchsia-500/5' : 'text-cyan-600 border-transparent hover:text-cyan-400'}`}>Dokumentasi</button>
        <button onClick={() => setActiveTab('info')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === 'info' ? (isSOSIncident ? 'text-rose-300 border-rose-500 bg-rose-500/5' : 'text-yellow-400 border-yellow-500 bg-yellow-500/5') : 'text-cyan-600 border-transparent hover:text-cyan-400'}`}>Info (5W1H)</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6 text-cyan-50">
        <TimeAuditRecordCard
          record={selectedIncident}
          title={isSOSIncident ? 'Audit Timestamp SOS' : 'Audit Timestamp Temuan'}
          fallbackTimestampKeys={['completedAt', 'createdAt', 'triggeredAt']}
        />

        {activeTab === 'info' ? (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {canEditInfo && (
              <div className="flex items-center justify-end gap-2">
                {isEditingInfo && (
                  <button onClick={() => { setIncidentInfoForm(createIncidentInfoState(selectedIncident)); setIsEditingInfo(false); }} className="px-3 py-2 rounded-xl border border-cyan-800/60 text-cyan-300 text-[11px] font-black uppercase tracking-widest hover:bg-cyan-900/30 transition-all">
                    Batal
                  </button>
                )}
                <button onClick={() => { if (isEditingInfo) { saveIncidentInfo(); return; } setIsEditingInfo(true); }} className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${isEditingInfo ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20' : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/20'}`}>
                  {isEditingInfo ? <Save className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                  {isEditingInfo ? 'Simpan Info' : 'Edit Info'}
                </button>
              </div>
            )}

            <div className={`p-4 rounded-xl border ${panelClass} ${panelBorderClass}`}>
              <p className={`text-[10px] font-bold mb-2 flex items-center gap-1.5 uppercase tracking-widest ${isSOSIncident ? 'text-rose-400' : 'text-yellow-600'}`}><AlertTriangle className="w-3 h-3" /> WHAT : Deskripsi</p>
              {isEditingInfo ? (
                <textarea
                  value={incidentInfoForm.deskripsi}
                  onChange={(event) => setIncidentInfoForm((previousValue) => ({ ...previousValue, deskripsi: event.target.value }))}
                  rows={4}
                  className="w-full bg-[#070b19]/70 border border-cyan-800/40 rounded-2xl p-4 text-sm text-cyan-50 focus:border-yellow-500/50 outline-none resize-none"
                />
              ) : renderInfoValue(selectedIncident.deskripsi, isSOSIncident ? 'text-rose-50/90' : 'text-yellow-50/90 font-medium')}
            </div>

            <div className="bg-cyan-950/20 p-4 rounded-xl border border-cyan-900/30">
              <p className="text-[10px] text-cyan-600 font-bold mb-2 uppercase tracking-widest">WHERE : Lokasi & Kapal</p>
              <p className="text-sm font-bold text-cyan-50">{selectedIncident.location}</p>
              <p className="text-xs text-cyan-400/70">{selectedIncident.shipName || '-'}</p>
              {isSOSIncident && Array.isArray(selectedIncident.targetShipNames) && selectedIncident.targetShipNames.length > 0 && (
                <p className="text-[11px] text-cyan-500 mt-2">Distribusi SOS: {selectedIncident.targetShipNames.join(', ')}</p>
              )}
            </div>

            <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50">
              <p className="text-[10px] text-cyan-600 font-bold mb-2 uppercase tracking-widest">WHEN : Waktu Kejadian</p>
              <p className="text-sm font-bold text-cyan-50">{selectedIncident.date} {' · '} {selectedIncident.time}</p>
            </div>

            <div className={`p-4 rounded-xl border ${isSOSIncident ? 'bg-rose-950/10 border-rose-900/20' : 'bg-yellow-950/10 border-yellow-900/20'}`}>
              <p className={`text-[10px] font-bold mb-2 uppercase tracking-widest ${isSOSIncident ? 'text-rose-500' : 'text-yellow-700'}`}>WHY : Penyebab</p>
              {isEditingInfo ? (
                <textarea
                  value={incidentInfoForm.penyebab}
                  onChange={(event) => setIncidentInfoForm((previousValue) => ({ ...previousValue, penyebab: event.target.value }))}
                  rows={3}
                  className="w-full bg-[#070b19]/70 border border-cyan-800/40 rounded-2xl p-4 text-sm text-cyan-50 focus:border-yellow-500/50 outline-none resize-none"
                />
              ) : renderInfoValue(selectedIncident.penyebab, isSOSIncident ? 'text-rose-50/80 italic' : 'text-yellow-50/80 italic')}
            </div>

            <div className="bg-[#0b1229] p-4 rounded-xl border border-cyan-900/50">
              <p className="text-[10px] text-cyan-600 font-bold mb-2 uppercase tracking-widest">WHO : Pelapor</p>
              <p className="text-sm font-bold text-cyan-50">{selectedIncident.reportedBy}</p>
            </div>

            <div className={`p-4 rounded-xl border ${isSOSIncident ? 'bg-rose-950/20 border-rose-900/30' : 'bg-emerald-950/20 border-emerald-900/30'}`}>
              <p className={`text-[10px] font-bold mb-2 flex items-center gap-1.5 uppercase tracking-widest ${isSOSIncident ? 'text-rose-400' : 'text-emerald-600'}`}><CheckCircle2 className="w-3 h-3" /> HOW : Tindak Lanjut</p>
              {isEditingInfo ? (
                <textarea
                  value={incidentInfoForm.tindakLanjut}
                  onChange={(event) => setIncidentInfoForm((previousValue) => ({ ...previousValue, tindakLanjut: event.target.value }))}
                  rows={4}
                  className="w-full bg-[#070b19]/70 border border-cyan-800/40 rounded-2xl p-4 text-sm text-cyan-50 focus:border-emerald-500/50 outline-none resize-none"
                />
              ) : renderInfoValue(selectedIncident.tindakLanjut, isSOSIncident ? 'text-rose-50/90' : 'text-emerald-50/90')}
            </div>
          </div>
        ) : activeTab === 'documentation' ? (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center bg-[#0b1229] p-3 rounded-xl border border-cyan-900/50 shadow-sm">
              <div>
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Galeri Dokumentasi</span>
                <p className="text-[11px] text-cyan-600 mt-1">{documentationItems.length} foto dokumentasi tersimpan</p>
              </div>
              {canUploadDocumentation && (
                <button onClick={() => handleAddIncidentDocumentation(selectedIncident.id)} className="px-3 py-2 bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-fuchsia-500 hover:text-white transition-all flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Upload
                </button>
              )}
            </div>

            {documentationItems.length === 0 ? (
              <div className="border border-dashed border-cyan-900/50 rounded-2xl p-8 text-center bg-[#0b1229]/30">
                <Images className="w-10 h-10 text-cyan-800 mx-auto mb-3" />
                <p className="text-sm font-bold text-cyan-500 uppercase tracking-widest">Belum Ada Dokumentasi</p>
                <p className="text-xs text-cyan-700 mt-2">{isSOSIncident ? 'Data SOS belum memiliki dokumentasi foto.' : 'Upload foto dokumentasi temuan untuk melengkapi bukti lapangan.'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {documentationItems.map((item) => (
                  <button
                    key={item.id || item.createdAt}
                    type="button"
                    onClick={() => setPreviewPhoto({ url: item.photoUrl, author: item.author, time: `${item.date || '-'} ${item.time || '-'}` })}
                    className="group overflow-hidden rounded-2xl border border-cyan-800/50 bg-[#0b1229] text-left hover:border-fuchsia-500/40 transition-all"
                  >
                    <div className="aspect-square bg-[#070b19] overflow-hidden">
                      <AsyncImage src={item.photoUrl} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" alt="Dokumentasi temuan" />
                    </div>
                    <div className="space-y-2 border-t border-cyan-900/40 p-3">
                      <p className="text-[11px] font-bold text-cyan-100">{item.date || '-'} {item.time || '-'}</p>
                      <TimeAuditPills record={item} fallbackTimestampKeys={['createdAt']} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center bg-[#0b1229] p-3 rounded-xl border border-cyan-900/50 shadow-sm">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Status Terkini</span>
              {incidentStatus === 'closed'
                ? <span className={`text-[10px] px-3 py-1.5 border rounded font-black tracking-widest ${isSOSIncident ? 'bg-rose-950/30 border-rose-700 text-rose-300' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>{isSOSIncident ? 'RESOLVED' : 'CLOSED'}</span>
                : <span className={`text-[10px] px-3 py-1.5 border rounded font-black tracking-widest ${isSOSIncident ? 'bg-rose-500/10 border-rose-500 text-rose-300' : 'bg-yellow-500/10 border-yellow-500 text-yellow-400'}`}>{isSOSIncident ? 'ACTIVE SOS' : 'OPEN'}</span>}
            </div>

            <div className="pt-2">
              <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-2"><FileText className="w-4 h-4" /> RIWAYAT UPDATE</h4>
              <div className="space-y-5 border-l-2 border-cyan-800 ml-2 pl-5">
                {incidentMeta[selectedIncident.id]?.progress?.map((prog, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[25px] top-0 w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] border-2 border-[#070b19]"></div>
                    <p className="text-[10px] font-mono text-cyan-500 mb-1.5">{prog.date} {prog.time} {' · '} <span className="text-emerald-400 font-bold">{prog.author}</span></p>
                    <TimeAuditPills record={prog} fallbackTimestampKeys={['createdAt']} className="mb-2" />
                    <div className="flex gap-3 items-start bg-[#0b1229] p-3.5 rounded-xl border border-cyan-900/50 shadow-sm hover:border-cyan-700 transition-colors">
                      <p className="text-sm text-cyan-50 flex-1 whitespace-pre-wrap leading-relaxed">{prog.comment}</p>
                      {prog.photoUrl && <div className="w-20 h-20 rounded-lg overflow-hidden border border-cyan-800 flex-shrink-0 cursor-pointer hover:opacity-80 transition-all relative group" onClick={() => setPreviewPhoto({ url: prog.photoUrl, author: prog.author, time: `${prog.date} ${prog.time}` })}><AsyncImage src={prog.photoUrl} className="w-full h-full object-cover" alt="Progress" /></div>}
                    </div>
                  </div>
                ))}
                {(!incidentMeta[selectedIncident.id]?.progress || incidentMeta[selectedIncident.id]?.progress.length === 0) && (
                  <p className="text-sm text-cyan-700 italic border border-dashed border-cyan-900/50 p-4 rounded-xl text-center">{isSOSIncident ? 'Belum ada update tindak lanjut SOS.' : 'Belum ada update progres.'}</p>
                )}
              </div>
            </div>

            {canManageDetailActions && (
              canManageIncident(selectedIncident) ? (
                <div className="pt-2">
                  <button onClick={() => setShowUpdateForm(true)} className="w-full py-4 bg-emerald-600/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-600 hover:text-white transition-all shadow-lg active:scale-[0.98]">
                    <Plus className="w-5 h-5" /> Tambah Update
                  </button>
                </div>
              ) : (
                <div className="bg-[#0b1229] p-4 rounded-xl border border-amber-900/50 mt-6"><p className="text-xs text-amber-300 leading-relaxed">Update terbatas.</p></div>
              )
            )}
          </div>
        )}
      </div>

      {incidentStatus !== 'closed' && canCloseIncident(selectedIncident) && (
        <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe">
          <button onClick={() => handleCloseIncident(selectedIncident.id)} className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs border border-rose-500 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(244,63,94,0.15)]"><CheckCircle2 className="w-5 h-5" /> {isSOSIncident ? 'Tutup SOS (Selesai)' : 'Tutup Temuan (Selesai)'}</button>
        </div>
      )}

      {showUpdateForm && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#070b19]/90 backdrop-blur-md animate-in fade-in" onClick={() => setShowUpdateForm(false)}></div>
          <div className="bg-[#0b1229] w-full max-w-sm rounded-[2rem] border border-cyan-900/50 shadow-2xl relative animate-in slide-in-from-bottom-10 overflow-hidden">
            <div className="p-5 border-b border-cyan-800/30 flex justify-between items-center bg-[#070b19]/40">
              <h3 className="font-bold text-cyan-50">Update Baru</h3>
              <button onClick={() => setShowUpdateForm(false)} className="p-2 hover:bg-white/5 rounded-xl transition-all"><X className="w-5 h-5 text-cyan-700" /></button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="text-[10px] font-mono text-cyan-500 block uppercase tracking-widest font-bold mb-2 ml-1">Detail Perkembangan</label>
                <textarea autoFocus value={newProgress.comment} onChange={event => setNewProgress({ ...newProgress, comment: event.target.value })} placeholder="Ceritakan perkembangan terbaru..." rows={4} className="w-full bg-[#070b19]/60 border border-cyan-800/40 rounded-2xl p-4 text-sm text-cyan-50 focus:border-emerald-500/50 outline-none resize-none" />
              </div>

              <div className="space-y-2.5">
                <label className="text-[10px] font-mono text-cyan-500 block uppercase tracking-widest font-bold mb-1 ml-1">Lampiran Foto</label>
                {!newProgress.photoUrl ? (
                  <button onClick={handlePhotoProgress} className="w-full py-8 rounded-2xl border-2 border-dashed border-cyan-800/30 bg-[#070b19]/40 text-cyan-600 text-xs font-bold flex flex-col items-center justify-center gap-3 hover:text-cyan-400 transition-all group">
                    <Camera className="w-6 h-6 text-cyan-700 group-hover:text-emerald-500" />
                    <span className="tracking-widest uppercase text-[10px]">Ketuk untuk mengambil foto</span>
                  </button>
                ) : (
                  <div className="relative aspect-video rounded-2xl overflow-hidden border border-emerald-500/30 shadow-2xl group">
                    <AsyncImage src={newProgress.photoUrl} className="w-full h-full object-cover" alt="Preview" />
                    <button onClick={() => setNewProgress({ ...newProgress, photoUrl: null })} className="absolute top-3 right-3 p-2 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-all shadow-xl shadow-rose-900/20 active:scale-95" aria-label="Hapus foto"><X className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            </div>
            <div className="p-5 bg-[#070b19]/40 border-t border-cyan-800/30 flex gap-4">
              <button onClick={() => setShowUpdateForm(false)} className="flex-1 py-4 text-xs font-bold text-cyan-700 hover:text-cyan-400 transition-colors uppercase tracking-widest">Batal</button>
              <button disabled={!newProgress.comment && !newProgress.photoUrl} onClick={() => { handleAddProgress(selectedIncident.id); setShowUpdateForm(false); }} className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 active:scale-95 border border-emerald-400/20">Simpan Update</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
