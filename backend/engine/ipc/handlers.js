const { ipcMain } = require('electron');
const logger = require('../../../frontend/mvp/utils/logger');
const deepseek = require('../api/deepseek');
let serviceRegistry = null;
const path = require('path');

// 新增：清空 DeepSeek 对话历史
const handleClearDeepSeekConversation = async () => {
    state.conversationHistory = []; // 清空对话历史
    deepseek.resetResponseCount(); // 重置 DeepSeek 的响应计数器
    console.log('[handlers.js] DeepSeek 对话历史已清空，响应计数器已重置。');
    return { success: true, message: 'DeepSeek 对话历史已清空。' };
};
const fs = require('fs').promises;
const toolExecutor = require('../../tool-service/tools/executor');
const tools = require('../../tool-service/tools/definitions'); // 引入 tools 定义，用于 send-user-response
const { state, setMainWindow } = require('../../state-manager'); // 从 state-manager.js 导入 state 和 setMainWindow
const { getFileTree } = require('../../utils/file-tree-builder'); // 引入文件树构建工具

// 辅助函数：生成唯一的文件或文件夹名称
const generateUniqueName = async (targetDir, originalFullName, isFolder) => {
    let baseName = path.basename(originalFullName, path.extname(originalFullName));
    let extName = isFolder ? '' : path.extname(originalFullName);
    let counter = 0;
    let uniqueName = originalFullName;
    let newFullPath;

    while (true) {
        let currentTryName;
        if (counter === 0) {
            currentTryName = originalFullName;
        } else {
            currentTryName = `${baseName}-副本${counter}${extName}`;
        }
        newFullPath = path.join(targetDir, currentTryName);

        try {
            await fs.access(newFullPath, fs.constants.F_OK);
            // 如果文件或目录存在，则继续尝试下一个副本
            counter++;
        } catch (e) {
            // 如果文件或目录不存在，则找到唯一名称
            uniqueName = currentTryName;
            break;
        }
    }
    return uniqueName;
};

// 检查并自动发送批量结果
const checkAndAutoSendBatchResults = async () => {
    console.log(`[main.js] checkAndAutoSendBatchResults: 开始检查。当前 pendingToolCalls 长度: ${state.pendingToolCalls.length}`);
    const allProcessed = state.pendingToolCalls.every(tool =>
        tool.status === 'executed' ||
        tool.status === 'failed' ||
        tool.status === 'rejected'
    );

    if (allProcessed && state.pendingToolCalls.length > 0) {
        // 1. 将所有已处理的工具保存起来，以便发送给 DeepSeek
        const completedTools = state.pendingToolCalls.filter(tool =>
            tool.status === 'executed' || tool.status === 'failed' || tool.status === 'rejected'
        );

        // 2. 清空 state.pendingToolCalls，并发送 batch_processing_complete 事件给前端
        //    这确保了立即清空 UI
        state.pendingToolCalls = [];
        deepseek._sendAiResponseToFrontend('batch_processing_complete', null);
        console.log('[main.js] 所有本轮工具都已处理完毕，pendingToolCalls 已清空，batch_processing_complete 已发送。');

        try {
            // 3. 将这些已处理工具的结果发送给 DeepSeek
            const resultsToSend = completedTools.map(tool => ({
                toolCallId: tool.toolCallId,
                toolName: tool.toolName,
                result: tool.result,
                sessionId: tool.sessionId // 确保 sessionId 被传递
            }));
            
            console.log('[main.js] 准备调用 sendToolResultToDeepSeek 发送批量结果。');
            console.log('[main.js] 准备调用 sendToolResultToDeepSeek 发送批量结果。');
            const deepseekResponseResult = await deepseek.sendToolResultToDeepSeek(resultsToSend);
            
            // deepseek.sendToolResultToDeepSeek 会将新的 pending_tools 添加到 state.pendingToolCalls
            // 如果 DeepSeek 返回了新的 pending_tools，它们应该已经被添加到 state.pendingToolCalls
            if (deepseekResponseResult.type === 'pending_tools' && state.pendingToolCalls.length > 0) {
                console.log('[main.js] DeepSeek 返回了新的 pending_tools，强制发送 tool_suggestions 更新 UI。');
                deepseek._sendAiResponseToFrontend('tool_suggestions', state.pendingToolCalls);
            } else if (deepseekResponseResult.type !== 'pending_tools') {
               console.log('[main.js] DeepSeek 没有返回新的 pending_tools。');
            }


        } catch (error) {
            console.error('[main.js] 自动批量工具结果反馈失败:', error);
            deepseek._sendAiResponseToFrontend('error', `自动批量反馈失败: ${error.message}`);
        }
    } else if (state.pendingToolCalls.length === 0) {
        // 如果 pendingToolCalls 为空，初始状态或所有工具都已通过上述逻辑处理并清空
        console.log('[main.js] pendingToolCalls 为空，无需处理。');
        // 确保 UI 也是空的，虽然上面已经发送了 batch_processing_complete
        deepseek._sendAiResponseToFrontend('batch_processing_complete', null);
    } else {
        // 仍有待处理的工具，等待用户操作或工具执行完成。
        console.log('[main.js] 仍有待处理的工具，等待用户操作或工具执行完成。当前状态:', state.pendingToolCalls.map(t => ({ id: t.toolCallId, status: t.status })));
    }
};

