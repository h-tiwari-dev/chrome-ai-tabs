import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

export interface TabGroup {
  id: string;
  name: string;
  tabs: chrome.tabs.Tab[];
  category: string;
  summary?: string;
  created: Date;
  lastModified: Date;
  chromeGroupId?: number;
  color?: chrome.tabGroups.ColorEnum;
  collapsed?: boolean;
}

interface TabState {
  groups: TabGroup[];
  activeGroupId: string | null;
  lastSync: Date;
  ungroupedTabs: chrome.tabs.Tab[]; // Track tabs that aren't in any group
  currentWindow: number | null; // Track current window ID
}

interface SerializedTabState {
  groups: Array<{
    id: string;
    name: string;
    tabs: chrome.tabs.Tab[];
    category: string;
    summary?: string;
    created: string;
    lastModified: string;
    chromeGroupId?: number;
    color?: chrome.tabGroups.ColorEnum;
    collapsed?: boolean;
  }>;
  activeGroupId: string | null;
  lastSync: string;
  ungroupedTabs: chrome.tabs.Tab[];
  currentWindow: number | null;
}

const initialState: TabState = {
  groups: [],
  activeGroupId: null,
  lastSync: new Date(),
  ungroupedTabs: [],
  currentWindow: null,
};

function safeParse(text: string | null | undefined): TabState {
  if (!text) return initialState;
  try {
    const parsed = JSON.parse(text);
    if (!parsed) return initialState;
    return {
      groups: (parsed.groups || []).map((group: TabGroup) => ({
        ...group,
        created: new Date(group.created || new Date()),
        lastModified: new Date(group.lastModified || new Date()),
        tabs: Array.isArray(group.tabs) ? group.tabs : [],
      })),
      activeGroupId: parsed.activeGroupId || null,
      lastSync: new Date(parsed.lastSync || new Date()),
      ungroupedTabs: Array.isArray(parsed.ungroupedTabs) ? parsed.ungroupedTabs : [],
      currentWindow: parsed.currentWindow || null,
    };
  } catch (error) {
    console.error('Failed to parse tab state:', error);
    return initialState;
  }
}

const serialization = {
  serialize: (state: TabState): string => {
    try {
      const serializedState: SerializedTabState = {
        groups: state.groups.map(group => ({
          ...group,
          created: group.created.toISOString(),
          lastModified: group.lastModified.toISOString(),
        })),
        activeGroupId: state.activeGroupId,
        lastSync: state.lastSync.toISOString(),
        ungroupedTabs: state.ungroupedTabs,
        currentWindow: state.currentWindow,
      };
      return JSON.stringify(serializedState);
    } catch (error) {
      console.error('Serialization error:', error);
      return JSON.stringify(initialState);
    }
  },
  deserialize: (text: string): TabState => {
    return safeParse(text);
  },
};

interface TabStorageExtensions {
  addGroup: (group: Omit<TabGroup, 'created' | 'lastModified'>) => Promise<void>;
  removeGroup: (groupId: string) => Promise<void>;
  updateGroup: (groupId: string, updates: Partial<Omit<TabGroup, 'id'>>) => Promise<void>;
  setActiveGroup: (groupId: string | null) => Promise<void>;
  addTabsToGroup: (groupId: string, tabs: chrome.tabs.Tab[]) => Promise<void>;
  removeTabFromGroup: (groupId: string, tabId: number) => Promise<void>;
  updateUngroupedTabs: (tabs: chrome.tabs.Tab[]) => Promise<void>;
  addUngroupedTab: (tab: chrome.tabs.Tab) => Promise<void>;
  removeUngroupedTab: (tabId: number) => Promise<void>;
  setCurrentWindow: (windowId: number) => Promise<void>;
  syncWithCurrentTabs: (currentTabs: chrome.tabs.Tab[]) => Promise<void>;
}

type TabStorage = BaseStorage<TabState> & TabStorageExtensions;

const baseStorage = createStorage<TabState>('tab-groups-storage', initialState, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
  serialization,
});

