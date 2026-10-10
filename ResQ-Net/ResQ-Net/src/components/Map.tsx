'use client';

// Leaflet tactical map. Shows only real positions from the backend: no routing engine,
// no simulated movement. Straight dashed lines = the leg the ambulance is on.
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { LatLng } from '@/lib/types';
import { DEFAULT_POS } from '@/lib/hooks';

export type MapAmbulance = { id: string; label: string; position: LatLng; highlight?: boolean; sub?: string; subColor?: string };
export type MapHospital = { id: string; name: string; location: LatLng; highlight?: boolean; sub?: string };
export type MapLine = { from: LatLng; to: LatLng; color: string };

export interface MapProps {
  patient?: LatLng | null;
  patientLabel?: string;
  ambulances?: MapAmbulance[];
  hospitals?: MapHospital[];
  lines?: MapLine[];
  onMapClick?: (p: LatLng) => void;
  /** Map re-fits to all points whenever this string changes. */
  fitKey?: string;
  center?: LatLng | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const iconCache: globalThis.Map<string, L.DivIcon> = new (globalThis.Map as any)();
function cachedIcon(key: string, html: string) {
  let icon = iconCache.get(key);
  if (!icon) {
    icon = new L.DivIcon({ html, className: '', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -16] });
    iconCache.set(key, icon);
  }
  return icon;
}

const AMB_SVG = (stroke: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`;

function ambIcon(h: boolean) {
  return cachedIcon(`amb-${h}`, `<div style="width:36px;height:36px;background:${h ? '#00F5D4' : '#334155'};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 ${h ? '20px rgba(0,245,212,0.9)' : '8px rgba(0,0,0,0.5)'};border:2px solid ${h ? '#fff' : '#64748b'}">${AMB_SVG(h ? '#000' : '#94a3b8')}</div>`);
}
function hospIcon(h: boolean) {
  return cachedIcon(`hosp-${h}`, `<div style="width:36px;height:36px;background:${h ? '#10B981' : '#1e3a2f'};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 ${h ? '20px rgba(16,185,129,0.9)' : '8px rgba(0,0,0,0.5)'};border:2px solid ${h ? '#fff' : '#2d5a46'}"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M2 12h20"/></svg></div>`);
}
function patientIcon() {
  return cachedIcon('patient', `<div style="width:36px;height:36px;background:#FF2A5F;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 20px rgba(255,42,95,0.9);border:2px solid #fff"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>`);
}

const popupStyle = (border: string): React.CSSProperties => ({
  background: '#0f172a', color: 'white', padding: '8px', borderRadius: '8px', border: `1px solid ${border}`, fontFamily: 'monospace', fontSize: 11,
});

function ClickHandler({ onClick }: { onClick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FitToPoints({ fitKey, points }: { fitKey: string; points: LatLng[] }) {
  const map = useMap();
  const pts = useRef(points);
  useEffect(() => { pts.current = points; });
  useEffect(() => {
    const p = pts.current;
    if (p.length === 0) return;
    if (p.length === 1) { map.setView([p[0].lat, p[0].lng], Math.max(map.getZoom(), 14)); return; }
    map.fitBounds(L.latLngBounds(p.map((x) => [x.lat, x.lng] as [number, number])), { padding: [50, 50], maxZoom: 16 });
  }, [fitKey, map]);
  return null;
}

export default function Map({ patient, patientLabel, ambulances = [], hospitals = [], lines = [], onMapClick, fitKey = '', center }: MapProps) {
  const points: LatLng[] = [
    ...(patient ? [patient] : []),
    ...ambulances.filter((a) => a.highlight).map((a) => a.position),
    ...hospitals.filter((h) => h.highlight).map((h) => h.location),
  ];
  const fallbackPoints = points.length ? points : [...ambulances.map((a) => a.position), ...hospitals.map((h) => h.location)];
  const start = center ?? fallbackPoints[0] ?? DEFAULT_POS;

  return (
    <div className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden border border-[#00F5D4]/20">
      <MapContainer
        center={[start.lat, start.lng]}
        zoom={13}
        style={{ height: '100%', width: '100%', background: '#030712', cursor: onMapClick ? 'crosshair' : undefined }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        />
        <FitToPoints fitKey={fitKey} points={fallbackPoints} />
        {onMapClick && <ClickHandler onClick={onMapClick} />}

        {lines.map((l, i) => (
          <Polyline key={`line-${i}`} positions={[[l.from.lat, l.from.lng], [l.to.lat, l.to.lng]]} pathOptions={{ color: l.color, weight: 4, dashArray: '12, 10', opacity: 0.85 }} />
        ))}

        {patient && (
          <Marker position={[patient.lat, patient.lng]} icon={patientIcon()} zIndexOffset={500}>
            <Popup><div style={popupStyle('#FF2A5F')}><strong style={{ color: '#FF2A5F' }}>PATIENT</strong><br />{patientLabel ?? `${patient.lat.toFixed(4)}, ${patient.lng.toFixed(4)}`}</div></Popup>
          </Marker>
        )}

        {hospitals.map((h) => (
          <Marker key={`h-${h.id}`} position={[h.location.lat, h.location.lng]} icon={hospIcon(!!h.highlight)}>
            <Popup><div style={popupStyle(h.highlight ? '#10B981' : '#334155')}>{h.highlight && <div style={{ color: '#FFB703', fontWeight: 'bold', fontSize: 10, marginBottom: 4 }}>★ DESTINATION</div>}<strong style={{ color: '#10B981' }}>{h.name}</strong>{h.sub && <><br /><span style={{ color: '#94a3b8' }}>{h.sub}</span></>}</div></Popup>
          </Marker>
        ))}

        {ambulances.map((a) => (
          <Marker key={`a-${a.id}`} position={[a.position.lat, a.position.lng]} icon={ambIcon(!!a.highlight)} zIndexOffset={a.highlight ? 1000 : 0}>
            <Popup><div style={popupStyle(a.highlight ? '#00F5D4' : '#334155')}>{a.highlight && <div style={{ color: '#FFB703', fontWeight: 'bold', fontSize: 10, marginBottom: 4 }}>★ ASSIGNED UNIT</div>}<strong style={{ color: '#00F5D4' }}>{a.label}</strong>{a.sub && <><br /><span style={{ color: a.subColor ?? '#94a3b8' }}>{a.sub}</span></>}</div></Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
