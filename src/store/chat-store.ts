import { create } from 'zustand';
import { ChatMessage } from '../core/providers/AIProvider';
import { v4 as uuidv4 } from 'uuid';

export interface Message extends ChatMessage {
  id: string;
  createdAt: number;
}

interface ChatState {
  messages: Message[];
  isGenerating: boolean;
  addMessage: (message: Omit<Message, 'id' | 'createdAt'>) => void;
  appendChunkToLastMessage: (chunk: string) => void;
  setGenerating: (isGenerating: boolean) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isGenerating: false,
  
  addMessage: (msg) => set((state) => ({
    messages: [...state.messages, { ...msg, id: uuidv4(), createdAt: Date.now() }]
  })),

  appendChunkToLastMessage: (chunk) => set((state) => {
    if (state.messages.length === 0) return state;
    
    const lastMessage = state.messages[state.messages.length - 1];
    
    // Only append if the last message is from the assistant
    if (lastMessage.role !== 'assistant') return state;
    
    const updatedMessages = [...state.messages];
    updatedMessages[updatedMessages.length - 1] = {
      ...lastMessage,
      content: lastMessage.content + chunk
    };
    
    return { messages: updatedMessages };
  }),

  setGenerating: (isGenerating) => set({ isGenerating }),
  
  clearChat: () => set({ messages: [], isGenerating: false })
}));
