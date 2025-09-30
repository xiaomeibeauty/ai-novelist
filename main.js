const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const fs = require('fs').promises;
const { throttle } = require('lodash');
const log = require('electron-log');
const { spawn } = require('child_process');

// =================================================================
// 日志配置
// =================================================================
// 将 console 输出重定向到日志文件
Object.assign(console, log.functions);

// 捕获未处理的异常
log.catchErrors();

// 您可以在以下路径找到日志文件:
// on Linux: ~/.config/<app name>/logs/main.log
// on macOS: ~/Library/Logs/<app name>/main.log
// on Windows: %USERPROFILE%\AppData\Roaming\<app name>\logs\main.log
console.log('日志服务已启动。');
// =================================================================

// 必须在 app.ready 事件之前注册协议
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, bypassCSP: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true } }
]);

const {
  register: registerIpcHandlers,
  processCommand,
  sendUserResponse,
  processToolAction,
  processBatchAction,
  getChaptersAndUpdateFrontend,
} = require('./backend/engine/ipc/handlers');
const { setMainWindow } = require('./backend/state-manager');
const { initializeServices } = require('./backend/service-registry');

let mainWindow;
let novelDirWatcher;
let hasUnsavedChanges = false;
let resolveQuitPromise; // 用于在 before-quit 中等待渲染进程的保存结果
let chromaProcess = null; // ChromaDB 服务器进程
let chromaServerReady = false; // ChromaDB 服务器就绪状态

// ChromaDB 服务器管理函数
async function startChromaServer() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('[ChromaDB] 正在启动 ChromaDB 服务器...');
            
            // 检查Python环境是否存在
            const portablePythonPath = path.join(__dirname, 'python_portable');
            const chromaExePath = path.join(portablePythonPath, 'Scripts', 'chroma.exe');
            
            if (!require('fs').existsSync(chromaExePath)) {
                console.warn('[ChromaDB] Python环境不存在，RAG功能将不可用');
                console.warn('[ChromaDB] 请确保python_portable目录包含完整的Python环境和ChromaDB');
                resolve(false);
                return;
            }
            
            const dbPath = path.join(__dirname, 'db', 'chroma_db');
            // 确保数据库目录存在
            fs.mkdir(dbPath, { recursive: true }).catch(() => {});
            
            // 使用便携式 Python 环境直接运行 ChromaDB（避免硬编码路径问题）
            const pythonPath = path.join(__dirname, 'python_portable', 'python.exe');
            console.log(`[ChromaDB] 启动服务器: ${pythonPath} -m chromadb.cli.cli run --path ${dbPath}`);
            
            // 使用原始字符串字面量确保路径正确传递
            const escapedDbPath = dbPath.replace(/\\/g, '\\\\');
            const pythonScript = `
import chromadb.cli.cli as cli
import sys
sys.argv = ["chroma", "run", "--path", r"${escapedDbPath}"]
cli.app()
            `.trim();
            
            chromaProcess = spawn(pythonPath, ['-c', pythonScript], {
                cwd: __dirname,
                stdio: 'pipe',
                detached: false, // 不要分离，以便可以正确关闭
                env: { ...process.env, NODE_ENV: 'production', RUST_BACKTRACE: 'full' }
            });

            chromaProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log(`[ChromaDB] ${output}`);
                
                // 检查服务器是否启动成功 (Python版本)
                if (output.includes('Connect to Chroma at:') ||
                    output.includes('Application startup complete') ||
                    output.includes('Uvicorn running on')) {
                    chromaServerReady = true;
                    console.log('[ChromaDB] 服务器启动成功，监听端口 8000');
                    resolve(true);
                }
            });

            chromaProcess.stderr.on('data', (data) => {
                const errorOutput = data.toString();
                console.error(`[ChromaDB Error] ${errorOutput}`);
                
                // 如果是端口已被占用的错误，尝试使用其他端口
                if (errorOutput.includes('address already in use')) {
                    console.log('[ChromaDB] 端口 8000 被占用，尝试其他端口...');
                    stopChromaServer();
                    setTimeout(() => startChromaServerWithPort(8001), 1000);
                }
            });

            chromaProcess.on('close', (code) => {
                console.log(`[ChromaDB] 进程退出，代码 ${code}`);
                chromaServerReady = false;
                chromaProcess = null;
                
                if (code !== 0) {
                    reject(new Error(`ChromaDB 进程异常退出，代码: ${code}`));
                }
            });

            chromaProcess.on('error', (error) => {
                console.error('[ChromaDB] 启动失败:', error);
                chromaServerReady = false;
                chromaProcess = null;
                reject(error);
            });

            // 设置超时，防止服务器启动过久
            setTimeout(() => {
                if (!chromaServerReady) {
                    console.warn('[ChromaDB] 服务器启动超时，但继续等待...');
                }
            }, 10000);

        } catch (error) {
            console.error('[ChromaDB] 启动异常:', error);
            reject(error);
        }
    });
}

