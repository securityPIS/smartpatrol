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
import IncidentFormModal from './src/components/modals/IncidentFormModal';
import IncidentDetailModal from './src/components/modals/IncidentDetailModal';
import { ShipDocumentFormModal, ShipFormModal, UserFormModal } from './src/components/modals/FormModals';
import { UserDetailModal, ReportDetailModal, PhotoPreviewModal } from './src/components/modals/DetailModals';
import ConfirmModal from './src/components/modals/ConfirmModal';

function AppShell() {
  const { sessionUserId, currentPage, isAdmin, theme, showSettingsDropdown, setShowSettingsDropdown, showNotificationsDropdown, setShowNotificationsDropdown, confirmDialog, setConfirmDialog } = useApp();

  if (!sessionUserId) return <LoginPage />;

  const themeClass = theme === 'light' ? 'light-theme' : '';

  return (
    <>
      <div
        style={{ fontFamily: '"Chakra Petch", sans-serif' }}
        className={`w-full min-h-screen bg-[#070b19] text-cyan-50 sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 sm:shadow-[0_0_40px_rgba(6,182,212,0.1)] relative ${themeClass}`}
        onClick={() => { if (showSettingsDropdown) setShowSettingsDropdown(false); if (showNotificationsDropdown) setShowNotificationsDropdown(false); }}
      >
        <Header />

        <div className="flex-1 overflow-y-auto pb-24">
          <Suspense fallback={<LoadingSkeleton />}>
            {currentPage === 'home' && <PatrolPage />}
            {currentPage === 'incidents' && <IncidentsPage />}
            {currentPage === 'history' && <HistoryPage />}
            {currentPage === 'notifications' && <NotificationsPage />}
            {currentPage === 'users' && isAdmin && <UsersPage />}
            {currentPage === 'ships' && isAdmin && <ShipsPage />}
          </Suspense>
        </div>

        {/* Modals */}
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

        <BottomNav />
      </div>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
