import React from 'react';
import { useApp } from '../context/AppContext';
import { Home, AlertOctagon, FileText, Users, Anchor } from 'lucide-react';

const BottomNav = React.memo(function BottomNav() {
  const { currentPage, setCurrentPage, setActiveShipId, isAdmin, activeShipId, closeHistoryEntry, selectedHistoryEntry } = useApp();

  const tabs = [
    {id: 'home', icon: <Home className="w-5 h-5 mb-0.5"/>, label: 'Patroli'},
    {id: 'incidents', icon: <AlertOctagon className="w-5 h-5 mb-0.5"/>, label: 'Temuan'},
    {id: 'history', icon: <FileText className="w-5 h-5 mb-0.5"/>, label: 'Riwayat'},
    ...(isAdmin ? [
       {id: 'users', icon: <Users className="w-5 h-5 mb-0.5"/>, label: 'USER'},
       {id: 'ships', icon: <Anchor className="w-5 h-5 mb-0.5"/>, label: 'Armada'}
    ] : [])
  ];

  return (
    <div className="fixed bottom-0 w-full sm:max-w-md bg-[#0b1229] border-t border-cyan-800/50 pb-safe z-40">
      <div className="flex items-center justify-around p-1">
        {tabs.map(tab => (
           <button 
             key={tab.id} onClick={() => { if (selectedHistoryEntry) closeHistoryEntry(); setCurrentPage(tab.id); setActiveShipId(null); }}
             className={`flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-colors ${currentPage === tab.id && !activeShipId ? (tab.id === 'incidents' ? 'text-yellow-400' : 'text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]') : 'text-cyan-700 hover:text-cyan-500'}`}
           >
             {tab.icon}
             <span className="text-[9px] font-bold uppercase tracking-widest line-clamp-1">{tab.label}</span>
           </button>
        ))}
      </div>
    </div>
  );
});

export default BottomNav;
