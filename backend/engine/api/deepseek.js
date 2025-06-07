const { OpenAI } = require('openai');
const logger = require('../../../frontend/mvp/utils/logger');
const path = require('path');
const tools = require('../../tool-service/tools/definitions');
const { state } = require('../../state-manager'); // 引入共享状态
const Store = require('electron-store').default; // 引入 electron-store
const store = new Store(); // 创建 Store 实例
const { getFileTree } = require('../../utils/file-tree-builder'); // 引入文件树构建工具

// 工具服务通过参数传入
let _toolService = null;

function setToolService(toolService) {
  _toolService = toolService;
}

// 动态获取 OpenAI 客户端实例
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

function getOpenAIClient() {
  const deepseekApiKey = store.get('deepseekApiKey'); // 从 electron-store 获取 API Key
  if (!deepseekApiKey) {
    console.warn('[DeepSeek] DeepSeek API Key 未设置。');
    // 直接向前端发送错误消息，不再抛出错误，而是返回 null
    if (state.mainWindow) {
        state.mainWindow.webContents.send('ai-response', { type: 'error', payload: 'DeepSeek API Key 未设置，请在设置中配置。' });
    }
    return null; // 返回 null，表示 API Key 未设置，无法创建客户端
  }
  return new OpenAI({
    apiKey: deepseekApiKey,
    baseURL: "https://api.deepseek.com/v1",
    timeout: 30000, // 30秒超时
    maxRetries: 2    // 失败重试2次
  });
}

// 定义一个全局计数器来跟踪 ai-response 的发送次数
let aiResponseSendCount = 0;
 
function resetResponseCount() {
    aiResponseSendCount = 0;
}
 
// 新增：统一的发送函数
function _sendAiResponseToFrontend(type, payload) {
    if (state.mainWindow) {
        aiResponseSendCount++;
        console.log(`[DeepSeek.js] Sending ai-response. Type: ${type}, Count: ${aiResponseSendCount}, Payload:`, JSON.stringify(payload).substring(0, 500));
        state.mainWindow.webContents.send('ai-response', { type, payload });
    }
}
 
module.exports = {
  setToolService,
  chatWithDeepSeek,
  sendToolResultToDeepSeek,
  resetResponseCount,
  _sendAiResponseToFrontend // 导出以便其他模块调用 (如果需要)
};


