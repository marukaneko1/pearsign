"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { Globe as GlobeIcon, MapPin, Users, Loader2, AlertCircle } from "lucide-react";

const Globe = dynamic(() => import("react-globe.gl").then(mod => mod.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

interface SignerPoint {
  lat: number;
  lng: number;
  city: string;
  country: string;
  countryCode: string;
  size: number;
  count: number;
}

interface SignerLocationData {
  points: SignerPoint[];
  summary: {
    totalSigners: number;
    countries: number;
    cities: number;
  };
}

export function SignerGlobe() {
  const [data, setData] = useState<SignerLocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch("/api/analytics/signer-locations");
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error || "Failed to load");
        }
      } catch {
        setError("Failed to load signer locations");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    observer.observe(container);
    const rect = container.getBoundingClientRect();
    setDimensions({ width: rect.width, height: rect.height });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (globeRef.current) {
      const globe = globeRef.current;
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.5;
      globe.controls().enableZoom = true;
      globe.controls().minDistance = 150;
      globe.controls().maxDistance = 500;

      if (data?.points && data.points.length > 0) {
        const avgLat = data.points.reduce((s, p) => s + p.lat, 0) / data.points.length;
        const avgLng = data.points.reduce((s, p) => s + p.lng, 0) / data.points.length;
        globe.pointOfView({ lat: avgLat, lng: avgLng, altitude: 2.2 }, 1000);
      }
    }
  }, [data]);

  const pointColor = useCallback(() => "#22c55e", []);
  const pointAltitude = useCallback((d: any) => d.size * 0.15, []);
  const pointRadius = useCallback((d: any) => Math.max(0.3, d.size * 0.8), []);
  const pointLabel = useCallback((d: any) => {
    return `<div style="background: rgba(0,0,0,0.85); color: white; padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 1.4; border: 1px solid rgba(255,255,255,0.1);">
      <div style="font-weight: 600;">${d.city}, ${d.country}</div>
      <div style="color: #22c55e; margin-top: 2px;">${d.count} signature${d.count > 1 ? 's' : ''}</div>
    </div>`;
  }, []);

  const arcsData = useMemo(() => {
    if (!data?.points || data.points.length < 2) return [];
    const sorted = [...data.points].sort((a, b) => b.count - a.count);
    const arcs: any[] = [];
    const max = Math.min(sorted.length, 8);
    for (let i = 0; i < max - 1; i++) {
      for (let j = i + 1; j < max; j++) {
        arcs.push({
          startLat: sorted[i].lat,
          startLng: sorted[i].lng,
          endLat: sorted[j].lat,
          endLng: sorted[j].lng,
          color: ["rgba(34, 197, 94, 0.3)", "rgba(34, 197, 94, 0.1)"],
        });
      }
    }
    return arcs.slice(0, 15);
  }, [data]);

  const ringsData = useMemo(() => {
    if (!data?.points) return [];
    return data.points
      .filter(p => p.count >= 3)
      .map(p => ({
        lat: p.lat,
        lng: p.lng,
        maxR: Math.min(5, p.count * 0.5),
        propagationSpeed: 1,
        repeatPeriod: 1500,
      }));
  }, [data]);

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <GlobeIcon className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm sm:text-base">Signer Locations</h3>
        </div>
        <div className="flex items-center justify-center h-[300px] sm:h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <GlobeIcon className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm sm:text-base">Signer Locations</h3>
        </div>
        <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground gap-2">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const hasData = data && data.points.length > 0;

  return (
    <div className="rounded-xl border bg-card overflow-hidden" data-testid="signer-globe-card">
      <div className="p-4 sm:p-6 pb-2 sm:pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <GlobeIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm sm:text-base">Signer Locations</h3>
              <p className="text-xs text-muted-foreground">Geographic distribution of document signers</p>
            </div>
          </div>
          {hasData && data.summary && (
            <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                <span>{data.summary.totalSigners} signers</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                <span>{data.summary.countries} {data.summary.countries === 1 ? 'country' : 'countries'}</span>
              </div>
              <div className="flex items-center gap-1">
                <GlobeIcon className="h-3.5 w-3.5" />
                <span>{data.summary.cities} {data.summary.cities === 1 ? 'city' : 'cities'}</span>
              </div>
            </div>
          )}
        </div>

        {hasData && data.summary && (
          <div className="flex sm:hidden items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>{data.summary.totalSigners} signers</span>
            <span>&middot;</span>
            <span>{data.summary.countries} {data.summary.countries === 1 ? 'country' : 'countries'}</span>
            <span>&middot;</span>
            <span>{data.summary.cities} {data.summary.cities === 1 ? 'city' : 'cities'}</span>
          </div>
        )}
      </div>

      <div ref={containerRef} className="relative h-[300px] sm:h-[400px] lg:h-[450px] w-full">
        {!hasData ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <div className="relative">
              <GlobeIcon className="h-16 w-16 opacity-20" />
              <MapPin className="h-6 w-6 absolute -bottom-1 -right-1 text-primary/40" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">No signer data yet</p>
              <p className="text-xs mt-1">When documents are signed, signer locations will appear here</p>
            </div>
          </div>
        ) : dimensions.width > 0 && (
          <Globe
            ref={globeRef}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
            atmosphereColor="#22c55e"
            atmosphereAltitude={0.15}
            pointsData={data.points}
            pointLat="lat"
            pointLng="lng"
            pointColor={pointColor}
            pointAltitude={pointAltitude}
            pointRadius={pointRadius}
            pointLabel={pointLabel}
            arcsData={arcsData}
            arcColor="color"
            arcDashLength={0.5}
            arcDashGap={0.2}
            arcDashAnimateTime={2000}
            arcStroke={0.5}
            ringsData={ringsData}
            ringColor={() => (t: number) => `rgba(34, 197, 94, ${1 - t})`}
            ringMaxRadius="maxR"
            ringPropagationSpeed="propagationSpeed"
            ringRepeatPeriod="repeatPeriod"
            enablePointerInteraction={true}
          />
        )}
      </div>

      {hasData && data.points.length > 0 && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-1">
          <div className="flex flex-wrap gap-2">
            {[...data.points]
              .sort((a, b) => b.count - a.count)
              .slice(0, 5)
              .map((point, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 text-xs"
                  data-testid={`signer-location-tag-${i}`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="font-medium">{point.city}</span>
                  <span className="text-muted-foreground">({point.count})</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