// 处理工具取消请求
const handleCancelTool = async (event, toolName, toolArgs, toolCallId) => {
    console.log(`收到取消工具请求: ${toolName}，参数:`, toolArgs);
    let toolToUpdate = state.pendingToolCalls.find(t => t.toolCallId === toolCallId);
    if (toolToUpdate) {
        toolToUpdate.status = 'cancelled';
        toolToUpdate.result = { success: false, error: `用户取消了 ${toolName} 操作。` };
    }
    await checkAndAutoSendBatchResults();
    return { success: true, message: `已取消 ${toolName} 操作。` };
};

// 处理单个工具动作
const handleProcessToolAction = async (event, toolCallId, action) => {
    console.log(`[handlers.js] 收到 'process-tool-action' 请求。toolCallId: ${toolCallId}, action: ${action}`);
    console.log(`[handlers.js] 当前 pendingToolCalls (${state.pendingToolCalls.length} 个):`, JSON.stringify(state.pendingToolCalls.map(t => ({ id: t.toolCallId, name: t.toolName, status: t.status })), null, 2));
    // 添加调试信息
    logger.writeLog(`[debug] handlers.js: handleProcessToolAction 被调用。action: ${action}`);
    console.log(`[handlers.js] handleProcessToolAction: typeof logger.writeLog = ${typeof logger.writeLog}`);
    console.log(`[handlers.js] handleProcessToolAction: typeof require('fs') = ${typeof require('fs')}`);
    
    let toolToProcess = state.pendingToolCalls.find(t => t.toolCallId === toolCallId);
    if (!toolToProcess) {
        console.warn(`未找到 toolCallId 为 ${toolCallId} 的待处理工具。`);
        return { success: false, message: '未找到指定工具。' };
    }

    if (action === 'approve') {
        deepseek._sendAiResponseToFrontend('tool_action_status', { toolCallId, status: 'executing', message: `工具 ${toolToProcess.toolName} 正在执行...` });
        if (!serviceRegistry) {
            serviceRegistry = require('../../service-registry').getServices();
        }
        
        const executionResult = await toolExecutor.performToolExecution(
            toolToProcess.toolCallId,
            toolToProcess.toolName,
            toolToProcess.toolArgs,
            state.mainWindow,
            serviceRegistry.toolService
        );
        toolToProcess.status = executionResult.result.success ? 'executed' : 'failed';
        toolToProcess.result = executionResult.result;
    } else if (action === 'reject') {
        toolToProcess.status = 'rejected';
        toolToProcess.result = { success: false, error: `用户拒绝了 ${toolToProcess.toolName} 操作。` };
        deepseek._sendAiResponseToFrontend('tool_action_status', { toolCallId, status: 'rejected', message: `工具 ${toolToProcess.toolName} 已被拒绝。` });
    } else {
        console.warn(`未知的工具动作: ${action}`);
        return { success: false, message: '未知的工具动作。' };
    }

    await checkAndAutoSendBatchResults();
    return { success: true, message: `工具 ${toolToProcess.toolName} 动作已处理。` };
};

// 处理批量工具动作
const handleProcessBatchAction = async (event, action) => {
    console.log(`[main.js] 收到 'process-batch-action' 请求。action: ${action}`);
    console.log(`[main.js] 当前 pendingToolCalls (${state.pendingToolCalls.length} 个):`, JSON.stringify(state.pendingToolCalls.map(t => ({ id: t.toolCallId, name: t.toolName, status: t.status })), null, 2));
    let toolsToProcess = state.pendingToolCalls.filter(tool => tool.status === 'pending');
    
    if (toolsToProcess.length === 0) {
        console.log('没有待处理的工具进行批量操作。');
        return { success: false, message: '没有待处理的工具。' };
    }

    if (action === 'approve_all') {
        deepseek._sendAiResponseToFrontend('batch_action_status', { status: 'executing_all', message: `正在批量执行所有待处理工具...` });
        for (const tool of toolsToProcess) {
            if (!serviceRegistry) {
                serviceRegistry = require('../../service-registry').getServices();
            }
            
            const executionResult = await toolExecutor.performToolExecution(
                tool.toolCallId,
                tool.toolName,
                tool.toolArgs,
                state.mainWindow,
                serviceRegistry.toolService
            );
            tool.status = executionResult.result.success ? 'executed' : 'failed';
            tool.result = executionResult.result;
        }
    } else if (action === 'reject_all') {
        for (const tool of toolsToProcess) {
            tool.status = 'rejected';
            tool.result = { success: false, error: `用户批量拒绝了 ${tool.toolName} 操作。` };
        }
        deepseek._sendAiResponseToFrontend('batch_action_status', { status: 'rejected_all', message: `所有待处理工具已被批量拒绝。` });
    } else {
        console.warn(`未知的批量工具动作: ${action}`);
        return { success: false, message: '未知的批量工具动作。' };
    }

    await checkAndAutoSendBatchResults();
    return { success: true, message: `批量工具动作 '${action}' 已处理。` };
};

