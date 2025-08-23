import React, { useEffect, useRef, useCallback, memo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  appendMessage,
  setQuestionCard,
  setMessages,
  setIsHistoryPanelVisible,
  setIsDeleteMode,
  setDeepSeekHistory,
  setSelectedModel,
  setShowSettingsModal,
  setDeepseekApiKey,
  setOpenaiApiKey, // 新增
  setOpenrouterApiKey,
  setAvailableModels,
  setCustomSystemPrompt, // 新增
  resetCustomSystemPrompt, // 新增
  setEnableStream, // 新增
  approveToolCalls,
  rejectToolCalls,
  deleteMessage,
  startEditing,
  restoreMessages, // <--- 导入新的 action
  setCustomPromptForMode, // 新增：导入设置模式特定提示词的action
  resetCustomPromptForMode, // 新增：导入重置模式特定提示词的action
} from '../store/slices/chatSlice';
import { DEFAULT_SYSTEM_PROMPT } from '../store/slices/chatSlice'; // 导入默认系统提示词
import { startDiff, acceptSuggestion, rejectSuggestion } from '../store/slices/novelSlice';
import useIpcRenderer from '../hooks/useIpcRenderer';
import { restoreNovelArchive } from '../ipc/checkpointIpcHandler';
import ChatHistoryPanel from './ChatHistoryPanel';
import NotificationModal from './NotificationModal';
import ConfirmationModal from './ConfirmationModal';
import './ChatPanel.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faTrashCan, faPaperPlane, faGear, faSpinner, faBoxArchive, faCopy, faRedo, faPencil } from '@fortawesome/free-solid-svg-icons';
import CustomProviderSettings from './CustomProviderSettings'; // 新增
import PromptManagerModal from './PromptManagerModal'; // 新增：提示词管理模态框

// 新增：可重用的工具调用渲染组件
const ToolCallCard = ({ toolCall }) => {
  // 确保 toolCall 和其属性是存在的，避免运行时错误
  const toolName = toolCall?.function?.name || '未知工具';
  const toolArgs = toolCall?.toolArgs || {};
  const status = toolCall?.status;
  const isHistorical = status === 'historical';

  // 根据工具名称生成可读的标题
  const getToolDisplayName = (name) => {
    const nameMap = {
      'write_file': '写入文件',
      'ask_user_question': '提问',
      'end_task': '结束任务',
      'apply_diff': '应用差异',
      'insert_content': '插入内容',
    };
    return nameMap[name] || name;
  };

  return (
    <div className={`tool-call-card ${isHistorical ? 'historical' : ''}`}>
      <div className="tool-call-header">
        <FontAwesomeIcon icon={faBoxArchive} className="tool-icon" />
        <span className="tool-name">{getToolDisplayName(toolName)}</span>
        {isHistorical && <span className="historical-badge">历史记录</span>}
      </div>
      <pre className="tool-args">
        {JSON.stringify(toolArgs, null, 2)}
      </pre>
    </div>
  );
};


// 辅助函数：根据 insert_content 参数生成预览文本
const getInsertContentPreview = (currentContent, { paragraph, content: textToInsert }) => {
  if (typeof currentContent !== 'string' || typeof textToInsert !== 'string') return null;

  const lines = currentContent.split('\n');
  const paraIndex = parseInt(paragraph, 10);

  // paragraph 0 或无效值表示在末尾追加
  if (isNaN(paraIndex) || paraIndex <= 0) {
    lines.push(textToInsert);
  } else {
    // paragraph 是 1-based，数组索引是 0-based
    const insertAtIndex = Math.min(paraIndex - 1, lines.length);
    lines.splice(insertAtIndex, 0, textToInsert);
  }

  return lines.join('\n');
};

