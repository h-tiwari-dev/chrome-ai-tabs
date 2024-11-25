import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  useRef,
} from 'react';
import { tabStorage, type TabGroup } from '@extension/storage/lib/impl/tabStorage';
import { useAISession } from './ai-context';

interface TabContextState {
  currentTabs: chrome.tabs.Tab[];
  currentChromeGroups: chrome.tabGroups.TabGroup[];
  isLoading: boolean;
  error: Error | null;
}

interface TabContextValue extends TabContextState {
  // Storage Data
  tabGroups: TabGroup[];
  activeGroupId: string | null;
  ungroupedTabs: chrome.tabs.Tab[];
  currentWindowId: number | null;

  // Debuggibg
  debugString: string;

  // Tab Management
  refreshTabs: () => Promise<void>;
  createTabGroup: (name: string, tabs: chrome.tabs.Tab[], color?: chrome.tabGroups.ColorEnum) => Promise<void>;
  deleteTabGroup: (groupId: string) => Promise<void>;
  addTabsToGroup: (groupId: string, tabs: chrome.tabs.Tab[]) => Promise<void>;
  removeTabFromGroup: (groupId: string, tabId: number) => Promise<void>;
  setActiveGroup: (groupId: string | null) => Promise<void>;

  // Ungrouped Tabs Management
  addUngroupedTab: (tab: chrome.tabs.Tab) => Promise<void>;
  removeUngroupedTab: (tabId: number) => Promise<void>;
  updateUngroupedTabs: (tabs: chrome.tabs.Tab[]) => Promise<void>;

  // Chrome Tab Group Management
  updateChromeGroup: (groupId: number, properties: chrome.tabGroups.UpdateProperties) => Promise<void>;
  moveChromeGroup: (groupId: number, moveProperties: chrome.tabGroups.MoveProperties) => Promise<void>;

  // Tab Operations
  openTabGroup: (groupId: string) => Promise<void>;
  closeTabGroup: (groupId: string) => Promise<void>;

  // AI-Powered Features
  autoGroupCurrentTabs: () => Promise<void>;
  generateGroupSummary: (groupId: string) => Promise<void>;
}

const TabContext = createContext<TabContextValue | null>(null);

