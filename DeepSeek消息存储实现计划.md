# DeepSeek消息存储实现计划

## 目标
捕获每次向DeepSeek发送和接收的消息，按会话存储在`logs/deepseek/`目录下

## 实现方案

### 1. 日志目录结构
```
logs/
└── deepseek/
    ├── 20250530_085912345_request.json
    ├── 20250530_085912345_response.json
    ├── 20250530_090015678_request.json
    └── 20250530_090015678_response.json
```

### 2. 会话ID生成规则
- 格式：`YYYYMMDD_HHmmssSSS`
- 示例：`20250530_085912345`（2025年5月30日 08:59:12.345）
- 生成位置：`deepseek.js`的`chatWithDeepSeek`函数开头

### 3. 代码修改点

#### 修改文件：`ai-novelist-mvp/utils/logger.js`

1. 添加目录创建功能：
```javascript
// 确保目录存在
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
```

2. 修改日志函数：
```javascript
async function logDeepSeekRequest(messages, sessionId) {
  // 确保目录存在
  ensureDirectory(deepseekSessionLogDir);
  
  // 创建会话文件路径
  const sessionFilePath = path.join(deepseekSessionLogDir, `${sessionId}_request.json`);
  
  try {
    // 保存完整JSON对象
    await fs.promises.writeFile(sessionFilePath, JSON.stringify(messages, null, 2), 'utf8');
    
    // 保留现有日志功能
    const logEntry = `时间: ${new Date().toISOString()}\n请求内容: ${JSON.stringify(messages, null, 2)}\n---\n`;
    await fs.promises.appendFile(deepseekRequestLogPath, logEntry, 'utf8');
    
    writeLog(`DeepSeek 请求已记录到会话文件: ${sessionFilePath}`);
  } catch (error) {
    // 错误处理
  }
}

// 对logDeepSeekResponse做类似修改
```

3. 更新初始化函数：
```javascript
function initialize() {
  // ...现有代码...
  
  // 确保会话日志目录存在
  ensureDirectory(deepseekSessionLogDir);
}
```

4. 添加新常量：
```javascript
const deepseekSessionLogDir = path.join(__dirname, '../logs/deepseek');
```

#### 修改文件：`ai-novelist-mvp/api/deepseek.js`

1. 生成会话ID：
```javascript
async function chatWithDeepSeek(userMessage, conversationHistory, mainWindow) {
  // 生成会话ID (YYYYMMDD_HHmmssSSS)
  const now = new Date();
  const sessionId = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}${now.getMilliseconds().toString().padStart(3,'0')}`;
  
  // ...现有代码...
  
  // 传递会话ID给日志函数
  logger.logDeepSeekRequest(messagesToSend, sessionId);
  
  // ...现有代码...
  
  logger.logDeepSeekResponse(aiResponse, sessionId);
}
```

### 4. 测试计划
1. 触发DeepSeek API调用
2. 验证`logs/deepseek/`目录创建
3. 检查会话文件是否生成
4. 验证文件内容是否为完整JSON格式

## 后续优化建议
1. 添加日志文件自动清理（保留最近7天）
2. 实现日志查看界面
3. 添加会话元数据（用户ID、请求类型等）