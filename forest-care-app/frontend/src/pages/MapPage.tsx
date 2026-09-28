import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { useAuth } from '../hooks/useAuth';
import {
  propertiesService,
  markingsService,
  cadastreService,
  mapService,
  workRequestsService,
} from '../services/forestService';
import { calculateAreaHa, formatArea, calculateDistance, formatDistance } from '../utils/measurement';
import { formatDate, formatDateRange } from '../utils/dateFormatting';
import { getFollowUpRecommendation } from '../utils/followUpRecommendation';
import { MARKING_COLORS, MARKING_TYPE_LABELS } from '../utils/markingTypes';
import { DEMO_MARKINGS, DEMO_PROPERTY } from '../utils/demoData';
import type {
  Property,
  Marking,
  MarkingType,
  GeometryType,
  GeoJSONGeometry,
  CadastreFeature,
  MapLayerConfig,
  ForestDataResponse,
  ForestValuationResponse,
  WorkRequest,
  Pricing,
} from '../types';
import MarkingForm from '../components/MarkingForm';
import Sidebar from '../components/Sidebar';
import ActivityTracker from '../components/ActivityTracker';
import type { ActivityResult } from '../components/ActivityTracker';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type DrawTool = 'property' | 'point' | 'line' | 'area' | 'note' | 'measure' | null;
type BaseLayerKey = 'maastokartta' | 'peruskartta' | 'ortokuva';

const PROPERTY_CODE_REGEX = /^\d{3}-\d{3}-\d{2}-\d{1,4}$/;

const FALLBACK_LAYER_CONFIG: MapLayerConfig = {
  provider: 'fallback',
  layers: {
    maastokartta: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    peruskartta: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ortokuva:
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  },
  attribution: 'OpenStreetMap / Esri',
};

function getDirectMmlLayerConfig(apiKey: string): MapLayerConfig {
  const key = encodeURIComponent(apiKey);
  return {
    provider: 'fallback',
    layers: {
      maastokartta: `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${key}`,
      peruskartta: `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/taustakartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${key}`,
      ortokuva: `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/ortokuva/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${key}`,
    },
    overlays: {
      kiinteistorajat: `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/kiinteistojaotus/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${key}`,
    },
    attribution: 'Maanmittauslaitos',
  };
}

function toBounds(geometry: GeoJSONGeometry): L.LatLngBounds | null {
  if (!geometry) return null;
  const layer = L.geoJSON(geometry as GeoJSON.Geometry);
  if (layer.getLayers().length === 0) return null;
  return layer.getBounds();
}

function getMapLayerConfigFromEnv(): MapLayerConfig | null {
  const key = import.meta.env.VITE_MML_API_KEY as string | undefined;
  if (!key) return null;
  return getDirectMmlLayerConfig(key);
}

