import React, { useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import './App.css';
import useIpcRenderer from './hooks/useIpcRenderer'; // 导入自定义 Hook

import LayoutComponent from './components/LayoutComponent'; // 导入 LayoutComponent
import EditorPanel from './components/EditorPanel';
import ChatPanel from './components/ChatPanel';
import ChapterTreePanel from './components/ChapterTreePanel';

import {
  appendMessage,
  setToolSuggestions,
  setToolStatus,
  setQuestionCard,
  clearToolSuggestions, // 新增：导入 clearToolSuggestions
} from './store/slices/chatSlice';
import { setNovelContent, setCurrentFile, triggerChapterRefresh } from './store/slices/novelSlice';

function App() {
  const dispatch = useDispatch();

  // 从 Redux store 获取状态
  const messages = useSelector((state) => state.chat.messages);
  const toolSuggestions = useSelector((state) => state.chat.toolSuggestions);
  const questionCard = useSelector((state) => state.chat.questionCard);

  const chatDisplayRef = useRef(null); // 用于滚动到底部
  const currentSessionIdRef = useRef(null); // 新增：用于保存当前会话ID的引用

  // 使用自定义 Hook 获取 IPC 方法
  const { invoke } = useIpcRenderer();

  // 处理来自主进程的 AI 响应
  const handleAiResponse = useCallback((event, aiResponseObject) => {
    const receivedType = aiResponseObject.type;
    const receivedPayload = aiResponseObject.payload;

    console.log(`[App] 收到 AI 响应: Type: ${receivedType}, Payload:`, receivedPayload);

    switch (receivedType) {
      case 'text':
        // 直接使用 currentSessionIdRef.current，而不是作为 useCallback 的依赖
        dispatch(appendMessage({ sender: 'AI', text: receivedPayload, className: 'ai', sessionId: currentSessionIdRef.current }));
        break;
      case 'tool_suggestions':
        dispatch(setToolSuggestions(receivedPayload));
        break;
      case 'tool_action_status':
        dispatch(setToolStatus(receivedPayload));
        break;
      case 'batch_action_status': // 处理批量操作状态
        dispatch(appendMessage({ sender: 'System', text: `批量操作状态: ${receivedPayload.message}`, className: 'system-message' }));
        break;
      case 'tool_execution_status': // 处理工具执行状态
        // 如果 payload 包含 toolCallId，则更新特定工具卡片的状态
        if (receivedPayload.toolCallId) {
          dispatch(setToolStatus({
            toolCallId: receivedPayload.toolCallId,
            message: receivedPayload.message,
            status: receivedPayload.success ? 'executed' : 'failed'
          }));
        }
        // 同时作为系统消息添加到聊天中
        dispatch(appendMessage({ sender: 'System', text: `工具 ${receivedPayload.toolName} 执行${receivedPayload.success ? '成功' : '失败'}：${receivedPayload.message}`, className: 'system-message' }));
        break;
      case 'batch_processing_complete':
        dispatch(clearToolSuggestions());
        break;
      case 'end_task':
        dispatch(appendMessage({ sender: 'AI', text: `任务已完成: ${receivedPayload}`, className: 'ai' }));
        break;
      case 'ask_user_question':
        dispatch(setQuestionCard(receivedPayload));
        break;
      case 'error':
        dispatch(appendMessage({ sender: 'System', text: `错误: ${receivedPayload}`, className: 'system-message' }));
        break;
      case 'warning':
          dispatch(appendMessage({ sender: 'System', text: `警告: ${receivedPayload}`, className: 'system-message' }));
          break;
      default:
        console.warn(`[App] 未知 AI 响应类型: ${receivedType}`);
    }
  }, [dispatch, appendMessage, setToolSuggestions, setToolStatus, clearToolSuggestions, setQuestionCard]); // 移除 currentSessionIdRef 依赖

  const handleUpdateNovelContent = useCallback((event, content) => {
    dispatch(setNovelContent(content));
  }, [dispatch]);

  const handleUpdateCurrentFile = useCallback((event, filename) => {
    dispatch(setCurrentFile(filename));
  }, [dispatch]);

  useEffect(() => {
    invoke('register-renderer-listeners'); // 通知主进程注册监听器

    // 注册 IPC 监听器
    if (window.ipcRenderer) {
      window.ipcRenderer.on('update-novel-content', handleUpdateNovelContent);
      window.ipcRenderer.on('update-current-file', handleUpdateCurrentFile);
      window.ipcRenderer.on('ai-response', handleAiResponse); // 在 App.js 中注册 ai-response 监听器
      console.log("[App] 'ai-response' 监听器已注册.");
    }

    // 清理函数
    return () => {
      if (window.ipcRenderer) {
        window.ipcRenderer.removeListener('update-novel-content', handleUpdateNovelContent);
        window.ipcRenderer.removeListener('update-current-file', handleUpdateCurrentFile);
        window.ipcRenderer.removeListener('ai-response', handleAiResponse); // 移除 ai-response 监听器
        console.log("[App] 'ai-response' 监听器已移除.");
      }
    };
  }, [handleUpdateNovelContent, handleUpdateCurrentFile, handleAiResponse, invoke]); // 依赖 dispatch 和 invoke

  // 自动滚动聊天区到底部
  useEffect(() => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  }, [messages, toolSuggestions, questionCard]); // 依赖消息和工具建议的变化

  const handleSendMessage = async (command) => {
    // 1. 获取当前会话的 sessionId
    const currentSessionId = messages.length > 0
      ? messages[messages.length - 1].sessionId
      : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    currentSessionIdRef.current = currentSessionId; // 更新 ref
 
     // 2. 创建新的用户消息，并赋予 sessionId
    const newUserMessage = {
      sender: 'User',
      text: command,
      role: 'user', // DeepSeek API 角色
      content: command, // DeepSeek API 内容
      className: 'user', // 新增：为用户消息添加 className
      sessionId: currentSessionId, // 赋予新消息 sessionId
    };
    dispatch(appendMessage(newUserMessage)); // 将新消息添加到 Redux store

    // 3. 构建要发送给后端的消息数组
    // 此时 messages 数组是旧的，需要手动将 newUserMessage 添加进去
    const messagesToSend = [...messages, newUserMessage];

    // 4. 将包含新消息和历史消息的完整数组作为上下文传递给后端
    await invoke('process-command', command, messagesToSend);
  };

  const handleToolAction = async (toolCallId, action) => {
    await invoke('process-tool-action', toolCallId, action);
  };

  const handleBatchAction = async (action) => {
    await invoke('process-batch-action', action);
  };

  const handleUserQuestionResponse = async (response, toolCallId) => {
    await invoke('send-user-response', response, toolCallId);
    dispatch(appendMessage({ sender: 'user', text: response })); // 在聊天中显示用户的回复
    dispatch(setQuestionCard(null)); // 隐藏提问卡片
  };


  return (
    <div className="App">
      <LayoutComponent
        chapterPanel={<ChapterTreePanel />}
        editorPanel={<EditorPanel />}
        chatPanel={
          <ChatPanel
            messages={messages}
            toolSuggestions={toolSuggestions}
            questionCard={questionCard}
          />
        }
      />
    </div>
  );
}

export default App;