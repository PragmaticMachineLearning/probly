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
];