// 使用特定端口启动 ChromaDB
function startChromaServerWithPort(port) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`[ChromaDB] 正在使用端口 ${port} 启动服务器...`);
            
            const dbPath = path.join(__dirname, 'db', 'chroma_db');
            // 使用Python虚拟环境中的chroma命令（绝对路径，指定端口）
            const chromaCommand = path.join(__dirname, 'chroma_env', 'Scripts', 'chroma.exe');
            console.log(`[ChromaDB:${port}] 启动服务器: ${chromaCommand} run --path ${dbPath} --port ${port}`);
            
            chromaProcess = spawn(chromaCommand, ['run', '--path', dbPath, '--port', port.toString()], {
                cwd: __dirname,
                stdio: 'pipe',
                detached: false
            });

            chromaProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log(`[ChromaDB:${port}] ${output}`);
                
                // 检查服务器是否启动成功 (Python版本)
                if (output.includes('Connect to Chroma at:') ||
                    output.includes('Application startup complete') ||
                    output.includes('Uvicorn running on')) {
                    chromaServerReady = true;
                    console.log(`[ChromaDB] 服务器启动成功，监听端口 ${port}`);
                    // 更新 RAG 服务配置使用新端口
                    updateChromaPort(port);
                    resolve(true);
                }
            });

            chromaProcess.stderr.on('data', (data) => {
                console.error(`[ChromaDB:${port} Error] ${data}`);
            });

        } catch (error) {
            console.error(`[ChromaDB:${port}] 启动失败:`, error);
            reject(error);
        }
    });
}

// 更新 RAG 服务使用的端口
function updateChromaPort(port) {
    try {
        const chromaConfig = require('./backend/utils/chromaConfig');
        chromaConfig.setPort(port);
        console.log(`[ChromaDB] RAG 服务已更新使用端口: ${port}`);
        
        // 重新初始化 RAG 服务以使用新端口
        const knowledgeBaseManager = require('./backend/rag-service/knowledgeBaseManager');
        if (knowledgeBaseManager.isInitialized) {
            knowledgeBaseManager.isInitialized = false; // 强制重新初始化
            console.log('[ChromaDB] RAG 服务已标记为需要重新初始化');
        }
    } catch (error) {
        console.error('[ChromaDB] 更新端口配置失败:', error);
    }
}

function stopChromaServer() {
    if (chromaProcess) {
        console.log('[ChromaDB] 正在停止服务器...');
        // 发送 SIGTERM 信号优雅关闭
        chromaProcess.kill('SIGTERM');
        chromaProcess = null;
        chromaServerReady = false;
        console.log('[ChromaDB] 服务器已停止');
    }
}

// 检查 ChromaDB 服务器状态
function checkChromaServerStatus() {
    return chromaServerReady;
}

// 注册 IPC 处理器
ipcMain.handle('get-chroma-status', async () => {
    return { ready: chromaServerReady };
});

