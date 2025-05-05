import {
  DATA_SELECTION_SYSTEM_MESSAGE,
  SYSTEM_MESSAGE,
} from "@/constants/messages";
import {
  formatSpreadsheetData,
  generateCellUpdates,
  structureAnalysisOutput,
} from "@/utils/analysisUtils";

import { OpenAI } from "openai";
import { PyodideSandbox } from "@/utils/pyodideSandbox";
import { analyzeDocumentWithVision } from "@/utils/analysisUtils";
import { convertTableToCellUpdates } from "@/utils/analysisUtils";
import { convertToCSV } from "@/utils/dataUtils";
import dotenv from "dotenv";
import { tools } from "@/constants/tools";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});
const MODEL = "gpt-4o";

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

async function handleLLMRequest(
  message: string,
  spreadsheetData: any[][],
  chatHistory: any[],
  activeSheetName: string = "Sheet 1",
  sheetsInfo: { id: string; name: string }[] = [],
  res: any,
  documentImage?: string,
  dataSelectionMode: boolean = false,
  dataSelectionResult?: any,
  columnReference?: string
): Promise<void> {
  let aborted = false;
  let sandbox: PyodideSandbox | null = null;

  // Set up disconnect handler
  res.on("close", () => {
    aborted = true;
    console.log("Client disconnected");
  });

  try {
    // Choose the appropriate system message based on the mode
    const systemMessage = dataSelectionMode
      ? DATA_SELECTION_SYSTEM_MESSAGE
      : SYSTEM_MESSAGE;

    // Format context differently based on mode
    let spreadsheetContext;

    if (dataSelectionMode) {
      // For data selection phase, only include minimal structural info
      // Format varies based on whether we have structured info or just sample data
      console.log("IN DATA SELECTION MODE");
      console.log("SPREADSHEET DATA", spreadsheetData);
      if (
        typeof spreadsheetData === "object" &&
        spreadsheetData !== null &&
        "structure" in spreadsheetData
      ) {
        // If we received pre-analyzed structure info
        const structuredData = spreadsheetData as StructuredSpreadsheetData;
        spreadsheetContext = `Spreadsheet Structure Information:
Row Count: ${structuredData.structure.rowCount}
Column Count: ${structuredData.structure.colCount}
Has Headers: ${structuredData.structure.hasHeaders}

Detected Tables:
${structuredData.structure.tables
  .map(
    (table) => `- Range: ${table.range}, Headers: ${table.headers.join(", ")}`
  )
  .join("\n")}

Columns:
${structuredData.structure.columns
  .map((col) => `- ${col.label} (index: ${col.index})`)
  .join("\n")}`;
      } else {
        // Just use a sample of the data with the updated sampleMode parameter
        spreadsheetContext = `Sample of spreadsheet data (first few rows):
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
          spreadsheetContext = `Selected data for analysis (${
            dataSelectionResult.analysisType
          } analysis):
${formatSpreadsheetData(spreadsheetData, false, 0, columnReference)}

Selection criteria: ${dataSelectionResult.explanation}`;
        } else {
          spreadsheetContext = `Selected data for analysis (${
            dataSelectionResult.analysisType
          } analysis):
${formatSpreadsheetData(spreadsheetData)}

Selection criteria: ${dataSelectionResult.explanation}`;
        }
      } else {
        // Standard formatting for full data
        spreadsheetContext = spreadsheetData?.length
          ? `${formatSpreadsheetData(spreadsheetData)}\n`
          : "";
      }
    }
    console.log("SPREADSHEET CONTEXT >>>", spreadsheetContext);
    // Add information about available sheets
    const sheetsContext = sheetsInfo?.length
      ? `Available sheets: ${sheetsInfo
          .map((sheet) => sheet.name)
          .join(", ")}\nActive sheet: ${activeSheetName}\n`
      : "";

    console.log("SPREADSHEET CONTEXT SIZE >>>", spreadsheetContext.length);
    console.log("SHEETS CONTEXT >>>", sheetsContext);

    // Check if we have a document image
    const hasDocumentImage = !!documentImage;

    // Standard text-only message for the initial request
    let userMessageContent = `${sheetsContext}${spreadsheetContext}User question: ${message}`;

    // If document is provided, add context about it but don't use vision capabilities yet
    if (hasDocumentImage) {
      userMessageContent +=
        "\n\nI've uploaded a document that needs to be analyzed.";
    }

    // Format messages for OpenAI API
    const messages = [
      { role: "system", content: systemMessage },
      ...chatHistory.slice(-10),
      { role: "user", content: userMessageContent },
    ];

    // Non-streaming call to OpenAI API
    const completion = await openai.chat.completions.create({
      messages: messages as any,
      model: MODEL,
      stream: false,
    });

    if (aborted) return;

    const response = completion.choices[0]?.message?.content || "";

    // Tool completion call with specific tool choice for data selection mode
    const toolCompletion = await openai.chat.completions.create({
      messages: [...messages, { role: "assistant", content: response }],
      model: MODEL,
      tools: tools as any,
      stream: false,
      // Force the use of select_data_for_analysis in data selection mode
      ...(dataSelectionMode
        ? {
            tool_choice: {
              type: "function",
              function: { name: "select_data_for_analysis" },
            },
          }
        : {}),
    });

    // Check if aborted before processing tool calls
    if (aborted) return;

    const assistantMessage = toolCompletion.choices[0]?.message;
    const toolCalls = assistantMessage?.tool_calls;

    if (toolCalls?.length) {
      const toolCall = toolCalls[0];
      console.log(`Tool call detected: ${toolCall.function.name}`);

      let toolData: any = {
        response: response,
      };

      try {
        // Handle the select_data_for_analysis tool with better error handling
        if (toolCall.function.name === "select_data_for_analysis") {
          if (aborted) return;

          // Parse args with explicit error handling
          let args;
          try {
            args = JSON.parse(toolCall.function.arguments);
            console.log("Data selection args:", JSON.stringify(args, null, 2));
          } catch (parseError) {
            console.error(
              "Error parsing select_data_for_analysis arguments:",
              parseError
            );
            console.log("Raw arguments:", toolCall.function.arguments);
            args = {
              analysisType: "custom",
              dataSelection: { selectionType: "range", range: "A1:Z10" },
              explanation: "Fallback after parsing error",
            };
          }

          const { analysisType, dataSelection, explanation } = args;

          // Validate required fields
          if (!dataSelection || !dataSelection.selectionType) {
            console.error("Missing required dataSelection fields:", args);
            toolData = {
              error: "Invalid data selection parameters",
              response:
                "I couldn't determine what data to analyze. Please try rephrasing your request.",
            };
          } else {
            // This is the result of the data selection phase
            // We'll return this to the client so it can request the specific data
            toolData = {
              dataSelectionResult: {
                analysisType,
                dataSelection,
                explanation,
              },
              response: `I'll analyze your data using ${analysisType} analysis. ${explanation}`,
            };
            console.log(
              "Generated dataSelectionResult:",
              JSON.stringify(toolData.dataSelectionResult, null, 2)
            );
          }
        } else if (toolCall.function.name === "analyze_spreadsheet_structure") {
          if (aborted) return;

          // Parse args with explicit error handling
          let args;
          try {
            args = JSON.parse(toolCall.function.arguments);
            console.log(
              "Structure analysis args:",
              JSON.stringify(args, null, 2)
            );
          } catch (parseError) {
            console.error(
              "Error parsing analyze_spreadsheet_structure arguments:",
              parseError
            );
            console.log("Raw arguments:", toolCall.function.arguments);
            args = {
              scopeNeeded: "minimal",
              explanation: "Fallback after parsing error",
            };
          }

          const { scopeNeeded, explanation } = args;

          toolData = {
            structureAnalysisResult: {
              scopeNeeded,
              explanation,
            },
            response: `I'll analyze the spreadsheet structure to help answer your question. ${
              explanation || ""
            }`,
          };
          console.log(
            "Generated structureAnalysisResult:",
            JSON.stringify(toolData.structureAnalysisResult, null, 2)
          );
        } else if (toolCall.function.name === "set_spreadsheet_cells") {
          if (aborted) return;
          const updates = JSON.parse(toolCall.function.arguments).cellUpdates;
          toolData.updates = updates;

          toolData.response +=
            "\n\nSpreadsheet Updates:\n" +
            updates
              .map((update: any) => `${update.target}: ${update.formula}`)
              .join("\n");
        } else if (toolCall.function.name === "create_chart") {
          if (aborted) return;
          const args = JSON.parse(toolCall.function.arguments);
          toolData.chartData = {
            type: args.type,
            options: { title: args.title, data: args.data },
          };

          toolData.response = `I've created a ${args.type} chart titled "${args.title}" based on your data.`;
        } else if (toolCall.function.name === "execute_python_code") {
          try {
            if (aborted) return;
            sandbox = new PyodideSandbox();
            await sandbox.initialize();

            const { analysis_goal, suggested_code, start_cell } = JSON.parse(
              toolCall.function.arguments
            );

            if (aborted) {
              await sandbox.destroy();
              return;
            }

            const csvData = convertToCSV(spreadsheetData);
            const result = await sandbox.runDataAnalysis(
              suggested_code,
              csvData
            );

            if (aborted) {
              await sandbox.destroy();
              return;
            }

            // Structure the output using LLM
            const structuredOutput = await structureAnalysisOutput(
              result.stdout,
              analysis_goal
            );

            // Generate cell updates from structured output
            const generatedUpdates = generateCellUpdates(
              structuredOutput,
              start_cell
            );

            // Create a more concise response message
            const responseMessage = `I've analyzed your data: ${analysis_goal}`;

            toolData = {
              response: responseMessage,
              updates: generatedUpdates.flat(), // Flatten the updates array
            };
          } catch (error) {
            console.error("Error executing Python code:", error);
            toolData = {
              response: "An error occurred while executing the Python code.",
            };
          } finally {
            if (sandbox) {
              await sandbox.destroy();
            }
          }
        } else if (toolCall.function.name === "get_sheet_info") {
          if (aborted) return;

          toolData.response = `Current sheets: ${sheetsInfo
            .map((sheet) => sheet.name)
            .join(", ")}\nActive sheet: ${activeSheetName}`;
        } else if (toolCall.function.name === "rename_sheet") {
          if (aborted) return;

          const args = JSON.parse(toolCall.function.arguments);
          const { currentName, newName } = args;

          toolData.sheetOperation = {
            type: "rename",
            currentName: currentName,
            newName: newName,
          };

          toolData.response = `I've renamed the sheet "${currentName}" to "${newName}".`;
        } else if (toolCall.function.name === "clear_sheet") {
          if (aborted) return;

          const args = JSON.parse(toolCall.function.arguments);
          const sheetName = args.sheetName || activeSheetName;

          toolData.sheetOperation = {
            type: "clear",
            sheetName: sheetName,
          };

          toolData.response = `I've cleared all data from the sheet "${sheetName}".`;
        } else if (toolCall.function.name === "add_sheet") {
          if (aborted) return;

          const args = JSON.parse(toolCall.function.arguments);
          const sheetName = args.sheetName || "New Sheet";

          toolData.sheetOperation = {
            type: "add",
            sheetName: sheetName,
          };

          toolData.response = `I've added a new sheet named "${sheetName}".`;
        } else if (toolCall.function.name === "remove_sheet") {
          if (aborted) return;

          const args = JSON.parse(toolCall.function.arguments);
          const sheetName = args.sheetName || activeSheetName;
          toolData.sheetOperation = {
            type: "remove",
            sheetName: sheetName,
          };

          toolData.response = `I've removed the sheet "${sheetName}".`;
        } else if (toolCall.function.name === "document_analysis") {
          if (aborted) return;

          const args = JSON.parse(toolCall.function.arguments);
          const { operation, target_sheet, start_cell } = args;

          // We need the document image for analysis
          if (!documentImage) {
            toolData.response =
              "Error: No document image provided for analysis.";
          } else {
            try {
              // Get table data directly from vision API
              const tableData = await analyzeDocumentWithVision(
                operation,
                documentImage
              );

              // Generate cell updates using the standardized function
              const updates = convertTableToCellUpdates(
                tableData,
                start_cell,
                target_sheet || activeSheetName
              );

              // Include note from table conversion if available
              const noteText = tableData.note
                ? `\n\nNote: ${tableData.note}`
                : "";

              toolData = {
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
              toolData.response = `Error processing document: ${
                error.message || "Unknown error"
              }`;
            }
          }
        }
      } catch (toolError) {
        console.error(
          `Error handling tool call ${toolCall.function.name}:`,
          toolError
        );
        toolData = {
          error: `Error processing ${toolCall.function.name}`,
          response: `I encountered an error while trying to analyze your data. Please try again with a simpler request.`,
        };
      }

      // Only send response if not aborted
      if (!aborted) {
        console.log(
          "Sending tool response:",
          JSON.stringify(toolData, null, 2)
        );
        res.write(
          `data: ${JSON.stringify({
            ...toolData,
            streaming: false,
          })}\n\n`
        );
      }
    } else if (!aborted) {
      res.write(
        `data: ${JSON.stringify({
          response: response,
          streaming: false,
        })}\n\n`
      );
    }
  } catch (error: any) {
    if (!aborted) {
      console.error("LLM API error:", error);
      res.write(
        `data: ${JSON.stringify({
          error: error.message || "Unknown error",
        })}\n\n`
      );
    }
  } finally {
    // Ensure sandbox is destroyed if it exists
    if (sandbox) {
      await sandbox.destroy();
    }
  }
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method === "POST") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Create a promise that resolves when the client disconnects
    const disconnectPromise = new Promise((resolve) => {
      res.on("close", () => {
        resolve(undefined);
      });
    });

    try {
      const {
        message,
        spreadsheetData,
        chatHistory,
        activeSheetName,
        sheetsInfo,
        documentImage,
        dataSelectionMode, // New parameter to handle data selection phase
        dataSelectionResult, // Result from data selection phase if in analysis mode
        columnReference, // Original column reference for column selections
      } = req.body;

      // Check if document image is present and validate its size
      if (documentImage) {
        // Calculate base64 size (each character represents 6 bits, so 4 characters = 3 bytes)
        const base64Size = Math.ceil((documentImage.length * 3) / 4);
        const maxSize = 10 * 1024 * 1024; // 10MB in bytes

        if (base64Size > maxSize) {
          res.write(
            `data: ${JSON.stringify({
              error:
                "File size exceeds 10MB limit. Please compress your image or use a smaller file.",
              details: {
                fileSize: `${(base64Size / (1024 * 1024)).toFixed(2)}MB`,
                maxSize: "10MB",
              },
            })}\n\n`
          );
          res.end();
          return;
        }
      }

      // Race between the LLM request and the client disconnecting
      await Promise.race([
        handleLLMRequest(
          message,
          spreadsheetData,
          chatHistory,
          activeSheetName,
          sheetsInfo,
          res,
          documentImage,
          dataSelectionMode,
          dataSelectionResult,
          columnReference
        ),
        disconnectPromise,
      ]);
    } catch (error: any) {
      console.error("Error processing LLM request:", error);
      res.write(
        `data: ${JSON.stringify({ error: "Failed to process request" })}\n\n`
      );
      res.end();
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb", // Increased from default 1mb to handle larger document uploads
    },
  },
};