export const tabStorage: TabStorage = {
  ...baseStorage,

  addGroup: async group => {
    const currentState = await baseStorage.get();
    // Remove tabs that will be in the group from ungroupedTabs
    const newUngroupedTabs = currentState.ungroupedTabs.filter(
      tab => !group.tabs.some(groupTab => groupTab.id === tab.id),
    );

    await baseStorage.set({
      ...currentState,
      groups: [
        ...currentState.groups,
        {
          ...group,
          created: new Date(),
          lastModified: new Date(),
        },
      ],
      ungroupedTabs: newUngroupedTabs,
      lastSync: new Date(),
    });
  },

  removeGroup: async groupId => {
    const currentState = await baseStorage.get();
    const groupToRemove = currentState.groups.find(g => g.id === groupId);

    // Move tabs from the removed group to ungrouped
    const newUngroupedTabs = groupToRemove
      ? [...currentState.ungroupedTabs, ...groupToRemove.tabs]
      : currentState.ungroupedTabs;

    await baseStorage.set({
      ...currentState,
      groups: currentState.groups.filter(g => g.id !== groupId),
      activeGroupId: currentState.activeGroupId === groupId ? null : currentState.activeGroupId,
      ungroupedTabs: newUngroupedTabs,
      lastSync: new Date(),
    });
  },

  updateGroup: async (groupId, updates) => {
    const currentState = await baseStorage.get();
    await baseStorage.set({
      ...currentState,
      groups: currentState.groups.map(group =>
        group.id === groupId
          ? {
              ...group,
              ...updates,
              lastModified: new Date(),
            }
          : group,
      ),
      lastSync: new Date(),
    });
  },

  setActiveGroup: async groupId => {
    const currentState = await baseStorage.get();
    await baseStorage.set({
      ...currentState,
      activeGroupId: groupId,
      lastSync: new Date(),
    });
  },

  addTabsToGroup: async (groupId, tabs) => {
    const currentState = await baseStorage.get();
    // Remove tabs from ungroupedTabs when adding to a group
    const newUngroupedTabs = currentState.ungroupedTabs.filter(tab => !tabs.some(newTab => newTab.id === tab.id));

    await baseStorage.set({
      ...currentState,
      groups: currentState.groups.map(group =>
        group.id === groupId
          ? {
              ...group,
              tabs: [...group.tabs, ...tabs],
              lastModified: new Date(),
            }
          : group,
      ),
      ungroupedTabs: newUngroupedTabs,
      lastSync: new Date(),
    });
  },

  removeTabFromGroup: async (groupId, tabId) => {
    const currentState = await baseStorage.get();
    const removedTab = currentState.groups.find(g => g.id === groupId)?.tabs.find(t => t.id === tabId);

    // Add removed tab to ungroupedTabs if it exists
    const newUngroupedTabs = removedTab ? [...currentState.ungroupedTabs, removedTab] : currentState.ungroupedTabs;

    await baseStorage.set({
      ...currentState,
      groups: currentState.groups.map(group =>
        group.id === groupId
          ? {
              ...group,
              tabs: group.tabs.filter(tab => tab.id !== tabId),
              lastModified: new Date(),
            }
          : group,
      ),
      ungroupedTabs: newUngroupedTabs,
      lastSync: new Date(),
    });
  },

  updateUngroupedTabs: async tabs => {
    const currentState = await baseStorage.get();
    await baseStorage.set({
      ...currentState,
      ungroupedTabs: tabs,
      lastSync: new Date(),
    });
  },

  addUngroupedTab: async tab => {
    const currentState = await baseStorage.get();
    await baseStorage.set({
      ...currentState,
      ungroupedTabs: [...currentState.ungroupedTabs, tab],
      lastSync: new Date(),
    });
  },

  removeUngroupedTab: async tabId => {
    const currentState = await baseStorage.get();
    await baseStorage.set({
      ...currentState,
      ungroupedTabs: currentState.ungroupedTabs.filter(tab => tab.id !== tabId),
      lastSync: new Date(),
    });
  },

  setCurrentWindow: async windowId => {
    const currentState = await baseStorage.get();
    await baseStorage.set({
      ...currentState,
      currentWindow: windowId,
      lastSync: new Date(),
    });
  },

  syncWithCurrentTabs: async (currentTabs: chrome.tabs.Tab[]) => {
    const currentState = await baseStorage.get();

    // Get all tabs that are in groups
    const groupedTabIds = new Set(currentState.groups.flatMap(group => group.tabs.map(tab => tab.id)));

    // Identify tabs that aren't in any group
    const ungroupedTabs = currentTabs.filter(tab => !groupedTabIds.has(tab.id));

    await baseStorage.set({
      ...currentState,
      ungroupedTabs,
      lastSync: new Date(),
    });
  },
};