// 处理批量工具结果反馈请求
const handleSendBatchToolResults = async (event, processedTools) => {
    console.log('收到批量工具结果反馈请求:', processedTools);
    try {
        const deepseekResponseResult = await deepseek.sendToolResultToDeepSeek(processedTools);
        state.pendingToolCalls = [];
        deepseek._sendAiResponseToFrontend('batch_processing_complete', null);
        return { success: true, message: '批量工具结果已成功反馈给 AI。' };
    } catch (error) {
        console.error('批量工具结果反馈失败:', error);
        deepseek._sendAiResponseToFrontend('error', `批量反馈失败: ${error.message}`);
        return { success: false, message: `批量工具结果反馈失败: ${error.message}` };
    }
};

// 处理用户命令
const handleProcessCommand = async (event, command, allMessagesFromFrontend) => {
    console.log(`[handlers.js] handleProcessCommand: 收到命令: ${command}`);
    console.log(`[handlers.js] handleProcessCommand: 收到前端所有消息:`, allMessagesFromFrontend);

    // 如果有未处理的工具建议，提醒用户先处理
    if (state.pendingToolCalls.length > 0) {
        deepseek._sendAiResponseToFrontend('warning', '您有未处理的工具建议。请先批准或拒绝它们，或等待它们自动处理完成，然后再发送新命令。');
        return { type: 'warning', payload: '有未处理的工具建议。' };
    }

    // --- 对话历史管理的最终修复版本 ---
    // --- 修复加载历史会话后上下文丢失的问题 ---
    const latestMessage = allMessagesFromFrontend[allMessagesFromFrontend.length - 1];
    let incomingSessionId = latestMessage.sessionId;

    // 如果最新消息的 sessionId 为 null，尝试从第一个用户消息获取，或者生成新的
    if (!incomingSessionId) {
        const firstUserMessage = allMessagesFromFrontend.find(msg => msg.role === 'user');
        if (firstUserMessage && firstUserMessage.sessionId) {
            incomingSessionId = firstUserMessage.sessionId;
        } else {
            incomingSessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            console.warn(`[handlers.js] 无法从前端消息中获取有效的 sessionId，生成新的 sessionId: ${incomingSessionId}`);
        }
    }

    // 判断是否需要从前端同步/水合后端的历史记录
    // 条件：1. 后端历史为空。 2. 后端历史的会话ID与新消息的会话ID不匹配。
    if (state.conversationHistory.length === 0 || state.conversationHistory[0].sessionId !== incomingSessionId) {
        console.log(`[handlers.js] 检测到新会话或历史会话加载。从前端同步历史记录。Session ID: ${incomingSessionId}`);
        // 使用前端发送的完整历史来替换后端的历史
        // 注意：需要过滤掉前端特有的字段（如 sender, text, className）
        state.conversationHistory = allMessagesFromFrontend.map(msg => ({
            role: msg.role,
            content: msg.content,
            tool_calls: msg.tool_calls,
            tool_call_id: msg.tool_call_id,
            name: msg.name,
            // 确保每个消息都带有正确的 sessionId
            sessionId: msg.sessionId || incomingSessionId // 如果 msg.sessionId 为 null，则使用 incomingSessionId
        }));
        state.pendingToolCalls = []; // 重置待处理工具
        deepseek.resetResponseCount(); // 重置响应计数
    } else {
        // 如果是同一个会话，则只追加最新的用户消息
        console.log(`[handlers.js] 延续当前会话 (ID: ${incomingSessionId})。追加新消息。`);
        state.conversationHistory.push({
            role: 'user',
            content: latestMessage.content,
            sessionId: incomingSessionId // 确保追加的消息带有正确的 sessionId
        });
    }
    
    // 2. 调用 deepseek.chatWithDeepSeek
    console.log(`[handlers.js] handleProcessCommand: 调用 chatWithDeepSeek 前 conversationHistory 长度: ${state.conversationHistory.length}`);
    console.log(`[handlers.js] handleProcessCommand: 实际发送给 DeepSeek 的历史 (最后两条):`, state.conversationHistory.slice(-2));

    const aiResult = await deepseek.chatWithDeepSeek();

    if (aiResult.type === 'pending_tools') {
        console.log('chatWithDeepSeek 返回 pending_tools，主进程等待用户操作。');
        // 移除 state.pendingDeepSeekResponse 的存储，deepseek.js 内部已处理
        return { success: true, message: '等待用户对工具建议进行操作。' };
    }
    
};
 
