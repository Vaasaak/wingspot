// Všechny laditelné váhy a prahy rankingového algoritmu na jednom místě.
// Měň tady — logiku v scoring.ts nechej nedotčenou.

export const RANK = {
  // Délka okna
  idealHours: 6,        // okno ≥ 6 h = plný bod za délku
  wLength: 0.5,

  // Síla větru
  idealWindOver: 6,     // průměr o 6 m/s nad prahem = plný bod za sílu
  wStrength: 0.3,

  // Ensemble spolehlivost
  wConfidence: 0.2,

  // Poryvovost
  gustyRatio: 1.5,      // nárazy/vítr nad tímto = poryvové
  gustyPenalty: 0.2,    // max odečet ze skóre za poryvovost

  // Srážky
  precipPerMm: 0.05,    // odečet za každý mm srážek v okně
  precipMax: 0.25,      // strop penalizace za srážky

  // Vzdálenostní váha (wLength + wStrength + wConfidence = 1.0)
  distNearMul: 1.0,     // násobič skóre na blízku
  distFarMul: 0.6,      // násobič na hraně maxDistanceKm
};
