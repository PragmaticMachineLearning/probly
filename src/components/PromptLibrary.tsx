/**
 * This component has been deprecated.
 * The prompt library functionality has been integrated directly into the ChatBox component.
 * See src/components/ChatBox.tsx for the implementation.
 */

import React from 'react';

interface PromptLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (promptText: string) => void;
}

const PromptLibrary: React.FC<PromptLibraryProps> = ({ isOpen, onClose, onSelectPrompt }) => {
  // ... rest of the component
}

// This empty export is kept to prevent import errors in existing code
export default PromptLibrary; 