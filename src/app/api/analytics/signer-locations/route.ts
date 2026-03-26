import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withTenant, TenantApiContext } from '@/lib/tenant-middleware';

// Shown when no real signer data exists yet
const SAMPLE_SIGNER_POINTS = [
  { lat: 40.71, lng: -74.00, city: 'New York', country: 'United States', countryCode: 'US', count: 14, size: 0.6 },
  { lat: 51.51, lng: -0.13,  city: 'London',   country: 'United Kingdom', countryCode: 'GB', count: 11, size: 0.55 },
  { lat: 35.69, lng: 139.69, city: 'Tokyo',    country: 'Japan',          countryCode: 'JP', count: 9,  size: 0.5 },
  { lat: 48.85, lng: 2.35,   city: 'Paris',    country: 'France',         countryCode: 'FR', count: 7,  size: 0.45 },
  { lat: 52.52, lng: 13.40,  city: 'Berlin',   country: 'Germany',        countryCode: 'DE', count: 6,  size: 0.42 },
  { lat: -33.87, lng: 151.21, city: 'Sydney',  country: 'Australia',      countryCode: 'AU', count: 5,  size: 0.40 },
  { lat: 43.65, lng: -79.38, city: 'Toronto',  country: 'Canada',         countryCode: 'CA', count: 5,  size: 0.40 },
  { lat: 1.35,  lng: 103.82, city: 'Singapore', country: 'Singapore',     countryCode: 'SG', count: 8,  size: 0.48 },
  { lat: -23.55, lng: -46.63, city: 'São Paulo', country: 'Brazil',       countryCode: 'BR', count: 4,  size: 0.35 },
  { lat: 55.75, lng: 37.62,  city: 'Moscow',   country: 'Russia',         countryCode: 'RU', count: 3,  size: 0.30 },
  { lat: 28.61, lng: 77.21,  city: 'New Delhi', country: 'India',         countryCode: 'IN', count: 6,  size: 0.42 },
  { lat: 31.23, lng: 121.47, city: 'Shanghai', country: 'China',          countryCode: 'CN', count: 7,  size: 0.45 },
  { lat: -26.20, lng: 28.04, city: 'Johannesburg', country: 'South Africa', countryCode: 'ZA', count: 3, size: 0.30 },
  { lat: 19.43, lng: -99.13, city: 'Mexico City', country: 'Mexico',      countryCode: 'MX', count: 4,  size: 0.35 },
  { lat: 37.57, lng: 126.98, city: 'Seoul',    country: 'South Korea',    countryCode: 'KR', count: 5,  size: 0.40 },
];

interface GeoLocation {
  lat: number;
  lng: number;
  city: string;
  country: string;
  countryCode: string;
}

interface IpRow { ip_address: string }
interface GeoCacheRow { ip_address: string; lat: number; lng: number; city: string; country: string; country_code: string }
interface SignerCountRow { ip_address: string; sign_count: string }

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
  // Create the signing sessions table if it doesn't exist yet.
  // In a fully migrated DB this already exists; this is a safe no-op.
  await sql`
    CREATE TABLE IF NOT EXISTS envelope_signing_sessions (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      envelope_id VARCHAR(255),
      recipient_id VARCHAR(255),
      org_id VARCHAR(255),
      tenant_id VARCHAR(255),
      token VARCHAR(500),
      status VARCHAR(50) DEFAULT 'pending',
      ip_address VARCHAR(100),
      user_agent TEXT,
      signed_at TIMESTAMP,
      viewed_at TIMESTAMP,
      declined_at TIMESTAMP,
      decline_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
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
          AND ip_address != 'unknown'
          AND ip_address NOT LIKE '127.%'
          AND ip_address NOT LIKE '192.168.%'
          AND ip_address NOT LIKE '10.%'
          AND ip_address != '::1'
          AND status IN ('completed', 'viewed')
        ORDER BY ip_address
        LIMIT 500
      `;

      const ips = (sessions as IpRow[]).map(r => r.ip_address).filter(Boolean);

      if (ips.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            isDemo: true,
            points: SAMPLE_SIGNER_POINTS,
            summary: {
              totalSigners: SAMPLE_SIGNER_POINTS.reduce((s, p) => s + p.count, 0),
              countries: new Set(SAMPLE_SIGNER_POINTS.map(p => p.country)).size,
              cities: SAMPLE_SIGNER_POINTS.length,
            },
          },
        });
      }

      const cached = await sql`
        SELECT ip_address, lat, lng, city, country, country_code
        FROM signer_geo_cache
        WHERE ip_address = ANY(${ips})
      `;
      const cachedMap = new Map<string, GeoLocation>();
      for (const row of cached as GeoCacheRow[]) {
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
      for (const row of signerCounts as SignerCountRow[]) {
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

      // If we had IPs but none resolved to real locations, fall back to demo data
      if (points.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            isDemo: true,
            points: SAMPLE_SIGNER_POINTS,
            summary: {
              totalSigners: SAMPLE_SIGNER_POINTS.reduce((s, p) => s + p.count, 0),
              countries: new Set(SAMPLE_SIGNER_POINTS.map(p => p.country)).size,
              cities: SAMPLE_SIGNER_POINTS.length,
            },
          },
        });
      }

      const countries = new Set(points.map(p => p.country));
      const cities = new Set(points.map(p => `${p.city}_${p.country}`));

      const hasMore = uncachedIps.length > maxUncached;

      return NextResponse.json({
        success: true,
        data: {
          isDemo: false,
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
