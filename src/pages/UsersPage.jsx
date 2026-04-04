import React from 'react';
import { useApp } from '../context/AppContext';
import { Users, PlusCircle, User, Ship } from 'lucide-react';
import AsyncImage from '../components/AsyncImage';

const UsersPage = React.memo(function UsersPage() {
  const { usersData, setSelectedUser, setShowUserForm, isAdmin } = useApp();
  if (!isAdmin) return null;

  return (
    <div className="p-4 space-y-4 animate-in fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-cyan-50 flex items-center gap-2"><Users className="w-5 h-5 text-cyan-400" /> DATA USER</h2>
        <button onClick={() => setShowUserForm(true)} className="px-3 py-1.5 bg-cyan-600/20 text-cyan-300 border border-cyan-500/50 text-xs font-bold rounded-lg flex items-center gap-1 hover:bg-cyan-600/40 transition-colors">
          <PlusCircle className="w-3.5 h-3.5" /> Tambah
        </button>
      </div>
      <div className="space-y-3">
        {usersData.map((user) => (
          <div key={user.id} onClick={() => setSelectedUser({...user})} className="bg-[#0b1229] p-3.5 rounded-xl border border-cyan-800/50 flex items-center gap-3 relative overflow-hidden cursor-pointer hover:border-cyan-500/50 transition-colors group shadow-sm">
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${user.type === 'TNI' ? 'bg-fuchsia-500' : 'bg-cyan-400'}`}></div>
            <div className="w-14 h-14 rounded-xl bg-[#070b19] border border-cyan-700/50 overflow-hidden shrink-0 ml-1 shadow-sm">
              {user.photoUrl ? <AsyncImage src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-cyan-500"><User className="w-6 h-6"/></div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-1">
                <div>
                   <h3 className="font-bold text-white text-base truncate">{user.name}</h3>
                   <div className="flex items-center gap-1.5 mt-0.5">
                     <span className="text-[10px] text-cyan-500 font-bold uppercase">{user.role}</span>
                     <span className={`text-[8px] px-1 py-0.5 border rounded font-black tracking-widest ${user.type==='TNI' ? 'bg-fuchsia-900/30 border-fuchsia-500 text-fuchsia-400' : 'bg-cyan-900/30 border-cyan-500 text-cyan-300'}`}>{user.type}</span>
                   </div>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 border rounded uppercase font-bold tracking-widest shrink-0 ${user.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                   {user.status === 'active' ? 'ON-DUTY' : 'OFF-DUTY'}
                </span>
              </div>
              <div className="pt-2 mt-1 border-t border-cyan-900/30 flex items-center gap-1.5 text-[10px]">
                 <Ship className={`w-3 h-3 ${user.shipAssigned ? 'text-cyan-400' : 'text-slate-600'}`} />
                 {user.shipAssigned ? <span className="text-cyan-100">Penugasan: <span className="font-bold text-cyan-400">{user.shipAssigned}</span></span> : <span className="text-slate-500 italic">Belum ada penugasan.</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default UsersPage;
