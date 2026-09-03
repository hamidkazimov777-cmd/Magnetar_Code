import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AIProvider } from '../core/providers/AIProvider';
import { OpenAICompatibleProvider } from '../core/providers/OpenAICompatibleProvider';

// Для хранения в стейте нам нужны только конфигурационные данные, 
// а не инстансы классов, так как они не сериализуются корректно в JSON.
export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  type: 'openai-compatible' | 'anthropic' | 'gemini' | 'custom';
}

interface ProviderState {
  providers: ProviderConfig[];
  activeProviderId: string | null;
  addProvider: (config: ProviderConfig) => void;
  removeProvider: (id: string) => void;
  updateProvider: (id: string, config: Partial<ProviderConfig>) => void;
  setActiveProvider: (id: string) => void;
  getProviderInstance: (id: string) => AIProvider | null;
}

export const useProviderStore = create<ProviderState>()(
  persist(
    (set, get) => ({
      providers: [],
      activeProviderId: null,

      addProvider: (config) => set((state) => ({ 
        providers: [...state.providers, config],
        activeProviderId: state.activeProviderId || config.id 
      })),
      
      removeProvider: (id) => set((state) => ({
        providers: state.providers.filter(p => p.id !== id),
        activeProviderId: state.activeProviderId === id ? null : state.activeProviderId
      })),
      
      updateProvider: (id, config) => set((state) => ({
        providers: state.providers.map(p => p.id === id ? { ...p, ...config } : p)
      })),

      setActiveProvider: (id) => set({ activeProviderId: id }),

      getProviderInstance: (id) => {
        const providerConfig = get().providers.find(p => p.id === id);
        if (!providerConfig) return null;

        // Factory pattern inline
        switch (providerConfig.type) {
          case 'openai-compatible':
          case 'custom':
            return new OpenAICompatibleProvider(
              providerConfig.id,
              providerConfig.name,
              providerConfig.baseUrl,
              providerConfig.apiKey,
              providerConfig.type
            );
          default:
            console.warn(`Provider type ${providerConfig.type} not fully implemented yet.`);
            return new OpenAICompatibleProvider(
              providerConfig.id,
              providerConfig.name,
              providerConfig.baseUrl,
              providerConfig.apiKey,
              'openai-compatible'
            );
        }
      }
    }),
    {
      name: 'magnetar-providers-storage', // Ключ в localStorage
      partialize: (state) => ({ 
        providers: state.providers, 
        activeProviderId: state.activeProviderId 
      }), // Сохраняем только конфигурации, методы Zustand проигнорирует
    }
  )
);
