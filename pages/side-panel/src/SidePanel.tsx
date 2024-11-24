import '@src/SidePanel.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { useEffect } from 'react';
import {
  useTabContext,
  useTabGroups,
  useUngroupedTabs,
  useChromeGroups,
} from '@extension/shared/lib/context/tab-grouping';

const TabItem = ({ tab, isLight }: { tab: chrome.tabs.Tab; isLight: boolean }) => (
  <div
    className={`group flex items-center gap-3 rounded-lg p-3 transition-colors ${
      isLight
        ? 'border border-gray-200 bg-white hover:bg-gray-50'
        : 'border border-gray-700 bg-gray-900 hover:bg-gray-800'
    }`}>
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

    <div
      className={`flex shrink-0 gap-2 opacity-0 transition-opacity group-hover:opacity-100 ${
        isLight ? 'text-gray-400' : 'text-gray-500'
      }`}>
      <button
        onClick={() => chrome.tabs.update(tab.id!, { active: true })}
        className={`rounded p-1 ${
          isLight ? 'hover:bg-gray-900/10 hover:text-gray-900' : 'hover:bg-gray-100/10 hover:text-gray-100'
        }`}
        title="Switch to tab">
        ↗️
      </button>
    </div>
  </div>
);

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

interface ExtendedTabGroup extends Omit<chrome.tabGroups.TabGroup, 'tabs'> {
  tabs: chrome.tabs.Tab[];
}

const GroupItem = ({ group, isLight }: { group: ExtendedTabGroup; isLight: boolean }) => {
  const { collapseGroup, expandGroup } = useChromeGroups();

  return (
    <div className={`rounded-lg border ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
      <div
        className={`flex items-center justify-between gap-2 rounded-t-lg p-3 ${
          isLight ? 'bg-gray-50' : 'bg-gray-800'
        }`}>
        <div className="flex items-center gap-2">
          <div className={`size-3 rounded-full ${getGroupColorClass(group.color)}`} />
          <h3 className={`font-medium ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
            {group.title || 'Unnamed Group'}
          </h3>
          <span className={`text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>({group.tabs.length} tabs)</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => (group.collapsed ? expandGroup(group.id) : collapseGroup(group.id))}
            className={`rounded p-1 ${
              isLight ? 'text-gray-600 hover:bg-gray-200' : 'text-gray-300 hover:bg-gray-700'
            }`}>
            {group.collapsed ? '⌄' : '⌃'}
          </button>
        </div>
      </div>
      {!group.collapsed && (
        <div className="space-y-2 p-3">
          {group.tabs.map(tab => (
            <TabItem key={tab.id} tab={tab} isLight={isLight} />
          ))}
        </div>
      )}
    </div>
  );
};

const SidePanel = () => {
  const { refreshTabs, isLoading, error } = useTabContext();
  const { ungroupedTabs } = useUngroupedTabs();
  const { tabGroups } = useTabGroups();

  // useEffect(() => {
  //   const handleFocus = () => refreshTabs();
  //   handleFocus()
  //   // window.addEventListener('focus', handleFocus);
  //   // return () => window.removeEventListener('focus', handleFocus);
  // }, [refreshTabs]);
  //
  // // TODO: Do something with this
  // // Add manual refresh button handler
  // const handleRefresh = () => {
  //   refreshTabs();
  // };

  const isLight = true;
  useEffect(() => {
    refreshTabs();
  }, [refreshTabs]);

  // if (isLoading && ungroupedTabs.length === 0 && tabGroups.length === 0) {
  //   return (
  //     <div className="flex min-h-screen items-center justify-center">
  //       <div className="text-gray-400">Loading tabs...</div>
  //     </div>
  //   );
  // }

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
      </header>

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
              </div>
            )}

            {ungroupedTabs.length > 0 && (
              <div className="space-y-4">
                <h2 className={`font-medium ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>Ungrouped Tabs</h2>
                <div className="space-y-2">
                  {ungroupedTabs.map(tab => (
                    <TabItem key={tab.id} tab={tab} isLight={isLight} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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

// <div className="space-y-4">
//   {tabGroups.map(group => (
//     <GroupItem
//       key={group.id}
//       group={{
//         ...group,
//         windowId: group.id,
//       } as ExtendedTabGroup}
//       isLight={isLight}
//     />
//   ))}
// </div>