// 处理用户回复 (针对 ask_user_question)
const handleSendUserResponse = async (event, userResponse, toolCallId) => {
    console.log(`收到用户回复：${userResponse}，关联 toolCallId: ${toolCallId}`);

    // 幂等性检查：防止因前端事件重复触发而多次处理同一个工具回复
    const alreadyProcessed = state.conversationHistory.some(msg => msg.role === 'tool' && msg.tool_call_id === toolCallId);
    if (alreadyProcessed) {
        console.warn(`[handlers.js] 检测到对 toolCallId: ${toolCallId} 的重复回复。已忽略。`);
        return;
    }

    try {
        const toolResultsArray = [{
            toolCallId: toolCallId,
            toolName: "ask_user_question",
            result: userResponse // 用户回复作为工具结果
        }];
        await deepseek.sendToolResultToDeepSeek(toolResultsArray);

    } catch (error) {
        console.error("处理用户回复后再次调用 DeepSeek API 失败:", error);
        deepseek._sendAiResponseToFrontend('error', `处理用户回复后 AI 反馈失败: ${error.message}`);
    }
};


const getChaptersAndUpdateFrontend = async (mainWindow) => {
    const novelDirPath = path.join(__dirname, '../../../novel');
    try {
        await fs.mkdir(novelDirPath, { recursive: true }).catch(() => {}); // 确保目录存在
        const fileTreeResult = await getFileTree('novel'); // 使用新的文件树构建函数
        let chapters = [];
        if (fileTreeResult.success) {
            // 将文件树的 children 数组作为 chapters 返回
            // 注意：getFileTree 返回的根是 'novel' 目录，我们只需要其子项
            chapters = fileTreeResult.tree;
        } else {
            console.warn(`[handlers.js] 从 file-tree-builder 获取文件树失败: ${fileTreeResult.error}`);
        }

        if (mainWindow && mainWindow.webContents) {
            const payloadToSend = { success: true, chapters };
            console.log(`[handlers.js] 准备发送 chapters-updated 事件。mainWindow.isDestroyed()=${mainWindow.isDestroyed()}, payload类型: ${typeof payloadToSend}, payload.chapters类型: ${typeof payloadToSend.chapters}, payload.chapters是否数组: ${Array.isArray(payloadToSend.chapters)}, 章节数量: ${payloadToSend.chapters.length}, payload JSON长度: ${JSON.stringify(payloadToSend).length}`);
            // 确保 mainWindow 和 webContents 存在，且窗口未被销毁
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
                mainWindow.webContents.send('chapters-updated', JSON.stringify(payloadToSend)); // 尝试发送JSON字符串
                console.log('[handlers.js] 已发送 chapters-updated 事件 (JSON 字符串模式)。');
            } else {
                console.warn('[handlers.js] 尝试发送 chapters-updated 事件时 mainWindow 或 webContents 不可用，或窗口已销毁。');
            }
        }
        return { success: true, chapters }; // 也返回给调用者
    } catch (error) {
        console.error('[handlers.js] 获取章节列表并更新前端失败:', error);
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('chapters-updated', { success: false, error: error.message });
        }
        return { success: false, error: error.message };
    }
};

// 处理获取章节列表请求 (供渲染进程直接调用，例如首次加载)
const handleGetChapters = async () => {
    return await getChaptersAndUpdateFrontend(state.mainWindow); // 复用逻辑，并确保通过 mainWindow 发送
};

// 处理加载章节内容请求
const handleLoadChapterContent = async (event, chapterId) => {
    const novelDirPath = path.join(__dirname, '../../../novel');
    const chapterFilePath = path.join(novelDirPath, chapterId); // chapterId 已经是相对路径
    console.log(`[handlers.js] handleLoadChapterContent: 尝试加载文件: ${chapterFilePath}`);
    try {
        const content = await fs.readFile(chapterFilePath, 'utf8');
        console.log(`[handlers.js] handleLoadChapterContent: 章节 '${chapterId}' 内容长度: ${content.length}`);
        console.log(`[handlers.js] handleLoadChapterContent: 章节内容前50字符: '${content.substring(0, 50)}...'`);
        return { success: true, content };
    } catch (error) {
        console.error(`[handlers.js] 加载章节内容失败: ${chapterId}`, error);
        return { success: false, error: error.message };
    }
};

// 处理渲染进程注册监听器的请求
const handleRegisterRendererListeners = (event) => {
  console.log('[handlers.js] Renderer process requests main process to register listeners.');
  // 这里可以添加任何需要注册的监听器，或者验证是否已注册
};

