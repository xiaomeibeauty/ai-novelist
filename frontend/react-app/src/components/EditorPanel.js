import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setNovelContent, createNovelFile, updateNovelTitle } from '../store/slices/novelSlice';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faSave } from '@fortawesome/free-solid-svg-icons';

import './EditorPanel.css';
 
import useIpcRenderer from '../hooks/useIpcRenderer';
 
function EditorPanel() {
  const dispatch = useDispatch();
  const novelContent = useSelector((state) => state.novel.novelContent);
  const currentFile = useSelector((state) => state.novel.currentFile);
  const editorRef = useRef(null);
  const TiptapEditorInstance = useRef(null);
  const titleInputRef = useRef(null);
  const initialContentRef = useRef('');
  const { invoke } = useIpcRenderer();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
 
  // 保存文件内容的函数 (现在不接受参数，直接从组件状态中获取)
  // 保存文件内容的函数 (现在不接受参数，直接从组件状态中获取)
  // 保存文件内容的函数 (现在不接受参数，直接从组件状态中获取)
  const saveContent = useCallback(
    async (isManualSave = false) => { // 添加参数判断是否为手动保存
      const filePath = currentFile;
      const content = TiptapEditorInstance.current?.getHTML();

      console.log('[EditorPanel] saveContent: 尝试保存文件，filePath:', filePath);

      // 如果没有选择文件，直接返回失败，不再弹窗
      if (!filePath || filePath === '未选择') {
        console.warn('无法保存文件：文件路径无效或未选择文件。', filePath);
        return { success: false, error: '文件路径无效或未选择文件。' };
      }

      // 如果内容未定义，直接返回失败，不再弹窗
      if (content === undefined) {
        console.warn('无法获取编辑器内容进行保存。');
        return { success: false, error: '无法获取编辑器内容。' };
      }

      try {
        const result = await invoke('save-novel-content', filePath, content);
        if (!result.success) {
          console.error('文件保存失败:', result.error);
          // 仅在手动保存时弹窗失败提示
          if (isManualSave) {
            alert(`文件保存失败: ${result.error}`);
          }
          return { success: false, error: result.error };
        } else {
          console.log('文件保存成功！');
          initialContentRef.current = content;
          setHasUnsavedChanges(false);
          if (window.electron) {
            window.electron.setUnsavedChanges(false);
          }
          // 仅在手动保存时弹窗成功提示
          if (isManualSave) {
            alert('文件保存成功！');
          }
          return { success: true };
        }
      } catch (error) {
        console.error('保存过程中发生异常:', error);
        // 仅在手动保存时弹窗异常提示
        if (isManualSave) {
           alert(`保存过程中发生异常: ${error.message}`);
        }
        return { success: false, error: error.message };
      }
    },
    [invoke, currentFile]
  );
 
  // 使用 useRef 存储 saveContent 的最新引用
  const saveContentRef = useRef(saveContent);
  useEffect(() => {
    saveContentRef.current = saveContent;
  }, [saveContent]);

  // 使用标准IPC监听保存并退出请求
  useEffect(() => {
    // 确保 window.api 在这里被正确识别和使用
    if (!window.api || typeof window.api.on !== 'function' || typeof window.api.send !== 'function') {
      console.warn('window.api 未完全初始化或其方法不可用，无法注册保存退出请求监听器');
      return;
    }

    let isProcessingSaveAndQuit = false; // 添加标志

    const handler = async () => {
      if (isProcessingSaveAndQuit) {
        console.warn('[EditorPanel] save-and-quit-request 已在处理中，跳过重复请求。');
        return;
      }
      isProcessingSaveAndQuit = true;

      console.log('[EditorPanel] 收到主进程的 save-and-quit-request 请求。');
      
      let saveResult;
      try {
        saveResult = await saveContentRef.current(false); // 传入 false 表示非手动保存
      } catch (error) {
        console.error('[EditorPanel] saveContent 调用失败:', error);
        saveResult = { success: false, error: error.message };
      } finally {
        // 无论成功失败，都发送响应
        if (window.api && window.api.send) {
          window.api.send('save-and-quit-response', saveResult);
        } else {
          console.error('window.api.send 不可用，无法发送保存响应。');
        }
        isProcessingSaveAndQuit = false; // 处理完成后重置标志
      }
    };

    // 监听 save-and-quit-request 事件，此 useEffect 依赖项为空，确保只注册一次
    window.api.on('save-and-quit-request', handler);

    return () => {
      // 在组件卸载时移除监听器
      if (window.api && typeof window.api.removeListener === 'function') {
        window.api.removeListener('save-and-quit-request', handler);
      }
    };
  }, []); // 依赖项为空数组，确保只注册一次

  // 修改 handleSaveButtonClick 调用 saveContent 时传入 true
  const handleSaveButtonClick = useCallback(() => {
    saveContent(true); // 传入 true 表示手动保存
  }, [saveContent]);
  
  const [title, setTitle] = useState('未命名');
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [isTitleEditing, setIsTitleEditing] = useState(false);
 
  const handleEditorChange = useCallback(({ editor }) => {
    const newContent = editor.getHTML();
    dispatch(setNovelContent(newContent));
    console.log('[EditorPanel] handleEditorChange: currentFile:', currentFile);

    const changed = newContent !== initialContentRef.current;
    setHasUnsavedChanges(prevHasUnsavedChanges => {
      if (changed !== prevHasUnsavedChanges) {
        if (window.electron) {
          window.electron.setUnsavedChanges(changed);
        }
        return changed;
      }
      return prevHasUnsavedChanges;
    });
  }, [dispatch, currentFile]);
 
  const handleEditorClick = useCallback((e) => {
    const editor = TiptapEditorInstance.current;
    if (!editor) return;

    const { clientY } = e;
    const editorBounds = editorRef.current.getBoundingClientRect();

    const proseMirrorContent = editorRef.current.querySelector('.ProseMirror');
    if (!proseMirrorContent) return;

    const contentBottom = proseMirrorContent.getBoundingClientRect().bottom;

    if (clientY > contentBottom && clientY < editorBounds.bottom) {
      editor.commands.focus('end');
    }
  }, []);

  useEffect(() => {
    if (!TiptapEditorInstance.current) {
      TiptapEditorInstance.current = new Editor({
        element: editorRef.current,
        extensions: [
          StarterKit,
        ],
        content: typeof novelContent === 'string' ? novelContent : '',
        onUpdate: handleEditorChange,
        onFocus: ({ editor }) => {
          editor.commands.focus();
        },
      });
      initialContentRef.current = typeof novelContent === 'string' ? novelContent : '';
      setHasUnsavedChanges(false);
      if (window.electron) {
        window.electron.setUnsavedChanges(false);
      }
    }
 
    if (TiptapEditorInstance.current) {
      TiptapEditorInstance.current.setOptions({ onUpdate: handleEditorChange });
    }
 
    return () => {
      if (TiptapEditorInstance.current) {
        TiptapEditorInstance.current.destroy();
        TiptapEditorInstance.current = null;
      }
    };
  }, [handleEditorChange]);

  useEffect(() => {
    const contentToSet = typeof novelContent === 'string' ? novelContent : '';
    if (TiptapEditorInstance.current && contentToSet !== TiptapEditorInstance.current.getHTML()) {
      TiptapEditorInstance.current.commands.setContent(contentToSet, false);
      initialContentRef.current = contentToSet;
      setHasUnsavedChanges(false);
      if (window.electron) {
        window.electron.setUnsavedChanges(false);
      }
    }
  }, [novelContent]);

  useEffect(() => {
    console.log('[EditorPanel] useEffect [currentFile]: currentFile 变化:', currentFile);
    if (currentFile) {
      const pureTitle = currentFile.replace(/^novel\//, '').replace(/\.txt$/, '');
      setTitle(pureTitle);
    } else {
      setTitle('未命名');
    }
  }, [currentFile]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setShowContextMenu(false);
    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showContextMenu]);

  const handleMenuItemClick = useCallback((action) => {
    const editor = TiptapEditorInstance.current;
    if (!editor) return;

    switch (action) {
      case 'cut':
        if (!editor.state.selection.empty) {
          navigator.clipboard.writeText(editor.getSelection().content().asText());
          editor.commands.deleteSelection();
        }
        break;
      case 'copy':
        if (!editor.state.selection.empty) {
          navigator.clipboard.writeText(editor.getSelection().content().asText());
        }
        break;
      case 'paste':
        navigator.clipboard.readText().then(text => {
          editor.commands.insertContent(text);
        }).catch(err => console.error('Failed to read clipboard contents: ', err));
        break;
      case 'insert':
        console.log('Insert clicked (functionality not yet implemented)');
        break;
      case 'selectAll':
        editor.commands.selectAll();
        break;
      default:
        break;
    }
    setShowContextMenu(false);
  }, []);

  const isSelectionActive = TiptapEditorInstance.current ? !TiptapEditorInstance.current.state.selection.empty : false;

  const handleTitleSave = useCallback(async () => {
    const pureCurrentTitle = currentFile ? currentFile.replace(/^novel\//, '').replace(/\.txt$/, '') : '';

    if (title && title !== pureCurrentTitle) {
      try {
        await dispatch(updateNovelTitle({ oldFilePath: currentFile, newTitle: title })).unwrap();
        console.log('标题保存成功:', title);
      } catch (error) {
        console.error('标题保存失败:', error);
        // 不在标题保存失败时弹窗，只打印错误
        // alert(`标题保存失败: ${error}`);
      }
    }
    if (currentFile) {
      const updatedPureTitle = currentFile.replace(/^novel\//, '').replace(/\.txt$/, '');
      setTitle(updatedPureTitle);
    }
    setIsTitleEditing(false);
  }, [dispatch, title, currentFile]);


  return (
    <div className="editor-panel-content">
      {console.log('[EditorPanel] Render: currentFile:', currentFile, 'hasUnsavedChanges:', hasUnsavedChanges)}
      <div className="title-bar">
        <input
          type="text"
          ref={titleInputRef}
          className="novel-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => {
            if (title === '未命名') {
              setTitle('');
            }
          }}
          onBlur={async () => {
            await handleTitleSave();
          }}
          onKeyDown={async (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              await handleTitleSave();
              if (TiptapEditorInstance.current) {
                TiptapEditorInstance.current.commands.focus('start');
              }
            }
          }}
        />
        <button className="save-button" onClick={handleSaveButtonClick}>
          <FontAwesomeIcon icon={faSave} />
        </button>
        {hasUnsavedChanges && <span className="unsaved-indicator">*</span>}
      </div>
      <div
        ref={editorRef}
        className="tiptap-editor"
        onContextMenu={handleContextMenu}
        onClick={handleEditorClick}
      ></div>
      {showContextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
        >
          <div
            className={`context-menu-item ${isSelectionActive ? '' : 'disabled'}`}
            onClick={() => handleMenuItemClick('cut')}
          >
            剪切
          </div>
          <div
            className="context-menu-item"
            onClick={() => handleMenuItemClick('copy')}
          >
            复制
          </div>
          <div
            className="context-menu-item"
            onClick={() => handleMenuItemClick('paste')}
          >
            粘贴
          </div>
          <div
            className="context-menu-item"
            onClick={() => handleMenuItemClick('insert')}
          >
            插入
          </div>
          <div
            className="context-menu-item"
            onClick={() => handleMenuItemClick('selectAll')}
          >
            全选
          </div>
        </div>
      )}
    </div>
  );
}

export default EditorPanel;