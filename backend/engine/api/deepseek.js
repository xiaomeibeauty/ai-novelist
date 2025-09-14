const logger = require('../../utils/logger');
const { state } = require('../../state-manager'); // 引入共享状态
// Store 实例将异步创建
let storeInstance = null;
// const { getFileTree } = require('../../utils/file-tree-builder'); // 移除，因为 chatService 处理文件树
const chatService = require('../chatService'); // 引入新的 chatService

// 工具服务通过参数传入
let _toolService = null;

function setToolService(toolService) {
  _toolService = toolService;
}

// 移除 getOpenAIClient 函数

// 移除 aiResponseSendCount 和 _sendAiResponseToFrontend 函数的定义


module.exports = {
  setToolService,
  chatWithDeepSeek, // 保留函数名，但内部逻辑修改
  sendToolResultToDeepSeek, // 保留函数名，但内部逻辑修改
  resetResponseCount: chatService.resetResponseCount, // 从 chatService 导入
  _sendAiResponseToFrontend: chatService._sendAiResponseToFrontend // 从 chatService 导入
};

// 与 DeepSeek AI 进行对话
async function chatWithDeepSeek(latestUserMessageContent) {
    try {
        if (!storeInstance) {
            const StoreModule = await import('electron-store');
            const Store = StoreModule.default;
            storeInstance = new Store();
        }
        const defaultModelId = storeInstance.get('selectedModel') || storeInstance.get('selectedModel') || '';

        console.log(`[DeepSeek] 代理调用 chatService.chatWithAI，模型: ${defaultModelId}`);
        return await chatService.chatWithAI(latestUserMessageContent, defaultModelId);
    } catch (error) {
        console.error(`[DeepSeek] chatWithDeepSeek 代理调用失败: ${error.message}`);
        chatService._sendAiResponseToFrontend('error', `AI 代理调用失败: ${error.message}`);
        throw error;
    }
}

// 将工具执行结果发送给 DeepSeek
async function sendToolResultToDeepSeek(toolResultsArray) {
    try {
        if (!storeInstance) {
            const StoreModule = await import('electron-store');
            const Store = StoreModule.default;
            storeInstance = new Store();
        }
        const defaultModelId = storeInstance.get('selectedModel') || storeInstance.get('selectedModel') || '';

        console.log(`[DeepSeek] 代理调用 chatService.sendToolResultToAI，模型: ${defaultModelId}`);
        return await chatService.sendToolResultToAI(toolResultsArray, defaultModelId);
    } catch (error) {
        console.error(`[DeepSeek] sendToolResultToDeepSeek 代理调用失败: ${error.message}`);
        chatService._sendAiResponseToFrontend('error', `AI 代理调用失败: ${error.message}`);
        throw error;
    }
}
