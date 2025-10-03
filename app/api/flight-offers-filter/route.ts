import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redis } from '@/lib/redis';
import type { FlightOffer, FlightOffersResponse } from '@/types/flight-booking';

// Helper function to sort offers
function sortOffers(offers: FlightOffer[], sortBy: string): FlightOffer[] {
  switch (sortBy) {
    case 'cheapest':
      return [...offers].sort((a, b) => parseFloat(a.price.total) - parseFloat(b.price.total));
    case 'fastest':
      return [...offers].sort((a, b) => {
        const getDuration = (offer: FlightOffer) => {
          const totalMs = offer.itineraries.reduce((total, itinerary) => {
            const duration = itinerary.duration || '';
            const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
            if (!match) return total;
            const hours = match[1] ? parseInt(match[1], 10) : 0;
            const minutes = match[2] ? parseInt(match[2], 10) : 0;
            return total + (hours * 60 + minutes);
          }, 0);
          return totalMs;
        };
        return getDuration(a) - getDuration(b);
      });
    case 'earliest':
      return [...offers].sort((a, b) => {
        const aTime = new Date(a.itineraries[0]?.segments[0]?.departure.at || 0);
        const bTime = new Date(b.itineraries[0]?.segments[0]?.departure.at || 0);
        return aTime.getTime() - bTime.getTime();
      });
    default:
      return offers;
  }
}

// Helper function to filter offers by airlines
function filterByAirlines(offers: FlightOffer[], airlines: string[]): FlightOffer[] {
  if (airlines.length === 0) return offers;
  
  return offers.filter(offer => {
    // Check if any segment in any itinerary matches the selected airlines
    return offer.itineraries.some(itinerary =>
      itinerary.segments.some(segment =>
        airlines.includes(segment.carrierCode.toUpperCase())
      )
    );
  });
}

// Helper function to filter offers by stops
function filterByStops(offers: FlightOffer[], stopsFilter: string): FlightOffer[] {
  return offers.filter(offer => {
    return offer.itineraries.every(itinerary => {
      const stopCount = itinerary.segments.length - 1;
      
      switch (stopsFilter) {
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

// GET: return cached flight offers JSON using the reference in httpOnly cookie
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const id = cookieStore.get('flight_offers_key')?.value;
    if (!id) {
      return NextResponse.json({ error: 'No flight offers cookie found' }, { status: 404 });
    }
    
    const key = `ngabroad:flight-offers:${id}`;
    const data = await redis.get(key);
    if (!data) {
      // Expired or not found
      return NextResponse.json({ error: 'Cached flight offers not found or expired' }, { status: 410 });
    }

    let dataWithMetadata: { createdAt: string; expiresAt: string; ttlSeconds: number; data: string } | null = null;
    let response: FlightOffersResponse;
    
    try {
      // Try to parse as metadata wrapper first
      const parsed = JSON.parse(data);
      if (parsed.createdAt && parsed.data) {
        dataWithMetadata = parsed;
        response = JSON.parse(parsed.data);
      } else {
        // Fallback for old format without metadata
        response = parsed;
      }
    } catch (err) {
      console.error('Error parsing cached data:', err);
      return NextResponse.json({ error: 'Invalid cached data' }, { status: 500 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const airlinesParam = searchParams.get('airlines');
    const sortBy = searchParams.get('sortBy') || 'cheapest';
    const stopsParam = searchParams.get('stops');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '5', 10);

    let filteredOffers = response.data || [];

    // Filter by airlines if specified
    if (airlinesParam) {
      const airlines = airlinesParam.split(',').map(code => code.trim().toUpperCase());
      filteredOffers = filterByAirlines(filteredOffers, airlines);
    }

    // Filter by stops if specified
    if (stopsParam) {
      filteredOffers = filterByStops(filteredOffers, stopsParam);
    }

    // Sort offers
    filteredOffers = sortOffers(filteredOffers, sortBy);

    // Paginate results
    const totalOffers = filteredOffers.length;
    const totalPages = Math.ceil(totalOffers / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOffers = filteredOffers.slice(startIndex, endIndex);

    // Return filtered and sorted response with metadata
    const filteredResponse: FlightOffersResponse & { 
      metadata?: { createdAt: string; expiresAt: string; ttlSeconds: number };
      pagination?: { page: number; limit: number; total: number; totalPages: number };
    } = {
      ...response,
      data: paginatedOffers,
      pagination: {
        page,
        limit,
        total: totalOffers,
        totalPages
      }
    };

    // Include metadata if available
    if (dataWithMetadata) {
      filteredResponse.metadata = {
        createdAt: dataWithMetadata.createdAt,
        expiresAt: dataWithMetadata.expiresAt,
        ttlSeconds: dataWithMetadata.ttlSeconds
      };
    }

    return NextResponse.json(filteredResponse, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('GET cached flight offers error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}