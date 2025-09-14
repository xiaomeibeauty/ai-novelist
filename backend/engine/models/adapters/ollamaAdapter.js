const BaseModelAdapter = require('./baseAdapter');
const OpenAI = require('openai'); // 导入 OpenAI 库
const { XmlMatcher } = require('../../../utils/xmlMatcher'); // 引入 XmlMatcher

class OllamaAdapter extends BaseModelAdapter {
    constructor(baseUrl = 'http://localhost:11434') {
        super();
        this.baseUrl = baseUrl;
        // Ollama 提供兼容 OpenAI 的 API，所以我们可以直接使用 OpenAI 客户端
        this.client = new OpenAI({
            baseURL: `${this.baseUrl}/v1`, // Ollama 的 OpenAI 兼容 API 端点
            apiKey: 'ollama', // Ollama 通常不需要 API Key，这里可以填任意值
        });
    }

    async generateCompletion(messages, options) {
        const modelId = options.model.replace(/^ollama\//, ''); // 移除 "ollama/" 前缀
        const stream = options.stream || false;
        const temperature = options.temperature || 0.7;
        const top_p = options.top_p;
        const max_tokens = options.max_tokens;
        const stop = options.stop;
        // 注意：Ollama 的 OpenAI 兼容层目前可能不支持 `tools` 和 `tool_choice`
        // 我们按标准传递，但行为可能取决于具体模型和 Ollama 版本
        const tools = options.tools;
        const tool_choice = options.tool_choice;

        const payload = {
            model: modelId,
            messages: messages,
            stream: stream,
            temperature: temperature,
            ...(top_p && { top_p }),
            ...(max_tokens && { max_tokens }),
            ...(stop && { stop }),
            ...(tools && { tools }),
            ...(tool_choice && { tool_choice }),
        };

        try {
            if (stream) {
                const responseStream = await this.client.chat.completions.create({
                    ...payload,
                    stream: true,
                    stream_options: { include_usage: true },
                });
                // 返回一个异步生成器，与项目其他适配器保持一致
                return this._transformStreamToGenerator(responseStream);
            } else {
                const response = await this.client.chat.completions.create(payload);
                return this._standardizeOpenAIMessage(response.choices[0].message, response.usage);
            }
        } catch (error) {
            console.error('Error calling Ollama API:', error);
            throw error;
        }
    }

    async *_transformStreamToGenerator(responseStream) {
        let lastUsage = null;

        const matcher = new XmlMatcher(
            "think",
            (chunk) => ({
                type: chunk.matched ? "reasoning" : "text",
                text: chunk.data,
            })
        );

        for await (const chunk of responseStream) {
            const delta = chunk.choices[0]?.delta;

            if (delta?.content) {
                for (const matcherChunk of matcher.update(delta.content)) {
                    yield matcherChunk;
                }
            }

            if (delta?.tool_calls) {
                // 如果模型在 <think> 标签内返回 tool_calls，这可能需要更复杂的处理
                // 目前，我们假设 tool_calls 和 <think> 是互斥的
                yield {
                    type: "tool_calls",
                    tool_calls: delta.tool_calls,
                };
            }

            if (chunk.usage) {
                lastUsage = chunk.usage;
            }
        }
        
        // 处理匹配器中剩余的任何缓存内容
        for (const finalChunk of matcher.final()) {
            yield finalChunk;
        }

        if (lastUsage) {
            yield {
                type: 'usage',
                usage: {
                    inputTokens: lastUsage.prompt_tokens || 0,
                    outputTokens: lastUsage.completion_tokens || 0,
                }
            };
        }
    }

    _standardizeOpenAIMessage(openAiMessage, usage) {
        // 假设 openAiMessage 已经是 { role, content, tool_calls } 格式
        const standardized = {
            role: openAiMessage.role,
            content: openAiMessage.content || '',
            tool_calls: openAiMessage.tool_calls || [],
            reasoning_content: null, // OpenAI API 不直接提供 reasoning_content
        };

        if (usage) {
            standardized.usage = {
                inputTokens: usage.prompt_tokens || 0,
                outputTokens: usage.completion_tokens || 0,
            };
        }
        return standardized;
    }

    async listModels() {
        try {
            const response = await axios.get(`${this.baseUrl}/api/tags`);
            const modelsArray = response.data?.models?.map((model) => model.name) || [];
            return [...new Set(modelsArray)].map(modelName => ({
                id: modelName,
                object: 'model',
                created: 0, // Ollama API 没有提供 created 时间戳
                owned_by: 'ollama',
                provider: 'ollama',
                details: {},
            }));
        } catch (error) {
            console.warn('无法连接到Ollama服务，返回默认模型列表。错误:', error.message);
            // 返回一个默认模型，这样前端至少能看到ollama提供商选项
            return [{
                id: '无模型服务',
                object: 'model',
                created: 0,
                owned_by: 'ollama',
                provider: 'ollama',
                details: {},
                name: '无模型服务',
            }];
        }
    }

    async getModelInfo(modelId) {
        const models = await this.listModels();
        const model = models.find(m => m.id === modelId);
        if (!model) {
            throw new Error(`Ollama model '${modelId}' not found.`);
        }
        return model;
    }
}

const axios = require('axios'); // 引入 axios
module.exports = OllamaAdapter;