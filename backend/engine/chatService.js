const { getModelRegistry, initializeModelProvider } = require('./models/modelProvider');
const logger = require('../utils/logger');
const prompts = require('./prompts');
const contextManager = require('./contextManager'); // 新增：引入上下文管理器
const tools = require('../tool-service/tools/definitions');
const { state } = require('../state-manager');
const { getFileTree } = require('../utils/file-tree-builder');
const retriever = require('../rag-service/retriever'); // 新增：导入RAG检索器

const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const isDev = require('electron-is-dev');
const { MultiSearchReplaceStrategy } = require('../tool-service/diff/multi-search-replace');

// 新增：electron-store 实例
let storeInstance = null;
async function getStoreInstance() {
  if (!storeInstance) {
    const StoreModule = await import('electron-store');
    const Store = StoreModule.default;
    storeInstance = new Store();
  }
  return storeInstance;
}

// 统一获取 novel 目录路径的辅助函数
const getNovelPath = () => {
    if (isDev) {
        // 开发环境：位于项目根目录
        return path.join(app.getAppPath(), 'novel');
    } else {
        // 生产环境：位于 .exe 文件同级目录
        return path.join(path.dirname(app.getPath('exe')), 'novel');
    }
}
// 动态组合系统提示词
function buildSystemPrompt(basePrompt, options = {}) {
  let prompt = basePrompt;
  
  // 新增：文件结构树信息 - 放在主体系统提示词之后，其他信息之前
  if (options.fileTreeContent) {
    prompt += options.fileTreeContent;
  }
  
  // 新增：持久记忆信息
  if (options.additionalInfo) {
    const info = options.additionalInfo;
    let memoryContent = '\n\n[持久记忆信息]:\n';
    
    if (info.outline) {
      memoryContent += `\n【大纲】:\n${info.outline}\n`;
    }
    if (info.previousChapter) {
      memoryContent += `\n【上一章全文】:\n${info.previousChapter}\n`;
    }
    if (info.characterSettings) {
      memoryContent += `\n【本章重要人设】:\n${info.characterSettings}\n`;
    }
    
    prompt += memoryContent;
  }
  
  
  // RAG内容控制
  if (options.ragRetrievalEnabled && options.ragContent) {
    prompt += options.ragContent;
  }
  
  return prompt;
}


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

/**
 * 清理消息对象，移除非标准的OpenAI API字段
 * 只保留 role, content, name, tool_call_id, tool_calls 等标准字段
 * @param {Array} messages 原始消息数组
 * @returns {Array} 清理后的消息数组
 */
function sanitizeMessagesForAI(messages) {
    if (!Array.isArray(messages)) {
        return messages;
    }

    return messages.map(message => {
        if (!message || typeof message !== 'object') {
            return message;
        }

        // 只保留OpenAI API标准字段
        const sanitizedMessage = {
            role: message.role,
            content: message.content
        };

        // 可选的标准字段
        if (message.name) sanitizedMessage.name = message.name;
        if (message.tool_call_id) sanitizedMessage.tool_call_id = message.tool_call_id;
        if (message.tool_calls) sanitizedMessage.tool_calls = message.tool_calls;

        return sanitizedMessage;
    });
}

function _sendAiResponseToFrontend(type, payload) {
    if (state.mainWindow) {
        aiResponseSendCount++;
        const sendTimestamp = Date.now();
        // 跳过 tool_stream 和 text_stream 类型的日志打印，避免流式传输产生过多日志
        if (type !== 'tool_stream' && type !== 'text_stream') {
            console.log(`[ChatService] Sending ai-response. Type: ${type}, Count: ${aiResponseSendCount}, Timestamp: ${sendTimestamp}, Payload:`, JSON.stringify(payload).substring(0, 500));
        }
        state.mainWindow.webContents.send('ai-response', { type, payload, sendTimestamp }); // 添加时间戳到 payload
    }
}

