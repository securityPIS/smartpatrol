import React, { useEffect } from 'react';
import { Siren, MapPin, Map } from 'lucide-react';
import { useRole, useSOS, useUI } from '../../context/AppContextRuntime';
import { startSOSAlarm, stopSOSAlarm } from '../../utils/sosAudio';

export default function SOSAlertModal() {
  const { activeSOSAlert, handleSOSConfirm } = useSOS();
  const { currentUserId } = useRole();
  const { setCurrentPage } = useUI();

  const isTargetedToMe = currentUserId && (
    !Array.isArray(activeSOSAlert?.targetUserIds)
    || activeSOSAlert.targetUserIds.includes(currentUserId)
  );
  const isConfirmedByMe = currentUserId && activeSOSAlert?.confirmedBy?.includes(currentUserId);

  useEffect(() => {
    if (activeSOSAlert && isTargetedToMe && !isConfirmedByMe) {
      startSOSAlarm();
    } else {
      stopSOSAlarm();
    }
    
    return () => {
      stopSOSAlarm();
    };
  }, [activeSOSAlert, isConfirmedByMe, isTargetedToMe]);

  if (!activeSOSAlert || !isTargetedToMe || isConfirmedByMe) return null;

  const onConfirm = () => {
    handleSOSConfirm();
    if (setCurrentPage) {
      setCurrentPage('history');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-red-950/90 backdrop-blur-md p-4 animate-sos-flash">
      <div className="bg-slate-900 border-2 border-red-500 rounded-2xl max-w-md w-full p-6 shadow-[0_0_50px_rgba(239,68,68,0.5)] overflow-hidden text-center scale-up-center">
        <div className="flex justify-center mb-6">
          <Siren className="w-20 h-20 text-red-500 animate-pulse" />
        </div>
        
        <h1 className="text-3xl font-black text-red-500 mb-2 tracking-widest">DARURAT SOS</h1>
        
        <div className="bg-slate-800/80 rounded-xl p-4 mb-6 text-left border border-red-500/20">
          <div className="mb-3">
            <span className="text-xs text-slate-400 block uppercase tracking-wider">Pengirim Sinyal</span>
            <div className="text-lg text-white font-bold">{activeSOSAlert.senderName}</div>
            <div className="text-sm text-red-400">{activeSOSAlert.senderRole}</div>
          </div>
          
          <div className="mb-3">
            <span className="text-xs text-slate-400 block uppercase tracking-wider">Lokasi / Kapal</span>
            <div className="text-lg text-white">{activeSOSAlert.shipName || 'Tidak Diketahui'}</div>
          </div>
          
          <div className="mb-3">
            <span className="text-xs text-slate-400 block uppercase tracking-wider">Waktu Kejadian</span>
            <div className="text-md text-white">
              {new Date(activeSOSAlert.triggeredAt).toLocaleString('id-ID')}
            </div>
          </div>

          {(activeSOSAlert.lat && activeSOSAlert.lng) ? (
            <div className="mt-4 p-3 bg-slate-900 rounded-lg flex items-start gap-3 border border-slate-700 hover:border-slate-500 transition-colors">
              <MapPin className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm text-slate-300 font-mono mb-1">
                  {activeSOSAlert.lat}, {activeSOSAlert.lng}
                </div>
                <a 
                  href={`https://maps.google.com/?q=${activeSOSAlert.lat},${activeSOSAlert.lng}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-cyan-400 text-sm hover:underline flex items-center gap-1 font-medium"
                >
                  <Map className="w-4 h-4" /> Buka di Google Maps
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-3 bg-slate-900 rounded-lg flex items-center gap-2 border border-slate-700">
              <MapPin className="w-5 h-5 text-slate-500 shrink-0" />
              <span className="text-sm text-slate-400 italic">Posisi GPS tidak tersedia</span>
            </div>
          )}
        </div>

        <button
          onClick={onConfirm}
          className="w-full py-4 text-xl font-bold bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-lg transition-transform active:scale-[0.98]"
        >
          TERIMA & MENGERTI
        </button>
      </div>
    </div>
  );
}