// 与 DeepSeek AI 进行对话
async function chatWithDeepSeek(latestUserMessageContent) { // 修改参数名，更清晰地表示是最新用户消息的内容
  console.log(`[DeepSeek] 开始处理用户消息 (来自前端历史): ${latestUserMessageContent}`);

  try {
    const openaiClient = getOpenAIClient(); // 获取带有最新 API Key 的客户端
    if (!openaiClient) { // 如果 API Key 未设置，getOpenAIClient 会返回 null
        console.warn('[DeepSeek] chatWithDeepSeek: API Key 未设置，无法进行对话。');
        // 返回一个明确的错误对象，以便调用方处理
        return { type: 'error', payload: 'DeepSeek API Key 未设置，无法进行对话。' };
    }

    // 获取 novel 文件夹的文件结构
    const fileTreeResult = await getFileTree('novel');
    let fileTreeContent = '';
    if (fileTreeResult.success) {
        // 将文件树转换为可读的字符串格式
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

    const systemMessageContent = `你是一个**工具使用型AI**，精通使用各种工具来完成用户请求。
 
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
 
 **记住：你的响应应该由文本（可选）和精确的 'tool_calls' 构成，而不是描述。**
 ${fileTreeContent}`; // 将文件树内容添加到系统消息中

    const messagesToSend = [
        { role: "system", content: systemMessageContent, name: "system" },
        ...state.conversationHistory
    ];

    // --- 日志记录：发送给 DeepSeek 的上下文 ---
    // 用户的 Prompt 已经包含在 messagesToSend 的 conversationHistory 中
    // logger.writeLog(`[DeepSeek_Request] Type: Chat\nContext: ${JSON.stringify(messagesToSend, null, 2)}`); // 移除旧的日志记录
    // console.log(`[DeepSeek_Request_Console] Type: Chat\nContext: ${JSON.stringify(messagesToSend, null, 2)}`); // 清理冗余日志
    // --- 日志记录结束 ---

    const completion = await openaiClient.chat.completions.create({
        messages: messagesToSend,
        model: "deepseek-chat",
        tools: tools,
        tool_choice: "auto",
        stream: false
    });

    let aiResponse;
    if (completion && completion.choices && completion.choices.length > 0 && completion.choices[0].message) {
        aiResponse = completion.choices[0].message;
    } else {
        const errorMessage = "DeepSeek API 响应中缺少有效的消息内容";
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    const currentSessionId = state.conversationHistory.length > 0
        ? state.conversationHistory[0].sessionId // 始终使用第一个消息的 sessionId 作为当前会话的 sessionId
        : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; // 兜底，理论上不会走到这里
    console.log(`[DeepSeek.js] chatWithDeepSeek - 确定当前会话 sessionId: ${currentSessionId}`);

    // 将 DeepSeek 的原始响应（无论是否包含 tool_calls）添加到 conversationHistory
    // 确保 content 字段存在，即使为空也赋为 null
    state.conversationHistory.push({
        role: "assistant",
        content: aiResponse.content || null,
        tool_calls: aiResponse.tool_calls || null,
        sessionId: currentSessionId // 关联 sessionId
    });

    let assistantContent = aiResponse.content || null;
    let assistantText = aiResponse.content || '[无内容]';
    let assistantToolCalls = aiResponse.tool_calls || null;

    // 检查是否存在 end_task 工具调用，并提取 final_message 作为 AI 的回复内容
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
 
    // Step 1: 如果 aiResponse 包含文本内容，无论是否有工具调用，都先发送文本给前端
    if (assistantContent && assistantContent !== '[无内容]') { // 确保有实际内容才发送
        let contentToSend = assistantContent;
        // 移除可能包含的 JSON 代码块标记
        contentToSend = contentToSend.replace(/```json[\s\S]*?```\s*<｜tool call end｜>\s*<｜tool calls end｜>|<｜tool calls begin｜>[\s\S]*?<｜tool calls end｜>/g, '').trim();
        if (contentToSend) {
            _sendAiResponseToFrontend('text', contentToSend);
        }
    }

    // Step 2: 然后再处理工具调用
    if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
        for (const toolCall of aiResponse.tool_calls) {
            const toolName = toolCall.function.name;
            let toolArgs;
            try {
                toolArgs = JSON.parse(toolCall.function.arguments);
            } catch (e) {
                console.error(`解析工具参数失败: ${e.message}`);
                toolArgs = {};
            }

            // end_task 和 ask_user_question 特殊处理，它们是立即执行的
            if (toolName === "ask_user_question") {
                const question = toolArgs.question;
                const options = toolArgs.options || [];
                _sendAiResponseToFrontend('ask_user_question', { question, options, toolCallId: toolCall.id });
                // 记录完整对话历史
                const deepseekCompatibleMessagesForLog = state.conversationHistory.filter(msg => msg.sessionId === currentSessionId).map(msg => ({
                    role: msg.role,
                    content: msg.content,
                    ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
                    ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
                    ...(msg.name && { name: msg.name })
                }));
                await logger.logDeepSeekConversation(currentSessionId);
                return { type: 'processed', payload: 'AI 响应已处理' };

            } else {
                // 对于其他工具，添加到 state.pendingToolCalls 数组
                state.pendingToolCalls.push({
                    toolCallId: toolCall.id,
                    toolName: toolName,
                    toolArgs: toolArgs,
                    aiExplanation: `AI 建议执行 ${toolName} 操作。`,
                    status: 'pending',
                    result: null,
                    sessionId: currentSessionId // 新增 sessionId 字段
                });
            }
        }
        
        if (state.pendingToolCalls.length > 0) {
            _sendAiResponseToFrontend('tool_suggestions', state.pendingToolCalls);
            // 这里不再返回 aiResponse，因为 aiResponse 已经添加到 conversationHistory
            return {
                type: 'pending_tools',
                payload: { sessionId: currentSessionId } // 仅返回 sessionId
            };
        }
    }
    
    // 如果没有工具调用且没有文本内容，并且 pendingToolCalls 也为空，则认为 DeepSeek 没有给出明确回复。
    // 在这里，assistantContent 已经被处理过了，所以只需要检查 pendingToolCalls 即可
    if (!assistantContent && state.pendingToolCalls.length === 0) {
        _sendAiResponseToFrontend('error', 'DeepSeek 没有给出明确的回复或工具调用。');
    }

    // 统一日志记录，确保在所有分支结束后记录
    const deepseekCompatibleMessagesForLog = state.conversationHistory.filter(msg => msg.sessionId === currentSessionId).map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
        ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
        ...(msg.name && { name: msg.name })
    }));
    await logger.logDeepSeekConversation(currentSessionId);

    return { type: 'processed', payload: 'AI 响应已处理' };
    
  } catch (error) {
    console.error(`[DeepSeek] 处理消息时出错: ${error.message}`);
    // 确保错误也被发送到前端
    _sendAiResponseToFrontend('error', `处理消息时出错: ${error.message}`);
    throw error;
  }
}
 