// 处理创建新章节请求
const handleCreateChapter = async (event, chapterTitle) => { // 这个名字有点歧义，现在主要用于创建文件
    const novelDirPath = path.join(__dirname, '../../../novel');
    // 确保novel目录存在
    await fs.mkdir(novelDirPath, { recursive: true }).catch(() => {}); // 忽略目录已存在的错误

    const chapterFilePath = path.join(novelDirPath, chapterTitle);
    try {
        await fs.writeFile(chapterFilePath, ''); // 创建空文件
        await getChaptersAndUpdateFrontend(state.mainWindow); // 创建成功后更新前端
        return { success: true, message: `章节 '${chapterTitle}' 创建成功` };
    } catch (error) {
        console.error(`[handlers.js] 创建章节失败: ${chapterTitle}`, error);
        return { success: false, error: error.message };
    }
};

// 新增：处理创建文件夹请求
const handleCreateFolder = async (event, folderPathInput) => {
    const novelRootPath = path.join(__dirname, '../../../novel');
    const parentDir = path.dirname(folderPathInput); // 获取父目录
    const folderName = path.basename(folderPathInput); // 获取文件夹名

    const targetDir = path.join(novelRootPath, parentDir);

    await fs.mkdir(targetDir, { recursive: true }).catch(() => {});

    // 使用 generateUniqueName 来获取最终的文件夹名
    const finalUniqueFolderName = await generateUniqueName(targetDir, folderName, true); // true 表示是文件夹
    const fullPath = path.join(targetDir, finalUniqueFolderName);

    try {
        await fs.mkdir(fullPath, { recursive: true });
        await getChaptersAndUpdateFrontend(state.mainWindow);
        return { success: true, message: `文件夹 '${path.relative(novelRootPath, fullPath).replace(/\\/g, '/')}' 创建成功` };
    } catch (error) {
        console.error(`[handlers.js] 创建文件夹失败: ${folderPathInput}`, error);
        return { success: false, error: error.message };
    }
};

// 处理创建新小说文件请求
const handleCreateNovelFile = async (event, { title, content, parentPath = '' }) => { // 实际创建文件 IPC
    const novelRootPath = path.join(__dirname, '../../../novel');
    const targetDir = parentPath ? path.join(novelRootPath, parentPath) : novelRootPath;

    // 确保目标目录存在
    await fs.mkdir(targetDir, { recursive: true }).catch(() => {}); // 忽略目录已存在的错误

    // 使用 generateUniqueName 来获取最终的文件名
    // 注意：这里的 title 已经是前端传递过来的，可能是“Untitled.txt”或“未命名.txt”
    // generateUniqueName 内部会处理文件名和拓展名的分离
    const finalUniqueFileName = await generateUniqueName(targetDir, title, false); // false 表示是文件
    const newFilePath = path.join(targetDir, finalUniqueFileName);

    try {
        await fs.writeFile(newFilePath, content, 'utf8');
        // 创建成功后更新前端章节列表
        // 移除主动更新前端章节列表的调用，改为依赖前端统一的更新机制
        // console.log(`[handlers.js] handleCreateNovelFile: 调用 getChaptersAndUpdateFrontend 前 state.mainWindow 是否可用: ${!!state.mainWindow}`);
        // await getChaptersAndUpdateFrontend(state.mainWindow);
        // console.log(`[handlers.js] handleCreateNovelFile: 调用 getChaptersAndUpdateFrontend 后 state.mainWindow 是否可用: ${!!state.mainWindow}`);
        // 构建返回给前端的相对路径，例如 novel/folder/file.txt
        const relativeFilePath = path.relative(novelRootPath, newFilePath).replace(/\\/g, '/');

        // 加载新创建的文件内容并返回
        const loadedContentResult = await handleLoadChapterContent(null, relativeFilePath); // 第一个参数 null 是因为没有 event 对象
        if (loadedContentResult.success) {
            return {
                success: true,
                newFilePath: relativeFilePath, // 返回完整相对路径，不加 'novel/' 前缀
                content: loadedContentResult.content, // 返回新文件的内容
                message: `文件 '${relativeFilePath}' 创建成功并已加载`
            };
        } else {
            // 如果加载失败，仍然返回创建成功的信息，但没有内容
            return {
                success: true,
                newFilePath: relativeFilePath,
                content: '', // 无法加载内容，返回空字符串
                message: `文件 '${relativeFilePath}' 创建成功，但加载失败: ${loadedContentResult.error}`
            };
        }
    } catch (error) {
        console.error(`[handlers.js] 创建小说文件失败: ${newFilePath}`, error);
        return { success: false, error: error.message };
    }
};

