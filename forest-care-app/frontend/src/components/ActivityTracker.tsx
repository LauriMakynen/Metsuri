import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import type { MultiPolygon, Polygon } from 'geojson';
import {
  BRUSH_RADIUS_M,
  MAX_ACCURACY_M,
  MIN_STEP_M,
  boundaryStatus,
  demoWalk,
  paintTrack,
  paintedAreaHa,
  stepDistanceM,
  trackLengthM,
  type BoundaryStatus,
  type TrackPoint,
} from '../utils/activityGeometry';
import { MARKING_COLORS, MARKING_TYPE_LABELS, MARKING_TYPES } from '../utils/markingTypes';
import { formatArea, formatDistance } from '../utils/measurement';
import type { GeoJSONGeometry, MarkingType } from '../types';

export interface ActivityResult {
  type: MarkingType;
  title?: string;
  geometry: Polygon | MultiPolygon;
  areaHa: number;
  distanceM: number;
  durationS: number;
}

interface ActivityTrackerProps {
  mapRef: RefObject<L.Map | null>;
  parcel: GeoJSONGeometry;
  parcelName: string;
  isGuest: boolean;
  onSave: (result: ActivityResult) => Promise<void>;
  onClose: () => void;
}

type Phase = 'setup' | 'tracking' | 'paused' | 'finished';

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Screen Wake Lock keeps the phone screen on; web GPS stops when the screen sleeps
type WakeLockSentinelLike = { release: () => Promise<void> };
async function requestWakeLock(): Promise<WakeLockSentinelLike | null> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
    return nav.wakeLock ? await nav.wakeLock.request('screen') : null;
  } catch {
    return null;
  }
}

