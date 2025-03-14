/**
 * This file exports only the PromptLibraryProps interface.
 * The prompt library functionality has been integrated directly into the ChatBox component.
 * See src/components/ChatBox.tsx for the implementation.
 */

import React from 'react';

export interface PromptLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (promptText: string) => void;
} 