// 处理删除章节请求
const handleDeleteItem = async (event, itemId) => {
    const itemPath = path.join(__dirname, '../../../novel', itemId);
    try {
        const stats = await fs.stat(itemPath);
        if (stats.isDirectory()) {
            await fs.rm(itemPath, { recursive: true, force: true }); // 删除目录及其内容
            return { success: true, message: `文件夹 '${itemId}' 及其内容删除成功` };
        } else {
            await fs.unlink(itemPath); // 删除文件
            return { success: true, message: `文件 '${itemId}' 删除成功` };
        }
    } catch (error) {
        console.error(`[handlers.js] 删除失败: ${itemId}`, error);
        return { success: false, error: error.message };
    } finally {
        await getChaptersAndUpdateFrontend(state.mainWindow); // 始终更新前端
    }
};

// 处理重命名章节请求
const handleRenameItem = async (event, oldItemId, newItemName) => {
    const novelRootPath = path.join(__dirname, '../../../novel');
    const oldItemPath = path.join(novelRootPath, oldItemId);
    const parentDir = path.dirname(oldItemPath); // 目标文件夹

    let isFolder = false;
    try {
        const stats = await fs.stat(oldItemPath);
        isFolder = stats.isDirectory();
    } catch (error) {
        console.error(`[handlers.js] 重命名项目时获取源项目信息失败: ${oldItemId}`, error);
        return { success: false, error: `源项目不存在或无法访问: ${error.message}` };
    }

    // 使用 generateUniqueName 生成唯一的名称
    const uniqueNewItemName = await generateUniqueName(parentDir, newItemName, isFolder);
    const newItemPath = path.join(parentDir, uniqueNewItemName);

    try {
        await fs.rename(oldItemPath, newItemPath);
        await getChaptersAndUpdateFrontend(state.mainWindow); // 始终更新前端
        // 返回新的相对路径，以便前端更新当前文件
        const relativeNewItemPath = path.relative(novelRootPath, newItemPath).replace(/\\/g, '/');
        return { success: true, message: `项目 '${oldItemId}' 已重命名为 '${uniqueNewItemName}'`, newFilePath: relativeNewItemPath };
    } catch (error) {
        console.error(`[handlers.js] 重命名失败: ${oldItemId} -> ${newItemName}`, error);
        return { success: false, error: error.message };
    }
};

// 辅助函数：递归复制
const copyRecursive = async (src, dest) => {
    const stats = await fs.stat(src);
    if (stats.isDirectory()) {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src);
        for (const entry of entries) {
            await copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        await fs.copyFile(src, dest);
    }
};

// 处理复制项目请求
const handleCopyItem = async (event, sourceId, targetFolderId) => {
    const novelRootPath = path.join(__dirname, '../../../novel');
    const sourcePath = path.join(novelRootPath, sourceId);
    
    // 确保 targetFolderId 为空时目标目录是 novel 根目录
    const targetFolderPath = targetFolderId ? path.join(novelRootPath, targetFolderId) : novelRootPath;
    
    // 获取源文件/文件夹的原始名称（带拓展名）
    const originalBasename = path.basename(sourceId);
    
    // 判断源是文件还是文件夹
    let isFolder = false;
    try {
        const stats = await fs.stat(sourcePath);
        isFolder = stats.isDirectory();
    } catch (error) {
        console.error(`[handlers.js] 复制项目时获取源项目信息失败: ${sourceId}`, error);
        return { success: false, error: `源项目不存在或无法访问: ${error.message}` };
    }

    // 调用 generateUniqueName 生成唯一的名称
    const uniqueTargetName = await generateUniqueName(targetFolderPath, originalBasename, isFolder);
    const newTargetPath = path.join(targetFolderPath, uniqueTargetName);

    try {
        await copyRecursive(sourcePath, newTargetPath);
        await getChaptersAndUpdateFrontend(state.mainWindow); // 更新前端以反映变化
        return { success: true, message: `项目 '${sourceId}' 已成功复制为 '${uniqueTargetName}'` };
    } catch (error) {
        console.error(`[handlers.js] 复制失败: ${sourceId} -> ${newTargetPath}`, error);
        return { success: false, error: error.message };
    }
};

