export interface ChatMessage {
  id: string;
  text: string;
  response: string;
  timestamp: Date;
  status: "pending" | "accepted" | "rejected" | null;
  updates?: CellUpdate[];
  streaming?: boolean;
  chartData?: any;
  analysis?: {
    goal: string;
    output: string;
    error?: string;
  };
}

export interface CellUpdate {
  formula: string;
  target: string;
  sheetName?: string;
}

export interface LLMResponse {
  updates: CellUpdate[];
}
