import React, { lazy, Suspense } from 'react';
import {
  AppProvider,
  useAuth,
  useIncidents,
  usePatrol,
  useReports,
  useRole,
  useShips,
  useSOS,
  useUI,
  useUsers,
} from './src/context/AppContextRuntime';
import Header from './src/components/Header';
import BottomNav from './src/components/BottomNav';
import SideNav from './src/components/SideNav';

// LoginPage stays eager and is always the first screen rendered on cold load.
import LoginPage from './src/pages/LoginPage';
import PatrolPage from './src/pages/PatrolPage';
import IncidentsPage from './src/pages/IncidentsPage';
import HistoryPage from './src/pages/HistoryPage';
import NotificationsPage from './src/pages/NotificationsPage';
import UsersPage from './src/pages/UsersPage';
import ShipsPage from './src/pages/ShipsPage';
import DailyReportPage from './src/pages/DailyReportPage';

// Modals: lazy-loaded and only mounted when visible.
const PatrolCameraModal = lazy(() => import('./src/components/modals/PatrolCameraModal'));
const PatrolFormModal = lazy(() => import('./src/components/modals/PatrolFormModal'));
const IncidentFormModal = lazy(() => import('./src/components/modals/IncidentFormModal'));
const IncidentDetailModal = lazy(() => import('./src/components/modals/IncidentDetailModal'));
const AssignDueDatePopup = lazy(() => import('./src/components/modals/AssignDueDatePopup'));
const SOSAlertModal = lazy(() => import('./src/components/modals/SOSAlertModal'));
const ShipFormModal = lazy(() => import('./src/components/modals/FormModals').then(module => ({ default: module.ShipFormModal })));
const ShipDocumentFormModal = lazy(() => import('./src/components/modals/FormModals').then(module => ({ default: module.ShipDocumentFormModal })));
const UserFormModal = lazy(() => import('./src/components/modals/FormModals').then(module => ({ default: module.UserFormModal })));
const UserDetailModal = lazy(() => import('./src/components/modals/DetailModals').then(module => ({ default: module.UserDetailModal })));
const ReportDetailModal = lazy(() => import('./src/components/modals/DetailModals').then(module => ({ default: module.ReportDetailModal })));
const PhotoPreviewModal = lazy(() => import('./src/components/modals/DetailModals').then(module => ({ default: module.PhotoPreviewModal })));
const ConfirmModal = lazy(() => import('./src/components/modals/ConfirmModal'));

class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Page render failed', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4">
          <div className="rounded-[1.8rem] border border-cyan-800/50 bg-[#0b1229] p-6 text-cyan-50 shadow-[0_0_24px_rgba(8,145,178,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-500">SmartPatrol</p>
            <h2 className="mt-3 text-2xl font-black text-white">Halaman Sedang Dipulihkan</h2>
            <p className="mt-3 text-sm leading-relaxed text-cyan-200/75">
              Tampilan utama sempat gagal dimuat, tetapi aplikasi masih aktif. Refresh biasa sekarang seharusnya sudah lebih aman.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function AppShell() {
  const { sessionUserId } = useAuth();
  const { currentPage, theme, showSettingsDropdown, setShowSettingsDropdown, showNotificationsDropdown, setShowNotificationsDropdown, confirmDialog, setConfirmDialog } = useUI();
  const { isAdmin } = useRole();
  const { pendingPatrolCameraCapture, activePatrolItem } = usePatrol();
  const { showIncidentModal, selectedIncident } = useIncidents();
  const { showShipForm, showShipDocForm, showAssignPopup } = useShips();
  const { showUserForm, selectedUser } = useUsers();
  const { selectedReportDetail, previewPhoto } = useReports();
  const { activeSOSAlert } = useSOS();

  if (!sessionUserId) return <LoginPage />;

  const themeClass = theme === 'light' ? 'pertamina-light' : '';

  return (
    <div
      style={{ fontFamily: '"Chakra Petch", sans-serif' }}
      className={`w-full max-w-[1280px] mx-auto min-h-screen bg-[#070b19] text-cyan-50 lg:border-x lg:border-cyan-900/50 lg:shadow-[0_0_60px_rgba(6,182,212,0.15)] relative flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden ${themeClass}`}
      onClick={() => {
        if (showSettingsDropdown) setShowSettingsDropdown(false);
        if (showNotificationsDropdown) setShowNotificationsDropdown(false);
      }}
    >
      <SideNav />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Header />

        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0 relative scrollbar-thin scrollbar-thumb-cyan-900/50">
          <PageErrorBoundary>
            {currentPage === 'home' && <PatrolPage />}
            {currentPage === 'incidents' && <IncidentsPage />}
            {currentPage === 'history' && <HistoryPage />}
            {currentPage === 'notifications' && <NotificationsPage />}
            {currentPage === 'daily-report' && (isAdmin ? <DailyReportPage /> : <PatrolPage />)}
            {currentPage === 'users' && (isAdmin ? <UsersPage /> : <PatrolPage />)}
            {currentPage === 'ships' && (isAdmin ? <ShipsPage /> : <PatrolPage />)}
            {!['home', 'incidents', 'history', 'notifications', 'daily-report', 'users', 'ships'].includes(currentPage) && (
              isAdmin ? <DailyReportPage /> : <PatrolPage />
            )}
          </PageErrorBoundary>
        </main>

        <BottomNav />
      </div>

      <Suspense fallback={null}>
        {pendingPatrolCameraCapture && <PatrolCameraModal />}
        {activePatrolItem && <PatrolFormModal />}
        {showIncidentModal && <IncidentFormModal />}
        {selectedIncident && <IncidentDetailModal />}
        {showShipForm && <ShipFormModal />}
        {showShipDocForm && <ShipDocumentFormModal />}
        {showUserForm && <UserFormModal />}
        {selectedUser && <UserDetailModal />}
        {selectedReportDetail && <ReportDetailModal />}
        {previewPhoto && <PhotoPreviewModal />}
        {confirmDialog && (
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
        )}
        {showAssignPopup && <AssignDueDatePopup />}
        {activeSOSAlert && <SOSAlertModal />}
      </Suspense>
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
