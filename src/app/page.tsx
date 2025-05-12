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
    findRangesWithTerm,
    SpreadsheetMetadata
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
      const metadata = SpreadsheetMetadata();
      
      console.log("Starting data selection phase...");
      
      const response = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          // Send spreadsheet structure and metadata instead of full data
          spreadsheetData: { 
            structure: structureInfo,
            metadata 
          },
          activeSheetName: activeSheetName,
          sheetsInfo: sheets.map(sheet => ({ id: sheet.id, name: sheet.name })),
          chatHistory: formattedHistory,
          documentImage: documentImage,
        }),
        signal: abortController.current.signal,
      });

      if (abortController.current.signal.aborted) {
        throw new Error("AbortError");
      }
      
      // Process the response with better error handling
      let timeout: NodeJS.Timeout | null = null;
      const promise = new Promise<any>(async (resolve, reject) => {
        // Set a timeout to avoid waiting too long
        timeout = setTimeout(() => {
          console.log("Request timed out");
          resolve({
            fallback: true,
            response: "Request timed out. Please try again with a simpler request.",
          });
        }, 30000); // 30 second timeout
        
        try {
          // Process the response
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("Could not read response stream.");
          }
          
          // Variables to accumulate partial JSON chunks
          let chunk = "";
          let result: any = null;
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            chunk += new TextDecoder().decode(value);
            
            // Try to extract complete event chunks
            const events = chunk.split("\n\n").filter(Boolean);
            
            // Process complete events
            for (const event of events) {
              if (event.startsWith("data: ")) {
                try {
                  const jsonData = JSON.parse(event.substring(6));
                  
                  // Handle any tool response
                  if (jsonData.dataSelectionResult) {
                    result = jsonData.dataSelectionResult;
                    
                    // Update the chat message with the initial response
                    setChatHistory((prev) =>
                      prev.map((msg) =>
                        msg.id === newMessage.id
                          ? {
                              ...msg,
                              response: `Analyzing your data using ${result.analysisType} analysis...`,
                            }
                          : msg
                      )
                    );
                    
                    // Clear the timeout and resolve with the result
                    if (timeout) {
                      clearTimeout(timeout);
                      timeout = null;
                    }
                    resolve(result);
                    return;
                  } else if (jsonData.updates) {
                    // Handle spreadsheet updates
                    result = {
                      updates: jsonData.updates,
                      response: jsonData.response
                    };
                    
                    // Update the chat message with the response
                    setChatHistory((prev) =>
                      prev.map((msg) =>
                        msg.id === newMessage.id
                          ? {
                              ...msg,
                              response: jsonData.response,
                              updates: jsonData.updates,
                              status: "completed"
                            }
                          : msg
                      )
                    );
                    
                    // Clear the timeout and resolve with the result
                    if (timeout) {
                      clearTimeout(timeout);
                      timeout = null;
                    }
                    resolve(result);
                    return;
                  } else if (jsonData.chartData) {
                    // Handle chart data
                    result = {
                      chartData: jsonData.chartData,
                      response: jsonData.response
                    };
                    
                    // Update the chat message with the response
                    setChatHistory((prev) =>
                      prev.map((msg) =>
                        msg.id === newMessage.id
                          ? {
                              ...msg,
                              response: jsonData.response,
                              chartData: jsonData.chartData,
                              status: "completed"
                            }
                          : msg
                      )
                    );
                    
                    // Clear the timeout and resolve with the result
                    if (timeout) {
                      clearTimeout(timeout);
                      timeout = null;
                    }
                    resolve(result);
                    return;
                  } else if (jsonData.sheetOperation) {
                    // Handle sheet operations
                    result = {
                      sheetOperation: jsonData.sheetOperation,
                      response: jsonData.response
                    };
                    
                    // Update the chat message with the response
                    setChatHistory((prev) =>
                      prev.map((msg) =>
                        msg.id === newMessage.id
                          ? {
                              ...msg,
                              response: jsonData.response,
                              status: "completed"
                            }
                          : msg
                      )
                    );
                    
                    // Clear the timeout and resolve with the result
                    if (timeout) {
                      clearTimeout(timeout);
                      timeout = null;
                    }
                    resolve(result);
                    return;
                  } else if (jsonData.error) {
                    console.error("Error in response:", jsonData.error);
                    throw new Error(jsonData.error);
                  } else if (jsonData.response) {
                    // Handle simple text response
                    result = {
                      response: jsonData.response
                    };
                    
                    // Update the chat message with the response
                    setChatHistory((prev) =>
                      prev.map((msg) =>
                        msg.id === newMessage.id
                          ? {
                              ...msg,
                              response: jsonData.response,
                              status: "completed"
                            }
                          : msg
                      )
                    );
                    
                    // Clear the timeout and resolve with the result
                    if (timeout) {
                      clearTimeout(timeout);
                      timeout = null;
                    }
                    resolve(result);
                    return;
                  }
                } catch (e) {
                  console.error("Error parsing SSE data:", e);
                  // Continue to next event - this one might be partial
                }
              }
            }
            
            // Remove processed events from the chunk
            const lastEventIndex = chunk.lastIndexOf("\n\n");
            if (lastEventIndex >= 0) {
              chunk = chunk.substring(lastEventIndex + 2);
            }
          }
          
          // If we get here without resolving, use a fallback
          console.log("Request completed without finding a valid response, using fallback");
          resolve({
            fallback: true,
            response: "Could not process the response. Please try again with a more specific request.",
          });
        } catch (error) {
          console.error("Error in request:", error);
          
          // If there's an error, use a fallback
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
          
          // Resolve with fallback rather than rejecting
          resolve({
            fallback: true,
            response: "An error occurred while processing your request. Please try again.",
          });
        }
      });

      // Wait for the response and get the result
      const result = await promise;

      // If aborted during the request
      if (abortController.current.signal.aborted) {
        throw new Error("AbortError");
      }
      
      // Only proceed with data selection if we got a data selection result
      if (result && result.dataSelection) {
        // Now send the actual analysis request with only the relevant data
        let relevantData: any[][] = getActiveSheetData(); // Default to full data
        let columnReference: string | undefined;
        
        const { analysisType, dataSelection, explanation, fallback } = result;
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
              console.log(`Getting column data: ${dataSelection.column}`);
              const columnData = getColumnData(dataSelection.column);
              console.log(`Column data length: ${columnData.length}`);
              relevantData = columnData.map((cell: any) => [cell]);
              columnReference = dataSelection.column;
            }
            break;
          case "row":
            if (dataSelection.row) {
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
              relevantData = [tableResult.headers, ...tableResult.data];
            }
            break;
          case "search":
            if (dataSelection.searchTerm) {
              console.log(`Searching for term: ${dataSelection.searchTerm}`);
              const ranges = findRangesWithTerm(dataSelection.searchTerm);
              console.log(`Found in cells: ${ranges.join(', ')}`);
              if (ranges.length > 0) {
                const searchRange = `${ranges[0]}:${String.fromCharCode(65 + 10)}${parseInt(ranges[0].match(/\d+/)?.[0] || "1") + 10}`;
                console.log(`Using range: ${searchRange}`);
                relevantData = getDataRange(searchRange);
              }
            }
            break;
          default:
            console.log(`Unrecognized selection type: ${dataSelection.selectionType}, using minimal structure`);
            relevantData = getMinimalStructure();
        }
        
        // Now send the actual analysis request with only the relevant data
        console.log("relevantData", relevantData);
        const analysisResponse = await fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            spreadsheetData: relevantData,
            activeSheetName: activeSheetName,
            sheetsInfo: sheets.map(sheet => ({ id: sheet.id, name: sheet.name })),
            chatHistory: formattedHistory,
            documentImage: documentImage,
            dataSelectionResult: result,
            columnReference,
          }),
          signal: abortController.current.signal,
        });

        const analysisReader = analysisResponse.body?.getReader();
        if (!analysisReader) {
          throw new Error("Could not read analysis response stream.");
        }

        while (true) {
          const { done, value } = await analysisReader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);
          const events = chunk.split("\n\n").filter(Boolean);

          for (const event of events) {
            if (event.startsWith("data: ")) {
              const jsonData = JSON.parse(event.substring(6));
              
              // Update the chat message with current state
              setChatHistory((prev) =>
                prev.map((msg) =>
                  msg.id === newMessage.id
                    ? {
                        ...msg,
                        response: jsonData.response || msg.response,
                        updates: jsonData.updates || msg.updates,
                        chartData: jsonData.chartData || msg.chartData,
                        analysis: jsonData.analysis || msg.analysis,
                        status: jsonData.updates || jsonData.chartData ? "completed" : msg.status,
                      }
                    : msg
                )
              );

              // Update chart if present
              if (jsonData.chartData) {
                setChartData(jsonData.chartData);
              }
            }
          }
        }
      }
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