export const TabContextProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { suggestTabGroups, generateContextSummary } = useAISession();
  const snapshotRef = useRef(tabStorage.getSnapshot());
  const [debugString, setDebugString] = useState('');

  // Local state
  const [state, setState] = useState<TabContextState>({
    currentTabs: [],
    currentChromeGroups: [],
    isLoading: false,
    error: null,
  });

  // Storage selectors
  const getGroups = useCallback(() => {
    const snapshot = tabStorage.getSnapshot();
    snapshotRef.current = snapshot;
    return snapshot?.groups ?? [];
  }, []);

  const getActiveGroupId = useCallback(() => {
    return snapshotRef.current?.activeGroupId ?? null;
  }, []);

  const getUngroupedTabs = useCallback(() => {
    return snapshotRef.current?.ungroupedTabs ?? [];
  }, []);

  const getCurrentWindowId = useCallback(() => {
    return snapshotRef.current?.currentWindow ?? null;
  }, []);

  // Subscribe to storage changes
  const tabGroups = useSyncExternalStore(tabStorage.subscribe, getGroups, () => []);
  const activeGroupId = useSyncExternalStore(tabStorage.subscribe, getActiveGroupId, () => null);
  const ungroupedTabs = useSyncExternalStore(tabStorage.subscribe, getUngroupedTabs, () => []);
  const currentWindowId = useSyncExternalStore(tabStorage.subscribe, getCurrentWindowId, () => null);

  const syncTabStates = useCallback(async () => {
    const currentTabs = await chrome.tabs.query({ currentWindow: true });
    const chromeGroups = await chrome.tabGroups.query({});

    // Get all tabs with their group information
    const tabGroupMap = new Map<number, number>(); // Map of tabId to groupId

    // First, collect all tabs and their group assignments from Chrome
    for (const group of chromeGroups) {
      const groupTabs = await chrome.tabs.query({ groupId: group.id });
      groupTabs.forEach(tab => {
        if (tab.id) {
          tabGroupMap.set(tab.id, group.id);
        }
      });
    }

    // Create new groups based on Chrome's state
    const newGroups: TabGroup[] = [];
    for (const chromeGroup of chromeGroups) {
      const groupTabs = currentTabs.filter(tab => tab.id && tabGroupMap.get(tab.id) === chromeGroup.id);

      setDebugString(JSON.stringify(chromeGroup));
      if (groupTabs.length > 0) {
        newGroups.push({
          id: chromeGroup.id,
          name: chromeGroup.title || 'Unnamed Group',
          tabs: groupTabs,
          category: 'Uncategorized',
          created: new Date(),
          lastModified: new Date(),
          chromeGroupId: chromeGroup.id,
          color: chromeGroup.color,
          collapsed: chromeGroup.collapsed,
        });
      }
    }

    // Identify truly ungrouped tabs
    const ungroupedTabs = currentTabs.filter(tab => tab.id && !tabGroupMap.has(tab.id));

    // Update storage with synchronized state
    await tabStorage.set({
      groups: newGroups,
      activeGroupId: null, // Reset active group during sync
      lastSync: new Date(),
      ungroupedTabs,
      currentWindow: currentTabs[0]?.windowId || null,
    });

    return { currentTabs, chromeGroups };
  }, []);

  // Update refreshTabs to use the new sync function
  const refreshTabs = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const { currentTabs, chromeGroups } = await syncTabStates();

      setState(prev => ({
        ...prev,
        currentTabs,
        currentChromeGroups: chromeGroups,
        error: null,
        isLoading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to refresh tabs'),
        isLoading: false,
      }));
    }
  }, [syncTabStates]);

  // Update tab event listeners to include sync
  useEffect(() => {
    const handleTabCreated = async (tab: chrome.tabs.Tab) => {
      await refreshTabs(); // Full sync on tab creation
    };

    const handleTabUpdated = async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      // Only sync if groupId changed or URL changed
      if (changeInfo.groupId !== undefined || changeInfo.url !== undefined) {
        await refreshTabs();
      }
    };

    const handleTabRemoved = async (tabId: number) => {
      await refreshTabs(); // Full sync on tab removal
    };

    chrome.tabs.onCreated.addListener(handleTabCreated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onRemoved.addListener(handleTabRemoved);
    return () => {
      chrome.tabs.onCreated.removeListener(handleTabCreated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      chrome.tabs.onRemoved.removeListener(handleTabRemoved);
    };
  }, [refreshTabs]);

  // Update Chrome tab group event listeners
  useEffect(() => {
    const handleGroupChanged = async () => {
      await refreshTabs(); // Full sync on any group change
    };

    chrome.tabGroups?.onCreated.addListener(handleGroupChanged);
    chrome.tabGroups?.onUpdated.addListener(handleGroupChanged);
    chrome.tabGroups?.onRemoved.addListener(handleGroupChanged);

    return () => {
      chrome.tabGroups?.onCreated.removeListener(handleGroupChanged);
      chrome.tabGroups?.onUpdated.removeListener(handleGroupChanged);
      chrome.tabGroups?.onRemoved.removeListener(handleGroupChanged);
    };
  }, [refreshTabs]);

  // Initial sync on mount
  useEffect(() => {
    refreshTabs();
  }, [refreshTabs]);

  useEffect(() => {
    // setDebugString(JSON.stringify(state.currentChromeGroups))
  }, [state.currentChromeGroups]);

  const createTabGroup = useCallback(
    async (name: string, tabs: chrome.tabs.Tab[], color: chrome.tabGroups.ColorEnum = 'blue') => {
      setState(prev => ({ ...prev, isLoading: true }));
      try {
        // Create Chrome tab group
        const tabIds = tabs.map(tab => tab.id).filter((id): id is number => typeof id === 'number');

        const groupId = await chrome.tabs.group({ tabIds });
        const chromeGroup = await chrome.tabGroups.update(groupId, {
          title: name,
          color,
        });

        // Create storage group
        // await tabStorage.addGroup({
        //   id: crypto.randomUUID(),
        //   name,
        //   tabs,
        //   category: 'Uncategorized',
        //   chromeGroupId: groupId,
        //   color: chromeGroup.color,
        //   collapsed: chromeGroup.collapsed,
        // });

        // Update chrome groups in state
        setState(prev => ({
          ...prev,
          currentChromeGroups: [...prev.currentChromeGroups, chromeGroup],
          isLoading: false,
        }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error : new Error('Failed to create tab group'),
          isLoading: false,
        }));
      }
    },
    [],
  );

  // Chrome Tab Group Management Methods
  const updateChromeGroup = useCallback(
    async (groupId: number, properties: chrome.tabGroups.UpdateProperties) => {
      setState(prev => ({ ...prev, isLoading: true }));
      try {
        const updatedGroup = await chrome.tabGroups.update(groupId, properties);

        // Update chrome groups in state
        setState(prev => ({
          ...prev,
          currentChromeGroups: prev.currentChromeGroups.map(group => (group.id === groupId ? updatedGroup : group)),
          isLoading: false,
        }));

        // Update corresponding storage group if exists
        const storageGroup = tabGroups.find(g => g.chromeGroupId === groupId);
        if (storageGroup) {
          await tabStorage.updateGroup(storageGroup.id, {
            color: properties.color,
            collapsed: properties.collapsed,
            name: properties.title,
          });
        }
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error : new Error('Failed to update chrome group'),
          isLoading: false,
        }));
      }
    },
    [tabGroups],
  );

  const moveChromeGroup = useCallback(async (groupId: number, moveProperties: chrome.tabGroups.MoveProperties) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const movedGroup = await chrome.tabGroups.move(groupId, moveProperties);

      // Update chrome groups in state
      setState(prev => ({
        ...prev,
        currentChromeGroups: prev.currentChromeGroups.map(group => (group.id === groupId ? movedGroup : group)),
        isLoading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to move chrome group'),
        isLoading: false,
      }));
    }
  }, []);

  // Delete group with Chrome integration
  const deleteTabGroup = useCallback(
    async (groupId: string) => {
      const group = tabGroups.find(g => g.id === groupId);
      if (!group) return;

      setState(prev => ({ ...prev, isLoading: true }));
      try {
        // Ungroup tabs in Chrome if chrome group exists
        if (group.chromeGroupId) {
          const tabIds = group.tabs.map(tab => tab.id).filter((id): id is number => typeof id === 'number');

          await chrome.tabs.ungroup(tabIds);
        }

        // Remove from storage
        await tabStorage.removeGroup(groupId);

        setState(prev => ({ ...prev, isLoading: false }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error : new Error('Failed to delete tab group'),
          isLoading: false,
        }));
      }
    },
    [tabGroups],
  );

  // Add tabs to an existing group
  const addTabsToGroup = useCallback(async (groupId: string, newTabs: chrome.tabs.Tab[]) => {
    await tabStorage.addTabsToGroup(groupId, newTabs);
  }, []);

  // Remove a tab from a group
  const removeTabFromGroup = useCallback(async (groupId: string, tabId: number) => {
    await tabStorage.removeTabFromGroup(groupId, tabId);
  }, []);

  // Set active group
  const setActiveGroup = useCallback(async (groupId: string | null) => {
    await tabStorage.setActiveGroup(groupId);
  }, []);

  // Open all tabs in a group
  const openTabGroup = useCallback(
    async (groupId: string) => {
      const group = tabGroups.find(g => g.id === groupId);
      if (!group) return;

      setState(prev => ({ ...prev, isLoading: true }));
      try {
        for (const tab of group.tabs) {
          await chrome.tabs.create({ url: tab.url });
        }
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error : new Error('Failed to open tab group'),
        }));
      } finally {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    },
    [tabGroups],
  );

  // Close all tabs in a group
  const closeTabGroup = useCallback(
    async (groupId: string) => {
      const group = tabGroups.find(g => g.id === groupId);
      if (!group) return;

      setState(prev => ({ ...prev, isLoading: true }));
      try {
        const tabIds = group.tabs.map(tab => tab.id).filter((id): id is number => typeof id === 'number');

        await chrome.tabs.remove(tabIds);
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error : new Error('Failed to close tab group'),
        }));
      } finally {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    },
    [tabGroups],
  );

  // AI-powered automatic tab grouping
  const autoGroupCurrentTabs = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const suggestions = await suggestTabGroups(state.currentTabs);

      // Create groups based on suggestions
      for (const suggestion of suggestions) {
        const groupTabs = state.currentTabs.filter(tab => suggestion.tabIds.includes(tab.id || -1));

        if (groupTabs.length > 0) {
          await createTabGroup(suggestion.groupName, groupTabs);
        }
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to auto-group tabs'),
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.currentTabs, suggestTabGroups, createTabGroup]);

  // Generate or update a group's summary
  const generateGroupSummary = useCallback(
    async (groupId: string) => {
      const group = tabGroups.find(g => g.id === groupId);
      if (!group) return;

      setState(prev => ({ ...prev, isLoading: true }));
      try {
        const summary = await generateContextSummary({
          tabs: group.tabs,
          title: group.name,
          category: group.category,
        });

        await tabStorage.updateGroup(groupId, { summary });
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error : new Error('Failed to generate group summary'),
        }));
      } finally {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    },
    [tabGroups, generateContextSummary],
  );

  const value: TabContextValue = {
    ...state,
    tabGroups,
    activeGroupId,
    ungroupedTabs,
    currentWindowId,
    refreshTabs,
    createTabGroup,
    deleteTabGroup,
    addTabsToGroup,
    removeTabFromGroup,
    setActiveGroup,
    addUngroupedTab: tabStorage.addUngroupedTab,
    removeUngroupedTab: tabStorage.removeUngroupedTab,
    updateUngroupedTabs: tabStorage.updateUngroupedTabs,
    updateChromeGroup,
    moveChromeGroup,
    openTabGroup,
    closeTabGroup,
    autoGroupCurrentTabs,
    generateGroupSummary,
    debugString,
  };

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
};
export const useTabContext = () => {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error('useTabContext must be used within a TabContextProvider');
  }
  return context;
};

