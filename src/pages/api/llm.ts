import {
 formatSpreadsheetData,
 generateCellUpdates,
 structureAnalysisOutput,
 convertJsonToTableData,

} from "@/utils/analysisUtils";

import { OpenAI } from "openai";
import { PyodideSandbox } from "@/utils/pyodideSandbox";
import { SYSTEM_MESSAGE } from "@/constants/messages";
import { convertToCSV } from "@/utils/dataUtils";
import dotenv from "dotenv";
import { tools } from "@/constants/tools";


dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});
const model = "gpt-4o";

async function handleLLMRequest(
  message: string,
  spreadsheetData: any[][],
  chatHistory: any[],
  activeSheetName: string = "Sheet 1",
  sheetsInfo: { id: string, name: string }[] = [],
  res: any,
  documentImage?: string,
): Promise<void> {
  let aborted = false;
  let sandbox: PyodideSandbox | null = null;

  // Set up disconnect handler
  res.on("close", () => {
    aborted = true;
    console.log("Client disconnected");
  });

  try {
    // Use our XML tag-based context window utility for precise cell positions
    const spreadsheetContext = spreadsheetData?.length
      ? `${formatSpreadsheetData(spreadsheetData)}\n`
      : "";
    
    // Add information about available sheets
    const sheetsContext = sheetsInfo?.length
      ? `Available sheets: ${sheetsInfo.map(sheet => sheet.name).join(", ")}\nActive sheet: ${activeSheetName}\n`
      : "";
    
    console.log("SPREADSHEET CONTEXT SIZE >>>", spreadsheetContext.length);
    console.log("SPREADSHEET CONTEXT >>>", spreadsheetContext);
    console.log("SHEETS CONTEXT >>>", sheetsContext);
    
    // Check if we have a document image
    const hasDocumentImage = !!documentImage;
    
    // Standard text-only message for the initial request
    let userMessageContent = `${sheetsContext}${spreadsheetContext}User question: ${message}`;
    
    // If document is provided, add context about it but don't use vision capabilities yet
    // We'll use vision in the document_analysis tool if needed
    if (hasDocumentImage) {
      userMessageContent += "\n\nI've uploaded a document that needs to be analyzed.";
    }
    
    // Format messages for OpenAI API
    const messages = [
      { role: "system", content: SYSTEM_MESSAGE },
      ...chatHistory.slice(-10),
      { role: "user", content: userMessageContent },
    ];

    // First streaming call - always use standard model
    const stream = await openai.chat.completions.create({
      messages: messages as any,
      model: model,
      stream: true,
    });

    let buffer = '';
    const chunkSize = 100; // Characters

    for await (const chunk of stream) {
      if (aborted) {
        console.log("Aborting stream processing");
        await stream.controller.abort();
        return;
      }

      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        buffer += content;
        
        // Only send to client when buffer reaches a certain size
        // This reduces the number of network packets
        if (buffer.length >= chunkSize) {
          res.write(
            `data: ${JSON.stringify({
              response: buffer,
              streaming: true,
            })}\n\n`,
          );
          buffer = '';
        }
      }
    }

    // Send any remaining buffer
    if (buffer.length > 0) {
      res.write(
        `data: ${JSON.stringify({
          response: buffer,
          streaming: true,
        })}\n\n`,
      );
    }

    // Check again before making the tool call
    if (aborted) return;

    // Tool completion call - always use standard model
    const toolCompletion = await openai.chat.completions.create({
      messages: [
        ...messages,
        { role: "assistant", content: buffer },
      ],
      model: model,
      tools: tools as any,
      stream: false,
    });

    // Check if aborted before processing tool calls
    if (aborted) return;

    const assistantMessage = toolCompletion.choices[0]?.message;
    const toolCalls = assistantMessage?.tool_calls;

    if (toolCalls?.length) {
      const toolCall = toolCalls[0];
      let toolData: any = {
        response: buffer,
      };

      if (toolCall.function.name === "set_spreadsheet_cells") {
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
            toolCall.function.arguments,
          );    
          console.log("SUGGESTED CODE >>>", suggested_code);
          console.log("START CELL >>>", start_cell);
          console.log("ANALYSIS GOAL >>>", analysis_goal);

          if (aborted) {
            await sandbox.destroy();
            return;
          }

          const csvData = convertToCSV(spreadsheetData);
          const result = await sandbox.runDataAnalysis(suggested_code, csvData);

          if (aborted) {
            await sandbox.destroy();
            return;
          }

          // Structure the output using LLM
          const structuredOutput = await structureAnalysisOutput(result.stdout, analysis_goal);
          console.log("STRUCTURED OUTPUT >>>", structuredOutput);
          
          // Generate cell updates from structured output
          const generatedUpdates = generateCellUpdates(structuredOutput, start_cell);

          // Create a more concise response message
          const responseMessage = `I've analyzed your data: ${analysis_goal}`;

          toolData = {
            response: responseMessage,
            updates: generatedUpdates.flat(), // Flatten the updates array
            analysis: {
              goal: analysis_goal,
              output: structuredOutput,
              error: result.stderr,
            },
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
        
        toolData.response = `Current sheets: ${sheetsInfo.map(sheet => sheet.name).join(", ")}\nActive sheet: ${activeSheetName}`;
      } else if (toolCall.function.name === "rename_sheet") {
        if (aborted) return;
        
        const args = JSON.parse(toolCall.function.arguments);
        const { currentName, newName } = args;
        
        toolData.sheetOperation = {
          type: 'rename',
          currentName: currentName,
          newName: newName
        };
        
        toolData.response = `I've renamed the sheet "${currentName}" to "${newName}".`;
      } else if (toolCall.function.name === "clear_sheet") {
        if (aborted) return;
        
        const args = JSON.parse(toolCall.function.arguments);
        const sheetName = args.sheetName || activeSheetName;
        
        toolData.sheetOperation = {
          type: 'clear',
          sheetName: sheetName
        };
        
        toolData.response = `I've cleared all data from the sheet "${sheetName}".`;
      } else if (toolCall.function.name === "add_sheet") {
        if (aborted) return;
        
        const args = JSON.parse(toolCall.function.arguments);
        const sheetName = args.sheetName || "New Sheet";
        
        toolData.sheetOperation = {
          type: 'add',
          sheetName: sheetName
        };
        
        toolData.response = `I've added a new sheet named "${sheetName}".`;
      } else if (toolCall.function.name === "remove_sheet") {
        if (aborted) return;
        
        const args = JSON.parse(toolCall.function.arguments);
        const sheetName = args.sheetName || activeSheetName;
        toolData.sheetOperation = {
          type: 'remove',
          sheetName: sheetName
        };
        
        toolData.response = `I've removed the sheet "${sheetName}".`;
      } else if (toolCall.function.name === "document_analysis") {
        if (aborted) return;
        
        const args = JSON.parse(toolCall.function.arguments);
        const { operation, target_sheet, start_cell } = args;
        console.log("OPERATION >>>", operation);
        console.log("TARGET SHEET >>>", target_sheet);
        console.log("START CELL >>>", start_cell);
        
        // We need the document image for analysis
        if (!documentImage) {
          toolData.response = "Error: No document image provided for analysis.";
        } else {
          try {
            // Make a second call to the OpenAI Vision API to analyze the document
            const visionPrompt = `Analyze this document and ${operation.replace('_', ' ')} from it. 
            Format the output as a structured JSON object that can be used to populate a spreadsheet.
            If extracting a table, create an array of objects with consistent keys.
            Include metadata about the document if relevant (e.g., date, total amount, etc.).`;
            
            const visionResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: visionPrompt },
                    { type: "image_url", image_url: { url: documentImage } }
                  ]
                }
              ],
              max_tokens: 1500
            });
            
            const visionResult = visionResponse.choices[0]?.message?.content || "{}";
            console.log("VISION RESULT >>>", visionResult);
            
            // Try to parse the result as JSON
            let extractedData;
            try {
              // Check if the result is wrapped in a code block with backticks
              let jsonText = visionResult;
              
              // Handle ```json code blocks - use [\s\S]* instead of .* with s flag
              const jsonBlockMatch = visionResult.match(/```(?:json)?\s*([\s\S]+?)```/);
              if (jsonBlockMatch && jsonBlockMatch[1]) {
                jsonText = jsonBlockMatch[1];
              }
              
              // Clean any remaining whitespace
              jsonText = jsonText.trim();
              
              extractedData = JSON.parse(jsonText);
            } catch (e: any) {
              // If the result is not valid JSON, use text processing to extract structured data
              console.log("Error parsing JSON from vision API, using raw text instead:", e);
              extractedData = { text: visionResult };
            }
            
            // Use LLM to convert the JSON to tabular format
            const tableData = await convertJsonToTableData(extractedData, operation);
            
            // Generate cell updates based on the table data
            const updates: Array<{target: string, formula: string, sheetName: string}> = [];
            
            if (start_cell) {
              const col = start_cell[0].toUpperCase();
              const rowNum = parseInt(start_cell.substring(1));
              
              // Add headers
              tableData.headers.forEach((header, index) => {
                updates.push({
                  target: `${String.fromCharCode(col.charCodeAt(0) + index)}${rowNum}`,
                  formula: header,
                  sheetName: target_sheet || activeSheetName
                });
              });
              
              // Add data rows
              tableData.rows.forEach((row, rowIndex) => {
                row.forEach((cell, colIndex) => {
                  updates.push({
                    target: `${String.fromCharCode(col.charCodeAt(0) + colIndex)}${rowNum + rowIndex + 1}`,
                    formula: cell,
                    sheetName: target_sheet || activeSheetName
                  });
                });
              });
            }
            
            toolData.updates = updates;
            
            // Include note from table conversion if available
            const noteText = tableData.note ? `\n\nNote: ${tableData.note}` : '';
            toolData.response = `Successfully extracted data using ${operation.replace('_', ' ')}. The data has been placed in your spreadsheet${start_cell ? ` starting at cell ${start_cell}` : ''}.${noteText}`;
            
            // Add metadata about the extraction for display purposes
            toolData.analysis = {
              goal: `Document ${operation.replace('_', ' ')}`,
              output: visionResult,
            };
          } catch (error: any) {
            console.error("Error processing document:", error);
            toolData.response = `Error processing document: ${error.message || "Unknown error"}`;
          }
        }
      }
      
      // Only send response if not aborted
      if (!aborted) {
        res.write(
          `data: ${JSON.stringify({
            ...toolData,
            streaming: false,
          })}\n\n`,
        );
      }
    } else if (!aborted) {
      res.write(
        `data: ${JSON.stringify({
          response: buffer,
          streaming: false,
        })}\n\n`,
      );
    }
  } catch (error: any) {
    if (!aborted) {
      console.error("LLM API error:", error);
      res.write(
        `data: ${JSON.stringify({ error: error.message || "Unknown error" })}\n\n`,
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
      const { message, spreadsheetData, chatHistory, activeSheetName, sheetsInfo, documentImage } = req.body;
      // Race between the LLM request and the client disconnecting
      await Promise.race([
        handleLLMRequest(message, spreadsheetData, chatHistory, activeSheetName, sheetsInfo, res, documentImage),
        disconnectPromise,
      ]);
    } catch (error: any) {
      console.error("Error processing LLM request:", error);
      res.write(
        `data: ${JSON.stringify({ error: "Failed to process request" })}\n\n`,
      );
      res.end();
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}