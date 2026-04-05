import React, { Suspense, lazy } from 'react';
import { AppProvider, useApp } from './src/context/AppContext';
import Header from './src/components/Header';
import BottomNav from './src/components/BottomNav';
import LoginPage from './src/pages/LoginPage';
import PatrolPage from './src/pages/PatrolPage';
import IncidentsPage from './src/pages/IncidentsPage';
import LoadingSkeleton from './src/components/LoadingSkeleton';

const HistoryPage = lazy(() => import('./src/pages/HistoryPage'));
const NotificationsPage = lazy(() => import('./src/pages/NotificationsPage'));
const UsersPage = lazy(() => import('./src/pages/UsersPage'));
const ShipsPage = lazy(() => import('./src/pages/ShipsPage'));

import PatrolFormModal from './src/components/modals/PatrolFormModal';
import PatrolCameraModal from './src/components/modals/PatrolCameraModal';
import IncidentFormModal from './src/components/modals/IncidentFormModal';
import IncidentDetailModal from './src/components/modals/IncidentDetailModal';
import { ShipDocumentFormModal, ShipFormModal, UserFormModal } from './src/components/modals/FormModals';
import { UserDetailModal, ReportDetailModal, PhotoPreviewModal } from './src/components/modals/DetailModals';
import ConfirmModal from './src/components/modals/ConfirmModal';

import SideNav from './src/components/SideNav';

function AppShell() {
  const { sessionUserId, currentPage, isAdmin, theme, showSettingsDropdown, setShowSettingsDropdown, showNotificationsDropdown, setShowNotificationsDropdown, confirmDialog, setConfirmDialog } = useApp();

  if (!sessionUserId) return <LoginPage />;

  const themeClass = theme === 'light' ? 'pertamina-light' : '';

  return (
    <div
      style={{ fontFamily: '"Chakra Petch", sans-serif' }}
      className={`w-full max-w-[1280px] mx-auto min-h-screen bg-[#070b19] text-cyan-50 lg:border-x lg:border-cyan-900/50 lg:shadow-[0_0_60px_rgba(6,182,212,0.15)] relative flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden ${themeClass}`}
      onClick={() => { if (showSettingsDropdown) setShowSettingsDropdown(false); if (showNotificationsDropdown) setShowNotificationsDropdown(false); }}
    >
      {/* SideNav for Desktop */}
      <SideNav />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Header />

        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0 relative scrollbar-thin scrollbar-thumb-cyan-900/50">
          <Suspense fallback={<LoadingSkeleton />}>
            {currentPage === 'home' && <PatrolPage />}
            {currentPage === 'incidents' && <IncidentsPage />}
            {currentPage === 'history' && <HistoryPage />}
            {currentPage === 'notifications' && <NotificationsPage />}
            {currentPage === 'users' && isAdmin && <UsersPage />}
            {currentPage === 'ships' && isAdmin && <ShipsPage />}
          </Suspense>
        </main>

        <BottomNav />
      </div>

      {/* Modals - Hidden on SM via component internal logic or visibility classes */}
      <PatrolCameraModal />
      <PatrolFormModal />
      <IncidentFormModal />
      <IncidentDetailModal />
      <ShipFormModal />
      <ShipDocumentFormModal />
      <UserFormModal />
      <UserDetailModal />
      <ReportDetailModal />
      <PhotoPreviewModal />
      <ConfirmModal 
        isOpen={!!confirmDialog} 
        title={confirmDialog?.title} 
        message={confirmDialog?.message} 
        onConfirm={() => confirmDialog?.onConfirm?.()} 
        onCancel={() => setConfirmDialog(null)} 
        confirmText={confirmDialog?.confirmText}
        cancelText={confirmDialog?.cancelText}
        isAlert={confirmDialog?.isAlert}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
