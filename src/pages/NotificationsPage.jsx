import React from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Bell, CheckCheck } from 'lucide-react';

const APP_TIME_ZONE = 'Asia/Jakarta';

function getNotificationToneClass(type) {
  if (type?.startsWith('incident')) return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200';
  if (type === 'checkpoint_missed') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (type === 'checkpoint_pending') return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200';
  if (type?.startsWith('shift')) return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';
  if (type === 'assignment_changed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  return 'border-slate-700 bg-slate-900/70 text-slate-300';
}

const NotificationsPage = React.memo(function NotificationsPage() {
  const {
    currentUserRecord,
    visibleNotifications,
    unreadNotificationCount,
    markAllNotificationsAsRead,
    handleNotificationClick,
    closeNotificationsPage,
    deviceNotificationPermission,
    isDeviceNotificationSupported,
    deviceNotificationsBusy,
    deviceNotificationsError,
    enableDeviceNotifications,
  } = useApp();

  return (
    <div className="p-4 space-y-4 animate-in fade-in">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={closeNotificationsPage}
            className="w-10 h-10 rounded-xl border border-cyan-700/60 bg-[#0b1229] text-cyan-300 flex items-center justify-center hover:bg-cyan-900/40 transition-colors"
            aria-label="Kembali"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Inbox</p>
            <h2 className="text-xl font-black text-cyan-50">Notifikasi</h2>
          </div>
        </div>
        <button
          type="button"
          onClick={markAllNotificationsAsRead}
          disabled={unreadNotificationCount === 0}
          className="px-3 py-2 rounded-lg border border-cyan-700/60 text-cyan-300 text-[10px] font-bold uppercase tracking-widest hover:bg-cyan-900/40 transition-colors disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1.5"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Tandai Semua
        </button>
      </div>

      <div className="bg-[#0b1229] rounded-2xl border border-cyan-800/50 p-4 shadow-sm">
        <p className="text-xs text-cyan-200">
          {unreadNotificationCount} belum dibaca
        </p>
      </div>

      <div className="bg-[#0b1229] rounded-2xl border border-cyan-800/50 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Perangkat</p>
            <p className="text-sm font-bold text-cyan-50">Notifikasi browser & PWA</p>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-cyan-300">
            {isDeviceNotificationSupported ? deviceNotificationPermission : 'unsupported'}
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {isDeviceNotificationSupported
            ? 'Aktifkan agar checkpoint missed, checkpoint pending, dan shift ending soon bisa muncul sebagai popup perangkat.'
            : 'Browser ini belum mendukung push notification untuk SmartPatrol.'}
        </p>
        {deviceNotificationsError && (
          <p className="text-xs text-rose-300">{deviceNotificationsError}</p>
        )}
        <button
          type="button"
          onClick={() => enableDeviceNotifications()}
          disabled={!isDeviceNotificationSupported || deviceNotificationsBusy || deviceNotificationPermission === 'granted'}
          className="px-3 py-2 rounded-lg border border-cyan-700/60 text-cyan-300 text-[10px] font-bold uppercase tracking-widest hover:bg-cyan-900/40 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {deviceNotificationPermission === 'granted'
            ? 'Notifikasi Aktif'
            : deviceNotificationsBusy
              ? 'Memproses...'
              : 'Aktifkan Notifikasi'}
        </button>
      </div>

      <div className="space-y-3">
        {visibleNotifications.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-cyan-900/50 rounded-xl">
            <Bell className="w-10 h-10 text-cyan-900 mx-auto mb-2" />
            <p className="text-cyan-600 text-sm font-bold uppercase tracking-widest">Belum Ada Notifikasi</p>
          </div>
        ) : visibleNotifications.map((notification) => {
          const isUnread = !notification.readByUserIds.includes(currentUserRecord?.id);
          return (
            <button
              key={notification.id}
              type="button"
              onClick={() => handleNotificationClick(notification)}
              className={`w-full text-left rounded-2xl border p-4 transition-colors ${isUnread ? 'border-cyan-500/30 bg-cyan-500/8' : 'border-cyan-900/40 bg-[#070b19]'} hover:border-cyan-400/40`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${getNotificationToneClass(notification.type)}`}>
                    {notification.type.replaceAll('_', ' ')}
                  </span>
                  <p className="mt-2 text-sm font-bold text-cyan-50">{notification.title}</p>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">{notification.message}</p>
                </div>
                {isUnread && <span className="mt-1 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] shrink-0"></span>}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-cyan-600">
                <span>{notification.senderName}</span>
                <span>{new Date(notification.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: APP_TIME_ZONE })}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default NotificationsPage;
