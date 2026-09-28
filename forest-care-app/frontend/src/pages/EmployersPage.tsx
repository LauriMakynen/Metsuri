import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import TopNav from '../components/TopNav';
import WorkRequestCard from '../components/WorkRequestCard';
import { useAuth } from '../hooks/useAuth';
import { workRequestsService } from '../services/forestService';
import { MARKING_COLORS, MARKING_TYPE_LABELS, MARKING_TYPES } from '../utils/markingTypes';
import { formatArea } from '../utils/measurement';
import { bidSummaryText } from '../utils/bids';
import type { MarkingType, PublicWorkRequest } from '../types';

// Popup content is built with textContent: titles and notes are written by other users
function buildPopup(request: PublicWorkRequest): HTMLElement {
  const el = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = request.title;
  const meta = document.createElement('div');
  meta.textContent = [
    MARKING_TYPE_LABELS[request.type],
    request.area_ha ? formatArea(request.area_ha) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const bids = document.createElement('div');
  bids.textContent = `💶 ${bidSummaryText(request)}`;
  el.append(title, meta, bids);
  return el;
}

// Work providers browse open work requests from forest owners' parcels
export default function EmployersPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const requestsLayerRef = useRef<L.FeatureGroup | null>(null);
  const layersByIdRef = useRef<Map<number, L.Layer>>(new Map());
  // Fit the map to the requests only after a fresh load, not when a bid updates one row
  const fitPendingRef = useRef(true);
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<PublicWorkRequest[]>([]);
  const [typeFilter, setTypeFilter] = useState<MarkingType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Create the map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { center: [64.5, 26.0], zoom: 5 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    const layer = new L.FeatureGroup().addTo(map);
    mapRef.current = map;
    requestsLayerRef.current = layer;
    return () => {
      map.remove();
      mapRef.current = null;
      requestsLayerRef.current = null;
    };
  }, []);

  // Load open requests whenever the type filter changes
  useEffect(() => {
    let cancelled = false;
    workRequestsService
      .getOpen(typeFilter ?? undefined)
      .then((data) => {
        if (cancelled) return;
        fitPendingRef.current = true;
        setRequests(data);
        setError('');
      })
      .catch(() => {
        if (!cancelled) setError('Työpyyntöjen lataaminen epäonnistui');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [typeFilter]);

  // Draw requests on the map
  useEffect(() => {
    const map = mapRef.current;
    const group = requestsLayerRef.current;
    if (!map || !group) return;

    group.clearLayers();
    layersByIdRef.current.clear();

    requests.forEach((request) => {
      if (!request.geometry) return;
      const color = MARKING_COLORS[request.type];
      const layer = L.geoJSON(request.geometry as GeoJSON.Geometry, {
        style: { color, weight: 3, fillColor: color, fillOpacity: 0.3 },
        pointToLayer: (_feature, latlng) =>
          L.circleMarker(latlng, { radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9 }),
      });
      layer.bindPopup(buildPopup(request));
      layer.on('click', () => setSelectedId(request.id));
      layer.addTo(group);
      layersByIdRef.current.set(request.id, layer);
    });

    const bounds = group.getBounds();
    if (fitPendingRef.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
      fitPendingRef.current = false;
    }
  }, [requests]);

  const handleBidPlaced = (updated: PublicWorkRequest) => {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const goToLogin = () => {
    logout();
    navigate('/login');
  };

  const focusRequest = (request: PublicWorkRequest) => {
    setSelectedId(request.id);
    const layer = layersByIdRef.current.get(request.id) as L.GeoJSON | undefined;
    const map = mapRef.current;
    if (!layer || !map) return;
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
    layer.openPopup(bounds.isValid() ? bounds.getCenter() : undefined);
    mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <div className="start-page">
      <TopNav />

      <main className="start-content">
        <header className="start-header">
          <Link to="/start" className="back-link">← Takaisin</Link>
          <h1>Työn tarjoajille</h1>
          <p>
            Selaa metsäpalstoja, joille metsänomistajat ovat jättäneet työpyynnön, ja tarjoa hintaa.
            Paras tarjous näkyy kaikille nimettömänä.
          </p>
        </header>

        <div className="type-filter" role="group" aria-label="Suodata työtyypin mukaan">
          <button
            className={`filter-chip ${typeFilter === null ? 'active' : ''}`}
            onClick={() => setTypeFilter(null)}
          >
            Kaikki
          </button>
          {MARKING_TYPES.map((type) => (
            <button
              key={type}
              className={`filter-chip ${typeFilter === type ? 'active' : ''}`}
              onClick={() => setTypeFilter(type)}
            >
              <span style={{ color: MARKING_COLORS[type] }}>●</span> {MARKING_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="requests-layout">
          <div ref={mapContainerRef} className="requests-map" />

          <section className="requests-list">
            <h2 className="requests-count">
              {loading ? 'Ladataan...' : `Avoimia työpyyntöjä: ${requests.length}`}
            </h2>

            {!loading && requests.length === 0 && !error && (
              <p className="requests-empty">
                Ei avoimia työpyyntöjä{typeFilter ? ` tyypille ${MARKING_TYPE_LABELS[typeFilter].toLowerCase()}` : ''}.
              </p>
            )}

            {requests.map((request) => (
              <WorkRequestCard
                key={request.id}
                request={request}
                selected={selectedId === request.id}
                canBid={isAuthenticated}
                onFocus={() => focusRequest(request)}
                onBidPlaced={handleBidPlaced}
                onLoginToBid={goToLogin}
              />
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
