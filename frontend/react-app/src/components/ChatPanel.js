import React, { useEffect, useRef, useCallback, memo } from 'react'; // 导入 memo
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
} from '../store/slices/chatSlice';
import useIpcRenderer from '../hooks/useIpcRenderer';
import ChatHistoryPanel from './ChatHistoryPanel';
import './ChatPanel.css';

const ChatPanel = memo(() => { // 移除 props 接收
  const dispatch = useDispatch();
  const messages = useSelector((state) => state.chat.messages);
  const toolSuggestions = useSelector((state) => state.chat.toolSuggestions);
  const questionCard = useSelector((state) => state.chat.questionCard);
  const isHistoryPanelVisible = useSelector((state) => state.chat.isHistoryPanelVisible);
  const isDeleteMode = useSelector((state) => state.chat.isDeleteMode);
  const deepSeekChatHistory = useSelector((state) => state.chat.deepSeekHistory);

  const chatDisplayRef = useRef(null);
  const currentSessionIdRef = useRef(null); // 重新引入 currentSessionIdRef

  const { invoke, getDeepSeekChatHistory, deleteDeepSeekChatHistory, clearDeepSeekConversation } = useIpcRenderer();

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
    // 最佳实践：立即更新 UI，然后再与后端通信
    dispatch(setQuestionCard(null)); // 1. 立即隐藏提问卡片，提供即时反馈
    dispatch(appendMessage({ sender: 'user', text: response })); // 2. 在聊天中显示用户的回复
    await invoke('send-user-response', response, toolCallId); // 3. 将响应发送到后端
  };

  const handleResetChat = async () => {
    dispatch(setMessages([]));
    await clearDeepSeekConversation();
    dispatch(setIsHistoryPanelVisible(false));
    dispatch(setIsDeleteMode(false));
  };

  const loadDeepSeekChatHistory = async () => {
    const history = await getDeepSeekChatHistory();
    dispatch(setDeepSeekHistory(history));
  };

  const handleSelectConversation = (conversation) => {
    const processedMessages = conversation.messages.map(msg => {
        let sender = 'Unknown';
        let text = msg.content || '';
        let className = '';

        if (msg.role === 'user') {
            sender = 'User';
            className = 'user';
            text = msg.content;
        } else if (msg.role === 'assistant') {
            sender = 'AI';
            className = 'ai';
            // 如果 AI 消息没有文本内容，但包含工具调用，则显示提示信息
            if (!msg.content && msg.tool_calls && msg.tool_calls.length > 0) {
                text = '建议执行以下操作...';
            } else {
                text = msg.content || ''; // 否则使用原始内容，或为空字符串
            }
        } else if (msg.role === 'tool') {
            sender = 'System';
            className = 'tool-output';
            // 工具消息的 content 已经是结果，直接显示即可
            try {
                // 尝试解析JSON，如果是有效的JSON则美化输出，否则显示原始内容
                const parsedContent = JSON.parse(msg.content);
                text = `工具 ${msg.name} 执行结果: ${JSON.stringify(parsedContent, null, 2)}`;
            } catch (e) {
                text = `工具 ${msg.name} 执行结果 (原始): ${msg.content}`;
            }
        } else if (msg.role === 'system') {
            // 系统消息通常是给AI的指令，不应在聊天中直接显示给用户
            // 如果需要显示特定的系统消息（如错误、警告），应通过 appendMessage 单独处理
            return null; // 过滤掉系统消息
        }

        return {
            ...msg, // 保留原始消息的所有字段，包括 tool_calls, tool_call_id, name 等
            sender: sender,
            text: text,
            className: className,
            sessionId: conversation.sessionId // 确保会话ID正确
        };
    }).filter(msg => msg !== null); // 过滤掉返回 null 的系统消息

    dispatch(setMessages(processedMessages));
    dispatch(setIsHistoryPanelVisible(false));
    dispatch(setIsDeleteMode(false));
  };

  const handleDeleteConversation = async (sessionId) => {
    const result = await deleteDeepSeekChatHistory(sessionId);
    if (result.success) {
      console.log(result.message);
      loadDeepSeekChatHistory();
    } else {
      console.error(result.message);
    }
  };

  useEffect(() => {
    if (isHistoryPanelVisible) {
      loadDeepSeekChatHistory();
    }
  }, [isHistoryPanelVisible, dispatch]);

  useEffect(() => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  }, [messages, toolSuggestions, questionCard, isHistoryPanelVisible]);

  return (
    <div className="chat-panel-content">
      <div className="chat-header-actions">
        <button className="history-button" onClick={() => {
          dispatch(setIsHistoryPanelVisible(!isHistoryPanelVisible));
          dispatch(setIsDeleteMode(false));
        }}>
          &#x231B;
        </button>
        <button className="clear-history-button" onClick={() => {
          dispatch(setIsHistoryPanelVisible(true));
          dispatch(setIsDeleteMode(true));
        }}>
          清理历史记录
        </button>
      </div>

      <div id="chatDisplay" ref={chatDisplayRef}>
        <button className="reset-chat-button" onClick={handleResetChat}>×</button>
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender} ${msg.className || ''}`}>
            {/* 统一处理所有消息的显示 */}
            {msg.sender === 'System' ? ( // 系统消息，包括工具执行结果
              <>
                <div className="message-header">系统: {msg.name ? `工具 ${msg.name}` : ''}</div>
                <div className="message-content">
                    {msg.text}
                </div>
              </>
            ) : ( // 用户和AI的普通消息
              `${msg.sender ? msg.sender.toUpperCase() : 'UNKNOWN'}: ${msg.text || '[消息内容缺失]'}`
            )}
            {/* 如果是AI消息且包含tool_calls，则提示工具调用，但实际工具卡片由toolSuggestions状态渲染 */}
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
        <input type="text" id="chatInput" placeholder="输入指令..." onKeyPress={(e) => {
          if (e.key === 'Enter') {
            handleSendMessage(e.target.value);
            e.target.value = '';
          }
        }} />
      </div>
      <button id="sendMessage" className="send-icon" onClick={() => {
        const chatInput = document.getElementById('chatInput');
        handleSendMessage(chatInput.value);
        chatInput.value = '';
      }}>&#9992;</button>
    </div>
  );
});

export default ChatPanel;