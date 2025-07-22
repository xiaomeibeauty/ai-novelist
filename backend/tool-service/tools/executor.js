// 使用新的服务注册中心获取方式
const serviceRegistry = require('../../service-registry');
const logger = require('../../utils/logger');
const path = require('path');
const fs = require('fs'); // 引入 fs 模块以便写入日志

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
                result = await services.filesystem.readFile(args);
                return { success: result.success, content: result.content };
            case 'end_task': // 添加对 end_task 的处理
                return { success: true, message: args.final_message || "任务已结束。" };
           case 'insert_content':
               result = await services.filesystem.insertContent(args);
               return { success: result.success, content: result.success ? "内容插入成功。" : result.error };
           case 'search_and_replace':
               result = await services.filesystem.searchAndReplace(args);
               return { success: result.success, content: result.success ? "搜索和替换成功。" : result.error };
           case 'apply_diff':
               result = await services.filesystem.applyDiff(args);
               return { success: result.success, content: result.success ? "差异应用成功。" : result.error };
            case 'search_files':
                result = await services.filesystem.searchFiles(args);
                return { success: result.success, content: result.results };
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
                const chapterId = toolArgs.path; // 直接使用 path 作为 chapterId
                logger.writeLog(`[executor.js] 接收到 write_file 操作，文件名为: ${chapterId}`);
                mainWindow.webContents.send('update-novel-content', toolArgs.content);
                logger.writeLog(`[executor.js] 发送 update-novel-content 事件`);
                mainWindow.webContents.send('update-current-file', chapterId);
                logger.writeLog(`[executor.js] 发送 update-current-file 事件`);
                finalMessage = `章节 '${chapterId}' 已创建/更新，并已加载到编辑框。`;
            } else if (toolName === "read_file") {
                mainWindow.webContents.send('update-novel-content', toolResult.content);
                mainWindow.webContents.send('update-current-file', toolArgs.path);
                finalMessage = `文件 '${toolArgs.path}' 读取成功。内容已载入编辑框。`;
            } else if (toolName === "end_task") {
                // end_task 工具的执行结果不应被添加到 conversationHistory
                // AI 已经通过 _sendAiResponseToFrontend('end_task', ...) 接收到最终消息
                // 这里只需要返回一个成功的状态，不包含 content
                finalMessage = toolResult.message || "任务已结束。";
                return { result: { success: true, message: finalMessage } };
            } else if (toolName === "insert_content" || toolName === "search_and_replace" || toolName === "apply_diff") {
               // 对于这些文件修改工具，我们可以发送一个通用消息，并更新文件树
               mainWindow.webContents.send('update-current-file', toolArgs.path);
               finalMessage = `文件 '${toolArgs.path}' 已通过 ${toolName} 操作成功修改。`;
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
            // 使用 fs.promises.appendFile 确保异步写入
            await fs.promises.appendFile(debugLogPath, JSON.stringify(logEntry, null, 2) + '\n---\n', 'utf8');
        } catch (error) {
            logger.writeLog(`写入调试日志失败: ${error.message}`);
        }
        
        // 返回工具执行结果
        return { result: toolResult }; // 返回原始工具结果，包含 success 和 content
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