// GPS activity like a sports watch: walk the worked area and it is painted on the map
export default function ActivityTracker({ mapRef, parcel, parcelName, isGuest, onSave, onClose }: ActivityTrackerProps) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [activityType, setActivityType] = useState<MarkingType>('harvennus');
  const [activityTitle, setActivityTitle] = useState('');
  const [elapsedS, setElapsedS] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [areaHa, setAreaHa] = useState(0);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [boundary, setBoundary] = useState<{ status: BoundaryStatus; edgeDistanceM: number | null }>({
    status: 'unknown',
    edgeDistanceM: null,
  });
  const [gpsError, setGpsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [simulated, setSimulated] = useState(false);
  // Discarding throws the walked area away for good, so it is confirmed first
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const phaseRef = useRef<Phase>('setup');
  const watchIdRef = useRef<number | null>(null);
  const simIntervalRef = useRef<number | null>(null);
  // Simulated walk (demo) and how far it got, so it can continue after "Lopeta" is undone
  const simPathRef = useRef<TrackPoint[] | null>(null);
  const simIndexRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  // Track is split into segments: leaving the parcel or pausing starts a new one
  const segmentsRef = useRef<TrackPoint[][]>([[]]);
  const paintedRef = useRef<Polygon | MultiPolygon | null>(null);
  const lastStatusRef = useRef<BoundaryStatus>('unknown');
  const centeredRef = useRef(false);

  const paintLayerRef = useRef<L.GeoJSON | null>(null);
  const positionMarkerRef = useRef<L.CircleMarker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);

  const color = MARKING_COLORS[activityType];
  const canStart = activityType !== 'muu_tyo' || activityTitle.trim().length > 0;

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const startNewSegment = () => {
    const segments = segmentsRef.current;
    if (segments[segments.length - 1].length > 0) segments.push([]);
  };

  const stopWatching = () => {
    if (simIntervalRef.current !== null) {
      window.clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  };

  // Stop GPS and remove own map layers when the tracker closes
  useEffect(() => {
    return () => {
      stopWatching();
      paintLayerRef.current?.remove();
      positionMarkerRef.current?.remove();
      accuracyCircleRef.current?.remove();
    };
  }, []);

  // Clock ticks only while tracking
  useEffect(() => {
    if (phase !== 'tracking') return;
    const id = window.setInterval(() => setElapsedS((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const redrawPaint = () => {
    const map = mapRef.current;
    if (!map) return;
    paintLayerRef.current?.remove();
    paintLayerRef.current = null;
    if (!paintedRef.current) return;
    paintLayerRef.current = L.geoJSON(paintedRef.current, {
      style: { color, weight: 1, fillColor: color, fillOpacity: 0.55 },
      interactive: false,
    }).addTo(map);
  };

  const handlePosition = (pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = pos.coords;
    const here: TrackPoint = [longitude, latitude];
    const latLng = L.latLng(latitude, longitude);
    setAccuracyM(accuracy);
    setGpsError('');

    const map = mapRef.current;
    if (map) {
      if (!positionMarkerRef.current) {
        accuracyCircleRef.current = L.circle(latLng, {
          radius: accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.1, interactive: false,
        }).addTo(map);
        positionMarkerRef.current = L.circleMarker(latLng, {
          radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, interactive: false,
        }).addTo(map);
      } else {
        positionMarkerRef.current.setLatLng(latLng);
        accuracyCircleRef.current?.setLatLng(latLng).setRadius(accuracy);
      }
      if (!centeredRef.current) {
        map.setView(latLng, Math.max(map.getZoom(), 17));
        centeredRef.current = true;
      } else if (!map.getBounds().pad(-0.2).contains(latLng)) {
        map.panTo(latLng);
      }
    }

    const nextBoundary = boundaryStatus(here, parcel);
    setBoundary(nextBoundary);
    if (nextBoundary.status === 'outside' && lastStatusRef.current !== 'outside') {
      navigator.vibrate?.([300, 150, 300, 150, 300]);
    } else if (nextBoundary.status === 'near-edge' && lastStatusRef.current === 'inside') {
      navigator.vibrate?.(200);
    }
    lastStatusRef.current = nextBoundary.status;

    if (phaseRef.current !== 'tracking') return;
    // Paint only on the own parcel, and only with a usable fix
    if (nextBoundary.status === 'outside' || accuracy > MAX_ACCURACY_M) {
      startNewSegment();
      return;
    }

    const segment = segmentsRef.current[segmentsRef.current.length - 1];
    const last = segment[segment.length - 1];
    if (last && stepDistanceM(last, here) < MIN_STEP_M) return;
    segment.push(here);

    paintedRef.current = paintTrack(segmentsRef.current);
    setAreaHa(paintedAreaHa(paintedRef.current));
    setDistanceM(trackLengthM(segmentsRef.current));
    redrawPaint();
  };

  const handleGpsError = (err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      setGpsError('Sijainnin käyttö on estetty. Salli sijainti selaimen asetuksista.');
    } else if (err.code === err.TIMEOUT) {
      setGpsError('GPS-signaalia odotetaan...');
    } else {
      setGpsError('Sijaintia ei saatu. Siirry aukeammalle paikalle.');
    }
  };

  // Real GPS, or the simulated walk continuing from where it was
  const startWatching = async () => {
    const path = simPathRef.current;
    if (path) {
      simIntervalRef.current = window.setInterval(() => {
        if (simIndexRef.current >= path.length) {
          if (simIntervalRef.current !== null) window.clearInterval(simIntervalRef.current);
          simIntervalRef.current = null;
          return;
        }
        const [longitude, latitude] = path[simIndexRef.current++];
        handlePosition({ coords: { latitude, longitude, accuracy: 4 }, timestamp: Date.now() } as GeolocationPosition);
      }, 90);
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleGpsError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });
    wakeLockRef.current = await requestWakeLock();
  };

  const start = async () => {
    if (!canStart) return;
    if (!('geolocation' in navigator)) {
      setGpsError('Laitteesi selain ei tue sijaintia.');
      return;
    }
    setPhaseBoth('tracking');
    await startWatching();
  };

  // Demo: replay a simulated walk on the parcel instead of real GPS
  const startSimulation = () => {
    if (!canStart) return;
    const path = demoWalk(parcel);
    if (path.length === 0) {
      setGpsError('Esimerkkikävelyä ei voi näyttää tälle palstalle.');
      return;
    }
    simPathRef.current = path;
    simIndexRef.current = 0;
    setSimulated(true);
    setPhaseBoth('tracking');
    void startWatching();
  };

  const pause = () => {
    startNewSegment();
    setPhaseBoth('paused');
  };

  const resume = () => setPhaseBoth('tracking');

  const finish = () => {
    startNewSegment();
    stopWatching();
    setPhaseBoth('finished');
  };

  // "Lopeta" pressed by mistake: back to a paused activity with everything walked so far kept,
  // as long as it has not been saved or discarded (issue #102)
  const backToActivity = () => {
    setGpsError('');
    setPhaseBoth('paused');
    void startWatching();
  };

  const save = async () => {
    if (!paintedRef.current) return;
    setSaving(true);
    try {
      await onSave({
        type: activityType,
        title: activityType === 'muu_tyo' ? activityTitle.trim() : undefined,
        geometry: paintedRef.current,
        areaHa: paintedAreaHa(paintedRef.current),
        distanceM: trackLengthM(segmentsRef.current),
        durationS: elapsedS,
      });
      onClose();
    } catch {
      // The parent shows the error; keep the panel open so the user can retry
    } finally {
      setSaving(false);
    }
  };

  if (phase === 'setup') {
    return (
      <div className="activity-panel">
        <div className="activity-head">
          <strong>Aloita aktiviteetti</strong>
          <button className="btn-icon" onClick={onClose} title="Sulje">✕</button>
        </div>
        <p className="activity-sub">
          Palsta: <strong>{parcelName}</strong>. Kävele työalue läpi – sovellus maalaa kartalle
          noin {BRUSH_RADIUS_M} metrin säteeltä alueen, jolla olet liikkunut.
        </p>
        <div className="activity-types" role="radiogroup" aria-label="Toimenpide">
          {MARKING_TYPES.map((type) => (
            <button
              key={type}
              role="radio"
              aria-checked={activityType === type}
              className={`filter-chip ${activityType === type ? 'active' : ''}`}
              onClick={() => setActivityType(type)}
            >
              <span style={{ color: MARKING_COLORS[type] }}>●</span> {MARKING_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        {activityType === 'muu_tyo' && (
          <div className="form-group">
            <label htmlFor="activity-title">Työn nimi</label>
            <input
              id="activity-title"
              type="text"
              value={activityTitle}
              onChange={(event) => setActivityTitle(event.target.value)}
              maxLength={255}
              required
              aria-required="true"
            />
          </div>
        )}
        {gpsError && <p className="activity-alert activity-alert-danger">{gpsError}</p>}
        {isGuest ? (
          <>
            <button className="activity-start-btn" onClick={startSimulation} disabled={!canStart}>🎬 Katso esimerkkikävely</button>
            <button className="btn-link activity-real-gps" onClick={start} disabled={!canStart}>
              tai aloita oikealla GPS:llä (vaatii, että olet palstalla)
            </button>
            <p className="activity-note">Demossa mitään ei tallenneta pysyvästi.</p>
          </>
        ) : (
          <button className="activity-start-btn" onClick={start} disabled={!canStart}>▶ Aloita</button>
        )}
      </div>
    );
  }

  const nothingPainted = areaHa === 0;
  // With nothing walked there is nothing to lose: close right away
  const discard = () => (nothingPainted ? onClose() : setConfirmDiscard(true));

  return (
    <div className="activity-panel">
      <div className="activity-head">
        <strong>
          {phase === 'tracking' && <span className="activity-live-dot" />}
          {phase === 'finished' ? 'Aktiviteetti päättyi' : phase === 'paused' ? 'Tauolla' : 'Käynnissä'}
          {' · '}
          <span style={{ color }}>{MARKING_TYPE_LABELS[activityType]}</span>
        </strong>
        {simulated && phase !== 'finished' && <span className="activity-gps">Esimerkki</span>}
        {!simulated && accuracyM !== null && phase !== 'finished' && (
          <span className={`activity-gps ${accuracyM > MAX_ACCURACY_M ? 'weak' : ''}`}>
            GPS ±{Math.round(accuracyM)} m
          </span>
        )}
      </div>

      <div className="activity-stats">
        <div><span>Aika</span><strong>{formatDuration(elapsedS)}</strong></div>
        <div><span>Matka</span><strong>{formatDistance(distanceM)}</strong></div>
        <div><span>Pinta-ala</span><strong>{formatArea(areaHa)}</strong></div>
      </div>

      {phase !== 'finished' && boundary.status === 'outside' && (
        <p className="activity-alert activity-alert-danger">
          ⚠️ Olet poistunut omalta palstaltasi
          {boundary.edgeDistanceM !== null && ` (${Math.round(boundary.edgeDistanceM)} m rajan ulkopuolella)`}.
          Tämä voi olla toisen metsänomistajan maata. Alueen maalaus on keskeytetty.
        </p>
      )}
      {phase !== 'finished' && boundary.status === 'near-edge' && (
        <p className="activity-alert activity-alert-warn">
          Lähestyt palstan rajaa – {Math.round(boundary.edgeDistanceM ?? 0)} m jäljellä.
        </p>
      )}
      {phase !== 'finished' && boundary.status === 'unknown' && (
        <p className="activity-note">Palstan rajaa ei tunneta, joten rajavaroitus ei ole käytössä.</p>
      )}
      {phase !== 'finished' && accuracyM !== null && accuracyM > MAX_ACCURACY_M && (
        <p className="activity-alert activity-alert-warn">GPS-signaali on heikko – maalaus odottaa tarkempaa sijaintia.</p>
      )}
      {gpsError && phase !== 'finished' && <p className="activity-alert activity-alert-danger">{gpsError}</p>}

      {phase === 'finished' ? (
        <>
          {nothingPainted && <p className="activity-note">Aluetta ei ehtinyt kertyä, joten tallennettavaa ei ole.</p>}
          <button
            type="button"
            className="activity-back-btn"
            onClick={backToActivity}
            disabled={saving}
            title="Lopetitko vahingossa? Palaa jatkamaan samaa aktiviteettia."
          >
            <span aria-hidden="true">←</span> Palaa aktiviteettiin
          </button>
          <div className="activity-actions">
            <button className="btn btn-secondary" onClick={discard} disabled={saving}>Hylkää</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || nothingPainted}>
              {saving ? 'Tallennetaan...' : 'Tallenna merkinnäksi'}
            </button>
          </div>
        </>
      ) : (
        <div className="activity-actions">
          {phase === 'tracking' ? (
            <button className="btn btn-secondary" onClick={pause}>⏸ Tauko</button>
          ) : (
            <button className="btn btn-secondary" onClick={resume}>▶ Jatka</button>
          )}
          <button className="btn btn-danger" onClick={finish}>■ Lopeta</button>
        </div>
      )}

      {confirmDiscard &&
        createPortal(
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmDiscard(false)}>
            <div
              className="modal-card confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="activity-discard-title"
              aria-describedby="activity-discard-text"
            >
              <div className="modal-header">
                <h2 id="activity-discard-title">Hylätäänkö aktiviteetti?</h2>
                <button type="button" className="modal-close" onClick={() => setConfirmDiscard(false)} aria-label="Sulje">
                  ✕
                </button>
              </div>
              <p id="activity-discard-text" className="confirm-dialog-text">
                <strong>{MARKING_TYPE_LABELS[activityType]}</strong> · {formatArea(areaHa)} · {formatDistance(distanceM)}
                {' · '}{formatDuration(elapsedS)}
                <br />
                Kävelemääsi aluetta ei tallenneta, eikä sitä voi palauttaa.
              </p>
              <div className="modal-actions">
                {/* The safe choice first and focused, so a hasty tap or Enter keeps the activity */}
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmDiscard(false)} autoFocus>
                  Peruuta
                </button>
                <button type="button" className="btn btn-danger" onClick={onClose}>
                  Hylkää aktiviteetti
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