// 将工具执行结果发送给 DeepSeek
async function sendToolResultToDeepSeek(toolResultsArray) { // 移除 messagesBeforeToolCall 参数
    try {
        const openaiClient = getOpenAIClient();
        if (!openaiClient) {
            console.warn('[DeepSeek] sendToolResultToDeepSeek: API Key 未设置，无法进行工具结果处理。');
            return { type: 'error', payload: 'DeepSeek API Key 未设置，无法进行工具结果处理。' };
        }
 
        // 步骤 1: 将当前工具执行结果转换为 'tool' 消息格式
        const toolMessages = toolResultsArray.map(item => ({
            role: "tool",
            tool_call_id: item.toolCallId,
            name: item.toolName,
            content: JSON.stringify(item.result)
        }));

        // 步骤 2: 将 'tool' 消息添加到全局对话历史中，以确保历史记录的完整性
        state.conversationHistory.push(...toolMessages);
 
        // 步骤 3: 基于更新后的完整历史记录构建发送给 API 的消息数组
        // 注意：这里不再需要手动添加 system message，因为它应该只在对话开始时由 chatWithDeepSeek 添加
        const messagesToSend = [
            ...state.conversationHistory
        ];
 
        console.log(`[DeepSeek.js] sendToolResultToDeepSeek - 准备发送给 DeepSeek 的消息:`, JSON.stringify(messagesToSend, null, 2));
 
        const completion = await openaiClient.chat.completions.create({
            messages: messagesToSend,
            model: "deepseek-chat",
            tools: tools,
            tool_choice: "auto",
            stream: false
        });
        
        const aiResponse = completion.choices[0].message;
        console.log('sendToolResultToDeepSeek: DeepSeek 原始响应 (aiResponse):', JSON.stringify(aiResponse, null, 2));

        // 获取当前会话的 sessionId（从 state.conversationHistory 的第一个消息中获取，或者从 toolResultsArray 中第一个工具的 sessionId 获取）
        const currentSessionId = state.conversationHistory.length > 0
            ? state.conversationHistory[0].sessionId
            : (toolResultsArray.length > 0 ? toolResultsArray[0].sessionId : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

        // 将 DeepSeek 的原始响应（无论是否包含 tool_calls）添加到 conversationHistory
        state.conversationHistory.push({
            role: "assistant",
            content: aiResponse.content || null,
            tool_calls: aiResponse.tool_calls || null,
            sessionId: currentSessionId // 关联 sessionId
        });
 
        let assistantContent = aiResponse.content || null;
        let assistantToolCalls = aiResponse.tool_calls || null;
        let assistantText = aiResponse.content || '[无内容]';
 
        // 检查是否存在 end_task 工具调用，并提取 final_message 作为 AI 的回复内容
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
 
 
        // 处理文本响应
        if (assistantText && assistantText !== '[无内容]') {
            let contentToSend = assistantText;
            contentToSend = contentToSend.replace(/```json[\s\S]*?```\s*<｜tool call end｜>\s*<｜tool calls end｜>|<｜tool calls begin｜>[\s\S]*?<｜tool calls end｜>/g, '').trim();
            if (contentToSend) {
                _sendAiResponseToFrontend('text', contentToSend);
            }
        }
 
        // 处理新的工具调用
        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
            for (const toolCall of aiResponse.tool_calls) {
                console.log(`[main.js] sendToolResultToDeepSeek: 收到工具调用 ID: "${toolCall.id}", Name: "${toolCall.function.name}"`);
                console.log(`[main.js] sendToolResultToDeepSeek: 原始工具参数字符串: "${toolCall.function.arguments}"`);
                const toolName = toolCall.function.name;
                let toolArgs;
                try {
                    toolArgs = JSON.parse(toolCall.function.arguments);
                    console.log(`[main.js] sendToolResultToDeepSeek: 解析后的工具参数:`, toolArgs);
                } catch (e) {
                    console.error(`[main.js] sendToolResultToDeepSeek: 解析工具参数失败 (toolCallId: ${toolCall.id}):`, e);
                    toolArgs = {};
                }
                
                // 特殊处理end_task工具
                if (toolName === "end_task") {
                    const finalMessage = toolArgs.final_message || "任务已完成。";
                    _sendAiResponseToFrontend('end_task', finalMessage);
                    
                    // BUG修复：为 end_task 添加对应的 tool 消息，以确保上下文完整
                    state.conversationHistory.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: "end_task",
                        content: JSON.stringify({ success: true, message: "任务已结束。" })
                    });
                    
                    // 在添加了所有消息后，再记录日志
                    await logger.logDeepSeekConversation(currentSessionId);

                    return { type: 'processed', payload: 'AI 响应已处理' }; // 立即返回
                }
                // 特殊处理ask_user_question工具
                else if (toolName === "ask_user_question") {
                    const question = toolArgs.question;
                    const options = toolArgs.options || [];
                    _sendAiResponseToFrontend('ask_user_question', { question, options, toolCallId: toolCall.id });
                    return { type: 'processed', payload: 'AI 响应已处理' }; // 立即返回
                }
                // 其他工具
                else {
                    state.pendingToolCalls.push({
                        toolCallId: toolCall.id,
                        toolName: toolName,
                        toolArgs: toolArgs,
                        aiExplanation: `AI 建议执行 ${toolName} 操作。`,
                        status: 'pending',
                        result: null,
                        sessionId: currentSessionId // 继承当前会话的 sessionId
                    });
                }
            }
            
            if (state.pendingToolCalls.length > 0) {
                _sendAiResponseToFrontend('tool_suggestions', state.pendingToolCalls);
                console.log('[main.js] sendToolResultToDeepSeek: 强制发送 tool_suggestions 更新 UI，包含所有 pendingToolCalls。');
                return { type: 'pending_tools', payload: '有待处理的工具建议，已强制更新 UI。' };
            }
        }
        
        // 如果没有工具调用且没有文本内容，并且 pendingToolCalls 也为空，则认为 DeepSeek 没有给出明确回复。
        if (!assistantContent && state.pendingToolCalls.length === 0) {
            _sendAiResponseToFrontend('error', 'DeepSeek 没有给出明确的回复或工具调用。');
        }
            
    } catch (error) {
        console.error("sendToolResultToDeepSeek: 再次调用 DeepSeek API 失败:", error);
        if (error.response && error.response.data) {
            console.error("sendToolResultToDeepSeek: DeepSeek API 错误详情:", error.response.data);
            _sendAiResponseToFrontend('error', `AI 反馈失败: ${error.message} (${JSON.stringify(error.response.data)})`);
        } else {
            _sendAiResponseToFrontend('error', `AI 反馈失败: ${error.message}`);
        }
        throw error; // 抛出错误以便上层捕获
    }
    // 在所有分支处理完毕后，统一记录日志
    await logger.logDeepSeekConversation(currentSessionId);
    return { type: 'processed', payload: 'AI 响应已处理' };
}
