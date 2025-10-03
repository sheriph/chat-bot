import type { 
  FlightOffersSearchRequest, 
  Location, 
  Passengers, 
  TripType, 
  TravelClass,
  TripSegment,
  FlightOffer 
} from '@/types/flight-booking';

// Common airport IATA codes mapping
const AIRPORT_CODES: Record<string, Location> = {
  // Nigeria
  'LOS': { iataCode: 'LOS', name: 'Lagos (Murtala Muhammed)', city: 'Lagos', country: 'Nigeria' },
  'ABV': { iataCode: 'ABV', name: 'Abuja (Nnamdi Azikiwe)', city: 'Abuja', country: 'Nigeria' },
  'KAN': { iataCode: 'KAN', name: 'Kano (Mallam Aminu Kano)', city: 'Kano', country: 'Nigeria' },
  'PHC': { iataCode: 'PHC', name: 'Port Harcourt', city: 'Port Harcourt', country: 'Nigeria' },
  
  // UK
  'LHR': { iataCode: 'LHR', name: 'London Heathrow', city: 'London', country: 'United Kingdom' },
  'LGW': { iataCode: 'LGW', name: 'London Gatwick', city: 'London', country: 'United Kingdom' },
  'MAN': { iataCode: 'MAN', name: 'Manchester', city: 'Manchester', country: 'United Kingdom' },
  'EDI': { iataCode: 'EDI', name: 'Edinburgh', city: 'Edinburgh', country: 'United Kingdom' },
  
  // US
  'JFK': { iataCode: 'JFK', name: 'New York JFK', city: 'New York', country: 'United States' },
  'LAX': { iataCode: 'LAX', name: 'Los Angeles', city: 'Los Angeles', country: 'United States' },
  'ORD': { iataCode: 'ORD', name: 'Chicago O\'Hare', city: 'Chicago', country: 'United States' },
  'DFW': { iataCode: 'DFW', name: 'Dallas/Fort Worth', city: 'Dallas', country: 'United States' },
  
  // Canada
  'YYZ': { iataCode: 'YYZ', name: 'Toronto Pearson', city: 'Toronto', country: 'Canada' },
  'YVR': { iataCode: 'YVR', name: 'Vancouver', city: 'Vancouver', country: 'Canada' },
  'YUL': { iataCode: 'YUL', name: 'Montreal', city: 'Montreal', country: 'Canada' },
  
  // Australia
  'SYD': { iataCode: 'SYD', name: 'Sydney', city: 'Sydney', country: 'Australia' },
  'MEL': { iataCode: 'MEL', name: 'Melbourne', city: 'Melbourne', country: 'Australia' },
  
  // Europe
  'CDG': { iataCode: 'CDG', name: 'Paris Charles de Gaulle', city: 'Paris', country: 'France' },
  'FRA': { iataCode: 'FRA', name: 'Frankfurt', city: 'Frankfurt', country: 'Germany' },
  'AMS': { iataCode: 'AMS', name: 'Amsterdam Schiphol', city: 'Amsterdam', country: 'Netherlands' },
  'FCO': { iataCode: 'FCO', name: 'Rome Fiumicino', city: 'Rome', country: 'Italy' },
  
  // Middle East
  'DXB': { iataCode: 'DXB', name: 'Dubai', city: 'Dubai', country: 'UAE' },
  'DOH': { iataCode: 'DOH', name: 'Doha', city: 'Doha', country: 'Qatar' },
  'ADD': { iataCode: 'ADD', name: 'Addis Ababa', city: 'Addis Ababa', country: 'Ethiopia' },
};

export function parseLocation(input: string): Location | null {
  const normalized = input.trim().toUpperCase();
  
  // Direct IATA code match
  if (AIRPORT_CODES[normalized]) {
    return AIRPORT_CODES[normalized];
  }
  
  // Extract IATA from formats like "Lagos (LOS)" or "LOS - Lagos"
  const iataMatch = normalized.match(/\b([A-Z]{3})\b/);
  if (iataMatch) {
    const code = iataMatch[1];
    if (AIRPORT_CODES[code]) {
      return AIRPORT_CODES[code];
    }
  }
  
  // Search by city name
  const byCity = Object.values(AIRPORT_CODES).find(loc => 
    loc.city?.toUpperCase().includes(normalized) || 
    loc.name.toUpperCase().includes(normalized)
  );
  
  return byCity || null;
}

export function parseDate(dateString: string): string | null {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  } catch {
    return null;
  }
}

interface FlightSearchParams {
  tripType: TripType;
  origin?: Location;
  destination?: Location;
  departureDate?: string;
  returnDate?: string;
  segments?: TripSegment[]; // For multi-trip
  passengers: Passengers;
  travelClass: TravelClass;
  currency?: string;
  maxOffers?: number;
}

