import { ChatMessage } from "@/types/api";

// Define a generic message type for OpenAI API
interface ApiChatMessage {
  role: "system" | "user" | "assistant" | "function";
  content: string;
  name?: string;
}

const MAX_HISTORY_MESSAGES = 10; // Adjust based on your needs
const MAX_TOKENS_PER_MESSAGE = 1000; // Increased token limit to accommodate longer prompts

export const prepareChatHistory = (chatHistory: ChatMessage[]): any[] => {
  return chatHistory.map((msg) => {
    if (msg.text) {
      return {
        role: "user",
        content: msg.text,
      };
    } else {
      return {
        role: "assistant",
        content: msg.response || "",
      };
    }
  });
};