async function* chatWithAI(messages, modelId, customSystemPrompt, mode = 'general', ragRetrievalEnabled) {
    console.log(`[ChatService] 开始处理聊天请求:`, {
        modelId: modelId || '未指定',
        mode,
        ragRetrievalEnabled,
        customPromptLength: customSystemPrompt ? customSystemPrompt.length : 0
    });

    try {
        await initializeModelProvider(); // 确保 ModelProvider 已初始化
        const modelRegistry = getModelRegistry();
        const adapter = modelRegistry.getAdapterForModel(modelId);
        
        console.log('[API设置调试] 模型查找结果:', {
            requestedModel: modelId,
            adapterFound: !!adapter,
            adapterType: adapter ? adapter.constructor.name : '无适配器'
        });

        // 新增：获取上下文限制设置并应用
        let contextLimitSettings = null;
        try {
            const handlers = require('./ipc/handlers');
            const result = await handlers.handleGetContextLimitSettings();
            if (result.success) {
                contextLimitSettings = result.settings;
                console.log('[ChatService] 已加载上下文限制设置:', contextLimitSettings);
            } else {
                console.warn('[ChatService] 获取上下文限制设置失败，使用默认设置');
                contextLimitSettings = contextManager.defaultSettings;
            }
        } catch (error) {
            console.warn('[ChatService] 获取上下文限制设置时出错，使用默认设置:', error.message);
            contextLimitSettings = contextManager.defaultSettings;
        }

        // 应用上下文限制（只对对话消息，不包括系统消息）
        const filteredMessages = contextManager.truncateMessages(
            messages,
            contextLimitSettings,
            mode,
            false // 不是RAG上下文
        );
        
        // 获取对话模型的上下文配置用于日志显示
        const chatContextConfig = contextManager.getContextConfig(contextLimitSettings, mode, false);
        console.log(`[ChatService] 对话模型上下文约束: ${chatContextConfig.type === 'tokens' && chatContextConfig.value === 'full' ? '满tokens' : chatContextConfig.value + '轮'}, 原始消息 ${messages.length} 条, 过滤后 ${filteredMessages.length} 条`);

        // 初始化RAG检索器（从handlers.js的storeInstance获取）
        try {
            const handlers = require('./ipc/handlers');
            if (handlers.storeInstance) {
                await retriever.initialize(handlers.storeInstance);
            }
        } catch (error) {
            console.warn('[ChatService] 无法获取storeInstance，RAG功能可能受限:', error.message);
        }

        if (!adapter) {
            const errorMessage = `模型 '${modelId}' 不可用或未注册。`;
            console.warn(`[API设置调试] chatWithAI: ${errorMessage}`);
            console.log('[API设置调试] 当前注册的模型映射:', Object.keys(modelRegistry.modelMapping));
            _sendAiResponseToFrontend('error', errorMessage);
            return { type: 'error', payload: errorMessage };
        }

        // 获取 novel 文件夹的文件结构
        const novelPath = getNovelPath();
        const fileTreeResult = await getFileTree(novelPath);
        let fileTreeContent = '';
        if (fileTreeResult && fileTreeResult.success) {
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
       const initialSystemMessage = filteredMessages.find(msg => msg.role === 'system');
       const effectiveInitialSystemPrompt = initialSystemMessage ? initialSystemMessage.content : '';

       // --- RAG检索注入 ---
       const lastUserMessage = filteredMessages.filter(m => m.role === 'user').pop();
       let ragContext = '';
       let retrievalInfo = null;
       
       // RAG检索控制：只有在启用时才执行检索
       if (lastUserMessage && lastUserMessage.content && ragRetrievalEnabled) {
           // 获取当前模式的RAG集合选择设置
           let ragCollectionNames = [];
           try {
               const storeInstance = await getStoreInstance();
               const modeFeatureSettings = storeInstance.get('modeFeatureSettings') || {};
               const currentModeSettings = modeFeatureSettings[mode] || {};
               ragCollectionNames = currentModeSettings.ragCollectionNames || [];
               
               console.log(`[ChatService] RAG集合选择设置 - 模式: ${mode}, 选择的集合:`, ragCollectionNames);
           } catch (error) {
               console.warn('[ChatService] 获取RAG集合设置失败，使用所有集合:', error.message);
           }
           
           // 使用增强的检索功能，启用意图分析，并传递当前模式和选择的集合
           const retrievalResult = await retriever.retrieve(messages, 3, true, mode, ragCollectionNames);
            
            if (retrievalResult.documents && retrievalResult.documents.length > 0) {
                retrievalInfo = retrievalResult;
                
                // 根据模式提供差异化的引导语句
                let ragGuidance = '';
                if (mode === 'writing') {
                    ragGuidance = '这些内容主要作为文风、句式结构和描写方式的参考。请模仿其中的写作风格和表达方式。';
                } else if (mode === 'adjustment') {
                    ragGuidance = '这些内容主要作为风格一致性和语言表达的参考。请确保修改后的内容与参考风格保持一致。';
                } else if (mode === 'outline') {
                    ragGuidance = '这些内容主要作为情节结构和叙事手法的参考。可以参考其中的故事架构技巧。';
                } else {
                    ragGuidance = '这些内容仅供参考，请根据当前任务需求合理使用。';
                }
                
                // 构建RAG上下文
                ragContext = `\n\n[知识库参考内容]：
这是从知识库中检索到的相关内容，${ragGuidance}
请注意：这些内容可能与当前剧情无关，请谨慎参考，不要将其作为实际剧情内容。

检索到的参考内容：
${retrievalResult.documents.map(doc => `- ${doc}`).join('\n')}\n`;
                
                console.log('[ChatService] 已成功注入增强的RAG上下文。');
                if (retrievalResult.isAnalyzed) {
                    console.log('[ChatService] 意图分析已启用，检索优化完成');
                }
            }
        }
        // --- RAG检索结束 ---

      // 新增：获取附加信息（支持新旧数据格式）
      let additionalInfo = {};
      try {
        const storeInstance = await getStoreInstance();
        const additionalInfoData = storeInstance.get('additionalInfo') || {};
        const modeInfo = additionalInfoData[mode];
        
        if (typeof modeInfo === 'string') {
          // 旧格式：字符串，迁移到新格式
          additionalInfo = {
            outline: modeInfo,
            previousChapter: '',
            characterSettings: ''
          };
          console.log('[ChatService] 检测到旧格式附加信息，已迁移到新格式，模式:', mode);
        } else if (typeof modeInfo === 'object' && modeInfo !== null) {
          // 新格式：对象
          additionalInfo = {
            outline: modeInfo.outline || '',
            previousChapter: modeInfo.previousChapter || '',
            characterSettings: modeInfo.characterSettings || ''
          };
          console.log('[ChatService] 已加载新格式附加信息，模式:', mode);
        } else {
          // 空数据
          additionalInfo = {
            outline: '',
            previousChapter: '',
            characterSettings: ''
          };
        }
        
        console.log('[ChatService] 附加信息详情:', {
          outlineLength: additionalInfo.outline.length,
          previousChapterLength: additionalInfo.previousChapter.length,
          characterSettingsLength: additionalInfo.characterSettings.length
        });
      } catch (error) {
        console.warn('[ChatService] 获取附加信息失败:', error.message);
        additionalInfo = {
          outline: '',
          previousChapter: '',
          characterSettings: ''
        };
      }

      // 使用动态提示词组合构建最终系统消息
      const systemMessageContent = buildSystemPrompt(effectiveSystemPrompt, {
        fileTreeContent: fileTreeContent, // 文件结构树作为独立参数
        ragRetrievalEnabled: ragRetrievalEnabled,
        ragContent: ragContext, // 只包含RAG内容，不再包含文件树
        additionalInfo: additionalInfo
      });

       // **关键修复**: 移除不安全的 .map() 重构。
       // 直接过滤掉旧的 system 消息，然后 unshift 添加新的。
       const messagesToSend = filteredMessages.filter(msg => msg.role !== 'system');
       messagesToSend.unshift({ role: "system", content: systemMessageContent, name: "system" });

       // **新增**: 清理消息，移除非标准的OpenAI API字段
       const sanitizedMessages = sanitizeMessagesForAI(messagesToSend);
       console.log('[ChatService] 消息清理完成，移除非标准字段');

       // 修改此处，处理流式响应
       // 确保 conversationHistory 包含所有必要的消息，特别是对于后续的工具调用
       // 暂时不将完整的 AI 响应存储到 conversationHistory，而是由外部处理
       // 因为这里是生成器，每次 yield 都会返回一部分内容

       console.log(`[ChatService] chatWithAI - 工具功能已强制启用`);
       
       const aiResponse = await adapter.generateCompletion(sanitizedMessages, {
            model: modelId,
            tools: tools, // 始终启用工具
            tool_choice: "auto", // 始终自动选择工具
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

        // 获取文件结构树
        let fileTreeContent = '';
        try {
            const novelPath = getNovelPath();
            const fileTreeResult = await getFileTree(novelPath);
            if (fileTreeResult && fileTreeResult.success && fileTreeResult.tree && fileTreeResult.tree.length > 0) {
                // 将树结构转换为字符串表示
                const formatTree = (items, depth = 0) => {
                    let result = '';
                    const indent = '  '.repeat(depth);
                    for (const item of items) {
                        result += `${indent}${item.isFolder ? '📁 ' : '📄 '}${item.title}\n`;
                        if (item.isFolder && item.children && item.children.length > 0) {
                            result += formatTree(item.children, depth + 1);
                        }
                    }
                    return result;
                };
                
                const fileTreeString = formatTree(fileTreeResult.tree);
                fileTreeContent = `\n\n## 当前小说项目的文件结构树：\n\`\`\`\n${fileTreeString}\n\`\`\`\n\n`;
                console.log('[ChatService] 文件结构树已获取并准备发送给AI:', fileTreeString.substring(0, 100) + '...');
            } else {
                console.log('[ChatService] 文件结构树为空或未找到');
            }
        } catch (error) {
            console.warn('[ChatService] 获取文件结构树时出错:', error.message);
        }

        // 获取持久记忆信息
        let additionalInfo = {
            outline: '',
            previousChapter: '',
            characterSettings: ''
        };
        try {
            const storeInstance = await getStoreInstance();
            const additionalInfoData = storeInstance.get('additionalInfo') || {};
            const modeInfo = additionalInfoData[mode];
            
            if (typeof modeInfo === 'string') {
                // 旧格式：字符串，迁移到新格式
                additionalInfo = {
                    outline: modeInfo,
                    previousChapter: '',
                    characterSettings: ''
                };
                console.log('[ChatService] 检测到旧格式附加信息，已迁移到新格式，模式:', mode);
            } else if (typeof modeInfo === 'object' && modeInfo !== null) {
                // 新格式：对象
                additionalInfo = {
                    outline: modeInfo.outline || '',
                    previousChapter: modeInfo.previousChapter || '',
                    characterSettings: modeInfo.characterSettings || ''
                };
                console.log('[ChatService] 已加载新格式附加信息，模式:', mode);
            } else {
                // 空数据
                additionalInfo = {
                    outline: '',
                    previousChapter: '',
                    characterSettings: ''
                };
            }
            
            console.log('[ChatService] 附加信息详情:', {
                outlineLength: additionalInfo.outline.length,
                previousChapterLength: additionalInfo.previousChapter.length,
                characterSettingsLength: additionalInfo.characterSettings.length
            });
        } catch (error) {
            console.warn('[ChatService] 获取附加信息失败:', error.message);
            additionalInfo = {
                outline: '',
                previousChapter: '',
                characterSettings: ''
            };
        }

        if (!adapter) {
            const errorMessage = `模型 '${modelId}' 不可用或未注册。`;
            console.warn(`[ChatService] sendToolResultToAI: ${errorMessage}`);
            yield { type: 'error', payload: errorMessage }; // 使用 yield
            return;
        }

        // 新增：获取上下文限制设置并应用
        let contextLimitSettings = null;
        try {
            const handlers = require('./ipc/handlers');
            const result = await handlers.handleGetContextLimitSettings();
            if (result.success) {
                contextLimitSettings = result.settings;
                console.log('[ChatService] 已加载上下文限制设置:', contextLimitSettings);
            } else {
                console.warn('[ChatService] 获取上下文限制设置失败，使用默认设置');
                contextLimitSettings = contextManager.defaultSettings;
            }
        } catch (error) {
            console.warn('[ChatService] 获取上下文限制设置时出错，使用默认设置:', error.message);
            contextLimitSettings = contextManager.defaultSettings;
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
        const filteredMessages = state.conversationHistory.filter(
            msg => msg && ['user', 'assistant', 'tool'].includes(msg.role)
        );

        // 应用上下文限制
        const truncatedMessages = contextManager.truncateMessages(
            filteredMessages,
            contextLimitSettings,
            mode,
            false // 不是RAG上下文
        );
        console.log(`[ChatService] 上下文限制应用: 原始消息 ${filteredMessages.length} 条, 过滤后 ${truncatedMessages.length} 条`);

        // **关键修复**: 与 chatWithAI 保持一致，移除旧的 system 消息，然后添加新的
        const messagesToSend = truncatedMessages.filter(msg => msg.role !== 'system');
        
        // 使用 buildSystemPrompt 构建完整的系统提示词，包含文件结构树和持久记忆
        const fullSystemPrompt = buildSystemPrompt(effectiveSystemPrompt, {
            fileTreeContent: fileTreeContent,
            ragRetrievalEnabled: false, // 工具结果反馈通常不需要RAG
            ragContent: '',
            additionalInfo: additionalInfo
        });
        
        console.log('[ChatService] 构建的系统提示词长度:', fullSystemPrompt.length);
        console.log('[ChatService] 系统提示词包含文件树:', fullSystemPrompt.includes('文件结构树'));
        
        messagesToSend.unshift({ role: "system", content: fullSystemPrompt, name: "system" });

        // **新增**: 清理消息，移除非标准的OpenAI API字段
        const sanitizedMessages = sanitizeMessagesForAI(messagesToSend);
        console.log('[ChatService] 消息清理完成，移除非标准字段');

        console.log(`[ChatService] sendToolResultToAI - 工具功能已强制启用`);
        
        // **关键修改**: 启用流式传输
        const aiResponse = await adapter.generateCompletion(sanitizedMessages, {
            model: modelId,
            tools: tools, // 始终启用工具
            tool_choice: "auto", // 始终自动选择工具
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

async function processUserMessage(message, sessionId, currentMessages, mode, customPrompt, ragRetrievalEnabled, model) {
    // This function will contain the core logic from handleProcessCommand
    state.conversationHistory = currentMessages || [];
    
    console.log(`[ChatService] processUserMessage: 使用模型: ${model}`);
    
    // Append the latest user message if it's not already there
    if (!state.conversationHistory.some(msg => msg.content === message && msg.role === 'user')) {
        const latestMessage = { role: 'user', content: message, sessionId: sessionId, id: `${Date.now()}` };
        state.conversationHistory.push(latestMessage);
    }
    
    state.pendingToolCalls = [];
    resetResponseCount();
    
    const storeModule = await import('electron-store');
    const store = new storeModule.default();
    // 优先使用前端传递的模型，如果没有则使用存储中的模型
    const storedSelectedModel = store.get('selectedModel');
    const storedDefaultModel = store.get('selectedModel');
    const defaultModelId = model || storedSelectedModel || storedDefaultModel || '';
    
    console.log(`[API设置调试] processUserMessage: 模型选择详情 -`);
    console.log(`  前端传递的模型: ${model || '未提供'}`);
    console.log(`  存储的selectedModel: ${storedSelectedModel || '未设置'}`);
    console.log(`  存储的selectedModel: ${storedDefaultModel || '未设置'}`);
    console.log(`  最终使用的模型ID: ${defaultModelId || '未设置模型'}`);
    
    // 记录完整的存储状态用于调试
    console.log('[API设置调试] 当前存储中的相关设置:', {
        selectedModel: store.get('selectedModel'),
        selectedProvider: store.get('selectedProvider'),
        deepseekApiKey: store.get('deepseekApiKey') ? '已设置' : '未设置',
        openrouterApiKey: store.get('openrouterApiKey') ? '已设置' : '未设置'
    });

    const validHistory = state.conversationHistory.filter(msg =>
        msg && msg.role && (msg.content || msg.tool_calls)
    );

    try {
        const stream = chatWithAI(validHistory, defaultModelId, customPrompt, mode, ragRetrievalEnabled);
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
}