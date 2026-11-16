import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import TopNav from '../components/TopNav';
import WorkRequestCard from '../components/WorkRequestCard';
import SpruceForestBackdrop from '../components/SpruceForestBackdrop';
import { useAuth } from '../hooks/useAuth';
import { workRequestsService } from '../services/forestService';
import { MARKING_COLORS, MARKING_TYPE_LABELS, MARKING_TYPES } from '../utils/markingTypes';
import { formatArea } from '../utils/measurement';
import { bidSummaryText } from '../utils/bids';
import { distanceKm, formatDistance } from '../utils/distance';
import type { MarkingType, PublicWorkRequest, Region } from '../types';

type LatLng = { lat: number; lng: number };

const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 100;
const DEFAULT_RADIUS_KM = 25;

function locationErrorText(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Sijainnin käyttö estettiin. Salli sijainti selaimen asetuksista nähdäksesi lähellä olevat työpyynnöt.';
  }
  return 'Sijaintia ei saatu selvitettyä. Yritä hetken kuluttua uudelleen.';
}

function nearbyNoticeText(
  count: number,
  radiusKm: number,
  nearestKm: number | null,
  ownOnly: boolean
): string {
  if (count === 0) {
    return `Ei ${ownOnly ? 'omia avoimia työpyyntöjä' : 'avoimia työpyyntöjä'} ${radiusKm} km säteellä sijainnistasi.`;
  }
  const requests = ownOnly
    ? count === 1 ? '1 oma avoin työpyyntö' : `${count} omaa avointa työpyyntöä`
    : count === 1 ? '1 avoin työpyyntö' : `${count} avointa työpyyntöä`;
  const nearest = nearestKm !== null ? ` Lähin on ${formatDistance(nearestKm)} päässä.` : '';
  return `${requests} ${radiusKm} km säteellä sijainnistasi.${nearest}`;
}