// Add a new hook for ungrouped tabs management
export const useUngroupedTabs = () => {
  const { ungroupedTabs, addUngroupedTab, removeUngroupedTab, updateUngroupedTabs } = useTabContext();

  return {
    ungroupedTabs,
    addUngroupedTab,
    removeUngroupedTab,
    updateUngroupedTabs,
  };
};
export const useChromeGroups = () => {
  const { currentChromeGroups, updateChromeGroup, moveChromeGroup } = useTabContext();

  const collapseGroup = useCallback(
    async (groupId: number) => {
      await updateChromeGroup(groupId, { collapsed: true });
    },
    [updateChromeGroup],
  );

  const expandGroup = useCallback(
    async (groupId: number) => {
      await updateChromeGroup(groupId, { collapsed: false });
    },
    [updateChromeGroup],
  );

  const setGroupColor = useCallback(
    async (groupId: number, color: chrome.tabGroups.ColorEnum) => {
      await updateChromeGroup(groupId, { color });
    },
    [updateChromeGroup],
  );

  const setGroupTitle = useCallback(
    async (groupId: number, title: string) => {
      await updateChromeGroup(groupId, { title });
    },
    [updateChromeGroup],
  );

  return {
    currentChromeGroups,
    collapseGroup,
    expandGroup,
    setGroupColor,
    setGroupTitle,
    updateChromeGroup,
    moveChromeGroup,
  };
};

export const useTabGroups = () => {
  const { tabGroups, createTabGroup, deleteTabGroup, addTabsToGroup, removeTabFromGroup } = useTabContext();
  return { tabGroups, createTabGroup, deleteTabGroup, addTabsToGroup, removeTabFromGroup };
};

export const useActiveGroup = () => {
  const { activeGroupId, tabGroups, setActiveGroup } = useTabContext();
  const activeGroup = activeGroupId ? tabGroups.find(g => g.id === activeGroupId) : null;
  return { activeGroup, activeGroupId, setActiveGroup };
};

export const useTabOperations = () => {
  const { openTabGroup, closeTabGroup, autoGroupCurrentTabs, generateGroupSummary } = useTabContext();
  return { openTabGroup, closeTabGroup, autoGroupCurrentTabs, generateGroupSummary };
};