const ChatPanel = memo(() => {
  const dispatch = useDispatch();
  // 从 chat slice 获取状态
  const {
    messages,
    pendingToolCalls,
    toolCallState,
    questionCard,
    isHistoryPanelVisible,
    isDeleteMode,
    deepSeekHistory,
    showSettingsModal,
    deepseekApiKey,
    openaiApiKey,
    openrouterApiKey,
    selectedModel,
    availableModels,
    customSystemPrompt,
    enableStream,
    editingMessageId,
    customPrompts,
  } = useSelector((state) => state.chat);

  // 从 novel slice 获取状态
  const { openTabs, activeTabId } = useSelector((state) => state.novel);
  const activeTab = activeTabId ? openTabs.find(tab => tab.id === activeTabId) : null;
 
   const chatDisplayRef = useRef(null);
  const currentSessionIdRef = useRef(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [onConfirmCallback, setOnConfirmCallback] = useState(null);
  const [onCancelCallback, setOnCancelCallback] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState('deepseek'); // 默认选择 DeepSeek
  const [notification, setNotification] = useState({ show: false, message: '' });
  const [editingText, setEditingText] = useState('');
  const [currentMode, setCurrentMode] = useState('general'); // 新增：当前创作模式
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false); // 新增：模式下拉菜单状态
  const [showPromptManager, setShowPromptManager] = useState(false); // 新增：提示词管理模态框状态

  const { invoke, getDeepSeekChatHistory, deleteDeepSeekChatHistory, clearDeepSeekConversation, getStoreValue, setStoreValue, listAllModels, send, on, removeListener } = useIpcRenderer();
  // 将 loadSettings 定义为 useCallback，确保其稳定性
  const loadSettings = useCallback(async () => {
    try {
      // 加载 DeepSeek API Key
      const storedDeepseekApiKey = await getStoreValue('deepseekApiKey');
      if (storedDeepseekApiKey) {
        dispatch(setDeepseekApiKey(storedDeepseekApiKey));
        console.log(`加载到的 DeepSeek API Key: ${storedDeepseekApiKey}`);
      }

      // 加载 OpenAI API Key
      const storedOpenaiApiKey = await getStoreValue('openaiApiKey');
      if (storedOpenaiApiKey) {
        dispatch(setOpenaiApiKey(storedOpenaiApiKey));
        console.log(`加载到的 OpenAI API Key: ${storedOpenaiApiKey}`);
      }
      // 加载 OpenRouter API Key
      const storedOpenrouterApiKey = await getStoreValue('openrouterApiKey');
      if (storedOpenrouterApiKey) {
        dispatch(setOpenrouterApiKey(storedOpenrouterApiKey));
        console.log(`加载到的 OpenRouter API Key: ${storedOpenrouterApiKey}`);
      }
      const storedModel = await getStoreValue('defaultAiModel');
      if (storedModel) {
        dispatch(setSelectedModel(storedModel));
        console.log(`加载到的模型: ${storedModel}`);
      } else {
        dispatch(setSelectedModel('deepseek-chat')); // 默认模型
        console.log('未加载到模型，使用默认模型: deepseek-chat');
      }

      // 加载当前模式设置
      const storedCurrentMode = await getStoreValue('currentMode');
      if (storedCurrentMode) {
        setCurrentMode(storedCurrentMode);
        console.log(`加载到的当前模式: ${storedCurrentMode}`);
      } else {
        setCurrentMode('general'); // 默认模式
        console.log('未加载到当前模式，使用默认模式: general');
      }

      // 加载每个模式的自定义提示词
      const storedCustomPrompts = await getStoreValue('customPrompts');
      console.log('从存储加载的 customPrompts:', storedCustomPrompts);
      if (storedCustomPrompts) {
        // 更新Redux state中的每个模式提示词
        Object.entries(storedCustomPrompts).forEach(([mode, prompt]) => {
          dispatch(setCustomPromptForMode({ mode, prompt }));
        });
        console.log('加载到的模式自定义提示词:', storedCustomPrompts);
      } else {
        console.log('未加载到自定义提示词，使用初始状态。');
      }

      // 获取并设置可用模型列表
      console.log('loadSettings: 开始调用 listAllModels...');
      const modelsResult = await listAllModels();
      console.log('loadSettings: listAllModels 调用完成，结果:', modelsResult.success, modelsResult.models ? modelsResult.models.length : 'N/A');
      if (modelsResult.success) {
          dispatch(setAvailableModels(modelsResult.models));
          console.log('loadSettings: availableModels 已 dispatch，Redux 状态更新。');
          console.log('可用模型列表已加载:', modelsResult.models.map(m => m.id));

          // 确保 selectedProvider 与当前选中的模型匹配
          const currentSelectedModel = storedModel || 'deepseek-chat';
          const matchedModel = modelsResult.models.find(m => m.id === currentSelectedModel);
          if (matchedModel) {
              setSelectedProvider(matchedModel.provider);
              console.log(`loadSettings: 根据选中模型 '${currentSelectedModel}'，设置 selectedProvider 为 '${matchedModel.provider}'`);
          } else {
              // 如果当前选中模型不在可用列表中，则重置为默认提供商
              setSelectedProvider('deepseek');
              console.warn(`loadSettings: 选中模型 '${currentSelectedModel}' 不在可用模型列表中，重置 selectedProvider 为 'deepseek'`);
          }
      } else {
          console.error('loadSettings: 获取可用模型列表失败:', modelsResult.error);
      }

      // 加载流式传输设置并同步到后端
      const storedEnableStream = await getStoreValue('enableStream');
      const streamEnabled = storedEnableStream !== false; // 默认为 true
      dispatch(setEnableStream(streamEnabled));
      send('set-streaming-mode', { stream: streamEnabled }); // **新增**: 将设置同步到后端
      console.log(`加载到的流式传输设置: ${streamEnabled}，并已同步到后端。`);

      console.log('loadSettings: 结束加载设置。');

    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }, [dispatch, getStoreValue, setDeepseekApiKey, setOpenaiApiKey, setOpenrouterApiKey, setSelectedModel, listAllModels, setAvailableModels, setSelectedProvider, setCustomSystemPrompt]); // 更新依赖

  const handleUserQuestionResponse = useCallback(async (response, toolCallId, isButtonClick) => {
    dispatch(setQuestionCard(null));

    const formattedResponse = isButtonClick
      ? `同意/批准此建议：${response}`
      : `用户暂时没有采纳这些建议，而是给出了其他回复：${response}`;
    
    // 将用户的原始回复（未格式化）添加到聊天记录中
    dispatch(appendMessage({ sender: 'User', text: response, role: 'user', content: response, className: 'user', sessionId: toolCallId }));

    if (enableStream) {
      dispatch(appendMessage({
        sender: 'AI',
        text: '',
        role: 'assistant',
        content: '',
        className: 'ai',
        sessionId: toolCallId, // Use the same session ID for the loading response
        isLoading: true,
      }));
    }
    
    try {
      await invoke('user-question-response', { response: formattedResponse, toolCallId });
    } catch (error) {
      console.error('Error sending user question response:', error);
    }
  }, [dispatch, invoke, enableStream]);

  const handleSendMessage = useCallback(async (messageText) => {
    if (!messageText.trim()) return;

    // **新逻辑**: 检查是否存在一个待回答的问题
    if (questionCard && questionCard.toolCallId) {
      // 如果有，则此消息是对该问题的回答
      handleUserQuestionResponse(messageText, questionCard.toolCallId, false);
      return; // 结束函数，不执行常规消息发送
    }

    // --- 以下是常规消息发送逻辑 ---
    const currentSessionId = currentSessionIdRef.current || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    currentSessionIdRef.current = currentSessionId;

    const newUserMessage = {
      sender: 'User',
      text: messageText,
      role: 'user',
      content: messageText,
      className: 'user',
      sessionId: currentSessionId,
    };
    dispatch(appendMessage(newUserMessage));

    if (enableStream) {
      dispatch(appendMessage({
        sender: 'AI',
        text: '',
        role: 'assistant',
        content: '',
        className: 'ai',
        sessionId: currentSessionId,
        isLoading: true,
      }));
    }

    dispatch(setQuestionCard(null));

    try {
      // 直接从存储获取当前模式的自定义提示词，避免Redux状态同步延迟问题
      const storedCustomPrompts = await getStoreValue('customPrompts');
      const customPrompt = storedCustomPrompts ? storedCustomPrompts[currentMode] : '';
      const hasCustomPrompt = customPrompt !== null && customPrompt !== undefined && customPrompt !== '';
      console.log(`[ChatPanel] 发送消息，模式: ${currentMode}, 自定义提示词: ${hasCustomPrompt ? '有' : '无'}`);
      console.log(`[ChatPanel] 自定义提示词详情: 类型=${typeof customPrompt}, 值="${customPrompt}"`);
      console.log(`[ChatPanel] 从存储读取的完整提示词:`, storedCustomPrompts);
      await invoke('process-command', {
        message: messageText,
        sessionId: currentSessionId,
        currentMessages: messages,
        mode: currentMode,
        customPrompt: customPrompt // 添加自定义提示词参数
      });
    } catch (error) {
      console.error('Error sending message to AI:', error);
      dispatch(appendMessage({ sender: 'System', text: `发送消息失败: ${error.message}`, role: 'system', content: `发送消息失败: ${error.message}`, className: 'system-error' }));
    }
  }, [dispatch, invoke, messages, questionCard, handleUserQuestionResponse, enableStream, currentMode]);

  // New handler for approving/rejecting all pending tool calls
  const handleToolApproval = useCallback(async (action) => {
    if (toolCallState !== 'pending_user_action' || !pendingToolCalls || pendingToolCalls.length === 0) {
      return;
    }

    const isFileModification = pendingToolCalls.some(call => call.tool_name === 'write_to_file' || call.tool_name === 'apply_diff');

    // Dispatch action to update state immediately
    if (action === 'approve') {
      // 移除对 acceptSuggestion 的前端调用。UI 更新将由后端的 'file-content-updated' 事件驱动。
      dispatch(approveToolCalls());
    } else {
      dispatch(rejectToolCalls());
      if (isFileModification && activeTabId) {
        dispatch(rejectSuggestion(activeTabId));
      }
    }

    // Send IPC message to the backend
    try {
      // The backend now expects 'approve' or 'reject' for the entire batch
      await invoke('process-tool-action', {
        actionType: action,
        toolCalls: pendingToolCalls,
      });
    } catch (error) {
      console.error('Error processing tool action:', error);
      // Optionally dispatch an error message to the UI
      dispatch(appendMessage({ sender: 'System', text: `工具操作失败: ${error.message}`, role: 'system', className: 'system-error' }));
    }
  }, [dispatch, invoke, pendingToolCalls, toolCallState, activeTabId]);

  const handleProviderChange = useCallback((event) => {
    const newProvider = event.target.value;
    setSelectedProvider(newProvider);
    // 当提供商改变时，重置 selectedModel 为该提供商的第一个模型（如果存在）
    const firstModelOfNewProvider = availableModels.find(model => model.provider === newProvider);
    if (firstModelOfNewProvider) {
      dispatch(setSelectedModel(firstModelOfNewProvider.id));
    } else {
      dispatch(setSelectedModel('')); // 如果没有找到模型，则清空
    }
  }, [dispatch, availableModels]);

  const handleModelChange = useCallback((event) => {
    const newModel = event.target.value;
    console.log(`用户选择的模型: ${newModel}`);
    dispatch(setSelectedModel(newModel));
  }, [dispatch]);

  const handleSaveSettings = useCallback(async () => { // 将 handleSaveSettings 封装为 useCallback
    try {
      console.log(`准备保存 DeepSeek API Key: ${deepseekApiKey}`);
      await setStoreValue('deepseekApiKey', deepseekApiKey);
      console.log(`准备保存 OpenAI API Key: ${openaiApiKey}`);
      await setStoreValue('openaiApiKey', openaiApiKey); // 保存 OpenAI API Key
      console.log(`准备保存 OpenRouter API Key: ${openrouterApiKey}`);
      await setStoreValue('openrouterApiKey', openrouterApiKey);
      console.log(`准备保存模型: ${selectedModel}`);
      await setStoreValue('defaultAiModel', selectedModel);
      console.log(`准备保存自定义系统提示词: ${customSystemPrompt.substring(0, 50)}...`);
      await setStoreValue('customSystemPrompt', customSystemPrompt); // 保存自定义提示词
      console.log(`准备保存当前模式: ${currentMode}`);
      await setStoreValue('currentMode', currentMode); // 保存当前模式
      await setStoreValue('enableStream', enableStream); // 保存流式传输设置
      send('set-streaming-mode', { stream: enableStream }); // **新增**: 保存时也同步到后端
      dispatch(setShowSettingsModal(false));
      console.log('设置已保存！');
    } catch (error) {
      console.error('保存设置失败:', error);
    }
 }, [deepseekApiKey, openaiApiKey, openrouterApiKey, selectedModel, customSystemPrompt, enableStream, setStoreValue, dispatch]); // 依赖中添加 enableStream

 const handleCancelSettings = useCallback(() => { // 简化 handleCancelSettings
    dispatch(setShowSettingsModal(false));
    loadSettings(); // 重新加载以恢复未保存的更改
  }, [dispatch, loadSettings]); // 依赖中添加 dispatch, loadSettings



  const handleResetChat = useCallback(async () => { // 将 handleResetChat 封装为 useCallback
    dispatch(setMessages([])); // 清除聊天消息
    // dispatch(clearToolSuggestions()); // This is now handled by the new tool call flow
    dispatch(setQuestionCard(null)); // 清除提问卡片
    currentSessionIdRef.current = null; // 重置 sessionId

      try {
        await clearDeepSeekConversation(); // 清除后端 DeepSeek 历史
      } catch (error) {
        console.error('Error clearing DeepSeek conversation:', error);
      }
   }, [dispatch, clearDeepSeekConversation]);

  const loadDeepSeekChatHistory = useCallback(async () => { // 将 loadDeepSeekChatHistory 封装为 useCallback
    try {
      const history = await getDeepSeekChatHistory();
      dispatch(setDeepSeekHistory(history));
    } catch (error) {
      console.error('Error loading DeepSeek chat history:', error);
    }
  }, [dispatch, getDeepSeekChatHistory]); // 依赖中添加 dispatch, getDeepSeekChatHistory

  const handleSelectConversation = useCallback(async (sessionId) => { // 调整参数为 sessionId，并封装为 useCallback
    try {
      const conversation = deepSeekHistory.find(conv => conv.sessionId === sessionId);
      if (conversation) {
        // **关键修改**: 使用 restoreMessages 来重构历史会话的UI状态
        dispatch(restoreMessages(conversation.messages));
        currentSessionIdRef.current = sessionId;
        dispatch(setIsHistoryPanelVisible(false));
      }
    } catch (error) {
      console.error('Error selecting conversation:', error);
    }
  }, [dispatch, deepSeekHistory]);

  const handleDeleteConversation = useCallback(async (sessionId) => { // 将 handleDeleteConversation 封装为 useCallback
    setConfirmationMessage('确定要删除此对话吗？');
    setOnConfirmCallback(() => async () => {
      setShowConfirmationModal(false); // 关闭确认弹窗
      try {
        await deleteDeepSeekChatHistory(sessionId);
        loadDeepSeekChatHistory();
      } catch (error) {
        console.error('Error deleting conversation:', error);
      }
    });
    setOnCancelCallback(() => () => {
      setShowConfirmationModal(false); // 关闭确认弹窗
    });
    setShowConfirmationModal(true); // 显示确认弹窗
  }, [deleteDeepSeekChatHistory, loadDeepSeekChatHistory]);

  // 应用启动时加载一次设置
  useEffect(() => {
    loadSettings();
  }, [loadSettings]); // loadSettings 已经是 useCallback，依赖稳定

  // 新增：处理 show-diff-preview 事件的专用 effect
  useEffect(() => {
    const handleShowDiffPreview = (event, data) => {
        console.log('[ChatPanel] 收到 show-diff-preview 事件:', data);
        const { filePath, suggestedContent } = data;

        // 确保收到的数据有效
        if (!filePath || typeof suggestedContent !== 'string') {
            console.warn('[ChatPanel] show-diff-preview 事件缺少必要数据。');
            return;
        }

        // 兼容性修复：在匹配前，将两边的路径都统一为不带 'novel/' 前缀的干净格式
        const cleanIncomingPath = filePath.startsWith('novel/') ? filePath.substring(6) : filePath;
        
        const targetTab = openTabs.find(tab => {
            const cleanTabId = tab.id.startsWith('novel/') ? tab.id.substring(6) : tab.id;
            return cleanTabId === cleanIncomingPath;
        });

        if (targetTab) {
            console.log(`[ChatPanel] 兼容性匹配成功！找到标签页 (ID: ${targetTab.id})，准备触发 diff。`);
            dispatch(startDiff({ tabId: targetTab.id, suggestion: suggestedContent }));
        } else {
            console.warn(`[ChatPanel] 兼容性匹配失败：未找到与路径 '${filePath}' (clean: '${cleanIncomingPath}') 匹配的活动标签页。`);
        }
    };

    on('show-diff-preview', handleShowDiffPreview);

    // 在组件卸载时清理监听器
    return () => {
        removeListener('show-diff-preview', handleShowDiffPreview);
    };
  }, [on, removeListener, dispatch, openTabs]); // 依赖项包括 on, removeListener, dispatch 和 openTabs

  useEffect(() => {
    if (isHistoryPanelVisible) {
      loadDeepSeekChatHistory();
    }
  }, [isHistoryPanelVisible, loadDeepSeekChatHistory]);
 
   // 旧的、基于 useEffect 的 diff 触发器已被移除，因为它不可靠。
   // 新的逻辑由一个专门的 'show-diff-preview' IPC 事件处理器直接触发。

  // 新增 useEffect：在设置模态框显示时加载设置
  useEffect(() => {
    if (showSettingsModal) {
      loadSettings();
    }
  }, [showSettingsModal, loadSettings]);

  // 自动滚动聊天区到底部 (此 useEffect 保留)
  useEffect(() => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  }, [messages, questionCard, isHistoryPanelVisible]);

  return (
    <React.Fragment>
      <div className="chat-panel-content">
        <div className="chat-header-actions">
          {/* 新增的设置按钮，移到最左边 */}
          <button className="settings-button" onClick={() => dispatch(setShowSettingsModal(true))} title="设置">
            <FontAwesomeIcon icon={faGear} />
          </button>
          <button className="history-button" onClick={() => {
            dispatch(setIsHistoryPanelVisible(!isHistoryPanelVisible));
            dispatch(setIsDeleteMode(false));
          }} title="查看历史记录">
            <FontAwesomeIcon icon={faClock} />
          </button>
          <button className="clear-history-button" onClick={() => {
            dispatch(setIsHistoryPanelVisible(true));
            dispatch(setIsDeleteMode(true));
          }} title="清理历史记录">
            <FontAwesomeIcon icon={faTrashCan} />
          </button>
        </div>

        <button className="reset-chat-button" onClick={handleResetChat}>×</button>
        <div id="chatDisplay" ref={chatDisplayRef}>
          {messages.map((msg, index) => (
            <div key={msg.id || index} className={`message ${msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'ai' : msg.role} ${msg.className || ''}`}>
              {msg.role === 'system' && msg.checkpointId ? ( // 这是一个可回溯的存档点消息
                <div className="checkpoint-message">
                  <button
                    className="checkpoint-restore-button"
                    onClick={() => {
                      setConfirmationMessage('是否回档，后续内容将会清空！');
                      setOnConfirmCallback(() => async () => {
                        const taskId = msg.sessionId || currentSessionIdRef.current || 'default-task';
                        console.log(`Restoring checkpoint ${msg.checkpointId} for task ${taskId}...`);
                        const result = await restoreNovelArchive(taskId, msg.checkpointId);
                        if (result.success) {
                          // **关键修复**: 调用新的 restoreMessages action 来重构历史状态
                          if (result.messages) {
                            dispatch(restoreMessages(result.messages));
                          }
                          setNotification({ show: true, message: '回档成功！聊天记录已恢复。' });
                        } else {
                          setNotification({ show: true, message: `恢复失败: ${result.error || '未知错误'}` });
                        }
                        setShowConfirmationModal(false);
                      });
                      setOnCancelCallback(() => () => setShowConfirmationModal(false));
                      setShowConfirmationModal(true);
                    }}
                  >
                    <FontAwesomeIcon icon={faClock} />
                  </button>
                  <span className="checkpoint-id-display">ID: {msg.checkpointId.substring(0, 7)}</span>
                </div>
              ) : msg.role === 'system' ? ( // 普通系统消息
                <>
                  <div className="message-header">系统: {msg.name ? `${msg.name}` : ''}</div>
                  <div className="message-content">
                      {msg.text || msg.content}
                  </div>
                </>
              ) : msg.role === 'assistant' ? ( // AI 消息
                <>
                  <div className="message-header">AI:</div>
                  {msg.reasoning_content && (
                    <details className="reasoning-details">
                      <summary className="reasoning-summary">思考过程 (点击展开)</summary>
                      <pre className="reasoning-content">{msg.reasoning_content}</pre>
                    </details>
                  )}

                  {/* 工具调用现在置顶在消息内容之上 */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <details className="tool-call-details">
                      <summary className="tool-call-summary">
                        {msg.isLoading ? <FontAwesomeIcon icon={faSpinner} spin className="ai-typing-spinner" /> : null}
                        请求调用工具
                      </summary>
                      <div className="tool-calls-container">
                        {msg.toolCalls.map((toolCall, i) => (
                          <ToolCallCard key={toolCall.id || i} toolCall={toolCall} />
                        ))}
                      </div>
                    </details>
                  )}

                  <div className="message-content">
                      {/* 如果没有工具调用，则在文本流式传输时显示加载图标 */}
                      {msg.isLoading && (!msg.toolCalls || msg.toolCalls.length === 0) && <FontAwesomeIcon icon={faSpinner} spin className="ai-typing-spinner" />}
                      <span>{msg.content || msg.text}</span>
                  </div>
                  
                  <div className="message-actions">
                    <button title="复制" onClick={() => {
                      navigator.clipboard.writeText(msg.content);
                      setNotification({ show: true, message: '复制成功' });
                    }}><FontAwesomeIcon icon={faCopy} /></button>
                    {/* <button title="重新生成" onClick={() => invoke('regenerate-response', { messageId: msg.id })}><FontAwesomeIcon icon={faRedo} /></button> */}
                    <button title="删除" onClick={() => {
                      setConfirmationMessage('确定删除吗，这将会导致后续所有内容丢失！');
                      setOnConfirmCallback(() => () => {
                        dispatch(deleteMessage({ messageId: msg.id }));
                        setShowConfirmationModal(false);
                      });
                      setOnCancelCallback(() => () => setShowConfirmationModal(false));
                      setShowConfirmationModal(true);
                    }}><FontAwesomeIcon icon={faTrashCan} /></button>
                  </div>
                </>
              ) : msg.role === 'system' ? ( // 系统消息 (包括错误、警告等)
               <>
                 <div className="message-header">系统:</div>
                 <div className="message-content">
                   {msg.content || msg.text || '[消息内容缺失]'}
                 </div>
               </>
              ) : ( // 用户消息 (msg.role === 'user')
                <>
                  <div className="message-header">用户:</div>
                  <div className="message-content">
                    {/* {editingMessageId === msg.id ? (
                      <div>
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              dispatch(submitEdit({ messageId: msg.id, newContent: editingText }));
                              invoke('edit-message', { messageId: msg.id, newContent: editingText });
                            } else if (e.key === 'Escape') {
                              dispatch(startEditing({ messageId: null }));
                            }
                          }}
                          rows={3}
                        />
                        <button onClick={() => {
                          dispatch(submitEdit({ messageId: msg.id, newContent: editingText }));
                          invoke('edit-message', { messageId: msg.id, newContent: editingText });
                        }}>保存</button>
                        <button onClick={() => dispatch(startEditing({ messageId: null }))}>取消</button>
                      </div>
                    ) : ( */}
                      {msg.content || msg.text || '[消息内容缺失]'}
                    {/* )} */}
                  </div>
                  <div className="message-actions">
                    <button title="复制" onClick={() => {
                        navigator.clipboard.writeText(msg.content);
                        setNotification({ show: true, message: '复制成功' });
                    }}><FontAwesomeIcon icon={faCopy} /></button>
                    {/* <button title="编辑" onClick={() => {
                      dispatch(startEditing({ messageId: msg.id }));
                      setEditingText(msg.content);
                    }}><FontAwesomeIcon icon={faPencil} /></button> */}
                    <button title="删除" onClick={() => {
                      setConfirmationMessage('确定删除吗，这将会导致后续所有内容丢失！');
                      setOnConfirmCallback(() => () => {
                        dispatch(deleteMessage({ messageId: msg.id }));
                        setShowConfirmationModal(false);
                      });
                      setOnCancelCallback(() => () => setShowConfirmationModal(false));
                      setShowConfirmationModal(true);
                    }}><FontAwesomeIcon icon={faTrashCan} /></button>
                  </div>
                </>
              )}
              {/* The tool call content is now directly streamed into the message content, so this placeholder is no longer needed. */}
            </div>
          ))}
        </div>

        {isHistoryPanelVisible && (
          <ChatHistoryPanel
            history={deepSeekHistory}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={handleDeleteConversation}
            isDeleteMode={isDeleteMode}
          />
        )}

        {/* New Tool Action Bar, displayed above the input group */}
        {toolCallState === 'pending_user_action' && (
            <div className="tool-action-bar">
                <span>AI 请求执行工具，请确认：</span>
                <div className="tool-action-buttons">
                    <button
                        className="approve-all-button"
                        onClick={() => handleToolApproval('approve')}
                        disabled={toolCallState !== 'pending_user_action'}
                    >
                        批准
                    </button>
                    <button
                        className="reject-all-button"
                        onClick={() => handleToolApproval('reject')}
                        disabled={toolCallState !== 'pending_user_action'}
                    >
                        取消
                    </button>
                </div>
            </div>
        )}

        {questionCard && (
          <div className="ai-question-card">
            <p className="ai-question-text">{questionCard.question}</p>
            <div className="ai-question-options">
              {questionCard.options && questionCard.options.length > 0 && (
                questionCard.options.map((option, index) => (
                  <button
                    key={index}
                    className="ai-question-option-button"
                    onClick={() => handleUserQuestionResponse(option, questionCard.toolCallId, true)}
                  >
                    {option}
                  </button>
                ))
              )}
            </div>
            {/* 输入区域已被移除，用户应使用主输入框进行回复 */}
          </div>
        )}
        <div className="chat-input-group">
          <div className="mode-selector-dropdown">
            <button
              className="mode-dropdown-toggle"
              onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
            >
              {getModeDisplayName(currentMode)}模式 ▲
            </button>
            
            {isModeDropdownOpen && (
              <div className="mode-dropdown-menu">
                <button
                  className={currentMode === 'general' ? 'active' : ''}
                  onClick={() => { console.log('切换到通用模式'); setCurrentMode('general'); setStoreValue('currentMode', 'general'); setIsModeDropdownOpen(false); }}
                >通用</button>
                <button
                  className={currentMode === 'outline' ? 'active' : ''}
                  onClick={() => { console.log('切换到细纲模式'); setCurrentMode('outline'); setStoreValue('currentMode', 'outline'); setIsModeDropdownOpen(false); }}
                >细纲</button>
                <button
                  className={currentMode === 'writing' ? 'active' : ''}
                  onClick={() => { console.log('切换到写作模式'); setCurrentMode('writing'); setStoreValue('currentMode', 'writing'); setIsModeDropdownOpen(false); }}
                >写作</button>
                <button
                  className={currentMode === 'adjustment' ? 'active' : ''}
                  onClick={() => { console.log('切换到调整模式'); setCurrentMode('adjustment'); setStoreValue('currentMode', 'adjustment'); setIsModeDropdownOpen(false); }}
                >调整</button>
                <div className="dropdown-divider"></div>
                <button
                  className="prompt-manager-button"
                  onClick={() => { setShowPromptManager(true); setIsModeDropdownOpen(false); }}
                >提示词管理</button>
              </div>
            )}
          </div>
          <textarea
            id="chatInput"
            placeholder="输入指令..."
            rows="4"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e.target.value);
                e.target.value = '';
              }
            }}
          ></textarea>
          <button id="sendMessage" className="send-icon" onClick={() => {
            const chatInput = document.getElementById('chatInput');
            handleSendMessage(chatInput.value);
            chatInput.value = '';
          }}><FontAwesomeIcon icon={faPaperPlane} /></button>
        </div>
      </div>

      {/* 设置模态框 */}
      {showSettingsModal && (
        <div className="settings-modal-overlay">
          <div className="settings-modal-content">
           <h2>模型设置</h2>
           <div className="setting-item">
             <label htmlFor="providerSelect">选择提供商:</label>
             <select
               id="providerSelect"
               value={selectedProvider}
               onChange={handleProviderChange}
             >
               {/* 从 availableModels 动态生成提供商列表 */}
               {[...new Set(availableModels.map(model => model.provider))].map(provider => (
                 <option key={provider} value={provider}>
                   {/* 将首字母大写以获得更好的显示效果 */}
                   {provider.charAt(0).toUpperCase() + provider.slice(1)}
                 </option>
               ))}
             </select>
           </div>

           {/* 根据 selectedProvider 显示不同的 API Key 输入框 */}
           {selectedProvider === 'deepseek' && (
             <div className="setting-item">
               <label htmlFor="deepseekApiKey">DeepSeek API Key:</label>
               <input
                 type="text"
                 id="deepseekApiKey"
                 value={deepseekApiKey}
                 onChange={(e) => dispatch(setDeepseekApiKey(e.target.value))}
                 placeholder="请输入您的 DeepSeek API Key"
               />
             </div>
           )}
           {selectedProvider === 'openai' && (
             <div className="setting-item">
               <label htmlFor="openaiApiKey">OpenAI API Key:</label>
               <input
                 type="text"
                 id="openaiApiKey"
                 value={openaiApiKey}
                 onChange={(e) => dispatch(setOpenaiApiKey(e.target.value))}
                 placeholder="请输入您的 OpenAI API Key"
               />
             </div>
           )}
           {selectedProvider === 'openrouter' && (
             <div className="setting-item">
               <label htmlFor="openrouterApiKey">OpenRouter API Key:</label>
               <input
                 type="text"
                 id="openrouterApiKey"
                 value={openrouterApiKey}
                 onChange={(e) => dispatch(setOpenrouterApiKey(e.target.value))}
                 placeholder="请输入您的 OpenRouter API Key"
               />
             </div>
           )}

           <div className="setting-item">
             <label htmlFor="modelSelect">选择模型:</label>
             <select
               id="modelSelect"
               value={selectedModel}
               onChange={handleModelChange}
             >
               {availableModels
                 .filter(model => model.provider === selectedProvider) // 根据提供商过滤模型
                 .map((model) => (
                   <option key={model.id} value={model.id}>
                     {model.id}
                   </option>
                 ))}
             </select>
           </div>

           {/* 自定义系统提示词部分已移至专门的提示词管理模态框 */}

           {/*
            // 流式传输开关
           <div className="setting-item">
             <label htmlFor="streamToggle">启用流式传输:</label>
             <label className="switch">
               <input
                 type="checkbox"
                 id="streamToggle"
                 checked={enableStream}
                 onChange={(e) => dispatch(setEnableStream(e.target.checked))}
               />
               <span className="slider round"></span>
             </label>
           </div>
           */}

           <div className="modal-actions">
             <button onClick={handleSaveSettings} className="save-button">保存</button>
             <button onClick={handleCancelSettings} className="cancel-button">取消</button>
           </div>
           
           {/* 新增：自定义提供商设置组件 */}
           <CustomProviderSettings />

         </div>
       </div>
     )}

      {showConfirmationModal && (
        <ConfirmationModal
          message={confirmationMessage}
          onConfirm={onConfirmCallback}
          onCancel={onCancelCallback}
        />
      )}

      {notification.show && (
        <NotificationModal
          message={notification.message}
          onClose={() => setNotification({ show: false, message: '' })}
        />
      )}

      {/* 提示词管理模态框 */}
      {showPromptManager && (
        <PromptManagerModal
          isOpen={showPromptManager}
          onClose={() => setShowPromptManager(false)}
        />
      )}
    </React.Fragment>
  );
});

// 辅助函数：获取模式显示名称
const getModeDisplayName = (mode) => {
  const names = {
    general: '通用',
    outline: '细纲',
    writing: '写作',
    adjustment: '调整'
  };
  return names[mode] || mode;
};

export default ChatPanel;