ipcMain.handle('get-api-key', async () => {
    try {
        const apiKey = store.get('deepseekApiKey');
        return { success: true, apiKey };
    } catch (error) {
        console.error('获取 API Key 失败:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-api-key', async (event, apiKey) => {
    try {
        store.set('deepseekApiKey', apiKey);
        return { success: true, message: 'API Key 已保存' };
    } catch (error) {
        console.error('保存 API Key 失败:', error);
        return { success: false, error: error.message };
    }
});


// 新增 IPC 处理器：设置未保存更改状态
ipcMain.handle('set-unsaved-changes', async (event, hasChanges) => {
    hasUnsavedChanges = hasChanges;
    console.log(`[main] 未保存更改状态更新为: ${hasUnsavedChanges}`);
});

// 新增 IPC 处理器，用于在特定时机触发焦点修复
ipcMain.handle('trigger-focus-fix', async () => {
    if (mainWindow) {
        console.log('[main] 收到 trigger-focus-fix 请求，尝试修复焦点...');
        mainWindow.blur();
        mainWindow.focus();
        return { success: true, message: '主窗口焦点已尝试修复。' };
    } else {
        console.warn('[main] 无法修复焦点：主窗口未定义。');
        return { success: false, message: '主窗口未定义。' };
    }
});

// 新增 IPC 处理器：接收渲染进程的保存结果
ipcMain.on('save-and-quit-response', (event, result) => {
    if (resolveQuitPromise) {
        resolveQuitPromise(result); // 解析 Promise
        resolveQuitPromise = null; // 清除引用
    }
});


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'frontend/react-app/public/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      contentSecurityPolicy: "default-src 'self' app: 'unsafe-inline' data:; script-src 'self' app: 'unsafe-eval' 'unsafe-inline' blob:; style-src 'self' app: 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:3000; worker-src 'self' blob:;",
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#000000',
      symbolColor: '#FFFFFF',
      height: 30
    },
  });

  // 强制使用生产模式URL，避免依赖electron-is-dev检测
  const startUrl = `app://./index.html`;

  mainWindow.loadURL(startUrl);

  mainWindow.maximize();

  // 添加窗口关闭事件监听
  mainWindow.on('close', async (event) => {
    if (hasUnsavedChanges) {
      event.preventDefault(); // 阻止窗口关闭

      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['保存并退出', '不保存并退出', '取消'],
        defaultId: 0,
        cancelId: 2,
        title: '未保存的更改',
        message: '您有未保存的更改。是否要保存？',
        detail: '您的更改将丢失，除非您选择保存它们。',
      });

      // 确保正确关闭目录监听器
      if (novelDirWatcher && typeof novelDirWatcher.close === 'function') {
        console.log('[main] novel 目录监听器已关闭。');
        novelDirWatcher.close();
        novelDirWatcher = null;
      }

      if (choice.response === 0) { // 保存并退出
        console.log('[main] 用户选择：保存并退出，正在请求渲染进程执行保存逻辑...');
        
        // 创建一个 Promise，等待渲染进程的响应
        const quitPromise = new Promise((resolve) => {
          resolveQuitPromise = resolve;
          
          // 添加超时处理（延长到10秒）
          const timeoutId = setTimeout(() => {
            resolve({ success: false, error: '保存操作超时' });
          }, 10000); // 10秒超时

          // 向渲染进程发送保存请求
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('save-and-quit-request');
          } else {
            console.warn('[main] 主窗口已销毁或无效，无法发送保存请求。');
            clearTimeout(timeoutId);
            resolve({ success: false, error: '主窗口已销毁或无效。' });
          }
        });

        try {
          const saveResult = await quitPromise; // 等待渲染进程的保存结果

          if (saveResult.success) {
            console.log('[main] 文件保存成功。');
            hasUnsavedChanges = false;
            // 保存成功后，销毁窗口（这将触发应用退出）
            mainWindow.destroy();
          } else {
            console.error('[main] 文件保存失败:', saveResult.error);
            if (mainWindow && !mainWindow.isDestroyed()) {
              dialog.showErrorBox('保存失败', `文件保存失败: ${saveResult.error || '未知错误'}`);
            } else {
              console.error('[main] 无法显示错误对话框：主窗口已销毁');
            }
          }
        } catch (error) {
          console.error('[main] 保存过程中发生异常:', error);
          if (mainWindow && !mainWindow.isDestroyed()) {
            dialog.showErrorBox('保存异常', `保存过程中发生异常: ${error.message}`);
          }
        }
      } else if (choice.response === 1) { // 不保存并退出
        console.log('[main] 用户选择：不保存并退出。');
        hasUnsavedChanges = false;
        mainWindow.destroy(); // 销毁窗口
      } else { // 取消
        console.log('[main] 用户选择：取消退出。');
        // 重新打开目录监听器
        if (!novelDirWatcher) {
          const novelDirPath = path.join(__dirname, 'novel');
          novelDirWatcher = fs.watch(novelDirPath, async (eventType, filename) => {
            throttledGetChaptersAndUpdateFrontend(mainWindow);
          });
          console.log('[main] novel 目录监听器已重新打开。');
        }
      }
    } else {
      // 没有未保存更改，直接关闭窗口
      mainWindow.destroy();
    }
  });

  // 移除自动打开开发者工具
  // if (isDev) {
  //   mainWindow.webContents.openDevTools();
  // }
}

