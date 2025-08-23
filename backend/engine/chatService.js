const { getModelRegistry, initializeModelProvider } = require('./models/modelProvider');
const logger = require('../utils/logger');
const prompts = require('./prompts');
const tools = require('../tool-service/tools/definitions');
const { state } = require('../state-manager');
const { getFileTree } = require('../utils/file-tree-builder');

const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const isDev = require('electron-is-dev');
const { MultiSearchReplaceStrategy } = require('../tool-service/diff/multi-search-replace');

// 统一获取 novel 目录路径的辅助函数
const getNovelPath = () => {
    if (isDev) {
        // 开发环境：位于项目根目录
        return path.join(app.getAppPath(), 'novel');
    } else {
        // 生产环境：位于 .exe 文件同级目录
        return path.join(path.dirname(app.getPath('exe')), 'novel');
    }
};

// 服务级别的状态，用于存储持久化设置
const serviceState = {
    isStreaming: true, // 默认为流式
};

function setStreamingMode({ stream }) {
    console.log(`[ChatService] 更新流式模式为: ${stream}`);
    serviceState.isStreaming = stream;
}

// 新增 getter 函数以安全地暴露状态
function getStreamingMode() {
    return serviceState.isStreaming;
}

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

async function* chatWithAI(messages, modelId, customSystemPrompt, mode = 'general') {
    console.log(`[ChatService] 开始处理聊天请求 (模型: ${modelId}, 模式: ${mode})`);

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

       const selectedSystemPrompt = prompts[mode] || prompts['general'];
       const effectiveSystemPrompt = customSystemPrompt && customSystemPrompt.trim() !== ''
                                     ? customSystemPrompt
                                     : selectedSystemPrompt;
       console.log(`[ChatService] 系统提示词选择 - 模式: ${mode}, 自定义: "${customSystemPrompt}", 最终使用: "${effectiveSystemPrompt}"`);

       // 提取系统消息，如果存在
       const initialSystemMessage = messages.find(msg => msg.role === 'system');
       const effectiveInitialSystemPrompt = initialSystemMessage ? initialSystemMessage.content : '';

       // 将文件树内容添加到系统消息中
       // 修正：将默认或自定义的系统提示与文件树内容正确合并
       const systemMessageContent = `${effectiveSystemPrompt}\n${fileTreeContent}`;

        // **关键修复**: 移除不安全的 .map() 重构。
        // 直接过滤掉旧的 system 消息，然后 unshift 添加新的。
        const messagesToSend = messages.filter(msg => msg.role !== 'system');
        messagesToSend.unshift({ role: "system", content: systemMessageContent, name: "system" });

        // 修改此处，处理流式响应
        // 确保 conversationHistory 包含所有必要的消息，特别是对于后续的工具调用
        // 暂时不将完整的 AI 响应存储到 conversationHistory，而是由外部处理
        // 因为这里是生成器，每次 yield 都会返回一部分内容

        const aiResponse = await adapter.generateCompletion(messagesToSend, {
            model: modelId,
            tools: tools,
            tool_choice: "auto",
            stream: serviceState.isStreaming // 使用服务级别状态
        });

        let fullAssistantContent = "";
        let finalToolCalls = [];
        let finalReasoningContent = "";
        let lastUsage = null;
        let currentSessionId = state.conversationHistory.length > 0
            ? state.conversationHistory[0].sessionId
            : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        if (serviceState.isStreaming) {
            for await (const chunk of aiResponse) {
                if (chunk.type === "text") {
                    fullAssistantContent += chunk.text;
                    yield { type: "text", content: chunk.text };
                } else if (chunk.type === "tool_calls" && chunk.tool_calls) {
                    yield { type: "tool_calls", content: chunk.tool_calls };
                    chunk.tool_calls.forEach(delta => {
                        let existingCall = finalToolCalls.find(call => call.index === delta.index);
                        if (!existingCall) {
                            existingCall = { index: delta.index, id: null, type: 'function', function: { name: '', arguments: '' } };
                            finalToolCalls.splice(delta.index, 0, existingCall);
                        }
                        if (delta.id) existingCall.id = delta.id;
                        if (delta.function && delta.function.name) existingCall.function.name = delta.function.name;
                        if (delta.function && delta.function.arguments) existingCall.function.arguments += delta.function.arguments;
                    });
                } else if (chunk.type === "reasoning") {
                    finalReasoningContent += chunk.text;
                    yield { type: "reasoning", content: chunk.text };
                } else if (chunk.type === "usage") {
                    lastUsage = chunk;
                    yield { type: "usage", content: chunk };
                }
            }
        } else {
            // 非流式处理，但 adapter 仍然返回一个生成器，需要迭代它来构建完整响应
            for await (const chunk of aiResponse) {
                if (chunk.type === "text") {
                    fullAssistantContent += chunk.text || '';
                    if (chunk.reasoning_content) {
                        finalReasoningContent += chunk.reasoning_content;
                    }
                } else if (chunk.type === "tool_calls") {
                    finalToolCalls = chunk.tool_calls || [];
                } else if (chunk.type === "usage") {
                    lastUsage = chunk;
                }
            }
            
            // 模拟流式输出，以便下游代码统一处理
            if (fullAssistantContent) {
                yield { type: "text", content: fullAssistantContent };
            }
            if (finalToolCalls.length > 0) {
                 yield { type: "tool_calls", content: finalToolCalls };
            }
            if (lastUsage) {
                yield { type: "usage", content: lastUsage };
            }
        }

        // 在流结束后，将完整的 assistant 消息添加到 conversationHistory
        const messageToStore = {
            role: "assistant",
            content: fullAssistantContent || null,
            reasoning_content: finalReasoningContent || null,
            tool_calls: finalToolCalls || null,
            sessionId: currentSessionId
        };
        state.conversationHistory.push(messageToStore);

        // 如果有推理内容，发送给前端
        if (finalReasoningContent) {
            _sendAiResponseToFrontend('reasoning_content', {
                content: finalReasoningContent,
                sessionId: currentSessionId
            });
        }

        // 处理 end_task 和 ask_user_question，它们仍然通过 IPC 发送
        // **重构**: 统一处理所有工具调用，让前端决定如何渲染
        if (finalToolCalls && finalToolCalls.length > 0) {
            // 注意：旧的 pendingToolCalls 应该在工具执行后被清除，这里我们假设每次都是新的调用
            const newPendingToolCalls = [];
            for (const toolCall of finalToolCalls) {
                let toolArgs;
                try {
                    // 预解析参数，方便前端使用
                    toolArgs = JSON.parse(toolCall.function.arguments);
                } catch (e) {
                    console.error(`[ChatService] 解析工具参数失败: ${e.message}`);
                    toolArgs = { "error": "failed to parse arguments", "raw_arguments": toolCall.function.arguments };
                }

                // ================== 新增：apply_diff 预处理逻辑 ==================
                if (toolCall.function.name === 'apply_diff' && toolArgs.path && toolArgs.diff) {
                    try {
                        const novelRootDir = getNovelPath();
                        let cleanFilePath = toolArgs.path;
                         if (cleanFilePath.startsWith('novel/') || cleanFilePath.startsWith('novel\\')) {
                            cleanFilePath = cleanFilePath.substring('novel/'.length);
                        }
                        const fullPath = path.join(novelRootDir, cleanFilePath);
                        
                        const originalContent = await fs.readFile(fullPath, 'utf-8');
                        const strategy = new MultiSearchReplaceStrategy(0.9);
                        const result = await strategy.applyDiff(originalContent, toolArgs.diff);

                        if (result.success) {
                            toolArgs.suggestedContentPreview = result.content;
                             console.log(`[ChatService] 成功为 apply_diff 预计算了预览内容。路径: ${toolArgs.path}`);
                            
                            // ================== 新增：发送专用的预览事件 ==================
                            if (state.mainWindow) {
                                // 确保发送给前端的路径总是以 'novel/' 开头
                                const frontendPath = toolArgs.path.startsWith('novel/') ? toolArgs.path : `novel/${toolArgs.path}`;
                                state.mainWindow.webContents.send('show-diff-preview', {
                                    filePath: frontendPath,
                                    originalContent: originalContent,
                                    suggestedContent: result.content
                                });
                                console.log(`[ChatService] 已发送 show-diff-preview 顶级事件，路径: ${frontendPath}`);
                            }
                            // ==========================================================

                        } else {
                            console.warn(`[ChatService] 为 apply_diff 预计算预览内容失败: ${result.error}`);
                        }
                    } catch (previewError) {
                        console.error(`[ChatService] 在为 apply_diff 生成预览时发生异常: ${previewError.message}`);
                    }
                }
                // ===============================================================

                newPendingToolCalls.push({
                    toolCallId: toolCall.id,
                    toolName: toolCall.function.name,
                    toolArgs: toolArgs,
                    function: toolCall.function, // 保持 function 对象的完整性
                    aiExplanation: `AI 建议执行 ${toolCall.function.name} 操作。`,
                    status: 'pending',
                    result: null,
                    sessionId: currentSessionId
                });
            }

            // 将新解析的工具调用存入状态
            state.pendingToolCalls = newPendingToolCalls;

            // 统一通过 'tool_suggestions' 发送给前端
            if (state.pendingToolCalls.length > 0) {
                _sendAiResponseToFrontend('tool_suggestions', state.pendingToolCalls);
                yield { type: 'pending_tools', payload: { sessionId: currentSessionId } };
            }
        }

        if (!fullAssistantContent && state.pendingToolCalls.length === 0) {
            _sendAiResponseToFrontend('error', 'AI 没有给出明确的回复或工具调用。');
            yield { type: 'error', payload: 'AI 没有给出明确的回复或工具调用。' };
        }

        await logger.logAiConversation(currentSessionId);
        yield { type: 'processed', payload: 'AI 响应已处理' }; // 最终的成功标记

    } catch (error) {
        console.error(`[ChatService] 处理消息时出错: ${error.message}`);
        _sendAiResponseToFrontend('error', `处理消息时出错: ${error.message}`);
        throw error;
    }
}

