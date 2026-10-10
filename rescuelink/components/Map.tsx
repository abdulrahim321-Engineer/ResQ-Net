"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

export type MapMarker = { lat: number; lng: number; color: string; label?: string };
export type MapProps = {
  center: { lat: number; lng: number };
  zoom?: number;
  markers: MapMarker[];
  onClick?: (latlng: { lat: number; lng: number }) => void;
  line?: [{ lat: number; lng: number }, { lat: number; lng: number }] | null;
  height?: number | string;
  recenter?: boolean;
  /** if set, re-center only when this key changes (instead of on every center change) */
  recenterKey?: string;
};

const iconCache = new Map<string, L.DivIcon>();
function dot(color: string) {
  let icon = iconCache.get(color);
  if (!icon) {
    icon = L.divIcon({
      className: "",
      html: `<div style="width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid white;box-shadow:0 0 4px rgba(0,0,0,.6)"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    iconCache.set(color, icon);
  }
  return icon;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

function RecenterOnKey({ k, lat, lng }: { k: string; lat: number; lng: number }) {
  const map = useMap();
  const pos = useRef({ lat, lng });
  useEffect(() => {
    pos.current = { lat, lng };
  });
  useEffect(() => {
    map.setView([pos.current.lat, pos.current.lng], map.getZoom());
  }, [k, map]);
  return null;
}

function ClickHandler({ onClick }: { onClick: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function LeafletMap({ center, zoom = 14, markers, onClick, line, height = 320, recenter = true, recenterKey }: MapProps) {
  return (
    <div style={{ height }} className="w-full overflow-hidden rounded border border-zinc-300">
      <MapContainer center={[center.lat, center.lng]} zoom={zoom} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {recenterKey !== undefined ? (
          <RecenterOnKey k={recenterKey} lat={center.lat} lng={center.lng} />
        ) : (
          recenter && <Recenter lat={center.lat} lng={center.lng} />
        )}
        {onClick && <ClickHandler onClick={onClick} />}
        {markers.map((m, i) => (
          <Marker key={`${i}-${m.color}`} position={[m.lat, m.lng]} icon={dot(m.color)}>
            {m.label && <Tooltip>{m.label}</Tooltip>}
          </Marker>
        ))}
        {line && (
          <Polyline
            positions={[
              [line[0].lat, line[0].lng],
              [line[1].lat, line[1].lng],
            ]}
            pathOptions={{ color: "#2563eb", dashArray: "6 6", weight: 3 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
