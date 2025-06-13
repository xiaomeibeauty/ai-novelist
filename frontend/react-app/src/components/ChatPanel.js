import React, { useEffect, useRef, useCallback, memo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  appendMessage,
  setQuestionCard,
  setMessages,
  setIsHistoryPanelVisible,
  setIsDeleteMode,
  setDeepSeekHistory,
  setToolSuggestions,
  setToolStatus,
  clearToolSuggestions,
  setSelectedModel,
  setShowSettingsModal,
  setDeepseekApiKey,
  setAvailableModels,
  setCustomSystemPrompt, // 新增
  resetCustomSystemPrompt, // 新增
} from '../store/slices/chatSlice';
import { DEFAULT_SYSTEM_PROMPT } from '../store/slices/chatSlice'; // 导入默认系统提示词
import useIpcRenderer from '../hooks/useIpcRenderer';
import ChatHistoryPanel from './ChatHistoryPanel';
import NotificationModal from './NotificationModal';
import ConfirmationModal from './ConfirmationModal';
import './ChatPanel.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faTrashCan, faPaperPlane, faGear } from '@fortawesome/free-solid-svg-icons';

const ChatPanel = memo(() => {
  const dispatch = useDispatch();
  const messages = useSelector((state) => state.chat.messages);
  const toolSuggestions = useSelector((state) => state.chat.toolSuggestions);
  const questionCard = useSelector((state) => state.chat.questionCard);
  const isHistoryPanelVisible = useSelector((state) => state.chat.isHistoryPanelVisible);
  const isDeleteMode = useSelector((state) => state.chat.isDeleteMode);
  const deepSeekChatHistory = useSelector((state) => state.chat.deepSeekHistory);
  const showSettingsModal = useSelector((state) => state.chat.showSettingsModal);
  const deepseekApiKey = useSelector((state) => state.chat.deepseekApiKey);
  const selectedModel = useSelector((state) => state.chat.selectedModel);
  const availableModels = useSelector((state) => state.chat.availableModels);
  const customSystemPrompt = useSelector((state) => state.chat.customSystemPrompt); // 新增

  const chatDisplayRef = useRef(null);
  const currentSessionIdRef = useRef(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [onConfirmCallback, setOnConfirmCallback] = useState(null);
  const [onCancelCallback, setOnCancelCallback] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState('deepseek'); // 新增状态，默认选择 DeepSeek

  const { invoke, getDeepSeekChatHistory, deleteDeepSeekChatHistory, clearDeepSeekConversation, getStoreValue, setStoreValue, listAllModels } = useIpcRenderer();
  // 将 loadSettings 定义为 useCallback，确保其稳定性
  const loadSettings = useCallback(async () => {
    try {
      const storedApiKey = await getStoreValue('deepseekApiKey');
      if (storedApiKey) {
        dispatch(setDeepseekApiKey(storedApiKey));
        console.log(`加载到的 API Key: ${storedApiKey}`);
      }
      const storedModel = await getStoreValue('defaultAiModel');
      if (storedModel) {
        dispatch(setSelectedModel(storedModel));
        // 根据模型 ID 判断提供商
        if (storedModel.startsWith('deepseek')) {
          setSelectedProvider('deepseek');
        } else {
          setSelectedProvider('ollama');
        }
        console.log(`加载到的模型: ${storedModel}`);
      } else {
        dispatch(setSelectedModel('deepseek-chat')); // 默认模型
        setSelectedProvider('deepseek'); // 默认提供商
        console.log('未加载到模型，使用默认模型: deepseek-chat');
      }

      // 加载自定义系统提示词
      const storedCustomPrompt = await getStoreValue('customSystemPrompt');
      if (storedCustomPrompt) {
        dispatch(setCustomSystemPrompt(storedCustomPrompt));
        console.log(`加载到的自定义系统提示词: ${storedCustomPrompt.substring(0, 50)}...`);
      } else {
        dispatch(setCustomSystemPrompt(DEFAULT_SYSTEM_PROMPT)); // 使用默认提示词
        console.log('未加载到自定义系统提示词，使用默认。');
      }

      // 获取并设置可用模型列表
      const modelsResult = await listAllModels();
      if (modelsResult.success) {
          dispatch(setAvailableModels(modelsResult.models));
          console.log('可用模型列表已加载:', modelsResult.models.map(m => m.id));
      } else {
          console.error('获取可用模型列表失败:', modelsResult.error);
      }

    } catch (error) {
      console.error('加载设置失败:', error);
    }
 }, [dispatch, getStoreValue, setDeepseekApiKey, setSelectedModel, listAllModels, setAvailableModels, setSelectedProvider, setCustomSystemPrompt]); // 更新依赖，添加 setCustomSystemPrompt

  const handleSendMessage = useCallback(async (messageText) => { // 将 command 改名为 messageText
    if (!messageText.trim()) return;

    // 1. 获取当前会话的 sessionId
    const currentSessionId = currentSessionIdRef.current || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    currentSessionIdRef.current = currentSessionId; // 确保 currentSessionIdRef 更新

    // 2. 创建新的用户消息，并赋予 sessionId
    const newUserMessage = {
      sender: 'User',
      text: messageText,
      role: 'user',
      content: messageText,
      className: 'user',
      sessionId: currentSessionId,
    };
    dispatch(appendMessage(newUserMessage)); // 追加用户消息

    dispatch(clearToolSuggestions()); // 清除工具建议
    dispatch(setQuestionCard(null)); // 清除提问卡片

    try {
      // 3. 将包含新消息和历史消息的完整数组作为上下文传递给后端
      // 这里的 messages 已经是 Redux state，不需要再手动构建 messagesToSend
      await invoke('process-command', { message: messageText, sessionId: currentSessionId, currentMessages: messages }); // 调整为 invoke 的 payload 格式
    } catch (error) {
      console.error('Error sending message to AI:', error);
      dispatch(appendMessage({ sender: 'System', text: `发送消息失败: ${error.message}`, role: 'system', content: `发送消息失败: ${error.message}`, className: 'system-error' }));
    }
  }, [dispatch, invoke, messages]); // 依赖中添加 dispatch, invoke, messages

  const handleToolAction = useCallback(async (toolCallId, actionType) => { // 调整参数名为 actionType
    dispatch(setToolStatus({ toolCallId, status: 'pending', message: actionType === 'approve' ? '正在执行...' : '已拒绝' })); // 更新工具状态
    try {
      await invoke('process-tool-action', { toolCallId, actionType }); // 调整为 invoke 的 payload 格式
      dispatch(setToolStatus({ toolCallId, status: actionType === 'approve' ? 'executed' : 'rejected', message: actionType === 'approve' ? '执行完毕' : '已拒绝' }));
    } catch (error) {
      console.error('Error executing tool action:', error);
      dispatch(setToolStatus({ toolCallId, status: 'failed', message: `执行失败: ${error.message}` }));
    }
  }, [dispatch, invoke]); // 依赖中添加 dispatch, invoke

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
      console.log(`准备保存 API Key: ${deepseekApiKey}`);
      await setStoreValue('deepseekApiKey', deepseekApiKey);
      console.log(`准备保存模型: ${selectedModel}`);
      await setStoreValue('defaultAiModel', selectedModel);
      console.log(`准备保存自定义系统提示词: ${customSystemPrompt.substring(0, 50)}...`);
      await setStoreValue('customSystemPrompt', customSystemPrompt); // 保存自定义提示词
      dispatch(setShowSettingsModal(false));
      console.log('设置已保存！');
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  }, [deepseekApiKey, selectedModel, customSystemPrompt, setStoreValue, dispatch]); // 依赖中添加 customSystemPrompt

  const handleCancelSettings = useCallback(() => { // 简化 handleCancelSettings
    dispatch(setShowSettingsModal(false));
    loadSettings(); // 重新加载以恢复未保存的更改
  }, [dispatch, loadSettings]); // 依赖中添加 dispatch, loadSettings

  const handleBatchAction = useCallback(async (actionType) => { // 将 handleBatchAction 封装为 useCallback
    // ... 批量操作逻辑保持不变
    if (actionType === 'approve_all') {
      for (const tool of toolSuggestions) {
        if (!tool.statusClass || (tool.statusClass !== 'executed' && tool.statusClass !== 'failed' && tool.statusClass !== 'rejected')) {
          await handleToolAction(tool.toolCallId, 'approve');
        }
      }
    } else if (actionType === 'reject_all') {
      for (const tool of toolSuggestions) {
        if (!tool.statusClass || (tool.statusClass !== 'executed' && tool.statusClass !== 'failed' && tool.statusClass !== 'rejected')) {
          await handleToolAction(tool.toolCallId, 'reject');
        }
      }
    }
  }, [toolSuggestions, handleToolAction]); // 依赖中添加 toolSuggestions, handleToolAction

  const handleUserQuestionResponse = useCallback(async (response, toolCallId) => { // 将 handleUserQuestionResponse 封装为 useCallback
    dispatch(setQuestionCard(null));
    dispatch(appendMessage({ sender: 'user', text: response, role: 'user', content: response, className: 'user', sessionId: toolCallId })); // 添加更多消息属性
    try {
      await invoke('user-question-response', { response, toolCallId }); // 调整为 invoke 的 payload 格式
    } catch (error) {
      console.error('Error sending user question response:', error);
    }
  }, [dispatch, invoke]); // 依赖中添加 dispatch, invoke

  const handleResetChat = useCallback(async () => { // 将 handleResetChat 封装为 useCallback
    dispatch(setMessages([])); // 清除聊天消息
    dispatch(clearToolSuggestions()); // 清除工具建议
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
      const conversation = deepSeekChatHistory.find(conv => conv.sessionId === sessionId);
      if (conversation) {
        dispatch(setMessages(conversation.messages));
        currentSessionIdRef.current = sessionId;
        dispatch(setIsHistoryPanelVisible(false));
      }
    } catch (error) {
      console.error('Error selecting conversation:', error);
    }
  }, [dispatch, deepSeekChatHistory]); // 依赖中添加 dispatch, deepSeekChatHistory

  const handleDeleteConversation = useCallback(async (sessionId) => { // 将 handleDeleteConversation 封装为 useCallback
    setConfirmationMessage('确定要删除此对话吗？');
    setOnConfirmCallback(() => async () => {
      setShowConfirmationModal(false); // 关闭确认弹窗
      try {
        await deleteDeepSeekChatHistory(sessionId);
        loadDeepSeekChatHistory(); // 重新加载历史记录
      } catch (error) {
        console.error('Error deleting conversation:', error);
      }
    });
    setOnCancelCallback(() => () => {
      setShowConfirmationModal(false); // 关闭确认弹窗
    });
    setShowConfirmationModal(true); // 显示确认弹窗
  }, [deleteDeepSeekChatHistory, loadDeepSeekChatHistory]); // 依赖中添加 deleteDeepSeekChatHistory, loadDeepSeekChatHistory

  useEffect(() => {
    if (isHistoryPanelVisible) {
      loadDeepSeekChatHistory();
    }
  }, [isHistoryPanelVisible, loadDeepSeekChatHistory]); // 依赖中添加 loadDeepSeekChatHistory，移除 dispatch

  // 自动滚动聊天区到底部 (此 useEffect 保留)
  useEffect(() => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  }, [messages, toolSuggestions, questionCard, isHistoryPanelVisible]);

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

        <div id="chatDisplay" ref={chatDisplayRef}>
          <button className="reset-chat-button" onClick={handleResetChat}>×</button>
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'ai' : msg.role} ${msg.className || ''}`}>
              {msg.role === 'tool' ? ( // 系统消息或工具消息
                <>
                  <div className="message-header">系统: {msg.name ? `工具 ${msg.name}` : ''}</div>
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
                  <div className="message-content">
                    {msg.content || msg.text || '[消息内容缺失]'}
                  </div>
                </>
              ) : ( // 用户消息 (msg.role === 'user')
                <>
                  <div className="message-header">用户:</div>
                  <div className="message-content">
                    {msg.content || msg.text || '[消息内容缺失]'}
                  </div>
                </>
              )}
              {msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0 && (
                <div className="tool-calls-placeholder">
                  （AI 建议执行工具：{msg.tool_calls.map(tc => tc.function.name).join(', ')}，请查看下方工具建议区域）
                </div>
              )}
            </div>
          ))}
        </div>

        {isHistoryPanelVisible && (
          <ChatHistoryPanel
            history={deepSeekChatHistory}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={handleDeleteConversation}
            isDeleteMode={isDeleteMode}
          />
        )}

        {toolSuggestions.length > 0 && (
          <div id="batch-tool-suggestions-container">
            <p>AI 建议执行以下多项操作：请逐一确认或取消。</p>
            <div className="tool-cards-wrapper">
              {toolSuggestions.map((tool, index) => (
                <div key={tool.toolCallId} id={`tool-suggestion-${tool.toolCallId}`} className={`tool-suggestion ${tool.statusClass || ''}`}>
                  <p>AI: 需要执行 {tool.toolName} 操作。</p>
                  <details className="tool-params-details">
                    <summary className="tool-params-summary">参数详情 <span className="collapse-icon"></span></summary>
                    <pre><code>{JSON.stringify(tool.toolArgs, null, 2)}</code></pre>
                  </details>
                  <div className="tool-actions">
                    <button className="approve-button" onClick={() => handleToolAction(tool.toolCallId, 'approve')} disabled={tool.statusClass && (tool.statusClass === 'executed' || tool.statusClass === 'failed' || tool.statusClass === 'rejected')}>批准执行</button>
                    <button className="reject-button" onClick={() => handleToolAction(tool.toolCallId, 'reject')} disabled={tool.statusClass && (tool.statusClass === 'executed' || tool.statusClass === 'failed' || tool.statusClass === 'rejected')}>拒绝</button>
                  </div>
                  <p className="tool-status-text">状态: {tool.statusMessage || '待处理'}</p>
                </div>
              ))}
            </div>
            <div className="batch-actions">
              <button className="approve-all-button" onClick={() => handleBatchAction('approve_all')}>批量批准</button>
              <button className="reject-all-button" onClick={() => handleBatchAction('reject_all')}>批量拒绝</button>
            </div>
          </div>
        )}

        {questionCard && (
          <div className="ai ask-question">
            <p>AI 提问：{questionCard.question}</p>
            <div className="question-actions">
              {questionCard.options && questionCard.options.length > 0 ? (
                questionCard.options.map((option, index) => (
                  <button key={index} onClick={() => handleUserQuestionResponse(option, questionCard.toolCallId)}>{option}</button>
                ))
              ) : (
                <>
                  <input type="text" placeholder="请输入您的回复..." id="question-input" />
                  <button onClick={() => handleUserQuestionResponse(document.getElementById('question-input').value, questionCard.toolCallId)}>发送回复</button>
                </>
              )}
            </div>
          </div>
        )}
        <div className="chat-input-group">
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
               <option value="deepseek">DeepSeek</option>
               <option value="ollama">Ollama</option>
             </select>
           </div>

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

           {/* 自定义系统提示词 */}
           <div className="setting-item">
             <label htmlFor="customSystemPrompt">自定义系统提示词:</label>
             <textarea
               id="customSystemPrompt"
               value={customSystemPrompt}
               onChange={(e) => dispatch(setCustomSystemPrompt(e.target.value))}
               placeholder="输入自定义系统提示词..."
               rows="6"
               style={{ width: '100%' }}
             ></textarea>
             <button
               onClick={() => {
                 dispatch(resetCustomSystemPrompt());
                 setStoreValue('customSystemPrompt', DEFAULT_SYSTEM_PROMPT); // 同步更新持久化存储
               }}
               className="reset-button"
               style={{ marginTop: '10px' }}
             >
               重置为默认提示词
             </button>
           </div>

           <div className="modal-actions">
             <button onClick={handleSaveSettings} className="save-button">保存</button>
             <button onClick={handleCancelSettings} className="cancel-button">取消</button>
           </div>
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
    </React.Fragment>
  );
});

export default ChatPanel;