// Popup content is built with textContent: titles and notes are written by other users
function buildPopup(request: PublicWorkRequest, distance: number | null): HTMLElement {
  const el = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = request.title;
  const meta = document.createElement('div');
  meta.textContent = [
    MARKING_TYPE_LABELS[request.type],
    request.area_ha ? formatArea(request.area_ha) : null,
    request.region_name,
    distance !== null ? `${formatDistance(distance)} sinusta` : null,
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
  const locationLayerRef = useRef<L.LayerGroup | null>(null);
  const layersByIdRef = useRef<Map<number, L.Layer>>(new Map());
  // Fit the map to the requests only after a fresh load, not when a bid updates one row
  const fitPendingRef = useRef(true);
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedWorkRequestId = Number(searchParams.get('workRequest'));

  const [requests, setRequests] = useState<PublicWorkRequest[]>([]);
  const [typeFilter, setTypeFilter] = useState<MarkingType | null>(null);
  const [ownOnly, setOwnOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  // The viewer's location stays in the browser; distances are computed here, not on the server
  const [position, setPosition] = useState<LatLng | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  // Create the map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { center: [64.5, 26.0], zoom: 5 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    const layer = new L.FeatureGroup().addTo(map);
    const locationLayer = L.layerGroup().addTo(map);
    mapRef.current = map;
    requestsLayerRef.current = layer;
    locationLayerRef.current = locationLayer;
    return () => {
      map.remove();
      mapRef.current = null;
      requestsLayerRef.current = null;
      locationLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    workRequestsService
      .getRegions()
      .then(setRegions)
      .catch(() => setRegions([]));
  }, []);

  // Load open requests whenever the type or region filter changes
  useEffect(() => {
    let cancelled = false;
    workRequestsService
      .getOpen({ type: typeFilter ?? undefined, region: regionFilter ?? undefined })
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
  }, [typeFilter, regionFilter]);

  // With a location, only requests within the radius are shown, nearest first
  const visibleRequests = useMemo(() => {
    const withDistance = requests
      .filter((request) => !ownOnly || request.is_own)
      .map((request) => ({
      request,
      distance: position ? distanceKm(position, request) : null,
      }));
    if (!position) return withDistance;
    return withDistance
      .filter(({ distance }) => (distance as number) <= radiusKm)
      .sort((a, b) => (a.distance as number) - (b.distance as number));
  }, [requests, ownOnly, position, radiusKm]);

  // Draw requests on the map
  useEffect(() => {
    const map = mapRef.current;
    const group = requestsLayerRef.current;
    if (!map || !group) return;

    group.clearLayers();
    layersByIdRef.current.clear();

    visibleRequests.forEach(({ request, distance }) => {
      if (!request.geometry) return;
      // The whole property as a dashed outline around the work area (logged-in viewers only)
      if (request.property_geometry) {
        L.geoJSON(request.property_geometry as GeoJSON.Geometry, {
          style: { color: '#0f3d24', weight: 2, dashArray: '6 5', fill: false },
          interactive: false,
        }).addTo(group);
      }
      const color = MARKING_COLORS[request.type];
      const layer = L.geoJSON(request.geometry as GeoJSON.Geometry, {
        style: { color, weight: 3, fillColor: color, fillOpacity: 0.3 },
        pointToLayer: (_feature, latlng) =>
          L.circleMarker(latlng, { radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9 }),
      });
      layer.bindPopup(buildPopup(request, distance));
      layer.on('click', () => setSelectedId(request.id));
      layer.addTo(group);
      layersByIdRef.current.set(request.id, layer);
    });

    // The radius circle decides the view while the distance filter is on
    const bounds = group.getBounds();
    if (fitPendingRef.current && !position && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
      fitPendingRef.current = false;
    }
  }, [visibleRequests, position]);

  // Draw the viewer's location and the search radius
  useEffect(() => {
    const map = mapRef.current;
    const layer = locationLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!position) return;
    const circle = L.circle(position, {
      radius: radiusKm * 1000,
      color: '#2563eb',
      weight: 2,
      fillColor: '#2563eb',
      fillOpacity: 0.06,
      interactive: false,
    }).addTo(layer);
    L.circleMarker(position, { radius: 7, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 })
      .bindTooltip('Sijaintisi')
      .addTo(layer);
    map.fitBounds(circle.getBounds(), { padding: [20, 20] });
  }, [position, radiusKm]);

  const toggleNearby = () => {
    if (position) {
      setPosition(null);
      fitPendingRef.current = true;
      return;
    }
    if (!navigator.geolocation) {
      setLocationError('Selaimesi ei tue sijainnin käyttöä.');
      return;
    }
    setLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ lat: coords.latitude, lng: coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocationError(locationErrorText(err));
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 }
    );
  };

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
    // Show the whole property when its boundary is known, so the work area is seen in context
    const view = request.property_geometry
      ? L.geoJSON(request.property_geometry as GeoJSON.Geometry).getBounds().extend(bounds)
      : bounds;
    if (view.isValid()) {
      map.fitBounds(view, { padding: [40, 40], maxZoom: 16 });
    }
    layer.openPopup(bounds.isValid() ? bounds.getCenter() : undefined);
    mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  useEffect(() => {
    if (!Number.isSafeInteger(requestedWorkRequestId) || requestedWorkRequestId <= 0) return;
    const request = requests.find((item) => item.id === requestedWorkRequestId);
    if (!request) return;
    const selection = window.setTimeout(() => setSelectedId(request.id), 0);
    return () => window.clearTimeout(selection);
  }, [requestedWorkRequestId, requests]);

  return (
    <div className="start-page forest-page">
      <SpruceForestBackdrop />
      <TopNav />

      <main className="start-content forest-content">
        <header className="forest-hero">
          <p className="forest-eyebrow">🌲 Työn tarjoajille</p>
          <h1>Metsätyöt odottavat tekijäänsä</h1>
          <p>
            Selaa metsäpalstoja, joille metsänomistajat ovat jättäneet työpyynnön, ja tarjoa hintaa.
            Paras tarjous näkyy kaikille nimettömänä.
          </p>
        </header>

        <section className="glass-panel filter-panel" aria-label="Suodata työtyypin mukaan">
          <h2 className="panel-title">Työtyyppi</h2>
          <div className="type-filter">
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
          <div className="filter-extra-controls">
            <label className="region-filter">
              <span className="panel-title">Maakunta</span>
              <select
                value={regionFilter ?? ''}
                onChange={(e) => setRegionFilter(e.target.value || null)}
                aria-label="Suodata maakunnan mukaan"
              >
                <option value="">Koko Suomi</option>
                {regions.map((region) => (
                  <option key={region.code} value={region.code}>
                    {region.name}
                  </option>
                ))}
              </select>
            </label>
            {isAuthenticated && (
              <label className="own-requests-filter">
                <input
                  type="checkbox"
                  checked={ownOnly}
                  onChange={(event) => setOwnOnly(event.target.checked)}
                />
                <span>Näytä vain omat työpyynnöt</span>
              </label>
            )}
          </div>
        </section>

        {error && <div className="error-message">{error}</div>}

        <div className="requests-layout">
          <section className="glass-panel map-panel">
            <h2 className="panel-title">🗺️ Kartta</h2>
            <div className="nearby-bar">
              <button
                className={`filter-chip nearby-toggle ${position ? 'active' : ''}`}
                onClick={toggleNearby}
                disabled={locating}
                aria-pressed={position !== null}
              >
                📍 {locating ? 'Haetaan sijaintia...' : position ? 'Lähellä minua ✕' : 'Lähellä minua'}
              </button>
              {position && (
                <label className="nearby-range">
                  <span>
                    Enintään <strong>{radiusKm} km</strong> linnuntietä
                  </span>
                  <input
                    type="range"
                    min={MIN_RADIUS_KM}
                    max={MAX_RADIUS_KM}
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    aria-label="Etäisyys sijainnistasi kilometreinä"
                  />
                </label>
              )}
            </div>
            {locationError && <p className="nearby-notice error">{locationError}</p>}
            {position && !loading && (
              <p className="nearby-notice" role="status">
                📍 {nearbyNoticeText(visibleRequests.length, radiusKm, visibleRequests[0]?.distance ?? null, ownOnly)}
              </p>
            )}
            <div ref={mapContainerRef} className="requests-map" />
          </section>

          <section className="glass-panel requests-list">
            <h2 className="panel-title">
              📢 {loading
                ? 'Ladataan työpyyntöjä...'
                : `${ownOnly ? 'Omat avoimet työpyynnöt' : 'Avoimet työpyynnöt'} (${visibleRequests.length})`}
            </h2>

            {!loading && visibleRequests.length === 0 && !error && (
              <p className="requests-empty">
                {ownOnly ? 'Ei omia avoimia työpyyntöjä' : 'Ei avoimia työpyyntöjä'}
                {typeFilter ? ` tyypille ${MARKING_TYPE_LABELS[typeFilter].toLowerCase()}` : ''}
                {regionFilter ? ` maakunnassa ${regions.find((r) => r.code === regionFilter)?.name ?? ''}` : ''}
                {position ? ` ${radiusKm} km säteellä` : ''}.
              </p>
            )}

            {visibleRequests.map(({ request, distance }) => (
              <WorkRequestCard
                key={request.id}
                request={request}
                distanceKm={distance}
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
