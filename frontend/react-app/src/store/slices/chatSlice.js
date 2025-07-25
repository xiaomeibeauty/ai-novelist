import { createSlice } from '@reduxjs/toolkit';
import { produce } from 'immer'; // 确保导入

// 定义默认系统提示词
const DEFAULT_SYSTEM_PROMPT = `你是一个**工具使用型AI**，精通使用各种工具来完成用户请求。

**你的核心任务是：**
1. **准确理解用户意图。**
2. **根据用户意图，规划需要使用的工具和步骤。**
3. **严格按照工具的 JSON Schema 定义，生成有效的 'tool_calls' 对象。**
   - **极其重要：** 你必须将工具调用生成在响应的 **'tool_calls' 字段**中。
   - **绝对禁止：** **切勿**将工具调用的 JSON 结构以文本形式（例如，Markdown 代码块）输出到 'content' 字段中。系统无法解析 'content' 字段中的工具调用。
   - **只有通过 'tool_calls' 字段生成的工具请求，系统才能识别并执行。**
4. **根据工具执行结果，继续执行任务或进行后续工具调用。**
5. **当所有任务都已完成时，你必须、也只能调用名为 'end_task' 的工具来结束对话。**

**工具使用流程示例：**
- **分析并首次调用：**
  - (可选) 提供简明扼要的分析或下一步计划的文本（在 'content' 字段）。
  - **紧接着，生成第一个工具的 'tool_calls' 对象。**
- **工具执行后反馈：**
  - 系统会将工具执行结果（'tool' 角色消息）提供给你。
  - 根据结果（成功或失败），决定是继续下一个工具调用，还是修正并重试当前工具。
  - **确保每一次工具调用都生成在 'tool_calls' 字段。**
- **任务完成与收尾（至关重要）：**
  - 当你确信所有用户请求均已满足，**你必须生成最后一次 'tool_calls'**。
  - **这一次的工具调用，其 'name' 字段必须是 "end_task"**。
  - **其 'arguments' 字段必须是一个包含 "summary" 或 "final_message" 键的JSON对象**。
  - **示例**: {"summary": "已完成所有任务，文件已创建。"} 或 {"final_message": "所有章节均已保存。"}
  - **只有 'end_task' 工具会被系统识别为任务结束的信号。**

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
    pendingToolCalls: [], // 用于存储流式传输完成的工具调用
    toolCallState: 'idle', // 'idle', 'streaming', 'pending_user_action'
    questionCard: null,
    deepSeekHistory: [],
    deepseekApiKey: '',
    openaiApiKey: '', // 新增
    openrouterApiKey: '',
    selectedModel: 'deepseek-chat',
    isHistoryPanelVisible: false,
    isDeleteMode: false,
    showSettingsModal: false,
    availableModels: [], // 新增：用于存储所有可用模型列表
    customSystemPrompt: DEFAULT_SYSTEM_PROMPT, // 新增：自定义系统提示词
    enableStream: true, // 新增：是否启用流式传输，默认为 true
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
    // Omitted: setToolSuggestions, setToolStatus, clearToolSuggestions
    // New reducers will be added later to handle tool call actions.
    approveToolCalls: (state) => {
        // Logic to be implemented by ChatPanel: send IPC message
        state.pendingToolCalls = [];
        state.toolCallState = 'idle';
    },
    rejectToolCalls: (state) => {
        // Logic to be implemented by ChatPanel: send IPC message
        state.pendingToolCalls = [];
        state.toolCallState = 'idle';
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
    setOpenaiApiKey: (state, action) => { // 新增
      state.openaiApiKey = action.payload;
    },
    setOpenrouterApiKey: (state, action) => {
      state.openrouterApiKey = action.payload;
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
    setEnableStream: (state, action) => { // 新增：设置是否启用流式传输
        state.enableStream = action.payload;
    },
    // --- 新增：用于处理来自 IPC 的 AI 响应的通用 Reducer ---
    ipcAiResponseReceived: (state, action) => {
        const { type, payload } = action.payload; // payload 现在包含 type 和具体数据
        const currentMessages = state.messages; // Redux Toolkit 允许直接修改 state，因为它内部使用了 Immer

        switch (type) {
            case 'text_stream':
            case 'tool_stream':
                // **第四次关键修复**: 统一处理流式响应，并由 reducer 智能创建占位符
                let lastAssistantMessage = currentMessages[currentMessages.length - 1];

                // 检查最后一条消息是否不是AI消息，如果是，则说明需要一个新的AI消息占位符
                if (!lastAssistantMessage || lastAssistantMessage.role !== 'assistant') {
                    const newPlaceholder = {
                        sender: 'AI',
                        text: '',
                        role: 'assistant',
                        content: '',
                        className: 'ai',
                        sessionId: payload.sessionId, // 从 payload 获取 sessionId
                        isLoading: true,
                    };
                    currentMessages.push(newPlaceholder);
                    lastAssistantMessage = newPlaceholder;
                }

                // 清除加载状态（如果是第一次收到数据）
                if (lastAssistantMessage.isLoading) {
                    lastAssistantMessage.isLoading = false;
                    lastAssistantMessage.content = '';
                    lastAssistantMessage.text = '';
                }

                // 根据类型处理数据
                if (type === 'text_stream') {
                    lastAssistantMessage.content += payload.content;
                    lastAssistantMessage.text += payload.content;
                } else if (type === 'tool_stream') {
                    state.toolCallState = 'streaming';
                    const toolCallDeltas = payload;

                    if (!lastAssistantMessage.toolCalls) {
                        lastAssistantMessage.toolCalls = [];
                    }
                    toolCallDeltas.forEach(delta => {
                        const { index, id } = delta;
                        const func = delta.function;
                        if (func && func.arguments) {
                            lastAssistantMessage.content += func.arguments;
                            lastAssistantMessage.text += func.arguments;
                        }
                        if (!lastAssistantMessage.toolCalls[index]) {
                            lastAssistantMessage.toolCalls[index] = { id: '', function: { name: '', arguments: '' }, type: 'function' };
                        }
                        const toolCall = lastAssistantMessage.toolCalls[index];
                        if (id) toolCall.id = id;
                        if (func) {
                            if (func.name) toolCall.function.name = func.name;
                            if (func.arguments) toolCall.function.arguments += func.arguments;
                        }
                    });
                    // 更新 pendingToolCalls 保持同步
                    toolCallDeltas.forEach(delta => {
                        const { index, id } = delta;
                        const func = delta.function;
                        if (!state.pendingToolCalls[index]) {
                            state.pendingToolCalls[index] = { toolCallId: '', function: { name: '', arguments: '' } };
                        }
                        const pendingTool = state.pendingToolCalls[index];
                        if (id) pendingTool.toolCallId = id;
                        if (func) {
                            if (func.name) pendingTool.function.name = func.name;
                            if (func.arguments) pendingTool.function.arguments += func.arguments;
                        }
                    });
                }
                break;
            case 'text_stream_end':
                // 流结束时，对最终的消息和工具调用进行处理
                const lastMessage = currentMessages[currentMessages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                    lastMessage.isLoading = false;
                }

                // 最终解析所有累积的工具调用参数
                const processAndParseTools = (toolList) => {
                    if (!Array.isArray(toolList)) return;
                    toolList.forEach(tool => {
                        if (tool.function && typeof tool.function.arguments === 'string' && !tool.toolArgs) {
                            try {
                                tool.toolArgs = JSON.parse(tool.function.arguments);
                            } catch (e) {
                                console.error(`解析工具参数失败: ${tool.function.arguments}`, e);
                                tool.toolArgs = { "error": "failed to parse arguments" };
                            }
                        }
                    });
                };

                processAndParseTools(lastMessage.toolCalls);
                processAndParseTools(state.pendingToolCalls);

                // 流结束后，不再修改 toolCallState，让 tool_suggestions 全权负责
                break;
            case 'text':
                let messageUpdated = false;
                for (let i = currentMessages.length - 1; i >= 0; i--) {
                    const msg = currentMessages[i];
                    if (msg.role === 'assistant' && msg.isLoading) { // 修改判断条件
                        // **关键修复**: 从 payload 对象中只提取 content
                        msg.text = payload.content;
                        msg.content = payload.content;
                        msg.isLoading = false; // 移除加载状态
                        messageUpdated = true;
                        break;
                    }
                }
                if (!messageUpdated) {
                    currentMessages.push({
                        sender: 'AI',
                        // **关键修复**: 从 payload 对象中只提取 content
                        text: payload.content,
                        role: 'assistant',
                        content: payload.content,
                        className: 'ai',
                        sessionId: payload.sessionId,
                        isLoading: false,
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
            case 'end_task': // 这个 case 作为备用，主要逻辑在 tool_suggestions 中处理
                const lastMsgForEndTask = currentMessages[currentMessages.length - 1];
                if (lastMsgForEndTask && lastMsgForEndTask.role === 'assistant') {
                    lastMsgForEndTask.content = payload; // payload 就是总结字符串
                    lastMsgForEndTask.text = payload;
                    lastMsgForEndTask.isLoading = false;
                    lastMsgForEndTask.toolCalls = []; // 清空工具调用
                }
                // 确保状态被重置
                state.pendingToolCalls = [];
                state.toolCallState = 'idle';
                break;
            case 'tool_suggestions':
                const suggestions = payload;
                const lastMessageForSuggestions = currentMessages[currentMessages.length - 1];
                
                // **最终修复**: 在 suggestions 中直接处理 end_task 和 ask_user_question
                const endTaskTool = suggestions.find(tool => tool.function && tool.function.name === 'end_task');
                const askUserQuestionTool = suggestions.find(tool => tool.function && tool.function.name === 'ask_user_question');

                if (endTaskTool) {
                    let summary = "任务已完成。"; // 默认总结
                    try {
                        // 兼容 summary 和 final_message 两种参数格式
                        const args = endTaskTool.toolArgs || JSON.parse(endTaskTool.function.arguments);
                        summary = args.summary || args.final_message || summary;
                    } catch (e) {
                        console.error("解析 end_task 参数失败:", e);
                    }
                    
                    if (lastMessageForSuggestions && lastMessageForSuggestions.role === 'assistant') {
                        lastMessageForSuggestions.content = summary;
                        lastMessageForSuggestions.text = summary;
                        lastMessageForSuggestions.isLoading = false;
                        lastMessageForSuggestions.toolCalls = []; // 清空工具调用
                    }
                    
                    // 重置状态，不显示批准按钮
                    state.pendingToolCalls = [];
                    state.toolCallState = 'idle';

                } else if (askUserQuestionTool) {
                    // 如果是提问工具，则设置 questionCard
                    const args = askUserQuestionTool.toolArgs || JSON.parse(askUserQuestionTool.function.arguments);
                    state.questionCard = {
                        question: args.question,
                        options: args.options || [],
                        toolCallId: askUserQuestionTool.toolCallId
                    };
                    // 清空待处理工具调用，并将状态设为 idle，因为这个问题由一个专门的卡片处理
                    state.pendingToolCalls = [];
                    state.toolCallState = 'idle';

                } else {
                    // 否则，正常处理其他工具建议
                    if (lastMessageForSuggestions && lastMessageForSuggestions.role === 'assistant') {
                        try {
                            lastMessageForSuggestions.content = JSON.stringify(suggestions, null, 2);
                            lastMessageForSuggestions.text = JSON.stringify(suggestions, null, 2);
                        } catch (e) {
                            lastMessageForSuggestions.content = suggestions;
                            lastMessageForSuggestions.text = suggestions;
                        }
                        lastMessageForSuggestions.toolCalls = suggestions.map(tool => ({
                            id: tool.toolCallId,
                            function: tool.function,
                            type: 'function',
                            toolArgs: tool.toolArgs,
                        }));
                    }
                    state.pendingToolCalls = suggestions;
                    state.toolCallState = 'pending_user_action';
                }
                break;
            case 'ask_user_question':
                state.questionCard = payload;
                break;
            case 'error':
                currentMessages.push({ sender: 'System', text: `错误: ${payload}`, role: 'system', content: `错误: ${payload}`, className: 'system-error', sessionId: payload.sessionId });
                state.pendingToolCalls = [];
                state.toolCallState = 'idle';
                break;
            case 'warning':
                currentMessages.push({ sender: 'System', text: `警告: ${payload}`, role: 'system', content: `警告: ${payload}`, className: 'system-warning', sessionId: payload.sessionId });
                break;
            case 'tool_action_status':
            case 'tool_execution_status':
                // 统一处理工具状态更新
                currentMessages.push({ sender: 'System', text: `工具 ${payload.toolName} 执行${payload.success ? '成功' : '失败'}：${payload.message}`, className: 'system-message', sessionId: payload.sessionId });
                // 状态更新逻辑可能需要调整，但暂时保持不变
                break;
            case 'batch_action_status':
                currentMessages.push({
                    sender: 'System',
                    text: payload.message,
                    role: 'system',
                    content: payload.message,
                    className: 'system-message',
                    sessionId: payload.sessionId,
                });
                break;
            case 'batch_processing_complete':
                 // 这个事件目前只在后端日志中使用，前端可以暂时忽略它或添加一个不显示的日志
                console.log('[chatSlice] Batch processing complete signal received.');
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
  approveToolCalls,
  rejectToolCalls,
  setSelectedModel,
  setShowSettingsModal,
  setDeepseekApiKey,
  setOpenaiApiKey, // 新增
  setOpenrouterApiKey,
  setAvailableModels, // 新增：导出 setAvailableModels
  setCustomSystemPrompt, // 新增：导出 setCustomSystemPrompt
  resetCustomSystemPrompt, // 新增：导出 resetCustomSystemPrompt
  setEnableStream, // 新增：导出 setEnableStream
} = chatSlice.actions;

export { DEFAULT_SYSTEM_PROMPT }; // 导出默认提示词

export default chatSlice.reducer;