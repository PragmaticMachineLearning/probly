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
 * @param sampleMode - Whether to return only a sample of the data (first few rows)
 * @param maxSampleRows - Maximum number of sample rows to include
 * @param originalColumn - The original column letter if this is column data (e.g., 'E')
 * @returns Formatted string with cell references
 */
export function formatSpreadsheetData(
  data: any[][],
  sampleMode: boolean = false,
  maxSampleRows: number = 5,
  originalColumn?: string
): string {
  if (!data || !Array.isArray(data)) return "";

  // Limit the data if in sample mode
  const dataToProcess = sampleMode ? data.slice(0, maxSampleRows) : data;

  // Step 1: Compute max columns to precompute column references
  const maxColumns = Math.max(...dataToProcess.map((row) => row.length), 0);

  // If originalColumn is provided (for column data), use that instead of A, B, C...
  let columnRefs: string[];
  if (originalColumn && data[0]?.length === 1) {
    // This is extracted column data, use the original column reference
    columnRefs = [originalColumn];
  } else {
    // Generate column references A, B, C...
    columnRefs = Array.from({ length: maxColumns }, (_, i) => getColumnRef(i));
  }

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
  const formattedData = dataToProcess.reduce((acc, row, rowIndex) => {
    // Check if the row is completely empty
    if (row.every(isEmpty)) return acc;

    // Find the last non-empty cell index
    let lastNonEmptyIndex = row.length - 1;
    while (lastNonEmptyIndex >= 0 && isEmpty(row[lastNonEmptyIndex])) {
      lastNonEmptyIndex--;
    }

    if (lastNonEmptyIndex < 0) return acc; // Skip if no valid content

    // Format the row
    const rowContent = row
      .slice(0, lastNonEmptyIndex + 1)
      .reduce((rowAcc, cell, colIndex) => {
        if (isEmpty(cell)) return rowAcc;

        const cellRef = `${columnRefs[colIndex]}${rowIndex + 1}`;

        return rowAcc + `<${cellRef}>${cell}</${cellRef}>`;
      }, "");

    return acc + rowContent + "\n";
  }, "");

  if (sampleMode && data.length > maxSampleRows) {
    return (
      formattedData +
      `\n[${data.length - maxSampleRows} more rows not shown in sample mode]\n`
    );
  }

  return formattedData;
}

/**
 * Parses structured output into cell updates
 * @param structuredOutput - The CSV-like structured output
 * @param startCell - Starting cell reference (e.g. 'A1')
 * @returns Array of cell updates
 */
export function generateCellUpdates(
  structuredOutput: string,
  startCell: string
) {
  const outputRows = structuredOutput
    .trim()
    .split("\n")
    .map((row) => row.split(",").map((cell) => cell.trim()));

  const colLetter = startCell.match(/[A-Z]+/)?.[0] || "A";
  const rowNumber = parseInt(startCell.match(/\d+/)?.[0] || "1");

  return outputRows.map((row, rowIndex) =>
    row.map((value, colIndex) => ({
      target: `${String.fromCharCode(colLetter.charCodeAt(0) + colIndex)}${
        rowNumber + rowIndex
      }`,
      formula: value.toString(),
    }))
  );
}

/**
 * Structures raw analysis output into a clean tabular format using LLM
 * @param rawOutput - The raw output from Python analysis
 * @param analysisGoal - The goal/context of the analysis
 * @returns Promise<string> - Structured CSV-like output with headers
 */
export async function structureAnalysisOutput(
  rawOutput: string,
  analysisGoal: string
): Promise<string> {
  // First, clean up the raw output in case it already contains backticks
  const cleanedRawOutput = rawOutput
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks with content
    .replace(/```/g, "") // Remove any remaining backticks
    .trim(); // Remove extra whitespace

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `Convert the following analysis output into a clean tabular format. 
      Each row should be comma-separated values, with the first row being headers.
      Ensure numbers are properly formatted and aligned.
      The output should be ready to insert into a spreadsheet.
      
      IMPORTANT: Do not use any markdown formatting or code blocks in your response.
      Just return plain text with comma-separated values.`,
    },
    {
      role: "user",
      content: `Analysis Goal: ${analysisGoal}\n\nRaw Output:\n${cleanedRawOutput}\n\nConvert this into comma-separated rows with headers.`,
    },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    temperature: 0.1,
  });

  // Get the content from the completion, or empty string if undefined
  let result = completion.choices[0]?.message?.content || "";

  // Remove any code blocks (text between triple backticks) and any remaining backticks
  result = result
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks with content
    .replace(/```/g, "") // Remove any remaining backticks
    .trim(); // Remove extra whitespace

  return result;
}

/**
 * Converts table data into standardized cell updates
 * @param tableData - The table data to convert
 * @param startCell - Starting cell reference (e.g. 'A1')
 * @param sheetName - Optional sheet name for the updates
 * @returns Array of cell updates
 */
export function convertTableToCellUpdates(
  tableData: { headers: string[]; rows: string[][] },
  startCell: string,
  sheetName?: string
): Array<{ target: string; formula: string; sheetName?: string }> {
  const updates: Array<{
    target: string;
    formula: string;
    sheetName?: string;
  }> = [];

  if (!tableData.headers || !tableData.rows) return updates;

  const colLetter = startCell.match(/[A-Z]+/)?.[0] || "A";
  const rowNumber = parseInt(startCell.match(/\d+/)?.[0] || "1");

  // Add headers
  tableData.headers.forEach((header, index) => {
    updates.push({
      target: `${String.fromCharCode(
        colLetter.charCodeAt(0) + index
      )}${rowNumber}`,
      formula: header,
      sheetName,
    });
  });

  // Add data rows
  tableData.rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      updates.push({
        target: `${String.fromCharCode(colLetter.charCodeAt(0) + colIndex)}${
          rowNumber + rowIndex + 1
        }`,
        formula: cell,
        sheetName,
      });
    });
  });

  return updates;
}

/**
 * Analyzes a document with Vision API and returns a structured table
 * @param operation - The operation to perform on the document
 * @param documentImage - The image of the document
 * @param model - The model to use for the analysis
 * @returns Promise<TableConversionResult> - Structured table with headers and rows
 */
export const analyzeDocumentWithVision = async (
  operation: string,
  documentImage: string,
  model: string = "gpt-4o"
): Promise<TableConversionResult> => {
  const visionPrompt = `Analyze this document and ${operation.replace(
    "_",
    " "
  )} from it. 
  Format the output as a structured table with headers and rows that can be directly inserted into a spreadsheet.
  
  Return a JSON object with exactly this structure:
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
  1. If the document contains a table, extract it directly with proper headers
  2. If the document contains key-value pairs, make the keys one column and values another
  3. If the document contains lists or arrays, create appropriate columns
  4. Ensure consistent data types in each column
  5. Include meaningful headers that describe the data
  6. Don't include more than 20 columns maximum
  7. Your response must be valid JSON that can be parsed with JSON.parse()`;

  const response = await openai.chat.completions.create({
    model: model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: visionPrompt },
          { type: "image_url", image_url: { url: documentImage } },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content || "{}";

  try {
    const tableData = JSON.parse(content) as TableConversionResult;

    // Validate the structure
    if (!tableData.headers || !tableData.rows) {
      throw new Error("Invalid table structure returned from LLM");
    }

    return tableData;
  } catch (error: any) {
    console.error("Error parsing vision API response:", error);
    // Return a simple fallback structure with the error
    return {
      headers: ["Error"],
      rows: [["Failed to process document: " + error.message]],
    };
  }
};
