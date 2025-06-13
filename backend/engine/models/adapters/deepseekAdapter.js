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

    async generateCompletion(messages, options) {
        try {
            const completion = await this.openaiClient.chat.completions.create({
                messages: messages,
                model: options.model || "deepseek-chat", // 默认使用 deepseek-chat
                tools: options.tools,
                tool_choice: options.tool_choice || "auto",
                stream: options.stream || false
            });

            if (completion && completion.choices && completion.choices.length > 0 && completion.choices[0].message) {
                const message = completion.choices[0].message;
                // 检查是否存在 reasoning_content，并将其包含在返回中
                if (message.reasoning_content) {
                    return {
                        ...message,
                        reasoning_content: message.reasoning_content,
                        content: message.content // 确保 content 也返回
                    };
                }
                return message; // 如果没有 reasoning_content，返回原始消息
            } else {
                throw new Error("DeepSeek API 响应中缺少有效的消息内容。");
            }
        } catch (error) {
            console.error(`[DeepSeekAdapter] 调用 DeepSeek API 失败: ${error.message}`);
            // 抛出错误，由上层处理
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