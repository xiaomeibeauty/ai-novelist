const ModelRegistry = require('./modelRegistry');
const DeepSeekAdapter = require('./adapters/deepseekAdapter');
const OllamaAdapter = require('./adapters/ollamaAdapter');
const OpenRouterAdapter = require('./adapters/openrouterAdapter');
const CustomProviderAdapter = require('./adapters/customProviderAdapter'); // 新增
const AliyunEmbeddingFunction = require('../../rag-service/aliyunEmbeddingFunction'); // 新增：阿里云嵌入函数

let modelRegistryInstance = null;
let storeInstance = null; // 用于存储 electron-store 实例
let initializationPromise = null; // 新增：用于跟踪初始化过程的 Promise

/**
 * 重新初始化模型提供者，重新加载所有API密钥和配置
 * 这个函数应该在API密钥更新后调用
 * @returns {Promise<ModelRegistry>} 重新配置的 ModelRegistry 实例
 */
async function reinitializeModelProvider() {
    console.log("重新初始化模型提供者...");
    
    // 重置实例和Promise，强制重新初始化
    modelRegistryInstance = null;
    initializationPromise = null;
    storeInstance = null; // 重置存储实例以确保重新读取最新值
    
    // 重新初始化
    return await initializeModelProvider();
}

/**
 * 初始化并配置 ModelRegistry。
 * 这个函数应该在应用启动时调用一次。
 * @returns {Promise<ModelRegistry>} 已配置并注册的 ModelRegistry 实例。
 */
async function initializeModelProvider() { // 修改为 async 函数
    if (initializationPromise) {
        return initializationPromise; // 如果已经在初始化中，返回现有 Promise
    }
    if (modelRegistryInstance) {
        return Promise.resolve(modelRegistryInstance); // 如果已经初始化完成，直接返回 Promise.resolve
    }
    
    // 开始初始化
    initializationPromise = (async () => {

    modelRegistryInstance = new ModelRegistry();

    // 加载配置（例如 API Key、Base URL）
    if (!storeInstance) { // 异步导入 electron-store
        const StoreModule = await import('electron-store');
        const Store = StoreModule.default;
        storeInstance = new Store();
        console.log('[API设置调试] electron-store实例已创建');
    }
    
    const deepseekApiKey = storeInstance.get('deepseekApiKey'); // 从 electron-store 获取 API Key
    const deepseekBaseUrl = storeInstance.get('deepseekBaseUrl') || 'https://api.deepseek.com/v1'; // 从 electron-store 获取 baseURL，提供默认值
    
    console.log('[API设置调试] 从存储加载的DeepSeek配置:', {
        apiKey: deepseekApiKey ? '已设置' : '未设置',
        baseUrl: deepseekBaseUrl
    });

    // 实例化具体的模型适配器
    // DeepSeek 适配器
    const deepseekAdapter = new DeepSeekAdapter(deepseekApiKey, deepseekBaseUrl);
    await modelRegistryInstance.registerAdapter('deepseek', deepseekAdapter);
    if (deepseekApiKey) {
        console.log("DeepSeekAdapter 已注册。");
    } else {
        console.warn("DeepSeek API Key 未设置，但 DeepSeekAdapter 已注册。");
    }


    // Ollama 配置
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

    // OpenRouter 适配器
    const openrouterApiKey = storeInstance.get('openrouterApiKey');
    const openrouterBaseUrl = storeInstance.get('openrouterBaseUrl'); // 可选
    
    console.log('[API设置调试] 从存储加载的OpenRouter配置:', {
        apiKey: openrouterApiKey ? '已设置' : '未设置',
        baseUrl: openrouterBaseUrl || '使用默认'
    });

    try {
        const openrouterAdapter = new OpenRouterAdapter({
            apiKey: openrouterApiKey,
            baseURL: openrouterBaseUrl // 如果未提供，适配器内部会使用默认值
        });
        await modelRegistryInstance.registerAdapter('openrouter', openrouterAdapter);
        if (openrouterApiKey) {
            console.log("OpenRouterAdapter 已注册。");
        } else {
            console.warn("OpenRouter API Key 未设置，但 OpenRouterAdapter 已注册。");
        }
    } catch (error) {
        console.warn(`OpenRouterAdapter 注册失败: ${error.message}`);
    }

    // 新增：处理用户自定义的 OpenAI 兼容提供商
    const customProviders = storeInstance.get('customProviders');
    if (Array.isArray(customProviders)) {
        for (const providerConfig of customProviders) {
            if (providerConfig.enabled) {
                try {
                    const customAdapter = new CustomProviderAdapter(providerConfig);
                    await modelRegistryInstance.registerAdapter(providerConfig.providerName, customAdapter);
                    console.log(`CustomProviderAdapter '${providerConfig.providerName}' 已注册。`);
                } catch (error) {
                    console.warn(`CustomProviderAdapter '${providerConfig.providerName}' 注册失败: ${error.message}`);
                }
            }
        }
    }

    // 阿里云嵌入API Key检查（仅用于日志记录，不注册为模型适配器）
    const aliyunEmbeddingApiKey = storeInstance.get('aliyunEmbeddingApiKey');
    if (aliyunEmbeddingApiKey) {
        console.log("阿里云嵌入API Key已设置，嵌入功能可用");
    } else {
        console.warn("阿里云API Key未设置，阿里云嵌入功能将不可用");
    }

    console.log("ModelProvider 初始化完成，ModelRegistry 已配置。");
    initializationPromise = null; // 清除 Promise 引用
    return modelRegistryInstance;
    })(); // 立即执行异步函数并赋值给 initializationPromise
    return initializationPromise;
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
    getModelRegistry,
    reinitializeModelProvider
};