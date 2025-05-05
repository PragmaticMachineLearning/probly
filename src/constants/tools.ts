// Define a generic tool type instead of using OpenAI's type
interface FunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export const tools: FunctionTool[] = [
  {
    type: "function",
    function: {
      name: "set_spreadsheet_cells",
      description: "Set values to specified spreadsheet cells",
      parameters: {
        type: "object",
        properties: {
          cellUpdates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                formula: { type: "string" },
                target: { type: "string" },
                sheetName: {
                  type: "string",
                  description:
                    "Optional. The name of the sheet to update. If not provided, the active sheet will be used.",
                },
              },
              required: ["formula", "target"],
              additionalProperties: false,
            },
          },
        },
        required: ["cellUpdates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "select_data_for_analysis",
      description:
        "Select the most relevant data for analysis based on the user query",
      parameters: {
        type: "object",
        properties: {
          analysisType: {
            type: "string",
            enum: [
              "statistical",
              "trend",
              "summary",
              "forecast",
              "comparison",
              "custom",
            ],
            description: "The type of analysis that needs to be performed",
          },
          dataSelection: {
            type: "object",
            properties: {
              selectionType: {
                type: "string",
                enum: ["range", "column", "row", "table", "search"],
                description: "The type of data selection to perform",
              },
              range: {
                type: "string",
                description:
                  "A cell range in A1 notation (e.g., 'A1:C10'). Required if selectionType is 'range'.",
              },
              column: {
                type: "string",
                description:
                  "Column reference (e.g., 'A'). Required if selectionType is 'column'.",
              },
              row: {
                type: "number",
                description:
                  "Row number (1-based). Required if selectionType is 'row'.",
              },
              tableStartCell: {
                type: "string",
                description:
                  "Top-left cell of the table in A1 notation. Required if selectionType is 'table'.",
              },
              hasHeaders: {
                type: "boolean",
                description:
                  "Whether the table has headers. Only relevant if selectionType is 'table'.",
              },
              searchTerm: {
                type: "string",
                description:
                  "Term to search for in the spreadsheet. Required if selectionType is 'search'.",
              },
            },
            required: ["selectionType"],
          },
          explanation: {
            type: "string",
            description:
              "Explanation of why this data selection is relevant to the user's query",
          },
        },
        required: ["analysisType", "dataSelection", "explanation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_spreadsheet_structure",
      description:
        "Analyze the structure of the active spreadsheet to identify relevant data for the user's query",
      parameters: {
        type: "object",
        properties: {
          scopeNeeded: {
            type: "string",
            enum: ["full", "minimal", "auto"],
            description:
              "The scope of analysis needed to answer the user's query",
          },
          explanation: {
            type: "string",
            description: "Explanation of why this type of analysis is needed",
          },
        },
        required: ["scopeNeeded"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_chart",
      description:
        "Create a chart in the spreadsheet based on the type of chart specified by the user",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["line", "bar", "pie", "scatter"],
            description: "The type of chart to create",
          },
          title: {
            type: "string",
            description: "The title of the chart",
          },
          data: {
            type: "array",
            items: {
              type: "array",
              items: {
                type: ["string", "number"],
              },
            },
            description:
              "The data for the chart, first row should contain headers",
          },
          sheetName: {
            type: "string",
            description:
              "Optional. The name of the sheet the data is from. For reference only.",
          },
        },
        required: ["type", "title", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_python_code",
      description:
        "Execute Python code for complex data analysis and return results as cell updates",
      parameters: {
        type: "object",
        properties: {
          analysis_goal: {
            type: "string",
            description: "Description of what the analysis aims to achieve",
          },
          suggested_code: {
            type: "string",
            description: "Python code to execute the analysis",
          },
          start_cell: {
            type: "string",
            description:
              "Start cell reference (e.g., 'A1') where the results should begin.",
          },
          sheetName: {
            type: "string",
            description:
              "Optional. The name of the sheet to place results. If not provided, the active sheet will be used.",
          },
        },
        required: ["analysis_goal", "suggested_code", "start_cell"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sheet_info",
      description:
        "Get information about available sheets and the active sheet",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_sheet",
      description: "Add a new sheet to the spreadsheet",
      parameters: {
        type: "object",
        properties: {
          sheetName: {
            type: "string",
            description: "The name of the new sheet to add",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_sheet",
      description: "Remove an existing sheet",
      parameters: {
        type: "object",
        properties: {
          sheetName: {
            type: "string",
            description: "The name of the sheet to remove",
          },
        },
        required: ["sheetName"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "rename_sheet",
      description: "Rename an existing sheet",
      parameters: {
        type: "object",
        properties: {
          currentName: {
            type: "string",
            description: "The current name of the sheet to rename",
          },
          newName: {
            type: "string",
            description: "The new name for the sheet",
          },
        },
        required: ["currentName", "newName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_sheet",
      description: "Clear all data from a sheet",
      parameters: {
        type: "object",
        properties: {
          sheetName: {
            type: "string",
            description:
              "The name of the sheet to clear. If not provided, the active sheet will be cleared.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "document_analysis",
      description:
        "Extract and analyze information from uploaded documents like receipts, invoices, tables, etc.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: [
              "extract_data",
              "extract_text",
              "extract_table",
              "analyze_receipt",
              "analyze_invoice",
            ],
            description:
              "The type of extraction or analysis to perform on the document",
          },
          target_sheet: {
            type: "string",
            description:
              "Optional. The name of the sheet where extracted data should be placed. If not provided, the active sheet will be used.",
          },
          start_cell: {
            type: "string",
            description:
              "The cell reference (e.g., 'A1') where extracted data should start. If not provided, data will be placed in an appropriate location.",
          },
        },
        required: ["operation", "start_cell"],
      },
    },
  },
];
