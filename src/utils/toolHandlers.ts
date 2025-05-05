import {
  analyzeDocumentWithVision,
  convertTableToCellUpdates,
  generateCellUpdates,
  structureAnalysisOutput,
} from "./analysisUtils";

import { PyodideSandbox } from "./pyodideSandbox";
import { convertToCSV } from "./dataUtils";
import { safeParseToolArgs } from "./llmUtils";

/**
 * Handler for data selection tool operation
 */
export async function handleDataSelectionTool(toolCall: any): Promise<any> {
  // Parse args with explicit error handling
  const args = safeParseToolArgs(toolCall.function.arguments, {
    analysisType: "custom",
    dataSelection: { selectionType: "range", range: "A1:Z10" },
    explanation: "Fallback after parsing error",
  });

  const { analysisType, dataSelection, explanation } = args;

  // Validate required fields
  if (!dataSelection || !dataSelection.selectionType) {
    console.error("Missing required dataSelection fields:", args);
    return {
      error: "Invalid data selection parameters",
      response:
        "I couldn't determine what data to analyze. Please try rephrasing your request.",
    };
  }

  // Return the data selection result
  return {
    dataSelectionResult: {
      analysisType,
      dataSelection,
      explanation,
    },
    response: `I'll analyze your data using ${analysisType} analysis. ${explanation}`,
  };
}

/**
 * Handler for structure analysis tool operation
 */
export async function handleStructureAnalysisTool(toolCall: any): Promise<any> {
  // Parse args with explicit error handling
  const args = safeParseToolArgs(toolCall.function.arguments, {
    scopeNeeded: "minimal",
    explanation: "Fallback after parsing error",
  });

  const { scopeNeeded, explanation } = args;

  return {
    structureAnalysisResult: {
      scopeNeeded,
      explanation,
    },
    response: `I'll analyze the spreadsheet structure to help answer your question. ${
      explanation || ""
    }`,
  };
}

/**
 * Handler for spreadsheet cells update tool operation
 */
export async function handleSetSpreadsheetCellsTool(
  toolCall: any
): Promise<any> {
  const updates = safeParseToolArgs(toolCall.function.arguments, {
    cellUpdates: [],
  }).cellUpdates;

  return {
    updates,
    response:
      "Spreadsheet Updates:\n" +
      updates
        .map((update: any) => `${update.target}: ${update.formula}`)
        .join("\n"),
  };
}

/**
 * Handler for chart creation tool operation
 */
export async function handleCreateChartTool(toolCall: any): Promise<any> {
  const args = safeParseToolArgs(toolCall.function.arguments, {
    type: "bar",
    title: "Chart",
    data: {},
  });

  return {
    chartData: {
      type: args.type,
      options: { title: args.title, data: args.data },
    },
    response: `I've created a ${args.type} chart titled "${args.title}" based on your data.`,
  };
}

/**
 * Handler for Python code execution tool operation
 */
export async function handlePythonCodeTool(
  toolCall: any,
  spreadsheetData: any[][]
): Promise<any> {
  let sandbox: PyodideSandbox | null = null;

  try {
    sandbox = new PyodideSandbox();
    await sandbox.initialize();

    const { analysis_goal, suggested_code, start_cell } = safeParseToolArgs(
      toolCall.function.arguments,
      { analysis_goal: "", suggested_code: "", start_cell: "A1" }
    );

    const csvData = convertToCSV(spreadsheetData);
    const result = await sandbox.runDataAnalysis(suggested_code, csvData);

    // Structure the output using LLM
    const structuredOutput = await structureAnalysisOutput(
      result.stdout,
      analysis_goal
    );

    // Generate cell updates from structured output
    const generatedUpdates = generateCellUpdates(structuredOutput, start_cell);

    // Create a more concise response message
    return {
      response: `I've analyzed your data: ${analysis_goal}`,
      updates: generatedUpdates.flat(), // Flatten the updates array
    };
  } catch (error) {
    console.error("Error executing Python code:", error);
    return {
      response: "An error occurred while executing the Python code.",
    };
  } finally {
    if (sandbox) {
      await sandbox.destroy();
    }
  }
}

/**
 * Handler for document analysis tool operation
 */
export async function handleDocumentAnalysisTool(
  toolCall: any,
  documentImage: string,
  activeSheetName: string
): Promise<any> {
  if (!documentImage) {
    return {
      response: "Error: No document image provided for analysis.",
    };
  }

  try {
    const args = safeParseToolArgs(toolCall.function.arguments, {
      operation: "extract_data",
      target_sheet: activeSheetName,
      start_cell: "A1",
    });

    const { operation, target_sheet, start_cell } = args;

    // Get table data directly from vision API
    const tableData = await analyzeDocumentWithVision(operation, documentImage);

    // Generate cell updates using the standardized function
    const updates = convertTableToCellUpdates(
      tableData,
      start_cell,
      target_sheet || activeSheetName
    );

    // Include note from table conversion if available
    const noteText = tableData.note ? `\n\nNote: ${tableData.note}` : "";

    return {
      response: `Successfully extracted data using ${operation.replace(
        "_",
        " "
      )}. The data has been placed in your spreadsheet${
        start_cell ? ` starting at cell ${start_cell}` : ""
      }.${noteText}`,
      updates: updates,
    };
  } catch (error: any) {
    console.error("Error processing document:", error);
    return {
      response: `Error processing document: ${
        error.message || "Unknown error"
      }`,
    };
  }
}
