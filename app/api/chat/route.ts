import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, streamText, type UIMessage, tool, stepCountIs } from "ai";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";

export const maxDuration = 30;

const deepinfra = createOpenAICompatible({
  name: "deepinfra",
  apiKey: process.env.DEEPINFRA_API_KEY!,
  baseURL: "https://api.deepinfra.com/v1/openai",
});

// Available options for dropdowns - NGabroad partner institutions
const COUNTRIES = [
  "United Kingdom", "United States", "Canada", "New Zealand", "Australia",
  "Ireland", "Germany", "France", "Switzerland", "United Arab Emirates",
  "Poland", "Spain", "Cyprus", "Italy", "Grenada", "Netherlands",
  "Malaysia", "Mauritius", "Hungary", "Monaco", "Guyana", "Slovenia"
];

const DISCIPLINES = [
  "Business & Management", "Social Sciences & Law", "Arts & Humanities",
  "Health & Medicine", "Natural & Physical Sciences", "Engineering & Technology",
  "Creative Arts & Design", "Computer Science & IT", "Education",
  "Media & Communications", "Agriculture & Environmental Science", "Sports Science",
  "Hospitality & Tourism", "Architecture & Construction", "Aviation & Aerospace",
  "Theology & Religious Studies"
];

const COURSE_LEVELS = [
  "Undergraduate", "Postgraduate", "Doctorate", "Foundation",
  "PreMasters", "Language", "PresessionalEnglish", "ProfessionalShortCourse"
];

/**
 * NGabroad Course Program Interface
 * Represents academic programs from NGabroad partner institutions
 */
interface CourseProgram {
  name: string; // "MSc International Accounting and Finance"
  status: string; // "None"
  slug: string; // "msc-international-accounting-and-finance"
  edpRefId: string; // "aston-university"
  departments: null; // Always null in dataset
  courseLevel: string; // "Postgraduate", "Undergraduate", "Doctorate"
  courseSummary: null; // Always null in dataset
  approxAnnualFee: string; // "23500"
  expressOffer: boolean; // true
  currency: string; // "GBP", "USD", "EUR", "AUD"
  englishTests: any[]; // []
  tags: any[]; // []
  categories: string[]; // ["international", "accounting", "finance"]
  awardCategories: string[]; // ["msc"]
  subjects: string[]; // ["accounting", "finance"]
  degreeAwarded: null; // Always null in dataset
  institution: {
    name: string; // "Aston University"
    slug: string; // "aston-university"
    logoUrl: string; // "live/images/institutions/aston-university-logo.svg"
    address: {
      country?: string; // "United Kingdom"
    };
  };
  detailPageUrl: string; // "https://edvoy.com/institutions/aston-university/postgraduate/msc-international-accounting-and-finance"
  urlConstructionSuccess: boolean; // true
  discipline?: string | null; // "Business & Management"
}

