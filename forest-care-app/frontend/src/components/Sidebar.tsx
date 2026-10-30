import type {
  Property,
  Marking,
  CadastreFeature,
  WorkRequest,
} from '../types';
import PropertySearch from './PropertySearch';
import PropertyList from './PropertyList';
import MarkingList from './MarkingList';
import WorkRequestList from './WorkRequestList';
import { useState } from 'react';

interface SidebarProps {
  isOpen: boolean;
  properties: Property[];
  markings: Marking[];
  selectedPropertyId: number | null;
  selectedProperty: Property | null;
  onOpenForestValue: () => void;
  isSearching: boolean;
  onSearch: (propertyCode: string) => Promise<CadastreFeature | null>;
  onSelectResult: (result: CadastreFeature) => void;
  onSelectProperty: (property: Property) => void;
  onDeleteProperty: (id: number) => void;
  onDeleteMarking: (id: number) => void;
  workRequests: WorkRequest[];
  canPublishRequests: boolean;
  onNewWorkRequest: () => void;
  onWithdrawWorkRequest: (requestId: number) => Promise<void>;
  onWorkRequestUpdated: (updated: WorkRequest) => void;
}

export default function Sidebar({
  isOpen,
  properties,
  markings,
  selectedPropertyId,
  selectedProperty,
  onOpenForestValue,
  isSearching,
  onSearch,
  onSelectResult,
  onSelectProperty,
  onDeleteProperty,
  onDeleteMarking,
  workRequests,
  canPublishRequests,
  onNewWorkRequest,
  onWithdrawWorkRequest,
  onWorkRequestUpdated,
}: SidebarProps) {
  const [openSections, setOpenSections] = useState({
    properties: true,
    requests: false,
    markings: false,
  });

  const toggleSection = (section: 'properties' | 'requests' | 'markings') => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  return (
    <aside id="map-sidebar" className={`map-sidebar ${isOpen ? 'open' : ''}`}>
      <PropertySearch onSearch={onSearch} onSelectResult={onSelectResult} isSearching={isSearching} />

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
        />

        <MarkingList
          markings={markings}
          selectedPropertyId={selectedPropertyId}
          onDelete={onDeleteMarking}
          isOpen={openSections.markings}
          onToggle={() => toggleSection('markings')}
        />
      </div>
    </aside>
  );
}
