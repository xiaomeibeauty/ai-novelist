const BaseModelAdapter = require('./baseAdapter');
const { OpenAI } = require('openai');

class DeepSeekAdapter extends BaseModelAdapter {
    constructor(apiKey, baseUrl = "https://api.deepseek.com") {
        super();
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.openaiClient = new OpenAI({
            apiKey: this.apiKey,
            baseURL: this.baseUrl,
            timeout: 30000, // 30秒超时
            maxRetries: 2    // 失败重试2次
        });
        // DeepSeek 明确支持的模型
        this.supportedModels = [
            { id: "deepseek-chat", name: "DeepSeek Chat", description: "DeepSeek 的聊天模型", provider: "deepseek" },
            { id: "deepseek-coder", name: "DeepSeek Coder", description: "DeepSeek 的代码模型", provider: "deepseek" },
            { id: "deepseek-reasoner", name: "DeepSeek Reasoner", description: "DeepSeek 的推理模型 (R1)", provider: "deepseek" }
        ];
    }

    async *generateCompletion(messages, options) {
        try {
            const completion = await this.openaiClient.chat.completions.create({
                messages: messages,
                model: options.model || "deepseek-chat", // 默认使用 deepseek-chat
                tools: options.tools,
                tool_choice: options.tool_choice || "auto",
                stream: options.stream || false
            });

            if (options.stream) {
                for await (const chunk of completion) {
                    const delta = chunk.choices[0]?.delta;
                    if (delta?.content) {
                        yield {
                            type: "text",
                            text: delta.content,
                        };
                    }
                    if (delta?.tool_calls) {
                        yield {
                            type: "tool_calls",
                            tool_calls: delta.tool_calls,
                        };
                    }
                    if (chunk.usage) {
                        yield {
                            type: "usage",
                            inputTokens: chunk.usage.prompt_tokens || 0,
                            outputTokens: chunk.usage.completion_tokens || 0,
                        };
                    }
                    // DeepSeek 特有的 reasoning_content
                    if (delta?.reasoning_content) {
                        yield {
                            type: "reasoning",
                            text: delta.reasoning_content,
                        };
                    }
                }
            } else {
                if (completion && completion.choices && completion.choices.length > 0 && completion.choices[0].message) {
                    const message = completion.choices[0].message;
                    // 检查是否存在 reasoning_content，并将其包含在返回中
                    if (message.reasoning_content) {
                        yield {
                            type: "text",
                            text: message.content,
                            reasoning_content: message.reasoning_content,
                        };
                    } else {
                        yield {
                            type: "text",
                            text: message.content,
                        };
                    }
                    if (message.tool_calls) {
                        yield {
                            type: "tool_calls",
                            tool_calls: message.tool_calls,
                        };
                    }
                    // 对于非流式，usage信息通常在顶层，但openai库的create方法在非流式模式下返回的Completion对象中，usage信息也可能在顶层
                    // 这里假设如果是非流式，最终的Completion对象会有usage属性
                    if (completion.usage) {
                        yield {
                            type: "usage",
                            inputTokens: completion.usage.prompt_tokens || 0,
                            outputTokens: completion.usage.completion_tokens || 0,
                        };
                    }
                } else {
                    throw new Error("DeepSeek API 响应中缺少有效的消息内容。");
                }
            }
        } catch (error) {
            console.error(`[DeepSeekAdapter] 调用 DeepSeek API 失败: ${error.message}`);
            throw error;
        }
    }

    listModels() {
        return this.supportedModels;
    }

    getModelInfo(modelId) {
        const model = this.supportedModels.find(m => m.id === modelId);
        if (!model) {
            throw new Error(`模型 '${modelId}' 不存在于 DeepSeekAdapter 中。`);
        }
        return model;
    }
}

module.exports = DeepSeekAdapter;