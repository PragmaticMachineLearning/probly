import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// Interface for table conversion response
export interface TableConversionResult {
  headers: string[];
  rows: string[][];
  note?: string;
}

/**
 * Formats 2D array data into a structured XML-like string representation
 * @param data - 2D array of spreadsheet data
 * @returns Formatted string with cell references
 */
export function formatSpreadsheetData(data: any[][]): string {
  if (!data || !Array.isArray(data)) return "";

  // Step 1: Compute max columns to precompute column references
  const maxColumns = Math.max(...data.map(row => row.length), 0);
  const columnRefs = Array.from({ length: maxColumns }, (_, i) => getColumnRef(i));

  function getColumnRef(index: number): string {
    let columnRef = "";
    while (index >= 0) {
      columnRef = String.fromCharCode((index % 26) + 65) + columnRef;
      index = Math.floor(index / 26) - 1;
    }
    return columnRef;
  }
  
  function isEmpty(cell: any): boolean {
    return cell === null || cell === undefined || cell === "";
  }

  // Step 2: Process data efficiently
  return data.reduce((acc, row, rowIndex) => {

    // Check if the row is completely empty
    if (row.every(isEmpty)) return acc;

    // Find the last non-empty cell index
    let lastNonEmptyIndex = row.length - 1;
    while (lastNonEmptyIndex >= 0 && isEmpty(row[lastNonEmptyIndex])) {
      lastNonEmptyIndex--;
    }

    if (lastNonEmptyIndex < 0) return acc; // Skip if no valid content

    // Format the row
    const rowContent = row.slice(0, lastNonEmptyIndex + 1).reduce((rowAcc, cell, colIndex) => {
      if (isEmpty(cell)) return rowAcc;

      const cellRef = `${columnRefs[colIndex]}${rowIndex + 1}`;

      return rowAcc + `<${cellRef}>${cell}</${cellRef}>`;
    }, "");

    return acc + rowContent + "\n";
  }, "");
}

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

/**
 * Converts complex JSON to tabular data suitable for spreadsheet display
 * @param jsonData - Any JSON data structure to convert
 * @param operationType - The type of operation used to extract the data
 * @returns Promise<TableConversionResult> - Structured table data with headers and rows
 */
export async function convertJsonToTableData(
  jsonData: any,
  operationType: string
): Promise<TableConversionResult> {
  try {
    const jsonString = JSON.stringify(jsonData, null, 2);
    
    const prompt = `
Convert the following JSON data to a table format optimized for a spreadsheet. 
The data was extracted from a document using the "${operationType}" operation.

JSON DATA:
${jsonString}

Output a JSON object with exactly this structure:
{
  "headers": ["Column1", "Column2", ...],
  "rows": [
    ["row1col1", "row1col2", ...],
    ["row2col1", "row2col2", ...],
    ...
  ],
  "note": "Optional explanation about the data structure"
}

Guidelines:
1. If the JSON has a simple key-value structure, make the keys one column and values another
2. If the JSON has arrays of objects, extract all unique keys as columns
3. For nested objects, flatten them appropriately or create multiple tables if necessary
4. Ensure consistent data types in each column
5. Include meaningful headers that describe the data
6. Don't include more than 20 columns maximum
7. Your response must be valid JSON that can be parsed with JSON.parse()
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content || "{}";
    
    // Parse the response - it should be a valid JSON object
    const tableData = JSON.parse(content) as TableConversionResult;
    
    // Validate the structure
    if (!tableData.headers || !tableData.rows) {
      throw new Error("Invalid table structure returned from LLM");
    }
    
    return tableData;
  } catch (error: any) {
    console.error("Error converting JSON to table data:", error);
    // Return a simple fallback structure with the error
    return {
      headers: ["Key", "Value"],
      rows: [["Error", `Failed to convert JSON: ${error.message}`]]
    };
  }
} 