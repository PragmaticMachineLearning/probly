import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { OpenAI } from "openai";
import { createSpreadsheetContext } from "./contextWindowUtils";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});



/**
 * Structures raw analysis output into a clean tabular format using LLM
 * @param rawOutput - The raw output from Python analysis
 * @param analysisGoal - The goal/context of the analysis
 * @returns Promise<string> - Structured CSV-like output with headers
 */
export async function structureAnalysisOutput(rawOutput: string, analysisGoal: string): Promise<string> {
  // First, clean up the raw output in case it already contains backticks
  const cleanedRawOutput = rawOutput
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks with content
    .replace(/```/g, '')            // Remove any remaining backticks
    .trim();                        // Remove extra whitespace
  
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `Convert the following analysis output into a clean tabular format. 
      Each row should be comma-separated values, with the first row being headers.
      Ensure numbers are properly formatted and aligned.
      The output should be ready to insert into a spreadsheet.
      
      IMPORTANT: Do not use any markdown formatting or code blocks in your response.
      Just return plain text with comma-separated values.`
    },
    {
      role: "user", 
      content: `Analysis Goal: ${analysisGoal}\n\nRaw Output:\n${cleanedRawOutput}\n\nConvert this into comma-separated rows with headers.`
    }
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    temperature: 0.1,
  });

  // Get the content from the completion, or empty string if undefined
  let result = completion.choices[0]?.message?.content || '';
  
  // Remove any code blocks (text between triple backticks) and any remaining backticks
  result = result.replace(/```[\s\S]*?```/g, '') // Remove code blocks with content
           .replace(/```/g, '')                  // Remove any remaining backticks
           .trim();                              // Remove extra whitespace
  
  return result;
}

/**
 * Parses structured output into cell updates
 * @param structuredOutput - The CSV-like structured output
 * @param startCell - Starting cell reference (e.g. 'A1')
 * @returns Array of cell updates
 */
export function generateCellUpdates(structuredOutput: string, startCell: string) {
  const outputRows = structuredOutput.trim().split('\n')
    .map(row => row.split(',').map(cell => cell.trim()));
  
  const colLetter = startCell.match(/[A-Z]+/)?.[0] || 'A';
  const rowNumber = parseInt(startCell.match(/\d+/)?.[0] || '1');

  return outputRows.map((row, rowIndex) => 
    row.map((value, colIndex) => ({
      target: `${String.fromCharCode(colLetter.charCodeAt(0) + colIndex)}${rowNumber + rowIndex}`,
      formula: value.toString()
    }))
  );
} 