const tools = {
  searchPrograms: tool({
    description: 'Search for study abroad programs and courses from universities worldwide. Use this tool when students ask about programs, courses, universities, or study options.',
    inputSchema: z.object({
      discipline: z.enum([
        "Business & Management", "Social Sciences & Law", "Arts & Humanities",
        "Health & Medicine", "Natural & Physical Sciences", "Engineering & Technology",
        "Creative Arts & Design", "Computer Science & IT", "Education",
        "Media & Communications", "Agriculture & Environmental Science", "Sports Science",
        "Hospitality & Tourism", "Architecture & Construction", "Aviation & Aerospace",
        "Theology & Religious Studies"
      ]).describe('Academic discipline/field of study - select the most relevant discipline'),
      country: z.enum([
        "United Kingdom", "United States", "Canada", "New Zealand", "Australia",
        "Ireland", "Germany", "France", "Switzerland", "United Arab Emirates",
        "Poland", "Spain", "Cyprus", "Italy", "Grenada", "Netherlands",
        "Malaysia", "Mauritius", "Hungary", "Monaco", "Guyana", "Slovenia"
      ]).describe('Country where the institution is located - select the target study destination'),
      courseLevel: z.enum([
        "Undergraduate", "Postgraduate", "Doctorate", "Foundation",
        "PreMasters", "Language", "PresessionalEnglish", "ProfessionalShortCourse"
      ]).describe('Level of study - select the appropriate academic level'),
      institutionName: z.string().optional().describe('Specific institution name to search for (e.g., "Harvard University", "Oxford University")'),
      courseName: z.string().optional().describe('Specific course name or keywords to search in course titles (e.g., "Computer Science", "MBA")'),
      minFee: z.number().optional().describe('Minimum annual fee amount'),
      maxFee: z.number().optional().describe('Maximum annual fee amount'),
      subjects: z.string().optional().describe('Subject keywords to search for (e.g., "accounting", "finance", "engineering")'),
      expressOffer: z.boolean().optional().describe('Filter for programs with express/fast-track admission only'),
      page: z.number().describe('Page number for pagination (required for browsing results)'),
      limit: z.literal(8).describe('Number of results per page (fixed at 8)')
    }),
    execute: async (params) => {
      try {
        // Log the search parameters for debugging
        console.log('=== searchPrograms Tool Called ===');
        console.log('Search Parameters:', JSON.stringify(params, null, 2));
        
        const db = await getDb('NGabroad');
        const col = db.collection('programs');

        const page = Math.max(1, params.page || 1);
        const limit = 8; // Fixed at 8 results per page
        const offset = (page - 1) * limit;

        const match: any = {};
        
        // Build MongoDB match filters
        if (params.discipline) {
          match['discipline'] = { $regex: params.discipline, $options: 'i' };
        }
        if (params.country) {
          match['institution.address.country'] = { $regex: params.country, $options: 'i' };
        }
        if (params.courseLevel) {
          match['courseLevel'] = params.courseLevel;
        }
        if (params.institutionName) {
          match['institution.name'] = { $regex: params.institutionName, $options: 'i' };
        }
        if (params.courseName) {
          match['name'] = { $regex: params.courseName, $options: 'i' };
        }
        if (params.subjects) {
          match['subjects'] = { $elemMatch: { $regex: params.subjects, $options: 'i' } };
        }
        if (params.expressOffer !== undefined) {
          match['expressOffer'] = params.expressOffer;
        }
        if (params.minFee || params.maxFee) {
          const feeFilter: any = {};
          if (params.minFee) feeFilter.$gte = String(params.minFee);
          if (params.maxFee) feeFilter.$lte = String(params.maxFee);
          if (Object.keys(feeFilter).length) match['approxAnnualFee'] = feeFilter;
        }

        const pipeline = [
          { $match: match },
          { $sort: { uploadTimestamp: -1, _id: 1 } },
          {
            $facet: {
              docs: [
                { $skip: offset },
                { $limit: limit },
                {
                  $project: {
                    name: 1,
                    courseLevel: 1,
                    approxAnnualFee: 1,
                    currency: 1,
                    expressOffer: 1,
                    subjects: 1,
                    categories: 1,
                    discipline: 1,
                    'institution.name': 1,
                    'institution.address.country': 1,
                    detailPageUrl: 1,
                    // Enhanced scraped fields
                    courseOverview: 1,
                    programHighlights: 1,
                    requirements: 1,
                    scrapedTuitionFees: 1,
                    scrapedDuration: 1,
                    scrapedCampus: 1,
                    scrapedStudyMode: 1,
                    scrapedStartDate: 1,
                    scrapedCourseName: 1,
                    scrapedInstitutionName: 1,
                    hasScrapedData: 1
                  }
                }
              ],
              totalCount: [{ $count: 'count' }]
            }
          }
        ];

        const [result] = await col.aggregate(pipeline).toArray();
        const docs = result?.docs ?? [];
        const totalDocs = result?.totalCount?.[0]?.count ?? 0;
        const totalPages = Math.max(1, Math.ceil(totalDocs / limit));

        // Log query results for debugging
        console.log(`Query Results - Total: ${totalDocs}, Page: ${page}/${totalPages}, Docs: ${docs.length}`);
        console.log('MongoDB Match Query:', JSON.stringify(match, null, 2));

        // Format results as markdown for the LLM
        const programsMarkdown = docs.map((program: any, index: number) => {
          const parts: string[] = [];
          parts.push(`### ${index + 1}. ${program.name}`);
          parts.push(`**Institution:** ${program.institution?.name || 'N/A'}`);
          parts.push(`**Country:** ${program.institution?.address?.country || 'N/A'}`);
          parts.push(`**Level:** ${program.courseLevel}`);
          parts.push(`**Fee:** ${program.currency} ${program.approxAnnualFee}${program.expressOffer ? ' ⚡ *Express Offer Available*' : ''}`);
          parts.push(`**Discipline:** ${program.discipline || 'N/A'}`);
          parts.push(`**Subjects:** ${program.subjects?.slice(0, 5).join(', ') || 'N/A'}`);

          // Enhanced optional fields (only show if present)
          if (program.scrapedDuration) parts.push(`**Duration:** ${program.scrapedDuration}`);
            else if (program.scrapedStudyMode) parts.push(`**Study Mode:** ${program.scrapedStudyMode}`); // keep duration before mode when both present
          if (program.scrapedStartDate) parts.push(`**Start Date:** ${program.scrapedStartDate}`);
          if (program.scrapedTuitionFees) parts.push(`**Tuition Fees:** ${program.scrapedTuitionFees}`);
          if (program.scrapedCampus) parts.push(`**Campus:** ${program.scrapedCampus}`);
          if (program.courseOverview) parts.push(`**Overview:** ${program.courseOverview.slice(0, 400)}${program.courseOverview.length > 400 ? '…' : ''}`);
          if (program.programHighlights) parts.push(`**Highlights:** ${program.programHighlights.replace(/\n+/g,' ').slice(0, 300)}${program.programHighlights.length > 300 ? '…' : ''}`);
          if (program.requirements) parts.push(`**Requirements:** ${program.requirements.replace(/\n+/g,' ').slice(0, 300)}${program.requirements.length > 300 ? '…' : ''}`);

          if (program.hasScrapedData) parts.push(`**Enriched:** ✅ Scraped enrichment available`);

          return parts.join('\n');
        }).join('\n');

        const paginationInfo = `🎓 **NGabroad Partner Programs Search Results**

**Search Criteria:**
- Discipline: ${params.discipline}
- Country: ${params.country} 
- Study Level: ${params.courseLevel}
${params.institutionName ? `- Institution: ${params.institutionName}` : ''}
${params.courseName ? `- Course Keywords: ${params.courseName}` : ''}
${params.subjects ? `- Subject Keywords: ${params.subjects}` : ''}
${params.minFee || params.maxFee ? `- Fee Range: ${params.minFee ? `${params.minFee}+` : ''} ${params.maxFee ? `- ${params.maxFee}` : ''}` : ''}
${params.expressOffer ? '- Express Offers Only: Yes' : ''}

**Results Summary:**
- **Total Programs Found:** ${totalDocs} matching programs
- **Current Page:** ${page} of ${totalPages}
- **Programs on This Page:** ${docs.length}
`;

        const response = `${paginationInfo}

${programsMarkdown}

${page < totalPages ? `\n💡 **Want to see more options?** 
There are ${totalPages - page} more pages available with ${totalDocs - (page * limit)} additional programs. Just ask me to show you the next page!` : '\n✨ **You\'ve seen all available programs for these criteria!** Would you like to explore different options or get more details about any of these programs?'}`;

        // Log the final markdown response
        console.log('=== Tool Response (Markdown) ===');
        console.log(response);
        console.log('=== End Tool Response ===');

        return response;

      } catch (error) {
        console.error('Error in searchPrograms tool:', error);
        return `Sorry, I encountered an error while searching for programs. Please try again.`;
      }
    }
  }),

  getAggregatedStats: tool({
    description: 'Get statistical information about available programs, countries, disciplines, and course levels. Use this to provide overview statistics or help students understand their options.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        console.log('=== getAggregatedStats Tool Called ===');
        
        const db = await getDb('NGabroad');
        const col = db.collection('programs');

        const pipeline = [
          {
            $facet: {
              byCountry: [
                { $group: { _id: '$institution.address.country', count: { $sum: 1 } } },
                { $project: { _id: 0, country: '$_id', count: 1 } },
                { $sort: { count: -1 } },
                { $limit: 10 }
              ],
              byDiscipline: [
                { $group: { _id: '$discipline', count: { $sum: 1 } } },
                { $project: { _id: 0, discipline: '$_id', count: 1 } },
                { $sort: { count: -1 } },
                { $limit: 10 }
              ],
              byCourseLevel: [
                { $group: { _id: '$courseLevel', count: { $sum: 1 } } },
                { $project: { _id: 0, level: '$_id', count: 1 } },
                { $sort: { count: -1 } }
              ],
              totalPrograms: [
                { $count: 'total' }
              ]
            }
          }
        ];

        const [result] = await col.aggregate(pipeline).toArray();
        const totalPrograms = result?.totalPrograms?.[0]?.total ?? 0;

        const statsMarkdown = `## Study Abroad Database Statistics

**Total Programs Available:** ${totalPrograms.toLocaleString()}

### Top 10 Study Destinations:
${result.byCountry?.map((item: any, i: number) => 
  `${i + 1}. **${item.country}** - ${item.count.toLocaleString()} programs`
).join('\n') || 'No data available'}

### Popular Academic Disciplines:
${result.byDiscipline?.filter((item: any) => item.discipline).map((item: any, i: number) => 
  `${i + 1}. **${item.discipline}** - ${item.count.toLocaleString()} programs`
).join('\n') || 'No data available'}

### Study Levels Available:
${result.byCourseLevel?.map((item: any) => 
  `• **${item.level}** - ${item.count.toLocaleString()} programs`
).join('\n') || 'No data available'}

This database covers programs from universities across 22 countries, offering comprehensive options for international students.`;

        console.log('=== Stats Tool Response (Markdown) ===');
        console.log(statsMarkdown);
        console.log('=== End Stats Tool Response ===');

        return statsMarkdown;
      } catch (error) {
        console.error('Error in getAggregatedStats tool:', error);
        return `Sorry, I couldn't retrieve the statistics at the moment. Please try again.`;
      }
    }
  })
};

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const systemPrompt = `You are Mariam, a trusted study abroad consultant representing NAIJAGOINGABROAD LTD (NGabroad). Your primary mission is to help Nigerian students discover excellent education opportunities at our 44,000+ partner institutions across 22 countries and guide them through the application process.

## Your Role & Business Mission:
- **NGabroad Representative**: You work for NAIJAGOINGABROAD LTD, connecting students with our partner universities
- **Sales-Focused Consultant**: Your goal is to successfully match students with suitable programs from our partner institutions
- **Application Facilitator**: Guide students through our FREE application process and document requirements
- **Trusted Advisor**: Provide comprehensive support on visas, budgeting, and study abroad planning

## Available Study Destinations (22 Countries):
United Kingdom, United States, Canada, Australia, New Zealand, Ireland, Germany, France, Switzerland, United Arab Emirates, Poland, Spain, Cyprus, Italy, Grenada, Netherlands, Malaysia, Mauritius, Hungary, Monaco, Guyana, Slovenia

## Your Consultation Approach:
1. **Understand Student Needs**: Always gather their academic interests, preferred destination, study level, and budget before searching
2. **Present Partner Programs**: Use tools to showcase relevant programs from our partner institutions
3. **Build Confidence**: Highlight program benefits, institution reputation, and career outcomes
4. **Provide Application Guidance**: Detail required documents and our free application service
5. **Close with Next Steps**: Direct interested students to contact our office with their documents

## Application Requirements (General Guidelines):
Based on the program and country, typical requirements include:

**For Undergraduate Programs:**
- Academic transcripts (O'Level & A'Level/WAEC/JAMB)
- Personal statement
- Letters of recommendation (2-3)
- English proficiency test (IELTS/TOEFL) - *WAIVED if you have Credit in O'Level English*
- Passport copy
- CV/Resume

**For Postgraduate Programs:**
- Bachelor's degree transcript
- Personal statement/Statement of Purpose
- Letters of recommendation (2-3)
- English proficiency test (IELTS/TOEFL) - *WAIVED if you have Credit in O'Level English OR BSc taught in English*
- CV/Resume with work experience
- Research proposal (for research programs)
- Passport copy

**For Foundation/Pre-Masters:**
- Academic transcripts
- English proficiency test (IELTS/TOEFL) - *WAIVED if you have Credit in O'Level English*
- Personal statement
- Passport copy

## When Students Show Interest:
"I'm excited that this program interests you! Here's what happens next:

📋 **Required Documents:**
[List specific documents based on program level]

✅ **Our FREE Application Service:**
- No application fees through NGabroad
- Expert guidance throughout the process
- Direct communication with partner universities

📞 **Next Steps:**
Please contact our office with your documents:
- **Email:** admissions@naijagoingabroad.com
- **Phone:** +234-813-XXX-XXXX
- **WhatsApp:** +234-813-XXX-XXXX
- **Office:** Plot 123, Victoria Island, Lagos, Nigeria

Our team will review your documents and submit your application within 48 hours!"

## Additional Support Areas:
- **Visa Guidance**: Provide general visa requirements and process timelines
- **Budget Planning**: Help estimate total costs including tuition, accommodation, living expenses
- **Pre-departure**: Advise on accommodation, travel, and settling in

## Scholarship Policy (Strict):
- You do NOT have scholarship data in our program database.
- Do NOT initiate scholarship discussions or steer the conversation toward scholarships.
- If the student asks about scholarships or funding:
  - Be transparent that specific scholarship information is not available in your data.
  - Ask them to email admissions@naijagoingabroad.com with their profile (program, country, level, budget).
  - Promise only that NGabroad will check current announcements from partner schools and reply; do NOT promise eligibility, percentages, or outcomes.
- Never state or imply scholarship amounts, percentages, names, deadlines, or likelihood.
- Do not fabricate or infer scholarship info from general knowledge.

## Important Guidelines:
- ALL required parameters (discipline, country, courseLevel) must be provided before using searchPrograms tool
- **CRITICAL: Display the COMPLETE tool response exactly as returned** - never truncate, summarize, or reformat the tool output
- **MANDATORY: Show all programs returned** - if tool returns 8 programs, display all 8 with their complete details
- **REQUIRED: Include full pagination information** - always mention total programs found and pages available
- When students ask for "more results" or "next page", increment the page parameter but keep all other search criteria the same
- For pagination requests, use page numbers: start with page 1, then 2, 3, etc.
- Never show detailPageUrl links to students
- **Encourage exploration**: Always suggest viewing more pages OR adding specific filters to narrow results
- Focus on selling the benefits of programs and our service
- Always provide document requirements when students show interest
- Direct interested students to contact our office for applications
- Use your training data to provide visa and budgeting advice (but do NOT fabricate scholarship info)
- Do NOT lead conversations into scholarships; if asked, direct to email and set realistic expectations without promises

## Tool Response Handling:
- **NEVER modify the markdown formatting from tools**
- **NEVER summarize or cherry-pick programs** - show exactly what the tool returns
- **ALWAYS copy the complete pagination information** from the tool response
- **MANDATORY: Include the pagination encouragement** from the tool (e.g., "Want to see more options?")
- After showing tool results, suggest specific ways to refine the search (institution name, course keywords, fee range, express offers)
 - Do NOT insert scholarship claims or suggestions into tool result summaries. If scholarships are mentioned by the student, follow the Scholarship Policy.

## Pagination Rules:
- **First Search**: Always start with page=1
- **Follow-up Requests**: If user asks for "more", "next page", or similar, increment page number
- **Similar Searches**: If search criteria are nearly identical, continue pagination from where you left off
- **New Search**: If criteria change significantly, start fresh with page=1
- **Full Display**: Always show the complete tool response without summarizing or truncating
- **Engagement**: Always remind users they can see more pages or refine their search

## Response Style:
- Enthusiastic and confident about opportunities
- Professional yet warm and approachable  
- Focus on benefits and success stories
- Clear, actionable guidance
- Always close conversations with next steps

## CRITICAL: How to Handle Tool Responses
When you receive a tool response:
1. **Display the ENTIRE response exactly as received** - do not modify, summarize, or reformat
2. **Copy ALL program listings** - if tool shows 8 programs, you must show all 8
3. **Include ALL pagination information** - total programs, current page, pages available
4. **Copy the pagination encouragement** - the "Want to see more options?" message
5. **Add exploration suggestions** after the tool response:
   - "Would you like to see page 2 of these results?"
   - "Want to narrow down by adding specific keywords like 'Finance MBA' or 'Executive MBA'?"
   - "Interested in filtering by fee range or institutions with express offers?"
   - "Need help choosing between these programs? I can provide detailed application guidance!"

## Example of Proper Tool Response Handling:
[SHOW COMPLETE TOOL RESPONSE HERE - ALL PROGRAMS, ALL PAGINATION INFO]

Then add:
"🎯 **What would you like to do next?**
- See more programs (page 2 of 197 available)
- Narrow your search with specific keywords
- Get application guidance for any of these programs
- Learn about visa requirements and budgeting"

Remember: You're representing NGabroad's interests while genuinely helping students achieve their dreams. Build trust, showcase opportunities, and guide them to successful applications through our service!`;

    const result = streamText({
      model: deepinfra("zai-org/GLM-4.5-Air"),
      system: systemPrompt,
      messages: convertToModelMessages(messages),
      temperature: 0.1,
      tools,
      stopWhen: stepCountIs(10),
      onError: (event) => {
        console.error("streamText error:", event.error);
      },
    });

    return result.toUIMessageStreamResponse({ sendReasoning: true });
  } catch (error) {
    console.error("Error in chat route", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
