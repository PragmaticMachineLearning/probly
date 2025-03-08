import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import {
 generateCellUpdates,
 structureAnalysisOutput
} from "@/utils/analysisUtils";

import { CellUpdate } from "@/types/api";
import { OpenAI } from "openai";
import { PyodideSandbox } from "@/utils/pyodideSandbox";
import { SYSTEM_MESSAGE } from "@/constants/messages";
import { convertToCSV } from "@/utils/dataUtils";
import { createSpreadsheetContext } from "@/utils/contextWindowUtils";
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
  chatHistory: ChatCompletionMessageParam[],
  res: any,
): Promise<void> {
  let aborted = false;
  let sandbox: PyodideSandbox | null = null;

  // Set up disconnect handler
  res.on("close", () => {
    aborted = true;
    console.log("Client disconnected");
  });

  try {
    // Use our new context window utility
    const spreadsheetContext = spreadsheetData?.length
      ? `${createSpreadsheetContext(spreadsheetData)}\n`
      : "";
    console.log("SPREADSHEET CONTEXT SIZE >>>", spreadsheetContext.length);
    console.log("SPREADSHEET CONTEXT >>>", spreadsheetContext);
    const userMessage = `${spreadsheetContext}User question: ${message}`;
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_MESSAGE },
      ...chatHistory.slice(-10),
      { role: "user", content: userMessage },
    ];

    // First streaming call
    const stream = await openai.chat.completions.create({
      messages,
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

    // Tool completion call
    const toolCompletion = await openai.chat.completions.create({
      messages: [
        ...messages,
        { role: "assistant", content: buffer },
      ],
      model: model,
      tools: tools as ChatCompletionTool[],
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
      const { message, spreadsheetData, chatHistory } = req.body;
      // Race between the LLM request and the client disconnecting
      await Promise.race([
        handleLLMRequest(message, spreadsheetData, chatHistory, res),
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