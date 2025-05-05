import { OpenAI } from "openai";
import { formatSpreadsheetData } from "./analysisUtils";

// Define an interface for the spreadsheet structure
interface SpreadsheetStructure {
  rowCount: number;
  colCount: number;
  hasHeaders: boolean;
  tables: { range: string; headers: string[] }[];
  columns: { label: string; index: number }[];
}

// Define an interface for spreadsheet data with structure
interface StructuredSpreadsheetData {
  structure: SpreadsheetStructure;
}

// Helper function to format spreadsheet data based on selection result
export function formatSpreadsheetContext(
  spreadsheetData: any[][],
  dataSelectionMode: boolean = false,
  dataSelectionResult?: any,
  columnReference?: string
): string {
  if (dataSelectionMode) {
    // For data selection phase, only include minimal structural info
    if (
      typeof spreadsheetData === "object" &&
      spreadsheetData !== null &&
      "structure" in spreadsheetData
    ) {
      // If we received pre-analyzed structure info
      const structuredData = spreadsheetData as StructuredSpreadsheetData;
      return `Spreadsheet Structure Information:
Row Count: ${structuredData.structure.rowCount}
Column Count: ${structuredData.structure.colCount}
Has Headers: ${structuredData.structure.hasHeaders}

Detected Tables:
${structuredData.structure.tables
  .map(
    (table: { range: string; headers: string[] }) =>
      `- Range: ${table.range}, Headers: ${table.headers.join(", ")}`
  )
  .join("\n")}

Columns:
${structuredData.structure.columns
  .map(
    (col: { label: string; index: number }) =>
      `- ${col.label} (index: ${col.index})`
  )
  .join("\n")}`;
    } else {
      // Just use a sample of the data with the updated sampleMode parameter
      return `Sample of spreadsheet data (first few rows):
${formatSpreadsheetData(spreadsheetData, true, 10)}`; // Use sample mode with 10 rows
    }
  } else {
    // For analysis phase (normal mode), format the actual data
    // If we have a data selection result, mention it in the context
    if (dataSelectionResult) {
      if (
        dataSelectionResult.dataSelection?.selectionType === "column" &&
        columnReference
      ) {
        return `Selected data for analysis (${
          dataSelectionResult.analysisType
        } analysis):
${formatSpreadsheetData(spreadsheetData, false, 0, columnReference)}

Selection criteria: ${dataSelectionResult.explanation}`;
      } else if (
        dataSelectionResult.dataSelection?.selectionType === "range" &&
        dataSelectionResult.dataSelection?.range
      ) {
        // Extract starting column letter from the range (e.g., 'F' from 'F2:G702')
        const rangeMatch =
          dataSelectionResult.dataSelection.range.match(/^([A-Z]+)/);
        const rangeStartColumn = rangeMatch ? rangeMatch[1] : "A";

        return `Selected data for analysis (${
          dataSelectionResult.analysisType
        } analysis):
${formatSpreadsheetData(spreadsheetData, false, 0, undefined, rangeStartColumn)}

Selection criteria: ${dataSelectionResult.explanation}`;
      } else {
        return `Selected data for analysis (${
          dataSelectionResult.analysisType
        } analysis):
${formatSpreadsheetData(spreadsheetData)}

Selection criteria: ${dataSelectionResult.explanation}`;
      }
    } else {
      // Standard formatting for full data
      return spreadsheetData?.length
        ? `${formatSpreadsheetData(spreadsheetData)}\n`
        : "";
    }
  }
}

// Helper to handle tool call parsing and error recovery
export function safeParseToolArgs(argsString: string, fallback: any): any {
  try {
    return JSON.parse(argsString);
  } catch (parseError) {
    console.error("Error parsing tool arguments:", parseError);
    console.log("Raw arguments:", argsString);
    return fallback;
  }
}

// Helper to create sheets context string
export function formatSheetsContext(
  sheetsInfo: { id: string; name: string }[],
  activeSheetName: string
): string {
  return sheetsInfo?.length
    ? `Available sheets: ${sheetsInfo
        .map((sheet) => sheet.name)
        .join(", ")}\nActive sheet: ${activeSheetName}\n`
    : "";
}

// Helper to format user message content
export function formatUserMessageContent(
  sheetsContext: string,
  spreadsheetContext: string,
  message: string,
  documentImage?: string
): string {
  let content = `${sheetsContext}${spreadsheetContext}User question: ${message}`;

  // If document is provided, add context about it
  if (documentImage) {
    content += "\n\nI've uploaded a document that needs to be analyzed.";
  }

  return content;
}

// Helper to handle common tool operations
export function handleCommonToolOperation(
  toolCall: any,
  activeSheetName: string = ""
): { type: string; data: any } | null {
  const functionName = toolCall.function.name;

  if (functionName === "get_sheet_info") {
    return { type: "get_sheet_info", data: {} };
  }

  if (functionName === "rename_sheet") {
    const args = safeParseToolArgs(toolCall.function.arguments, {});
    const { currentName, newName } = args;

    return {
      type: "rename_sheet",
      data: {
        currentName,
        newName,
        response: `I've renamed the sheet "${currentName}" to "${newName}".`,
      },
    };
  }

  if (functionName === "clear_sheet") {
    const args = safeParseToolArgs(toolCall.function.arguments, {});
    const sheetName = args.sheetName || activeSheetName;

    return {
      type: "clear_sheet",
      data: {
        sheetName,
        response: `I've cleared all data from the sheet "${sheetName}".`,
      },
    };
  }

  if (functionName === "add_sheet") {
    const args = safeParseToolArgs(toolCall.function.arguments, {});
    const sheetName = args.sheetName || "New Sheet";

    return {
      type: "add_sheet",
      data: {
        sheetName,
        response: `I've added a new sheet named "${sheetName}".`,
      },
    };
  }

  if (functionName === "remove_sheet") {
    const args = safeParseToolArgs(toolCall.function.arguments, {});
    const sheetName = args.sheetName || activeSheetName;

    return {
      type: "remove_sheet",
      data: {
        sheetName,
        response: `I've removed the sheet "${sheetName}".`,
      },
    };
  }

  // If not a common tool operation, return null
  return null;
}
