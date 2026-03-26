import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

interface GeoLocation {
  lat: number;
  lng: number;
  city: string;
  country: string;
  countryCode: string;
}

const geoCache = new Map<string, GeoLocation | null>();
let tableInitialized = false;

async function ensureTable() {
  if (tableInitialized) return;
  await sql`
    CREATE TABLE IF NOT EXISTS signer_geo_cache (
      ip_address VARCHAR(100) PRIMARY KEY,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      city VARCHAR(200),
      country VARCHAR(200),
      country_code VARCHAR(10),
      cached_at TIMESTAMP DEFAULT NOW()
    )
  `;
  tableInitialized = true;
}

async function geolocateIP(ip: string): Promise<GeoLocation | null> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return null;
  }

  if (geoCache.has(ip)) {
    return geoCache.get(ip) || null;
  }

  try {
    const res = await fetch(`https://ipwho.is/${ip}`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();

    if (data.success !== false && data.latitude && data.longitude) {
      const loc: GeoLocation = {
        lat: data.latitude,
        lng: data.longitude,
        city: data.city || 'Unknown',
        country: data.country || 'Unknown',
        countryCode: data.country_code || 'XX',
      };
      geoCache.set(ip, loc);
      return loc;
    }
  } catch {
  }

  geoCache.set(ip, null);
  return null;
}

export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      await ensureTable();

      const sessions = await sql`
        SELECT DISTINCT ip_address
        FROM envelope_signing_sessions
        WHERE org_id = ${tenantId}
          AND ip_address IS NOT NULL
          AND ip_address != ''
          AND status IN ('completed', 'viewed')
        ORDER BY ip_address
        LIMIT 500
      `;

      const ips = (sessions as any[]).map(r => r.ip_address).filter(Boolean);

      if (ips.length === 0) {
        return NextResponse.json({
          success: true,
          data: { points: [], summary: { totalSigners: 0, countries: 0, cities: 0 } }
        });
      }

      const cached = await sql`
        SELECT ip_address, lat, lng, city, country, country_code
        FROM signer_geo_cache
        WHERE ip_address = ANY(${ips})
      `;
      const cachedMap = new Map<string, GeoLocation>();
      for (const row of cached as any[]) {
        cachedMap.set(row.ip_address, {
          lat: row.lat,
          lng: row.lng,
          city: row.city,
          country: row.country,
          countryCode: row.country_code,
        });
      }

      const uncachedIps = ips.filter(ip => !cachedMap.has(ip));

      const maxUncached = 20;
      const toResolve = uncachedIps.slice(0, maxUncached);

      const batchSize = 5;
      for (let i = 0; i < toResolve.length; i += batchSize) {
        const batch = toResolve.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(ip => geolocateIP(ip)));

        for (let j = 0; j < batch.length; j++) {
          const loc = results[j];
          if (loc) {
            cachedMap.set(batch[j], loc);
            await sql`
              INSERT INTO signer_geo_cache (ip_address, lat, lng, city, country, country_code)
              VALUES (${batch[j]}, ${loc.lat}, ${loc.lng}, ${loc.city}, ${loc.country}, ${loc.countryCode})
              ON CONFLICT (ip_address) DO NOTHING
            `;
          }
        }

        if (i + batchSize < toResolve.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      const signerCounts = await sql`
        SELECT ip_address, COUNT(*) as sign_count
        FROM envelope_signing_sessions
        WHERE org_id = ${tenantId}
          AND ip_address IS NOT NULL
          AND ip_address != ''
          AND status IN ('completed', 'viewed')
        GROUP BY ip_address
      `;
      const countMap = new Map<string, number>();
      for (const row of signerCounts as any[]) {
        countMap.set(row.ip_address, parseInt(row.sign_count));
      }

      const locationAgg = new Map<string, { lat: number; lng: number; city: string; country: string; countryCode: string; count: number }>();

      for (const [ip, loc] of cachedMap.entries()) {
        const key = `${loc.lat.toFixed(2)}_${loc.lng.toFixed(2)}`;
        const count = countMap.get(ip) || 1;
        if (locationAgg.has(key)) {
          locationAgg.get(key)!.count += count;
        } else {
          locationAgg.set(key, { ...loc, count });
        }
      }

      const points = Array.from(locationAgg.values()).map(loc => ({
        lat: loc.lat,
        lng: loc.lng,
        city: loc.city,
        country: loc.country,
        countryCode: loc.countryCode,
        size: Math.min(0.8, 0.15 + Math.log2(loc.count + 1) * 0.1),
        count: loc.count,
      }));

      const countries = new Set(points.map(p => p.country));
      const cities = new Set(points.map(p => `${p.city}_${p.country}`));

      const hasMore = uncachedIps.length > maxUncached;

      return NextResponse.json({
        success: true,
        data: {
          points,
          summary: {
            totalSigners: points.reduce((s, p) => s + p.count, 0),
            countries: countries.size,
            cities: cities.size,
          },
          hasMore,
        },
      });
    } catch (error) {
      console.error('Signer locations error:', error);
      return NextResponse.json({ success: false, error: 'Failed to load signer locations' }, { status: 500 });
    }
  }
);
