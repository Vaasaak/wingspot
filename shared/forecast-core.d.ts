export interface SpotForecast {
  spotId: string;
  times: string[];
  windMs: number[];
  gustMs: number[];
  windDir: (number | null)[];
  precip: number[];
  ensP25: (number | null)[];
  ensP75: (number | null)[];
  isOutlook: boolean[];
  daily: { date: string; sunrise: string; sunset: string }[];
}

export interface ForecastModel {
  name: string;
  weight: number;
}

export declare const MODELS: ForecastModel[];
export declare const DET_DAYS: number;
export declare const ENS_DAYS: number;

export declare function processForecast(
  spotId: string,
  det: Record<string, unknown>,
  ens: Record<string, unknown>
): SpotForecast;
