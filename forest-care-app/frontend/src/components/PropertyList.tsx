import type { Property } from '../types';

interface PropertyListProps {
  properties: Property[];
  selectedId: number | null;
  onSelect: (property: Property) => void;
  onDelete: (id: number) => void;
}

export default function PropertyList({ properties, selectedId, onSelect, onDelete }: PropertyListProps) {
  return (
    <>
      <div className="sidebar-header">
        <h3>🌳 Omat kiinteistöt ({properties.length})</h3>
      </div>
      <ul className="sidebar-list">
        {properties.length === 0 ? (
          <li className="sidebar-empty">Ei tallennettuja kiinteistöjä. Käytä hakua lisätäksesi.</li>
        ) : (
          properties.map((p) => (
            <li
              key={p.id}
              className={`sidebar-item property-item ${selectedId === p.id ? 'selected' : ''}`}
              onClick={() => onSelect(p)}
            >
              <div>
                <span style={{ fontWeight: 600 }}>🌳 {p.name}</span>
                {p.property_code && <small style={{ color: '#6b7280' }}>{p.property_code}</small>}
                {p.area_ha && (
                  <small style={{ color: '#6b7280', display: 'block' }}>
                    {p.area_ha.toFixed(2)} ha
                  </small>
                )}
              </div>
              <button
                className="btn-icon delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(p.id);
                }}
                title="Poista"
              >
                🗑
              </button>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
