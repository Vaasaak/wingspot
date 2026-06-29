import { useState } from "react";
import { supabase } from "../lib/supabase";
import { sectorsToDirRanges } from "./WindCompass";
import { SpotForm, spotToForm, formToFacilities, type SpotFormValues } from "./SpotForm";
import type { DirRange, SpotFacilities } from "../data/spots";

export interface AdminSpot {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  note: string | null;
  windguru_url: string | null;
  good_dirs: DirRange[] | null;
  bad_dirs: DirRange[] | null;
  status: string;
  facilities: SpotFacilities | null;
}

interface Props {
  spot: AdminSpot;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function EditSpotModal({ spot, onClose, onSaved, onDeleted }: Props) {
  const [form, setForm] = useState<SpotFormValues>(() => spotToForm(spot));
  const patch = (p: Partial<SpotFormValues>) => setForm((f) => ({ ...f, ...p }));
  const [status, setStatus] = useState(spot.status);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState("");

  // Volnější validace než přidávání: směr není povinný (OSM importy ho nemají).
  const valid = form.name.trim().length >= 2 && !!form.coords;

  async function save() {
    if (!supabase || !valid || !form.coords) return;
    setSaving(true);
    setErr("");
    const goodDirs = sectorsToDirRanges(form.sectors, "good");
    const badDirs = sectorsToDirRanges(form.sectors, "bad");
    const { error } = await supabase.from("spots").update({
      name: form.name.trim(),
      country: form.country || "EU",
      lat: form.coords.lat,
      lon: form.coords.lon,
      note: form.note.trim() || null,
      windguru_url: form.windguru.trim() || null,
      good_dirs: goodDirs.length > 0 ? goodDirs : null,
      bad_dirs: badDirs.length > 0 ? badDirs : null,
      facilities: formToFacilities(form),
      status,
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>✏️ Upravit spot</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <SpotForm value={form} onChange={patch} />

          <label className="field-label" style={{ marginTop: 12 }}>Status</label>
          <select className="text-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="approved">Schválený</option>
            <option value="pending">Čekající</option>
            <option value="rejected">Zamítnutý</option>
          </select>

          {err && <p className="warn-text small" style={{ marginTop: 10 }}>⚠ {err}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button className="btn" onClick={save} disabled={saving || !valid} style={{ flex: 1 }}>
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
