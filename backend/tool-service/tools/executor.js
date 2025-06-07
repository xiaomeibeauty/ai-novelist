// 使用新的服务注册中心获取方式
const serviceRegistry = require('../../service-registry');
const logger = require('../../../frontend/mvp/utils/logger');
const path = require('path');

const toolExecutor = {
    performToolExecution: async function(toolCallId, toolName, toolArgs, mainWindow, toolService) {
        try {
            const result = await toolService.executeTool(toolName, toolArgs);
            return { result: { success: true, content: result } };
        } catch (error) {
            logger.error(`Tool execution failed: ${error}`);
            return { result: { success: false, error: error.message } };
        }
    }
};

module.exports = toolExecutor;

// 调用 MCP 服务
async function callMcpTool(toolName, args) {
    try {
        let result;
        // 获取服务实例
        const services = serviceRegistry.getServices();
        
        switch(toolName) {
            case 'write_file':
                result = await services.filesystem.writeFile(args);
                return { success: true, content: "操作成功。" };
            case 'read_file':
                const content = await services.filesystem.readFile(args);
                return { success: true, content: content };
            default:
                return { success: false, error: `未知工具: ${toolName}` };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 核心工具执行逻辑
async function performToolExecution(toolCallId, toolName, toolArgs, mainWindow) {
    let toolResult;
    let finalMessage = '';

    try {
        // 根据工具名称调用对应的 MCP 工具
        toolResult = await callMcpTool(toolName, toolArgs);
        
        if (toolResult.success) {
            // 更新前端状态
            if (toolName === "write_file") {
                // 根据用户反馈，只要是写入文件，就通知前端刷新章节列表并加载内容
                // 不再区分是否为 novel 路径下的文件，所有 write_file 都视为章节更新
                // AI 提供的 path 通常是文件名，例如 "我的第一章"
                const chapterId = toolArgs.path; // 直接使用 path 作为 chapterId
                logger.writeLog(`[executor.js] 接收到 write_file 操作，文件名为: ${chapterId}`);

                // 移除主动通知前端章节列表更新的事件，改为依赖前端统一的更新机制
                // mainWindow.webContents.send('chapters-updated'); // 移除此行
                // logger.writeLog(`[executor.js] 发送 chapters-updated 事件`); // 移除此行
                
                mainWindow.webContents.send('update-novel-content', toolArgs.content); // 将写入的内容加载到编辑器
                logger.writeLog(`[executor.js] 发送 update-novel-content 事件`);
                
                mainWindow.webContents.send('update-current-file', chapterId); // 设置当前文件为新章节
                logger.writeLog(`[executor.js] 发送 update-current-file 事件`);
                
                finalMessage = `章节 '${chapterId}' 已创建/更新，并已加载到编辑框。`;
            } else if (toolName === "read_file") {
                mainWindow.webContents.send('update-novel-content', toolResult.content);
                mainWindow.webContents.send('update-current-file', toolArgs.path);
                finalMessage = `文件 '${toolArgs.path}' 读取成功。内容已载入编辑框。`;
            }
        } else {
            finalMessage = `${toolName} 操作失败: ${toolResult.error}`;
        }
        
        // 发送工具执行状态给渲染进程
        mainWindow.webContents.send('ai-response', {
            type: 'tool_execution_status',
            payload: {
                toolName: toolName,
                success: toolResult.success,
                message: toolResult.success ? `${toolName} 工具执行成功！${finalMessage}` : `${toolName} 工具执行失败: ${toolResult.error}`
            }
        });
        
        // 写入调试日志到文件
        const debugLogPath = path.join(__dirname, '../debug_tool_action.log');
        const logEntry = {
            timestamp: new Date().toISOString(),
            event: 'perform-tool-execution-return',
            toolName: toolName,
            toolCallId: toolCallId,
            success: toolResult.success,
            message: finalMessage,
            result: toolResult
        };
        try {
            await fs.promises.appendFile(debugLogPath, JSON.stringify(logEntry, null, 2) + '\n---\n', 'utf8');
        } catch (error) {
            logger.writeLog(`写入调试日志失败: ${error.message}`);
        }
        
        return { success: true, message: finalMessage, result: toolResult };
  
     } catch (error) {
         finalMessage = `执行工具 ${toolName} 时发生异常: ${error.message}`;
         toolResult = { success: false, error: error.message };
         
         mainWindow.webContents.send('ai-response', {
             type: 'tool_execution_status',
             payload: {
                 toolName: toolName,
                 success: toolResult.success,
                 message: `${toolName} 工具执行失败: ${toolResult.error}`
             }
         });
         // 写入调试日志到文件
         const debugLogPath = path.join(__dirname, '../debug_tool_action.log');
         const logEntry = {
             timestamp: new Date().toISOString(),
             event: 'perform-tool-execution-error-return',
             toolName: toolName,
             toolCallId: toolCallId,
             success: toolResult.success,
             message: finalMessage,
             result: toolResult,
             errorMessage: error.message
         };
         try {
             await fs.promises.appendFile(debugLogPath, JSON.stringify(logEntry, null, 2) + '\n---\n', 'utf8');
         } catch (error) {
             logger.writeLog(`写入调试日志失败: ${error.message}`);
         }
         
         return { success: false, message: finalMessage, result: toolResult };
     }
 }

module.exports = {
  callMcpTool,
  performToolExecution
};