export function buildFlightOffersSearchRequest(params: FlightSearchParams): FlightOffersSearchRequest {
  // Build travelers list
  const travelers: FlightOffersSearchRequest['travelers'] = [];
  let travelerId = 1;
  
  // Add adults first and keep track of their IDs for infant association
  const adultIds: string[] = [];
  for (let i = 0; i < params.passengers.adults; i++) {
    const adultId = String(travelerId++);
    adultIds.push(adultId);
    travelers.push({ id: adultId, travelerType: 'ADULT' });
  }
  
  // Add children
  for (let i = 0; i < params.passengers.children; i++) {
    travelers.push({ id: String(travelerId++), travelerType: 'CHILD' });
  }
  
  // Add infants with associated adult IDs
  for (let i = 0; i < params.passengers.infants; i++) {
    const associatedAdultId = adultIds[i % adultIds.length];
    travelers.push({ 
      id: String(travelerId++), 
      travelerType: 'HELD_INFANT',
      associatedAdultId 
    });
  }

  let originDestinations: FlightOffersSearchRequest['originDestinations'] = [];

  if (params.tripType === 'multi-trip' && params.segments) {
    // Multi-trip: use provided segments
    originDestinations = params.segments
      .filter(segment => segment.origin && segment.destination && segment.departureDate)
      .map((segment, index) => ({
        id: String(index + 1),
        originLocationCode: segment.origin.iataCode.toUpperCase(),
        destinationLocationCode: segment.destination.iataCode.toUpperCase(),
        departureDateTimeRange: { date: segment.departureDate.slice(0, 10) }
      }));
  } else if (params.tripType === 'one-way' && params.origin && params.destination && params.departureDate) {
    // One-way trip
    originDestinations = [{
      id: '1',
      originLocationCode: params.origin.iataCode.toUpperCase(),
      destinationLocationCode: params.destination.iataCode.toUpperCase(),
      departureDateTimeRange: { date: params.departureDate.slice(0, 10) }
    }];
  } else if (params.tripType === 'return' && params.origin && params.destination && params.departureDate && params.returnDate) {
    // Return trip
    originDestinations = [
      {
        id: '1',
        originLocationCode: params.origin.iataCode.toUpperCase(),
        destinationLocationCode: params.destination.iataCode.toUpperCase(),
        departureDateTimeRange: { date: params.departureDate.slice(0, 10) }
      },
      {
        id: '2',
        originLocationCode: params.destination.iataCode.toUpperCase(),
        destinationLocationCode: params.origin.iataCode.toUpperCase(),
        departureDateTimeRange: { date: params.returnDate.slice(0, 10) }
      }
    ];
  }

  const originDestinationIds = originDestinations.map(od => od.id);

  return {
    currencyCode: params.currency || 'NGN',
    originDestinations,
    travelers,
    sources: ['GDS'],
    searchCriteria: {
      maxFlightOffers: params.maxOffers || 50,
      flightFilters: {
        cabinRestrictions: [{
          cabin: params.travelClass,
          coverage: 'MOST_SEGMENTS',
          originDestinationIds,
        }],
      },
    },
  };
}

export function formatFlightOfferMarkdown(offer: FlightOffer, index: number): string {
  const price = offer.price;
  const currency = price.currency;
  const totalPrice = parseFloat(price.total);
  
  let markdown = `## ${index + 1}. ${currency} ${totalPrice.toLocaleString()}\n\n`;
  
  offer.itineraries.forEach((itinerary, itinIndex) => {
    const direction = itinIndex === 0 ? 'Outbound' : 'Return';
    markdown += `**${direction} Journey** (${itinerary.duration || 'N/A'})\n`;
    
    itinerary.segments.forEach((segment, segIndex) => {
      const depTime = new Date(segment.departure.at).toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const arrTime = new Date(segment.arrival.at).toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const depDate = new Date(segment.departure.at).toLocaleDateString('en-GB');
      const arrDate = new Date(segment.arrival.at).toLocaleDateString('en-GB');
      
      if (segIndex > 0) {
        markdown += `↓ *Connection*\n`;
      }
      
      markdown += `**${segment.carrierCode}${segment.number}** `;
      markdown += `${segment.departure.iataCode} ${depTime} (${depDate}) → `;
      markdown += `${segment.arrival.iataCode} ${arrTime} (${arrDate})\n`;
      markdown += `*Duration: ${segment.duration || 'N/A'}*\n`;
    });
    
    markdown += '\n';
  });
  
  const stops = offer.itineraries[0]?.segments.length - 1;
  const stopsText = stops === 0 ? 'Direct' : `${stops} stop${stops > 1 ? 's' : ''}`;
  markdown += `**Stops:** ${stopsText}\n`;
  markdown += `**Seats Available:** ${offer.numberOfBookableSeats || 'N/A'}\n`;
  
  if (offer.validatingAirlineCodes?.length) {
    markdown += `**Operated by:** ${offer.validatingAirlineCodes.join(', ')}\n`;
  }
  
  return markdown;
}