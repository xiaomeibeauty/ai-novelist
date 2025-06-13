const { getModelRegistry, initializeModelProvider } = require('./models/modelProvider');
const logger = require('../utils/logger');
const tools = require('../tool-service/tools/definitions');
const { state } = require('../state-manager');
const { getFileTree } = require('../utils/file-tree-builder');

let aiResponseSendCount = 0;

function resetResponseCount() {
    aiResponseSendCount = 0;
}

function _sendAiResponseToFrontend(type, payload) {
    if (state.mainWindow) {
        aiResponseSendCount++;
        const sendTimestamp = Date.now();
        console.log(`[ChatService] Sending ai-response. Type: ${type}, Count: ${aiResponseSendCount}, Timestamp: ${sendTimestamp}, Payload:`, JSON.stringify(payload).substring(0, 500));
        state.mainWindow.webContents.send('ai-response', { type, payload, sendTimestamp }); // 添加时间戳到 payload
    }
}

async function chatWithAI(latestUserMessageContent, modelId, customSystemPrompt) { // 新增 customSystemPrompt 参数
    console.log(`[ChatService] 开始处理用户消息: ${latestUserMessageContent} (模型: ${modelId})`);
 
    try {
        await initializeModelProvider(); // 确保 ModelProvider 已初始化
        const modelRegistry = getModelRegistry();
        const adapter = modelRegistry.getAdapterForModel(modelId);

        if (!adapter) {
            const errorMessage = `模型 '${modelId}' 不可用或未注册。`;
            console.warn(`[ChatService] chatWithAI: ${errorMessage}`);
            _sendAiResponseToFrontend('error', errorMessage);
            return { type: 'error', payload: errorMessage };
        }

        // 获取 novel 文件夹的文件结构
        const fileTreeResult = await getFileTree('novel');
        let fileTreeContent = '';
        if (fileTreeResult.success) {
            const formatFileTree = (nodes, indent = 0) => {
                let result = '';
                for (const node of nodes) {
                    const prefix = ' '.repeat(indent * 2) + '- ';
                    result += `${prefix}${node.title}${(node.type === 'folder' ? '/' : '')}\n`;
                    if (node.children && node.children.length > 0) {
                        result += formatFileTree(node.children, indent + 1);
                    }
                }
                return result;
            };
            fileTreeContent = `\n\n[当前工作区文件结构 (novel 目录)]:\n${formatFileTree(fileTreeResult.tree)}\n`;
        } else {
            console.warn(`获取 novel 目录文件树失败: ${fileTreeResult.error}`);
            fileTreeContent = `\n\n[获取 novel 目录文件结构失败: ${fileTreeResult.error}]\n`;
        }

       const DEFAULT_SYSTEM_PROMPT = `你是一个**工具使用型AI**，精通使用各种工具来完成用户请求。

**你的核心任务是：**
1. **准确理解用户意图。**
2. **根据用户意图，规划需要使用的工具和步骤
3. **严格按照工具的 JSON Schema 定义，生成有效的 'tool_calls' 对象。**
   - **极其重要：** 你必须将工具调用生成在响应的 **'tool_calls' 字段**中。
   - **绝对禁止：** **切勿**将工具调用的 JSON 结构以文本形式（例如，Markdown 代码块）输出到 'content' 字段中。系统无法解析 'content' 字段中的工具调用。
   - **只有通过 'tool_calls' 字段生成的工具请求，系统才能识别并执行。**
4. **根据工具执行结果，继续执行任务或进行后续工具调用。**
5. **当任务完全完成后，你必须使用 'end_task' 工具来结束会话，并提供最终总结。**

**工具使用流程示例：**
- **分析并首次调用：**
  - (可选) 提供简明扼要的分析或下一步计划的文本（在 'content' 字段）。
  - **紧接着，生成第一个工具的 'tool_calls' 对象。**
- **工具执行后反馈：**
  - 系统会将工具执行结果（'tool' 角色消息）提供给你。
  - 根据结果（成功或失败），决定是继续下一个工具调用，还是修正并重试当前工具。
  - **确保每一次工具调用都生成在 'tool_calls' 字段。**
- **任务完成与收尾：**
  - 当你认为所有用户需求已解决，且工具链已执行完毕时，**必须**调用 'end_task' 工具，并提供最终总结信息。
  - **注意：'end_task' 也必须以 'tool_calls' 形式生成。**

**重要交互原则 - 请严格遵循以优化用户体验和效率：**
1. **单步执行优先：** 除非任务性质要求必须同时进行，否则请尽量一次只建议一个工具操作。例如，如果用户请求创建多章内容，请逐章进行，每次只建议创建一章，等待用户确认和系统反馈后再建议下一章。
2. **等待反馈：** 在建议并调用工具后，请耐心等待系统返回该工具的执行结果（成功或失败或被用户忽略）。只有收到反馈后，才能基于该反馈决定下一步的行动。
3. **避免重复建议：** 如果系统反馈某个工具操作被用户忽略或未执行，请不要立即重复建议该操作，除非用户明确要求或任务逻辑需要。在重复之前，可尝试分析原因或询问用户意图。
4. **简洁明了：** 你的响应应由简要的文本（可选）和精确的 'tool_calls' 构成，避免冗余信息。

**记住：你的响应应该由文本（可选）和精确的 'tool_calls' 构成，而不是描述。**`;

       const effectiveSystemPrompt = customSystemPrompt && customSystemPrompt.trim() !== ''
                                     ? customSystemPrompt
                                     : DEFAULT_SYSTEM_PROMPT;

       const systemMessageContent = `${effectiveSystemPrompt}\n${fileTreeContent}`; // 将文件树内容添加到系统消息中

        const messagesToSend = [
            { role: "system", content: systemMessageContent, name: "system" },
            ...state.conversationHistory.map(msg => {
                const deepseekMessage = {
                    role: msg.role,
                    content: msg.content,
                };
                // 仅包含 API 支持的字段
                if (msg.name) deepseekMessage.name = msg.name;
                if (msg.tool_calls) deepseekMessage.tool_calls = msg.tool_calls;
                if (msg.tool_call_id) deepseekMessage.tool_call_id = msg.tool_call_id;
                // 如果是 assistant 消息，并且存在 reasoning_content，则不传入
                if (msg.role === 'assistant' && msg.reasoning_content) {
                    // 不做任何操作，reasoning_content 不会被添加到 deepseekMessage
                }
                return deepseekMessage;
            })
        ];

console.log(`[ChatService] DEBUG: 发送给模型 (${modelId}) 的消息:`, JSON.stringify(messagesToSend, null, 2));
        const aiResponse = await adapter.generateCompletion(messagesToSend, {
            model: modelId,
            tools: tools,
            tool_choice: "auto",
            stream: false
        });
console.log(`[ChatService] DEBUG: 从模型 (${modelId}) 收到原始响应:`, JSON.stringify(aiResponse, null, 2));
console.log(`[ChatService] DEBUG: 解析 aiResponse 结构:`);
console.log(`[ChatService] DEBUG:   aiResponse.content:`, aiResponse.content);
console.log(`[ChatService] DEBUG:   aiResponse.reasoning_content:`, aiResponse.reasoning_content);
console.log(`[ChatService] DEBUG:   aiResponse.tool_calls:`, aiResponse.tool_calls);
console.log(`[ChatService] DEBUG:   aiResponse.choices[0].message.content:`, aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message ? aiResponse.choices[0].message.content : 'N/A');
console.log(`[ChatService] DEBUG:   aiResponse.choices[0].message.tool_calls:`, aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message ? aiResponse.choices[0].message.tool_calls : 'N/A');
console.log(`[ChatService] DEBUG:   aiResponse.choices[0].message.reasoning_content:`, aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message ? aiResponse.choices[0].message.reasoning_content : 'N/A');


        const currentSessionId = state.conversationHistory.length > 0
            ? state.conversationHistory[0].sessionId
            : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log(`[ChatService] chatWithAI - 确定当前会话 sessionId: ${currentSessionId}`);

        let message = aiResponse; // 默认 aiResponse 就是 message 对象

        // 如果 aiResponse 是一个包含 choices 数组的 completion 对象，则提取 message
        if (aiResponse.choices && aiResponse.choices.length > 0 && aiResponse.choices[0].message) {
            message = aiResponse.choices[0].message;
        }

        // 检查是否存在 end_task 工具调用
        let hasEndTask = false;
        if (message.tool_calls && message.tool_calls.length > 0) {
            hasEndTask = message.tool_calls.some(call => call.function.name === "end_task");
        }

        // 将 AI 响应作为 assistant 消息存储到 conversationHistory，无论是否存在 end_task 工具调用
        state.conversationHistory.push({
            role: "assistant",
            content: message.content || null,
            reasoning_content: message.reasoning_content || null,
            tool_calls: message.tool_calls || null,
            sessionId: currentSessionId
        });

        let assistantContent = message.content || null;
        let assistantText = message.content || '[无内容]';
        let assistantToolCalls = message.tool_calls || null;
        let reasoningContent = message.reasoning_content || null;

        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
            const endTaskCall = aiResponse.tool_calls.find(call => call.function.name === "end_task");
            if (endTaskCall) {
                try {
                    const toolArgs = JSON.parse(endTaskCall.function.arguments);
                    if (toolArgs.final_message) {
                        assistantContent = toolArgs.final_message;
                        assistantText = toolArgs.final_message;
                    }
                } catch (e) {
                    console.error(`解析 end_task 工具参数失败: ${e.message}`);
                }
            }
        }

        if (reasoningContent && modelId === 'deepseek-reasoner') { // 仅当模型是 deepseek-reasoner 时发送思维链
            _sendAiResponseToFrontend('reasoning_content', {
                content: reasoningContent,
                sessionId: currentSessionId
            });
        }

        let endTaskTriggered = false; // 标记 end_task 是否被触发

        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
            const endTaskCall = aiResponse.tool_calls.find(call => call.function.name === "end_task");
            if (endTaskCall) {
                try {
                    const toolArgs = JSON.parse(endTaskCall.function.arguments);
                    const finalMessage = toolArgs.final_message || "任务已完成。";
                    console.log(`[ChatService] Sending 'end_task' IPC. Final Message: ${finalMessage.substring(0, 100)}`);
                    _sendAiResponseToFrontend('end_task', finalMessage);
                    endTaskTriggered = true; // 标记 end_task 已触发

                    await logger.logAiConversation(currentSessionId); // 记录日志
                    return { type: 'processed', payload: 'AI 响应已处理' }; // end_task 是最终响应，直接返回
                } catch (e) {
                    console.error(`解析 end_task 工具参数失败或处理 end_task 过程中出错: ${e.message}`);
                }
            }
        }

        // 如果 end_task 没有被触发，并且有 assistantContent，则发送 text 类型消息
        if (!endTaskTriggered && assistantContent && assistantContent !== '[无内容]') {
            let contentToSend = assistantContent;
            // 移除DeepSeek特有的工具调用标记，确保前端接收纯净内容
            contentToSend = contentToSend.replace(/```json[\s\S]*?```\s*<｜tool call end｜>\s*<｜tool calls end｜>|<｜tool calls begin｜>[\s\S]*?<｜tool calls end｜>/g, '').trim();
            if (contentToSend) {
                console.log(`[ChatService] Sending 'text' IPC. Content: ${contentToSend.substring(0, 100)}`);
                _sendAiResponseToFrontend('text', contentToSend);
            }
        }

        // 继续处理其他工具调用（除了 end_task，因为它已经在上面处理了并且已经返回）
        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
            for (const toolCall of aiResponse.tool_calls) {
                const toolName = toolCall.function.name;
                if (toolName === "end_task") {
                    continue; // end_task 已经在前面处理，跳过
                }

                let toolArgs;
                try {
                    toolArgs = JSON.parse(toolCall.function.arguments);
                } catch (e) {
                    console.error(`解析工具参数失败: ${e.message}`);
                    toolArgs = {};
                }

                if (toolName === "ask_user_question") {
                    const question = toolArgs.question;
                    const options = toolArgs.options || [];
                    console.log(`[ChatService] Sending 'ask_user_question' IPC.`);
                    _sendAiResponseToFrontend('ask_user_question', { question, options, toolCallId: toolCall.id });
                    await logger.logAiConversation(currentSessionId);
                    return { type: 'processed', payload: 'AI 响应已处理' };

                } else { // 其他工具
                    state.pendingToolCalls.push({
                        toolCallId: toolCall.id,
                        toolName: toolName,
                        toolArgs: toolArgs,
                        aiExplanation: `AI 建议执行 ${toolName} 操作。`,
                        status: 'pending',
                        result: null,
                        sessionId: currentSessionId
                    });
                }
            }

            if (state.pendingToolCalls.length > 0) {
                _sendAiResponseToFrontend('tool_suggestions', state.pendingToolCalls);
                return {
                    type: 'pending_tools',
                    payload: { sessionId: currentSessionId }
                };
            }
        }

        if (!assistantContent && state.pendingToolCalls.length === 0) {
            _sendAiResponseToFrontend('error', 'AI 没有给出明确的回复或工具调用。');
        }

        await logger.logAiConversation(currentSessionId);
        return { type: 'processed', payload: 'AI 响应已处理' };

    } catch (error) {
        console.error(`[ChatService] 处理消息时出错: ${error.message}`);
        _sendAiResponseToFrontend('error', `处理消息时出错: ${error.message}`);
        throw error;
    }
}

