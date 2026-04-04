import React from 'react';
import { useApp } from '../context/AppContext';
import { Home, AlertOctagon, FileText, Users, Shield, Ship, Anchor, ChevronRight } from 'lucide-react';

const SideNav = React.memo(function SideNav() {
  const { currentPage, setCurrentPage, setActiveShipId, isAdmin, activeShipId, closeHistoryEntry, selectedHistoryEntry } = useApp();

  const tabs = [
    {id: 'home', icon: <Home className="w-5 h-5"/>, label: 'Patroli'},
    {id: 'incidents', icon: <AlertOctagon className="w-5 h-5"/>, label: 'Temuan'},
    {id: 'history', icon: <FileText className="w-5 h-5"/>, label: 'Riwayat'},
    ...(isAdmin ? [
       {id: 'users', icon: <Users className="w-5 h-5"/>, label: 'Users'},
       {id: 'ships', icon: <Anchor className="w-5 h-5"/>, label: 'Armada'}
    ] : [])
  ];

  return (
    <div className="hidden lg:flex flex-col w-[100px] bg-[#0b1229] border-r border-cyan-800/50 h-screen sticky top-0 py-6 overflow-y-auto shrink-0 z-50">
      <div className="flex flex-col items-center gap-6 px-2">
        <div className="relative flex items-center justify-center w-12 h-12 mb-4">
          <Shield className="w-12 h-12 text-cyan-400 stroke-[1.5] opacity-20 absolute" />
          <Shield className="w-12 h-12 text-cyan-400 stroke-1 absolute" />
          <Ship className="w-6 h-6 text-cyan-400 relative z-10 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
        </div>

        <div className="flex flex-col w-full gap-2">
          {tabs.map(tab => {
            const isActive = currentPage === tab.id && !activeShipId;
            return (
              <button 
                key={tab.id} 
                onClick={() => { 
                  if (selectedHistoryEntry) closeHistoryEntry(); 
                  setCurrentPage(tab.id); 
                  setActiveShipId(null); 
                }}
                className={`group relative flex flex-col items-center justify-center w-full py-4 rounded-2xl transition-all duration-300 ${isActive ? (tab.id === 'incidents' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-cyan-500/10 text-cyan-400') : 'text-cyan-700 hover:bg-cyan-900/40 hover:text-cyan-500'}`}
              >
                {isActive && (
                  <div className={`absolute left-0 w-1 h-8 rounded-r-full ${tab.id === 'incidents' ? 'bg-yellow-500' : 'bg-cyan-500'} shadow-[0_0_10px_currentcolor]`}></div>
                )}
                
                <div className={`mb-1.5 transition-transform duration-300 group-hover:scale-110 ${isActive ? 'scale-110' : ''}`}>
                  {tab.icon}
                </div>
                
                <span className="text-[10px] font-bold uppercase tracking-widest text-center px-1">
                  {tab.label}
                </span>

                {!isActive && (
                  <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-3 h-3 text-cyan-800" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto px-4 pb-4">
        <div className="p-3 rounded-xl border border-cyan-900/30 bg-cyan-950/10 flex flex-col items-center gap-1">
           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></div>
           <span className="text-[8px] font-black text-cyan-600 uppercase tracking-tighter">ONLINE</span>
        </div>
      </div>
    </div>
  );
});

export default SideNav;
