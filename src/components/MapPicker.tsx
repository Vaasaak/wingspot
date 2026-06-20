import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setNotFound(false);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=cz,de,sk,pl,at`
      );
      const data = await res.json();
      if (data[0]) {
        onChange(parseFloat(data[0].lat), parseFloat(data[0].lon));
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="map-wrapper">
      {/* Vyhledávání místa */}
      <div className="map-search-row">
        <input
          className="text-input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setNotFound(false); }}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Hledat místo… (např. Máchovo jezero)"
        />
        <button
          type="button"
          className="btn small"
          onClick={search}
          disabled={searching || !query.trim()}
          style={{ whiteSpace: "nowrap" }}
        >
          {searching ? "…" : "Hledat"}
        </button>
      </div>
      {notFound && <p className="warn-text small" style={{ margin: "4px 0 0" }}>Místo nenalezeno</p>}

      {/* Mapa */}
      <MapContainer
        center={lat != null && lon != null ? [lat, lon] : [49.8, 15.5]}
        zoom={lat != null ? 13 : 7}
        style={{ width: "100%", height: "200px", borderRadius: "10px", marginTop: 6 }}
        className="map-picker"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onChange={onChange} />
        <FlyTo lat={lat} lon={lon} />
        {lat != null && lon != null && <Marker position={[lat, lon]} icon={PIN} />}
      </MapContainer>
    </div>
  );
}
