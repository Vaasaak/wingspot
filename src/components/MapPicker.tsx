import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Custom dot marker — no CDN dependency, theme-aware
const PIN = new L.DivIcon({
  html: '<div class="map-pin"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: "",
});

function ClickHandler({ onChange }: { onChange: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onChange(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Pan & zoom to marker when coords change (e.g. pasted from text input)
function FlyTo({ lat, lon }: { lat?: number; lon?: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lon != null) {
      map.flyTo([lat, lon], Math.max(map.getZoom(), 13), { duration: 0.5 });
    }
  }, [lat, lon, map]);
  return null;
}

interface Props {
  lat?: number;
  lon?: number;
  onChange: (lat: number, lon: number) => void;
}

export function MapPicker({ lat, lon, onChange }: Props) {
  return (
    <MapContainer
      center={lat != null && lon != null ? [lat, lon] : [49.8, 15.5]}
      zoom={lat != null ? 13 : 7}
      style={{ width: "100%", height: "220px", borderRadius: "10px" }}
      className="map-picker"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onChange={onChange} />
      <FlyTo lat={lat} lon={lon} />
      {lat != null && lon != null && <Marker position={[lat, lon]} icon={PIN} />}
    </MapContainer>
  );
}
