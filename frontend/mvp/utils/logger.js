const path = require('path');
// 每次调用时都重新获取 fs 模块的 promises API，以避免引用丢失
const getFsPromises = () => require('fs').promises;
const getFsSync = () => require('fs');

// 统一日志文件路径
const UNIFIED_LOG_PATH = path.join(__dirname, '../1.log');
// 新增DeepSeek会话日志目录
const deepseekSessionLogDir = path.join(__dirname, '../logs/deepseek');
const deepseekHistoryFilePath = path.join(deepseekSessionLogDir, 'history.json');

// 确保目录存在
async function ensureDirectoryExists(dirPath) {
  const fs = getFsPromises(); // 动态获取 fs
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') { // 忽略目录已存在的错误
      console.error(`logger.js: 确保目录 (${dirPath}) 存在失败:`, error);
    }
  }
}

// 统一日志写入函数
async function writeLog(message) {
    const fs = getFsPromises(); // 动态获取 fs
    const timestamp = new Date().toISOString();
    const logEntry = `[SYSTEM] ${timestamp} - ${message}\n`;
    
    try {
        await ensureDirectoryExists(path.dirname(UNIFIED_LOG_PATH)); // 确保日志文件目录存在
        await fs.appendFile(UNIFIED_LOG_PATH, logEntry, 'utf8');
    } catch (error) {
        console.error(`logger.js: 写入日志文件 (${UNIFIED_LOG_PATH}) 失败:`, error);
        // 如果写入失败，尝试使用 console.error 打印更多信息
        console.error(`logger.js: 写入失败时 typeof fs.promises =`, typeof fs); // 这里 fs 已经是 getFsPromises() 的结果
        console.error(`logger.js: 写入失败时 error.name =`, error.name);
        console.error(`logger.js: 写入失败时 error.message =`, error.message);
        console.error(`logger.js: 写入失败时 error.code =`, error.code);
    }
}

// 记录 pendingToolCalls 到日志文件
async function logPendingToolCalls(calls) {
    const fs = getFsPromises(); // 动态获取 fs
    const logEntry = `时间: ${new Date().toISOString()}\n内容: ${JSON.stringify(calls, null, 2)}\n---\n`;
    try {
        await writeLog(`pendingToolCalls 已记录到 1.log。`); // 使用 writeLog 记录
        await ensureDirectoryExists(path.dirname(UNIFIED_LOG_PATH));
        await fs.appendFile(UNIFIED_LOG_PATH, logEntry, 'utf8');
    } catch (error) {
        await writeLog(`记录 pendingToolCalls 到 1.log 失败: ${error.message}`);
    }
}

// 记录 DeepSeek 请求 (此函数将不再使用，后续由 logDeepSeekConversation 替代)
async function logDeepSeekRequest(messages, sessionId) {
    console.warn('logDeepSeekRequest is deprecated and will be removed. Use logDeepSeekConversation instead.');
}

// 记录 DeepSeek 响应 (此函数将不再使用，后续由 logDeepSeekConversation 替代)
async function logDeepSeekResponse(response, sessionId) {
    console.warn('logDeepSeekResponse is deprecated and will be removed. Use logDeepSeekConversation instead.');
}

const { state } = require('../../../backend/state-manager'); // 直接从 state-manager 获取权威状态

