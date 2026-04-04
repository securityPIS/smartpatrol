import React from 'react';
import { useApp } from '../../context/AppContext';
import { ChevronDown, FileText, Upload, Save } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { detectDocumentType, getDocumentTypeLabel } from '../../utils/documentFiles';
import ShipFormView from '../views/ShipFormView';
import UserFormView from '../views/UserFormView';
import ShipDocumentFormView from '../views/ShipDocumentFormView';

export function ShipFormModal() {
  const { showShipForm } = useApp();
  const modalRef = useFocusTrap(showShipForm);
  if (!showShipForm) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] lg:hidden flex flex-col animate-in slide-in-from-right-4">
      <ShipFormView isInline={false} />
    </div>
  );
}

export function UserFormModal() {
  const { showUserForm } = useApp();
  const modalRef = useFocusTrap(showUserForm);
  if (!showUserForm) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] lg:hidden flex flex-col animate-in slide-in-from-right-4">
      <UserFormView isInline={false} />
    </div>
  );
}

export function ShipDocumentFormModal() {
  const { showShipDocForm } = useApp();
  if (!showShipDocForm) return null;

  return (
    <ShipDocumentFormView isInline={false} />
  );
}
