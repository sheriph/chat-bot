export interface InstitutionAddress {
  country?: string;
}

export interface Institution {
  name: string;
  slug: string;
  logoUrl: string;
  address: InstitutionAddress;
}

export interface CourseProgram {
  name: string;
  status: string;
  refId: string;
  slug: string;
  edpRefId: string;
  departments: null;
  courseLevel: string;
  courseSummary: null;
  approxAnnualFee: string; // stored as string in dataset
  expressOffer: boolean;
  currency: string;
  englishTests: any[];
  tags: any[];
  categories: string[];
  awardCategories: string[];
  subjects: string[];
  degreeAwarded: null;
  institution: Institution;
  detailPageUrl: string;
  urlConstructionSuccess: boolean;
  uploadTimestamp: Date;
  batchNumber: number;
  discipline?: string | null; // may be present

  // Enhanced scraped content fields (all optional)
  courseOverview?: string; // Detailed course description
  programHighlights?: string; // Possibly HTML formatted highlights
  requirements?: string; // Entry requirements text
  scrapedTuitionFees?: string; // Tuition fee as scraped (may include commas / formatting)
  scrapedDuration?: string; // e.g. "1 year"
  scrapedCampus?: string; // Campus location
  scrapedStudyMode?: string; // e.g. "Full Time"
  scrapedStartDate?: string; // e.g. "Sep 2026"
  scrapedCourseName?: string; // Raw scraped course name
  scrapedInstitutionName?: string; // Raw scraped institution name
  hasScrapedData?: boolean; // Flag indicating enrichment present
}

export interface MongoCourseProgram extends CourseProgram {
  _id: string;
}

export interface CourseSearchCriteria {
  country?: string;
  courseLevel?: string;
  institutionSlug?: string;
  subjects?: string[];
  categories?: string[];
  feeRange?: { min?: number; max?: number; currency?: string };
  nameSearch?: string;
  expressOfferOnly?: boolean;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  docs: number;
  totalDocs: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage: number | null;
  prevPage: number | null;
  offset: number;
  pagingCounter: number;
}

export interface CourseListResponse {
  courses: CourseProgram[];
  pagination: PaginationMeta;
  filters: CourseSearchCriteria;
  executionTime: number;
}

export interface FacetCount { value: string; count: number }

export interface AggregationResponse {
  byCountry: FacetCount[];
  byCourseLevel: FacetCount[];
  topSubjects: FacetCount[];
}
