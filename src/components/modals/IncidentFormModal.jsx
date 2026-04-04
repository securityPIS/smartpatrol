import React from 'react';
import { useApp } from '../../context/AppContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import IncidentFormView from '../views/IncidentFormView';

export default function IncidentFormModal() {
  const { showIncidentModal } = useApp();
  const modalRef = useFocusTrap(showIncidentModal);
  if (!showIncidentModal) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] lg:hidden flex flex-col animate-in slide-in-from-right-4">
      <IncidentFormView isInline={false} />
    </div>
  );
}
