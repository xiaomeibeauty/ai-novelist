const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const Store = require('electron-store').default;
const store = new Store();
const fs = require('fs').promises;
const { throttle } = require('lodash');

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

// 注册 IPC 处理器
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
      contentSecurityPolicy: "default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:3000; worker-src 'self' blob:;",
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#000000',
      symbolColor: '#FFFFFF',
      height: 30
    },
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, 'frontend/react-app/build/index.html')}`;

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

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

const throttledGetChaptersAndUpdateFrontend = throttle(async (windowInstance) => {
  if (windowInstance && windowInstance.webContents) {
      await getChaptersAndUpdateFrontend(windowInstance);
  }
}, 1000);

app.whenReady().then(async () => {
  try {
    console.log('[main] Initializing services...');
    await initializeServices();
    console.log('[main] Services initialized successfully');

    createWindow();
    setMainWindow(mainWindow);

    console.log('[main] 注册 IPC 处理器...');
    registerIpcHandlers();
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