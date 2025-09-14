// backend/state-manager.js
let mainWindow = null;
let conversationHistory = []; // 用于存储 AI 对话历史
let pendingToolCalls = []; // 用于存储 DeepSeek 在一次响应中发出的所有待处理工具调用
let sessionStates = new Map(); // 用于存储会话状态信息

const state = {
  get mainWindow() { return mainWindow; },
  set mainWindow(window) { mainWindow = window; },
  conversationHistory: conversationHistory,
  pendingToolCalls: pendingToolCalls,
  sessionStates: sessionStates,
};

function setMainWindow(window) {
  state.mainWindow = window;
}

// 设置会话状态
function setSessionState(sessionId, stateData) {
  sessionStates.set(sessionId, stateData);
}

// 获取会话状态
function getSessionState(sessionId) {
  return sessionStates.get(sessionId);
}

// 清除会话状态
function clearSessionState(sessionId) {
  sessionStates.delete(sessionId);
}

module.exports = {
  state,
  setMainWindow,
  setSessionState,
  getSessionState,
  clearSessionState
};