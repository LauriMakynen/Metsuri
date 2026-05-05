import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { useAuth } from '../hooks/useAuth';
import { propertiesService, markingsService } from '../services/forestService';
import type { Property, Marking, MarkingType, GeometryType, GeoJSONGeometry } from '../types';
import MarkingForm from '../components/MarkingForm';

// Fix Leaflet default icon issue in Vite/webpack bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Active drawing tool type
type DrawTool = 'property' | 'point' | 'line' | 'area' | 'note' | null;

// Color coding for different marking types
const MARKING_COLORS: Record<MarkingType, string> = {
  vesakonhoito: '#f59e0b',
  istutus: '#10b981',
  harvennus: '#3b82f6',
  avohakkuu: '#ef4444',
  muu_tyo: '#8b5cf6',
};

// Finnish labels for marking types
const MARKING_TYPE_LABELS: Record<MarkingType, string> = {
  vesakonhoito: 'Vesakonhoito',
  istutus: 'Istutus',
  harvennus: 'Harvennus',
  avohakkuu: 'Avohakkuu',
  muu_tyo: 'Muu työ',
};

// Main map page - full-screen interactive map with drawing tools
export default function MapPage() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const drawnLayersRef = useRef<L.FeatureGroup | null>(null);
  const propertiesLayerRef = useRef<L.FeatureGroup | null>(null);
  const markingsLayerRef = useRef<L.FeatureGroup | null>(null);

  const { user, logout } = useAuth();
  const [activeTool, setActiveTool] = useState<DrawTool>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [markings, setMarkings] = useState<Marking[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [pendingGeometry, setPendingGeometry] = useState<GeoJSONGeometry>(null);
  const [pendingGeometryType, setPendingGeometryType] = useState<GeometryType>('point');
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load data from backend
  const loadData = useCallback(async () => {
    try {
      const [props, marks] = await Promise.all([
        propertiesService.getAll(),
        markingsService.getAll(),
      ]);
      setProperties(props);
      setMarkings(marks);
    } catch {
      setError('Tietojen lataaminen epäonnistui');
    }
  }, []);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create map centered on Finland
    const map = L.map(mapContainerRef.current, {
      center: [65.0, 25.0],
      zoom: 6,
      zoomControl: true,
    });

    // OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Feature group for drawn elements
    const drawnLayers = new L.FeatureGroup();
    map.addLayer(drawnLayers);
    drawnLayersRef.current = drawnLayers;

    // Feature group for saved properties
    const propertiesLayer = new L.FeatureGroup();
    map.addLayer(propertiesLayer);
    propertiesLayerRef.current = propertiesLayer;

    // Feature group for saved markings
    const markingsLayer = new L.FeatureGroup();
    map.addLayer(markingsLayer);
    markingsLayerRef.current = markingsLayer;

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Render properties and markings on map when data changes
  useEffect(() => {
    if (!propertiesLayerRef.current || !markingsLayerRef.current) return;

    propertiesLayerRef.current.clearLayers();
    properties.forEach((prop) => {
      if (prop.geometry) {
        const layer = L.geoJSON(prop.geometry as GeoJSON.Geometry, {
          style: { color: '#166534', weight: 2, fillColor: '#15803d', fillOpacity: 0.15 },
        });
        layer.bindPopup(`<strong>🌳 ${prop.name}</strong><br/>Metsäkiinteistö`);
        propertiesLayerRef.current!.addLayer(layer);
      }
    });

    markingsLayerRef.current.clearLayers();
    markings.forEach((marking) => {
      if (!marking.geometry) return;
      const color = MARKING_COLORS[marking.type] || '#666';
      const label = MARKING_TYPE_LABELS[marking.type] || marking.type;
      const popupContent = `
        <strong>${marking.title}</strong><br/>
        <span style="color:${color}">● ${label}</span>
        ${marking.description ? `<br/><em>${marking.description}</em>` : ''}
      `;

      if (marking.geometry.type === 'Point') {
        const coords = marking.geometry.coordinates as [number, number];
        const marker = L.circleMarker([coords[1], coords[0]], {
          radius: 8,
          fillColor: color,
          color: '#fff',
          weight: 2,
          fillOpacity: 0.9,
        });
        marker.bindPopup(popupContent);
        markingsLayerRef.current!.addLayer(marker);
      } else {
        const layer = L.geoJSON(marking.geometry as GeoJSON.Geometry, {
          style: { color, weight: 3, fillOpacity: 0.3 },
        });
        layer.bindPopup(popupContent);
        markingsLayerRef.current!.addLayer(layer);
      }
    });
  }, [properties, markings]);

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Start a draw interaction based on the selected tool
  const startDraw = useCallback((tool: DrawTool) => {
    if (!mapRef.current || !drawnLayersRef.current) return;

    // Clean up existing draw control
    if (drawControlRef.current) {
      mapRef.current.removeControl(drawControlRef.current);
      drawControlRef.current = null;
    }

    setActiveTool(tool);

    if (!tool) return;

    // Configure draw options based on selected tool
    let drawOptions: L.Control.DrawConstructorOptions;

    if (tool === 'property' || tool === 'area') {
      drawOptions = {
        draw: {
          polygon: { shapeOptions: { color: tool === 'property' ? '#166534' : '#3b82f6' } },
          polyline: false,
          marker: false,
          circle: false,
          rectangle: false,
          circlemarker: false,
        },
        edit: { featureGroup: drawnLayersRef.current },
      };
    } else if (tool === 'line') {
      drawOptions = {
        draw: {
          polygon: false,
          polyline: { shapeOptions: { color: '#3b82f6' } },
          marker: false,
          circle: false,
          rectangle: false,
          circlemarker: false,
        },
        edit: { featureGroup: drawnLayersRef.current },
      };
    } else {
      // point or note - use marker
      drawOptions = {
        draw: {
          polygon: false,
          polyline: false,
          marker: {},
          circle: false,
          rectangle: false,
          circlemarker: false,
        },
        edit: { featureGroup: drawnLayersRef.current },
      };
    }

    const drawControl = new L.Control.Draw(drawOptions);
    mapRef.current.addControl(drawControl);
    drawControlRef.current = drawControl;

    // Auto-start the appropriate draw handler
    const handlers: Record<string, string> = {
      property: 'polygon',
      area: 'polygon',
      line: 'polyline',
      point: 'marker',
      note: 'marker',
    };

    const handlerName = handlers[tool];
    if (handlerName) {
      // Trigger the draw mode after control is added
      setTimeout(() => {
        const drawHandlers = (drawControl as unknown as Record<string, unknown>)._toolbars;
        if (drawHandlers) {
          const drawToolbar = (drawHandlers as Record<string, unknown>).draw as Record<string, unknown>;
          if (drawToolbar?._modes) {
            const modes = drawToolbar._modes as Record<string, { handler: { enable: () => void } }>;
            if (modes[handlerName]) {
              modes[handlerName].handler.enable();
            }
          }
        }
      }, 100);
    }
  }, []);

  // Handle draw:created event - show form with geometry
  useEffect(() => {
    if (!mapRef.current) return;

    const handleCreated = (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created;
      const layer = event.layer;
      drawnLayersRef.current?.addLayer(layer);

      // Extract GeoJSON geometry from drawn layer
      let geometry: GeoJSONGeometry = null;
      let geometryType: GeometryType = 'point';

      if (layer instanceof L.Marker) {
        const latlng = layer.getLatLng();
        geometry = { type: 'Point', coordinates: [latlng.lng, latlng.lat] };
        geometryType = activeTool === 'note' ? 'note' : 'point';
      } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
        const latlngs = (layer.getLatLngs() as L.LatLng[]).map((ll) => [ll.lng, ll.lat] as [number, number]);
        geometry = { type: 'LineString', coordinates: latlngs };
        geometryType = 'line';
      } else if (layer instanceof L.Polygon) {
        const latlngs = (layer.getLatLngs()[0] as L.LatLng[]).map((ll) => [ll.lng, ll.lat] as [number, number]);
        // Close the ring
        if (latlngs.length > 0 && (latlngs[0][0] !== latlngs[latlngs.length - 1][0] || latlngs[0][1] !== latlngs[latlngs.length - 1][1])) {
          latlngs.push(latlngs[0]);
        }
        geometry = { type: 'Polygon', coordinates: [latlngs] };
        geometryType = activeTool === 'property' ? 'area' : 'area';
      }

      setPendingGeometry(geometry);
      setPendingGeometryType(geometryType);
      setShowForm(true);

      // Remove draw control
      if (drawControlRef.current && mapRef.current) {
        mapRef.current.removeControl(drawControlRef.current);
        drawControlRef.current = null;
      }
    };

    mapRef.current.on(L.Draw.Event.CREATED, handleCreated);
    return () => {
      mapRef.current?.off(L.Draw.Event.CREATED, handleCreated);
    };
  }, [activeTool]);

  // Save a new property (polygon)
  const handleSaveProperty = async (name: string) => {
    try {
      const prop = await propertiesService.create(name, pendingGeometry);
      setProperties((prev) => [prop, ...prev]);
      drawnLayersRef.current?.clearLayers();
      setShowForm(false);
      setActiveTool(null);
    } catch {
      setError('Kiinteistön tallennus epäonnistui');
    }
  };

  // Save a new marking
  const handleSaveMarking = async (data: {
    type: MarkingType;
    title: string;
    description: string;
  }) => {
    try {
      const marking = await markingsService.create({
        type: data.type,
        geometry_type: pendingGeometryType,
        title: data.title,
        description: data.description,
        geometry: pendingGeometry,
      });
      setMarkings((prev) => [marking, ...prev]);
      drawnLayersRef.current?.clearLayers();
      setShowForm(false);
      setActiveTool(null);
    } catch {
      setError('Merkinnän tallennus epäonnistui');
    }
  };

  const handleCancelForm = () => {
    drawnLayersRef.current?.clearLayers();
    setShowForm(false);
    setActiveTool(null);
    if (drawControlRef.current && mapRef.current) {
      mapRef.current.removeControl(drawControlRef.current);
      drawControlRef.current = null;
    }
  };

  const handleDeleteMarking = async (id: number) => {
    try {
      await markingsService.delete(id);
      setMarkings((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setError('Merkinnän poisto epäonnistui');
    }
  };

  const handleDeleteProperty = async (id: number) => {
    try {
      await propertiesService.delete(id);
      setProperties((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError('Kiinteistön poisto epäonnistui');
    }
  };

  return (
    <div className="map-page">
      {/* Top navigation bar */}
      <nav className="map-nav">
        <div className="map-nav-left">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Valikko"
          >
            ☰
          </button>
          <span className="map-nav-title">🌲 Metsuri</span>
        </div>
        <div className="map-nav-right">
          <span className="user-email">{user?.email}</span>
          <button className="btn btn-small" onClick={logout}>
            Kirjaudu ulos
          </button>
        </div>
      </nav>

      <div className="map-content">
        {/* Sidebar with data list */}
        <div className={`map-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <h3>Kiinteistöt ({properties.length})</h3>
          </div>
          <ul className="sidebar-list">
            {properties.map((p) => (
              <li key={p.id} className="sidebar-item">
                <span>🌳 {p.name}</span>
                <button
                  className="btn-icon delete"
                  onClick={() => handleDeleteProperty(p.id)}
                  title="Poista"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>

          <div className="sidebar-header">
            <h3>Merkinnät ({markings.length})</h3>
          </div>
          <ul className="sidebar-list">
            {markings.map((m) => (
              <li key={m.id} className="sidebar-item">
                <div>
                  <span className="marking-dot" style={{ color: MARKING_COLORS[m.type] }}>●</span>
                  <span>{m.title}</span>
                  <small className="marking-type">{MARKING_TYPE_LABELS[m.type]}</small>
                </div>
                <button
                  className="btn-icon delete"
                  onClick={() => handleDeleteMarking(m.id)}
                  title="Poista"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Map container */}
        <div className="map-wrapper">
          <div ref={mapContainerRef} className="leaflet-map" />

          {/* Drawing toolbar - mobile-friendly touch buttons */}
          <div className="draw-toolbar">
            <button
              className={`tool-btn ${activeTool === 'property' ? 'active' : ''}`}
              onClick={() => activeTool === 'property' ? startDraw(null) : startDraw('property')}
              title="Lisää kiinteistö"
            >
              🌳<span>Kiinteistö</span>
            </button>
            <button
              className={`tool-btn ${activeTool === 'point' ? 'active' : ''}`}
              onClick={() => activeTool === 'point' ? startDraw(null) : startDraw('point')}
              title="Lisää piste"
            >
              📍<span>Piste</span>
            </button>
            <button
              className={`tool-btn ${activeTool === 'line' ? 'active' : ''}`}
              onClick={() => activeTool === 'line' ? startDraw(null) : startDraw('line')}
              title="Lisää viiva"
            >
              📏<span>Viiva</span>
            </button>
            <button
              className={`tool-btn ${activeTool === 'area' ? 'active' : ''}`}
              onClick={() => activeTool === 'area' ? startDraw(null) : startDraw('area')}
              title="Lisää alue"
            >
              🗺️<span>Alue</span>
            </button>
            <button
              className={`tool-btn ${activeTool === 'note' ? 'active' : ''}`}
              onClick={() => activeTool === 'note' ? startDraw(null) : startDraw('note')}
              title="Lisää muistiinpano"
            >
              📝<span>Muistio</span>
            </button>
          </div>

          {error && (
            <div className="map-error" onClick={() => setError('')}>
              ⚠️ {error} (klikkaa sulkeaksesi)
            </div>
          )}
        </div>
      </div>

      {/* Marking/Property form modal */}
      {showForm && (
        <MarkingForm
          isProperty={activeTool === 'property'}
          geometryType={pendingGeometryType}
          onSaveMarking={handleSaveMarking}
          onSaveProperty={handleSaveProperty}
          onCancel={handleCancelForm}
        />
      )}
    </div>
  );
}
