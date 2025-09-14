import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import './App.css';
import LayoutComponent from './components/LayoutComponent';
import EditorPanel from './components/EditorPanel';
import ChatPanel from './components/ChatPanel';
import ChapterTreePanel from './components/ChapterTreePanel';
import { registerMainIpcListeners } from './ipc/mainIpcHandler'; // 导入新的 IPC 处理模块
import { setNovelContent, setCurrentFile, triggerChapterRefresh } from './store/slices/novelSlice';
import useIpcRenderer from './hooks/useIpcRenderer';
import {
  setCustomPromptForMode,
  setModeFeatureSetting,
  setAdditionalInfoForMode,
  setSelectedModel,
  setSelectedProvider,
  setDeepseekApiKey,
  setOpenrouterApiKey,
  setAliyunEmbeddingApiKey,
  setIntentAnalysisModel,
  setEnableStream
} from './store/slices/chatSlice';

function App() {
  const dispatch = useDispatch();

  const { getStoreValue } = useIpcRenderer();

  useEffect(() => {
    const cleanupListeners = registerMainIpcListeners(dispatch); // 注册 IPC 监听器

    // 项目启动时加载所有设置
    const loadAppSettings = async () => {
      try {
        console.log('[App] 开始从存储加载设置...');
        
        // 从存储获取所有设置
        const [
          storedCustomPrompts,
          storedModeFeatureSettings,
          storedAdditionalInfo,
          storedSelectedModel,
          storedSelectedProvider,
          storedDeepseekApiKey,
          storedOpenrouterApiKey,
          storedAliyunEmbeddingApiKey,
          storedIntentAnalysisModel,
          storedEnableStream
        ] = await Promise.all([
          getStoreValue('customPrompts'),
          getStoreValue('modeFeatureSettings'),
          getStoreValue('additionalInfo'),
          getStoreValue('selectedModel'),
          getStoreValue('selectedProvider'),
          getStoreValue('deepseekApiKey'),
          getStoreValue('openrouterApiKey'),
          getStoreValue('aliyunEmbeddingApiKey'),
          getStoreValue('intentAnalysisModel'),
          getStoreValue('enableStream')
        ]);

        console.log('[App] 从存储获取的设置:');
        console.log('[App] customPrompts:', JSON.stringify(storedCustomPrompts, null, 2));
        console.log('[App] modeFeatureSettings:', JSON.stringify(storedModeFeatureSettings, null, 2));
        console.log('[App] additionalInfo:', JSON.stringify(storedAdditionalInfo, null, 2));

        // 更新Redux store中的设置
        if (storedCustomPrompts) {
          Object.entries(storedCustomPrompts).forEach(([mode, prompt]) => {
            dispatch(setCustomPromptForMode({ mode, prompt }));
          });
        }
        
        if (storedModeFeatureSettings) {
          Object.entries(storedModeFeatureSettings).forEach(([mode, settings]) => {
            if (settings.ragRetrievalEnabled !== undefined) {
              dispatch(setModeFeatureSetting({ mode, feature: 'ragRetrievalEnabled', enabled: settings.ragRetrievalEnabled }));
            }
          });
        }
        
        if (storedAdditionalInfo) {
          Object.entries(storedAdditionalInfo).forEach(([mode, info]) => {
            dispatch(setAdditionalInfoForMode({ mode, info }));
          });
        }

        // 加载其他设置
        if (storedSelectedModel) dispatch(setSelectedModel(storedSelectedModel));
        if (storedSelectedProvider) dispatch(setSelectedProvider(storedSelectedProvider));
        if (storedDeepseekApiKey) dispatch(setDeepseekApiKey(storedDeepseekApiKey));
        if (storedOpenrouterApiKey) dispatch(setOpenrouterApiKey(storedOpenrouterApiKey));
        if (storedAliyunEmbeddingApiKey) dispatch(setAliyunEmbeddingApiKey(storedAliyunEmbeddingApiKey));
        if (storedIntentAnalysisModel) dispatch(setIntentAnalysisModel(storedIntentAnalysisModel));
        if (storedEnableStream !== undefined) dispatch(setEnableStream(storedEnableStream !== false));

        console.log('[App] 设置加载完成');
      } catch (error) {
        console.error('[App] 加载设置失败:', error);
      }
    };

    loadAppSettings();

    return () => {
      cleanupListeners(); // 清理监听器
    };
  }, [dispatch, getStoreValue]); // 依赖 dispatch 和 getStoreValue

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