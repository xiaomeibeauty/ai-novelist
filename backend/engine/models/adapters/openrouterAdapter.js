const OpenAI = require('openai');
const BaseOpenAiCompatibleAdapter = require('./baseOpenAiCompatibleAdapter');
const { Readable } = require('stream');

/**
 * Adapter for OpenRouter, which is compatible with the OpenAI API.
 */
class OpenRouterAdapter extends BaseOpenAiCompatibleAdapter {
    constructor(config) {
        const openRouterOptions = {
            ...config,
            providerName: 'openrouter',
            baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
            apiKey: config.apiKey,
            defaultProviderModelId: 'openrouter/auto',
            providerModels: {
                'openrouter/auto': { id: 'openrouter/auto', name: 'Auto (best model)', description: 'Automatically selects the best model for the task.' },
            }
        };

        super(openRouterOptions);
    }

    // 覆盖父类的 generateCompletion 以添加 OpenRouter 特有参数
    async generateCompletion(messages, options) {
        let modelId = options.model; // 直接使用 options 中的 model

        // 在发送到 OpenRouter API 之前，移除内部使用的 'openrouter/' 前缀
        if (modelId.startsWith('openrouter/')) {
            modelId = modelId.substring('openrouter/'.length);
        }

        const completionParams = {
            model: modelId,
            messages: messages,
            temperature: options.temperature,
            max_tokens: options.max_tokens,
            stream: options.stream,
            route: 'auto', // OpenRouter 特有参数
            // http_referer, title 等通过 new OpenAI() 的 defaultHeaders 设置
        };

        // 传递工具相关参数
        if (options.tools && options.tools.length > 0) {
            completionParams.tools = options.tools;
            // 强制为支持工具调用的模型设置 tool_choice
            // 某些模型（如 Gemini）需要明确设置此参数才能启用工具调用
            completionParams.tool_choice = "auto";
        }

        if (options.stream) {
            // 返回一个异步生成器
            const stream = await this.client.chat.completions.create(completionParams);
            return this._transformStreamToGenerator(stream);
        } else {
            return await this.client.chat.completions.create(completionParams);
        }
    }

    // 新增一个方法来处理流转换
    async *_transformStreamToGenerator(stream) {
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;

            if (delta?.content) {
                yield {
                    type: "text",
                    text: delta.content
                };
            }

            // 新增：处理工具调用 (与 deepseekAdapter 保持一致)
            if (delta?.tool_calls) {
                yield {
                    type: "tool_calls",
                    tool_calls: delta.tool_calls,
                };
            }

            // OpenRouter 在流的最后或每个块中可能包含 usage 数据
            if (chunk.usage) {
                // processUsageMetrics 已经返回了包含 type: "usage" 的完整对象
                yield this.processUsageMetrics(chunk.usage);
            }
        }
    }

    // 覆盖父类的 listModels 方法以从 API 动态获取
    async listModels() {
        try {
            const modelsList = await this.client.models.list();
            const models = Array.from(modelsList.data);
            
            // 更新内部的 providerModels 缓存
            models.forEach(model => {
                this.providerModels[model.id] = { ...model, provider: this.providerName };
            });

            // 返回符合格式的列表
            return Object.values(this.providerModels);
        } catch (error) {
            console.error('Failed to fetch models from OpenRouter:', error);
            // 如果获取失败，返回已知的默认模型
            return super.listModels();
        }
    }
}

module.exports = OpenRouterAdapter;
