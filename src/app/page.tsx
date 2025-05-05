"use client";

import {} from "@/lib/file/import";

import { CellUpdate, ChatMessage } from "@/types/api";
import {
  SpreadsheetProvider,
  useSpreadsheet,
} from "@/context/SpreadsheetContext";
import { isKeyCombo, prepareChatHistory } from "@/utils/chatUtils";
import { useEffect, useRef, useState } from "react";

import ChatBox from "@/components/ChatBox";
import { MessageCircle } from "lucide-react";
import type { SpreadsheetRef } from "@/components/Spreadsheet";
import { db } from '@/lib/db';
import dynamic from "next/dynamic";

const Spreadsheet = dynamic(() => import("@/components/Spreadsheet").then(mod => mod.default), {
  ssr: false,
  loading: () => (
    <div className="flex-1 h-full flex items-center justify-center bg-gray-50 border rounded-lg">
      <div className="text-gray-500">Loading spreadsheet...</div>
    </div>
  ),
});

// Helper function to load chat history from IndexedDB
const loadChatHistory = async (): Promise<ChatMessage[]> => {
  try {
    return await db.getChatHistory();
  } catch (error) {
    console.error("Error loading chat history from IndexedDB:", error);
    return [];
  }
};

// Helper function to save chat history to IndexedDB
const saveChatHistory = async (history: ChatMessage[]): Promise<void> => {
  try {
    // Clear existing chat history
    await db.clearChatHistory();
    
    // Add each message to the database
    for (const message of history) {
      await db.addChatMessage(message);
    }
  } catch (error) {
    console.error("Error saving chat history to IndexedDB:", error);
  }
};

