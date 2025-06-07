import { useCallback } from 'react';

const useIpcRenderer = () => {
  const send = useCallback((channel, ...args) => {
    if (window.ipcRenderer) {
      window.ipcRenderer.send(channel, ...args);
    } else {
      console.warn('ipcRenderer is not available. Are you running in Electron?');
    }
  }, []);

  const invoke = useCallback(async (channel, ...args) => {
    if (window.ipcRenderer) {
      return await window.ipcRenderer.invoke(channel, ...args);
    } else {
      console.warn('ipcRenderer is not available. Are you running in Electron?');
      return null;
    }
  }, []);

  const on = useCallback((channel, listener) => {
    if (window.ipcRenderer) {
      window.ipcRenderer.on(channel, listener);
    } else {
      console.warn('ipcRenderer is not available. Are you running in Electron?');
    }
  }, []);

  const removeListener = useCallback((channel, listener) => {
    if (window.ipcRenderer) {
      window.ipcRenderer.removeListener(channel, listener);
    } else {
      console.warn('ipcRenderer is not available. Are you running in Electron?');
    }
  }, []);

  return {
    send,
    invoke,
    on,
    removeListener,
    getDeepSeekChatHistory: () => invoke('get-deepseek-chat-history'),
    deleteDeepSeekChatHistory: (sessionId) => invoke('delete-deepseek-chat-history', sessionId),
    clearDeepSeekConversation: () => invoke('clear-deepseek-conversation') // 新增
  };
};

export default useIpcRenderer;