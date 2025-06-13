const BaseModelAdapter = require('./baseAdapter');

let fetchModule; // 用于存储动态导入的 node-fetch 模块

class OllamaAdapter extends BaseModelAdapter {
    constructor(baseUrl = 'http://localhost:11434') {
        super();
        this.baseUrl = baseUrl;
        // Ollama API 通常不需要API Key，但如果未来有需要，可以添加
        // this.apiKey = apiKey;
    }

    async _getFetch() {
        if (!fetchModule) {
            fetchModule = await import('node-fetch');
        }
        return fetchModule.default;
    }

    async generateCompletion(messages, options) {
        const fetch = await this._getFetch(); // 获取 fetch 函数

        const payload = {
            model: options.model,
            messages: messages,
            stream: options.stream || false,
            // 其他可选参数，例如 temperature, top_p, max_tokens, stop 等
            // Ollama API 参数可能有所不同，这里需要根据实际情况调整
            temperature: options.temperature,
            top_p: options.top_p,
            max_tokens: options.max_tokens,
            stop: options.stop,
        };

        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 'Authorization': `Bearer ${this.apiKey}` // 如果需要API Key
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama API error (${response.status}): ${errorText}`);
            }

            if (options.stream) {
                // 处理流式响应
                return this._handleStreamResponse(response);
            } else {
                // 处理非流式响应
                const data = await response.json();
                // 打印原始响应数据，以便调试
                console.log('Ollama raw response data:', JSON.stringify(data, null, 2));

                // Ollama 的非流式响应可能直接在 choices[0].message 或 choices[0].delta 中
                // 优先检查顶层的 message 对象，因为 Ollama 的非流式API直接返回 message
                if (data && data.message) {
                    return this._standardizeMessage(data.message);
                }

                // Fallback: 如果没有顶层 message，再检查 choices 数组（兼容 OpenAI 格式或潜在的流式响应）
                if (data && data.choices && data.choices.length > 0) {
                    const choice = data.choices[0];
                    if (choice.message) {
                        return this._standardizeMessage(choice.message);
                    } else if (choice.delta) {
                        // 对于非流式响应的 delta 格式，将其视为完整的 message
                        return this._standardizeMessage({
                            role: choice.delta.role || 'assistant',
                            content: choice.delta.content || '',
                            tool_calls: null, // 非流式 delta 暂时假设无工具调用，如果模型返回，需要更复杂的解析
                            reasoning_content: null // 同上
                        });
                    }
                }
                // 如果没有找到有效内容，记录并抛出错误
                console.error('Ollama API 响应中缺少有效的消息内容或格式不符合预期:', JSON.stringify(data, null, 2));
                throw new Error("Ollama API 响应中缺少有效的消息内容。");
            }
        } catch (error) {
            console.error('Error calling Ollama API:', error);
            throw error;
        }
    }

    // 新增：标准化 message 对象
    _standardizeMessage(ollamaMessage) {
        const rawContent = ollamaMessage.content || '';
        let content = '';
        let tool_calls = null;
        let reasoning_content = null;

        // 提取 <think> 标签内的内容作为 reasoning_content
        const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch && thinkMatch[1]) {
            reasoning_content = thinkMatch[1].trim();
        }

        // 移除 <think> 标签后的剩余内容
        const cleanedContent = rawContent.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
        
        // 尝试从 cleanedContent 中解析 JSON 结构来获取 tool_calls 和最终 content
        try {
            const parsedJson = JSON.parse(cleanedContent);
            if (parsedJson.content !== undefined) {
                content = parsedJson.content;
            }
            if (parsedJson.tool_calls !== undefined) {
                tool_calls = parsedJson.tool_calls;
            }
        } catch (e) {
            // 如果不是 JSON，则将 cleanedContent 视为纯文本 content
            content = cleanedContent;
        }

        return {
            role: ollamaMessage.role || 'assistant',
            content: content,
            tool_calls: tool_calls,
            reasoning_content: reasoning_content
        };
    }

    async _handleStreamResponse(response) {
        // 这部分需要根据实际需求实现，例如使用 ReadableStream 或 EventSource
        // 这里只是一个占位符，实际可能需要更复杂的逻辑来解析 SSE
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        return new ReadableStream({
            pull: async function(controller) {
                const { done, value } = await reader.read();
                if (done) {
                    controller.close();
                    return;
                }
                buffer += decoder.decode(value, { stream: true });
                // 尝试解析完整的JSON行
                while (buffer.includes('\n')) {
                    const newlineIndex = buffer.indexOf('\n');
                    const line = buffer.substring(0, newlineIndex).trim();
                    buffer = buffer.substring(newlineIndex + 1);

                    if (line.startsWith('data:')) {
                        try {
                            const jsonStr = line.substring(5).trim();
                            if (jsonStr === '[DONE]') {
                                controller.close();
                                return;
                            }
                            const chunk = JSON.parse(jsonStr);
                            // 对于流式响应，可能需要对每个 chunk 的 delta.content 进行累积和解析
                            // 这里简化处理，直接标准化 message
                            if (chunk.message) {
                                controller.enqueue(this._standardizeMessage(chunk.message));
                            } else if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) {
                                // 如果是 delta 形式，则需要累积 content
                                // 这部分逻辑会更复杂，目前我们只关注非流式响应的标准化
                                controller.enqueue({
                                    role: chunk.choices[0].delta.role || 'assistant',
                                    content: chunk.choices[0].delta.content || '',
                                    tool_calls: null, // 流式响应通常不包含完整工具调用，需要累积
                                    reasoning_content: null // 流式响应也需要累积思维链
                                });
                            }
                        } catch (e) {
                            console.warn('Failed to parse Ollama stream chunk:', line, e);
                        }
                    }
                }
            }.bind(this) // Bind 'this' to access _standardizeMessage
        });
    }

    // 移除 _standardizeResponse，因为现在直接返回标准化后的 message 对象
    // _standardizeResponse(ollamaResponse) {
    //     // ... (原来的 _standardizeResponse 逻辑)
    // }

    async listModels() {
        const fetch = await this._getFetch(); // 获取 fetch 函数
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            console.log('Ollama /api/tags response data:', data); // 添加调试日志

            if (!data || !Array.isArray(data.models)) {
                console.warn('Ollama /api/tags 响应格式不正确，models 字段缺失或不是数组。', data);
                return []; // 返回空数组，避免后续错误
            }

            // 将 Ollama 的模型列表转换为统一格式
            return data.models.map(model => ({
                id: model.name,
                object: 'model',
                created: model.modified_at ? Math.floor(new Date(model.modified_at).getTime() / 1000) : 0,
                owned_by: 'ollama',
                provider: 'ollama', // 添加 provider 字段以便区分
                details: {} // 将 details 字段置空，用于测试 IPC 序列化问题
            }));
        } catch (error) {
            console.error('Error listing Ollama models:', error);
            throw error;
        }
    }

    async getModelInfo(modelId) {
        // 由于 Ollama 的 /api/tags 已经提供了大部分信息，可以直接从 listModels 中获取
        const models = await this.listModels();
        const model = models.find(m => m.id === modelId);
        if (!model) {
            throw new Error(`Ollama model '${modelId}' not found.`);
        }
        return model;
    }
}

module.exports = OllamaAdapter;