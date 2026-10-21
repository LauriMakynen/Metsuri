import type {
  Property,
  Marking,
  CadastreFeature,
  WorkRequest,
} from '../types';
import PropertySearch from './PropertySearch';
import ActivePropertyCard from './ActivePropertyCard';
import PropertyList from './PropertyList';
import MarkingList from './MarkingList';
import WorkRequestList from './WorkRequestList';

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
}: SidebarProps) {
  return (
    <aside id="map-sidebar" className={`map-sidebar ${isOpen ? 'open' : ''}`}>
      <PropertySearch onSearch={onSearch} onSelectResult={onSelectResult} isSearching={isSearching} />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <ActivePropertyCard
          property={selectedProperty}
          onOpenForestValue={onOpenForestValue}
        />

        <PropertyList
          properties={properties}
          selectedId={selectedPropertyId}
          onSelect={onSelectProperty}
          onDelete={onDeleteProperty}
        />

        <WorkRequestList
          requests={workRequests}
          selectedPropertyId={selectedPropertyId}
          canPublish={canPublishRequests}
          onNewRequest={onNewWorkRequest}
          onWithdraw={onWithdrawWorkRequest}
        />

        <MarkingList
          markings={markings}
          selectedPropertyId={selectedPropertyId}
          onDelete={onDeleteMarking}
        />
      </div>
    </aside>
  );
}
