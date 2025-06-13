const { ipcMain } = require('electron');
const logger = require('../../utils/logger');
const { getAiChatHistoryFilePath } = require('../../utils/logger'); // 修改
const chatService = require('../chatService'); // 引入 chatService
const { getModelRegistry, initializeModelProvider } = require('../models/modelProvider'); // 修正路径
let serviceRegistry = null;
const path = require('path');

// 新增：清空 DeepSeek 对话历史
const handleClearAiConversation = async () => { // 修改函数名
    state.conversationHistory = [];
    chatService.resetResponseCount();
    console.log('[handlers.js] AI 对话历史已清空，响应计数器已重置。');
    return { success: true, message: 'AI 对话历史已清空。' };
};
const fs = require('fs').promises;
const toolExecutor = require('../../tool-service/tools/executor');
const tools = require('../../tool-service/tools/definitions'); // 引入 tools 定义，用于 send-user-response
const { state, setMainWindow } = require('../../state-manager');
const { getFileTree } = require('../../utils/file-tree-builder');

let storeInstance = null; // 新增：用于 electron-store 实例

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
       chatService._sendAiResponseToFrontend('batch_processing_complete', null);
       console.log('[main.js] 所有本轮工具都已处理完毕，pendingToolCalls 已清空，batch_processing_complete 已发送。');

       // 获取默认模型 ID
       if (!storeInstance) {
           const StoreModule = await import('electron-store');
           const Store = StoreModule.default;
           storeInstance = new Store();
       }
       const defaultModelId = storeInstance.get('defaultAiModel') || 'deepseek-chat';

       try {
           const resultsToSend = completedTools.map(tool => ({
               toolCallId: tool.toolCallId,
               toolName: tool.toolName,
               result: tool.result,
               sessionId: tool.sessionId // 确保 sessionId 被传递
           }));
           
           console.log('[main.js] 准备调用 chatService.sendToolResultToAI 发送批量结果。');
           const aiResponseResult = await chatService.sendToolResultToAI(resultsToSend, defaultModelId);
           
           // chatService.sendToolResultToAI 会将新的 pending_tools 添加到 state.pendingToolCalls
           // 如果 AI 返回了新的 pending_tools，它们应该已经被添加到 state.pendingToolCalls
           if (aiResponseResult.type === 'pending_tools' && state.pendingToolCalls.length > 0) {
               console.log('[main.js] AI 返回了新的 pending_tools，强制发送 tool_suggestions 更新 UI。');
               chatService._sendAiResponseToFrontend('tool_suggestions', state.pendingToolCalls);
           } else if (aiResponseResult.type !== 'pending_tools') {
              console.log('[main.js] AI 没有返回新的 pending_tools。');
           }


        } catch (error) {
            console.error('[main.js] 自动批量工具结果反馈失败:', error);
            chatService._sendAiResponseToFrontend('error', `自动批量反馈失败: ${error.message}`);
        }
    } else if (state.pendingToolCalls.length === 0) {
        // 如果 pendingToolCalls 为空，初始状态或所有工具都已通过上述逻辑处理并清空
        console.log('[main.js] pendingToolCalls 为空，无需处理。');
        // 确保 UI 也是空的，虽然上面已经发送了 batch_processing_complete
        chatService._sendAiResponseToFrontend('batch_processing_complete', null);
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
const handleProcessToolAction = async (event, { toolCallId, actionType }) => { // 更改签名以解构参数
    console.log(`[handlers.js] 收到 'process-tool-action' 请求。toolCallId: ${toolCallId}, actionType: ${actionType}`);
    console.log(`[handlers.js] 当前 pendingToolCalls (${state.pendingToolCalls.length} 个):`, JSON.stringify(state.pendingToolCalls.map(t => ({ id: t.toolCallId, name: t.toolName, status: t.status })), null, 2));
    // 添加调试信息
    logger.writeLog(`[debug] handlers.js: handleProcessToolAction 被调用。actionType: ${actionType}`);
    console.log(`[handlers.js] handleProcessToolAction: typeof logger.writeLog = ${typeof logger.writeLog}`);
    console.log(`[handlers.js] handleProcessToolAction: typeof require('fs') = ${typeof require('fs')}`);
    
    let toolToProcess = state.pendingToolCalls.find(t => t.toolCallId === toolCallId);
    if (!toolToProcess) {
        console.warn(`未找到 toolCallId 为 ${toolCallId} 的待处理工具。`);
        return { success: false, message: '未找到指定工具。' };
    }

    if (actionType === 'approve') {
        chatService._sendAiResponseToFrontend('tool_action_status', { toolCallId, status: 'executing', message: `工具 ${toolToProcess.toolName} 正在执行...` });
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
    } else if (actionType === 'reject') {
        toolToProcess.status = 'rejected';
        toolToProcess.result = { success: false, error: `用户拒绝了 ${toolToProcess.toolName} 操作。` };
        chatService._sendAiResponseToFrontend('tool_action_status', { toolCallId, status: 'rejected', message: `工具 ${toolToProcess.toolName} 已被拒绝。` });
    } else {
        console.warn(`未知的工具动作: ${actionType}`);
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
        chatService._sendAiResponseToFrontend('batch_action_status', { status: 'executing_all', message: `正在批量执行所有待处理工具...` }); // 修改
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
        chatService._sendAiResponseToFrontend('batch_action_status', { status: 'rejected_all', message: `所有待处理工具已被批量拒绝。` }); // 修改
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
        // 获取默认模型 ID
        if (!storeInstance) {
            const StoreModule = await import('electron-store');
            const Store = StoreModule.default;
            storeInstance = new Store();
        }
        const defaultModelId = storeInstance.get('defaultAiModel') || 'deepseek-chat';

        const aiResponseResult = await chatService.sendToolResultToAI(processedTools, defaultModelId); // 修改并添加 modelId 参数
        state.pendingToolCalls = [];
        chatService._sendAiResponseToFrontend('batch_processing_complete', null); // 修改
        return { success: true, message: '批量工具结果已成功反馈给 AI。' };
    } catch (error) {
        console.error('批量工具结果反馈失败:', error);
        chatService._sendAiResponseToFrontend('error', `批量反馈失败: ${error.message}`); // 修改
        return { success: false, error: error.message };
    }
};

// 处理用户命令
const handleProcessCommand = async (event, { message, sessionId, currentMessages }) => {
    console.log(`[handlers.js] handleProcessCommand: 收到命令: ${message}`);
    console.log(`[handlers.js] handleProcessCommand: 收到前端所有消息:`, currentMessages);
 
    if (state.pendingToolCalls.length > 0) {
        chatService._sendAiResponseToFrontend('warning', '您有未处理的工具建议。请先批准或拒绝它们，或等待它们自动处理完成，然后再发送新命令。');
        return { type: 'warning', payload: '有未处理的工具建议。' };
    }
 
    // latestMessage 现在直接是用户发送的 message
    const latestMessage = { role: 'user', content: message, sessionId: sessionId };
    let incomingSessionId = sessionId;
 
    if (!incomingSessionId) {
        incomingSessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.warn(`[handlers.js] 前端未提供有效的 sessionId，生成新的 sessionId: ${incomingSessionId}`);
    }
 
    let loadedHistory = [];
    try {
        const fullHistoryFromLogger = await handleGetAiChatHistory();
        const foundSession = fullHistoryFromLogger.find(session => session.sessionId === incomingSessionId);
        if (foundSession) {
            loadedHistory = foundSession.messages;
            console.log(`[handlers.js] 从文件加载了会话历史。Session ID: ${incomingSessionId}, 消息数量: ${loadedHistory.length}`);
        } else {
            console.log(`[handlers.js] 未在文件系统中找到 Session ID: ${incomingSessionId} 的历史，将初始化新会话。`);
        }
    } catch (error) {
        console.error(`[handlers.js] 加载历史会话失败: ${error.message}，将初始化新会话。`);
    }
 
    state.conversationHistory = loadedHistory;
    state.pendingToolCalls = [];
    chatService.resetResponseCount();
 
    const lastMessageInState = state.conversationHistory[state.conversationHistory.length - 1];
    if (!lastMessageInState || lastMessageInState.content !== latestMessage.content || lastMessageInState.role !== 'user') {
        console.log(`[handlers.js] 追加最新的用户消息。Session ID: ${incomingSessionId}`);
        state.conversationHistory.push({
            role: 'user',
            content: latestMessage.content,
            sessionId: incomingSessionId
        });
    } else {
        console.log(`[handlers.js] 延续当前会话 (ID: ${incomingSessionId})。最新用户消息已存在。`);
    }
    
    if (!storeInstance) {
        const StoreModule = await import('electron-store');
        const Store = StoreModule.default;
        storeInstance = new Store();
    }
    const defaultModelId = storeInstance.get('defaultAiModel') || 'deepseek-chat';
    const customSystemPrompt = storeInstance.get('customSystemPrompt'); // 获取自定义系统提示词
    console.log(`[handlers.js] handleProcessCommand: 从 electron-store 读取到的 defaultAiModel: ${defaultModelId}`);
    console.log(`[handlers.js] handleProcessCommand: 从 electron-store 读取到的 customSystemPrompt: ${customSystemPrompt ? customSystemPrompt.substring(0, 50) + '...' : '无'}`);
 
    console.log(`[handlers.js] handleProcessCommand: 调用 chatService.chatWithAI 前 conversationHistory 长度: ${state.conversationHistory.length}`);
    console.log(`[handlers.js] handleProcessCommand: 实际发送给 AI 的历史 (最后两条):`, state.conversationHistory.slice(-2));
 
    const aiResult = await chatService.chatWithAI(latestMessage.content, defaultModelId, customSystemPrompt); // 传递 customSystemPrompt
 
    if (aiResult.type === 'pending_tools') {
        console.log('chatWithAI 返回 pending_tools，主进程等待用户操作。');
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
            result: userResponse
        }];

        // 获取默认模型 ID
        if (!storeInstance) {
            const StoreModule = await import('electron-store');
            const Store = StoreModule.default;
            storeInstance = new Store();
        }
        const defaultModelId = storeInstance.get('defaultAiModel') || 'deepseek-chat';

        await chatService.sendToolResultToAI(toolResultsArray, defaultModelId); // 修改并添加 modelId 参数

    } catch (error) {
        console.error("处理用户回复后再次调用 AI API 失败:", error);
        chatService._sendAiResponseToFrontend('error', `处理用户回复后 AI 反馈失败: ${error.message}`); // 修改
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

// 辅助函数：将文件树扁平化为文件路径数组
const flattenFileTree = (nodes) => {
    let filePaths = [];
    nodes.forEach(node => {
        if (!node.isFolder) { // 如果不是文件夹，那就是文件
            filePaths.push(node.id); // 使用 node.id 来获取文件路径
        } else if (node.isFolder && node.children) { // 如果是文件夹且有子节点
            filePaths = filePaths.concat(flattenFileTree(node.children));
        }
    });
    return filePaths;
};

// 新增：处理列出 novel 目录下所有文件请求
const handleListNovelFiles = async () => {
    try {
        const fileTreeResult = await getFileTree('novel'); // 获取 novel 目录的文件树
        console.log('[handleListNovelFiles] fileTreeResult.tree:', JSON.stringify(fileTreeResult.tree, null, 2)); // 添加日志

        if (fileTreeResult.success) {
            const files = flattenFileTree(fileTreeResult.tree);
            console.log('[handleListNovelFiles] 扁平化后的文件列表 (files):', files); // 添加日志
            return { success: true, files };
        } else {
            console.error(`[handlers.js] 获取 novel 文件列表失败: ${fileTreeResult.error}`);
            return { success: false, error: fileTreeResult.error };
        }
    } catch (error) {
        console.error('[handlers.js] 列出 novel 文件时发生异常:', error);
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
const handleCreateNovelFile = async (event, { filePath, content = '' }) => { // 实际创建文件 IPC
    const novelRootPath = path.join(__dirname, '../../../novel');
    // 移除 filePath 开头的 'novel/' 前缀，因为 novelRootPath 已经指向 novel 目录
    const cleanFilePath = filePath.startsWith('novel/') ? filePath.substring(6) : filePath;
    const fullPath = path.join(novelRootPath, cleanFilePath); // 使用清理后的路径

    // 确保目标目录存在
    const targetDir = path.dirname(fullPath);
    await fs.mkdir(targetDir, { recursive: true }).catch(() => {}); // 忽略目录已存在的错误

    try {
        await fs.writeFile(fullPath, content, 'utf8');
        // 构建返回给前端的相对路径，例如 novel/folder/file.txt
        const relativeFilePath = path.relative(novelRootPath, fullPath).replace(/\\/g, '/');

        // 创建成功后，理论上新文件内容为空，直接返回成功状态和路径
        return {
            success: true,
            newFilePath: `novel/${relativeFilePath}`, // 返回带 'novel/' 前缀的完整相对路径
            content: content, // 返回新文件的内容 (通常为空字符串)
            message: `文件 '${relativeFilePath}' 创建成功`
        };
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

// 新增：获取 AI 对话历史
const handleGetAiChatHistory = async () => { // 修改函数名
    console.log('进入 handleGetAiChatHistory 函数');
    try {
        await logger.initialize(); // 确保日志目录存在
        console.log('logger.initialize() 完成');
        const historyPath = getAiChatHistoryFilePath(); // 修改函数调用
        console.log(`尝试读取文件路径: ${historyPath}`);
        console.log('准备读取文件内容');
        const fileContent = await fs.readFile(historyPath, 'utf8');
        console.log('文件内容读取成功');
        
        if (fileContent.trim() === '') {
            console.log('文件内容为空，返回空历史。');
            return [];
        }

        console.log('准备解析 JSON');
        const history = JSON.parse(fileContent);
        console.log('JSON 解析成功');
        if (!Array.isArray(history)) {
            console.log('读取到的历史不是数组，返回空数组。');
            return [];
        }
        console.log('成功获取 AI 对话历史。');
        console.log('AI 对话历史内容:', history);
        return history;
    } catch (error) {
        console.log(`捕获到错误: ${error.code || error.message}`);
        if (error.code === 'ENOENT') {
            console.log('AI 历史文件不存在，返回空历史。');
            return [];
        }
        console.error('获取 AI 对话历史失败:', error);
        return [];
    }
};

// 新增：删除 AI 对话历史中的某条记录
const handleDeleteAiChatHistory = async (event, sessionIdToDelete) => { // 修改函数名
    try {
        await logger.initialize(); // 确保日志目录存在
        const historyPath = getAiChatHistoryFilePath(); // 修改函数调用
        let history = [];
        try {
            const fileContent = await fs.readFile(historyPath, 'utf8');
            history = JSON.parse(fileContent);
            if (!Array.isArray(history)) {
                history = [];
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('AI 历史文件不存在，无需删除。');
                return { success: true, message: '历史记录已为空或文件不存在。' };
            }
            throw error;
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
        console.error('删除 AI 对话历史失败:', error);
        return { success: false, error: error.message };
    }
};

// 新增：处理获取所有可用模型列表请求
const handleListAllModels = async () => {
    try {
        // 确保 ModelProvider 已初始化，这在 chatService 中已经处理，这里再次确保
        await initializeModelProvider();
        const modelRegistry = getModelRegistry();
        const allModels = await modelRegistry.listAllModels(); // **关键修改：添加 await**
        
        console.log(`[handlers.js] handleListAllModels: 获取到 ${allModels.length} 个模型。`);
        
        // 尝试对模型数据进行深拷贝和序列化检查
        let serializableModels = [];
        try {
            serializableModels = allModels.map(model => {
                const serializableModel = {};
                for (const key in model) {
                    // 只复制基本类型和纯对象/数组，避免不可序列化的值
                    if (typeof model[key] !== 'function' && typeof model[key] !== 'symbol' && !(model[key] instanceof Date) && !(model[key] instanceof Promise) && !(model[key] instanceof ReadableStream)) {
                        serializableModel[key] = JSON.parse(JSON.stringify(model[key]));
                    } else {
                        // 对于不可序列化的类型，将其置为空或跳过
                        serializableModel[key] = null; 
                    }
                }
                return serializableModel;
            });
            console.log(`[handlers.js] handleListAllModels: 成功序列化 ${serializableModels.length} 个模型。`);
            console.log(`[handlers.js] handleListAllModels: 返回的模型数据 (序列化后):`, JSON.stringify(serializableModels, null, 2));
            return { success: true, models: serializableModels };
        } catch (serializeError) {
            console.error('[handlers.js] 模型数据序列化失败:', serializeError);
            console.error('[handlers.js] 原始模型数据示例 (可能包含不可序列化部分):', JSON.stringify(allModels.slice(0, 1), (key, value) => {
                if (typeof value === 'function' || typeof value === 'symbol' || value instanceof Date || value instanceof Promise || value instanceof ReadableStream) {
                    return `[不可序列化: ${typeof value}]`;
                }
                return value;
            }, 2));
            return { success: false, error: `模型数据序列化失败: ${serializeError.message}` };
        }
    } catch (error) {
        console.error('[handlers.js] 获取所有模型列表失败:', error);
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
  ipcMain.handle('list-novel-files', handleListNovelFiles); // 新增：注册列出 novel 目录下所有文件请求
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
  ipcMain.handle('save-novel-content', handleSaveNovelContent);
  ipcMain.handle('get-ai-chat-history', handleGetAiChatHistory); // 修改 IPC 处理器名称
  ipcMain.handle('delete-ai-chat-history', handleDeleteAiChatHistory); // 修改 IPC 处理器名称
  ipcMain.handle('clear-ai-conversation', handleClearAiConversation); // 修改 IPC 处理器名称
  ipcMain.handle('list-all-models', handleListAllModels); // 新增：注册获取所有模型列表处理器
  
  // 新增：get-store-value 处理器
  ipcMain.handle('get-store-value', async (event, key) => {
    try {
        const value = store.get(key);
        return value;
    } catch (error) {
        console.error(`获取值失败: ${key}`, error);
        return undefined; // 返回 undefined 而不是抛出错误，以便前端处理
    }
  });

  // set-store-value 处理器
  ipcMain.handle('set-store-value', async (event, key, value) => {
    try {
        store.set(key, value);
        return { success: true, message: `值已保存: ${key}` };
    } catch (error) {
        console.error(`保存值失败: ${key}`, error);
        return { success: false, error: error.message };
    }
  });

  // 新增：用于接收前端日志并输出到主进程终端
  ipcMain.on('main-log', (event, message) => {
    console.log('[Frontend Log]:', message);
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