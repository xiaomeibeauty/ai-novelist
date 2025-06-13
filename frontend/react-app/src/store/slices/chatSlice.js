import { createSlice } from '@reduxjs/toolkit';
import { produce } from 'immer'; // 确保导入

// 定义默认系统提示词
const DEFAULT_SYSTEM_PROMPT = `你是一个**工具使用型AI**，精通使用各种工具来完成用户请求。
 
 **你的核心任务是：**
 1. **准确理解用户意图。**
 2. **根据用户意图，规划需要使用的工具和步骤
 3. **严格按照工具的 JSON Schema 定义，生成有效的 'tool_calls' 对象。**
    - **极其重要：** 你必须将工具调用生成在响应的 **'tool_calls' 字段**中。
    - **绝对禁止：** **切勿**将工具调用的 JSON 结构以文本形式（例如，Markdown 代码块）输出到 'content' 字段中。系统无法解析 'content' 字段中的工具调用。
    - **只有通过 'tool_calls' 字段生成的工具请求，系统才能识别并执行。**
 4. **根据工具执行结果，继续执行任务或进行后续工具调用。**
 5. **当任务完全完成后，你必须使用 'end_task' 工具来结束会话，并提供最终总结。**
 
 **工具使用流程示例：**
 - **分析并首次调用：**
   - (可选) 提供简明扼要的分析或下一步计划的文本（在 'content' 字段）。
   - **紧接着，生成第一个工具的 'tool_calls' 对象。**
 - **工具执行后反馈：**
   - 系统会将工具执行结果（'tool' 角色消息）提供给你。
   - 根据结果（成功或失败），决定是继续下一个工具调用，还是修正并重试当前工具。
   - **确保每一次工具调用都生成在 'tool_calls' 字段。**
 - **任务完成与收尾：**
   - 当你认为所有用户需求已解决，且工具链已执行完毕时，**必须**调用 'end_task' 工具，并提供最终总结信息。
   - **注意：'end_task' 也必须以 'tool_calls' 形式生成。**
 
 **重要交互原则 - 请严格遵循以优化用户体验和效率：**
 1. **单步执行优先：** 除非任务性质要求必须同时进行，否则请尽量一次只建议一个工具操作。例如，如果用户请求创建多章内容，请逐章进行，每次只建议创建一章，等待用户确认和系统反馈后再建议下一章。
 2. **等待反馈：** 在建议并调用工具后，请耐心等待系统返回该工具的执行结果（成功或失败或被用户忽略）。只有收到反馈后，才能基于该反馈决定下一步的行动。
 3. **避免重复建议：** 如果系统反馈某个工具操作被用户忽略或未执行，请不要立即重复建议该操作，除非用户明确要求或任务逻辑需要。在重复之前，可尝试分析原因或询问用户意图。
 4. **简洁明了：** 你的响应应由简要的文本（可选）和精确的 'tool_calls' 构成，避免冗余信息。
 
 **记住：你的响应应该由文本（可选）和精确的 'tool_calls' 构成，而不是描述。**`;

