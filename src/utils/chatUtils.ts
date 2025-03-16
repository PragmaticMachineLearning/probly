import { ChatMessage } from "@/types/api";

// Define a generic message type for OpenAI API
interface ApiChatMessage {
  role: "system" | "user" | "assistant" | "function";
  content: string;
  name?: string;
}

const MAX_HISTORY_MESSAGES = 10; // Adjust based on your needs
const MAX_TOKENS_PER_MESSAGE = 1000; // Increased token limit to accommodate longer prompts

/**
 * Checks if a keyboard event matches a specific key combination
 * @param e The keyboard event
 * @param key The key to check
 * @param ctrl Whether Ctrl key should be pressed
 * @param shift Whether Shift key should be pressed
 * @param alt Whether Alt key should be pressed
 * @returns True if the key combination matches
 */
export const isKeyCombo = (
  e: KeyboardEvent, 
  key: string, 
  ctrl = false, 
  shift = false, 
  alt = false
): boolean => {
  return e.key === key && 
    e.ctrlKey === ctrl && 
    e.shiftKey === shift && 
    e.altKey === alt;
};

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
