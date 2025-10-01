import { useCallback } from 'react';

// 环境检测函数
const isElectron = () => {
  return !!(window.ipcRenderer || window.api);
};

const useIpcRenderer = () => {
  const send = useCallback((channel, ...args) => {
    if (isElectron()) {
      if (window.ipcRenderer) {
        window.ipcRenderer.send(channel, ...args);
      } else if (window.api) {
        window.api.send(channel, ...args);
      }
    } else {
      console.warn(`开发环境: 无法发送IPC消息 (${channel})，请启动Electron应用`);
      // 开发环境中，某些send操作可以转换为HTTP请求
      if (channel === 'main-log') {
        console.log('开发环境日志:', ...args);
      }
    }
  }, []);

  const invoke = useCallback(async (channel, ...args) => {
    if (isElectron()) {
      if (window.ipcRenderer) {
        return await window.ipcRenderer.invoke(channel, ...args);
      } else if (window.api) {
        return await window.api.invoke(channel, ...args);
      }
    } else {
      console.warn(`开发环境: 无法调用IPC方法 (${channel})，请在Electron环境中运行`);
      return { success: false, error: `开发环境不支持此操作: ${channel}` };
    }
  }, []);

  const on = useCallback((channel, listener) => {
    if (isElectron()) {
      if (window.ipcRenderer) {
        window.ipcRenderer.on(channel, listener);
      } else if (window.api) {
        window.api.on(channel, listener);
      }
    } else {
      console.warn(`开发环境: 无法监听IPC事件 (${channel})`);
    }
  }, []);

  const removeListener = useCallback((channel, listener) => {
    if (isElectron()) {
      if (window.ipcRenderer) {
        window.ipcRenderer.removeListener(channel, listener);
      } else if (window.api) {
        window.api.removeListener(channel, listener);
      }
    } else {
      console.warn(`开发环境: 无法移除IPC监听器 (${channel})`);
    }
  }, []);

  return {
    send,
    invoke,
    on,
    removeListener,
    isElectron: useCallback(() => isElectron(), []),
    getDeepSeekChatHistory: useCallback(() => invoke('get-ai-chat-history'), [invoke]),
    deleteDeepSeekChatHistory: useCallback((sessionId) => invoke('delete-ai-chat-history', sessionId), [invoke]),
    clearDeepSeekConversation: useCallback(() => invoke('clear-ai-conversation'), [invoke]),
    getStoreValue: useCallback((key) => invoke('get-store-value', key), [invoke]),
    setStoreValue: useCallback((key, value) => invoke('set-store-value', key, value), [invoke]),
    sendToMainLog: useCallback((message) => send('main-log', message), [send]),
    listAllModels: useCallback(() => invoke('list-all-models'), [invoke]),
    reinitializeModelProvider: useCallback(() => invoke('reinitialize-model-provider'), [invoke]),
    reinitializeAliyunEmbedding: useCallback(() => invoke('reinitialize-aliyun-embedding'), [invoke]),
    stopStreaming: useCallback(() => invoke('stop-streaming'), [invoke]),
    getFileList: useCallback(() => invoke('get-file-list'), [invoke]),
    readFile: useCallback((filename) => invoke('read-file', filename), [invoke]),
    writeFile: useCallback((filePath, content) => invoke('write-file', filePath, content), [invoke])
  };
};

export default useIpcRenderer;
