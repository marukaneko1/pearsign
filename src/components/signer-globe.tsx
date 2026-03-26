"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { Globe as GlobeIcon, MapPin, Users, Loader2, AlertCircle, Sparkles, Map, RotateCcw } from "lucide-react";

const GlobeGL = dynamic(() => import("react-globe.gl").then(mod => mod.default), {
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
  isDemo: boolean;
  points: SignerPoint[];
  summary: {
    totalSigners: number;
    countries: number;
    cities: number;
  };
}

type ViewMode = "map" | "globe";

// ─── Flat Map ─────────────────────────────────────────────────────────────────
// World map image from Natural Earth / unpkg as a background,
// with SVG pin overlays using Mercator projection math.

function mercatorX(lng: number, w: number) {
  return ((lng + 180) / 360) * w;
}
function mercatorY(lat: number, h: number) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * h;
  return Math.max(0, Math.min(h, y));
}

const MAP_IMG =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/World_map_-_low_resolution.svg/1280px-World_map_-_low_resolution.svg.png";

function FlatMap({ points, isDemo }: { points: SignerPoint[]; isDemo: boolean }) {
  const [tooltip, setTooltip] = useState<{ point: SignerPoint; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dotColor = isDemo ? "#f59e0b" : "#22c55e";

  const sorted = useMemo(
    () => [...points].sort((a, b) => b.count - a.count),
    [points]
  );

  return (
    <div ref={wrapRef} className="relative w-full h-full overflow-hidden">
      {/* World map background */}
      <img
        src={MAP_IMG}
        alt="World map"
        className="absolute inset-0 w-full h-full object-fill opacity-60 dark:opacity-40 pointer-events-none select-none"
        draggable={false}
      />

      {/* Pin SVG overlay */}
      {size.w > 0 && (
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${size.w} ${size.h}`}
          style={{ overflow: "visible" }}
        >
          <defs>
            <style>{`
              @keyframes mapPulse {
                0%   { r: 0; opacity: 0.6; }
                80%  { opacity: 0; }
                100% { opacity: 0; }
              }
            `}</style>
          </defs>

          {sorted.map((point, i) => {
            const x = mercatorX(point.lng, size.w);
            const y = mercatorY(point.lat, size.h);
            const r = Math.max(6, Math.min(20, 6 + Math.log2(point.count + 1) * 3.5));

            return (
              <g key={i}>
                {/* Expanding pulse ring */}
                <circle
                  cx={x} cy={y}
                  r={r}
                  fill="none"
                  stroke={dotColor}
                  strokeWidth={2}
                  opacity={0}
                  style={{
                    animation: `mapPulse 2s ease-out ${i * 0.15}s infinite`,
                    transformOrigin: `${x}px ${y}px`,
                  }}
                />
                {/* Glow shadow */}
                <circle cx={x} cy={y} r={r + 3} fill={dotColor} opacity={0.15} />
                {/* Main pin */}
                <circle
                  cx={x} cy={y} r={r}
                  fill={dotColor}
                  stroke="white"
                  strokeWidth={1.5}
                  style={{
                    cursor: "pointer",
                    filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.4))",
                  }}
                  onMouseMove={(e) => {
                    const rect = wrapRef.current?.getBoundingClientRect();
                    if (rect)
                      setTooltip({
                        point,
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                      });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
                {/* Count label */}
                {point.count > 1 && r >= 10 && (
                  <text
                    x={x} y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={r * 0.85}
                    fontWeight="700"
                    fill="white"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {point.count}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-20 pointer-events-none px-3 py-2 rounded-lg text-xs shadow-xl border"
          style={{
            left: Math.min(tooltip.x + 14, (size.w || 300) - 150),
            top: Math.max(tooltip.y - 56, 4),
            background: "hsl(var(--popover))",
            borderColor: "hsl(var(--border))",
            color: "hsl(var(--popover-foreground))",
            minWidth: 130,
          }}
        >
          <div className="font-semibold">{tooltip.point.city}</div>
          <div className="text-muted-foreground text-[11px]">{tooltip.point.country}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
            <span style={{ color: dotColor }} className="font-semibold">
              {tooltip.point.count} signature{tooltip.point.count !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SignerGlobe() {
  const [data, setData] = useState<SignerLocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("map");

  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [globeSize, setGlobeSize] = useState({ w: 0, h: 0 });

  // Data fetch
  useEffect(() => {
    fetch("/api/analytics/signer-locations")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json.data);
        else setError(json.error || "Failed to load");
      })
      .catch(() => setError("Failed to load signer locations"))
      .finally(() => setLoading(false));
  }, []);

  // Globe dimensions — measured from container, with fallback
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setGlobeSize({ w: el.clientWidth || el.offsetWidth, h: el.clientHeight || el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Globe controls
  useEffect(() => {
    if (viewMode !== "globe" || !globeRef.current || !data?.points?.length) return;
    const g = globeRef.current;
    try {
      g.controls().autoRotate = true;
      g.controls().autoRotateSpeed = 0.5;
      g.controls().enableZoom = true;
      g.controls().minDistance = 150;
      g.controls().maxDistance = 500;
      const avgLat = data.points.reduce((s, p) => s + p.lat, 0) / data.points.length;
      const avgLng = data.points.reduce((s, p) => s + p.lng, 0) / data.points.length;
      g.pointOfView({ lat: avgLat, lng: avgLng, altitude: 2.2 }, 1000);
    } catch {
      /* globe not ready yet */
    }
  }, [data, viewMode, globeSize]);

  const pointColor = useCallback(() => "#22c55e", []);
  const pointAltitude = useCallback((d: any) => d.size * 0.15, []);
  const pointRadius = useCallback((d: any) => Math.max(0.3, d.size * 0.8), []);
  const pointLabel = useCallback(
    (d: any) =>
      `<div style="background:rgba(0,0,0,0.85);color:white;padding:8px 12px;border-radius:8px;font-size:13px;line-height:1.4;border:1px solid rgba(255,255,255,0.1)">
        <div style="font-weight:600">${d.city}, ${d.country}</div>
        <div style="color:#22c55e;margin-top:2px">${d.count} signature${d.count > 1 ? "s" : ""}</div>
      </div>`,
    []
  );

  const arcsData = useMemo(() => {
    if (!data?.points || data.points.length < 2) return [];
    const sorted = [...data.points].sort((a, b) => b.count - a.count);
    const arcs: any[] = [];
    const max = Math.min(sorted.length, 8);
    for (let i = 0; i < max - 1; i++)
      for (let j = i + 1; j < max; j++)
        arcs.push({
          startLat: sorted[i].lat, startLng: sorted[i].lng,
          endLat: sorted[j].lat, endLng: sorted[j].lng,
          color: ["rgba(34,197,94,0.3)", "rgba(34,197,94,0.1)"],
        });
    return arcs.slice(0, 15);
  }, [data]);

  const ringsData = useMemo(
    () =>
      data?.points
        ?.filter((p) => p.count >= 3)
        .map((p) => ({ lat: p.lat, lng: p.lng, maxR: Math.min(5, p.count * 0.5), propagationSpeed: 1, repeatPeriod: 1500 })) ?? [],
    [data]
  );

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

  const hasData = !!data && data.points.length > 0;
  const isDemo = data?.isDemo ?? false;
  const dotColor = isDemo ? "#f59e0b" : "#22c55e";

  // Use measured size or sensible fallback so globe always renders
  const gw = globeSize.w || 600;
  const gh = globeSize.h || 420;

  return (
    <div className="rounded-xl border bg-card overflow-hidden" data-testid="signer-globe-card">
      {/* Header */}
      <div className="p-4 sm:p-6 pb-2 sm:pb-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <GlobeIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm sm:text-base">Signer Locations</h3>
              {isDemo && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  <Sparkles className="h-2.5 w-2.5" />
                  Sample
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isDemo
                ? "Sample data — live locations appear once documents are signed"
                : "Geographic distribution of document signers"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {hasData && data!.summary && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {data!.summary.totalSigners} {isDemo ? "sample " : ""}signer{data!.summary.totalSigners !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {data!.summary.countries} {data!.summary.countries === 1 ? "country" : "countries"}
              </span>
            </div>
          )}

          <div className="flex items-center rounded-lg border p-0.5 bg-muted/50 gap-0.5">
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "map" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Map className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Map</span>
            </button>
            <button
              onClick={() => setViewMode("globe")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "globe" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Globe</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile stats */}
      {hasData && data!.summary && (
        <div className="flex sm:hidden items-center gap-3 px-4 pb-1 text-xs text-muted-foreground">
          <span>{data!.summary.totalSigners} signers</span>
          <span>·</span>
          <span>{data!.summary.countries} {data!.summary.countries === 1 ? "country" : "countries"}</span>
          <span>·</span>
          <span>{data!.summary.cities} {data!.summary.cities === 1 ? "city" : "cities"}</span>
        </div>
      )}

      {/* Visualisation area */}
      <div
        ref={containerRef}
        className="relative h-[300px] sm:h-[420px] lg:h-[480px] w-full"
      >
        {/* ── Flat map ── */}
        {viewMode === "map" && hasData && <FlatMap points={data!.points} isDemo={isDemo} />}
        {viewMode === "map" && !hasData && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <MapPin className="h-10 w-10 opacity-30" />
            <p className="text-sm">No signing data yet</p>
          </div>
        )}

        {/* ── 3-D globe ── always render when in globe mode; use fallback size */}
        {viewMode === "globe" && (
          <>
            {hasData ? (
              <GlobeGL
                ref={globeRef}
                width={gw}
                height={gh}
                backgroundColor="rgba(0,0,0,0)"
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
                atmosphereColor={isDemo ? "#f59e0b" : "#22c55e"}
                atmosphereAltitude={0.15}
                pointsData={data!.points}
                pointLat="lat"
                pointLng="lng"
                pointColor={isDemo ? () => "#f59e0b" : pointColor}
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
                ringColor={
                  isDemo
                    ? () => (t: number) => `rgba(245,158,11,${1 - t})`
                    : () => (t: number) => `rgba(34,197,94,${1 - t})`
                }
                ringMaxRadius="maxR"
                ringPropagationSpeed="propagationSpeed"
                ringRepeatPeriod="repeatPeriod"
                enablePointerInteraction
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <GlobeIcon className="h-10 w-10 opacity-30" />
                <p className="text-sm">No signing data yet</p>
              </div>
            )}
          </>
        )}

        {/* Demo banner */}
        {isDemo && hasData && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 backdrop-blur-sm text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap pointer-events-none">
            <Sparkles className="h-3 w-3" />
            Sample data — send your first document to see real signer locations
          </div>
        )}
      </div>

      {/* City tags */}
      {hasData && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-2">
          <div className="flex flex-wrap gap-2">
            {[...data!.points]
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
              .map((point, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
                    isDemo ? "bg-amber-50 dark:bg-amber-900/20" : "bg-muted/50"
                  }`}
                  data-testid={`signer-location-tag-${i}`}
                >
                  <MapPin className="h-3 w-3 shrink-0" style={{ color: dotColor }} />
                  <span className="font-medium">{point.city}</span>
                  <span className="text-muted-foreground">
                    {point.country.length > 12 ? point.countryCode : point.country}
                  </span>
                  <span className="text-muted-foreground opacity-50">·</span>
                  <span className="font-medium" style={{ color: dotColor }}>{point.count}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