async function logDeepSeekConversation(sessionId) { // 移除 deepseekMessages 参数
    console.log('进入 logDeepSeekConversation 函数'); // Debug Log 1
    const fs = getFsPromises();
    const fsSync = getFsSync();
    try {
        await ensureDirectoryExists(deepseekSessionLogDir);
        console.log(`目录确保存在: ${deepseekSessionLogDir}`); // Debug Log 2
        let history = [];
        if (fsSync.existsSync(deepseekHistoryFilePath)) {
            console.log(`文件存在: ${deepseekHistoryFilePath}, 正在读取...`); // Debug Log 3
            const data = await fs.readFile(deepseekHistoryFilePath, 'utf8');
            if (!data.trim()) { // 检查文件是否为空或只包含空白字符
                console.warn(`[Logger] 历史文件 ${deepseekHistoryFilePath} 为空或无效，将初始化空历史。`);
                history = [];
            } else {
                try {
                    history = JSON.parse(data);
                    // 过滤掉不符合预期的历史记录，确保每个conv都是对象且有sessionId
                    history = history.filter(conv => typeof conv === 'object' && conv !== null && conv.sessionId);
                    console.log('文件读取并解析完成并已过滤。'); // Debug Log 4
                } catch (parseError) {
                    console.error(`[Logger] 解析历史文件 ${deepseekHistoryFilePath} 失败: ${parseError.message}，将初始化空历史。`);
                    history = []; // 解析失败时，初始化为空数组，避免程序崩溃
                }
            }
        } else {
            console.log(`文件不存在: ${deepseekHistoryFilePath}, 将创建新文件。`); // Debug Log 5
        }

        // 直接从 state.conversationHistory 获取完整的、权威的消息历史记录
        const messagesToSave = state.conversationHistory;
        if (!messagesToSave || messagesToSave.length === 0) {
            console.warn('[Logger] 尝试保存会话，但 state.conversationHistory 为空，操作已取消。');
            return;
        }

        const conversationObjectToSave = {
            sessionId: sessionId,
            timestamp: new Date().toISOString(),
            messages: messagesToSave // 保存完整的、权威的历史记录
        };

        const existingIndex = history.findIndex(
            (conv) => conv.sessionId === sessionId
        );

        if (existingIndex !== -1) {
            // 如果会话已存在，则更新
            history[existingIndex] = conversationObjectToSave;
        } else {
            // 如果会话不存在，则添加到开头
            history.unshift(conversationObjectToSave);
        }

        // 限制历史记录数量，例如只保留最新的50条（可配置）
        if (history.length > 50) {
            history = history.slice(0, 50);
        }

        console.log(`准备写入 history.json, 会话ID: ${sessionId}`); // Debug Log 6
        await fs.writeFile(
            deepseekHistoryFilePath,
            JSON.stringify(history, null, 2),
            'utf8'
        );
        console.log('history.json 写入完成。'); // Debug Log 7
        await writeLog(`DeepSeek 会话 (${sessionId}) 已保存。`);
    } catch (error) {
        console.error('logger.js: 保存 DeepSeek 会话失败:', error);
        console.log(`错误详情: ${error.name}: ${error.message}, Code: ${error.code}`); // Debug Log 8
        await writeLog(`保存 DeepSeek 会话 (${sessionId}) 失败: ${error.message}`);
    }
}

// 初始化日志系统
async function initialize() {
    const fs = getFsPromises(); // 动态获取 fs
    const fsSync = getFsSync();
    try {
        await ensureDirectoryExists(path.dirname(UNIFIED_LOG_PATH));
        // 确保日志文件存在并可写，如果不存在则创建
        if (!fsSync.existsSync(UNIFIED_LOG_PATH)) {
            await fs.writeFile(UNIFIED_LOG_PATH, ''); // 使用 promises 版本
        }
        
        await ensureDirectoryExists(deepseekSessionLogDir);
        
        await writeLog('日志系统初始化完成');
    } catch (error) {
        console.error('logger.js: 初始化日志系统失败:', error);
        // 如果初始化失败，继续使用 console.error
        console.error(`logger.js: 初始化失败时 typeof fs.promises =`, typeof fs);
        console.error(`logger.js: 初始化失败时 error.name =`, error.name);
        console.error(`logger.js: 初始化失败时 error.message =`, error.message);
        console.error(`logger.js: 初始化失败时 error.code =`, error.code);
    }
}

module.exports = {
    writeLog,
    logPendingToolCalls,
    initialize,
    logDeepSeekConversation, // 添加新函数
    // 新增工具调用结果日志函数
    async logToolResult(toolCallId, toolName, result) {
        const fs = getFsPromises(); // 动态获取 fs
        const logEntry = `=== 工具调用结果 ===
时间: ${new Date().toISOString()}
工具ID: ${toolCallId}
工具名称: ${toolName}
结果: ${JSON.stringify(result, null, 2)}
--------------------------\n`;
        try {
            await writeLog(`工具调用结果已记录: ${toolName}`); // 使用 writeLog 记录
            await ensureDirectoryExists(path.dirname(UNIFIED_LOG_PATH));
            await fs.appendFile(UNIFIED_LOG_PATH, `[TOOL-RESULT] ${logEntry}`, 'utf8');
        } catch (error) {
            await writeLog(`记录工具调用结果失败: ${error.message}`);
        }
    }
};