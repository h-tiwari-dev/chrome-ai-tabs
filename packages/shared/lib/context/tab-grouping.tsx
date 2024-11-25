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

  // Refresh tabs implementation
  const refreshTabs = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));

    // Initialize results object
    const results = {
      tabs: null,
      groups: null,
      error: null,
    };

    // Fetch tabs
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const currentWindow = tabs[0]?.windowId;
      await tabStorage.setCurrentWindow(currentWindow);
      await tabStorage.syncWithCurrentTabs(tabs);
      results.tabs = tabs;
    } catch (error) {
      results.error = {
        ...results.error,
        tabs: error instanceof Error ? error : new Error('Failed to refresh tabs'),
      };
    }

    // Fetch tab groups
    try {
      const groups = await chrome.tabGroups.query({});
      results.groups = groups;
    } catch (error) {
      results.error = {
        ...results.error,
        groups: error instanceof Error ? error : new Error('Failed to refresh tab groups'),
      };
    }

    // Update state based on results
    setState(prev => ({
      ...prev,
      currentTabs: results.tabs ?? prev.currentTabs,
      currentChromeGroups: results.groups ?? prev.currentChromeGroups,
      error: results.error,
      isLoading: false,
    }));
  }, []);

  // Tab event listeners
  useEffect(() => {
    const handleTabCreated = async (tab: chrome.tabs.Tab) => {
      setState(prev => ({
        ...prev,
        currentTabs: [...prev.currentTabs, tab],
      }));
      await tabStorage.addUngroupedTab(tab);
    };

    const handleTabUpdated = async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      setState(prev => ({
        ...prev,
        currentTabs: prev.currentTabs.map(t => (t.id === tabId ? tab : t)),
      }));

      // Update in storage if it's an ungrouped tab
      if (ungroupedTabs.some(t => t.id === tabId)) {
        const updatedUngroupedTabs = ungroupedTabs.map(t => (t.id === tabId ? tab : t));
        await tabStorage.updateUngroupedTabs(updatedUngroupedTabs);
      }

      // Update in groups if the tab is grouped
      for (const group of tabGroups) {
        if (group.tabs.some(t => t.id === tabId)) {
          await tabStorage.updateGroup(group.id, {
            tabs: group.tabs.map(t => (t.id === tabId ? tab : t)),
          });
        }
      }
    };

    const handleTabRemoved = async (tabId: number) => {
      setState(prev => ({
        ...prev,
        currentTabs: prev.currentTabs.filter(t => t.id !== tabId),
      }));
      await tabStorage.removeUngroupedTab(tabId);
    };

    chrome.tabs.onCreated.addListener(handleTabCreated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onRemoved.addListener(handleTabRemoved);
    return () => {
      chrome.tabs.onCreated.removeListener(handleTabCreated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      chrome.tabs.onRemoved.removeListener(handleTabRemoved);
    };
  }, [tabGroups, ungroupedTabs]);

  useEffect(() => {
    // setDebugString(JSON.stringify(state.currentChromeGroups))
  }, [state.currentChromeGroups]);

  // Chrome tab group event listeners
  useEffect(() => {
    const handleGroupCreated = async (group: chrome.tabGroups.TabGroup) => {
      // setDebugString("Created Group" + JSON.stringify(group))

      setState(prev => ({
        ...prev,
        currentChromeGroups: [...prev.currentChromeGroups, group],
      }));
      const tabs = await chrome.tabs.query({ groupId: group.id });
      await tabStorage.addGroup({
        id: group.id,
        name: group.title || 'Unnamed Group',
        tabs,
        category: 'Uncategorized',
        chromeGroupId: group.id,
        color: group.color,
        collapsed: group.collapsed,
      });

      // await tabStorage.addGroup(group);
    };

    const handleGroupUpdated = async (group: chrome.tabGroups.TabGroup) => {
      setState(prev => ({
        ...prev,
        currentChromeGroups: prev.currentChromeGroups.map(g => (g.id === group.id ? group : g)),
      }));
      const storageGroup = tabGroups.find(g => g.chromeGroupId === group.id);
      setDebugString('Group Updated');
      if (storageGroup) {
        // Get latest tabs in the group
        const tabs = await chrome.tabs.query({ groupId: group.id });

        await tabStorage.updateGroup(storageGroup.id, {
          name: group.title || storageGroup.name,
          color: group.color,
          collapsed: group.collapsed,
          tabs: tabs, // Update with current tabs
        });
      }
    };

    const handleGroupRemoved = async (group: chrome.tabGroups.TabGroup) => {
      setState(prev => ({
        ...prev,
        currentChromeGroups: prev.currentChromeGroups.filter(g => g.id !== group.id),
      }));
      const storageGroup = tabGroups.find(g => g.chromeGroupId === group.id);
      if (storageGroup) {
        // The tabs from the group will automatically become ungrouped
        // tabStorage.removeGroup will handle moving them to ungroupedTabs
        await tabStorage.removeGroup(storageGroup.id);
      }
    };

    chrome.tabGroups?.onCreated.addListener(handleGroupCreated);
    chrome.tabGroups?.onUpdated.addListener(handleGroupUpdated);
    chrome.tabGroups?.onRemoved.addListener(handleGroupRemoved);

    return () => {
      chrome.tabGroups?.onCreated.removeListener(handleGroupCreated);
      chrome.tabGroups?.onUpdated.removeListener(handleGroupUpdated);
      chrome.tabGroups?.onRemoved.removeListener(handleGroupRemoved);
    };
  }, [tabGroups, ungroupedTabs]);

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
