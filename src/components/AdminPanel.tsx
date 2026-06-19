import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface PendingSpot {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  note: string | null;
  windguru_url: string | null;
  created_at: string;
}

interface Props {
  onClose: () => void;
  onApproved: () => void;
}

export function AdminPanel({ onClose, onApproved }: Props) {
  const [spots, setSpots] = useState<PendingSpot[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from("spots")
      .select("id,name,country,lat,lon,note,windguru_url,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setSpots((data as PendingSpot[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    if (!supabase) return;
    await supabase.from("spots").update({ status: "approved" }).eq("id", id);
    setSpots((s) => s.filter((x) => x.id !== id));
    onApproved();
  }

  async function reject(id: string) {
    if (!supabase) return;
    await supabase.from("spots").update({ status: "rejected" }).eq("id", id);
    setSpots((s) => s.filter((x) => x.id !== id));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🔧 Admin – čekající spoty</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <p className="muted" style={{ padding: "16px 0" }}>Načítám…</p>
          ) : spots.length === 0 ? (
            <p className="muted" style={{ padding: "16px 0" }}>
              Žádné čekající spoty 🎉
            </p>
          ) : (
            <div className="pending-list">
              {spots.map((s) => (
                <div key={s.id} className="pending-spot">
                  <div className="pending-spot-name">
                    {s.name}{" "}
                    <span className="muted small">({s.country})</span>
                  </div>
                  <div className="muted small" style={{ marginTop: 2 }}>
                    {s.lat.toFixed(4)}, {s.lon.toFixed(4)}
                    {s.note && ` · ${s.note}`}
                  </div>
                  {s.windguru_url && (
                    <div style={{ marginTop: 2 }}>
                      <a
                        href={s.windguru_url}
                        target="_blank"
                        rel="noreferrer"
                        className="windguru-link"
                        style={{ marginTop: 0 }}
                      >
                        Windguru ↗
                      </a>
                    </div>
                  )}
                  <div className="pending-spot-actions">
                    <button className="btn small approve-btn" onClick={() => approve(s.id)}>
                      ✓ Schválit
                    </button>
                    <button className="btn small reject-btn" onClick={() => reject(s.id)}>
                      ✕ Zamítnout
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
