import React from 'react';
import { useApp } from '../context/AppContext';
import { AlertOctagon, PlusCircle, User } from 'lucide-react';
import AsyncImage from '../components/AsyncImage';

const IncidentsPage = React.memo(function IncidentsPage() {
  const { visibleIncidents, operationalShipName, openIncidentModal, setSelectedIncident, incidentMeta } = useApp();

  return (
    <div className="p-4 space-y-4 animate-in fade-in">
      <div className="flex justify-between items-center mb-2">
         <h2 className="text-xl font-bold text-yellow-400 flex items-center gap-2 drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]">
           <AlertOctagon className="w-5 h-5" /> Pelaporan Temuan
         </h2>
         <button onClick={openIncidentModal} className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 text-xs font-bold rounded-lg flex items-center gap-1 shadow-[0_0_10px_rgba(250,204,21,0.2)]">
           <PlusCircle className="w-3.5 h-3.5" /> Lapor Baru
         </button>
      </div>
      
       {visibleIncidents.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-cyan-900/50 rounded-xl">
            <AlertOctagon className="w-10 h-10 text-cyan-900 mx-auto mb-2" />
            <p className="text-cyan-600 text-sm font-bold uppercase tracking-widest">Belum Ada Laporan Temuan</p>
          </div>
       ) : (
          <div className="space-y-3">
            {visibleIncidents.map(inc => {
               const meta = incidentMeta[inc.id] || { status: 'open' };
               const isClosed = meta.status === 'closed';
               return (
              <div key={inc.id} onClick={() => setSelectedIncident(inc)} className={`p-4 ${isClosed ? 'bg-slate-900/40 border-slate-800' : 'bg-yellow-950/10 border-yellow-900/40 hover:border-yellow-500/50'} border rounded-xl transition-colors cursor-pointer group relative overflow-hidden flex gap-3`}>
                 <div className={`absolute left-0 top-0 bottom-0 w-1 ${isClosed ? 'bg-slate-700' : (inc.isPatrol ? 'bg-emerald-500' : 'bg-yellow-500')}`}></div>
                 <div className="flex-1 ml-1 min-w-0 flex flex-col justify-between">
                    <div>
                       <div className="flex items-start justify-between gap-2 mb-2">
                         <h3 className={`font-bold text-lg leading-tight flex-1 min-w-0 ${isClosed ? 'text-slate-400' : 'text-yellow-400'}`}>{inc.location}</h3>
                         <span className="shrink-0 whitespace-nowrap text-[10px] text-cyan-500 font-mono bg-[#070b19] px-2 py-1 rounded border border-cyan-900 inline-block">{inc.date} | {inc.time}</span>
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
                       <div className={`w-20 h-20 rounded-lg overflow-hidden border shadow-sm ${isClosed ? 'border-slate-700' : 'border-yellow-700/50'}`}>
                          <AsyncImage src={inc.photoUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Thumb"/>
                       </div>
                    ) : (
                       <div className="w-20 h-20"></div>
                    )}
                    {isClosed ? (
                       <span className="text-[9px] px-2 py-0.5 border border-slate-600 text-slate-400 bg-slate-800/50 rounded uppercase font-bold tracking-widest text-center mt-auto w-full">CLOSED</span>
                    ) : (
                       <span className="text-[9px] px-2 py-0.5 border border-yellow-500 text-yellow-400 bg-yellow-500/10 rounded uppercase font-bold tracking-widest text-center mt-auto w-full">OPEN</span>
                    )}
                 </div>
              </div>
              );
           })}
          </div>
      )}
    </div>
  );
});

export default IncidentsPage;
