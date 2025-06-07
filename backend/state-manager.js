// backend/state-manager.js
let mainWindow = null;
let conversationHistory = []; // 用于存储 AI 对话历史
let pendingToolCalls = []; // 用于存储 DeepSeek 在一次响应中发出的所有待处理工具调用

const state = {
  get mainWindow() { return mainWindow; },
  set mainWindow(window) { mainWindow = window; },
  conversationHistory: conversationHistory,
  pendingToolCalls: pendingToolCalls,
};

function setMainWindow(window) {
  state.mainWindow = window;
}

module.exports = {
  state,
  setMainWindow
};