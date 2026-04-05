import React from 'react';
import { useApp } from '../context/AppContext';
import { AlertOctagon, PlusCircle, User } from 'lucide-react';
import AsyncImage from '../components/AsyncImage';

import IncidentDetailView from '../components/views/IncidentDetailView';
import IncidentFormView from '../components/views/IncidentFormView';

const IncidentsPage = React.memo(function IncidentsPage() {
  const {
    visibleIncidents,
    operationalShipName,
    openIncidentModal,
    closeIncidentModal,
    setSelectedIncident,
    incidentMeta,
    selectedIncident,
    showIncidentModal,
  } = useApp();
  const [statusFilter, setStatusFilter] = React.useState('open');

  const showRightPane = (selectedIncident && !selectedIncident.isPatrol) || showIncidentModal;
  const handleIncidentSelect = (incident) => {
    if (showIncidentModal) {
      closeIncidentModal();
    }
    setSelectedIncident(incident);
  };
  const incidentGroups = React.useMemo(() => {
    const open = [];
    const closed = [];

    visibleIncidents.forEach((incident) => {
      const meta = incidentMeta[incident.id] || { status: 'open' };
      if (meta.status === 'closed') {
        closed.push(incident);
        return;
      }

      open.push(incident);
    });

    return { open, closed };
  }, [incidentMeta, visibleIncidents]);
  const filteredIncidents = statusFilter === 'closed' ? incidentGroups.closed : incidentGroups.open;

  React.useEffect(() => {
    if (!selectedIncident) return;
    if (filteredIncidents.some((incident) => incident.id === selectedIncident.id)) return;
    setSelectedIncident(null);
  }, [filteredIncidents, selectedIncident, setSelectedIncident]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Pane: List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-in fade-in scrollbar-thin scrollbar-thumb-cyan-900/50">
        <div className="flex justify-between items-center mb-2">
           <h2 className="text-xl font-bold text-yellow-400 flex items-center gap-2 drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]">
             <AlertOctagon className="w-5 h-5" /> Pelaporan Temuan
           </h2>
           <button onClick={openIncidentModal} className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 text-xs font-bold rounded-lg flex items-center gap-1 shadow-[0_0_10px_rgba(250,204,21,0.2)] hover:bg-yellow-500/30 transition-all active:scale-95">
             <PlusCircle className="w-3.5 h-3.5" /> Lapor Baru
           </button>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-cyan-900/50 bg-[#0b1229] p-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter('open')}
            className={`flex-1 rounded-xl px-3 py-2 text-left transition-all ${statusFilter === 'open' ? 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/40' : 'border border-transparent text-cyan-500 hover:text-cyan-300'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest">Open</p>
              <p className="text-sm font-black">{incidentGroups.open.length}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('closed')}
            className={`flex-1 rounded-xl px-3 py-2 text-left transition-all ${statusFilter === 'closed' ? 'bg-slate-800/80 text-slate-200 border border-slate-600' : 'border border-transparent text-cyan-500 hover:text-cyan-300'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest">Closed</p>
              <p className="text-sm font-black">{incidentGroups.closed.length}</p>
            </div>
          </button>
        </div>
        
         {filteredIncidents.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-cyan-900/50 rounded-xl">
              <AlertOctagon className="w-10 h-10 text-cyan-900 mx-auto mb-2" />
              <p className="text-cyan-600 text-sm font-bold uppercase tracking-widest">
                {statusFilter === 'closed' ? 'Belum Ada Temuan Closed' : 'Belum Ada Temuan Open'}
              </p>
            </div>
         ) : (
            <div className="space-y-3">
              {filteredIncidents.map(inc => {
                 const meta = incidentMeta[inc.id] || { status: 'open' };
                 const isClosed = meta.status === 'closed';
                 const isSelected = selectedIncident?.id === inc.id;
                 
                 return (
                <div 
                  key={inc.id} 
                  onClick={() => handleIncidentSelect(inc)}
                  className={`p-4 border rounded-xl transition-all cursor-pointer group relative overflow-hidden flex gap-3 ${isSelected ? 'border-yellow-500 bg-yellow-500/10 shadow-[0_0_15px_rgba(250,204,21,0.1)]' : (isClosed ? 'bg-slate-900/40 border-slate-800' : 'bg-yellow-950/10 border-yellow-900/40 hover:border-yellow-500/50')}`}
                >
                   <div className={`absolute left-0 top-0 bottom-0 w-1 ${isClosed ? 'bg-slate-700' : (inc.isPatrol ? 'bg-emerald-500' : 'bg-yellow-500')}`}></div>
                   <div className="flex-1 ml-1 min-w-0 flex flex-col justify-between">
                      <div>
                         <div className="flex items-center gap-2 mb-2">
                           <h3 className={`font-bold text-lg leading-tight truncate ${isClosed ? 'text-slate-400' : (isSelected ? 'text-white' : 'text-yellow-400')}`}>{inc.location}</h3>
                           {isClosed ? (
                              <span className="shrink-0 text-[8px] px-1.5 py-0.5 border border-slate-600 text-slate-400 bg-slate-800/50 rounded uppercase font-black tracking-widest">CLOSED</span>
                           ) : (
                              <span className="shrink-0 text-[8px] px-1.5 py-0.5 border border-yellow-500 text-yellow-400 bg-yellow-500/10 rounded uppercase font-black tracking-widest animate-pulse">OPEN</span>
                           )}
                         </div>
                         <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-600 mb-2">{inc.shipName || operationalShipName}</p>
                         <p className={`text-xs ${isClosed ? 'text-slate-500' : 'text-yellow-100/70'} line-clamp-2 leading-relaxed mb-3`}>"{inc.deskripsi}"</p>
                      </div>
                      <div className={`mt-auto flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold ${isClosed ? 'text-slate-600' : 'text-cyan-600'}`}>
                         <User className="w-3 h-3 shrink-0"/> <span className="truncate">oleh <span className={isClosed ? 'text-slate-500' : 'text-cyan-400'}>{inc.reportedBy}</span></span>
                      </div>
                   </div>
                   <div className="flex flex-col items-end justify-between shrink-0 gap-2">
                      {inc.photoUrl ? (
                         <div className={`w-20 h-20 rounded-lg overflow-hidden border shadow-sm ${isSelected ? 'border-yellow-400' : (isClosed ? 'border-slate-700' : 'border-yellow-700/50')}`}>
                            <AsyncImage src={inc.photoUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Thumb"/>
                         </div>
                      ) : (
                         <div className="w-20 h-20"></div>
                      )}
                      <span className="shrink-0 whitespace-nowrap text-[9px] text-cyan-500 font-mono bg-[#070b19] px-2 py-1 rounded border border-cyan-900 inline-block mt-auto uppercase tracking-tighter">{inc.date} | {inc.time}</span>
                   </div>
                </div>
                );
              })}
            </div>
         )}
      </div>

      {/* Right Pane: Detail or Form */}
      <div className="hidden lg:block flex-1 border-l border-cyan-900/50 bg-[#070b19] shrink-0 overflow-hidden relative">
         {showIncidentModal && <IncidentFormView isInline={true} />}
         {(!showIncidentModal && selectedIncident) && <IncidentDetailView isInline={true} />}
         
         {!showRightPane && (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-cyan-800">
               <div className="w-16 h-16 rounded-full bg-cyan-900/20 flex items-center justify-center mb-4">
                  <AlertOctagon className="w-8 h-8 opacity-20" />
               </div>
               <p className="text-sm font-bold uppercase tracking-widest mb-1">Detail Temuan</p>
               <p className="text-xs opacity-60">Pilih laporan temuan di sebelah kiri untuk melihat detail perkembangan, kronologi 5W1H, dan tindak lanjut.</p>
            </div>
         )}
      </div>
    </div>
  );
});


export default IncidentsPage;
