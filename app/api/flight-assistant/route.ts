import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, streamText, type UIMessage, tool, stepCountIs } from "ai";
import { z } from "zod";
import { buildFlightOffersSearchRequest, parseDate, formatFlightOfferMarkdown } from "@/lib/services/flight-request-builder-simple";
import { searchFlightOffers, getCachedFlightOffers, filterFlightOffers, getRelativeTime, isCacheExpired, getCacheKeyCookie } from "@/lib/services/flight-offers-utils";
import type { TripType, TravelClass, Passengers, TripSegment, Location } from "@/types/flight-booking";


export const maxDuration = 30;

const deepinfra = createOpenAICompatible({
  name: "deepinfra",
  apiKey: process.env.DEEPINFRA_API_KEY!,
  baseURL: "https://api.deepinfra.com/v1/openai",
});

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    // Check cache status for context using cookie
    let cacheContext = '';
    const currentCacheKey = await getCacheKeyCookie();
    if (currentCacheKey) {
      try {
        const cached = await getCachedFlightOffers(currentCacheKey);
        if (cached.success && cached.metadata) {
          const timeAgo = getRelativeTime(cached.metadata.createdAt);
          const expired = isCacheExpired(cached.metadata.createdAt);
          cacheContext = expired 
            ? `\n\n**IMPORTANT**: Last flight search was ${timeAgo} and has EXPIRED. If user wants to filter or see results, you must search for new flights first using getFlightOffers tool.`
            : `\n\n**Cache Status**: Last flight search was ${timeAgo} and is still valid. You can use filterFlightOffers tool to display results.`;
        }
      } catch (error) {
        console.log('Cache check error:', error);
      }
    }

    // Get current date and time for context
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-GB', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const currentTime = now.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZoneName: 'short'
    });

    const systemPrompt = `You are Maya, a professional flight booking assistant. Your primary role is to guide users through flight discovery and selection with careful attention to their needs.

**Current Context:**
- Today is ${currentDate}
- Current time: ${currentTime}
- When users mention dates like "tomorrow", "next week", or "this weekend", calculate based on today's date
- Ensure all flight searches are for future dates only

## BOOKING STAGES

### Stage 1: Flight Searching and Filtering Stage
**YOUR MAIN RESPONSIBILITY**: Lead with clarifying questions and only use tools when you have complete, confirmed information.

**Core Functions:**
1. **Flight Discovery**: Use getFlightOffers tool to search for new flights
2. **Result Filtering**: Use filterFlightOffers tool to refine existing search results  
3. **Information Guidance**: Provide flight details, pricing, and booking recommendations

**CRITICAL WORKFLOW RULES:**

**Before Using ANY Tool - Ask Clarifying Questions:**
- Always determine user intent first: 
  * "Are you looking to search for new flights?"
  * "Would you like to filter your previous search results?"
  * "Do you want to see more results from your last search?"
- Never use tools until you have ALL required parameters
- Never use filterFlightOffers tool unless there's an active previous search

**For NEW Flight Searches:**
1. Gather complete travel details through questions:
   - Origin and destination (confirm IATA codes)
   - Travel dates (departure, return if needed)
   - Number of passengers (adults, children, infants)
   - Travel class preference
   - Trip type (one-way, return, multi-trip)

2. ALWAYS confirm IATA codes before searching:
   - "Lagos" → "Lagos (LOS)"
   - "London" → "London (LON)" (covers all airports) or "London Heathrow (LHR)" if specific
   - "New York" → "New York (NYC)" (covers JFK, LGA, EWR)
   - For cities with multiple airports, prefer city codes (LON, NYC, WAS) unless user specifies airport

3. Only use **getFlightOffers** tool when you have confirmed all parameters
4. After successful search → ALWAYS use **filterFlightOffers** tool to display initial results

**For Filtering/Browsing Existing Results:**
- Use **filterFlightOffers** tool only when previous search exists
- Maintain previous filter options when user requests "next page" or "more results"
- Ask what changes they want before applying new filters
- Continue iterating with questions like:
  * "Would you like to see different airlines?"
  * "Should I show direct flights only?"
  * "Would you prefer to sort by fastest instead of cheapest?"

**CONVERSATION LEADERSHIP:**
- Always lead with questions to clarify user intention
- Don't assume - ask specifically what they want to do
- Guide them through options: "I can help you search for new flights, filter your previous results, or see more options from your last search. What would you prefer?"
- Keep iterating this stage until user selects a specific flight and gives booking decision
- **Use natural language**: Always refer to locations by their full names (London, Madrid, Lagos) and airlines by their full names (British Airways, Air Europa, Qatar Airways) in your responses
- When presenting flight results, describe routes naturally: "London to Madrid" instead of "LON to MAD"

**IATA Code Guidelines:**
- For cities with multiple airports (London: LHR, LGW, STN, LTN), use city codes (LON) unless specific airport requested
- Always confirm with user: "I'll search Lagos (LOS) to London (LON) - does that look correct?"

**Technical Notes:**
- Support one-way, return, and multi-trip journeys
- Use exact Amadeus travel classes: ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST  
- Display 10 results per page with pagination
- Present pricing, duration, stops, and airline information clearly
- **ALWAYS use full location names** (e.g., "London to Madrid" not "LON to MAD")
- **ALWAYS use airline names** (e.g., "British Airways" not "BA", "Air Europa" not "UX")
- Each flight offer should include comprehensive details: price breakdown, baggage allowances, cabin class, fare type, aircraft type, terminal information, and booking deadlines
- Flight offers are numbered with ID format (001, 002, etc.) for easy reference

**Stay in Stage 1** until user explicitly selects a flight option and indicates readiness to proceed with booking.

Stay focused on flight search and booking assistance only.${cacheContext}`;

    // Flight search tool
    const getFlightOffers = tool({
      description: 'Search for flight offers using confirmed IATA codes',
      inputSchema: z.object({
        tripType: z.enum(['one-way', 'return', 'multi-trip']).describe('Type of trip'),
        origin: z.string().optional().describe('Departure airport IATA code (3-letter code like LOS, LON, NYC) - not needed for multi-trip'),
        destination: z.string().optional().describe('Destination airport IATA code (3-letter code like LOS, LON, NYC) - not needed for multi-trip'),
        departureDate: z.string().optional().describe('Departure date in YYYY-MM-DD format - not needed for multi-trip'),
        returnDate: z.string().optional().describe('Return date in YYYY-MM-DD format (required for return trips)'),
        segments: z.array(z.object({
          origin: z.string().describe('Origin airport IATA code for this segment (3-letter code)'),
          destination: z.string().describe('Destination airport IATA code for this segment (3-letter code)'),
          departureDate: z.string().describe('Departure date for this segment in YYYY-MM-DD format')
        })).optional().describe('Flight segments for multi-trip'),
        adults: z.number().min(1).default(1).describe('Number of adult passengers'),
        children: z.number().min(0).default(0).describe('Number of child passengers (2-11 years)'),
        infants: z.number().min(0).default(0).describe('Number of infant passengers (under 2 years)'),
        travelClass: z.enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']).default('ECONOMY').describe('Cabin class preference'),
        currency: z.string().default('NGN').describe('Preferred currency for pricing'),
        maxOffers: z.number().default(50).describe('Maximum number of offers to return')
      }),
      execute: async (params) => {
        try {
          let searchParams;
          const passengers: Passengers = {
            adults: params.adults,
            children: params.children,
            infants: params.infants
          };

          if (params.tripType === 'multi-trip') {
            if (!params.segments || params.segments.length === 0) {
              return {
                success: false,
                error: 'Multi-trip requires segments with origin, destination, and departure date for each leg',
                searchCriteria: params
              };
            }

            const tripSegments: TripSegment[] = [];
            for (const segment of params.segments) {
              // Validate IATA codes (3-letter format)
              if (!/^[A-Z]{3}$/.test(segment.origin.toUpperCase())) {
                return {
                  success: false,
                  error: `Invalid origin IATA code: ${segment.origin}. Use 3-letter codes like LOS, LON, NYC`,
                  searchCriteria: params
                };
              }
              
              if (!/^[A-Z]{3}$/.test(segment.destination.toUpperCase())) {
                return {
                  success: false,
                  error: `Invalid destination IATA code: ${segment.destination}. Use 3-letter codes like LOS, LON, NYC`,
                  searchCriteria: params
                };
              }

              const depDate = parseDate(segment.departureDate);
              if (!depDate) {
                return {
                  success: false,
                  error: `Invalid departure date: ${segment.departureDate}. Use YYYY-MM-DD format.`,
                  searchCriteria: params
                };
              }

              tripSegments.push({
                origin: { iataCode: segment.origin.toUpperCase(), name: '', city: '', country: '' },
                destination: { iataCode: segment.destination.toUpperCase(), name: '', city: '', country: '' },
                departureDate: depDate
              });
            }

            searchParams = {
              tripType: params.tripType as TripType,
              segments: tripSegments,
              passengers,
              travelClass: params.travelClass as TravelClass,
              currency: params.currency,
              maxOffers: params.maxOffers
            };
          } else {
            // One-way or return trip
            if (!params.origin || !params.destination || !params.departureDate) {
              return {
                success: false,
                error: 'Origin, destination, and departure date are required for one-way and return trips',
                searchCriteria: params
              };
            }

            // Validate IATA codes
            if (!/^[A-Z]{3}$/.test(params.origin.toUpperCase())) {
              return {
                success: false,
                error: `Invalid origin IATA code: ${params.origin}. Use 3-letter codes like LOS, LON, NYC`,
                searchCriteria: params
              };
            }
            
            if (!/^[A-Z]{3}$/.test(params.destination.toUpperCase())) {
              return {
                success: false,
                error: `Invalid destination IATA code: ${params.destination}. Use 3-letter codes like LOS, LON, NYC`,
                searchCriteria: params
              };
            }

            const departureDate = parseDate(params.departureDate);
            if (!departureDate) {
              return {
                success: false,
                error: `Invalid departure date: ${params.departureDate}. Use YYYY-MM-DD format.`,
                searchCriteria: params
              };
            }

            let returnDate: string | undefined;
            if (params.tripType === 'return') {
              if (!params.returnDate) {
                return {
                  success: false,
                  error: 'Return date is required for return trips.',
                  searchCriteria: params
                };
              }
              const parsedReturnDate = parseDate(params.returnDate);
              if (!parsedReturnDate) {
                return {
                  success: false,
                  error: `Invalid return date: ${params.returnDate}. Use YYYY-MM-DD format.`,
                  searchCriteria: params
                };
              }
              returnDate = parsedReturnDate;
            }

            searchParams = {
              tripType: params.tripType as TripType,
              origin: { iataCode: params.origin.toUpperCase(), name: '', city: '', country: '' },
              destination: { iataCode: params.destination.toUpperCase(), name: '', city: '', country: '' },
              departureDate,
              returnDate,
              passengers,
              travelClass: params.travelClass as TravelClass,
              currency: params.currency,
              maxOffers: params.maxOffers
            };
          }

          const searchRequest = buildFlightOffersSearchRequest(searchParams);
          const result = await searchFlightOffers(searchRequest);

          if (!result.success) {
            return {
              success: false,
              error: result.error || 'Flight search failed',
              searchCriteria: params
            };
          }
          
          return {
            success: true,
            message: `Found ${result.data?.data?.length || 0} flight offers. Use the filterFlightOffers tool to get results.`,
            offersCount: result.data?.data?.length || 0,
            searchCriteria: params
          };
        } catch (error) {
          console.error('Flight search error:', error);
          return {
            success: false,
            error: 'Unable to search flights at the moment. Please try again later.',
            searchCriteria: params
          };
        }
      }
    });

    // Flight filter tool
    const filterFlightOffersTool = tool({
      description: 'Filter and display flight offers from the cached search results',
      inputSchema: z.object({
        airlines: z.array(z.string()).optional().describe('Filter by airline codes (e.g., ["BA", "EK"])'),
        sortBy: z.enum(['cheapest', 'fastest', 'earliest']).default('cheapest').describe('Sort offers by criteria'),
        stops: z.enum(['nonstop', '1-stop', '2+-stops', 'any']).default('any').describe('Filter by number of stops'),
        page: z.number().min(1).default(1).describe('Page number for pagination (10 results per page)'),
        limit: z.number().min(1).max(20).default(10).describe('Number of results to display per page')
      }),
      execute: async (params) => {
        try {
          const currentCacheKey = await getCacheKeyCookie();
          if (!currentCacheKey) {
            return {
              success: false,
              error: 'No flight search results available. Please search for flights first using the getFlightOffers tool.',
              filterCriteria: params
            };
          }

          const cached = await getCachedFlightOffers(currentCacheKey);
          
          if (!cached.success || !cached.data) {
            return {
              success: false,
              error: 'Cached flight offers not found or expired. Please search for new flights using the getFlightOffers tool.',
              filterCriteria: params
            };
          }

          let allOffers = cached.data.data || [];
          
          // Apply filters using the utility function
          const filteredOffers = filterFlightOffers(allOffers, {
            airlines: params.airlines,
            stops: params.stops === 'any' ? undefined : params.stops,
            sortBy: params.sortBy
          });

          if (filteredOffers.length === 0) {
            return {
              success: true,
              message: 'No flight offers match your current filters. Try adjusting your search criteria.',
              offersMarkdown: '',
              pagination: { page: 1, totalPages: 0, total: 0, limit: params.limit },
              filterCriteria: params
            };
          }

          // Apply pagination
          const totalOffers = filteredOffers.length;
          const totalPages = Math.ceil(totalOffers / params.limit);
          const startIndex = (params.page - 1) * params.limit;
          const endIndex = startIndex + params.limit;
          const paginatedOffers = filteredOffers.slice(startIndex, endIndex);

          // Format offers as markdown
          const offersMarkdown = paginatedOffers.map((offer, index) => 
            formatFlightOfferMarkdown(offer, startIndex + index)
          ).join('\n\n');

          const paginationInfo = totalPages > 1 ? 
            `\n\n📄 **Page ${params.page} of ${totalPages}** (${totalOffers} total offers matching filters)` : 
            `\n\n📊 **${totalOffers} total offers found**`;

          return {
            success: true,
            message: `Here are your flight options (sorted by ${params.sortBy}):`,
            offersMarkdown: offersMarkdown + paginationInfo,
            pagination: {
              page: params.page,
              totalPages,
              total: totalOffers,
              limit: params.limit
            },
            filterCriteria: params
          };
        } catch (error) {
          console.error('Flight filter error:', error);
          return {
            success: false,
            error: 'Unable to retrieve flight offers at the moment. Please try searching again.',
            filterCriteria: params
          };
        }
      }
    });

    const result = streamText({
      model: deepinfra("zai-org/GLM-4.5-Air"),
      system: systemPrompt,
      messages: convertToModelMessages(messages),
      temperature: 0.1,
      tools: {
        getFlightOffers,
        filterFlightOffers: filterFlightOffersTool,
      },
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse({ sendReasoning: true });
  } catch (error) {
    console.error("Error in flight assistant route", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}