// **关键重构**: 将 sendToolResultToAI 改造为与 chatWithAI 类似的流式生成器
async function* sendToolResultToAI(toolResultsArray, modelId, customSystemPrompt = null, mode = 'general') {
    console.log(`[ChatService] 开始处理工具结果反馈 (模型: ${modelId}, 模式: ${mode})`);
    let currentSessionId;
    try {
        await initializeModelProvider();
        const modelRegistry = getModelRegistry();
        const adapter = modelRegistry.getAdapterForModel(modelId);
        
        // 获取模式特定的系统提示词
        const selectedSystemPrompt = prompts[mode] || prompts['general'];
        const effectiveSystemPrompt = customSystemPrompt && customSystemPrompt.trim() !== ''
                                      ? customSystemPrompt
                                      : selectedSystemPrompt;

        if (!adapter) {
            const errorMessage = `模型 '${modelId}' 不可用或未注册。`;
            console.warn(`[ChatService] sendToolResultToAI: ${errorMessage}`);
            yield { type: 'error', payload: errorMessage }; // 使用 yield
            return;
        }

        // **关键修复**：在映射之前过滤掉 end_task，因为它不应该有执行结果被发送回AI
        const filteredToolResults = toolResultsArray.filter(item => item.toolName !== "end_task");

        const toolMessages = filteredToolResults.map(item => {
            // 确保 result 存在且有意义，避免创建空的 tool message
            if (!item.result) {
                return null;
            }
            const content = (item.result && typeof item.result.content === 'string')
                          ? item.result.content
                          : JSON.stringify(item.result);

            return {
                role: "tool",
                tool_call_id: item.toolCallId,
                name: item.toolName, // 关键修复：添加缺失的 toolName
                content: content,
            };
        }).filter(Boolean); // 过滤掉 null 值

        // 只有在确实有工具结果需要推送时才执行
        if (toolMessages.length > 0) {
            state.conversationHistory.push(...toolMessages);
        }

        // 使用与 chatWithAI 相同的逻辑构建 messagesToSend
        // **关键修复**: 直接使用 state.conversationHistory，因为它应该包含所有格式正确的消息。
        // 不再使用 .map() 进行不安全的重构，这正是导致空对象问题的根源。
        // **关键修复**: 在将 conversationHistory 发送给 AI 之前，必须严格过滤，
        // 只包含符合 API 规范的 a 'user', 'assistant', or 'tool' 角色的消息。
        const messagesToSend = state.conversationHistory.filter(
            msg => msg && ['user', 'assistant', 'tool'].includes(msg.role)
        );



        // **关键修改**: 启用流式传输
        const aiResponse = await adapter.generateCompletion(messagesToSend, {
            model: modelId,
            tools: tools,
            tool_choice: "auto",
            stream: serviceState.isStreaming, // 使用服务级别状态
        });

        // 复用 chatWithAI 的流式处理逻辑
        let fullAssistantContent = "";
        let finalToolCalls = [];
        currentSessionId = state.conversationHistory.length > 0 ? state.conversationHistory.find(m => m.sessionId)?.sessionId : `${Date.now()}`;

        if (serviceState.isStreaming) {
            for await (const chunk of aiResponse) {
                if (chunk.type === "text") {
                    fullAssistantContent += chunk.text;
                    yield { type: "text", content: chunk.text, sessionId: currentSessionId };
                } else if (chunk.type === "tool_calls" && chunk.tool_calls) {
                    yield { type: "tool_calls", content: chunk.tool_calls };
                    chunk.tool_calls.forEach(delta => {
                        let existingCall = finalToolCalls.find(call => call.index === delta.index);
                        if (!existingCall) {
                            existingCall = {
                                index: delta.index,
                                id: null,
                                type: 'function',
                                function: { name: '', arguments: '' }
                            };
                            finalToolCalls.splice(delta.index, 0, existingCall);
                        }
                        if (delta.id) existingCall.id = delta.id;
                        if (delta.function && delta.function.name) existingCall.function.name = delta.function.name;
                        if (delta.function && delta.function.arguments) existingCall.function.arguments += delta.function.arguments;
                    });
                }
                // 可以根据需要添加对 'reasoning' 和 'usage' 的处理
            }
        } else {
            // 非流式处理，但 adapter 仍然返回一个生成器，需要迭代它来构建完整响应
            for await (const chunk of aiResponse) {
                if (chunk.type === "text") {
                    fullAssistantContent += chunk.text || '';
                } else if (chunk.type === "tool_calls") {
                    finalToolCalls = chunk.tool_calls || [];
                }
            }
            
            // 模拟流式输出
            if (fullAssistantContent) {
                yield { type: "text", content: fullAssistantContent, sessionId: currentSessionId };
            }
            if (finalToolCalls.length > 0) {
                yield { type: "tool_calls", content: finalToolCalls };
            }
        }

        // 在流结束后，将完整的 assistant 消息添加到 conversationHistory
        const messageToStore = {
            role: "assistant",
            content: fullAssistantContent || null,
            tool_calls: finalToolCalls.length > 0 ? finalToolCalls : null,
            sessionId: currentSessionId
        };
        state.conversationHistory.push(messageToStore);

        // **重构**: 统一处理所有工具调用，让前端决定如何渲染
        if (finalToolCalls && finalToolCalls.length > 0) {
            // 注意：旧的 pendingToolCalls 应该在工具执行后被清除，这里我们假设每次都是新的调用
            const newPendingToolCalls = [];
            for (const toolCall of finalToolCalls) {
                let toolArgs;
                try {
                    // 预解析参数，方便前端使用
                    toolArgs = JSON.parse(toolCall.function.arguments);
                } catch (e) {
                    console.error(`[ChatService] 解析工具参数失败: ${e.message}`);
                    toolArgs = { "error": "failed to parse arguments", "raw_arguments": toolCall.function.arguments };
                }
                
                // ================== 新增：apply_diff 预处理逻辑 ==================
                if (toolCall.function.name === 'apply_diff' && toolArgs.path && toolArgs.diff) {
                    try {
                        const novelRootDir = getNovelPath();
                        let cleanFilePath = toolArgs.path;
                         if (cleanFilePath.startsWith('novel/') || cleanFilePath.startsWith('novel\\')) {
                            cleanFilePath = cleanFilePath.substring('novel/'.length);
                        }
                        const fullPath = path.join(novelRootDir, cleanFilePath);
                        
                        const originalContent = await fs.readFile(fullPath, 'utf-8');
                        const strategy = new MultiSearchReplaceStrategy(0.9);
                        const result = await strategy.applyDiff(originalContent, toolArgs.diff);

                        if (result.success) {
                            toolArgs.suggestedContentPreview = result.content;
                             console.log(`[ChatService] 成功为 apply_diff 预计算了预览内容。路径: ${toolArgs.path}`);

                            // ================== 新增：发送专用的预览事件 ==================
                            if (state.mainWindow) {
                                state.mainWindow.webContents.send('show-diff-preview', {
                                    filePath: toolArgs.path,
                                    originalContent: originalContent,
                                    suggestedContent: result.content
                                });
                                console.log(`[ChatService] 已发送 show-diff-preview 顶级事件。`);
                            }
                            // ==========================================================

                        } else {
                            console.warn(`[ChatService] 为 apply_diff 预计算预览内容失败: ${result.error}`);
                        }
                    } catch (previewError) {
                        console.error(`[ChatService] 在为 apply_diff 生成预览时发生异常: ${previewError.message}`);
                    }
                }
                // ===============================================================

                newPendingToolCalls.push({
                    toolCallId: toolCall.id,
                    toolName: toolCall.function.name,
                    toolArgs: toolArgs,
                    function: toolCall.function, // 保持 function 对象的完整性
                    aiExplanation: `AI 建议执行 ${toolCall.function.name} 操作。`,
                    status: 'pending',
                    result: null,
                    sessionId: currentSessionId
                });
            }

            // 将新解析的工具调用存入状态
            state.pendingToolCalls = newPendingToolCalls;

            // 统一通过 'tool_suggestions' 发送给前端
            if (state.pendingToolCalls.length > 0) {
                _sendAiResponseToFrontend('tool_suggestions', state.pendingToolCalls);
                yield { type: 'pending_tools', payload: { sessionId: currentSessionId } };
            }
        }
        
        await logger.logAiConversation(currentSessionId);
        yield { type: 'processed', payload: '工具反馈响应已处理' };

    } catch (error) {
        console.error("sendToolResultToAI: 再次调用 AI API 失败:", error);
        yield { type: 'error', payload: `AI 反馈失败: ${error.message}` }; // 使用 yield
        // 不再抛出错误，而是通过流传递错误
    }
}