export default function MapPage() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const drawnLayersRef = useRef<L.FeatureGroup | null>(null);
  const propertiesLayerRef = useRef<L.FeatureGroup | null>(null);
  const markingsLayerRef = useRef<L.FeatureGroup | null>(null);
  const selectedHighlightLayerRef = useRef<L.Layer | null>(null);
  const cadastreLayerRef = useRef<L.Layer | null>(null);
  const overlayLayerRef = useRef<L.TileLayer | null>(null);
  const baseLayersRef = useRef<Record<BaseLayerKey, L.TileLayer> | null>(null);
  const clickedCadastreLayerRef = useRef<L.Layer | null>(null);
  const measurementLayerRef = useRef<L.FeatureGroup | null>(null);
  const autoSelectedRef = useRef(false);

  const { user, logout, isGuest } = useAuth();
  const navigate = useNavigate();
  const [activeTool, setActiveTool] = useState<DrawTool>(null);
  // Guests start on an example parcel so the demo has something to try right away
  const [properties, setProperties] = useState<Property[]>(() => (isGuest ? [DEMO_PROPERTY] : []));
  const [markings, setMarkings] = useState<Marking[]>(() => (isGuest ? DEMO_MARKINGS : []));
  const [showForm, setShowForm] = useState(false);
  const [pendingGeometry, setPendingGeometry] = useState<GeoJSONGeometry>(null);
  const [pendingGeometryType, setPendingGeometryType] = useState<GeometryType>('point');
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(() =>
    isGuest ? DEMO_PROPERTY.id : null
  );
  const [selectedPropertyGeometry, setSelectedPropertyGeometry] = useState<GeoJSONGeometry>(() =>
    isGuest ? DEMO_PROPERTY.geometry : null
  );

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<CadastreFeature | null>(null);
  const [savingSearchResult, setSavingSearchResult] = useState(false);

  const [layerConfig, setLayerConfig] = useState<MapLayerConfig>(FALLBACK_LAYER_CONFIG);
  const [activeBaseLayer, setActiveBaseLayer] = useState<BaseLayerKey>('maastokartta');
  const [showCadastreOverlay, setShowCadastreOverlay] = useState(false);
  const [forestData, setForestData] = useState<ForestDataResponse | null>(null);
  const [valuation, setValuation] = useState<ForestValuationResponse | null>(null);
  const [tileLoading, setTileLoading] = useState(false);
  const [clickedCadastre, setClickedCadastre] = useState<CadastreFeature | null>(null);
  const [clickedCadastreCustomName, setClickedCadastreCustomName] = useState('');
  const [cadastreClickLoading, setCadastreClickLoading] = useState(false);
  const [workRequests, setWorkRequests] = useState<Record<number, WorkRequest>>({});
  const [activityOpen, setActivityOpen] = useState(false);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);
  const [emptyNoticeDismissed, setEmptyNoticeDismissed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'marking' | 'property'; id: number; label: string } | null>(null);

  // Measurement tool state
  const [measurementPoints, setMeasurementPoints] = useState<[number, number][]>([]);
  const [measurementDistance, setMeasurementDistance] = useState<number | null>(null);

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId) ?? null,
    [properties, selectedPropertyId]
  );

  const loadProperties = useCallback(async () => {
    if (isGuest) return;
    const props = await propertiesService.getAll();
    setProperties(props);
    setPropertiesLoaded(true);
    // "Avaa oma metsäpalsta" should land on the parcel, not on the whole of Finland
    if (props.length > 0 && !autoSelectedRef.current) {
      autoSelectedRef.current = true;
      setSelectedPropertyId((current) => current ?? props[0].id);
      setSelectedPropertyGeometry((current) => current ?? props[0].geometry);
    }
  }, [isGuest]);

  const loadMarkings = useCallback(async (propertyId?: number | null) => {
    if (isGuest) return;
    const marks = propertyId
      ? await propertiesService.getMarkings(propertyId)
      : await markingsService.getAll();
    setMarkings(marks);
  }, [isGuest]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [65.0, 25.0],
      zoom: 6,
      zoomControl: true,
    });

    const baseLayers: Record<BaseLayerKey, L.TileLayer> = {
      maastokartta: L.tileLayer(FALLBACK_LAYER_CONFIG.layers.maastokartta, {
        attribution: FALLBACK_LAYER_CONFIG.attribution,
        maxZoom: 19,
      }),
      peruskartta: L.tileLayer(FALLBACK_LAYER_CONFIG.layers.peruskartta, {
        attribution: FALLBACK_LAYER_CONFIG.attribution,
        maxZoom: 19,
      }),
      ortokuva: L.tileLayer(FALLBACK_LAYER_CONFIG.layers.ortokuva, {
        attribution: FALLBACK_LAYER_CONFIG.attribution,
        maxZoom: 19,
      }),
    };

    baseLayers.maastokartta.addTo(map);
    baseLayersRef.current = baseLayers;

    // Show loading indicator while tiles are fetching
    const onLoading = () => setTileLoading(true);
    const onLoad = () => setTileLoading(false);
    Object.values(baseLayers).forEach((layer) => {
      layer.on('loading', onLoading);
      layer.on('load', onLoad);
    });

    const drawnLayers = new L.FeatureGroup();
    map.addLayer(drawnLayers);
    drawnLayersRef.current = drawnLayers;

    const propertiesLayer = new L.FeatureGroup();
    map.addLayer(propertiesLayer);
    propertiesLayerRef.current = propertiesLayer;

    const markingsLayer = new L.FeatureGroup();
    map.addLayer(markingsLayer);
    markingsLayerRef.current = markingsLayer;

    // Add scale control (bottom-left corner)
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      baseLayersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const applyConfig = async () => {
      // The layer config endpoint requires auth, so guests use the env/fallback config directly.
      if (isGuest) {
        setLayerConfig(getMapLayerConfigFromEnv() ?? FALLBACK_LAYER_CONFIG);
        return;
      }
      try {
        const serverConfig = await mapService.getLayerConfig();
        setLayerConfig(serverConfig);
      } catch {
        const envConfig = getMapLayerConfigFromEnv();
        setLayerConfig(envConfig ?? FALLBACK_LAYER_CONFIG);
      }
    };

    applyConfig();
  }, [isGuest]);

  useEffect(() => {
    if (!baseLayersRef.current) return;
    (Object.keys(baseLayersRef.current) as BaseLayerKey[]).forEach((key) => {
      const layer = baseLayersRef.current![key];
      layer.setUrl(layerConfig.layers[key]);
      layer.options.attribution = layerConfig.attribution;
    });
  }, [layerConfig]);

  useEffect(() => {
    if (!mapRef.current || !baseLayersRef.current) return;

    (Object.keys(baseLayersRef.current) as BaseLayerKey[]).forEach((key) => {
      const layer = baseLayersRef.current![key];
      if (key === activeBaseLayer) {
        if (!mapRef.current!.hasLayer(layer)) {
          layer.addTo(mapRef.current!);
        }
      } else if (mapRef.current!.hasLayer(layer)) {
        mapRef.current!.removeLayer(layer);
      }
    });
  }, [activeBaseLayer]);

  // Create or update the cadastre boundary overlay TileLayer when layer config changes
  useEffect(() => {
    const overlayUrl = layerConfig.overlays?.kiinteistorajat;
    if (!overlayUrl) {
      if (overlayLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(overlayLayerRef.current);
      }
      overlayLayerRef.current = null;
      return;
    }
    if (!overlayLayerRef.current) {
      overlayLayerRef.current = L.tileLayer(overlayUrl, { opacity: 0.85, maxZoom: 19, minZoom: 14 });
    } else {
      overlayLayerRef.current.setUrl(overlayUrl);
    }
  }, [layerConfig]);

  // Toggle cadastre boundary overlay visibility
  useEffect(() => {
    if (!mapRef.current || !overlayLayerRef.current) return;
    if (showCadastreOverlay) {
      if (!mapRef.current.hasLayer(overlayLayerRef.current)) {
        overlayLayerRef.current.addTo(mapRef.current);
      }
    } else if (mapRef.current.hasLayer(overlayLayerRef.current)) {
      mapRef.current.removeLayer(overlayLayerRef.current);
    }
  }, [showCadastreOverlay]);

  // Map click to identify property when cadastre overlay is active
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showCadastreOverlay) {
      setClickedCadastre(null);
      return;
    }

    const handleMapClick = async (e: L.LeafletMouseEvent) => {
      if (activeTool) return; // Don't query while drawing
      setCadastreClickLoading(true);
      setClickedCadastre(null);
      try {
        const result = await cadastreService.searchByCoordinates(e.latlng.lat, e.latlng.lng);
        setClickedCadastre(result);
        setClickedCadastreCustomName('');
      } catch {
        // Silently ignore – coordinate query is best-effort
      } finally {
        setCadastreClickLoading(false);
      }
    };

    map.on('click', handleMapClick);
    return () => { map.off('click', handleMapClick); };
  }, [showCadastreOverlay, activeTool]);

  // Highlight clicked cadastre boundary on map
  useEffect(() => {
    const map = mapRef.current;
    if (clickedCadastreLayerRef.current && map) {
      map.removeLayer(clickedCadastreLayerRef.current);
      clickedCadastreLayerRef.current = null;
    }
    if (!clickedCadastre?.geometry || !map) return;
    const layer = L.geoJSON(clickedCadastre.geometry as GeoJSON.Geometry, {
      style: { color: '#0369a1', weight: 3, fillColor: '#38bdf8', fillOpacity: 0.2 },
    });
    layer.addTo(map);
    clickedCadastreLayerRef.current = layer;
  }, [clickedCadastre]);

  const refreshData = useCallback(async () => {
    try {
      await Promise.all([loadProperties(), loadMarkings(selectedPropertyId)]);
    } catch {
      setError('Tietojen lataaminen epäonnistui');
    }
  }, [loadProperties, loadMarkings, selectedPropertyId]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    loadMarkings(selectedPropertyId).catch(() => setError('Tietojen lataaminen epäonnistui'));
  }, [selectedPropertyId, loadMarkings]);

  // Own work requests, keyed by marking id (not available in guest mode)
  useEffect(() => {
    if (isGuest) return;
    workRequestsService
      .getMine()
      .then((requests) => setWorkRequests(Object.fromEntries(requests.map((r) => [r.marking_id, r]))))
      .catch(() => setError('Työpyyntöjen lataaminen epäonnistui'));
  }, [isGuest]);

  const handleRequestWork = async (markingId: number, note: string, pricing: Pricing) => {
    try {
      const request = await workRequestsService.create(markingId, note, pricing);
      setWorkRequests((prev) => ({ ...prev, [markingId]: request }));
    } catch {
      setError('Työpyynnön julkaisu epäonnistui');
    }
  };

  const handleWithdrawWorkRequest = async (requestId: number) => {
    try {
      await workRequestsService.withdraw(requestId);
      setWorkRequests((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([, r]) => r.id !== requestId))
      );
    } catch {
      setError('Työpyynnön peruminen epäonnistui');
    }
  };

  const renderSelectedHighlight = useCallback((geometry: GeoJSONGeometry, color: string) => {
    if (!mapRef.current || !geometry) return;

    if (selectedHighlightLayerRef.current) {
      mapRef.current.removeLayer(selectedHighlightLayerRef.current);
      selectedHighlightLayerRef.current = null;
    }

    const layer = L.geoJSON(geometry as GeoJSON.Geometry, {
      style: {
        color,
        weight: 4,
        fillOpacity: 0.1,
        dashArray: '6 6',
      },
    });

    layer.addTo(mapRef.current);
    selectedHighlightLayerRef.current = layer;
  }, []);

  useEffect(() => {
    if (!propertiesLayerRef.current) return;

    propertiesLayerRef.current.clearLayers();

    properties.forEach((prop) => {
      if (!prop.geometry) return;
      const isSelected = prop.id === selectedPropertyId;
      const layer = L.geoJSON(prop.geometry as GeoJSON.Geometry, {
        style: {
          color: isSelected ? '#0f172a' : '#166534',
          weight: isSelected ? 4 : 2,
          fillColor: isSelected ? '#86efac' : '#15803d',
          fillOpacity: isSelected ? 0.25 : 0.15,
        },
      });
      layer.bindPopup(`<strong>🌳 ${prop.name}</strong><br/>Metsäkiinteistö`);
      layer.on('click', () => {
        setSelectedPropertyId(prop.id);
        setSelectedPropertyGeometry(prop.geometry);
      });
      propertiesLayerRef.current!.addLayer(layer);
    });
  }, [properties, selectedPropertyId]);

  useEffect(() => {
    if (!markingsLayerRef.current) return;

    markingsLayerRef.current.clearLayers();
    markings.forEach((marking) => {
      if (!marking.geometry) return;

      const color = MARKING_COLORS[marking.type] || '#666';
      const label = MARKING_TYPE_LABELS[marking.type] || marking.type;
      let popupContent = `
        <strong>${marking.title}</strong><br/>
        <span style="color:${color}">● ${label}</span>
        ${marking.description ? `<br/><em>${marking.description}</em>` : ''}
      `;
      
      // Add area for polygon markings
      if ((marking.geometry.type === 'Polygon' || marking.geometry.type === 'MultiPolygon') && marking.area_ha != null) {
        popupContent += `<br/><span style="font-weight:500">📐 ${formatArea(marking.area_ha)}</span>`;
      }

      if (marking.operation_date) {
        popupContent += `<br/><span>Toimenpide tehty: ${formatDate(marking.operation_date)}</span>`;
      }

      if (marking.follow_up_note) {
        popupContent += `<br/><span>${marking.follow_up_note}</span>`;
      }

      if (marking.follow_up_date_start || marking.follow_up_date_end) {
        popupContent += `<br/><span>Seuraava tarkastus: ${formatDateRange(
          marking.follow_up_date_start ?? '',
          marking.follow_up_date_end ?? ''
        )}</span>`;
      }

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
  }, [markings]);

  useEffect(() => {
    if (!selectedPropertyGeometry) return;
    renderSelectedHighlight(selectedPropertyGeometry, '#0f172a');

    const bounds = toBounds(selectedPropertyGeometry);
    if (bounds && mapRef.current) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [selectedPropertyGeometry, renderSelectedHighlight]);

  // Load forest stand data and valuation when selected property changes
  useEffect(() => {
    if (!selectedPropertyId) {
      setForestData(null);
      setValuation(null);
      return;
    }
    Promise.all([
      propertiesService.getForestData(selectedPropertyId).catch(() => null),
      propertiesService.getValuation(selectedPropertyId).catch(() => null),
    ]).then(([fd, val]) => {
      setForestData(fd);
      setValuation(val);
    });
  }, [selectedPropertyId]);

  const startDraw = useCallback((tool: DrawTool) => {
    if (!mapRef.current || !drawnLayersRef.current) return;

    if (tool && tool !== 'property' && !selectedPropertyId) {
      setError('Valitse ensin kiinteistö ennen merkinnän tallentamista');
      return;
    }

    if (drawControlRef.current) {
      mapRef.current.removeControl(drawControlRef.current);
      drawControlRef.current = null;
    }

    setActiveTool(tool);
    if (!tool) return;

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

    const handlers: Record<string, string> = {
      property: 'polygon',
      area: 'polygon',
      line: 'polyline',
      point: 'marker',
      note: 'marker',
    };

    const handlerName = handlers[tool];
    if (handlerName) {
      setTimeout(() => {
        const drawHandlers = (drawControl as unknown as Record<string, unknown>)._toolbars;
        const drawToolbar = (drawHandlers as Record<string, unknown>)?.draw as Record<string, unknown> | undefined;
        const modes = drawToolbar?._modes as Record<string, { handler: { enable: () => void } }> | undefined;
        modes?.[handlerName]?.handler.enable();
      }, 100);
    }
  }, [selectedPropertyId]);

  const handleMeasurementClick = useCallback((e: L.LeafletMouseEvent) => {
    if (!mapRef.current || !measurementLayerRef.current) return;

    const latlng = e.latlng;
    setMeasurementPoints((prevPoints) => {
      const newPoints = [...prevPoints, [latlng.lat, latlng.lng] as [number, number]];

      // Add marker
      L.circleMarker([latlng.lat, latlng.lng], {
        radius: 6,
        fillColor: '#ef4444',
        color: '#fff',
        weight: 2,
        fillOpacity: 0.8,
      }).addTo(measurementLayerRef.current!);

      // If we have 2 points, draw line and calculate distance
      if (newPoints.length === 2) {
        const dist = calculateDistance(newPoints[0][0], newPoints[0][1], newPoints[1][0], newPoints[1][1]);
        setMeasurementDistance(dist);

        // Draw line between points
        L.polyline(newPoints, {
          color: '#ef4444',
          weight: 2,
          opacity: 0.7,
        }).addTo(measurementLayerRef.current!);

        // Add distance label at midpoint
        const midLat = (newPoints[0][0] + newPoints[1][0]) / 2;
        const midLng = (newPoints[0][1] + newPoints[1][1]) / 2;
        const label = formatDistance(dist);
        L.marker([midLat, midLng], {
          icon: L.divIcon({
            className: 'measurement-label',
            html: `<div style="background:#ef4444;color:white;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:bold;white-space:nowrap;">${label}</div>`,
            iconSize: [0, 0],
          }),
        }).addTo(measurementLayerRef.current!);
      }

      return newPoints;
    });
  }, []);

  const clearMeasurement = useCallback(() => {
    if (measurementLayerRef.current) {
      measurementLayerRef.current.clearLayers();
    }
    setMeasurementPoints([]);
    setMeasurementDistance(null);
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    // Handle measurement mode
    if (activeTool === 'measure') {
      if (!measurementLayerRef.current) {
        const layer = new L.FeatureGroup();
        mapRef.current.addLayer(layer);
        measurementLayerRef.current = layer;
      }
      mapRef.current.on('click', handleMeasurementClick);
      return () => {
        mapRef.current?.off('click', handleMeasurementClick);
      };
    } else {
      // Clean up measurement mode
      if (measurementLayerRef.current) {
        mapRef.current.removeLayer(measurementLayerRef.current);
        measurementLayerRef.current = null;
      }
      clearMeasurement();
    }
  }, [activeTool, handleMeasurementClick, clearMeasurement]);

  useEffect(() => {
    if (!mapRef.current) return;

    const handleCreated = (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created;
      const layer = event.layer;
      drawnLayersRef.current?.addLayer(layer);

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
        if (
          latlngs.length > 0 &&
          (latlngs[0][0] !== latlngs[latlngs.length - 1][0] ||
            latlngs[0][1] !== latlngs[latlngs.length - 1][1])
        ) {
          latlngs.push(latlngs[0]);
        }
        geometry = { type: 'Polygon', coordinates: [latlngs] };
        geometryType = 'area';
      }

      setPendingGeometry(geometry);
      setPendingGeometryType(geometryType);
      setShowForm(true);

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

  const cancelDraw = useCallback(() => {
    if (drawControlRef.current && mapRef.current) {
      mapRef.current.removeControl(drawControlRef.current);
      drawControlRef.current = null;
    }
    drawnLayersRef.current?.clearLayers();
    setShowForm(false);
    setActiveTool(null);
  }, []);

  const handleSaveProperty = async (name: string) => {
    try {
      let prop: Property;
      if (isGuest) {
        prop = {
          id: -Date.now(),
          name,
          geometry: pendingGeometry,
          created_at: new Date().toISOString(),
        };
      } else {
        prop = await propertiesService.create(name, pendingGeometry);
      }
      setProperties((prev) => [prop, ...prev]);
      setSelectedPropertyId(prop.id);
      setSelectedPropertyGeometry(prop.geometry);
      drawnLayersRef.current?.clearLayers();
      setShowForm(false);
      setActiveTool(null);
    } catch {
      setError('Kiinteistön tallennus epäonnistui');
    }
  };

  const handleSaveMarking = async (data: {
    type: MarkingType;
    title: string;
    description: string;
    operation_date: string;
    area_ha?: number | null;
  }) => {
    if (!selectedPropertyId) {
      setError('Valitse ensin kiinteistö, johon merkintä liitetään.');
      return;
    }

    // Calculate area for polygons
    let areaHa: number | null = null;
    if (pendingGeometryType === 'area' && pendingGeometry?.type === 'Polygon') {
      areaHa = calculateAreaHa(pendingGeometry);
    }

    const followUp = getFollowUpRecommendation(data.type, data.operation_date);

    try {
      let marking: Marking;
      if (isGuest) {
        marking = {
          id: -Date.now(),
          property_id: selectedPropertyId,
          type: data.type,
          geometry_type: pendingGeometryType,
          title: data.title,
          description: data.description || null,
          geometry: pendingGeometry,
          area_ha: areaHa,
          operation_date: data.operation_date,
          follow_up_date_start: followUp.followUpDateStart,
          follow_up_date_end: followUp.followUpDateEnd,
          follow_up_note: followUp.followUpNote,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      } else {
        marking = await markingsService.create({
          property_id: selectedPropertyId,
          type: data.type,
          geometry_type: pendingGeometryType,
          title: data.title,
          description: data.description,
          geometry: pendingGeometry,
          area_ha: areaHa,
          operation_date: data.operation_date,
        });
      }
      setMarkings((prev) => [marking, ...prev]);
      drawnLayersRef.current?.clearLayers();
      setShowForm(false);
      setActiveTool(null);
    } catch (err: unknown) {
      const backendMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(backendMessage || 'Merkinnän tallennus epäonnistui');
    }
  };

  const openActivity = () => {
    if (!selectedPropertyId) {
      setError('Valitse ensin palsta, jolla aktiviteetti tehdään.');
      setSidebarOpen(true);
      return;
    }
    startDraw(null);
    setSidebarOpen(false);
    setActivityOpen(true);
  };

  // Save a finished GPS activity as an area marking on the selected parcel
  const handleSaveActivity = async (result: ActivityResult) => {
    if (!selectedPropertyId) return;
    const today = new Date();
    const operationDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const minutes = Math.max(1, Math.round(result.durationS / 60));
    const title = `${MARKING_TYPE_LABELS[result.type]} ${today.toLocaleDateString('fi-FI')}`;
    const description = `GPS-aktiviteetti: ${minutes} min, ${formatDistance(result.distanceM)} kävelty.`;
    const geometry = result.geometry as GeoJSONGeometry;
    const areaHa = Math.round(result.areaHa * 100) / 100;

    try {
      let marking: Marking;
      if (isGuest) {
        const followUp = getFollowUpRecommendation(result.type, operationDate);
        marking = {
          id: -Date.now(),
          property_id: selectedPropertyId,
          type: result.type,
          geometry_type: 'area',
          title,
          description,
          geometry,
          area_ha: areaHa,
          operation_date: operationDate,
          follow_up_date_start: followUp.followUpDateStart,
          follow_up_date_end: followUp.followUpDateEnd,
          follow_up_note: followUp.followUpNote,
          created_at: today.toISOString(),
          updated_at: today.toISOString(),
        };
      } else {
        marking = await markingsService.create({
          property_id: selectedPropertyId,
          type: result.type,
          geometry_type: 'area',
          title,
          description,
          geometry,
          area_ha: areaHa,
          operation_date: operationDate,
        });
      }
      setMarkings((prev) => [marking, ...prev]);
    } catch {
      setError('Aktiviteetin tallennus epäonnistui');
      throw new Error('save failed');
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

  const handleDeleteMarking = (id: number) => {
    const marking = markings.find((m) => m.id === id);
    setConfirmDelete({ type: 'marking', id, label: marking?.title ?? 'merkintä' });
  };

  const handleDeleteProperty = (id: number) => {
    const prop = properties.find((p) => p.id === id);
    setConfirmDelete({ type: 'property', id, label: prop?.name ?? 'kiinteistö' });
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (isGuest) {
        if (confirmDelete.type === 'marking') {
          setMarkings((prev) => prev.filter((m) => m.id !== confirmDelete.id));
        } else {
          setProperties((prev) => prev.filter((p) => p.id !== confirmDelete.id));
          if (selectedPropertyId === confirmDelete.id) {
            setSelectedPropertyId(null);
            setSelectedPropertyGeometry(null);
          }
        }
      } else if (confirmDelete.type === 'marking') {
        await markingsService.delete(confirmDelete.id);
        setMarkings((prev) => prev.filter((m) => m.id !== confirmDelete.id));
      } else {
        await propertiesService.delete(confirmDelete.id);
        setProperties((prev) => prev.filter((p) => p.id !== confirmDelete.id));
        if (selectedPropertyId === confirmDelete.id) {
          setSelectedPropertyId(null);
          setSelectedPropertyGeometry(null);
        }
      }
    } catch {
      setError(
        confirmDelete.type === 'marking'
          ? 'Merkinnän poisto epäonnistui'
          : 'Kiinteistön poisto epäonnistui'
      );
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleSaveClickedCadastre = async () => {
    if (!clickedCadastre) return;
    setSavingSearchResult(true);
    setError('');
    const saveName = clickedCadastreCustomName.trim() || clickedCadastre.properties.propertyCode;
    try {
      let created: Property;
      if (isGuest) {
        created = {
          id: -Date.now(),
          name: saveName,
          property_code: clickedCadastre.properties.propertyCode,
          area_ha: clickedCadastre.properties.areaHa,
          geometry: clickedCadastre.geometry,
          created_at: new Date().toISOString(),
        };
      } else {
        created = await propertiesService.importFromCadastre({
          name: saveName,
          property_code: clickedCadastre.properties.propertyCode,
          geometry: clickedCadastre.geometry,
          area_ha: clickedCadastre.properties.areaHa,
        });
      }
      setProperties((prev) => [created, ...prev]);
      setSelectedPropertyId(created.id);
      setSelectedPropertyGeometry(created.geometry);
      setClickedCadastre(null);
      setClickedCadastreCustomName('');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setError(
        status === 409
          ? 'Kiinteistö on jo tallennettu omiin kiinteistöihin'
          : 'Kiinteistön tallennus epäonnistui'
      );
    } finally {
      setSavingSearchResult(false);
    }
  };

  const handleSelectProperty = (property: Property) => {
    setSelectedPropertyId(property.id);
    setSelectedPropertyGeometry(property.geometry);
    setSidebarOpen(true);
  };

  const handleSaveCadastreToProperties = async () => {
    if (!searchResult) return;

    setSavingSearchResult(true);
    setError('');
    try {
      let created: Property;
      if (isGuest) {
        created = {
          id: -Date.now(),
          name: searchResult.properties.name,
          property_code: searchResult.properties.propertyCode,
          area_ha: searchResult.properties.areaHa,
          geometry: searchResult.geometry,
          created_at: new Date().toISOString(),
        };
      } else {
        created = await propertiesService.importFromCadastre({
          name: searchResult.properties.name,
          property_code: searchResult.properties.propertyCode,
          geometry: searchResult.geometry,
          area_ha: searchResult.properties.areaHa,
        });
      }

      setProperties((prev) => [created, ...prev]);
      setSelectedPropertyId(created.id);
      setSelectedPropertyGeometry(created.geometry);
      setSearchResult(null);

      if (cadastreLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(cadastreLayerRef.current);
        cadastreLayerRef.current = null;
      }
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;

      if (status === 409) {
        setError('Kiinteistö on jo tallennettu omiin kiinteistöihin');
      } else {
        setError('Kiinteistön tallennus epäonnistui');
      }
    } finally {
      setSavingSearchResult(false);
    }
  };

  const handleOnSearch = async (propertyCode: string): Promise<CadastreFeature | null> => {
    const code = propertyCode.trim();
    if (!PROPERTY_CODE_REGEX.test(code)) {
      setError('Kiinteistötunnus on väärässä muodossa');
      return null;
    }

    setSearchLoading(true);
    setError('');
    try {
      const feature = await cadastreService.searchByPropertyCode(code);
      setSearchResult(feature);

      if (cadastreLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(cadastreLayerRef.current);
      }

      const layer = L.geoJSON(feature.geometry as GeoJSON.Geometry, {
        style: {
          color: '#0369a1',
          weight: 3,
          fillColor: '#38bdf8',
          fillOpacity: 0.2,
        },
      });
      layer.bindPopup(`<strong>${feature.properties.name}</strong><br/>${feature.properties.propertyCode}`);
      layer.addTo(mapRef.current!);
      cadastreLayerRef.current = layer;

      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        mapRef.current?.fitBounds(bounds, { padding: [40, 40] });
      }

      renderSelectedHighlight(feature.geometry, '#0369a1');
      return feature;
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { status?: number; data?: { error?: string } } }).response?.status
          : undefined;
      const backendMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;

      if (status === 404) {
        setError('Kiinteistöä ei löytynyt');
      } else if (backendMessage) {
        setError(backendMessage);
      } else {
        setError('Kiinteistön haku epäonnistui');
      }
      setSearchResult(null);
      return null;
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className={`map-page ${activityOpen ? 'activity-mode' : ''}`}>
      <nav className="map-nav">
        <div className="map-nav-left">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Valikko"
          >
            ☰
          </button>
          <Link to="/start" className="map-nav-title nav-home-link" title="Aloitusnäkymä">🌲 Metsuri</Link>
        </div>
        <div className="map-nav-right">
          {isGuest ? (
            <>
              <span className="user-email guest-label">Vierailija</span>
              <button className="btn btn-small btn-primary" onClick={() => { logout(); navigate('/login'); }}>
                Kirjaudu sisään
              </button>
            </>
          ) : (
            <>
              <span className="user-email">{user?.email}</span>
              <button className="btn btn-small" onClick={logout}>
                Kirjaudu ulos
              </button>
            </>
          )}
        </div>
      </nav>

      <div className={`map-content ${isGuest ? 'has-guest-banner' : ''}`}>
        {isGuest && (
          <div className="guest-banner">
            <span>Demotila – mitään ei tallenneta</span>
            <button className="guest-banner-btn" onClick={() => { logout(); navigate('/login'); }}>
              Kirjaudu
            </button>
          </div>
        )}
        <Sidebar
          isOpen={sidebarOpen}
          properties={properties}
          markings={markings}
          selectedPropertyId={selectedPropertyId}
          selectedProperty={selectedProperty}
          forestData={forestData}
          valuation={valuation}
          isSearching={searchLoading}
          onSearch={handleOnSearch}
          onSelectResult={handleSaveCadastreToProperties}
          onSelectProperty={handleSelectProperty}
          onDeleteProperty={handleDeleteProperty}
          onDeleteMarking={handleDeleteMarking}
          workRequests={workRequests}
          canRequestWork={!isGuest}
          onRequestWork={handleRequestWork}
          onWithdrawWorkRequest={handleWithdrawWorkRequest}
        />

        <div className="map-wrapper">
          <div ref={mapContainerRef} className="leaflet-map" />

          <div className="layer-switcher" role="group" aria-label="Karttataso">
            <button
              className={`layer-btn ${activeBaseLayer === 'maastokartta' || activeBaseLayer === 'peruskartta' ? 'active' : ''}`}
              onClick={() => setActiveBaseLayer('maastokartta')}
            >
              Maastokartta
            </button>
            <button
              className={`layer-btn ${activeBaseLayer === 'ortokuva' ? 'active' : ''}`}
              onClick={() => setActiveBaseLayer('ortokuva')}
            >
              Ortokuva
            </button>
            {layerConfig.overlays?.kiinteistorajat && (
              <button
                className={`layer-btn ${showCadastreOverlay ? 'active' : ''}`}
                onClick={() => setShowCadastreOverlay((v) => !v)}
                title="Näytä kiinteistörajat ja tunnukset kartalla"
              >
                Kiinteistörajat
              </button>
            )}
          </div>

          {selectedProperty && (
            <div className="active-property-info">
              <strong>{selectedProperty.name}</strong>
              {selectedProperty.property_code && <span>Tunnus: {selectedProperty.property_code}</span>}
              {selectedProperty.area_ha !== null && selectedProperty.area_ha !== undefined && (
                <span>Pinta-ala: {Number(selectedProperty.area_ha).toFixed(2)} ha</span>
              )}
              {forestData?.status === 'available' && forestData.data?.total_volume_m3 != null && (
                <span>Puusto: {forestData.data.total_volume_m3.toFixed(0)} m³</span>
              )}
              {forestData?.status === 'not_available' && (
                <span className="info-placeholder">Metsädata ei saatavilla</span>
              )}
              {valuation?.status === 'available' && valuation.data?.estimated_value_eur != null && (
                <span>Arvio: {valuation.data.estimated_value_eur.toLocaleString('fi-FI')} €</span>
              )}
              {valuation?.status === 'not_available' && (
                <span className="info-placeholder">Arviota ei saatavilla</span>
              )}
            </div>
          )}

          {tileLoading && (
            <div className="tile-loading-indicator" title="Ladataan karttatiloja..." />
          )}

          {showCadastreOverlay && (cadastreClickLoading || clickedCadastre) && (
            <div className="clicked-cadastre-panel">
              {cadastreClickLoading ? (
                <span className="cadastre-click-loading">Haetaan kiinteistöä...</span>
              ) : clickedCadastre ? (
                <>
                  <div className="clicked-cadastre-info">
                    <strong>{clickedCadastre.properties.propertyCode}</strong>
                    {clickedCadastre.properties.areaHa != null && (
                      <span>{Number(clickedCadastre.properties.areaHa).toFixed(2)} ha</span>
                    )}
                  </div>
                  <div className="clicked-cadastre-name">
                    <input
                      type="text"
                      className="cadastre-name-input"
                      placeholder={`Nimi (oletus: ${clickedCadastre.properties.propertyCode})`}
                      value={clickedCadastreCustomName}
                      onChange={(e) => setClickedCadastreCustomName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveClickedCadastre(); }}
                      maxLength={100}
                    />
                  </div>
                  <div className="clicked-cadastre-actions">
                    <button
                      className="btn btn-primary btn-small"
                      onClick={handleSaveClickedCadastre}
                      disabled={savingSearchResult}
                    >
                      {savingSearchResult ? 'Tallennetaan...' : '+ Omiin kiinteistöihin'}
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => { setClickedCadastre(null); setClickedCadastreCustomName(''); }}
                      title="Sulje"
                    >
                      ✕
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {!isGuest && propertiesLoaded && properties.length === 0 && !emptyNoticeDismissed
            && !activeTool && !showForm && !activityOpen && (
            <div className="empty-parcel-notice" role="status">
              <button
                className="empty-parcel-close"
                onClick={() => setEmptyNoticeDismissed(true)}
                title="Sulje"
                aria-label="Sulje"
              >
                ✕
              </button>
              <strong>🌲 Sinulla ei ole vielä lisättyä palstaa</strong>
              <p>Lisää oma metsäpalstasi, niin voit tehdä merkintöjä ja aloittaa aktiviteetin. Karttaa voit selata jo nyt.</p>
              <div className="empty-parcel-actions">
                <button
                  className="btn btn-primary btn-compact"
                  onClick={() => { setEmptyNoticeDismissed(true); setSidebarOpen(true); }}
                >
                  🔍 Hae kiinteistötunnuksella
                </button>
                <button className="btn btn-secondary btn-compact" onClick={() => startDraw('property')}>
                  ✏️ Piirrä kartalle
                </button>
              </div>
            </div>
          )}

          {activityOpen ? (
            <ActivityTracker
              mapRef={mapRef}
              parcel={selectedPropertyGeometry}
              parcelName={selectedProperty?.name ?? 'Valittu palsta'}
              isGuest={isGuest}
              onSave={handleSaveActivity}
              onClose={() => setActivityOpen(false)}
            />
          ) : (
            selectedPropertyId && !activeTool && !showForm && (
              <button className="activity-fab" onClick={openActivity}>
                ▶ Aloita aktiviteetti
              </button>
            )
          )}

          <div className="draw-toolbar">
            {activeTool && (
              <button
                className="tool-btn cancel-btn"
                onClick={cancelDraw}
                title="Peruuta piirto"
              >
                ✕<span>Peruuta</span>
              </button>
            )}
            <button
              className={`tool-btn ${activeTool === 'property' ? 'active' : ''}`}
              onClick={() => (activeTool === 'property' ? startDraw(null) : startDraw('property'))}
              title="Lisää kiinteistö"
            >
              🌳<span>Kiinteistö</span>
            </button>
            <button
              className={`tool-btn ${activeTool === 'point' ? 'active' : ''}`}
              onClick={() => (activeTool === 'point' ? startDraw(null) : startDraw('point'))}
              title="Lisää piste"
            >
              📍<span>Piste</span>
            </button>
            <button
              className={`tool-btn ${activeTool === 'line' ? 'active' : ''}`}
              onClick={() => (activeTool === 'line' ? startDraw(null) : startDraw('line'))}
              title="Lisää viiva"
            >
              📏<span>Viiva</span>
            </button>
            <button
              className={`tool-btn ${activeTool === 'area' ? 'active' : ''}`}
              onClick={() => (activeTool === 'area' ? startDraw(null) : startDraw('area'))}
              title="Lisää alue"
            >
              🗺️<span>Alue</span>
            </button>
            <button
              className={`tool-btn ${activeTool === 'note' ? 'active' : ''}`}
              onClick={() => (activeTool === 'note' ? startDraw(null) : startDraw('note'))}
              title="Lisää muistiinpano"
            >
              📝<span>Muistio</span>
            </button>
            <button
              className={`tool-btn ${activeTool === 'measure' ? 'active' : ''}`}
              onClick={() => (activeTool === 'measure' ? startDraw(null) : startDraw('measure'))}
              title="Mittaa etäisyys"
            >
              📐<span>Mittaa</span>
            </button>
          </div>

          {activeTool === 'measure' && measurementPoints.length > 0 && (
            <div className="measurement-panel">
              <div className="measurement-info">
                <span className="measurement-label">Mittaus</span>
                {measurementDistance != null && (
                  <span className="measurement-value">{formatDistance(measurementDistance)}</span>
                )}
                <span className="measurement-points">Pisteet: {measurementPoints.length}</span>
              </div>
              <div className="measurement-actions">
                <button
                  className="btn btn-small"
                  onClick={() => {
                    clearMeasurement();
                    startDraw('measure');
                  }}
                  title="Tyhjennä mittaus"
                >
                  Tyhjennä
                </button>
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => startDraw(null)}
                  title="Lopeta mittaus"
                >
                  Valmis
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="map-error" onClick={() => setError('')}>
              ⚠️ {error}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <MarkingForm
          isProperty={activeTool === 'property'}
          geometryType={pendingGeometryType}
          onSaveMarking={handleSaveMarking}
          onSaveProperty={handleSaveProperty}
          onCancel={handleCancelForm}
        />
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-card confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-dialog-text">
              Haluatko varmasti poistaa{' '}
              {confirmDelete.type === 'property' ? 'kiinteistön' : 'merkinnän'}{' '}
              <strong>"{confirmDelete.label}"</strong>?
              {confirmDelete.type === 'property' && (
                <span className="confirm-dialog-warning">
                  {' '}Kaikki kiinteistön merkinnät poistetaan myös.
                </span>
              )}
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Peruuta
              </button>
              <button className="btn btn-danger" onClick={executeDelete}>
                Poista
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
