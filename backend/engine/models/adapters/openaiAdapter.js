const BaseOpenAiCompatibleAdapter = require('./baseOpenAiCompatibleAdapter');

class OpenAIAdapter extends BaseOpenAiCompatibleAdapter {
    constructor(apiKey, baseUrl = "https://api.openai.com", azureApiVersion, openAiUseAzure = false) {
        const supportedModels = {
            "gpt-4o": { id: "gpt-4o", name: "GPT-4o", description: "OpenAI 的最新旗舰模型", provider: "openai", maxTokens: 8192, reasoningEffort: 0.8 },
            "gpt-4-turbo": { id: "gpt-4-turbo", name: "GPT-4 Turbo", description: "OpenAI 的高性能模型", provider: "openai", maxTokens: 4096, reasoningEffort: 0.7 },
            "gpt-3.5-turbo": { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", description: "OpenAI 的快速模型", provider: "openai", maxTokens: 4096, reasoningEffort: 0.6 }
        };

        super({
            providerName: "OpenAI",
            baseURL: baseUrl,
            apiKey: apiKey,
            defaultProviderModelId: "gpt-3.5-turbo",
            providerModels: supportedModels,
            defaultTemperature: 0.7, // OpenAI 常用默认温度
            azureApiVersion: azureApiVersion,
            openAiUseAzure: openAiUseAzure,
        });
    }
}

module.exports = OpenAIAdapter;