async function processUserMessage(message, sessionId, currentMessages, mode, customPrompt) {
    // This function will contain the core logic from handleProcessCommand
    state.conversationHistory = currentMessages || [];
    
    // Append the latest user message if it's not already there
    if (!state.conversationHistory.some(msg => msg.content === message && msg.role === 'user')) {
        const latestMessage = { role: 'user', content: message, sessionId: sessionId, id: `${Date.now()}` };
        state.conversationHistory.push(latestMessage);
    }
    
    state.pendingToolCalls = [];
    resetResponseCount();
    
    const storeModule = await import('electron-store');
    const store = new storeModule.default();
    const defaultModelId = store.get('defaultAiModel') || 'deepseek-chat';

    const validHistory = state.conversationHistory.filter(msg =>
        msg && msg.role && (msg.content || msg.tool_calls)
    );

    try {
        const stream = chatWithAI(validHistory, defaultModelId, customPrompt, mode);
        for await (const chunk of stream) {
            if (chunk.type === 'text') {
                if (getStreamingMode()) {
                    _sendAiResponseToFrontend('text_stream', { content: chunk.content, sessionId: sessionId });
                } else {
                    _sendAiResponseToFrontend('text', { content: chunk.content, sessionId: sessionId });
                }
            } else if (chunk.type === 'tool_calls' && chunk.content) {
                 if (getStreamingMode()) {
                    for (const delta of chunk.content) {
                        _sendAiResponseToFrontend('tool_stream', [delta]);
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                } else {
                    _sendAiResponseToFrontend('tool_suggestions', state.pendingToolCalls);
                }
            }
        }
        if (getStreamingMode()) {
            _sendAiResponseToFrontend('text_stream_end', null);
        }
    } catch (error) {
        console.error('调用聊天服务失败:', error);
        _sendAiResponseToFrontend('error', `调用聊天服务失败: ${error.message}`);
    }
}

// async function regenerateResponse(messageId) {
//     const messageIndex = state.conversationHistory.findIndex(msg => msg.id === messageId);
//     if (messageIndex === -1) return;
//
//     // We assume the message to regenerate is an AI response, so we remove it and all subsequent messages.
//     // The last user message before it will be used to trigger a new response.
//     state.conversationHistory.splice(messageIndex);
//
//     const lastUserMessage = [...state.conversationHistory].reverse().find(m => m.role === 'user');
//     if (!lastUserMessage) return;
//
//     await processUserMessage(lastUserMessage.content, lastUserMessage.sessionId, state.conversationHistory);
// }

// async function editMessage(messageId, newContent) {
//     const messageIndex = state.conversationHistory.findIndex(msg => msg.id === messageId);
//     if (messageIndex === -1) return;

//     state.conversationHistory[messageIndex].content = newContent;
//     state.conversationHistory[messageIndex].text = newContent;

//     state.conversationHistory.splice(messageIndex + 1);

//     const lastMessage = state.conversationHistory[state.conversationHistory.length - 1];
//     await processUserMessage(lastMessage.content, lastMessage.sessionId, state.conversationHistory);
// }


module.exports = {
    chatWithAI,
    sendToolResultToAI,
    resetResponseCount,
    _sendAiResponseToFrontend,
    setStreamingMode,
    getStreamingMode, // 导出 getter
    // regenerateResponse,
    // editMessage,
    processUserMessage,
};