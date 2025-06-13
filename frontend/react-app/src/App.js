import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import './App.css';
import LayoutComponent from './components/LayoutComponent';
import EditorPanel from './components/EditorPanel';
import ChatPanel from './components/ChatPanel';
import ChapterTreePanel from './components/ChapterTreePanel';
import { registerMainIpcListeners } from './ipc/mainIpcHandler'; // 导入新的 IPC 处理模块
import { setNovelContent, setCurrentFile, triggerChapterRefresh } from './store/slices/novelSlice';

function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    const cleanupListeners = registerMainIpcListeners(dispatch); // 注册 IPC 监听器
    return () => {
      cleanupListeners(); // 清理监听器
    };
  }, [dispatch]); // 依赖 dispatch

  return (
    <div className="App">
      <LayoutComponent
        chapterPanel={<ChapterTreePanel />}
        editorPanel={<EditorPanel />}
        chatPanel={<ChatPanel />} // ChatPanel 不再需要传递 props，它会通过 useSelector 获取
      />
    </div>
  );
}

export default App;