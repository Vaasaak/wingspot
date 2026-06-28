// Admin: schvalování čekajícího spotu přes STEJNÝ formulář jako přidávání,
// předvyplněný daty spotu a editovatelný. Schválit uloží případné úpravy +
// status='approved', Zamítnout nastaví 'rejected'.

import { useState } from "react";
import { supabase } from "../lib/supabase";
import { sectorsToDirRanges } from "./WindCompass";
import { SpotForm, spotToForm, formToFacilities, spotFormValid, type SpotFormValues, type DbSpotForForm } from "./SpotForm";

export interface PendingSpotFull extends DbSpotForForm {
  id: string;
  created_by: string | null;
  created_at: string;
}

export function ApproveSpotModal({
  spot,
  onClose,
  onResolved,
}: {
  spot: PendingSpotFull;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [form, setForm] = useState<SpotFormValues>(() => spotToForm(spot));
  const patch = (p: Partial<SpotFormValues>) => setForm((f) => ({ ...f, ...p }));
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [err, setErr] = useState("");

  const valid = spotFormValid(form);

  async function approve() {
    if (!supabase || !valid || !form.coords) return;
    setBusy("approve");
    setErr("");
    const badDirs = sectorsToDirRanges(form.sectors, "bad");
    const { error } = await supabase.from("spots").update({
      name: form.name.trim(),
      country: form.country || "EU",
      lat: form.coords.lat,
      lon: form.coords.lon,
      note: form.note.trim() || null,
      windguru_url: form.windguru.trim() || null,
      good_dirs: sectorsToDirRanges(form.sectors, "good"),
      bad_dirs: badDirs.length > 0 ? badDirs : null,
      facilities: formToFacilities(form),
      status: "approved",
    }).eq("id", spot.id);
    setBusy(null);
    if (error) { setErr(error.message); return; }
    onResolved();
    onClose();
  }

  async function reject() {
    if (!supabase) return;
    setBusy("reject");
    setErr("");
    const { error } = await supabase.from("spots").update({ status: "rejected" }).eq("id", spot.id);
    setBusy(null);
    if (error) { setErr(error.message); return; }
    onResolved();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>✓ Schválit spot</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="muted small" style={{ marginTop: 8 }}>
            Navrhl: {spot.created_by ? spot.created_by.slice(0, 8) + "…" : "neznámý"} ·{" "}
            {new Date(spot.created_at).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })}
            . Před schválením můžeš cokoli upravit.
          </p>

          <SpotForm value={form} onChange={patch} />

          {err && <p className="warn-text small" style={{ marginTop: 10 }}>⚠ {err}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button className="btn approve-btn" onClick={approve} disabled={!!busy || !valid} style={{ flex: 1 }}>
              {busy === "approve" ? "Schvaluji…" : "✓ Schválit"}
            </button>
            <button className="btn reject-btn" onClick={reject} disabled={!!busy}>
              {busy === "reject" ? "Zamítám…" : "✕ Zamítnout"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
