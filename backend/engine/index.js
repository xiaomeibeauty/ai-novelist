// 引擎服务入口文件
// const { chatWithDeepSeek, sendToolResultToDeepSeek, setToolService } = require('./api/deepseek');
const {
  processCommand,
  sendUserResponse,
  processToolAction,
  processBatchAction,
  register: registerIpcHandlers, // 重命名以避免冲突
  setMainWindow
} = require('./ipc/handlers');

// function init(toolService) {
//   setToolService(toolService);
//   return {
//     chatWithDeepSeek,
//     sendToolResultToDeepSeek,
//     register,
//     setMainWindow
//   };
// }

// module.exports = init;

module.exports = {
  processCommand,
  sendUserResponse,
  processToolAction,
  processBatchAction,
  registerRendererListeners: registerIpcHandlers, // 暴露给 electron.js 使用
  setMainWindow
};