const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    messages: [],
    toolSuggestions: [],
    questionCard: null,
    deepSeekHistory: [],
    deepseekApiKey: '',
    selectedModel: 'deepseek-chat',
    isHistoryPanelVisible: false,
    isDeleteMode: false,
    showSettingsModal: false,
    toolStatus: {}, // 用于工具执行状态
    availableModels: [], // 新增：用于存储所有可用模型列表
    customSystemPrompt: DEFAULT_SYSTEM_PROMPT, // 新增：自定义系统提示词
  },
  reducers: {
    appendMessage: (state, action) => {
      // 此 reducer 通常用于用户消息等直接追加的场景
      // 对于 AI 消息，应该主要通过 ipcAiResponseReceived 处理
      if (action.payload.reasoning_content) {
        state.messages.push({
          ...action.payload,
          reasoning_content: action.payload.reasoning_content
        });
      } else {
        state.messages.push(action.payload);
      }
    },
    setQuestionCard: (state, action) => {
      state.questionCard = action.payload;
    },
    setMessages: (state, action) => {
      state.messages = action.payload;
    },
    setIsHistoryPanelVisible: (state, action) => {
      state.isHistoryPanelVisible = action.payload;
    },
    setIsDeleteMode: (state, action) => {
      state.isDeleteMode = action.payload;
    },
    setDeepSeekHistory: (state, action) => {
      state.deepSeekHistory = action.payload;
    },
    setToolSuggestions: (state, action) => {
      state.toolSuggestions = action.payload;
    },
    setToolStatus: (state, action) => {
        const { toolCallId, status, message } = action.payload;
        state.toolSuggestions = state.toolSuggestions.map(tool =>
            tool.toolCallId === toolCallId ? { ...tool, statusClass: status, statusMessage: message } : tool
        );
    },
    clearToolSuggestions: (state) => {
      state.toolSuggestions = [];
    },
    setSelectedModel: (state, action) => {
      state.selectedModel = action.payload;
    },
    setShowSettingsModal: (state, action) => {
      state.showSettingsModal = action.payload;
    },
    setDeepseekApiKey: (state, action) => {
      state.deepseekApiKey = action.payload;
    },
    setAvailableModels: (state, action) => { // 新增：设置可用模型列表
        state.availableModels = action.payload;
    },
    setCustomSystemPrompt: (state, action) => { // 新增：设置自定义系统提示词
        state.customSystemPrompt = action.payload;
    },
    resetCustomSystemPrompt: (state) => { // 新增：重置自定义系统提示词
        state.customSystemPrompt = DEFAULT_SYSTEM_PROMPT;
    },
    // --- 新增：用于处理来自 IPC 的 AI 响应的通用 Reducer ---
    ipcAiResponseReceived: (state, action) => {
        const { type, payload } = action.payload; // payload 现在包含 type 和具体数据
        const currentMessages = state.messages; // Redux Toolkit 允许直接修改 state，因为它内部使用了 Immer

        switch (type) {
            case 'text':
                let messageUpdated = false;
                for (let i = currentMessages.length - 1; i >= 0; i--) {
                    const msg = currentMessages[i];
                    if (msg.role === 'assistant' && (msg.text === '' || msg.text === '[消息内容缺失]')) {
                        currentMessages[i].text = payload;
                        currentMessages[i].content = payload;
                        messageUpdated = true;
                        break;
                    }
                }
                if (!messageUpdated) {
                    currentMessages.push({
                        sender: 'AI',
                        text: payload,
                        role: 'assistant',
                        content: payload,
                        className: 'ai',
                        sessionId: payload.sessionId, // 假设 payload 中有 sessionId
                    });
                }
                break;
            case 'reasoning_content':
                let foundExistingReasoningMessage = false;
                const lastAiMessageIndex = currentMessages.length - 1;
                if (lastAiMessageIndex >= 0 && currentMessages[lastAiMessageIndex].role === 'assistant' && currentMessages[lastAiMessageIndex].sessionId === payload.sessionId) {
                    currentMessages[lastAiMessageIndex].reasoning_content = payload.content;
                    foundExistingReasoningMessage = true;
                }
                if (!foundExistingReasoningMessage) {
                    currentMessages.push({
                        sender: 'AI',
                        text: '', // 文本内容暂时为空
                        role: 'assistant',
                        content: '',
                        className: 'ai',
                        sessionId: payload.sessionId,
                        reasoning_content: payload.content,
                    });
                }
                break;
            case 'end_task':
                // 更新已存在的 AI 消息骨架（如果由 reasoning_content 创建）
                for (let i = currentMessages.length - 1; i >= 0; i--) {
                    const msg = currentMessages[i];
                    if (msg.role === 'assistant' && (msg.text === '' || msg.text === '[消息内容缺失]') && msg.reasoning_content) {
                        currentMessages[i].text = payload; // end_task 的 payload 作为最终内容
                        currentMessages[i].content = payload;
                        break;
                    }
                }
                // 追加系统消息
                currentMessages.push({
                    sender: 'System',
                    text: `本轮对话结束`,
                    role: 'system',
                    content: `本轮对话结束`,
                    className: 'system-end-task',
                    sessionId: payload.sessionId,
                });
                state.toolSuggestions = []; // 清除工具建议
                break;
            // 迁移 ChatPanel.js 中 handleAiResponse 的其他 case
            case 'tool_suggestions':
                state.toolSuggestions = payload.map(tool => ({
                    ...tool,
                    sessionId: tool.sessionId, // 假设 payload 中的 tool 已经有 sessionId
                }));
                break;
            case 'ask_user_question':
                state.questionCard = payload;
                break;
            case 'error':
                currentMessages.push({ sender: 'System', text: `错误: ${payload}`, role: 'system', content: `错误: ${payload}`, className: 'system-error', sessionId: payload.sessionId });
                state.toolSuggestions = [];
                break;
            case 'warning':
                currentMessages.push({ sender: 'System', text: `警告: ${payload}`, role: 'system', content: `警告: ${payload}`, className: 'system-warning', sessionId: payload.sessionId });
                break;
            case 'tool_action_status':
            case 'tool_execution_status':
                // 统一处理工具状态更新
                currentMessages.push({ sender: 'System', text: `工具 ${payload.toolName} 执行${payload.success ? '成功' : '失败'}：${payload.message}`, className: 'system-message', sessionId: payload.sessionId });
                state.toolSuggestions = state.toolSuggestions.map(tool =>
                    tool.toolCallId === payload.toolCallId ? { ...tool, statusClass: payload.success ? 'executed' : 'failed', statusMessage: payload.message } : tool
                );
                break;
            default:
                console.warn(`[chatSlice] 未知 AI 响应类型: ${type}`);
        }
    },
  },
  // extraReducers 用于处理非本 slice 定义的 action，这里用于监听 ipc/aiResponse
  extraReducers: (builder) => {
    builder
      .addCase('chat/ipcAiResponse', (state, action) => {
        // 将 'chat/ipcAiResponse' action 转发给 ipcAiResponseReceived reducer
        // 注意：这里需要调用 caseReducers，因为 ipcAiResponseReceived 不是直接暴露的 action creator
        chatSlice.caseReducers.ipcAiResponseReceived(state, action);
      });
      // 可以添加其他 ipc/* action 的处理，例如 novel slice 的
  },
});

export const {
  appendMessage,
  setQuestionCard,
  setMessages,
  // 导出所有其他 chatSlice.actions
  // ipcAiResponseReceived 不需要导出，因为它只在 extraReducers 中被调用
  setIsHistoryPanelVisible,
  setIsDeleteMode,
  setDeepSeekHistory,
  setToolSuggestions,
  setToolStatus,
  clearToolSuggestions,
  setSelectedModel,
  setShowSettingsModal,
  setDeepseekApiKey,
  setAvailableModels, // 新增：导出 setAvailableModels
  setCustomSystemPrompt, // 新增：导出 setCustomSystemPrompt
  resetCustomSystemPrompt, // 新增：导出 resetCustomSystemPrompt
} = chatSlice.actions;

export { DEFAULT_SYSTEM_PROMPT }; // 导出默认提示词

export default chatSlice.reducer;