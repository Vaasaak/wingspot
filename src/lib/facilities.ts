// Pomocné funkce pro zobrazení vybavenosti spotu (SpotRow i AdminPanel).

import type { SpotFacilities } from "../data/spots";

// Popisek placeného parkování i s cenou, pokud ji uživatel zadal.
export function paidParkingLabel(f: SpotFacilities): string {
  if (f.parkingPrice == null) return "Parking placený";
  const cur = f.parkingCurrency === "EUR" ? "€" : f.parkingCurrency === "PLN" ? "zł" : "Kč";
  const unit = f.parkingPriceUnit === "hour" ? "/h" : f.parkingPriceUnit === "day" ? "/den" : "";
  return `Parking ${f.parkingPrice} ${cur}${unit}`;
}

export interface FacilityChip {
  label: string;
  ok: boolean; // true = má / false = nemá (přeškrtnuté)
}

// Seznam chipů vybavenosti pro kompaktní zobrazení (admin).
export function facilityChips(f: SpotFacilities): FacilityChip[] {
  const out: FacilityChip[] = [];
  if (f.parking === "free") out.push({ label: "Parking zdarma", ok: true });
  if (f.parking === "paid") out.push({ label: paidParkingLabel(f), ok: true });
  if (f.parking === "none") out.push({ label: "Bez parkingu", ok: false });
  if (f.wc === true) out.push({ label: "WC", ok: true });
  if (f.wc === false) out.push({ label: "Bez WC", ok: false });
  if (f.refreshments === true) out.push({ label: "Občerstvení", ok: true });
  if (f.refreshments === false) out.push({ label: "Bez občerstvení", ok: false });
  if (f.rental === true) out.push({ label: "Půjčovna", ok: true });
  return out;
}
