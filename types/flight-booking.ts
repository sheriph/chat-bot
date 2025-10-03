// Flight Booking Types for Amadeus Integration

export type TravelerType = 'ADULT' | 'CHILD' | 'HELD_INFANT' | 'SEATED_INFANT';
export type TravelClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
export type TripType = 'one-way' | 'return' | 'multi-trip';

export interface Location {
  iataCode: string;
  name: string;
  city?: string;
  country?: string;
}

export interface Passengers {
  adults: number;
  children: number;
  infants: number;
}

export interface TripSegment {
  origin: Location;
  destination: Location;
  departureDate: string;
}

// Amadeus Flight Offers Search request types
export interface FlightOffersSearchRequest {
  currencyCode?: string;
  originDestinations: Array<{
    id: string;
    originLocationCode: string; // IATA
    destinationLocationCode: string; // IATA
    departureDateTimeRange: { date: string }; // YYYY-MM-DD
  }>;
  travelers: Array<{ 
    id: string; 
    travelerType: TravelerType;
    associatedAdultId?: string; // Required for HELD_INFANT
  }>;
  sources?: string[]; // e.g., ['GDS']
  searchCriteria?: {
    maxFlightOffers?: number;
    flightFilters?: {
      cabinRestrictions?: Array<{
        cabin: TravelClass;
        coverage: 'MOST_SEGMENTS' | 'ALL_SEGMENTS';
        originDestinationIds: string[];
      }>;
    };
  };
}

// Flight Offers Response Types
export interface FlightOffersResponse {
  meta?: { count?: number };
  data: FlightOffer[];
  dictionaries?: {
    locations?: Record<string, AirportLocationDetail>;
    aircraft?: Record<string, string>;
    currencies?: Record<string, string>;
    carriers?: Record<string, string>; // mapping IATA code -> readable name
  };
  metadata?: {
    createdAt: string;
    expiresAt: string;
    ttlSeconds: number;
  };
}

export interface AirportLocationDetail {
  meta?: { links?: { self?: string } };
  data: AirportLocationData;
}

export interface AirportLocationData {
  type: 'location';
  subType: 'AIRPORT' | string;
  name: string; // airport name
  detailedName?: string;
  id: string; // Amadeus location id, e.g., 'AMAD'
  self?: { href?: string; methods?: string[] };
  timeZoneOffset?: string;
  iataCode: string; // e.g., 'MAD'
  geoCode?: { latitude: number; longitude: number };
  address?: {
    cityName?: string;
    cityCode?: string;
    countryName?: string;
    countryCode?: string;
    regionCode?: string;
  };
  analytics?: { travelers?: { score?: number } };
}

export interface FlightOffer {
  type: 'flight-offer';
  id: string;
  source: string;
  instantTicketingRequired?: boolean;
  nonHomogeneous?: boolean;
  oneWay?: boolean;
  isUpsellOffer?: boolean;
  lastTicketingDate?: string;
  lastTicketingDateTime?: string;
  numberOfBookableSeats?: number;
  itineraries: Itinerary[];
  price: Price;
  pricingOptions?: {
    fareType?: string[];
    includedCheckedBagsOnly?: boolean;
  };
  validatingAirlineCodes?: string[];
  travelerPricings?: TravelerPricing[];
}

export interface Itinerary {
  duration?: string; // ISO8601 duration
  segments: FlightSegment[];
}

export interface FlightSegment {
  departure: { iataCode: string; terminal?: string; at: string };
  arrival: { iataCode: string; terminal?: string; at: string };
  carrierCode: string;
  number: string;
  aircraft?: { code: string };
  operating?: { carrierCode?: string; carrierName?: string };
  duration?: string; // ISO8601 duration
  id?: string;
  numberOfStops?: number;
  blacklistedInEU?: boolean;
}

export interface Price {
  currency: string;
  total: string;
  base?: string;
  fees?: Array<{ amount: string; type: string }>;
  grandTotal?: string;
}

export interface TravelerPricing {
  travelerId: string;
  fareOption?: string;
  travelerType: 'ADULT' | 'CHILD' | 'HELD_INFANT' | 'SEATED_INFANT' | string;
  price: { currency: string; total: string; base?: string };
  fareDetailsBySegment?: Array<{
    segmentId: string;
    cabin?: string;
    fareBasis?: string;
    brandedFare?: string;
    brandedFareLabel?: string;
    class?: string;
    includedCheckedBags?: { quantity?: number };
    includedCabinBags?: { quantity?: number };
    amenities?: Array<{ description: string; isChargeable: boolean; amenityType: string; amenityProvider?: { name?: string } }>
  }>;
}

// Filter options for flight offers
export interface FlightFilterOptions {
  airlines?: string[];
  sortBy?: 'cheapest' | 'fastest' | 'earliest' | 'latest';
  stops?: 'nonstop' | '1-stop' | '2+-stops' | 'any';
  maxPrice?: number;
  minPrice?: number;
  departureTimeRange?: {
    from?: string; // HH:MM
    to?: string; // HH:MM
  };
  arrivalTimeRange?: {
    from?: string; // HH:MM
    to?: string; // HH:MM
  };
  page?: number;
  limit?: number;
}