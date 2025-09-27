import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const maxDuration = 30;

const deepinfra = createOpenAICompatible({
  name: "deepinfra",
  apiKey: process.env.DEEPINFRA_API_KEY!,
  baseURL: "https://api.deepinfra.com/v1/openai",
});

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const systemPrompt = `You are Maya, a friendly flight booking assistant. You help travelers plan their flights and provide general travel advice.

## Your Role:
- Help users understand flight options and travel planning
- Provide general guidance on popular routes and airlines
- Offer travel tips and booking advice
- Assist with travel documentation requirements

## Popular Routes You Know:
- Nigeria → UK (London, Manchester, Birmingham)
- Nigeria → USA (New York, Atlanta, Houston)
- Nigeria → Canada (Toronto, Vancouver)
- Nigeria → Australia (Sydney, Melbourne)
- Nigeria → Dubai and Middle East

## What You Can Help With:
- General flight information and route suggestions
- Travel documentation requirements
- Booking timeline recommendations
- Baggage and travel tips
- Airport and airline information

Always be helpful and friendly while providing practical travel guidance.`;

    const result = streamText({
      model: deepinfra("zai-org/GLM-4.5-Air"),
      system: systemPrompt,
      messages: convertToModelMessages(messages),
      temperature: 0.1,
    });

    return result.toUIMessageStreamResponse({ sendReasoning: true });
  } catch (error) {
    console.error("Error in flight assistant route", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}