// 处理移动项目请求 (相当于剪切+粘贴)
const handleMoveItem = async (event, sourceId, targetFolderId) => {
    const novelRootPath = path.join(__dirname, '../../../novel');
    const sourcePath = path.join(novelRootPath, sourceId);
    const targetFolderPath = targetFolderId ? path.join(novelRootPath, targetFolderId) : novelRootPath;

    // 获取源文件/文件夹的原始名称（带拓展名）
    const originalBasename = path.basename(sourceId);

    // 判断源是文件还是文件夹
    let isFolder = false;
    try {
        const stats = await fs.stat(sourcePath);
        isFolder = stats.isDirectory();
    } catch (error) {
        console.error(`[handlers.js] 移动项目时获取源项目信息失败: ${sourceId}`, error);
        return { success: false, error: `源项目不存在或无法访问: ${error.message}` };
    }

    // 调用 generateUniqueName 生成唯一的名称
    const uniqueTargetName = await generateUniqueName(targetFolderPath, originalBasename, isFolder);
    const newTargetPath = path.join(targetFolderPath, uniqueTargetName);

    try {
        await fs.rename(sourcePath, newTargetPath); // rename 在同一文件系统内是移动
        await getChaptersAndUpdateFrontend(state.mainWindow); // 更新前端以反映变化
        return { success: true, message: `项目 '${sourceId}' 已成功移动为 '${uniqueTargetName}'` };
    } catch (error) {
        console.error(`[handlers.js] 移动失败: ${sourceId} -> ${newTargetPath}`, error);
        return { success: false, error: error.message };
    }
};

