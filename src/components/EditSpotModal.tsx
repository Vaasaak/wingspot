import { useState } from "react";
import { SquareParking, Droplets, Utensils, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "../lib/supabase";
import { MapPicker } from "./MapPicker";
import type { SpotFacilities } from "../data/spots";

export interface AdminSpot {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  note: string | null;
  windguru_url: string | null;
  status: string;
  facilities: SpotFacilities | null;
}

interface Props {
  spot: AdminSpot;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

type ParkingVal = "free" | "paid" | "none" | undefined;

export function EditSpotModal({ spot, onClose, onSaved, onDeleted }: Props) {
  const [name, setName]       = useState(spot.name);
  const [country, setCountry] = useState<"CZ" | "DE">(spot.country as "CZ" | "DE");
  const [coords, setCoords]   = useState({ lat: spot.lat, lon: spot.lon });
  const [note, setNote]       = useState(spot.note ?? "");
  const [windguru, setWindguru] = useState(spot.windguru_url ?? "");
  const [status, setStatus]   = useState(spot.status);
  const [saving, setSaving]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr]         = useState("");

  const f = spot.facilities ?? {};
  const [parking, setParking]           = useState<ParkingVal>(f.parking);
  const [wc, setWc]                     = useState<boolean | undefined>(f.wc);
  const [refreshments, setRefreshments] = useState<boolean | undefined>(f.refreshments);
  const [rental, setRental]             = useState<boolean | undefined>(f.rental);

  async function save() {
    if (!supabase || !name.trim()) return;
    setSaving(true);
    setErr("");

    const facilities: SpotFacilities = {};
    if (parking !== undefined) facilities.parking = parking;
    if (wc !== undefined) facilities.wc = wc;
    if (refreshments !== undefined) facilities.refreshments = refreshments;
    if (rental !== undefined) facilities.rental = rental;

    const { error } = await supabase.from("spots").update({
      name: name.trim(),
      country,
      lat: coords.lat,
      lon: coords.lon,
      note: note.trim() || null,
      windguru_url: windguru.trim() || null,
      status,
      facilities: Object.keys(facilities).length > 0 ? facilities : null,
    }).eq("id", spot.id);

    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
    onClose();
  }

  async function deleteSpot() {
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase.from("spots").delete().eq("id", spot.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onDeleted();
    onClose();
  }

  const FAC_ROWS: { key: string; Icon: LucideIcon; label: string; val: boolean | undefined; set: (v: boolean | undefined) => void }[] = [
    { key: "wc",           Icon: Droplets, label: "WC",          val: wc,           set: setWc },
    { key: "refreshments", Icon: Utensils, label: "Občerstvení", val: refreshments, set: setRefreshments },
    { key: "rental",       Icon: Store,    label: "Půjčovna",    val: rental,       set: setRental },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>✏️ Upravit spot</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <label className="field-label" style={{ marginTop: 10 }}>Název</label>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />

          <label className="field-label" style={{ marginTop: 12 }}>Země</label>
          <select className="text-input" value={country} onChange={(e) => setCountry(e.target.value as "CZ" | "DE")}>
            <option value="CZ">Česko</option>
            <option value="DE">Německo</option>
          </select>

          <label className="field-label" style={{ marginTop: 12 }}>Poloha</label>
          <MapPicker lat={coords.lat} lon={coords.lon} onChange={(lat, lon) => setCoords({ lat, lon })} />
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
          </p>

          <label className="field-label" style={{ marginTop: 12 }}>Windguru odkaz</label>
          <input className="text-input" value={windguru} onChange={(e) => setWindguru(e.target.value)} placeholder="https://www.windguru.cz/XXXXX" />

          <label className="field-label" style={{ marginTop: 12 }}>Poznámka</label>
          <input className="text-input" value={note} onChange={(e) => setNote(e.target.value)} />

          <label className="field-label" style={{ marginTop: 12 }}>Status</label>
          <select className="text-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="approved">Schválený</option>
            <option value="pending">Čekající</option>
            <option value="rejected">Zamítnutý</option>
          </select>

          <label className="field-label" style={{ marginTop: 14 }}>Vybavenost</label>
          <div className="facilities-form">
            <div className="fac-row">
              <span className="fac-label"><SquareParking size={15} /> Parkoviště</span>
              <div className="fac-chips">
                {(["free", "paid", "none"] as ParkingVal[]).map((v) => (
                  <button key={v} type="button"
                    className={"chip" + (parking === v ? " active" : "")}
                    onClick={() => setParking(parking === v ? undefined : v)}
                  >{v === "free" ? "Zdarma" : v === "paid" ? "Placené" : "Není"}</button>
                ))}
              </div>
            </div>
            {FAC_ROWS.map(({ key, Icon, label, val, set }) => (
              <div key={key} className="fac-row">
                <span className="fac-label"><Icon size={15} /> {label}</span>
                <div className="fac-chips">
                  <button type="button" className={"chip" + (val === true  ? " active" : "")} onClick={() => set(val === true  ? undefined : true)}>Ano</button>
                  <button type="button" className={"chip" + (val === false ? " active" : "")} onClick={() => set(val === false ? undefined : false)}>Není</button>
                </div>
              </div>
            ))}
          </div>

          {err && <p className="warn-text small">⚠ {err}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button className="btn" onClick={save} disabled={saving || !name.trim()} style={{ flex: 1 }}>
              {saving ? "Ukládám…" : "Uložit"}
            </button>
            {confirmDelete ? (
              <button className="btn small reject-btn" onClick={deleteSpot} disabled={saving}>
                Opravdu smazat?
              </button>
            ) : (
              <button className="btn small reject-btn" onClick={() => setConfirmDelete(true)}>
                🗑 Smazat
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
