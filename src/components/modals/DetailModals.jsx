import React from 'react';
import { useApp } from '../../context/AppContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import UserDetailView from '../views/UserDetailView';
import ReportDetailView from '../views/ReportDetailView';
import AsyncImage from '../AsyncImage';

export function UserDetailModal() {
  const { selectedUser } = useApp();
  const modalRef = useFocusTrap(!!selectedUser);
  if (!selectedUser) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] lg:hidden flex flex-col animate-in slide-in-from-right-4">
      <UserDetailView isInline={false} />
    </div>
  );
}

export function ReportDetailModal() {
  const { selectedReportDetail } = useApp();
  const modalRef = useFocusTrap(!!selectedReportDetail);
  if (!selectedReportDetail) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] lg:hidden flex flex-col animate-in slide-in-from-right-4">
      <ReportDetailView isInline={false} />
    </div>
  );
}

export function PhotoPreviewModal() {
// ... existing PhotoPreviewModal stays same for now
  const { previewPhoto, setPreviewPhoto } = useApp();
  const modalRef = useFocusTrap(!!previewPhoto);
  if (!previewPhoto) return null;
  return (
    <div ref={modalRef} className="fixed inset-0 z-[110] flex items-center justify-center bg-[#070b19]/95 p-4 animate-in fade-in" onClick={()=>setPreviewPhoto(null)}>
      <div className="relative">
        <AsyncImage src={typeof previewPhoto === 'string' ? previewPhoto : previewPhoto.url} alt="Zoom" className="w-full max-w-lg h-auto rounded-xl border border-cyan-700 shadow-[0_0_30px_rgba(6,182,212,0.2)]" />
        {typeof previewPhoto === 'object' && previewPhoto.author && (
          <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs text-white/90 text-right border border-cyan-900/50"><p className="font-bold text-cyan-400">{previewPhoto.author}</p><p className="text-[10px] text-cyan-100/70">{previewPhoto.time}</p></div>
        )}
      </div>
    </div>
  );
}
