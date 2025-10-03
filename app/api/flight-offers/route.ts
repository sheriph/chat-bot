import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { FlightOffersSearchRequest } from '@/types/flight-booking';
import { amadeusFetch } from '@/lib/services/amadeus-fetch';
import { redis } from '@/lib/redis';
import type { FlightOffersResponse } from '@/types/flight-booking';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FlightOffersSearchRequest;

    if (!body || !Array.isArray(body.originDestinations) || !Array.isArray(body.travelers)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const apiUrl = `/v2/shopping/flight-offers`;

    // Support X-HTTP-Method-Override: GET if consumer wants to use GET semantics
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const override = request.headers.get('x-http-method-override');
    if (override) headers['X-HTTP-Method-Override'] = override;

    const resp = await amadeusFetch(apiUrl, { method: 'POST', headers, body: body as any });

    const text = await resp.text();
    if (!resp.ok) {
      console.error('Amadeus flight offers error:', resp.status, text);
      return NextResponse.json({ error: 'Failed to fetch flight offers', details: text }, { status: resp.status });
    }

    // Parse JSON response
    let json: FlightOffersResponse | null = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse flight offers JSON:', e);
      return NextResponse.json({ error: 'Invalid response from flight API' }, { status: 500 });
    }

    const finalText = json ? JSON.stringify(json) : text;

    // Persist the offers payload server-side with a 30-minute TTL and set a reference cookie
    try {
      const id = randomUUID();
      const key = `ngabroad:flight-offers:${id}`;
      const ttlSeconds = 30 * 60; // 30 minutes
      const createdAt = new Date().toISOString();
      
      // Wrap the data with metadata
      const dataWithMetadata = {
        createdAt,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        ttlSeconds,
        data: finalText
      };
      
      await redis.set(key, JSON.stringify(dataWithMetadata), 'EX', ttlSeconds);

      const cookieStore = await cookies();
      cookieStore.set({
        name: 'flight_offers_key',
        value: id,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: ttlSeconds,
      });
    } catch (persistErr) {
      console.error('Failed to persist flight offers to Redis or set cookie:', persistErr);
      // Non-fatal: continue returning the response to the client
    }

    return new NextResponse(finalText, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Flight offers search error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}