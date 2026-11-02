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
import ForestCarePanel from './ForestCarePanel';
import type { CareLocation } from './ForestCarePanel';
import { useState } from 'react';

// Forest care mode ("Hoida omaa metsää") adds a care summary on top of the usual sections
export interface SidebarCareMode {
  location: CareLocation;
  onStartActivity: () => void;
  onShowLocation: () => void;
}

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
  care?: SidebarCareMode | null;
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
  care = null,
}: SidebarProps) {
  const [openSections, setOpenSections] = useState({
    // In care mode the parcel is already chosen, so the parcel list starts collapsed
    properties: !care,
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
        {care && (
          <ForestCarePanel
            property={selectedProperty}
            markings={selectedPropertyId ? markings : []}
            location={care.location}
            onStartActivity={care.onStartActivity}
            onShowLocation={care.onShowLocation}
            onDeleteMarking={onDeleteMarking}
          />
        )}

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

        {/* In care mode done work is listed under "Viimeisimmät toimenpiteet" instead */}
        {!care && (
          <MarkingList
            markings={markings}
            selectedPropertyId={selectedPropertyId}
            onDelete={onDeleteMarking}
            isOpen={openSections.markings}
            onToggle={() => toggleSection('markings')}
          />
        )}
      </div>
    </aside>
  );
}