async function sendToolResultToAI(toolResultsArray, modelId) {
    let currentSessionId;
    try {
        await initializeModelProvider(); // 确保 ModelProvider 已初始化
        const modelRegistry = getModelRegistry();
        const adapter = modelRegistry.getAdapterForModel(modelId);

        if (!adapter) {
            const errorMessage = `模型 '${modelId}' 不可用或未注册。`;
            console.warn(`[ChatService] sendToolResultToAI: ${errorMessage}`);
            _sendAiResponseToFrontend('error', errorMessage);
            return { type: 'error', payload: errorMessage };
        }

        const toolMessages = toolResultsArray.map(item => ({
            role: "tool",
            tool_call_id: item.toolCallId,
            name: item.toolName,
            content: JSON.stringify(item.result)
        }));

        // 过滤掉 end_task 工具的执行结果，因为它的 assistant 消息没有被存储，避免上下文不匹配
        const filteredToolMessages = toolMessages.filter(msg => msg.name !== "end_task");
        state.conversationHistory.push(...filteredToolMessages);

        const messagesToSend = state.conversationHistory.map(msg => {
            const message = {
                role: msg.role,
                content: msg.content,
            };
            if (msg.name) message.name = msg.name;
            if (msg.tool_calls) message.tool_calls = msg.tool_calls;
            if (msg.tool_call_id) message.tool_call_id = msg.tool_call_id;
            // 如果是 assistant 消息，并且存在 reasoning_content，则不传入
            if (msg.role === 'assistant' && msg.reasoning_content) {
                // 不做任何操作，reasoning_content 不会被添加到 message
            }
            return message;
        });

        console.log(`[ChatService] DEBUG: 发送给 DeepSeek 的工具结果消息:`, JSON.stringify(messagesToSend, null, 2));

        const aiResponse = await adapter.generateCompletion(messagesToSend, {
            model: modelId,
            tools: tools,
            tool_choice: "auto",
            stream: false
        });

        currentSessionId = state.conversationHistory.length > 0
            ? state.conversationHistory[0].sessionId
            : (toolResultsArray.length > 0 ? toolResultsArray[0].sessionId : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
        console.log(`[ChatService] DEBUG: currentSessionId after declaration: ${currentSessionId}`);

        // 检查是否存在 end_task 工具调用
        let hasEndTask = false;
        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
            hasEndTask = aiResponse.tool_calls.some(call => call.function.name === "end_task");
        }

        // 仅当没有 end_task 工具调用时，才将 AI 响应作为 assistant 社消息存储到 conversationHistory
        if (!hasEndTask) {
            state.conversationHistory.push({
                role: "assistant",
                content: aiResponse.content || null,
                reasoning_content: aiResponse.reasoning_content || null, // 新增
                tool_calls: aiResponse.tool_calls || null,
                sessionId: currentSessionId
            });
        }

        let assistantContent = aiResponse.content || null;
        let assistantToolCalls = aiResponse.tool_calls || null;
        let assistantText = aiResponse.content || '[无内容]';
        let reasoningContent = aiResponse.reasoning_content || null; // 新增

        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
            const endTaskCall = aiResponse.tool_calls.find(call => call.function.name === "end_task");
            if (endTaskCall) {
                try {
                    const toolArgs = JSON.parse(endTaskCall.function.arguments);
                    if (toolArgs.final_message) {
                        assistantContent = toolArgs.final_message;
                        assistantText = toolArgs.final_message;
                    }
                } catch (e) {
                    console.error(`解析 end_task 工具参数失败: ${e.message}`);
                }
            }
        }

        if (reasoningContent && modelId === 'deepseek-reasoner') { // 仅当模型是 deepseek-reasoner 时发送思维链
            _sendAiResponseToFrontend('reasoning_content', {
                content: reasoningContent,
                sessionId: currentSessionId
            });
        }

        if (assistantText && assistantText !== '[无内容]') {
            let contentToSend = assistantText;
            // 移除DeepSeek特有的工具调用标记，确保前端接收纯净内容
            contentToSend = contentToSend.replace(/```json[\s\S]*?```\s*<｜tool call end｜>\s*<｜tool calls end｜>|<｜tool calls begin｜>[\s\S]*?<｜tool calls end｜>/g, '').trim();
            if (contentToSend) {
                _sendAiResponseToFrontend('text', contentToSend);
            }
        }

        let endTaskTriggered = false; // 标记 end_task 是否被触发

        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
            const endTaskCall = aiResponse.tool_calls.find(call => call.function.name === "end_task");
            if (endTaskCall) {
                try {
                    const toolArgs = JSON.parse(endTaskCall.function.arguments);
                    const finalMessage = toolArgs.final_message || "任务已完成。";
                    console.log(`[ChatService] Sending 'end_task' IPC (sendToolResultToAI). Final Message: ${finalMessage.substring(0, 100)}`);
                    _sendAiResponseToFrontend('end_task', finalMessage);
                    endTaskTriggered = true; // 标记 end_task 已触发

                    // 移除了将 end_task 记录到 conversationHistory 的逻辑，因为 end_task 不应作为对话历史的一部分
                    // 避免 'tool' 消息后面没有 'tool_calls' 导致的 DeepSeek API 错误
                    await logger.logAiConversation(currentSessionId); // 记录日志
                    return { type: 'processed', payload: 'AI 响应已处理' }; // end_task 是最终响应，直接返回
                } catch (e) {
                    console.error(`解析 end_task 工具参数失败或处理 end_task 过程中出错: ${e.message}`);
                }
            }
        }

        // 如果 end_task 没有被触发，并且有 assistantText，则发送 text 类型消息
        if (!endTaskTriggered && assistantText && assistantText !== '[无内容]') {
            let contentToSend = assistantText;
            // 移除DeepSeek特有的工具调用标记，确保前端接收纯净内容
            contentToSend = contentToSend.replace(/```json[\s\S]*?```\s*<｜tool call end｜>\s*<｜tool calls end｜>|<｜tool calls begin｜>[\s\S]*?<｜tool calls end｜>/g, '').trim();
            if (contentToSend) {
                console.log(`[ChatService] Sending 'text' IPC (sendToolResultToAI). Content: ${contentToSend.substring(0, 100)}`);
                _sendAiResponseToFrontend('text', contentToSend);
            }
        }

        // 继续处理其他工具调用（除了 end_task，因为它已经在上面处理了并且已经返回）
        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
            for (const toolCall of aiResponse.tool_calls) {
                console.log(`[ChatService] sendToolResultToAI: 收到工具调用 ID: "${toolCall.id}", Name: "${toolCall.function.name}"`);
                console.log(`[ChatService] sendToolResultToAI: 原始工具参数字符串: "${toolCall.function.arguments}"`);
                const toolName = toolCall.function.name;
                if (toolName === "end_task") {
                    continue; // end_task 已经在前面处理，跳过
                }

                let toolArgs;
                try {
                    toolArgs = JSON.parse(toolCall.function.arguments);
                    console.log(`[ChatService] sendToolResultToAI: 解析后的工具参数:`, toolArgs);
                } catch (e) {
                    console.error(`[ChatService] sendToolResultToAI: 解析工具参数失败 (toolCallId: ${toolCall.id}):`, e);
                    toolArgs = {};
                }

                if (toolName === "ask_user_question") {
                    const question = toolArgs.question;
                    const options = toolArgs.options || [];
                    console.log(`[ChatService] Sending 'ask_user_question' IPC (sendToolResultToAI).`);
                    _sendAiResponseToFrontend('ask_user_question', { question, options, toolCallId: toolCall.id });
                    return { type: 'processed', payload: 'AI 响应已处理' };
                } else {
                    state.pendingToolCalls.push({
                        toolCallId: toolCall.id,
                        toolName: toolName,
                        toolArgs: toolArgs,
                        aiExplanation: `AI 建议执行 ${toolName} 操作。`,
                        status: 'pending',
                        result: null,
                        sessionId: currentSessionId
                    });
                }
            }

            if (state.pendingToolCalls.length > 0) {
                _sendAiResponseToFrontend('tool_suggestions', state.pendingToolCalls);
                console.log('[ChatService] sendToolResultToAI: 强制发送 tool_suggestions 更新 UI，包含所有 pendingToolCalls。');
                return { type: 'pending_tools', payload: '有待处理的工具建议，已强制更新 UI。' };
            }
        }

        if (!assistantContent && state.pendingToolCalls.length === 0) {
            _sendAiResponseToFrontend('error', 'AI 没有给出明确的回复或工具调用。');
        }

        console.log(`[ChatService] DEBUG: Reached end of sendToolResultToAI. currentSessionId: ${currentSessionId}`);
        await logger.logAiConversation(currentSessionId);
        return { type: 'processed', payload: 'AI 响应已处理' };

    } catch (error) {
        console.error("sendToolResultToAI: 再次调用 AI API 失败:", error);
        if (error.response && error.response.data) {
            console.error("sendToolResultToAI: AI API 错误详情:", error.response.data);
            _sendAiResponseToFrontend('error', `AI 反馈失败: ${error.message} (${JSON.stringify(error.response.data)})`);
        } else {
            _sendAiResponseToFrontend('error', `AI 反馈失败: ${error.message}`);
        }
        throw error;
    }
}

module.exports = {
    chatWithAI,
    sendToolResultToAI,
    resetResponseCount,
    _sendAiResponseToFrontend
};