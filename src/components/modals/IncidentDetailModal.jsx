import React from 'react';
import { useApp } from '../../context/AppContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import IncidentDetailView from '../views/IncidentDetailView';

export default function IncidentDetailModal() {
  const { selectedIncident } = useApp();
  const modalRef = useFocusTrap(!!selectedIncident);
  
  if (!selectedIncident) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] lg:hidden flex flex-col animate-in slide-in-from-right-4">
      <IncidentDetailView isInline={false} />
    </div>
  );
}
