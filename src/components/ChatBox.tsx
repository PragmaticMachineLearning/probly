import { BookOpen, Check, Edit2, FileUp, Loader2, Plus, Save, Search, Send, Square, Trash2, X } from "lucide-react";
import { CellUpdate, ChatMessage } from "@/types/api";
import { useEffect, useRef, useState } from "react";

import ToolResponse from './ToolResponse';
import { isKeyCombo } from '@/utils/chatUtils';
import { predefinedPrompts } from '@/constants/prompts';

interface Prompt {
  id: string;
  title: string;
  content: string;
}

interface ChatBoxProps {
  onSend: (message: string, documentImage?: string) => Promise<void>;
  onStop: () => void;
  onAccept: (updates: CellUpdate[], messageId: string) => void;
  onReject: (messageId: string) => void;
  chatHistory: ChatMessage[];
  clearHistory: () => void;
  message: string;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  isPromptLibraryOpen?: boolean;
  setIsPromptLibraryOpen?: React.Dispatch<React.SetStateAction<boolean>>;
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
  isPromptLibraryOpen: externalIsPromptLibraryOpen,
  setIsPromptLibraryOpen: externalSetIsPromptLibraryOpen,
}: ChatBoxProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newPromptTitle, setNewPromptTitle] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const [isAddingPrompt, setIsAddingPrompt] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [uploadedDocument, setUploadedDocument] = useState<string | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadedDocumentName, setUploadedDocumentName] = useState<string | null>(null);
  const [isImageFile, setIsImageFile] = useState(false);
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDialogTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add image compression constants
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const MAX_IMAGE_DIMENSION = 1200; // Maximum width/height for images
  const COMPRESSION_QUALITY = 0.7; // 70% quality for JPEG compression

  interface CompressedFile {
    file: File;
    wasCompressed: boolean;
  }

  // Add compression utility function
  const compressImageFile = async (file: File): Promise<CompressedFile> => {
    // If it's not an image or is under max size, return original
    if (!file.type.startsWith('image/') || file.size <= MAX_FILE_SIZE) {
      return { file, wasCompressed: false };
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        let { width, height } = img;
        
        // Only resize if either dimension exceeds MAX_IMAGE_DIMENSION
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          const scale = Math.min(
            MAX_IMAGE_DIMENSION / width,
            MAX_IMAGE_DIMENSION / height
          );
          
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({ file, wasCompressed: false });
              return;
            }
            
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            
            resolve({
              file: compressedFile,
              wasCompressed: true
            });
          },
          'image/jpeg',
          COMPRESSION_QUALITY
        );
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ file, wasCompressed: false });
      };
      
      img.src = url;
    });
  };

  // Use external state if provided, otherwise use internal state
  const promptLibraryOpen = externalIsPromptLibraryOpen !== undefined ? externalIsPromptLibraryOpen : showPromptLibrary;
  const setPromptLibraryOpen = externalSetIsPromptLibraryOpen || setShowPromptLibrary;
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load prompts from localStorage on mount
  useEffect(() => {
    const savedPrompts = localStorage.getItem('userPrompts');
    let userPrompts: Prompt[] = [];
    
    if (savedPrompts) {
      try {
        userPrompts = JSON.parse(savedPrompts);
      } catch (error) {
        console.error('Error loading prompts:', error);
        userPrompts = [];
      }
    }
    
    // Combine predefined prompts with user prompts, ensuring no duplicates by ID
    const combinedPrompts = [
      ...predefinedPrompts,
      ...userPrompts.filter(up => !predefinedPrompts.some(pp => pp.id === up.id))
    ];
    
    setPrompts(combinedPrompts);
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
    if (promptLibraryOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [promptLibraryOpen]);

  // Add keyboard shortcut for prompt library
  useEffect(() => {
    // We'll only handle keyboard shortcuts if we're using internal state
    // If external state is provided, the parent component will handle the shortcuts
    if (externalIsPromptLibraryOpen !== undefined) {
      return;
    }
    
    const handleKeyPress = (e: KeyboardEvent) => {
      // Toggle prompt library with Ctrl+Shift+L
      if (isKeyCombo(e, "L", true, true)) {
        setPromptLibraryOpen(prev => !prev);
        if (promptLibraryOpen) {
          setSearchQuery('');
          setIsAddingPrompt(false);
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [promptLibraryOpen, setPromptLibraryOpen, externalIsPromptLibraryOpen]);

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
        await onSend(messageToSend, uploadedDocument || undefined);
        // Clear the uploaded document after sending
        setUploadedDocument(null);
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
    setPromptLibraryOpen(false);
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
    
    let updatedPrompts;
    
    if (editingPromptId) {
      // Update existing prompt
      updatedPrompts = prompts.map(prompt => 
        prompt.id === editingPromptId 
          ? { ...prompt, title: newPromptTitle.trim(), content: newPromptContent.trim() } 
          : prompt
      );
    } else {
      // Create new prompt
      const newPrompt: Prompt = {
        id: Date.now().toString(),
        title: newPromptTitle.trim(),
        content: newPromptContent.trim()
      };
      
      updatedPrompts = [...prompts, newPrompt];
    }
    
    setPrompts(updatedPrompts);
    
    // Save user prompts to localStorage (excluding predefined ones)
    const userPrompts = updatedPrompts.filter(
      prompt => !predefinedPrompts.some(p => p.id === prompt.id)
    );
    localStorage.setItem('userPrompts', JSON.stringify(userPrompts));
    
    // Reset form
    setNewPromptTitle('');
    setNewPromptContent('');
    setIsAddingPrompt(false);
    setEditingPromptId(null);
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
    // Toggle the prompt library state
    setPromptLibraryOpen(!promptLibraryOpen);
    
    // Reset search and form state when opening
    if (!promptLibraryOpen) {
      setSearchQuery('');
      setIsAddingPrompt(false);
    }
  };

  // Add this effect to handle ESC key for file dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFileDialogOpen) {
        // Reset the file dialog state
        setIsFileDialogOpen(false);
        
        // Clear any existing timeout
        if (fileDialogTimeoutRef.current) {
          clearTimeout(fileDialogTimeoutRef.current);
          fileDialogTimeoutRef.current = null;
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFileDialogOpen]);

  // Update the file button click handler
  const handleFileButtonClick = () => {
    // Set state to indicate file dialog is opening
    setIsFileDialogOpen(true);
    
    // Set a timeout to reset the state if no file is selected
    // This handles the case when the user closes the dialog without selecting a file
    fileDialogTimeoutRef.current = setTimeout(() => {
      setIsFileDialogOpen(false);
    }, 1000);
    
    // Use requestAnimationFrame to ensure UI updates before triggering file dialog
    requestAnimationFrame(() => {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    });
  };

  // Update the file upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Clear the timeout since a file was selected or dialog was closed
    if (fileDialogTimeoutRef.current) {
      clearTimeout(fileDialogTimeoutRef.current);
      fileDialogTimeoutRef.current = null;
    }
    
    // Reset the file dialog state
    setIsFileDialogOpen(false);
    
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setUploadingDocument(true);
      
      // Check file size first
      if (file.size > MAX_FILE_SIZE) {
        if (!file.type.startsWith('image/')) {
          throw new Error(`File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
        }
        
        // Try to compress if it's an image
        const { file: processedFile, wasCompressed } = await compressImageFile(file);
        
        if (processedFile.size > MAX_FILE_SIZE) {
          throw new Error(`Image too large even after compression. Please use a smaller image.`);
        }
        
        if (wasCompressed) {
          console.log(`Image compressed from ${file.size} to ${processedFile.size} bytes`);
        }
        
        // Convert compressed file to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(processedFile);
        });
        
        setUploadedDocument(base64);
        setUploadedDocumentName(file.name);
        setIsImageFile(true);
        
      } else {
        // Handle normal-sized files
        setIsImageFile(file.type.startsWith('image/'));
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        setUploadedDocument(base64);
        setUploadedDocumentName(file.name);
      }
      
    } catch (error) {
      console.error("Error uploading document:", error);
      // Clear the uploaded document on error
      setUploadedDocument(null);
      setUploadedDocumentName(null);
      setIsImageFile(false);
    } finally {
      setUploadingDocument(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveDocument = () => {
    setUploadedDocument(null);
    setUploadedDocumentName(null);
    setIsImageFile(false);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center bg-white z-10">
        <div>
          <h2 className="font-semibold text-gray-800">Probly</h2>
          <p className="text-xs text-gray-500">
            {promptLibraryOpen ? "Prompt Library (Ctrl+Shift+L)" : "Ask me about spreadsheet formulas"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={togglePromptLibrary}
            className={`p-2 ${promptLibraryOpen ? 'text-blue-500 bg-blue-50' : 'text-gray-500 hover:text-blue-500 hover:bg-blue-50'} rounded-full transition-all duration-200`}
            title={promptLibraryOpen ? "Back to chat (Ctrl+Shift+L)" : "Open prompt library (Ctrl+Shift+L)"}
          >
            <BookOpen size={18} />
          </button>
          {!promptLibraryOpen && (
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
      {promptLibraryOpen ? (
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

          {/* Input Area with Document Preview */}
          <div className="bg-white border-t border-gray-200">
            {/* Document Preview Area - Always present but with height transition */}
            <div className={`overflow-hidden transition-[height,opacity] duration-200 ease-in-out ${
              uploadedDocument ? 'h-[84px] opacity-100' : 'h-0 opacity-0'
            }`}>
              {uploadedDocument && uploadedDocumentName && (
                <div className="px-4 pt-3 border-b border-gray-100">
                  {isImageFile && uploadedDocument && (
                    <div className="relative w-[60px] h-[60px] group mb-3">
                      <div className="rounded-lg overflow-hidden border border-gray-200 w-full h-full">
                        <img 
                          src={uploadedDocument} 
                          alt="Document preview"
                          className="w-full h-full object-contain bg-white"
                        />
                      </div>
                      <button 
                        onClick={handleRemoveDocument}
                        className="absolute -top-2 -right-2 p-1.5 bg-gray-900/90 hover:bg-gray-900 rounded-full shadow-md text-white hover:text-white transition-colors opacity-0 group-hover:opacity-100 z-10"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input Box Area */}
            <div className="p-4">
              {/* Textarea spanning full width */}
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                className={`w-full px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none min-h-[80px] bg-white text-gray-800 transition-all duration-200 mb-3 ${
                  uploadedDocument ? 'border-transparent' : 'border border-gray-200'
                }`}
                placeholder={uploadedDocument ? "What would you like to know about this document?" : "Type your message..."}
                disabled={isLoading}
                rows={3}
              />
              
              {/* Buttons row below textarea */}
              <div className="flex justify-between items-center">
                {/* File upload button on the left */}
                <button
                  onClick={handleFileButtonClick}
                  disabled={isLoading || uploadingDocument}
                  className="p-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-full transition-all duration-200 disabled:cursor-not-allowed h-8 w-8 flex items-center justify-center shadow-md"
                  title="Upload document"
                >
                  {uploadingDocument ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : isFileDialogOpen ? (
                    <Loader2 size={12} className="animate-pulse" />
                  ) : (
                    <Plus size={12} />
                  )}
                </button>
                
                {/* Send button on the right */}
                <button
                  onClick={handleSend}
                  disabled={(!message.trim() && !uploadedDocument) || isLoading}
                  className="p-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-full transition-all duration-200 disabled:cursor-not-allowed h-8 w-8 flex items-center justify-center group"
                  title={isLoading ? "Stop generating" : "Send message"}
                >
                  {isLoading ? (
                    <Square size={12} className="fill-current animate-pulse" />
                  ) : (
                    <Send size={12} className="group-hover:scale-110 transition-transform duration-200" />
                  )}
                </button>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                accept="image/png,image/jpeg,image/jpg,application/pdf"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatBox;
