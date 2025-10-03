import { amadeusFetch } from './amadeus-fetch';
import { redis } from '@/lib/redis';
import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import type { FlightOffersSearchRequest, FlightOffersResponse, FlightOffer } from '@/types/flight-booking';

// Fixed cookie key for storing cache key
const CACHE_KEY_COOKIE = 'flight_offers_cache_key';

/**
 * Set cache key in cookie
 */
export async function setCacheKeyCookie(cacheKey: string) {
  try {
    const cookieStore = await cookies();
    // Set cookie with 30 minute expiry
    cookieStore.set(CACHE_KEY_COOKIE, cacheKey, {
      maxAge: 30 * 60, // 30 minutes in seconds
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
  } catch (error) {
    console.error('Failed to set cache key cookie:', error);
  }
}

/**
 * Get cache key from cookie
 */
export async function getCacheKeyCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(CACHE_KEY_COOKIE)?.value || null;
  } catch (error) {
    console.error('Failed to get cache key cookie:', error);
    return null;
  }
}

/**
 * Search for flight offers using Amadeus API and cache results in Redis
 */
export async function searchFlightOffers(searchRequest: FlightOffersSearchRequest): Promise<{
  success: boolean;
  data?: FlightOffersResponse;
  error?: string;
  cacheKey?: string;
}> {
  try {
    const apiUrl = `/v2/shopping/flight-offers`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const resp = await amadeusFetch(apiUrl, { 
      method: 'POST', 
      headers, 
      body: JSON.stringify(searchRequest) 
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.error('Amadeus flight offers error:', resp.status, text);
      return {
        success: false,
        error: `Failed to fetch flight offers: ${text}`
      };
    }

    // Parse JSON response
    let flightData: FlightOffersResponse;
    try {
      flightData = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse flight offers JSON:', e);
      return {
        success: false,
        error: 'Invalid response from flight search API'
      };
    }

    // Cache the offers payload with a 30-minute TTL
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
        searchRequest, // Store the original search request
        data: JSON.stringify(flightData)
      };
      
      await redis.set(key, JSON.stringify(dataWithMetadata), 'EX', ttlSeconds);

      // Store cache key in cookie
      await setCacheKeyCookie(id);

      return {
        success: true,
        data: flightData,
        cacheKey: id
      };
    } catch (persistErr) {
      console.error('Failed to persist flight offers to Redis:', persistErr);
      // Still return the data even if caching failed
      return {
        success: true,
        data: flightData
      };
    }
  } catch (err) {
    console.error('Flight offers search error:', err);
    return {
      success: false,
      error: 'Internal server error during flight search'
    };
  }
}

/**
 * Get cached flight offers from Redis
 */
export async function getCachedFlightOffers(cacheKey: string): Promise<{
  success: boolean;
  data?: FlightOffersResponse;
  metadata?: {
    createdAt: string;
    expiresAt: string;
    ttlSeconds: number;
    searchRequest: FlightOffersSearchRequest;
  };
  error?: string;
}> {
  try {
    const key = `ngabroad:flight-offers:${cacheKey}`;
    const cached = await redis.get(key);
    
    if (!cached) {
      return {
        success: false,
        error: 'Cached flight offers not found or expired'
      };
    }

    const dataWithMetadata = JSON.parse(cached);
    const flightData: FlightOffersResponse = JSON.parse(dataWithMetadata.data);

    return {
      success: true,
      data: flightData,
      metadata: {
        createdAt: dataWithMetadata.createdAt,
        expiresAt: dataWithMetadata.expiresAt,
        ttlSeconds: dataWithMetadata.ttlSeconds,
        searchRequest: dataWithMetadata.searchRequest
      }
    };
  } catch (error) {
    console.error('Error retrieving cached flight offers:', error);
    return {
      success: false,
      error: 'Failed to retrieve cached flight offers'
    };
  }
}

/**
 * Filter and sort flight offers
 */
export function filterFlightOffers(
  offers: FlightOffer[],
  filters: {
    airlines?: string[];
    stops?: 'nonstop' | '1-stop' | '2+-stops' | 'any';
    sortBy?: 'cheapest' | 'fastest' | 'earliest';
  } = {}
): FlightOffer[] {
  let filteredOffers = [...offers];

  // Filter by airlines if specified
  if (filters.airlines && filters.airlines.length > 0) {
    const airlinesUpper = filters.airlines.map(code => code.toUpperCase());
    filteredOffers = filteredOffers.filter(offer => {
      return offer.itineraries.some(itinerary =>
        itinerary.segments.some(segment =>
          airlinesUpper.includes(segment.carrierCode.toUpperCase())
        )
      );
    });
  }

  // Filter by stops if specified
  if (filters.stops && filters.stops !== 'any') {
    filteredOffers = filteredOffers.filter(offer => {
      return offer.itineraries.every(itinerary => {
        const stopCount = itinerary.segments.length - 1;
        
        switch (filters.stops) {
          case 'nonstop':
            return stopCount === 0;
          case '1-stop':
            return stopCount === 1;
          case '2+-stops':
            return stopCount >= 2;
          default:
            return true;
        }
      });
    });
  }

  // Sort offers
  if (filters.sortBy) {
    switch (filters.sortBy) {
      case 'cheapest':
        filteredOffers.sort((a, b) => parseFloat(a.price.total) - parseFloat(b.price.total));
        break;
      case 'fastest':
        filteredOffers.sort((a, b) => {
          const getDuration = (offer: FlightOffer) => {
            return offer.itineraries.reduce((total, itinerary) => {
              const duration = itinerary.duration || '';
              const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
              if (!match) return total;
              const hours = match[1] ? parseInt(match[1], 10) : 0;
              const minutes = match[2] ? parseInt(match[2], 10) : 0;
              return total + (hours * 60 + minutes);
            }, 0);
          };
          return getDuration(a) - getDuration(b);
        });
        break;
      case 'earliest':
        filteredOffers.sort((a, b) => {
          const aTime = new Date(a.itineraries[0]?.segments[0]?.departure.at || 0);
          const bTime = new Date(b.itineraries[0]?.segments[0]?.departure.at || 0);
          return aTime.getTime() - bTime.getTime();
        });
        break;
    }
  }

  return filteredOffers;
}

/**
 * Get relative time string (e.g., "5 minutes ago", "2 hours ago")
 */
export function getRelativeTime(dateString: string): string {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

/**
 * Check if cached data is expired (older than 30 minutes)
 */
export function isCacheExpired(createdAt: string): boolean {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  return diffMinutes >= 30;
}