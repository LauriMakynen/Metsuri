import type {
  Property,
  Marking,
  WorkRequest,
} from '../types';
import PropertyList from './PropertyList';
import MarkingList from './MarkingList';
import WorkRequestList from './WorkRequestList';
import { isNote } from '../utils/markingTypes';
import { useEffect, useState } from 'react';

interface SidebarProps {
  isOpen: boolean;
  properties: Property[];
  markings: Marking[];
  selectedPropertyId: number | null;
  selectedProperty: Property | null;
  onOpenForestValue: () => void;
  onSelectProperty: (property: Property) => void;
  onDeleteProperty: (id: number) => void;
  onDeleteMarking: (id: number) => void;
  workRequests: WorkRequest[];
  canPublishRequests: boolean;
  onNewWorkRequest: () => void;
  onWithdrawWorkRequest: (requestId: number) => Promise<void>;
  onWorkRequestUpdated: (updated: WorkRequest) => void;
  focusWorkRequests?: boolean;
  showAllWorkRequests?: boolean;
}

// Map sidebar: parcels, work requests, done work and notes. Forest care mode has no sidebar.
export default function Sidebar({
  isOpen,
  properties,
  markings,
  selectedPropertyId,
  selectedProperty,
  onOpenForestValue,
  onSelectProperty,
  onDeleteProperty,
  onDeleteMarking,
  workRequests,
  canPublishRequests,
  onNewWorkRequest,
  onWithdrawWorkRequest,
  onWorkRequestUpdated,
  focusWorkRequests = false,
  showAllWorkRequests = false,
}: SidebarProps) {
  const [openSections, setOpenSections] = useState({
    properties: true,
    requests: false,
    markings: false,
    notes: false,
  });

  useEffect(() => {
    if (!focusWorkRequests) return;
    const focus = window.setTimeout(() => {
      setOpenSections({
        properties: false,
        requests: true,
        markings: false,
        notes: false,
      });
    }, 0);
    return () => window.clearTimeout(focus);
  }, [focusWorkRequests]);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  // Notes made with the "Muistio" tool are listed apart from done work
  const doneWork = markings.filter((m) => !isNote(m));
  const notes = markings.filter(isNote);

  return (
    <aside id="map-sidebar" className={`map-sidebar ${isOpen ? 'open' : ''}`}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <PropertyList
          properties={properties}
          selectedId={selectedPropertyId}
          selectedProperty={selectedProperty}
          onSelect={onSelectProperty}
          onDelete={onDeleteProperty}
          onOpenForestValue={onOpenForestValue}
          isOpen={openSections.properties}
          onToggle={() => toggleSection('properties')}
        />

        <WorkRequestList
          requests={workRequests}
          selectedPropertyId={selectedPropertyId}
          canPublish={canPublishRequests}
          onNewRequest={onNewWorkRequest}
          onWithdraw={onWithdrawWorkRequest}
          onUpdated={onWorkRequestUpdated}
          isOpen={openSections.requests}
          onToggle={() => toggleSection('requests')}
          showAllProperties={showAllWorkRequests}
        />

        <MarkingList
          markings={doneWork}
          selectedPropertyId={selectedPropertyId}
          onDelete={onDeleteMarking}
          isOpen={openSections.markings}
          onToggle={() => toggleSection('markings')}
        />

        <MarkingList
          variant="notes"
          markings={notes}
          selectedPropertyId={selectedPropertyId}
          onDelete={onDeleteMarking}
          isOpen={openSections.notes}
          onToggle={() => toggleSection('notes')}
        />
      </div>
    </aside>
  );
}
