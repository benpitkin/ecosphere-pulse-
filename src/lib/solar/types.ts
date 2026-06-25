// lib/solar/types.ts
// Typed shapes for the bits of the Google Solar API we actually use.
// Full schema: https://developers.google.com/maps/documentation/solar/reference/rest/v1/buildingInsights/findClosest

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RoofSegmentStat {
  pitchDegrees: number;
  azimuthDegrees: number; // compass bearing from true north — lives HERE, not on panels
  stats: {
    areaMeters2: number;
    groundAreaMeters2: number;
    sunshineQuantiles: number[];
  };
  center: LatLng;
  planeHeightAtCenterMeters?: number;
}

export interface SolarPanel {
  center: LatLng;
  orientation: "LANDSCAPE" | "PORTRAIT";
  yearlyEnergyDcKwh: number;
  segmentIndex: number; // join key back to roofSegmentStats[]
}

export interface SolarPanelConfig {
  panelsCount: number;
  yearlyEnergyDcKwh: number;
  roofSegmentSummaries: {
    pitchDegrees: number;
    azimuthDegrees: number;
    panelsCount: number;
    yearlyEnergyDcKwh: number;
    segmentIndex: number;
  }[];
}

export interface SolarPotential {
  maxArrayPanelsCount: number;
  panelCapacityWatts: number;
  panelHeightMeters: number;
  panelWidthMeters: number;
  panelLifetimeYears: number;
  maxArrayAreaMeters2: number;
  maxSunshineHoursPerYear: number;
  carbonOffsetFactorKgPerMwh: number;
  roofSegmentStats: RoofSegmentStat[];
  solarPanels: SolarPanel[];
  solarPanelConfigs: SolarPanelConfig[];
}

export interface BuildingInsights {
  name: string;
  center: LatLng;
  imageryDate: { year: number; month: number; day: number };
  postalCode: string;
  regionCode: string;
  solarPotential: SolarPotential;
  imageryQuality: "HIGH" | "MEDIUM" | "BASE";
}

// ---- The shape Core's Roofs step consumes ----
export interface CoreRoof {
  segmentIndex: number;
  name: string;
  areaM2: number;
  pitchDeg: number;
  azimuthDeg: number;
  orientationLabel: string; // human-readable: "South", "South-West", etc.
  maxPanels: number;
  estYearlyKwh: number;
}

const COMPASS = [
  "North", "North-East", "East", "South-East",
  "South", "South-West", "West", "North-West",
];
export function azimuthToLabel(az: number): string {
  return COMPASS[Math.round(az / 45) % 8];
}

/**
 * Turn Google's building insights into Core roof rows.
 * We use the largest available panel config to estimate panels + generation
 * per segment, then fall back to segment area where a config is absent.
 */
export function toCoreRoofs(b: BuildingInsights): CoreRoof[] {
  const sp = b.solarPotential;
  // pick the configuration closest to filling the roof
  const best = sp.solarPanelConfigs?.[sp.solarPanelConfigs.length - 1];
  const bySegment = new Map<number, { panels: number; kwh: number }>();
  best?.roofSegmentSummaries.forEach((s) => {
    bySegment.set(s.segmentIndex, { panels: s.panelsCount, kwh: s.yearlyEnergyDcKwh });
  });

  return sp.roofSegmentStats
    .map((seg, i) => {
      const hit = bySegment.get(i);
      return {
        segmentIndex: i,
        name: `Roof ${i + 1}`,
        areaM2: Math.round(seg.stats.areaMeters2 * 10) / 10,
        pitchDeg: Math.round(seg.pitchDegrees),
        azimuthDeg: Math.round(seg.azimuthDegrees),
        orientationLabel: azimuthToLabel(seg.azimuthDegrees),
        maxPanels: hit?.panels ?? 0,
        estYearlyKwh: Math.round(hit?.kwh ?? 0),
      };
    })
    // surface usable roofs first: south-facing, decent area, panels available
    .sort((a, b) => b.maxPanels - a.maxPanels || b.areaM2 - a.areaM2);
}
