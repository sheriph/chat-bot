import type { 
  FlightOffersSearchRequest, 
  Location, 
  Passengers, 
  TripType, 
  TravelClass,
  TripSegment,
  FlightOffer 
} from '@/types/flight-booking';

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

/**
 * Format currency amount with proper formatting
 */
function formatCurrency(amount: string, currency: string): string {
  const numAmount = parseFloat(amount);
  return `${currency} ${numAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Format date and time to readable format
 */
function formatDateTime(isoString: string): { date: string; time: string } {
  const date = new Date(isoString);
  const dateStr = date.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
  const timeStr = date.toLocaleTimeString('en-GB', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  return { date: dateStr, time: timeStr };
}

/**
 * Parse ISO 8601 duration to readable format
 */
function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 'N/A';
  
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  if (minutes) return `${minutes}m`;
  return 'N/A';
}

/**
 * Calculate layover duration between segments
 */
function calculateLayoverDuration(arrivalTime: string, departureTime: string): string {
  const arrival = new Date(arrivalTime);
  const departure = new Date(departureTime);
  const diffMs = departure.getTime() - arrival.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 60) return `${diffMinutes}m`;
  
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Get passenger count summary from traveler pricings
 */
function getPassengerSummary(offer: FlightOffer): string {
  const travelerCounts: { [key: string]: number } = {};
  
  offer.travelerPricings?.forEach(pricing => {
    const type = pricing.travelerType;
    travelerCounts[type] = (travelerCounts[type] || 0) + 1;
  });
  
  const parts: string[] = [];
  if (travelerCounts.ADULT) parts.push(`${travelerCounts.ADULT} Adult${travelerCounts.ADULT > 1 ? 's' : ''}`);
  if (travelerCounts.CHILD) parts.push(`${travelerCounts.CHILD} Child${travelerCounts.CHILD > 1 ? 'ren' : ''}`);
  if (travelerCounts.HELD_INFANT) parts.push(`${travelerCounts.HELD_INFANT} Infant${travelerCounts.HELD_INFANT > 1 ? 's' : ''}`);
  
  return parts.join(', ');
}

/**
 * Get airline name mapping (common airline codes to names)
 */
function getAirlineName(code: string): string {
  const airlines: Record<string, string> = {
    'AA': 'American Airlines',
    'BA': 'British Airways',
    'EK': 'Emirates',
    'QR': 'Qatar Airways',
    'AF': 'Air France',
    'KL': 'KLM',
    'LH': 'Lufthansa',
    'TK': 'Turkish Airlines',
    'EY': 'Etihad Airways',
    'SV': 'Saudi Arabian Airlines',
    'MS': 'EgyptAir',
    'ET': 'Ethiopian Airlines',
    'KQ': 'Kenya Airways',
    'SA': 'South African Airways',
    'UX': 'Air Europa',
    'IB': 'Iberia',
    'AZ': 'Alitalia',
    'OS': 'Austrian Airlines',
    'SN': 'Brussels Airlines',
    'TP': 'TAP Air Portugal',
    'DL': 'Delta Air Lines',
    'UA': 'United Airlines',
    'AC': 'Air Canada',
    'VS': 'Virgin Atlantic',
    'WF': 'Widerøe',
    'AT': 'Royal Air Maroc'
  };
  
  return airlines[code] || code;
}

/**
 * Get city/location name from IATA code
 */
function getLocationName(code: string): string {
  const locations: Record<string, string> = {
    'LOS': 'Lagos',
    'ABV': 'Abuja',
    'KAN': 'Kano',
    'PHC': 'Port Harcourt',
    'LHR': 'London Heathrow',
    'LGW': 'London Gatwick',
    'STN': 'London Stansted',
    'LTN': 'London Luton',
    'LON': 'London',
    'MAN': 'Manchester',
    'EDI': 'Edinburgh',
    'GLA': 'Glasgow',
    'JFK': 'New York JFK',
    'LGA': 'New York LaGuardia',
    'EWR': 'New York Newark',
    'NYC': 'New York',
    'LAX': 'Los Angeles',
    'ORD': 'Chicago',
    'DFW': 'Dallas',
    'YYZ': 'Toronto',
    'YVR': 'Vancouver',
    'YUL': 'Montreal',
    'SYD': 'Sydney',
    'MEL': 'Melbourne',
    'CDG': 'Paris Charles de Gaulle',
    'ORY': 'Paris Orly',
    'PAR': 'Paris',
    'FRA': 'Frankfurt',
    'MUC': 'Munich',
    'AMS': 'Amsterdam',
    'FCO': 'Rome Fiumicino',
    'MXP': 'Milan Malpensa',
    'BCN': 'Barcelona',
    'MAD': 'Madrid',
    'LIS': 'Lisbon',
    'ZUR': 'Zurich',
    'VIE': 'Vienna',
    'CPH': 'Copenhagen',
    'ARN': 'Stockholm',
    'OSL': 'Oslo',
    'HEL': 'Helsinki',
    'DXB': 'Dubai',
    'DOH': 'Doha',
    'AUH': 'Abu Dhabi',
    'CAI': 'Cairo',
    'ADD': 'Addis Ababa',
    'NBO': 'Nairobi',
    'CPT': 'Cape Town',
    'JNB': 'Johannesburg',
    'CMN': 'Casablanca',
    'TUN': 'Tunis',
    'ALG': 'Algiers',
    'IST': 'Istanbul',
    'SAW': 'Istanbul Sabiha Gokcen'
  };
  
  return locations[code] || code;
}

export function formatFlightOfferMarkdown(offer: FlightOffer, index: number): string {
  const price = offer.price;
  const formattedPrice = formatCurrency(price.total, price.currency);
  const passengerSummary = getPassengerSummary(offer);
  
  // Format ID with leading zeros
  const offerId = String(index + 1).padStart(3, '0');
  
  // Get airline from validating airline codes
  const airlineCode = offer.validatingAirlineCodes?.[0] || 'N/A';
  const airlineName = getAirlineName(airlineCode);
  
  let markdown = `## ID: ${offerId} - ${formattedPrice}\n\n`;
  markdown += `**Airline:** ${airlineName} (${airlineCode})\n`;
  
  offer.itineraries.forEach((itinerary, itinIndex) => {
    const itineraryLabel = offer.itineraries.length > 1 
      ? (itinIndex === 0 ? 'Outbound' : 'Return')
      : 'Journey';
    
    markdown += `\n**${itineraryLabel}:**\n`;
    
    // Process segments
    itinerary.segments.forEach((segment, segIndex) => {
      const dep = formatDateTime(segment.departure.at);
      const arr = formatDateTime(segment.arrival.at);
      const duration = formatDuration(segment.duration || '');
      
      const depLocation = getLocationName(segment.departure.iataCode);
      const arrLocation = getLocationName(segment.arrival.iataCode);
      const flightAirline = getAirlineName(segment.carrierCode);
      
      // Flight segment with location names
      markdown += `${depLocation} (${segment.departure.iataCode}) ${dep.date} ${dep.time} → `;
      markdown += `${arrLocation} (${segment.arrival.iataCode}) ${arr.date} ${arr.time}`;
      
      if (segment.departure.terminal || segment.arrival.terminal) {
        const terminals = [];
        if (segment.departure.terminal) terminals.push(`T${segment.departure.terminal}`);
        if (segment.arrival.terminal) terminals.push(`T${segment.arrival.terminal}`);
        markdown += ` [${terminals.join(' → ')}]`;
      }
      
      markdown += `\n*Flight: ${flightAirline} ${segment.carrierCode}${segment.number} • Duration: ${duration}*\n`;
      
      // Add aircraft type if available
      if (segment.aircraft?.code) {
        markdown += `*Aircraft: ${segment.aircraft.code}*\n`;
      }
      
      // Check for layover to next segment
      if (segIndex < itinerary.segments.length - 1) {
        const nextSegment = itinerary.segments[segIndex + 1];
        const layoverDuration = calculateLayoverDuration(segment.arrival.at, nextSegment.departure.at);
        const layoverCity = getLocationName(segment.arrival.iataCode);
        markdown += `**Stop Over:** ${layoverCity} (${segment.arrival.iataCode}) for ${layoverDuration}\n\n`;
      }
    });
    
    // Itinerary summary
    const totalDuration = formatDuration(itinerary.duration || '');
    const stops = itinerary.segments.length - 1;
    const stopsText = stops === 0 ? 'Direct' : `${stops} stop${stops > 1 ? 's' : ''}`;
    
    markdown += `*Total Duration: ${totalDuration} • ${stopsText}*\n`;
  });
  
  markdown += `\n**Passengers:** ${passengerSummary}\n`;
  markdown += `**Seats Available:** ${offer.numberOfBookableSeats || 'Limited'}\n`;
  
  // Add fare details if available
  if (offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]) {
    const fareDetails = offer.travelerPricings[0].fareDetailsBySegment[0];
    const cabin = fareDetails.cabin?.toLowerCase().replace('_', ' ');
    if (cabin) {
      markdown += `**Cabin Class:** ${cabin.charAt(0).toUpperCase() + cabin.slice(1)}\n`;
    }
    if (fareDetails.brandedFareLabel) {
      markdown += `**Fare Type:** ${fareDetails.brandedFareLabel}\n`;
    }
  }
  
  // Add baggage information if available
  const firstTraveler = offer.travelerPricings?.[0];
  if (firstTraveler?.fareDetailsBySegment?.[0]) {
    const fareSegment = firstTraveler.fareDetailsBySegment[0];
    const checkedBags = fareSegment.includedCheckedBags?.quantity || 0;
    const cabinBags = fareSegment.includedCabinBags?.quantity || 0;
    
    markdown += `**Baggage:** ${checkedBags} checked bag${checkedBags !== 1 ? 's' : ''}, ${cabinBags} cabin bag${cabinBags !== 1 ? 's' : ''}\n`;
  }
  
  // Add price breakdown if available
  if (offer.price.base && parseFloat(offer.price.base) !== parseFloat(offer.price.total)) {
    const baseFare = formatCurrency(offer.price.base, offer.price.currency);
    const taxes = parseFloat(offer.price.total) - parseFloat(offer.price.base);
    const formattedTaxes = formatCurrency(taxes.toString(), offer.price.currency);
    markdown += `**Price Breakdown:** Base fare ${baseFare} + Taxes ${formattedTaxes}\n`;
  }
  
  // Add booking deadline if available
  if (offer.lastTicketingDate) {
    const deadline = formatDateTime(offer.lastTicketingDate + 'T23:59:59').date;
    markdown += `**Booking Deadline:** ${deadline}\n`;
  }
  
  // Log the markdown for debugging
  console.log(`\n=== FLIGHT OFFER ${index + 1} MARKDOWN ===`);
  console.log(markdown);
  console.log(`=== END FLIGHT OFFER ${index + 1} ===\n`);
  
  return markdown;
}