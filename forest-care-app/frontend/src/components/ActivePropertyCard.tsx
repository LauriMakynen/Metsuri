import type { Property, ForestDataResponse, ForestValuationResponse } from '../types';

interface ActivePropertyCardProps {
  property: Property | null;
  forestData: ForestDataResponse | null;
  valuation: ForestValuationResponse | null;
  onImportCadastre?: () => void;
}

export default function ActivePropertyCard({
  property,
  forestData,
  valuation,
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

      {/* Forest Data */}
      {forestData?.status === 'available' && forestData.data && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.6rem',
            backgroundColor: '#f0fdf4',
            borderRadius: '8px',
            fontSize: '0.8rem',
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#166534' }}>📊 Metsädata</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', color: '#6b7280' }}>
            {forestData.data.total_volume_m3 && (
              <small>Puusto: {forestData.data.total_volume_m3.toFixed(0)} m³</small>
            )}
            {forestData.data.development_class && (
              <small>Kehitysluokka: {forestData.data.development_class}</small>
            )}
          </div>
        </div>
      )}

      {/* Valuation */}
      {valuation?.status === 'available' && valuation.data && (
        <div
          style={{
            marginTop: '0.6rem',
            padding: '0.6rem',
            backgroundColor: '#fef3c7',
            borderRadius: '8px',
            fontSize: '0.8rem',
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#92400e' }}>💰 Arvio</p>
          <small style={{ color: '#b45309' }}>
            {valuation.data.estimated_value_eur?.toLocaleString('fi-FI', {
              style: 'currency',
              currency: 'EUR',
            })}
          </small>
        </div>
      )}

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
