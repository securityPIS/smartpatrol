import React from 'react';
import { useApp } from '../context/AppContext';
import { Users, PlusCircle, User, Ship } from 'lucide-react';
import AsyncImage from '../components/AsyncImage';

import UserFormView from '../components/views/UserFormView';
import UserDetailView from '../components/views/UserDetailView';

const UsersPage = React.memo(function UsersPage() {
  const { usersData, setSelectedUser, selectedUser, setShowUserForm, showUserForm, isAdmin } = useApp();
  if (!isAdmin) return null;

  const showRightPane = selectedUser || showUserForm;
  const handleUserSelect = (user) => {
    if (showUserForm) {
      setShowUserForm(false);
    }
    setSelectedUser({ ...user });
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Pane: List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-in fade-in scrollbar-thin scrollbar-thumb-cyan-900/50 lg:border-r lg:border-cyan-900/50">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-cyan-50 flex items-center gap-2"><Users className="w-5 h-5 text-cyan-400" /> DATA USER</h2>
          <button onClick={() => setShowUserForm(true)} className="px-3 py-1.5 bg-cyan-600/20 text-cyan-300 border border-cyan-500/50 text-xs font-bold rounded-lg flex items-center gap-1 hover:bg-cyan-600/40 transition-colors active:scale-95 shadow-[0_0_10px_rgba(6,182,212,0.1)]">
            <PlusCircle className="w-3.5 h-3.5" /> Tambah
          </button>
        </div>
        <div className="space-y-3">
          {usersData.map((user) => {
            const isSelected = selectedUser?.id === user.id;
            return (
            <div 
              key={user.id} 
              onClick={() => handleUserSelect(user)}
              className={`p-3.5 rounded-xl border flex items-center gap-3 relative overflow-hidden cursor-pointer transition-all group shadow-sm ${isSelected ? 'border-cyan-400 bg-cyan-900/10 shadow-[0_0_15px_rgba(6,182,212,0.1)]' : 'bg-[#0b1229] border-cyan-800/50 hover:border-cyan-500/50'}`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${user.type === 'TNI' ? 'bg-fuchsia-500' : 'bg-cyan-400'}`}></div>
              <div className="w-14 h-14 rounded-xl bg-[#070b19] border border-cyan-700/50 overflow-hidden shrink-0 ml-1 shadow-sm">
                {user.photoUrl ? <AsyncImage src={user.photoUrl} alt={user.name} className={`w-full h-full object-cover transition-opacity ${isSelected ? 'opacity-100' : 'opacity-80'}`} /> : <div className="w-full h-full flex items-center justify-center text-cyan-500"><User className="w-6 h-6"/></div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <div>
                     <h3 className={`font-bold text-base truncate ${isSelected ? 'text-white' : 'text-cyan-50'}`}>{user.name}</h3>
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
                   {user.shipAssigned ? <span className="text-cyan-100 italic">Penugasan: <span className="font-bold text-cyan-400">{user.shipAssigned}</span></span> : <span className="text-slate-500 italic">Belum ada penugasan.</span>}
                </div>
              </div>
            </div>
          );
          })}
        </div>
      </div>

      {/* Right Pane: Detail or Form */}
      <div className="hidden lg:block flex-1 bg-[#070b19] shrink-0 overflow-hidden relative border-l border-cyan-900/50">
        {showUserForm && <UserFormView isInline={true} />}
        {(!showUserForm && selectedUser) && <UserDetailView isInline={true} />}
        
        {!showRightPane && (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-cyan-800">
               <div className="w-16 h-16 rounded-full bg-cyan-900/20 flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 opacity-20" />
               </div>
               <p className="text-sm font-bold uppercase tracking-widest mb-1">Manajemen Pengguna</p>
               <p className="text-xs opacity-60">Pilih personil di sebelah kiri untuk melihat profil lengkap, data darurat, dan history penugasan.</p>
            </div>
         )}
      </div>
    </div>
  );
});


export default UsersPage;
