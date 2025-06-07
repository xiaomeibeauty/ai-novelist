import { createSlice } from '@reduxjs/toolkit';

const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    messages: [],
    toolSuggestions: [],
    questionCard: null,
    isHistoryPanelVisible: false, // 新增：历史面板可见性
    isDeleteMode: false,          // 新增：删除模式
    deepSeekHistory: [],          // 新增：DeepSeek 对话历史数据
  },
  reducers: {
    appendMessage: (state, action) => {
      state.messages.push(action.payload);
    },
    setMessages: (state, action) => { // 新增：设置消息列表
      state.messages = action.payload;
    },
    setToolSuggestions: (state, action) => {
      state.toolSuggestions = action.payload;
    },
    setToolStatus: (state, action) => { // 将 updateToolCardStatus 重命名为 setToolStatus
      const { toolCallId, status, message } = action.payload; // 保持 payload 结构一致
      const tool = state.toolSuggestions.find(t => t.toolCallId === toolCallId);
      if (tool) {
        tool.status = status;
        tool.statusMessage = message;
        // 根据状态设置 className
        if (status === 'executed') {
          tool.statusClass = 'executed';
        } else if (status === 'failed') {
          tool.statusClass = 'failed';
        } else if (status === 'rejected') {
          tool.statusClass = 'rejected';
        } else if (status === 'executing') {
          tool.statusClass = 'executing';
        }
      }
    },
    setQuestionCard: (state, action) => {
      state.questionCard = action.payload;
    },
    setIsHistoryPanelVisible: (state, action) => { // 新增：设置历史面板可见性
      state.isHistoryPanelVisible = action.payload;
    },
    setIsDeleteMode: (state, action) => {          // 新增：设置删除模式
      state.isDeleteMode = action.payload;
    },
    setDeepSeekHistory: (state, action) => {       // 新增：设置 DeepSeek 历史数据
      state.deepSeekHistory = action.payload;
    },
    clearToolSuggestions: (state) => { // 新增：清空工具建议
      state.toolSuggestions = [];
    },
    clearChatState: (state) => {
      state.messages = [];
      state.toolSuggestions = [];
      state.questionCard = null;
      state.isHistoryPanelVisible = false;
      state.isDeleteMode = false;
      state.deepSeekHistory = [];
    }
  },
});
 
export const {
  appendMessage,
  setMessages, // 导出新 action
  setToolSuggestions,
  setToolStatus,         // 导出 setToolStatus
  setQuestionCard,
  setIsHistoryPanelVisible, // 导出新 action
  setIsDeleteMode,          // 导出新 action
  setDeepSeekHistory,       // 导出新 action
  clearToolSuggestions,     // 导出 clearToolSuggestions
  clearChatState
} = chatSlice.actions;

export default chatSlice.reducer;