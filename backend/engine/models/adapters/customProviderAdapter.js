const BaseOpenAiCompatibleAdapter = require('./baseOpenAiCompatibleAdapter');

/**
 * Adapter for a user-defined custom provider, which is compatible with the OpenAI API.
 * This adapter is designed to be flexible and work with any OpenAI-compatible API endpoint.
 */
class CustomProviderAdapter extends BaseOpenAiCompatibleAdapter {
    /**
     * @param {Object} config - The configuration for the custom provider.
     * @param {string} config.providerName - A unique name for this provider instance.
     * @param {string} config.apiKey - The API key for the custom provider.
     * @param {string} config.baseURL - The base URL for the custom provider's API (e.g., "https://api.groq.com/openai/v1").
     * @param {string} config.modelId - The default model ID to use for this provider (e.g., "llama3-8b-8192").
     * @param {string} [config.modelName] - An optional, human-readable name for the model.
     * @param {string} [config.modelDescription] - An optional description for the model.
     * @param {number} [config.maxTokens] - Optional max tokens for the model.
     */
    constructor(config) {
        if (!config.providerName || !config.apiKey || !config.baseURL || !config.modelId) {
            throw new Error("CustomProviderAdapter requires providerName, apiKey, baseURL, and modelId in its configuration.");
        }

        const modelInfo = {
            id: config.modelId,
            name: config.modelName || config.modelId,
            description: config.modelDescription || `Custom model: ${config.modelId}`,
            provider: config.providerName,
            maxTokens: config.maxTokens
        };

        const customProviderOptions = {
            ...config, // Pass through any other relevant config
            providerName: config.providerName,
            baseURL: config.baseURL,
            apiKey: config.apiKey,
            defaultProviderModelId: config.modelId,
            providerModels: {
                [config.modelId]: modelInfo
            }
        };

        super(customProviderOptions);
    }
}

module.exports = CustomProviderAdapter;