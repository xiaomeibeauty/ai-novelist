import React, { useEffect, useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import useIpcRenderer from '../hooks/useIpcRenderer';
import { setNovelContent, setCurrentFile, setChapters, triggerChapterRefresh } from '../store/slices/novelSlice'; // 导入 triggerChapterRefresh
import './ChapterTreePanel.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faCaretRight, faCaretDown, faFolderPlus, faFileCirclePlus, faFolder, faFile } from '@fortawesome/free-solid-svg-icons'; // 导入新图标
import CombinedIcon from './CombinedIcon';
import ContextMenu from './ContextMenu'; // 引入 ContextMenu 组件

function ChapterTreePanel() {
  const chapters = useSelector((state) => state.novel.chapters);
  const refreshCounter = useSelector((state) => state.novel.refreshCounter); // 监听 refreshCounter
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [currentRenameItemId, setCurrentRenameItemId] = useState(null);
  const [currentRenameItemTitle, setCurrentRenameItemTitle] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [collapsedChapters, setCollapsedChapters] = useState({});
  const { invoke, on, removeListener } = useIpcRenderer();
  const dispatch = useDispatch();

  // 新增状态用于控制右键菜单
  const [contextMenu, setContextMenu] = useState({
    show: false,
    x: 0,
    y: 0,
    itemId: null,
    isFolder: false, // 标识当前右键点击的是文件夹还是文件
    itemTitle: null, // 存储右键点击的 item 的 title
    itemParentPath: null // 存储右键点击的 item 的父路径，用于粘贴
  });

  // 复制/剪切操作的临时存储
  const [copiedItem, setCopiedItem] = useState(null); // { id: '...', isCut: false }
  const [cutItem, setCutItem] = useState(null); // { id: '...', isCut: true }

  // 获取 API Key
  useEffect(() => {
    const getApiKey = async () => {
      try {
        const result = await invoke('get-api-key');
        if (result.success && result.apiKey) {
          setApiKey(result.apiKey);
        } else {
          console.warn('获取 API Key 失败或无 API Key:', result.error);
        }
      } catch (error) {
        console.error('调用 get-api-key IPC 失败:', error);
      }
    };
    getApiKey();
  }, [invoke]);

  const fetchChapters = useCallback(async () => {
    try {
      // 通过 IPC 调用主进程获取章节列表
      const result = await invoke('get-chapters');
      if (result.success) {
        // 更新 Redux store 中的章节列表
        dispatch(setChapters(result.chapters));
      } else {
        console.error('获取章节列表失败:', result.error);
      }
    } catch (error) {
      console.error('调用 get-chapters IPC 失败:', error);
    }
  }, [invoke, dispatch]);

  const handleChaptersUpdated = useCallback((event, rawPayload) => {
    console.log('[ChapterTreePanel] handleChaptersUpdated: 收到原始事件对象:', event);
    console.log('[ChapterTreePanel] handleChaptersUpdated: 收到原始 rawPayload:', rawPayload);
    
    let payload;
    try {
      if (typeof rawPayload === 'string') {
        payload = JSON.parse(rawPayload);
        console.log('[ChapterTreePanel] handleChaptersUpdated: 成功解析 JSON 字符串为 payload。');
      } else {
        payload = rawPayload;
        console.log('[ChapterTreePanel] handleChaptersUpdated: payload 已经是对象。');
      }
    } catch (e) {
      console.error('[ChapterTreePanel] handleChaptersUpdated: 解析 payload 失败:', e);
      console.error('[ChapterTreePanel] handleChaptersUpdated: 失败的 rawPayload:', rawPayload);
      return; // 解析失败，直接返回，避免后续错误
    }

    console.log('收到 chapters-updated 事件，更新章节列表:', payload);
    console.log('payload.chapters 类型:', typeof payload.chapters, '是数组:', Array.isArray(payload.chapters));
    console.log('payload.chapters 内容:', JSON.stringify(payload.chapters, null, 2)); // 打印内容以便检查
    if (!payload && typeof payload !== 'object') { // 确保 payload 是一个有效的对象
      console.error('收到 chapters-updated 事件但 payload 异常或为 undefined。');
      return;
    }
    if (payload.success) {
      dispatch(setChapters(payload.chapters)); // 直接使用 payload 中的章节数据更新 Redux
    } else {
      console.error('章节更新失败:', payload.error);
    }
  }, [dispatch]);

  // 辅助函数：根据文件名和是否为文件夹获取显示名称（去除文件拓展名）
  const getDisplayName = useCallback((name, isFolder) => {
    if (isFolder) {
      return name;
    }
    const lastDotIndex = name.lastIndexOf('.');
    return lastDotIndex !== -1 ? name.substring(0, lastDotIndex) : name;
  }, []);

  // 辅助函数：获取指定路径下的兄弟节点（包括文件和文件夹），以便检查重名
  const getSiblingItems = useCallback((items, path) => {
      if (!path) return items; // 根目录
      
      const findFolderByPath = (currentItems, targetPathParts, currentIndex) => {
          if (currentIndex === targetPathParts.length) {
              return currentItems; // 找到目标文件夹的子项列表
          }
          const part = targetPathParts[currentIndex];
          // 注意这里用 item.title 匹配文件夹名，因为 getDisplayName 已经移除了文件的拓展名
          const folder = currentItems.find(item => item.isFolder && item.title === part);
          if (folder && folder.children) {
              return findFolderByPath(folder.children, targetPathParts, currentIndex + 1);
          }
          return []; // 未找到路径中的文件夹
      };

      const pathParts = path.split('/');
      return findFolderByPath(items, pathParts, 0);
  }, [getDisplayName]); //getDisplayName添加到依赖项

  // 注册 IPC 监听器和初始加载
  useEffect(() => {
    fetchChapters(); // 首次加载时获取章节列表
    on('chapters-updated', handleChaptersUpdated); // 监听主进程的 chapters-updated 事件
    return () => {
      removeListener('chapters-updated', handleChaptersUpdated);
    };
  }, [fetchChapters, on, removeListener, handleChaptersUpdated]);

  // 监听 refreshCounter 变化，触发章节列表刷新
  useEffect(() => {
    console.log('[ChapterTreePanel] refreshCounter 变化，触发 fetchChapters()');
    fetchChapters();
  }, [refreshCounter, fetchChapters]); // 将 refreshCounter 作为依赖

  // 监听 refreshCounter 变化，触发章节列表刷新
  useEffect(() => {
    console.log('[ChapterTreePanel] refreshCounter 变化，触发 fetchChapters()');
    fetchChapters();
  }, [refreshCounter, fetchChapters]); // 将 refreshCounter 作为依赖

  const handleChapterClick = async (item) => {
    if (item.isFolder) {
      // 点击文件夹则展开/折叠
      setCollapsedChapters(prev => ({
        ...prev,
        [item.id]: !prev[item.id]
      }));
    } else {
      // 点击文件则加载内容
      console.log(`点击了文件: ${item.id}`);
      try {
        const result = await invoke('load-chapter-content', item.id);
        if (result.success) {
          dispatch(setNovelContent(result.content));
          dispatch(setCurrentFile(item.id)); // 更新为完整路径
        } else {
          console.error(`加载章节内容失败: ${item.id}`, result.error);
        }
      } catch (error) {
        console.error(`调用 load-chapter-content IPC 失败: ${item.id}`, error);
      }
    }
  };

  // 设置面板相关函数
  const handleToggleSettings = useCallback(() => {
    setShowSettings(prev => !prev);
  }, []);

  const handleSaveApiKey = useCallback(async () => {
    try {
      await invoke('set-store-value', 'deepseekApiKey', apiKey);
      alert('API Key 已保存！');
      setShowSettings(false);
    } catch (error) {
      console.error('保存 API Key 失败:', error);
      alert('保存 API Key 失败！');
    }
  }, [invoke, apiKey]);

  const handleCancelSettings = useCallback(() => {
    setShowSettings(false);
    // 重新从 store 加载，以防用户取消后恢复旧值
    invoke('get-store-value', 'deepseekApiKey')
      .then(value => {
        if (value) {
          setApiKey(value);
        } else {
          setApiKey(''); // 如果没有，则清空
        }
      })
      .catch(error => {
        console.error('Failed to reset API Key:', error);
      });
  }, [invoke]);


  // 右键菜单处理函数
  const handleContextMenu = useCallback((event, itemId, isFolder, itemTitle, itemParentPath) => {
    event.preventDefault(); // 阻止默认右键菜单
    console.log('handleContextMenu called with:', { itemId, isFolder, itemTitle, itemParentPath });
    setContextMenu({
      show: true,
      x: event.clientX,
      y: event.clientY,
      itemId: itemId,
      isFolder: isFolder,
      itemTitle: itemTitle,
      itemParentPath: itemParentPath,
    });
    console.log('contextMenu state set to:', { show: true, x: event.clientX, y: event.clientY, itemId, isFolder, itemTitle, itemParentPath });
    // 立即打印 contextMenu 状态的详细内容，以确保其值正确
    // 注意：这里的 console.log 可能仍会显示旧值，因为 setState 是异步的。
    // 但在 getContextMenuItems 内部应该能看到最新值。
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu({ ...contextMenu, show: false });
  }, [contextMenu]);

  // IPC 相关操作的统一处理函数
  const handleIPCAction = useCallback(async (action, ...args) => {
    try {
      const result = await invoke(action, ...args);
      if (result.success) {
        alert(result.message);
        fetchChapters(); // 刷新章节列表
      } else {
        alert(`操作失败: ${result.error}`);
        console.error(`操作失败: ${action}`, result.error);
      }
      return result;
    } catch (error) {
      alert(`调用 ${action} IPC 失败: ${error.message}`);
      console.error(`调用 ${action} IPC 失败:`, error);
      return { success: false, error: error.message };
    }
  }, [invoke, fetchChapters]);

  const handleDeleteItem = useCallback(async (itemId) => {
    if (window.confirm(`确定要删除 "${itemId}" 吗？`)) {
      dispatch(setNovelContent('')); // 清空编辑器内容
      dispatch(setCurrentFile(null)); // 清空当前文件
      await handleIPCAction('delete-item', itemId);
    }
  }, [handleIPCAction, dispatch]);

  const handleRenameConfirm = useCallback(async (oldItemId, newTitle) => {
    if (!newTitle || !newTitle.trim()) {
      alert('名称不能为空！');
      return;
    }

    // 从 chapters 中查找原始项，以获取其类型和原始文件名
    const findItemInChapters = (items, idToFind) => {
      for (const item of items) {
        if (item.id === idToFind) {
          return item;
        }
        if (item.children) {
          const found = findItemInChapters(item.children, idToFind);
          if (found) return found;
        }
      }
      return null;
    };

    const originalItem = findItemInChapters(chapters, oldItemId);
    if (!originalItem) {
        console.error('未找到要重命名的项:', oldItemId);
        alert('重命名失败：原始项不存在。');
        return;
    }

    let finalNewTitle = newTitle.trim();

    // 如果是文件，补回拓展名
    if (!originalItem.isFolder) {
        const originalFileName = originalItem.title; // 原始文件名，包含拓展名
        const lastDotIndex = originalFileName.lastIndexOf('.');
        if (lastDotIndex !== -1) {
            const originalExtension = originalFileName.substring(lastDotIndex); // 包括点号
            // 如果用户输入的新名称不包含拓展名，且原始文件名有拓展名，则自动补回原始拓展名
            if (!finalNewTitle.includes('.') && originalExtension) {
                finalNewTitle += originalExtension;
            }
        }
    }
    
    // 检查是否有重名 (这里需要更严谨地检查同级目录下的重名，但目前假设后端处理)
    // 暂时简化处理，只检查完全一样的名字
    // if (newTitle.trim() === getDisplayName(originalItem.title, originalItem.isFolder)) { // 应该比较显示名称
    //   // 名称未改变，取消编辑
    //   return;
    // }

    const result = await handleIPCAction('rename-item', oldItemId, finalNewTitle);

    if (result.success) {
      // 如果重命名的是当前打开的文件，则更新当前文件路径
      dispatch(setCurrentFile(result.newFilePath || finalNewTitle)); // result.newFilePath 应该由后端返回
      // 在重命名操作完成后，触发主进程的焦点修复
      invoke('trigger-focus-fix');
    }
  }, [handleIPCAction, dispatch, invoke, chapters, getDisplayName]);

  const handleRenameItem = useCallback((item) => {
    handleCloseContextMenu(); // 关闭右键菜单
    setCurrentRenameItemId(item.id);
    setCurrentRenameItemTitle(getDisplayName(item.title, item.isFolder)); // 使用 getDisplayName
    setShowRenameModal(true);
  }, [handleCloseContextMenu, getDisplayName]);

  const handleRenameModalConfirm = useCallback(() => {
    if (currentRenameItemId && currentRenameItemTitle) {
      handleRenameConfirm(currentRenameItemId, currentRenameItemTitle);
      setShowRenameModal(false);
      setCurrentRenameItemId(null);
      setCurrentRenameItemTitle('');
    }
  }, [currentRenameItemId, currentRenameItemTitle, handleRenameConfirm]);

  const handleRenameModalCancel = useCallback(() => {
    setShowRenameModal(false);
    setCurrentRenameItemId(null);
    setCurrentRenameItemTitle('');
  }, []);

  const handleNewFile = useCallback(async (parentPath = '') => {
    const defaultTitle = 'Untitled';
    let newTitleBase = defaultTitle;
    let newTitleWithExt = `${newTitleBase}.txt`;
    let counter = 1;


    const siblingItems = getSiblingItems(chapters, parentPath);

    // 检查同级目录下是否存在同名文件，并生成副本名称
    while (siblingItems.some(ch => !ch.isFolder && ch.title === newTitleWithExt)) {
        newTitleBase = `${defaultTitle}-副本${counter}`;
        newTitleWithExt = `${newTitleBase}.txt`;
        counter++;
    }

    await handleIPCAction('create-novel-file', { title: newTitleWithExt, content: '', parentPath });
    handleCloseContextMenu();
  }, [handleIPCAction, chapters, handleCloseContextMenu, getDisplayName]);

  const handleNewFolder = useCallback(async (parentPath = '') => {
    const defaultFolderName = '新文件夹'; // 更改默认文件夹名称为中文
    let newFolderNameBase = defaultFolderName;
    let newFolderName = newFolderNameBase;
    let counter = 1;


    const siblingItems = getSiblingItems(chapters, parentPath);

    // 检查同级目录下是否存在同名文件夹，并生成副本名称
    while (siblingItems.some(ch => ch.isFolder && ch.title === newFolderName)) {
        newFolderNameBase = `${defaultFolderName}-副本${counter}`;
        newFolderName = newFolderNameBase;
        counter++;
    }

    await handleIPCAction('create-folder', parentPath ? `${parentPath}/${newFolderName}` : newFolderName);
    handleCloseContextMenu();
  }, [handleIPCAction, chapters, handleCloseContextMenu, getDisplayName]);

  const handleCopy = useCallback((itemId, isCut) => {
    if (isCut) {
      setCutItem({ id: itemId, isCut: true });
      setCopiedItem(null);
    } else {
      setCopiedItem({ id: itemId, isCut: false });
      setCutItem(null);
    }
    handleCloseContextMenu();
  }, [handleCloseContextMenu]);

  const handlePaste = useCallback(async (targetFolderId) => {
    if (cutItem) {
      await handleIPCAction('move-item', cutItem.id, targetFolderId);
      setCutItem(null);
    } else if (copiedItem) {
      await handleIPCAction('copy-item', copiedItem.id, targetFolderId);
      setCopiedItem(null);
    }
    handleCloseContextMenu();
  }, [handleIPCAction, copiedItem, cutItem, handleCloseContextMenu]);


  // 递归渲染函数
  const renderChapterTree = useCallback((items, currentPath = '', level = 0) => {
    // 1. 文件夹优先排序
    const sortedItems = [...items].sort((a, b) => {
      if (a.isFolder && !b.isFolder) {
        return -1; // 文件夹排在文件前面
      }
      if (!a.isFolder && b.isFolder) {
        return 1; // 文件排在文件夹后面
      }
      return a.title.localeCompare(b.title); // 相同类型按字母排序
    });

    return (
      <ul className="chapter-list">
        {sortedItems.map((item) => {
          const isCollapsed = collapsedChapters[item.id];
          const hasChildren = item.children && item.children.length > 0;
          const displayName = getDisplayName(item.title, item.isFolder);

          return (
            <li
              key={item.id}
              className={`chapter-list-item ${item.isFolder ? 'folder-item' : 'file-item'} level-${level}`}
            >
              <div
                className={`chapter-item-content ${item.isFolder && level > 0 ? 'nested-folder-content' : ''}`}
                style={{ paddingLeft: `${10 + level * 15}px` }} // 根据层级增加缩进
                onContextMenu={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e, item.id, item.isFolder, item.title, item.isFolder ? item.id : (item.id.includes('/') ? item.id.substring(0, item.id.lastIndexOf('/')) : ''));
                }}
              >
                {item.isFolder && (
                  <span onClick={() => handleChapterClick(item)} className="collapse-icon">
                    <FontAwesomeIcon icon={isCollapsed ? faCaretRight : faCaretDown} />
                  </span>
                )}
                {/* 文件/文件夹图标 */}
                <FontAwesomeIcon icon={item.isFolder ? faFolder : faFile} className="item-icon" />

                <button
                  onClick={() => handleChapterClick(item)}
                  className="chapter-title-button"
                >
                  {displayName}
                </button>
              </div>
              {item.isFolder && hasChildren && !isCollapsed && (
                renderChapterTree(item.children, item.id, level + 1) // 递归渲染子项，层级加1
              )}
            </li>
          );
        })}
      </ul>
    );
  }, [collapsedChapters, handleContextMenu, handleChapterClick, getDisplayName]);

  const getContextMenuItems = useCallback(() => {
    const items = [];
    const isItemSelected = contextMenu.itemId !== null && contextMenu.itemId !== undefined && contextMenu.itemId !== ''; // 增加对空字符串的判断
    const canPaste = copiedItem || cutItem;

    // 根据右键点击的对象类型构建菜单项
    if (isItemSelected) {
        // 右键点击了文件或文件夹
        const isFolder = contextMenu.isFolder;
        const targetPath = isFolder ? contextMenu.itemId : contextMenu.itemParentPath;

        items.push(
            { label: '复制', onClick: () => handleCopy(contextMenu.itemId, false) },
            { label: '剪切', onClick: () => handleCopy(contextMenu.itemId, true) },
            { label: '重命名', onClick: () => handleRenameItem({ id: contextMenu.itemId, title: contextMenu.itemTitle }) },
            { label: '删除', onClick: () => handleDeleteItem(contextMenu.itemId) }
        );

        if (isFolder && canPaste) {
            // 右键点击文件夹，且有复制/剪切内容时显示粘贴
            items.push({ label: '粘贴', onClick: () => handlePaste(contextMenu.itemId) });
        }
        
        if (isFolder) {
            // 右键点击文件夹，显示新建文件和新建文件夹
            items.push(
                { label: '新建文件', onClick: () => handleNewFile(contextMenu.itemId) },
                { label: '新建文件夹', onClick: () => handleNewFolder(contextMenu.itemId) }
            );
        }
    } else {
        // 右键点击空白处 (contextMenu.itemId 为 null 或 undefined)
        items.push(
            { label: '新建文件', onClick: () => handleNewFile('') }, // 新建到根目录
            { label: '新建文件夹', onClick: () => handleNewFolder('') } // 新建到根目录
        );
        if (canPaste) {
            // 空白处有复制/剪切内容时显示粘贴到根目录
            items.push({ label: '粘贴', onClick: () => handlePaste('') });
        }
    }

    // 确保粘贴只在有复制或剪切项时显示，且在正确的目标路径下
    // 这里的逻辑已经通过上述 if-else 结构覆盖，但可以作为额外的检查或更精确的控制
    // if (canPaste) {
    //     // 如果是文件，粘贴到其父目录；如果是文件夹，粘贴到该文件夹内；如果是空白处，粘贴到根目录
    //     const pasteTargetPath = isItemSelected
    //         ? (contextMenu.isFolder ? contextMenu.itemId : contextMenu.itemParentPath)
    //         : '';
    //     if (!items.some(item => item.label === '粘贴')) { // 避免重复添加
    //         items.push({ label: '粘贴', onClick: () => handlePaste(pasteTargetPath) });
    //     }
    // }

    return items;
  }, [contextMenu, copiedItem, cutItem, handleNewFile, handleNewFolder, handleCopy, handlePaste, handleRenameItem, handleDeleteItem]);


  return (
    <div className="chapter-tree-panel-container">
      <div className="chapter-tree-panel-header">
        <button className="new-file-button" onClick={() => handleNewFile()}>
          <CombinedIcon baseIcon="file" overlayIcon="plus" size="sm" />
        </button>
        <button className="new-folder-button" onClick={() => handleNewFolder()}>
          <CombinedIcon baseIcon="folder" overlayIcon="plus" size="sm" />
        </button>
      </div>

      <div className="main-chapter-area"> {/* 新增的 div */}
        <div className="chapter-tree-panel-content" onContextMenu={(e) => handleContextMenu(e, null, false, null, '')}>
          {chapters.length === 0 ? (
            <p className="no-chapters-message">暂无文件</p>
          ) : (
            renderChapterTree(chapters)
          )}
        </div>
      </div> {/* 新增的 div 结束 */}

      {contextMenu.show && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={handleCloseContextMenu}
        />
      )}

      {/* 设置按钮区域 */}
      <div className="settings-button-area">
        <button className="settings-button" onClick={handleToggleSettings}>
          <FontAwesomeIcon icon={faGear} />
        </button>
      </div>

      {/* 设置模态框 */}
      {showSettings && (
        <div className="settings-modal-overlay">
          <div className="settings-modal-content">
            <h2>设置</h2>
            <div className="setting-item">
              <label htmlFor="apiKey">API Key:</label>
              <input
                type="text"
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="请输入您的 API Key"
              />
            </div>
            <div className="modal-actions">
              <button onClick={handleSaveApiKey} className="save-button">保存</button>
              <button onClick={handleCancelSettings} className="cancel-button">取消</button>
            </div>
          </div>
        </div>
      )}
      {/* 重命名模态框 */}
      {showRenameModal && (
        <div className="settings-modal-overlay"> {/* 复用 settings-modal-overlay 样式 */}
          <div className="settings-modal-content"> {/* 复用 settings-modal-content 样式 */}
            <h2>重命名</h2>
            <div className="setting-item">
              <label htmlFor="renameInput">新名称:</label>
              <input
                type="text"
                id="renameInput"
                value={currentRenameItemTitle}
                onChange={(e) => setCurrentRenameItemTitle(e.target.value)}
                onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                        handleRenameModalConfirm();
                    }
                }}
              />
            </div>
            <div className="modal-actions">
              <button onClick={handleRenameModalConfirm} className="save-button">确定</button>
              <button onClick={handleRenameModalCancel} className="cancel-button">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChapterTreePanel;