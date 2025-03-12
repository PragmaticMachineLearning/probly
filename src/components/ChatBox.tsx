import { BookOpen, Check, Edit2, Loader2, Plus, Save, Search, Send, Square, Trash2, X } from "lucide-react";
import { CellUpdate, ChatMessage } from "@/types/api";
import { useEffect, useRef, useState } from "react";

import ToolResponse from './ToolResponse';
import { predefinedPrompts } from '@/constants/prompts';

interface Prompt {
  id: string;
  title: string;
  content: string;
}

interface ChatBoxProps {
  onSend: (message: string) => Promise<void>;
  onStop: () => void;
  onAccept: (updates: CellUpdate[], messageId: string) => void;
  onReject: (messageId: string) => void;
  chatHistory: ChatMessage[];
  clearHistory: () => void;
  message: string;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
}

const ChatBox = ({
  onSend,
  onStop,
  onAccept,
  onReject,
  chatHistory,
  clearHistory,
  message,
  setMessage,
}: ChatBoxProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newPromptTitle, setNewPromptTitle] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const [isAddingPrompt, setIsAddingPrompt] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load prompts from localStorage on mount
  useEffect(() => {
    const savedPrompts = localStorage.getItem('userPrompts');
    if (savedPrompts) {
      try {
        const parsed = JSON.parse(savedPrompts);
        setPrompts([...predefinedPrompts, ...parsed]);
      } catch (error) {
        console.error('Error loading prompts:', error);
        setPrompts([...predefinedPrompts]);
      }
    } else {
      setPrompts([...predefinedPrompts]);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  useEffect(() => {
    if (chatHistory.length > 0) {
      const lastMessage = chatHistory[chatHistory.length - 1];
      setIsLoading(!!lastMessage.streaming);
    }
  }, [chatHistory]);

  // Focus and adjust textarea when message changes
  useEffect(() => {
    if (message && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Focus search input when prompt library opens
  useEffect(() => {
    if (showPromptLibrary && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [showPromptLibrary]);

  const handleSend = async () => {
    if (message.trim() || isLoading) {
      if (isLoading) {
        onStop();
        setIsLoading(false);
        return;
      }
      const messageToSend = message;
      setMessage("");
      setIsLoading(true);
      try {
        await onSend(messageToSend);
      } catch (error) {
        console.error("Error details:", error);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  // Filter prompts based on search query
  const filteredPrompts = prompts.filter(
    prompt => 
      prompt.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      prompt.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectPrompt = (promptContent: string) => {
    setMessage(promptContent);
    setShowPromptLibrary(false);
    if (textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current!.style.height = 'auto';
        textareaRef.current!.style.height = `${textareaRef.current!.scrollHeight}px`;
      }, 100);
    }
  };

  const handleSavePrompt = () => {
    if (!newPromptTitle.trim() || !newPromptContent.trim()) return;
    
    if (editingPromptId) {
      // Update existing prompt
      const updatedPrompts = prompts.map(prompt => 
        prompt.id === editingPromptId 
          ? { ...prompt, title: newPromptTitle.trim(), content: newPromptContent.trim() } 
          : prompt
      );
      setPrompts(updatedPrompts);
      setEditingPromptId(null);
    } else {
      // Create new prompt
      const newPrompt: Prompt = {
        id: Date.now().toString(),
        title: newPromptTitle.trim(),
        content: newPromptContent.trim()
      };
      
      const updatedPrompts = [...prompts, newPrompt];
      setPrompts(updatedPrompts);
    }
    
    // Save user prompts to localStorage (excluding predefined ones)
    const userPrompts = prompts.filter(
      prompt => !predefinedPrompts.some(p => p.id === prompt.id)
    );
    localStorage.setItem('userPrompts', JSON.stringify(userPrompts));
    
    // Reset form
    setNewPromptTitle('');
    setNewPromptContent('');
    setIsAddingPrompt(false);
  };

  const handleEditPrompt = (prompt: Prompt) => {
    setNewPromptTitle(prompt.title);
    setNewPromptContent(prompt.content);
    setEditingPromptId(prompt.id);
    setIsAddingPrompt(true);
  };

  const handleDeletePrompt = (id: string) => {
    // Check if it's a predefined prompt
    if (predefinedPrompts.some(p => p.id === id)) {
      alert("Cannot delete predefined prompts");
      return;
    }
    
    const updatedPrompts = prompts.filter(prompt => prompt.id !== id);
    setPrompts(updatedPrompts);
    
    // Save updated user prompts to localStorage
    const userPrompts = updatedPrompts.filter(
      prompt => !predefinedPrompts.some(p => p.id === prompt.id)
    );
    localStorage.setItem('userPrompts', JSON.stringify(userPrompts));
  };

  const handleCancelEdit = () => {
    setNewPromptTitle('');
    setNewPromptContent('');
    setEditingPromptId(null);
    setIsAddingPrompt(false);
  };

  const togglePromptLibrary = () => {
    setShowPromptLibrary(!showPromptLibrary);
    if (!showPromptLibrary) {
      setSearchQuery('');
      setIsAddingPrompt(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center bg-white z-10">
        <div>
          <h2 className="font-semibold text-gray-800">Probly</h2>
          <p className="text-xs text-gray-500">
            {showPromptLibrary ? "Prompt Library" : "Ask me about spreadsheet formulas"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={togglePromptLibrary}
            className={`p-2 ${showPromptLibrary ? 'text-blue-500 bg-blue-50' : 'text-gray-500 hover:text-blue-500 hover:bg-blue-50'} rounded-full transition-all duration-200`}
            title={showPromptLibrary ? "Back to chat" : "Open prompt library"}
          >
            <BookOpen size={18} />
          </button>
          {!showPromptLibrary && (
            <button
              onClick={clearHistory}
              className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full transition-all duration-200"
              title="Clear chat history"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Content Area - Either Chat History or Prompt Library */}
      {showPromptLibrary ? (
        <div className="flex-1 flex flex-col">
          {/* Search and Add */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search prompts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => {
                  if (isAddingPrompt && !editingPromptId) {
                    setIsAddingPrompt(false);
                  } else {
                    setIsAddingPrompt(true);
                    setEditingPromptId(null);
                    setNewPromptTitle('');
                    setNewPromptContent('');
                  }
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                {isAddingPrompt && !editingPromptId ? <X size={18} /> : <Plus size={18} />}
                {isAddingPrompt && !editingPromptId ? 'Cancel' : 'Add Prompt'}
              </button>
            </div>
            
            {/* Add/Edit Prompt Form */}
            {isAddingPrompt && (
              <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prompt Title</label>
                  <input
                    type="text"
                    value={newPromptTitle}
                    onChange={(e) => setNewPromptTitle(e.target.value)}
                    placeholder="Enter a descriptive title"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prompt Content</label>
                  <textarea
                    value={newPromptContent}
                    onChange={(e) => setNewPromptContent(e.target.value)}
                    placeholder="Enter your prompt template..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSavePrompt}
                    disabled={!newPromptTitle.trim() || !newPromptContent.trim()}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    <Save size={18} />
                    {editingPromptId ? 'Update Prompt' : 'Save Prompt'}
                  </button>
                  {editingPromptId && (
                    <button
                      onClick={handleCancelEdit}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2"
                    >
                      <X size={18} />
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Prompt List */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredPrompts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? 'No prompts match your search' : 'No prompts available'}
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredPrompts.map((prompt) => (
                  <div 
                    key={prompt.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-medium text-gray-800">{prompt.title}</h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSelectPrompt(prompt.content)}
                          className="text-blue-500 hover:text-blue-700 text-sm font-medium"
                        >
                          Use
                        </button>
                        {!predefinedPrompts.some(p => p.id === prompt.id) && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditPrompt(prompt);
                              }}
                              className="text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePrompt(prompt.id);
                              }}
                              className="text-red-500 hover:text-red-700 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">{prompt.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 chat-message-container">
            {chatHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-2">
                <p className="text-sm">No messages yet</p>
                <p className="text-xs text-center">
                  Try asking me to create formulas or analyze your data
                </p>
              </div>
            ) : (
              chatHistory.map((chat) => (
                <div key={chat.id} className="space-y-3 animate-fadeIn">
                  {/* User Message */}
                  <div className="flex justify-end">
                    <div className="bg-blue-500 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-[80%] shadow-sm hover:shadow-md transition-shadow duration-200">
                      <p className="text-sm break-words">{chat.text}</p>
                      <span className="text-xs opacity-75 mt-1 block">
                        {new Date(chat.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  {/* AI Response */}
                  <div className="flex justify-start">
                    <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-2 max-w-[80%] shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200">
                      <div className="text-sm text-gray-800 break-words">
                        {chat.streaming ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-gray-500">
                              <Loader2 size={14} className="animate-spin" />
                              <span className="text-xs">AI is generating response...</span>
                            </div>
                            <div className="border-l-2 border-blue-200 pl-3 font-mono">
                              {chat.response}
                            </div>
                          </div>
                        ) : (
                          <ToolResponse
                            response={chat.response}
                            updates={chat.updates}
                            chartData={chat.chartData}
                            analysis={chat.analysis}
                            status={chat.status}
                            onAccept={() => onAccept(chat.updates || [], chat.id)}
                            onReject={() => onReject(chat.id)}
                          />
                        )}
                      </div>
                      <span className="text-xs text-gray-400 mt-1 block">
                        {new Date(chat.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-gray-200">
            <div className="flex gap-2 items-end relative">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none min-h-[80px] bg-white text-gray-800 transition-all duration-200"
                placeholder="Type your message..."
                disabled={isLoading}
                rows={3}
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() && !isLoading}
                className="p-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-full transition-all duration-200 disabled:cursor-not-allowed h-11 w-11 flex items-center justify-center group"
                title={isLoading ? "Stop generating" : "Send message"}
              >
                {isLoading ? (
                  <Square size={18} className="fill-current animate-pulse" />
                ) : (
                  <Send size={18} className="group-hover:scale-110 transition-transform duration-200" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatBox;