// 处理更新小说文件标题请求
const handleUpdateNovelTitle = async (event, { oldFilePath, newTitle }) => {
    const novelDirPath = path.join(__dirname, '../../../novel');
    const oldFullPath = path.join(novelDirPath, path.basename(oldFilePath)); // 确保只取文件名
    // 清理新标题以确保文件名合法
    const sanitize = (name) => name.replace(/[<>:"/\\|?*]/g, '_');
    const sanitizedNewTitle = sanitize(newTitle);
    const newFullPath = path.join(novelDirPath, `${sanitizedNewTitle}.txt`);

    console.log(`[handlers.js] handleUpdateNovelTitle: 尝试将 '${oldFullPath}' 重命名为 '${newFullPath}'`);
    try {
        await fs.rename(oldFullPath, newFullPath); // 重命名文件
        await getChaptersAndUpdateFrontend(state.mainWindow); // 更新前端章节列表

        return { success: true, newFilePath: `novel/${sanitizedNewTitle}.txt`, message: `文件 '${path.basename(oldFilePath)}' 已重命名为 '${sanitizedNewTitle}.txt'` };
    } catch (error) {
        console.error(`[handlers.js] 更新小说文件标题失败: ${oldFilePath} -> ${newTitle}`, error);
        return { success: false, error: error.message };
    }
};
 
// 处理保存小说文件内容的请求
const handleSaveNovelContent = async (event, filePath, content) => {
    const novelDirPath = path.join(__dirname, '../../../novel');

    // 严谨性检查：确保 filePath 是有效的相对路径且不为空
    if (!filePath || typeof filePath !== 'string' || filePath.trim() === '' || filePath === '未选择') {
        const errorMessage = `文件路径无效: ${filePath}`;
        console.error(`[handlers.js] handleSaveNovelContent: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }

    // 确保 filePath 是相对于 novelDirPath 的路径，不应包含盘符或绝对路径
    // 如果 filePath 包含了 novel/ 前缀，需要移除，以避免路径重复
    let cleanFilePath = filePath.startsWith('novel/') ? filePath.substring(6) : filePath;
    cleanFilePath = cleanFilePath.replace(/\\/g, '/'); // 统一路径分隔符

    const fullPath = path.join(novelDirPath, cleanFilePath); // 正确拼接路径

    console.log(`[handlers.js] handleSaveNovelContent: 尝试保存文件: ${fullPath}`);
    try {
        // 确保文件所在的目录存在
        const dirForFile = path.dirname(fullPath);
        await fs.mkdir(dirForFile, { recursive: true }).catch(() => {});
        
        await fs.writeFile(fullPath, content, 'utf8');
        return { success: true, message: `文件 '${cleanFilePath}' 保存成功` };
    } catch (error) {
        console.error(`[handlers.js] 保存小说文件内容失败: ${fullPath}`, error);
        return { success: false, error: error.message };
    }
};

// 新增：获取 DeepSeek 对话历史
const handleGetDeepSeekChatHistory = async () => {
    console.log('进入 handleGetDeepSeekChatHistory 函数'); // Debug Log A
    try {
        await logger.initialize(); // 确保日志目录存在
        console.log('logger.initialize() 完成'); // Debug Log B
        const historyPath = path.join(path.dirname(__dirname), '../../frontend/mvp/logs/deepseek/history.json');
        console.log(`尝试读取文件路径: ${historyPath}`); // Debug Log C
        console.log('准备读取文件内容'); // Debug Log D
        const fileContent = await fs.readFile(historyPath, 'utf8');
        console.log('文件内容读取成功'); // Debug Log E
        
        if (fileContent.trim() === '') { // 检查文件内容是否为空或只包含空白字符
            console.log('文件内容为空，返回空历史。');
            return [];
        }

        console.log('准备解析 JSON'); // Debug Log F
        const history = JSON.parse(fileContent);
        console.log('JSON 解析成功'); // Debug Log G
        if (!Array.isArray(history)) {
            console.log('读取到的历史不是数组，返回空数组。'); // Debug Log H
            return []; // 如果不是数组，返回空数组
        }
        console.log('成功获取 DeepSeek 对话历史。'); // Debug Log I
        console.log('DeepSeek 对话历史内容:', history); // 新增日志
        return history;
    } catch (error) {
        console.log(`捕获到错误: ${error.code || error.message}`); // Debug Log J
        if (error.code === 'ENOENT') {
            console.log('DeepSeek 历史文件不存在，返回空历史。');
            return [];
        }
        console.error('获取 DeepSeek 对话历史失败:', error);
        return [];
    }
};

// 新增：删除 DeepSeek 对话历史中的某条记录
const handleDeleteDeepSeekChatHistory = async (event, sessionIdToDelete) => {
    try {
        await logger.initialize(); // 确保日志目录存在
        const historyPath = path.join(path.dirname(__dirname), '../../frontend/mvp/logs/deepseek/history.json');
        let history = [];
        try {
            const fileContent = await fs.readFile(historyPath, 'utf8');
            history = JSON.parse(fileContent);
            if (!Array.isArray(history)) {
                history = [];
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('DeepSeek 历史文件不存在，无需删除。');
                return { success: true, message: '历史记录已为空或文件不存在。' };
            }
            throw error; // 其他错误继续抛出
        }

        const initialLength = history.length;
        history = history.filter(conv => conv.sessionId !== sessionIdToDelete);

        if (history.length < initialLength) {
            await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf8');
            return { success: true, message: `已删除会话: ${sessionIdToDelete}` };
        } else {
            return { success: false, message: `未找到会话: ${sessionIdToDelete}` };
        }
    } catch (error) {
        console.error('删除 DeepSeek 对话历史失败:', error);
        return { success: false, error: error.message };
    }
};

// 注册所有IPC处理器
function register(store) { // 添加 store 参数
  console.log('[handlers.js] register: 开始注册 IPC 处理器...');
  ipcMain.handle('cancel-tool', handleCancelTool);
  ipcMain.handle('process-tool-action', handleProcessToolAction);
  ipcMain.handle('process-batch-action', handleProcessBatchAction);
  ipcMain.handle('send-batch-tool-results', handleSendBatchToolResults);
  ipcMain.handle('process-command', handleProcessCommand);
  ipcMain.handle('send-user-response', handleSendUserResponse);
  ipcMain.handle('get-chapters', handleGetChapters); // 注册新的IPC处理器
  ipcMain.handle('load-chapter-content', handleLoadChapterContent); // 注册新的IPC处理器
  ipcMain.handle('register-renderer-listeners', handleRegisterRendererListeners); // 注册新的IPC处理器
  ipcMain.handle('create-chapter', handleCreateChapter); // 注册新的IPC处理器
  ipcMain.handle('create-folder', handleCreateFolder); // 新增：创建文件夹
  ipcMain.handle('create-novel-file', handleCreateNovelFile); // 注册新的IPC处理器
  ipcMain.handle('delete-item', handleDeleteItem); // 修改：删除文件/文件夹
  ipcMain.handle('rename-item', handleRenameItem); // 修改：重命名文件/文件夹
  ipcMain.handle('copy-item', handleCopyItem); // 新增：复制文件/文件夹
  ipcMain.handle('move-item', handleMoveItem); // 新增：移动文件/文件夹 (剪切)
  ipcMain.handle('update-novel-title', handleUpdateNovelTitle); // 注册新的IPC处理器
  console.log('[handlers.js] register: 注册 save-novel-content 处理器...');
  ipcMain.handle('save-novel-content', handleSaveNovelContent); // 注册新的IPC处理器
  ipcMain.handle('get-deepseek-chat-history', handleGetDeepSeekChatHistory); // 新增：获取 DeepSeek 对话历史
  ipcMain.handle('delete-deepseek-chat-history', handleDeleteDeepSeekChatHistory); // 新增：删除 DeepSeek 对话历史
  ipcMain.handle('clear-deepseek-conversation', handleClearDeepSeekConversation); // 新增：清空 DeepSeek 对话历史
  ipcMain.handle('set-store-value', async (event, key, value) => { // 新增：设置存储值
    try {
        store.set(key, value);
        return { success: true, message: `值已保存: ${key}` };
    } catch (error) {
        console.error(`保存值失败: ${key}`, error);
        return { success: false, error: error.message };
    }
  });
}

// 分开导出避免循环引用
exports.register = register;
exports.setMainWindow = setMainWindow;
exports.state = state;
exports.processCommand = handleProcessCommand;
exports.sendUserResponse = handleSendUserResponse;
exports.processToolAction = handleProcessToolAction;
exports.processBatchAction = handleProcessBatchAction;
exports.getChaptersAndUpdateFrontend = getChaptersAndUpdateFrontend; // 导出新函数