const throttledGetChaptersAndUpdateFrontend = throttle(async (windowInstance) => {
  if (windowInstance && windowInstance.webContents) {
      await getChaptersAndUpdateFrontend(windowInstance);
  }
}, 1000);

let store; // 将 store 声明提前，但不初始化

app.whenReady().then(async () => {
  try {
    const StoreModule = await import('electron-store');
    const Store = StoreModule.default;
    store = new Store(); // 在异步上下文中初始化 store

    // 处理自定义协议
    protocol.handle('app', (request) => {
      const filePath = path.normalize(path.join(__dirname, 'frontend/react-app/build', request.url.slice('app://'.length)));
      return net.fetch(filePath); // 使用 net.fetch 来读取本地文件
    });

    console.log('[main] Initializing services...');
    await initializeServices();
    console.log('[main] Services initialized successfully');

    // 启动 ChromaDB 服务器（仅在未禁用时启动）
    if (!process.env.CHROMA_DISABLED) {
        console.log('[main] 正在启动 ChromaDB 服务器...');
        try {
            await startChromaServer();
            console.log('[main] ChromaDB 服务器启动成功');
        } catch (error) {
            console.error('[main] ChromaDB 服务器启动失败:', error);
            // 即使服务器启动失败，也继续运行应用，但禁用 RAG 功能
            console.warn('[main] RAG 功能将不可用');
        }
    } else {
        console.log('[main] ChromaDB 自动启动已禁用 (CHROMA_DISABLED=true)');
        console.log('[main] RAG 功能将不可用，如需使用请手动启动ChromaDB服务器');
    }

    createWindow();
    setMainWindow(mainWindow);

    console.log('[main] 注册 IPC 处理器...');
    registerIpcHandlers(store); // 传递 store 对象
    console.log('[main] IPC 处理器注册完成。');

    const novelDirPath = path.join(__dirname, 'novel');
    await fs.mkdir(novelDirPath, { recursive: true }).catch(() => {});

    console.log(`[main] 监听 novel 目录: ${novelDirPath}`);
    novelDirWatcher = fs.watch(novelDirPath, async (eventType, filename) => {
        throttledGetChaptersAndUpdateFrontend(mainWindow);
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('[main] Initialization failed:', error);
    app.quit();
  }
}); // 修复 app.whenReady().then 的闭合括号

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前停止 ChromaDB 服务器
app.on('before-quit', (event) => {
  console.log('[main] 应用正在退出，停止 ChromaDB 服务器...');
  stopChromaServer();
});

// 处理应用异常退出
process.on('SIGINT', () => {
  console.log('[main] 收到 SIGINT 信号，停止 ChromaDB 服务器...');
  stopChromaServer();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[main] 收到 SIGTERM 信号，停止 ChromaDB 服务器...');
  stopChromaServer();
  process.exit(0);
});