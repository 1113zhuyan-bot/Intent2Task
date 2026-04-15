import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedTask } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function extractTasksFromChat(chatContent: string): Promise<ExtractedTask[]> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const currentDate = new Date().toISOString().split('T')[0];

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Extract actionable tasks from the following chat content. 
            Today's date is ${currentDate}. 
            Use this date to resolve relative time expressions like "tomorrow", "next Monday", etc.
            
            For each task, identify:
            - title: A concise summary of the task.
            - description: Any additional context or details.
            - deadline: The deadline if mentioned (format: YYYY-MM-DD HH:mm), otherwise null. If only date is mentioned, use 23:59 as default time.
            - priority: One of "low", "medium", "high" based on the urgency/tone.

            Chat Content:
            """
            ${chatContent}
            """
            `,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            deadline: { type: Type.STRING, nullable: true },
            priority: { 
              type: Type.STRING, 
              enum: ["low", "medium", "high"] 
            },
          },
          required: ["title", "priority"],
        },
      },
    },
  });

  try {
    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    return [];
  }
}
