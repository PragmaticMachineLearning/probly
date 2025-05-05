import {
  DATA_SELECTION_SYSTEM_MESSAGE,
  SYSTEM_MESSAGE,
} from "@/constants/messages";
import {
  formatSheetsContext,
  formatSpreadsheetContext,
  formatUserMessageContent,
  handleCommonToolOperation,
} from "@/utils/llmUtils";
import {
  handleCreateChartTool,
  handleDataSelectionTool,
  handleDocumentAnalysisTool,
  handlePythonCodeTool,
  handleSetSpreadsheetCellsTool,
  handleStructureAnalysisTool,
} from "@/utils/toolHandlers";

import { OpenAI } from "openai";
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

    // Format context using our utility function
    const spreadsheetContext = formatSpreadsheetContext(
      spreadsheetData,
      dataSelectionMode,
      dataSelectionResult,
      columnReference
    );

    console.log("SPREADSHEET CONTEXT >>>", spreadsheetContext);

    // Add information about available sheets
    const sheetsContext = formatSheetsContext(sheetsInfo, activeSheetName);

    console.log("SPREADSHEET CONTEXT SIZE >>>", spreadsheetContext.length);
    console.log("SHEETS CONTEXT >>>", sheetsContext);

    // Format user message content
    const userMessageContent = formatUserMessageContent(
      sheetsContext,
      spreadsheetContext,
      message,
      documentImage
    );

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
        // Handle tools using our utility functions
        const functionName = toolCall.function.name;

        if (functionName === "select_data_for_analysis") {
          if (aborted) return;
          toolData = await handleDataSelectionTool(toolCall);
          console.log(
            "Generated dataSelectionResult:",
            JSON.stringify(toolData.dataSelectionResult, null, 2)
          );
        } else if (functionName === "analyze_spreadsheet_structure") {
          if (aborted) return;
          toolData = await handleStructureAnalysisTool(toolCall);
          console.log(
            "Generated structureAnalysisResult:",
            JSON.stringify(toolData.structureAnalysisResult, null, 2)
          );
        } else if (functionName === "set_spreadsheet_cells") {
          if (aborted) return;
          toolData = await handleSetSpreadsheetCellsTool(toolCall);
        } else if (functionName === "create_chart") {
          if (aborted) return;
          toolData = await handleCreateChartTool(toolCall);
        } else if (functionName === "execute_python_code") {
          if (aborted) return;
          toolData = await handlePythonCodeTool(toolCall, spreadsheetData);
        } else if (
          functionName === "get_sheet_info" ||
          functionName === "rename_sheet" ||
          functionName === "clear_sheet" ||
          functionName === "add_sheet" ||
          functionName === "remove_sheet"
        ) {
          if (aborted) return;

          // Handle common sheet operations
          const commonOpResult = handleCommonToolOperation(
            toolCall,
            activeSheetName
          );
          if (commonOpResult) {
            const { type, data } = commonOpResult;

            if (type === "get_sheet_info") {
              toolData.response = `Current sheets: ${sheetsInfo
                .map((sheet) => sheet.name)
                .join(", ")}\nActive sheet: ${activeSheetName}`;
            } else {
              toolData.sheetOperation = {
                type,
                ...data,
              };
              toolData.response = data.response;
            }
          }
        } else if (functionName === "document_analysis") {
          if (aborted) return;
          toolData = await handleDocumentAnalysisTool(
            toolCall,
            documentImage || "",
            activeSheetName
          );
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
