import '@src/SidePanel.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import React, { useEffect, useState } from 'react';
import type { DropResult } from 'react-beautiful-dnd';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

interface IconProps {
  className?: string;
  onClick?: () => void;
}

const Icons = {
  Move: ({ className, ...props }: IconProps) => (
    <span className={className} {...props}>
      ↕️
    </span>
  ),
  Plus: ({ className, ...props }: IconProps) => (
    <span className={className} {...props}>
      ➕
    </span>
  ),
  X: ({ className, ...props }: IconProps) => (
    <span className={className} {...props}>
      ✕
    </span>
  ),
  ChevronDown: ({ className, ...props }: IconProps) => (
    <span className={className} {...props}>
      ▼
    </span>
  ),
  ChevronUp: ({ className, ...props }: IconProps) => (
    <span className={className} {...props}>
      ▲
    </span>
  ),
  ExternalLink: ({ className, ...props }: IconProps) => (
    <span className={className} {...props}>
      ↗️
    </span>
  ),
  Settings: ({ className, ...props }: IconProps) => (
    <span className={className} {...props}>
      ⚙️
    </span>
  ),
};
import {
  useTabContext,
  useTabGroups,
  useUngroupedTabs,
  useChromeGroups,
} from '@extension/shared/lib/context/tab-grouping';
import type { TabGroup } from '@extension/storage';

// Color mapping for tab groups
const getGroupColorClass = (color: chrome.tabGroups.ColorEnum): string => {
  const colorMap: Record<chrome.tabGroups.ColorEnum, string> = {
    grey: 'bg-gray-500',
    blue: 'bg-blue-500',
    red: 'bg-red-500',
    yellow: 'bg-yellow-500',
    green: 'bg-green-500',
    pink: 'bg-pink-500',
    purple: 'bg-purple-500',
    cyan: 'bg-cyan-500',
    orange: 'bg-orange-500',
  };
  return colorMap[color] || 'bg-gray-500';
};

interface DraggableTabProps {
  tab: chrome.tabs.Tab;
  index: number;
  isLight: boolean;
  onClose?: (tabId: number) => void;
  onActivate?: (tabId: number) => void;
}

