import type { Property, Marking, CadastreFeature, ForestDataResponse, ForestValuationResponse } from '../types';
import PropertySearch from './PropertySearch';
import ActivePropertyCard from './ActivePropertyCard';
import PropertyList from './PropertyList';
import MarkingList from './MarkingList';

interface SidebarProps {
  isOpen: boolean;
  properties: Property[];
  markings: Marking[];
  selectedPropertyId: number | null;
  selectedProperty: Property | null;
  forestData: ForestDataResponse | null;
  valuation: ForestValuationResponse | null;
  isSearching: boolean;
  onSearch: (propertyCode: string) => Promise<CadastreFeature | null>;
  onSelectResult: (result: CadastreFeature) => void;
  onSelectProperty: (property: Property) => void;
  onDeleteProperty: (id: number) => void;
  onDeleteMarking: (id: number) => void;
}

export default function Sidebar({
  isOpen,
  properties,
  markings,
  selectedPropertyId,
  selectedProperty,
  forestData,
  valuation,
  isSearching,
  onSearch,
  onSelectResult,
  onSelectProperty,
  onDeleteProperty,
  onDeleteMarking,
}: SidebarProps) {
  return (
    <aside className={`map-sidebar ${isOpen ? 'open' : ''}`}>
      <PropertySearch onSearch={onSearch} onSelectResult={onSelectResult} isSearching={isSearching} />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <ActivePropertyCard
          property={selectedProperty}
          forestData={forestData}
          valuation={valuation}
        />

        <PropertyList
          properties={properties}
          selectedId={selectedPropertyId}
          onSelect={onSelectProperty}
          onDelete={onDeleteProperty}
        />

        <MarkingList markings={markings} selectedPropertyId={selectedPropertyId} onDelete={onDeleteMarking} />
      </div>
    </aside>
  );
}
