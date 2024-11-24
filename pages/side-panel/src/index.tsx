import { createRoot } from 'react-dom/client';
import '@src/index.css';
import SidePanel from '@src/SidePanel';
import { AISessionProvider } from '@extension/shared/lib/context/ai-context';
import { TabContextProvider } from '@extension/shared/lib/context/tab-grouping';

function init() {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);
  root.render(
    <AISessionProvider systemPrompt="">
      <TabContextProvider>
        <SidePanel />
      </TabContextProvider>
    </AISessionProvider>,
  );
}

init();
