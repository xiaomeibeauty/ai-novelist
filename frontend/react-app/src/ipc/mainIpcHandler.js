// frontend/react-app/src/ipc/mainIpcHandler.js
import { setDeepSeekHistory } from '../store/slices/chatSlice';

export const registerMainIpcListeners = (dispatch) => {
  const handleAiResponse = (event, payload) => {
    // 统一派发一个 IPC 原始消息 action，payload 包含 type 和具体数据
    dispatch({ type: 'chat/ipcAiResponse', payload });
  };

  const handleUpdateNovelContent = (event, content) => {
    dispatch({ type: 'novel/updateContent', payload: content }); 
  };
  
  const handleUpdateCurrentFile = (event, filename) => {
    dispatch({ type: 'novel/updateCurrentFile', payload: filename }); 
  };

  if (window.ipcRenderer) {
    window.ipcRenderer.on('ai-response', handleAiResponse);
    window.ipcRenderer.on('update-novel-content', handleUpdateNovelContent);
    window.ipcRenderer.on('update-current-file', handleUpdateCurrentFile);
    window.ipcRenderer.on('ai-chat-history', (event, history) => {
      dispatch(setDeepSeekHistory(history));
    });
    console.log("[MainIpcHandler] 所有 IPC 监听器已注册.");
  }

  // 返回清理函数
  return () => {
    if (window.ipcRenderer) {
      window.ipcRenderer.removeListener('ai-response', handleAiResponse);
      window.ipcRenderer.removeListener('update-novel-content', handleUpdateNovelContent);
      window.ipcRenderer.removeListener('update-current-file', handleUpdateCurrentFile);
      // 注意：这里移除监听器时，回调函数必须是同一个引用，否则无法正确移除。
      // 对于匿名函数，需要单独定义
      const removeHistoryListener = (event, history) => {
        dispatch(setDeepSeekHistory(history));
      };
      window.ipcRenderer.removeListener('ai-chat-history', removeHistoryListener);
      console.log("[MainIpcHandler] 所有 IPC 监听器已移除.");
    }
  };
};