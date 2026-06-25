"use client";
// lib/solar/useSolarLookup.ts
import { useState, useCallback } from "react";
import type { CoreRoof } from "./types";

interface LookupResult {
  formatted: string;
  lat: number;
  lng: number;
  roofs: CoreRoof[];
  imageryQuality: "HIGH" | "MEDIUM" | "BASE";
  maxPanels: number;
}

type Status = "idle" | "loading" | "ok" | "no_building" | "error";

export function useSolarLookup() {
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (address: string) => {
    setStatus("loading");
    setError(null);
    try {
      const geo = await fetch(`/api/solar/geocode?q=${encodeURIComponent(address)}`);
      if (!geo.ok) throw new Error("Couldn't find that address");
      const { formatted, lat, lng } = await geo.json();

      const ins = await fetch(`/api/solar/insights?lat=${lat}&lng=${lng}`);
      if (ins.status === 404) {
        // No Google building model — let the user add roofs manually
        setData({ formatted, lat, lng, roofs: [], imageryQuality: "BASE", maxPanels: 0 });
        setStatus("no_building");
        return;
      }
      if (!ins.ok) throw new Error("Solar data unavailable for this property");
      const payload = await ins.json();

      setData({ formatted, lat, lng, ...payload });
      setStatus("ok");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lookup failed");
      setStatus("error");
    }
  }, []);

  return { lookup, status, data, error };
}
