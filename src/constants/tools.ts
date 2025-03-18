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
                  description: "Optional. The name of the sheet to update. If not provided, the active sheet will be used."
                }
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
            description: "Optional. The name of the sheet the data is from. For reference only."
          }
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
            description: "Optional. The name of the sheet to place results. If not provided, the active sheet will be used."
          }
        },
        required: ["analysis_goal", "suggested_code", "start_cell"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sheet_info",
      description: "Get information about available sheets and the active sheet",
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
            description: "The name of the new sheet to add"
          }
        },
      }
    }
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
            description: "The name of the sheet to remove"
          }
        },
        required: ["sheetName"]
      }
    }
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
            description: "The current name of the sheet to rename"
          },
          newName: {
            type: "string",
            description: "The new name for the sheet"
          }
        },
        required: ["currentName", "newName"]
      }
    }
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
            description: "The name of the sheet to clear. If not provided, the active sheet will be cleared."
          }
        },
        required: []
      }
    }
  }
];
