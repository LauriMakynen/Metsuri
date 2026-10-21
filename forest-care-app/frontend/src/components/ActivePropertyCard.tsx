import type { Property } from '../types';
import ForestValueCard from './forestValue/ForestValueCard';

interface ActivePropertyCardProps {
  property: Property | null;
  onOpenForestValue: () => void;
  onImportCadastre?: () => void;
}

export default function ActivePropertyCard({
  property,
  onOpenForestValue,
  onImportCadastre,
}: ActivePropertyCardProps) {
  if (!property) {
    return (
      <div className="sidebar-header">
        <h3>📍 Aktiivinen kiinteistö</h3>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem', fontWeight: 400 }}>
          Valitse kiinteistö kartalta tai haulla
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fafafa' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', color: '#166534' }}>
        📍 {property.name}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem' }}>
        {property.property_code && (
          <div>
            <span style={{ color: '#6b7280' }}>Tunnus: </span>
            <strong>{property.property_code}</strong>
          </div>
        )}
        {property.area_ha && (
          <div>
            <span style={{ color: '#6b7280' }}>Pinta-ala: </span>
            <strong>{property.area_ha.toFixed(2)} ha</strong>
          </div>
        )}
      </div>

      <ForestValueCard property={property} onOpenDetails={onOpenForestValue} />

      {property.source === 'cadastre' && onImportCadastre && (
        <button
          className="btn btn-primary"
          onClick={onImportCadastre}
          style={{ marginTop: '0.75rem', width: '100%' }}
        >
          Tallenna omiin kiinteistöihin
        </button>
      )}
    </div>
  );
}
