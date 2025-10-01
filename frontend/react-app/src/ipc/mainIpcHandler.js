// frontend/react-app/src/ipc/mainIpcHandler.js
import { setDeepSeekHistory } from '../store/slices/chatSlice';

// 环境检测函数
const isElectron = () => {
  return !!(window.ipcRenderer || window.api);
};

export const registerMainIpcListeners = (dispatch) => {
  // 开发环境模拟IPC事件处理
  const simulateElectronEvents = () => {
    if (!isElectron()) {
      console.log('开发环境: 模拟Electron IPC事件');
      
      // 模拟文件更新事件（用于测试）
      setTimeout(() => {
        const mockFileUpdate = {
          type: 'file-content-updated',
          payload: {
            filePath: '/novel/test.md',
            content: '# 测试文件\n这是开发环境模拟的文件内容',
            checkpointId: 'dev-mock-checkpoint'
          }
        };
        
        if (typeof window.dispatchMockIpcEvent === 'function') {
          window.dispatchMockIpcEvent('ai-response', mockFileUpdate);
        }
      }, 2000);
    }
  };

  const handleAiResponse = (event, payload) => {
    // 根据 payload 的 type 智能分发 action
    const { type, payload: innerPayload } = payload;
    
    switch (type) {
      case 'initial-checkpoint-created':
      case 'file-content-updated':
        // 这是一个文件更新事件，它会触发两个动作：
        // 1. 同步 novelSlice 中的文件内容
        if (type === 'file-content-updated') {
          console.log(`[MainIpcHandler] Dispatching novel/syncFileContent for path: ${innerPayload.filePath}`);
          dispatch({ type: 'novel/syncFileContent', payload: innerPayload });
        }

        // 2. 如果存在 checkpointId，则向 chatSlice 追加一条系统消息
        if (innerPayload.checkpointId) {
          const messageText = type === 'initial-checkpoint-created'
            ? innerPayload.message
            : `文件 ${innerPayload.filePath} 已保存一个新版本。`;

          console.log(`[MainIpcHandler] Dispatching chat/appendMessage for checkpoint: ${innerPayload.checkpointId}`);
          const systemMessage = {
            sender: 'System',
            role: 'system',
            name: 'Checkpoint Saved',
            text: messageText,
            content: messageText,
            checkpointId: innerPayload.checkpointId,
            className: 'system-info',
            // 确保消息有唯一的 id，以避免 react key 警告
            id: `checkpoint-${innerPayload.checkpointId}-${Date.now()}`
          };
          dispatch({ type: 'chat/appendMessage', payload: systemMessage });
        }
        break;

      case 'system-message':
        // 专门处理后端主动推送的系统消息（例如，首次存档）
        console.log(`[MainIpcHandler] Dispatching chat/appendMessage for system message.`);
        dispatch({ type: 'chat/appendMessage', payload: innerPayload });
        break;

      default:
        // 所有其他事件都属于 chatSlice
        dispatch({ type: 'chat/ipcAiResponse', payload });
        break;
    }
  };

  const handleUpdateCurrentFile = (event, filename) => {
    dispatch({ type: 'novel/updateCurrentFile', payload: filename });
  };

  const handleFileWritten = (event, { filePath, content }) => {
    dispatch({ type: 'novel/fileWritten', payload: { filePath, content } });
  };

  const handleFileDeleted = (event, { filePath }) => {
    dispatch({ type: 'novel/fileDeleted', payload: { filePath } });
  };

  const handleFileRenamed = (event, { oldFilePath, newFilePath }) => {
    dispatch({ type: 'novel/fileRenamed', payload: { oldFilePath, newFilePath } });
  };

  if (isElectron()) {
    const ipc = window.ipcRenderer || window.api;
    if (ipc) {
      ipc.on('ai-response', handleAiResponse);
      ipc.on('update-current-file', handleUpdateCurrentFile);
      ipc.on('file-written', handleFileWritten);
      ipc.on('file-deleted', handleFileDeleted);
      ipc.on('file-renamed', handleFileRenamed);
      ipc.on('ai-chat-history', (event, history) => {
        dispatch(setDeepSeekHistory(history));
      });
      console.log("[MainIpcHandler] 所有 IPC 监听器已注册.");
    }
  } else {
    console.log("[MainIpcHandler] 开发环境: 无法注册IPC监听器，使用模拟事件");
    
    // 开发环境下的模拟事件处理
    window.dispatchMockIpcEvent = (channel, data) => {
      switch (channel) {
        case 'ai-response':
          handleAiResponse(null, data);
          break;
        case 'update-current-file':
          handleUpdateCurrentFile(null, data);
          break;
        case 'file-written':
          handleFileWritten(null, data);
          break;
        case 'file-deleted':
          handleFileDeleted(null, data);
          break;
        case 'file-renamed':
          handleFileRenamed(null, data);
          break;
        default:
          console.warn(`开发环境: 未知的模拟事件通道: ${channel}`);
      }
    };
    
    // 启动模拟事件
    simulateElectronEvents();
  }

  // 返回清理函数
  return () => {
    if (isElectron()) {
      const ipc = window.ipcRenderer || window.api;
      if (ipc) {
        ipc.removeListener('ai-response', handleAiResponse);
        ipc.removeListener('update-current-file', handleUpdateCurrentFile);
        ipc.removeListener('file-written', handleFileWritten);
        ipc.removeListener('file-deleted', handleFileDeleted);
        ipc.removeListener('file-renamed', handleFileRenamed);
        // 注意：这里移除监听器时，回调函数必须是同一个引用，否则无法正确移除。
        // 对于匿名函数，需要单独定义
        const removeHistoryListener = (event, history) => {
          dispatch(setDeepSeekHistory(history));
        };
        ipc.removeListener('ai-chat-history', removeHistoryListener);
        console.log("[MainIpcHandler] 所有 IPC 监听器已移除.");
      }
    } else {
      console.log("[MainIpcHandler] 开发环境: 清理模拟事件");
      delete window.dispatchMockIpcEvent;
    }
  };
};