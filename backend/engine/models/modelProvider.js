const ModelRegistry = require('./modelRegistry');
const DeepSeekAdapter = require('./adapters/deepseekAdapter'); // 取消注释
const OllamaAdapter = require('./adapters/ollamaAdapter');

let modelRegistryInstance = null;
let storeInstance = null; // 新增：用于存储 electron-store 实例

/**
 * 初始化并配置 ModelRegistry。
 * 这个函数应该在应用启动时调用一次。
 * @returns {Promise<ModelRegistry>} 已配置并注册的 ModelRegistry 实例。
 */
async function initializeModelProvider() { // 修改为 async 函数
    if (modelRegistryInstance) {
        return modelRegistryInstance; // 如果已经初始化，则返回现有实例
    }

    modelRegistryInstance = new ModelRegistry();

    // 加载配置（例如 API Key、Base URL）
    if (!storeInstance) { // 异步导入 electron-store
        const StoreModule = await import('electron-store');
        const Store = StoreModule.default;
        storeInstance = new Store();
    }
    const deepseekApiKey = storeInstance.get('deepseekApiKey'); // 从 electron-store 获取 API Key
    const deepseekBaseUrl = storeInstance.get('deepseekBaseUrl') || 'https://api.deepseek.com/v1'; // 从 electron-store 获取 baseURL，提供默认值

    // 实例化具体的模型适配器
    if (deepseekApiKey) {
        const deepseekAdapter = new DeepSeekAdapter(deepseekApiKey, deepseekBaseUrl);
        await modelRegistryInstance.registerAdapter('deepseek', deepseekAdapter); // 添加 await
        console.log("DeepSeekAdapter 已注册。");
    } else {
        console.warn("DeepSeek API Key 未设置，DeepSeekAdapter 未注册。");
    }

    // 获取 Ollama 配置
    const ollamaBaseUrl = storeInstance.get('ollamaBaseUrl') || 'http://localhost:11434'; // 从 electron-store 获取 baseURL，提供默认值

    // 实例化并注册 Ollama 适配器
    try {
        const ollamaAdapter = new OllamaAdapter(ollamaBaseUrl);
        // 尝试连接 Ollama 并获取模型列表，如果失败则不注册
        await ollamaAdapter.listModels();
        await modelRegistryInstance.registerAdapter('ollama', ollamaAdapter); // 添加 await
        console.log(`OllamaAdapter 已注册，基础URL: ${ollamaBaseUrl}`);
    } catch (error) {
        console.warn(`无法连接到 Ollama 服务或获取模型列表（${ollamaBaseUrl}），OllamaAdapter 未注册。错误: ${error.message}`);
    }

    console.log("ModelProvider 初始化完成，ModelRegistry 已配置。");
    return modelRegistryInstance;
}

/**
 * 获取已初始化并配置的 ModelRegistry 实例。
 * @returns {ModelRegistry} ModelRegistry 实例。
 * @throws {Error} 如果 ModelProvider 未初始化。
 */
function getModelRegistry() {
    if (!modelRegistryInstance) {
        throw new Error("ModelProvider 未初始化。请在应用启动时调用 initializeModelProvider()。");
    }
    return modelRegistryInstance;
}

module.exports = {
    initializeModelProvider,
    getModelRegistry
};