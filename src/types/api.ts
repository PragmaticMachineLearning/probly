export interface ChatMessage {
  id: string;
  text: string;
  response: string;
  timestamp: Date;
  status: "pending" | "accepted" | "rejected" | "completed" | null;
  updates?: CellUpdate[];
  chartData?: any;
  analysis?: {
    goal: string;
    output: string;
    error?: string;
  };
  hasImage?: boolean;
  documentImage?: string;
}

export interface CellUpdate {
  formula: string;
  target: string;
  sheetName?: string;
}

export interface LLMResponse {
  updates: CellUpdate[];
}