const DraggableTab: React.FC<DraggableTabProps> = ({ tab, index, isLight, onClose, onActivate }) => (
  <Draggable draggableId={`tab-${tab.id}`} index={index}>
    {provided => (
      <div
        ref={provided.innerRef}
        {...provided.draggableProps}
        className={`group flex items-center gap-3 rounded-lg p-3 transition-colors ${
          isLight
            ? 'border border-gray-200 bg-white hover:bg-gray-50'
            : 'border border-gray-700 bg-gray-900 hover:bg-gray-800'
        }`}>
        <div {...provided.dragHandleProps} className="cursor-grab">
          <Icons.Move className="size-4 shrink-0 text-gray-400" />
        </div>
        <div className="size-6 shrink-0">
          {tab.favIconUrl ? (
            <img
              src={tab.favIconUrl}
              alt=""
              className="size-full object-contain"
              onError={e => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className={`size-full rounded-full ${isLight ? 'bg-gray-200' : 'bg-gray-700'}`} />
          )}
        </div>

        <div className="min-w-0 grow">
          <h3 className={`truncate font-medium ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
            {tab.title || 'Untitled'}
          </h3>
          <p className={`truncate text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>{tab.url}</p>
        </div>

        {tab.active && (
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-xs ${
              isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900 text-blue-200'
            }`}>
            Active
          </span>
        )}

        <div className={`flex shrink-0 gap-2 opacity-0 transition-opacity group-hover:opacity-100`}>
          <button
            onClick={() => onActivate?.(tab.id!)}
            className={`rounded p-1 ${isLight ? 'text-gray-600 hover:bg-gray-200' : 'text-gray-300 hover:bg-gray-700'}`}
            title="Switch to tab">
            <Icons.ExternalLink className="size-4" />
          </button>
          <button
            onClick={() => onClose?.(tab.id!)}
            className={`rounded p-1 ${isLight ? 'text-gray-600 hover:bg-gray-200' : 'text-gray-300 hover:bg-gray-700'}`}
            title="Close tab">
            <Icons.X className="size-4" />
          </button>
        </div>
      </div>
    )}
  </Draggable>
);

interface DroppableGroupProps {
  group: TabGroup;
  isLight: boolean;
  onCollapseToggle: (groupId: number, collapsed: boolean) => void;
  onTabClose: (tabId: number) => void;
  onTabActivate: (tabId: number) => void;
}

const DroppableGroup: React.FC<DroppableGroupProps> = ({
  group,
  isLight,
  onCollapseToggle,
  onTabClose,
  onTabActivate,
}) => {
  return (
    <div className={`rounded-lg border ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
      <div
        className={`flex items-center justify-between gap-2 rounded-t-lg p-3 ${
          isLight ? 'bg-gray-50' : 'bg-gray-800'
        }`}>
        <div className="flex items-center gap-2">
          <div className={`size-3 rounded-full ${getGroupColorClass(group.color)}`} />
          <h3 className={`font-medium ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
            {group.name || 'Unnamed Group'}
          </h3>
          <span className={`text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>({group.tabs.length} tabs)</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onCollapseToggle(group.id, !group.collapsed)}
            className={`rounded p-1 ${
              isLight ? 'text-gray-600 hover:bg-gray-200' : 'text-gray-300 hover:bg-gray-700'
            }`}>
            {group.collapsed ? <Icons.ChevronDown className="size-4" /> : <Icons.ChevronUp className="size-4" />}
          </button>
        </div>
      </div>

      {!group.collapsed && (
        <Droppable droppableId={`group-${group.id}`}>
          {provided => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 p-3">
              {group.tabs.map((tab, index) => (
                <DraggableTab
                  key={tab.id}
                  tab={tab}
                  index={index}
                  isLight={isLight}
                  onClose={onTabClose}
                  onActivate={onTabActivate}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      )}
    </div>
  );
};

const SidePanel = () => {
  const { refreshTabs, isLoading } = useTabContext(); // Remove error if not used
  const { ungroupedTabs } = useUngroupedTabs(); // Remove removeUngroupedTab if not used
  const { tabGroups, createTabGroup } = useTabGroups();
  const { collapseGroup, expandGroup } = useChromeGroups();
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [debugValue, setDebugValue] = useState('');

  const isLight = true;

  useEffect(() => {
    refreshTabs();
  }, [refreshTabs]);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    try {
      const { source, destination } = result;

      // Handle ungrouping (moving to ungrouped area)
      if (source.droppableId.startsWith('group-') && destination.droppableId === 'ungrouped') {
        const sourceGroupId = parseInt(source.droppableId.replace('group-', ''));
        const sourceGroup = tabGroups.find(g => g.id === sourceGroupId);

        if (!sourceGroup) {
          setDebugValue('Source group not found');
          return;
        }

        const tab = sourceGroup.tabs[source.index];
        if (!tab?.id) return;

        setDebugValue(`Ungrouping tab ${tab.id}`);

        // First move the tab to maintain order
        if (destination.index !== undefined) {
          await chrome.tabs.move(tab.id, { index: destination.index });
        }

        // Then ungroup it
        await chrome.tabs.ungroup(tab.id);
      } else if (source.droppableId === 'ungrouped' && destination.droppableId.startsWith('group-')) {
        const tab = ungroupedTabs[source.index];
        if (!tab?.id) return;

        const destGroupId = parseInt(destination.droppableId.replace('group-', ''));
        const targetGroup = tabGroups.find(g => g.id === destGroupId);

        if (!targetGroup) {
          setDebugValue('Target group not found');
          return;
        }

        // First move the tab to maintain order
        if (destination.index !== undefined) {
          await chrome.tabs.move(tab.id, { index: destination.index });
        }

        // Then group it
        await chrome.tabs.group({
          groupId: targetGroup.chromeGroupId,
          tabIds: [tab.id],
        });
      } else if (source.droppableId.startsWith('group-') && destination.droppableId.startsWith('group-')) {
        const sourceGroupId = parseInt(source.droppableId.replace('group-', ''));
        const destGroupId = parseInt(destination.droppableId.replace('group-', ''));

        const sourceGroup = tabGroups.find(g => g.id === sourceGroupId);
        const targetGroup = tabGroups.find(g => g.id === destGroupId);

        if (!sourceGroup || !targetGroup) {
          setDebugValue('Source or target group not found');
          return;
        }

        const tab = sourceGroup.tabs[source.index];
        if (!tab?.id) return;

        // First move the tab to maintain order
        if (destination.index !== undefined) {
          await chrome.tabs.move(tab.id, { index: destination.index });
        }

        // Then move to new group
        await chrome.tabs.group({
          groupId: targetGroup.chromeGroupId,
          tabIds: [tab.id],
        });
      }

      await refreshTabs();
    } catch (error) {
      setDebugValue(`Error: ${JSON.stringify(error)}`);
      console.error('Drag and drop error:', error);
    }
  };
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    const selectedTabs = await chrome.tabs.query({ highlighted: true, currentWindow: true });
    if (selectedTabs.length > 0) {
      await createTabGroup(newGroupName, selectedTabs);
      setNewGroupName('');
      setIsCreatingGroup(false);
      await refreshTabs();
    }
  };

  const handleCloseTab = async (tabId: number) => {
    await chrome.tabs.remove(tabId);
    await refreshTabs();
  };

  const handleActivateTab = async (tabId: number) => {
    await chrome.tabs.update(tabId, { active: true });
  };

  return (
    <div className={`min-h-screen w-full ${isLight ? 'bg-slate-50' : 'bg-gray-800'}`}>
      <header
        className={`sticky top-0 z-10 border-b p-4 ${
          isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-gray-900'
        }`}>
        <div className="flex items-center justify-between">
          <h1 className={`text-lg font-semibold ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
            Tabs ({ungroupedTabs.length + tabGroups.reduce((acc, g) => acc + g.tabs.length, 0)})
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setIsCreatingGroup(true)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 ${
                isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900 text-blue-100'
              }`}>
              <Icons.Plus className="size-4" />
              New Group
            </button>
            <button
              onClick={refreshTabs}
              disabled={isLoading}
              className={`rounded-md px-3 py-2 transition-colors ${
                isLight
                  ? 'text-gray-600 hover:bg-gray-100 disabled:bg-gray-100'
                  : 'text-gray-300 hover:bg-gray-800 disabled:bg-gray-800'
              } disabled:opacity-50`}>
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {isCreatingGroup && (
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="Group name"
              className="grow rounded-md border px-3 py-2"
            />
            <button onClick={handleCreateGroup} className="rounded-md bg-blue-500 px-3 py-2 text-white">
              Create
            </button>
            <button onClick={() => setIsCreatingGroup(false)} className="rounded-md border px-3 py-2">
              Cancel
            </button>
          </div>
        )}
      </header>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="p-4">
          {isLoading ? (
            <div className={`py-8 text-center ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>Loading tabs...</div>
          ) : ungroupedTabs.length === 0 && tabGroups.length === 0 ? (
            <div className={`py-8 text-center ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>No tabs open</div>
          ) : (
            <div className="space-y-6">
              {tabGroups.length > 0 && (
                <div className="space-y-4">
                  <h2 className={`font-medium ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>Grouped Tabs</h2>
                  <div className="space-y-4">
                    {tabGroups.map(group => (
                      <DroppableGroup
                        key={group.id}
                        group={group}
                        isLight={isLight}
                        onCollapseToggle={(id, collapsed) => (collapsed ? collapseGroup(id) : expandGroup(id))}
                        onTabClose={handleCloseTab}
                        onTabActivate={handleActivateTab}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <h2 className={`font-medium ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>Ungrouped Tabs</h2>
                <Droppable droppableId="ungrouped">
                  {provided => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                      {ungroupedTabs?.length > 0 ? (
                        ungroupedTabs.map((tab, index) => (
                          <DraggableTab
                            key={tab.id}
                            tab={tab}
                            index={index}
                            isLight={isLight}
                            onClose={handleCloseTab}
                            onActivate={handleActivateTab}
                          />
                        ))
                      ) : (
                        <div className={`py-4 text-center ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                          No ungrouped tabs
                        </div>
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            </div>
          )}
        </div>
      </DragDropContext>
    </div>
  );
};

const LoadingView = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="text-gray-400">Loading...</div>
  </div>
);

const ErrorView = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="text-red-500">Error Occurred</div>
  </div>
);

export default withErrorBoundary(withSuspense(SidePanel, <LoadingView />), <ErrorView />);
