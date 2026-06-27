// Klient pro /api/drivematrix — vzdálenost a čas autem ke kandidátním spotům.
// Funkce na serveru řeší ORS klíč i cache; tady jen pošleme polohu + spoty.
// Při chybě vrací prázdný objekt → appka spadne zpět na vzdušnou čáru.

export interface DriveResult {
  distance_m: number;
  duration_s: number;
}

export type DriveMatrix = Record<string, DriveResult>;

export async function fetchDriveMatrix(
  origin: { lat: number; lon: number },
  spots: { id: string; lat: number; lon: number }[]
): Promise<DriveMatrix> {
  if (!spots.length) return {};
  try {
    const res = await fetch("/api/drivematrix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: origin.lat, lon: origin.lon, spots }),
    });
    if (!res.ok) return {};
    return (await res.json()) as DriveMatrix;
  } catch {
    return {};
  }
}
