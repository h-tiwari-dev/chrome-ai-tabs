import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';

exampleThemeStorage.get().then(theme => {
  console.log('theme', theme);
});

(async () => {
  const tabs = await chrome.tabs.query({});
  console.log('Tabs', tabs);
})();

console.log('background loaded');
console.log("Edit 'chrome-extension/src/background/index.ts' and save to reload.");