const SpreadsheetApp = () => {
  const { 
    setFormulas, 
    setChartData, 
    sheets, 
    activeSheetId,
    addSheet,
    removeSheet,
    renameSheet,
    clearSheet,
    getSheetByName,
    getActiveSheetData,
    getActiveSheetName,
    getDataRange,
    getColumnData,
    getRowData,
    getTableData,
    getMinimalStructure,
    analyzeActiveSheetStructure,
    findRangesWithTerm
  } = useSpreadsheet();
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
  const [message, setMessage] = useState("");
  const spreadsheetRef = useRef<SpreadsheetRef>(null);
  const abortController = useRef<AbortController | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Toggle chat with Ctrl+Shift+?
      if (isKeyCombo(e, "?", true, true)) {
        setIsChatOpen((prev) => !prev);
      }
      
      // Toggle prompt library with Ctrl+Shift+L
      if (isKeyCombo(e, "L", true, true)) {
        // Always ensure chat is open when opening prompt library
        if (!isPromptLibraryOpen) {
          setIsChatOpen(true);
        }
        // Toggle prompt library state
        setIsPromptLibraryOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isPromptLibraryOpen]);

  // Load chat open state from IndexedDB
  useEffect(() => {
    const loadChatOpen = async () => {
      const isOpen = await loadChatOpenState();
      setIsChatOpen(isOpen);
    };
    
    loadChatOpen();
  }, []);

  // Save chat open state to IndexedDB when it changes
  useEffect(() => {
    saveChatOpenState(isChatOpen);
  }, [isChatOpen]);

  // Load chat history from IndexedDB
  useEffect(() => {
    const loadHistory = async () => {
      const history = await loadChatHistory();
      setChatHistory(history);
    };
    
    loadHistory();
  }, []);

  // Save chat history to IndexedDB when it changes
  useEffect(() => {
    if (chatHistory.length > 0) {
      saveChatHistory(chatHistory);
    }
  }, [chatHistory]);

  // Update spreadsheetData when active sheet changes
  useEffect(() => {
    // This effect is no longer needed since we're not tracking spreadsheetData
    // We can access the active sheet data directly when needed via getActiveSheetData()
  }, [activeSheetId, getActiveSheetData]);

  // Cleanup database on initial load
  useEffect(() => {
    const cleanupDatabase = async () => {
      try {
        // Check for and clean up duplicate sheets on startup
        const removedCount = await db.cleanupDuplicateSheets();
        if (removedCount > 0) {
          console.log(`Cleaned up ${removedCount} duplicate sheets on startup.`);
        }
      } catch (error) {
        console.error("Error cleaning up database on startup:", error);
      }
    };
    
    cleanupDatabase();
  }, []);

  const handleStop = () => {
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
    }
  };

  const handleSend = async (message: string, documentImage?: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      text: message,
      response: "",
      timestamp: new Date(),
      status: "pending",
      // If an image was uploaded, store this info in the message
      hasImage: !!documentImage,
      documentImage: documentImage
    };
    setChatHistory((prev) => [...prev, newMessage]);

    try {
      // Create new AbortController for this request
      abortController.current = new AbortController();

      const formattedHistory = prepareChatHistory(chatHistory);
      
      // Get the active sheet information
      const activeSheetName = getActiveSheetName();
      
      // PHASE 1: Data Selection
      // First, analyze the spreadsheet structure to determine what data is needed
      const structureInfo = analyzeActiveSheetStructure();
      
      console.log("Starting data selection phase...");
      
      const selectionResponse = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          // Send spreadsheet structure instead of full data
          spreadsheetData: { structure: structureInfo },
          activeSheetName: activeSheetName,
          sheetsInfo: sheets.map(sheet => ({ id: sheet.id, name: sheet.name })),
          chatHistory: formattedHistory,
          documentImage: documentImage,
          dataSelectionMode: true, // Signal this is the data selection phase
        }),
        signal: abortController.current.signal,
      });

      if (abortController.current.signal.aborted) {
        throw new Error("AbortError");
      }
      
      // Add additional logic for data selection phase handling and fallback
      // Process the data selection response with better error handling
      let selectionTimeout: NodeJS.Timeout | null = null;
      const selectionPromise = new Promise<any>(async (resolve, reject) => {
        // Set a timeout to avoid waiting too long for the selection phase
        selectionTimeout = setTimeout(() => {
          console.log("Data selection phase timed out, using fallback");
          resolve({
            fallback: true,
            dataSelection: {
              selectionType: "range",
              range: "A1:Z20" // Default to first 20 rows
            },
            analysisType: "summary",
            explanation: "Using fallback selection due to timeout"
          });
        }, 15000); // 15 second timeout
        
        try {
          // Process the data selection response
          const selectionReader = selectionResponse.body?.getReader();
          if (!selectionReader) {
            throw new Error("Could not read selection response stream.");
          }
          
          // Variables to accumulate partial JSON chunks
          let selectionChunk = "";
          let dataSelectionResult: any = null;
          
          while (true) {
            const { done, value } = await selectionReader.read();
            if (done) break;
            
            selectionChunk += new TextDecoder().decode(value);
            console.log("selectionChunk", selectionChunk);
            
            // Try to extract complete event chunks
            const events = selectionChunk.split("\n\n").filter(Boolean);
            console.log("events count:", events.length);
            
            // Process complete events
            for (const event of events) {
              if (event.startsWith("data: ")) {
                try {
                  const jsonData = JSON.parse(event.substring(6));
                  console.log("Parsed selection data:", JSON.stringify(jsonData, null, 2));
                  
                  // Check if we have a data selection result
                  if (jsonData.dataSelectionResult) {
                    dataSelectionResult = jsonData.dataSelectionResult;
                    console.log("Found dataSelectionResult:", JSON.stringify(dataSelectionResult, null, 2));
                    
                    // Update the chat message with the initial response
                    setChatHistory((prev) =>
                      prev.map((msg) =>
                        msg.id === newMessage.id
                          ? {
                              ...msg,
                              response: `Analyzing your data using ${dataSelectionResult.analysisType} analysis...`,
                            }
                          : msg
                      )
                    );
                    
                    // Clear the timeout and resolve with the result
                    if (selectionTimeout) {
                      clearTimeout(selectionTimeout);
                      selectionTimeout = null;
                    }
                    resolve(dataSelectionResult);
                    return;
                  } else if (jsonData.structureAnalysisResult) {
                    // Handle structure analysis result
                    const { scopeNeeded } = jsonData.structureAnalysisResult;
                    console.log("Found structureAnalysisResult with scope:", scopeNeeded);
                    
                    // Continue processing - we're looking for dataSelectionResult
                  } else if (jsonData.error) {
                    console.error("Error in selection phase:", jsonData.error);
                    throw new Error(jsonData.error);
                  } else {
                    console.log("No selection result found in response, got:", Object.keys(jsonData));
                  }
                } catch (e) {
                  console.error("Error parsing selection SSE data:", e);
                  // Continue to next event - this one might be partial
                }
              }
            }
            
            // Remove processed events from the chunk
            const lastEventIndex = selectionChunk.lastIndexOf("\n\n");
            if (lastEventIndex >= 0) {
              selectionChunk = selectionChunk.substring(lastEventIndex + 2);
            }
          }
          
          // If we get here without resolving, use a fallback
          console.log("Data selection phase completed without finding selection result, using fallback");
          resolve({
            fallback: true,
            dataSelection: {
              selectionType: "range",
              range: "A1:Z20" // Default to first 20 rows
            },
            analysisType: "summary",
            explanation: "Using fallback selection due to no selection result"
          });
        } catch (error) {
          console.error("Error in data selection phase:", error);
          
          // If there's an error, use a fallback selection
          if (selectionTimeout) {
            clearTimeout(selectionTimeout);
            selectionTimeout = null;
          }
          
          // Resolve with fallback rather than rejecting
          resolve({
            fallback: true,
            dataSelection: {
              selectionType: "range",
              range: "A1:Z20" // Default to first 20 rows
            },
            analysisType: "summary",
            explanation: "Using fallback selection due to error"
          });
        }
      });

      // Wait for the selection phase and get the result
      const dataSelectionResult = await selectionPromise;

      // If aborted during the data selection phase
      if (abortController.current.signal.aborted) {
        throw new Error("AbortError");
      }
      
      // PHASE 2: Data Analysis with Selected Data
      // Now that we know what data is needed, get only that specific data
      let relevantData: any[][] = getActiveSheetData(); // Default to full data
      
      let columnReference: string | undefined;
      
      if (dataSelectionResult) {
        const { analysisType, dataSelection, explanation, fallback } = dataSelectionResult;
        console.log(`Data selection result: ${analysisType} analysis with ${dataSelection.selectionType}${fallback ? " (fallback)" : ""}`);
        console.log("Full selection details:", JSON.stringify(dataSelection, null, 2));
        
        // Get the relevant data based on the selection type
        switch (dataSelection.selectionType) {
          case "range":
            if (dataSelection.range) {
              console.log(`Getting data range: ${dataSelection.range}`);
              relevantData = getDataRange(dataSelection.range);
            }
            break;
          case "column":
            if (dataSelection.column) {
              // Convert column data to 2D array for consistency
              console.log(`Getting column data: ${dataSelection.column}`);
              const columnData = getColumnData(dataSelection.column);
              console.log(`Column data length: ${columnData.length}`);
              
              // Save the original column reference to pass through to the API
              relevantData = columnData.map((cell: any) => [cell]);
              // Also store the original column name in the API request
              columnReference = dataSelection.column;
            }
            break;
          case "row":
            if (dataSelection.row) {
              // Convert row data to 2D array for consistency
              console.log(`Getting row data: ${dataSelection.row}`);
              const rowData = getRowData(dataSelection.row);
              console.log(`Row data length: ${rowData.length}`);
              relevantData = [rowData];
            }
            break;
          case "table":
            if (dataSelection.tableStartCell) {
              console.log(`Getting table from start cell: ${dataSelection.tableStartCell}, hasHeaders: ${dataSelection.hasHeaders}`);
              const tableResult = getTableData(
                dataSelection.tableStartCell, 
                dataSelection.hasHeaders !== false
              );
              console.log(`Table headers: ${tableResult.headers.join(', ')}`);
              console.log(`Table data rows: ${tableResult.data.length}`);
              // Convert table data to include headers if they exist
              relevantData = [tableResult.headers, ...tableResult.data];
            }
            break;
          case "search":
            if (dataSelection.searchTerm) {
              // For search, we might want to include context around the found cells
              console.log(`Searching for term: ${dataSelection.searchTerm}`);
              const ranges = findRangesWithTerm(dataSelection.searchTerm);
              console.log(`Found in cells: ${ranges.join(', ')}`);
              if (ranges.length > 0) {
                // Just use the first cell found as the top-left of a range
                const searchRange = `${ranges[0]}:${String.fromCharCode(65 + 10)}${parseInt(ranges[0].match(/\d+/)?.[0] || "1") + 10}`;
                console.log(`Using range: ${searchRange}`);
                relevantData = getDataRange(searchRange);
              }
            }
            break;
          default:
            console.log(`Unrecognized selection type: ${dataSelection.selectionType}, using minimal structure`);
            // Use minimal structure if the selection type is not recognized
            relevantData = getMinimalStructure();
        }
      }
      
      // Now send the actual analysis request with only the relevant data
      console.log("relevantData", relevantData);
      const response = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          spreadsheetData: relevantData,
          activeSheetName: activeSheetName,
          sheetsInfo: sheets.map(sheet => ({ id: sheet.id, name: sheet.name })),
          chatHistory: formattedHistory,
          documentImage: documentImage,
          dataSelectionMode: false, // This is the analysis phase
          dataSelectionResult, // Pass the selection result for context
          columnReference, // Pass the original column reference
        }),
        signal: abortController.current.signal,
      });

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Could not read response stream.");
      }

      let accumulatedResponse = "";
      let updates: CellUpdate[] | undefined;
      let chartData: any | undefined;
      let lastParsedData: any | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const events = chunk.split("\n\n").filter(Boolean);

        for (const event of events) {
          if (event.startsWith("data: ")) {
            const jsonData = event.substring(6);
            try {
              const parsedData = JSON.parse(jsonData);
              lastParsedData = parsedData;
              
              // Handle sheet operations from LLM
              if (parsedData.sheetOperation) {
                const op = parsedData.sheetOperation;
                
                if (op.type === 'add' && op.sheetName) {
                  // Add a new sheet
                  addSheet();
                  if (op.initialData) {
                    // We need to wait for the state update to complete
                    // before we can access the new sheet
                    setTimeout(() => {
                      // Get the last sheet (which should be the one we just added)
                      const newSheet = sheets[sheets.length - 1];
                      if (newSheet) {
                        // We need to use the updateSheetData function from the context
                        // but we can't directly reference it here due to scope issues
                        // So we'll dispatch a custom event that the Spreadsheet component can listen for
                        const customEvent = new CustomEvent('updateNewSheetData', {
                          detail: {
                            sheetId: newSheet.id,
                            data: op.initialData
                          }
                        });
                        window.dispatchEvent(customEvent);
                      }
                    }, 0);
                  }
                } 
                else if (op.type === 'rename' && op.currentName && op.newName) {
                  // Find the sheet by name
                  const sheet = getSheetByName(op.currentName);
                  if (sheet) {
                    // Rename the sheet
                    renameSheet(sheet.id, op.newName);
                  }
                }
                else if (op.type === 'clear' && op.sheetName) {
                  // Find the sheet by name
                  const sheet = getSheetByName(op.sheetName);
                  if (sheet) {
                    // Clear the sheet
                    clearSheet(sheet.id);
                  }
                }
                else if (op.type === 'remove' && op.sheetName) {
                  // Find the sheet by name
                  const sheet = getSheetByName(op.sheetName);
                  if (sheet) {
                    // Remove the sheet
                    removeSheet(sheet.id);
                  }
                }
              }
              
              if (parsedData.response) {
                accumulatedResponse = parsedData.response;
                updates = parsedData.updates;
                chartData = parsedData.chartData;
              }

              // Update the chat message with current state
              setChatHistory((prev) =>
                prev.map((msg) =>
                  msg.id === newMessage.id
                    ? {
                        ...msg,
                        response: accumulatedResponse,
                        updates: updates,
                        chartData: chartData,
                        analysis: parsedData?.analysis,
                        status: updates || chartData ? "completed" : null,
                      }
                    : msg
                )
              );

              // Update chart if present
              if (chartData) {
                setChartData(chartData);
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e);
            }
          }
        }
      }

      // Final update
      setChatHistory((prev) =>
        prev.map((msg) =>
          msg.id === newMessage.id
            ? {
                ...msg,
                response: accumulatedResponse,
                updates: updates,
                chartData: chartData,
                analysis: lastParsedData?.analysis,
                status: updates || chartData ? "completed" : null,
              }
            : msg
        )
      );
    } catch (error: unknown) {
      if ((error as Error).name === "AbortError" || (error as Error).message === "AbortError") {
        console.log("Request Aborted");
        // Handle abort case
        setChatHistory((prev) =>
          prev.map((msg) =>
            msg.id === newMessage.id
              ? {
                  ...msg,
                  response: msg.response + "\n Response perished in the flames",
                  status: null,
                }
              : msg
          )
        );
      } else {
        // Handle other errors
        console.error("Error in handleSend:", error);
        setChatHistory((prev) =>
          prev.map((msg) =>
            msg.id === newMessage.id
              ? {
                  ...msg,
                  response: `Error: ${
                    error instanceof Error
                      ? error.message
                      : "An unknown error occurred"
                  }`,
                  status: null,
                }
              : msg
          )
        );
      }
    } finally {
      abortController.current = null;
    }
  };

  const handleAccept = (updates: CellUpdate[], messageId: string) => {
    setFormulas(updates);
    setChatHistory((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, status: "accepted" } : msg,
      ),
    );
  };

  const handleReject = (messageId: string) => {
    setChatHistory((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, status: "rejected" } : msg,
      ),
    );
  };

  const handleClearHistory = async () => {
    setChatHistory([]);
    try {
      await db.clearChatHistory();
    } catch (error) {
      console.error("Error clearing chat history from IndexedDB:", error);
    }
  };

  // Helper function to load chat open state from IndexedDB
  const loadChatOpenState = async (): Promise<boolean> => {
    try {
      const chatOpen = await db.getPreference('chatOpen');
      return chatOpen === true;
    } catch (error) {
      console.error("Error loading chat open state from IndexedDB:", error);
      return false;
    }
  };

  // Helper function to save chat open state to IndexedDB
  const saveChatOpenState = async (isOpen: boolean): Promise<void> => {
    try {
      await db.setPreference('chatOpen', isOpen);
    } catch (error) {
      console.error("Error saving chat open state to IndexedDB:", error);
    }
  };

  return (
    <main className="h-screen w-screen flex flex-col bg-gray-50">
      {/* Title bar */}
      <div className="h-10 border-b border-gray-200 bg-white flex items-center justify-between px-4">
        <div className="text-sm font-medium text-gray-600">
          Probly
        </div>
        <div className="flex items-center gap-2"></div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="flex gap-4 h-full relative">
          <div className="flex-1 bg-white rounded-lg shadow-sm">
            <Spreadsheet ref={spreadsheetRef} />
          </div>
          {/* Chat sidebar */}
          <div
            className={`fixed right-4 top-[5.5rem] bottom-16 w-96 transition-transform duration-300 transform ${
              isChatOpen ? "translate-x-0" : "translate-x-full"
            }`}
            style={{
              backgroundColor: "white",
              boxShadow: "0 0 10px rgba(0, 0, 0, 0.1)",
              zIndex: 9999,
            }}
          >
            <ChatBox
              onSend={handleSend}
              onStop={handleStop}
              chatHistory={chatHistory}
              clearHistory={handleClearHistory}
              onAccept={handleAccept}
              onReject={handleReject}
              message={message}
              setMessage={setMessage}
              isPromptLibraryOpen={isPromptLibraryOpen}
              setIsPromptLibraryOpen={setIsPromptLibraryOpen}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="h-12 border-t border-gray-200 bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {/* Empty or for other controls */}
        </div>
        <div className="flex items-center gap-2">
        
          <button
            onClick={() => setIsChatOpen((prev) => !prev)}
            className="p-2 rounded hover:bg-gray-100 transition-colors"
            title="Toggle Chat (Ctrl+Shift+?)"
          >
            <MessageCircle size={20} />
          </button>
        </div>
      </div>
    </main>
  );
};

const HomePage = () => {
  return (
    <SpreadsheetProvider>
      <SpreadsheetApp />
    </SpreadsheetProvider>
  );
};

export default HomePage;
