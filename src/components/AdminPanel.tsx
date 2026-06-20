import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { distanceKm } from "../lib/geo";

interface PendingSpot {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  note: string | null;
  windguru_url: string | null;
  created_at: string;
  // editable by admin before approval:
  _windguru: string;
}

interface Report {
  id: string;
  spot_id: string;
  kind: string;
  issues: string[] | null;
  suggested_name: string | null;
  suggested_lat: number | null;
  suggested_lon: number | null;
  suggested_windguru_url: string | null;
  message: string | null;
  status: string;
  created_at: string;
  spots: { name: string }[] | null;
}

type Cluster = PendingSpot[];

function cluster(spots: PendingSpot[]): Cluster[] {
  const used = new Set<string>();
  const clusters: Cluster[] = [];
  for (const s of spots) {
    if (used.has(s.id)) continue;
    const group: Cluster = [s];
    used.add(s.id);
    for (const other of spots) {
      if (used.has(other.id)) continue;
      if (distanceKm(s.lat, s.lon, other.lat, other.lon) < 2) {
        group.push(other);
        used.add(other.id);
      }
    }
    clusters.push(group);
  }
  return clusters;
}

function osmUrl(lat: number, lon: number) {
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.09},${lat - 0.06},${lon + 0.09},${lat + 0.06}&layer=mapnik&marker=${lat},${lon}`;
}

interface Props {
  onClose: () => void;
  onApproved: () => void;
}

export function AdminPanel({ onClose, onApproved }: Props) {
  const [tab, setTab] = useState<"spots" | "reports">("spots");
  const [spots, setSpots] = useState<PendingSpot[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const [{ data: sd }, { data: rd }] = await Promise.all([
      supabase
        .from("spots")
        .select("id,name,country,lat,lon,note,windguru_url,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      supabase
        .from("reports")
        .select("id,spot_id,kind,issues,suggested_name,suggested_lat,suggested_lon,suggested_windguru_url,message,status,created_at,spots(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    ]);
    setSpots(
      ((sd ?? []) as Omit<PendingSpot, "_windguru">[]).map((s) => ({
        ...s,
        _windguru: s.windguru_url ?? "",
      }))
    );
    setReports((rd ?? []) as Report[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function updateWindguru(id: string, val: string) {
    setSpots((prev) => prev.map((s) => (s.id === id ? { ...s, _windguru: val } : s)));
  }

  async function approveOne(spot: PendingSpot) {
    if (!supabase) return;
    await supabase.from("spots").update({
      status: "approved",
      windguru_url: spot._windguru || null,
    }).eq("id", spot.id);
    setSpots((s) => s.filter((x) => x.id !== spot.id));
    onApproved();
  }

  async function mergeCluster(grp: Cluster) {
    if (!supabase) return;
    const avgLat = grp.reduce((s, x) => s + x.lat, 0) / grp.length;
    const avgLon = grp.reduce((s, x) => s + x.lon, 0) / grp.length;
    const primary = grp[0];
    await supabase.from("spots").update({
      status: "approved",
      lat: avgLat,
      lon: avgLon,
      windguru_url: primary._windguru || null,
    }).eq("id", primary.id);
    for (const s of grp.slice(1)) {
      await supabase.from("spots").update({ status: "rejected" }).eq("id", s.id);
    }
    const ids = new Set(grp.map((x) => x.id));
    setSpots((s) => s.filter((x) => !ids.has(x.id)));
    onApproved();
  }

  async function rejectOne(id: string) {
    if (!supabase) return;
    await supabase.from("spots").update({ status: "rejected" }).eq("id", id);
    setSpots((s) => s.filter((x) => x.id !== id));
  }

  async function applyReport(report: Report) {
    if (!supabase) return;
    const update: Record<string, unknown> = {};
    if (report.suggested_name) update.name = report.suggested_name;
    if (report.suggested_lat != null) update.lat = report.suggested_lat;
    if (report.suggested_lon != null) update.lon = report.suggested_lon;
    if (report.suggested_windguru_url) update.windguru_url = report.suggested_windguru_url;
    if (Object.keys(update).length > 0) {
      await supabase.from("spots").update(update).eq("id", report.spot_id);
    }
    await supabase.from("reports").update({ status: "applied" }).eq("id", report.id);
    setReports((r) => r.filter((x) => x.id !== report.id));
  }

  async function dismissReport(id: string) {
    if (!supabase) return;
    await supabase.from("reports").update({ status: "dismissed" }).eq("id", id);
    setReports((r) => r.filter((x) => x.id !== id));
  }

  const clusters = cluster(spots);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🔧 Admin</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {/* Záložky */}
        <div className="admin-tabs">
          <button className={"admin-tab" + (tab === "spots" ? " active" : "")} onClick={() => setTab("spots")}>
            Spoty ke schválení {spots.length > 0 && <span className="tab-badge">{spots.length}</span>}
          </button>
          <button className={"admin-tab" + (tab === "reports" ? " active" : "")} onClick={() => setTab("reports")}>
            Hlášení {reports.length > 0 && <span className="tab-badge">{reports.length}</span>}
          </button>
        </div>

        <div className="modal-body" style={{ paddingTop: 12 }}>
          {loading ? (
            <p className="muted">Načítám…</p>
          ) : tab === "spots" ? (
            clusters.length === 0 ? (
              <p className="muted">Žádné čekající spoty 🎉</p>
            ) : (
              clusters.map((grp, gi) => (
                <div key={gi} className={"pending-cluster" + (grp.length > 1 ? " duplicate" : "")}>
                  {grp.length > 1 && (
                    <div className="cluster-badge">⚠ {grp.length} podobné spoty ve stejné oblasti</div>
                  )}
                  {grp.map((s) => (
                    <div key={s.id} className="pending-spot">
                      <div className="pending-spot-name">
                        {s.name} <span className="muted small">({s.country})</span>
                      </div>
                      <div className="muted small" style={{ marginTop: 2 }}>
                        {s.lat.toFixed(5)}, {s.lon.toFixed(5)}
                        {s.note && ` · ${s.note}`}
                      </div>

                      {/* OSM mapa */}
                      <iframe
                        src={osmUrl(s.lat, s.lon)}
                        className="admin-map"
                        title={`Mapa – ${s.name}`}
                        loading="lazy"
                      />

                      {/* Editovatelný Windguru */}
                      <div className="admin-windguru-row">
                        <span className="muted small">Windguru:</span>
                        <input
                          className="text-input"
                          style={{ flex: 1, padding: "5px 8px", fontSize: "0.82rem" }}
                          value={s._windguru}
                          onChange={(e) => updateWindguru(s.id, e.target.value)}
                          placeholder="https://www.windguru.cz/XXXXX"
                        />
                        <a
                          href="https://www.windguru.cz/"
                          target="_blank"
                          rel="noreferrer"
                          className="windguru-link"
                          style={{ marginTop: 0, whiteSpace: "nowrap" }}
                        >
                          🔍 Hledat
                        </a>
                      </div>

                      {/* Akce pro jeden spot ve skupině */}
                      {grp.length === 1 && (
                        <div className="pending-spot-actions">
                          <button className="btn small approve-btn" onClick={() => approveOne(s)}>✓ Schválit</button>
                          <button className="btn small reject-btn" onClick={() => rejectOne(s.id)}>✕ Zamítnout</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Akce pro celý cluster */}
                  {grp.length > 1 && (
                    <div className="cluster-actions">
                      <button className="btn small approve-btn" onClick={() => mergeCluster(grp)}>
                        ✓ Sloučit a schválit 1 (průměr GPS)
                      </button>
                      <button className="btn small" onClick={() => approveOne(grp[0])}>
                        Schválit jen první
                      </button>
                      <button className="btn small reject-btn" onClick={async () => {
                        for (const s of grp) await rejectOne(s.id);
                      }}>
                        ✕ Zamítnout vše
                      </button>
                    </div>
                  )}
                </div>
              ))
            )
          ) : (
            /* Záložka Hlášení */
            reports.length === 0 ? (
              <p className="muted">Žádná hlášení 🎉</p>
            ) : (
              reports.map((r) => (
                <div key={r.id} className="pending-spot">
                  <div className="pending-spot-name">
                    {r.spots?.[0]?.name ?? r.spot_id}
                    <span className="muted small"> · oprava</span>
                  </div>
                  {r.issues && (
                    <div className="muted small" style={{ marginTop: 4 }}>
                      {r.issues.join(", ")}
                    </div>
                  )}
                  {r.message && <div className="muted small" style={{ marginTop: 4 }}>💬 {r.message}</div>}
                  {(r.suggested_name || r.suggested_lat) && (
                    <div className="muted small" style={{ marginTop: 4 }}>
                      {r.suggested_name && <>Nový název: <b>{r.suggested_name}</b> · </>}
                      {r.suggested_lat && <>GPS: {r.suggested_lat.toFixed(5)}, {r.suggested_lon?.toFixed(5)}</>}
                    </div>
                  )}
                  {r.suggested_lat && (
                    <iframe
                      src={osmUrl(r.suggested_lat, r.suggested_lon!)}
                      className="admin-map"
                      title="Navrhovaná poloha"
                      loading="lazy"
                    />
                  )}
                  <div className="pending-spot-actions" style={{ marginTop: 10 }}>
                    <button className="btn small approve-btn" onClick={() => applyReport(r)}>✓ Použít opravu</button>
                    <button className="btn small reject-btn" onClick={() => dismissReport(r.id)}>✕ Zamítnout</button>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}
