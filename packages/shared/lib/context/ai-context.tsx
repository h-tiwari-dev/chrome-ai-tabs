import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';

export class AISessionManager {
  private session: AILanguageModel | null = null;

  async initialize(systemPrompt: string = '') {
    const capabilities = await chrome.ai.languageModel.capabilities();
    if (capabilities.available == 'no') {
      throw new Error('AI capacities are not available on this device');
    }

    try {
      this.session = await chrome.ai.languageModel.create({
        systemPrompt: systemPrompt || 'You are a helpful context management assistant',
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize AI session:', error);
      return false;
    }
  }

  async analyzeContent(content: string): Promise<{
    summary: string;
    topics: string[];
    category: string;
  }> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    // Use streaming for better performance with large content
    try {
      const prompt = `
        Analyze the following content and provide:
        1. A brief summary
        2. Main topics (as JSON array)
        3. Category (one of: Research, Development, Documentation, Communication)
        
        Content: ${content}
      `;

      const response = await this.session.prompt(prompt);

      try {
        const parsed = JSON.parse(response);
        return {
          summary: parsed.summary,
          topics: parsed.topics,
          category: parsed.category,
        };
      } catch {
        // Fallback if response isn't proper JSON
        return {
          summary: response.split('\n')[0] || '',
          topics: [],
          category: 'Uncategorized',
        };
      }
    } catch (error) {
      console.error('Failed to analyze content:', error);
      throw error;
    }
  }

  async suggestTabGroups(tabs: chrome.tabs.Tab[]): Promise<
    {
      groupName: string;
      tabIds: number[];
      confidence: number;
    }[]
  > {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    const tabInfo = tabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
    }));

    const prompt = `
      Analyze these tabs and suggest logical groupings.
      Return JSON array of groups with properties:
      - groupName: string
      - tabIds: number[]
      - confidence: number (0-1)

      Tabs: ${JSON.stringify(tabInfo)}
    `;

    try {
      const response = await this.session.prompt(prompt);
      return JSON.parse(response);
    } catch (error) {
      console.error('Failed to suggest groups:', error);
      throw error;
    }
  }

  async generateContextSummary(context: { tabs: chrome.tabs.Tab[]; title: string; category: string }): Promise<string> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    const prompt = `
      Generate a brief, informative summary of this work context:
      Title: ${context.title}
      Category: ${context.category}
      Tabs: ${context.tabs.map(t => t.title).join(', ')}
    `;

    try {
      return await this.session.prompt(prompt);
    } catch (error) {
      console.error('Failed to generate context summary:', error);
      throw error;
    }
  }

  async destroy() {
    if (this.session) {
      await this.session.destroy();
      this.session = null;
    }
  }
}

// Define types for our context
type AISessionContextType = {
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
  analyzeContent: (content: string) => Promise<{
    summary: string;
    topics: string[];
    category: string;
  }>;
  suggestTabGroups: (tabs: chrome.tabs.Tab[]) => Promise<
    {
      groupName: string;
      tabIds: number[];
      confidence: number;
    }[]
  >;
  generateContextSummary: (context: { tabs: chrome.tabs.Tab[]; title: string; category: string }) => Promise<string>;
};

// Create the context
const AISessionContext = createContext<AISessionContextType | null>(null);

// Create the provider component
export const AISessionProvider: React.FC<{
  children: React.ReactNode;
  systemPrompt?: string;
}> = ({ children, systemPrompt }) => {
  const [manager] = useState(() => new AISessionManager());
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Initialize the AI session
  useEffect(() => {
    const initializeSession = async () => {
      try {
        const success = await manager.initialize(systemPrompt);
        setIsInitialized(success);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to initialize AI session'));
      } finally {
        setIsLoading(false);
      }
    };

    initializeSession();

    // Cleanup on unmount
    return () => {
      manager.destroy();
    };
  }, [systemPrompt, manager]);

  // Wrap the manager methods with error handling and loading states
  const analyzeContent = useCallback(
    async (content: string) => {
      setIsLoading(true);
      try {
        return await manager.analyzeContent(content);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to analyze content'));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [manager],
  );

  const suggestTabGroups = useCallback(
    async (tabs: chrome.tabs.Tab[]) => {
      setIsLoading(true);
      try {
        return await manager.suggestTabGroups(tabs);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to suggest tab groups'));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [manager],
  );

  const generateContextSummary = useCallback(
    async (context: { tabs: chrome.tabs.Tab[]; title: string; category: string }) => {
      setIsLoading(true);
      try {
        return await manager.generateContextSummary(context);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to generate context summary'));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [manager],
  );

  const value = {
    isInitialized,
    isLoading,
    error,
    analyzeContent,
    suggestTabGroups,
    generateContextSummary,
  };

  return <AISessionContext.Provider value={value}>{children}</AISessionContext.Provider>;
};

// Custom hook to use the AI session
export const useAISession = () => {
  const context = useContext(AISessionContext);
  if (!context) {
    throw new Error('useAISession must be used within an AISessionProvider');
  }
  return context;
};

// Additional convenience hooks for specific functionalities
export const useContentAnalysis = () => {
  const { analyzeContent, isLoading, error } = useAISession();
  return { analyzeContent, isLoading, error };
};

export const useTabGrouping = () => {
  const { suggestTabGroups, isLoading, error } = useAISession();
  return { suggestTabGroups, isLoading, error };
};

export const useContextSummary = () => {
  const { generateContextSummary, isLoading, error } = useAISession();
  return { generateContextSummary, isLoading, error };
};
