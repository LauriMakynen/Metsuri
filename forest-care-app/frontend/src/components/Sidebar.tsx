import type {
  Property,
  Marking,
  WorkRequest,
  RecommendedOperation,
} from '../types';
import PropertyList from './PropertyList';
import MarkingList from './MarkingList';
import WorkRequestList from './WorkRequestList';
import ForestCarePanel from './ForestCarePanel';
import type { CareLocation, CareNeededOperations } from './ForestCarePanel';
import type { ParcelArea } from '../utils/parcelAreas';
import { useEffect, useState } from 'react';

// Forest care mode ("Hoida omaa metsää") adds a care summary on top of the usual sections
export interface SidebarCareMode {
  location: CareLocation;
  onStartActivity: () => void;
  onShowLocation: () => void;
  needed: CareNeededOperations;
  onSelectStand: (standId: string) => void;
  activeStandId: string | null;
  onClearStand: () => void;
  onShowArea: (area: ParcelArea) => void;
  onMarkField?: (standId: string, isField: boolean) => Promise<void>;
  onRequestOffers?: (operation: RecommendedOperation) => void;
}

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
  care?: SidebarCareMode | null;
}

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
  care = null,
}: SidebarProps) {
  const [openSections, setOpenSections] = useState({
    // In care mode the parcel is already chosen, so the parcel list starts collapsed
    properties: !care,
    requests: false,
    markings: false,
  });

  useEffect(() => {
    if (!focusWorkRequests) return;
    const focus = window.setTimeout(() => {
      setOpenSections({
        properties: false,
        requests: true,
        markings: false,
      });
    }, 0);
    return () => window.clearTimeout(focus);
  }, [focusWorkRequests]);

  const toggleSection = (section: 'properties' | 'requests' | 'markings') => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  return (
    <aside id="map-sidebar" className={`map-sidebar ${isOpen ? 'open' : ''}`}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {care && (
          <ForestCarePanel
            property={selectedProperty}
            markings={selectedPropertyId ? markings : []}
            location={care.location}
            onStartActivity={care.onStartActivity}
            onShowLocation={care.onShowLocation}
            onDeleteMarking={onDeleteMarking}
            needed={care.needed}
            onSelectStand={care.onSelectStand}
            activeStandId={care.activeStandId}
            onClearStand={care.onClearStand}
            onShowArea={care.onShowArea}
            onMarkField={care.onMarkField}
            onRequestOffers={care.onRequestOffers}
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
          title={care ? 'Tietoa valitusta metsästä' : undefined}
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
