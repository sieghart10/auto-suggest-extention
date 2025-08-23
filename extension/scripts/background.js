importScripts("api.js");

const api = new API("http://localhost:8000");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      let result;

      switch (message.action) {
        case "checkServerStatus":
          result = await api.checkServerStatus();
          break;
        case "getSettings":
          result = await api.getSettings();
          break;
        case "updateSettings":
          result = await api.updateSettings(message.settings);
          break;
        case "toggleExtension":
          result = await api.toggleExtension();
          break;
        case "switchModel":
          result = await api.switchModel(message.model);
          break;
        case "getCacheStatus":
            result = await api.getCacheStatus();
            break;
        case "switchModelOptimized":
            result = await api.switchModelOptimized(message.model);
            break;
        case "predict":
          result = await api.predict(message.text, message.topK, message.method);
          break;
        default:
          throw new Error("Unknown action: " + message.action);
      }

      sendResponse({ success: true, data: result });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // keep message channel open for async
});
