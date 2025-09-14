import React, { useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  setSelectedModel,
  setSelectedProvider,
  setDeepseekApiKey,
  setOpenrouterApiKey,
  setAliyunEmbeddingApiKey,
  setIntentAnalysisModel,
  setAvailableModels
} from '../store/slices/chatSlice';
import useIpcRenderer from '../hooks/useIpcRenderer';
import CustomProviderSettings from './CustomProviderSettings';

const ApiSettingsTab = ({ onSaveComplete }) => {
  const dispatch = useDispatch();
  const { invoke, setStoreValue, reinitializeModelProvider, reinitializeAliyunEmbedding } = useIpcRenderer();
  const {
    selectedModel,
    selectedProvider,
    deepseekApiKey,
    openrouterApiKey,
    aliyunEmbeddingApiKey,
    intentAnalysisModel,
    availableModels
  } = useSelector((state) => state.chat);

  // 加载设置
  const loadSettings = useCallback(async () => {
    try {
      // 从存储加载保存的设置
      const [storedModel, storedProvider, storedDeepseekKey, storedOpenrouterKey, storedAliyunKey, storedIntentModel] = await Promise.all([
        invoke('get-store-value', 'selectedModel'),
        invoke('get-store-value', 'selectedProvider'),
        invoke('get-store-value', 'deepseekApiKey'),
        invoke('get-store-value', 'openrouterApiKey'),
        invoke('get-store-value', 'aliyunEmbeddingApiKey'),
        invoke('get-store-value', 'intentAnalysisModel')
      ]);

      // 更新Redux store中的设置
      if (storedModel) {
        dispatch(setSelectedModel(storedModel));
      }
      if (storedProvider) {
        dispatch(setSelectedProvider(storedProvider));
      }
      if (storedDeepseekKey) {
        dispatch(setDeepseekApiKey(storedDeepseekKey));
      }
      if (storedOpenrouterKey) {
        dispatch(setOpenrouterApiKey(storedOpenrouterKey));
      }
      if (storedAliyunKey) {
        dispatch(setAliyunEmbeddingApiKey(storedAliyunKey));
      }
      if (storedIntentModel) {
        dispatch(setIntentAnalysisModel(storedIntentModel));
      }

      // 加载可用模型列表
      const models = await invoke('get-available-models');
      if (models.success) {
        dispatch(setAvailableModels(models.models));
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }, [invoke, dispatch]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleProviderChange = (e) => {
    const provider = e.target.value;
    dispatch(setSelectedProvider(provider));
    
    // 自动选择该提供商的第一个模型
    const providerModels = availableModels.filter(model => model.provider === provider);
    if (providerModels.length > 0) {
      dispatch(setSelectedModel(providerModels[0].id));
    }
  };

  const handleModelChange = (e) => {
    dispatch(setSelectedModel(e.target.value));
  };

  const handleExternalLinkClick = (url, e) => {
    e.preventDefault();
    invoke('open-external', url);
  };

  const handleRedetectOllama = async () => {
    try {
      const result = await invoke('redetect-ollama');
      if (result.success) {
        loadSettings(); // 重新加载模型列表
      } else {
        console.error('Ollama服务重新检测失败:', result.error);
      }
    } catch (error) {
      console.error('调用Ollama重连失败:', error);
    }
  };

  const handleSave = async () => {
    try {
      console.log('[API设置保存] 开始保存，当前Redux状态:', {
        selectedModel,
        selectedProvider,
        deepseekApiKey: deepseekApiKey ? '已设置(隐藏)' : '未设置',
        openrouterApiKey: openrouterApiKey ? '已设置(隐藏)' : '未设置',
        aliyunEmbeddingApiKey: aliyunEmbeddingApiKey ? '已设置(隐藏)' : '未设置',
        intentAnalysisModel
      });

      // 保存到持久化存储 - 直接使用Redux状态
      await Promise.all([
        setStoreValue('deepseekApiKey', deepseekApiKey),
        setStoreValue('openrouterApiKey', openrouterApiKey),
        setStoreValue('aliyunEmbeddingApiKey', aliyunEmbeddingApiKey),
        setStoreValue('intentAnalysisModel', intentAnalysisModel),
        setStoreValue('selectedModel', selectedModel),
        setStoreValue('selectedProvider', selectedProvider)
      ]);

      console.log('[API设置保存] 存储保存完成，保存的值:', {
        selectedModel,
        selectedProvider,
        intentAnalysisModel
      });

      // 重新初始化API提供者以确保新设置立即生效
      try {
        // 重新初始化模型提供者
        await reinitializeModelProvider();
        
        // 重新初始化阿里云嵌入函数
        await reinitializeAliyunEmbedding();
        console.log('[API设置保存] API重新初始化完成');
      } catch (error) {
        console.warn('重新初始化API时出错:', error);
      }

      // 通知保存成功
      if (onSaveComplete) {
        onSaveComplete('API设置保存成功！', true);
      }
      
      console.log('[API设置保存] 保存流程完成，通知已发送');
      
      // 保存后手动触发重新加载设置以确保状态同步
      loadSettings();
      console.log('[API设置保存] 设置重新加载已触发');
      
    } catch (error) {
      console.error('保存API设置失败:', error);
      // 通知保存失败
      if (onSaveComplete) {
        onSaveComplete('API设置保存失败，请重试。', false);
      }
    }
  };

  return (
    <div className="tab-content">
      <h3>API设置</h3>
      
      {/* 对话模型部分 */}
      <div className="settings-section">
        <h4>对话模型</h4>
        
        <div className="setting-item">
          <label htmlFor="providerSelect">选择提供商:</label>
          <select
            id="providerSelect"
            value={selectedProvider || ''}
            onChange={handleProviderChange}
          >
            {[...new Set(availableModels.map(model => model.provider))].map(provider => (
              <option key={provider} value={provider}>
                {provider.charAt(0).toUpperCase() + provider.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {selectedProvider === 'deepseek' && (
          <div className="setting-item">
            <label htmlFor="deepseekApiKey">DeepSeek API Key:</label>
            <input
              type="text"
              id="deepseekApiKey"
              value={deepseekApiKey || ''}
              onChange={(e) => dispatch(setDeepseekApiKey(e.target.value))}
              placeholder="请输入您的 DeepSeek API Key"
            />
          </div>
        )}

        {selectedProvider === 'openrouter' && (
          <div className="setting-item">
            <label htmlFor="openrouterApiKey">OpenRouter API Key:</label>
            <input
              type="text"
              id="openrouterApiKey"
              value={openrouterApiKey || ''}
              onChange={(e) => dispatch(setOpenrouterApiKey(e.target.value))}
              placeholder="请输入您的 OpenRouter API Key"
            />
          </div>
        )}

        <div className="setting-item">
          <label htmlFor="modelSelect">正文生成模型:</label>
          <select
            id="modelSelect"
            value={selectedModel || ''}
            onChange={handleModelChange}
          >
            {availableModels
              .filter(model => model.provider === selectedProvider)
              .map((model) => (
                <option key={model.id} value={model.id}>
                  {model.id}
                </option>
              ))}
          </select>
        </div>

        <div className="setting-item">
          <label>Ollama服务重连（仅使用ollama但无服务时使用）:</label>
          <button
            onClick={handleRedetectOllama}
            className="redetect-button"
            title="如果忘记先启动Ollama服务，点击此按钮重新检测"
          >
            重新检测Ollama服务
          </button>
          <div className="setting-description">
            如果忘记先启动Ollama服务，点击此按钮重新检测。请确保Ollama服务已启动。
          </div>
        </div>
      </div>

      {/* RAG模型部分 */}
      <div className="settings-section">
        <h4>RAG模型</h4>
        
        <div className="setting-item">
          <label htmlFor="aliyunEmbeddingApiKey">阿里云嵌入API Key:</label>
          <input
            type="password"
            id="aliyunEmbeddingApiKey"
            value={aliyunEmbeddingApiKey || ''}
            onChange={(e) => dispatch(setAliyunEmbeddingApiKey(e.target.value))}
            placeholder="请输入您的阿里云嵌入API Key"
          />
          <div className="setting-description">
            用于RAG功能的文本嵌入模型，获取地址：<a href="https://www.aliyun.com/product/bailian" onClick={(e) => handleExternalLinkClick('https://www.aliyun.com/product/bailian', e)} style={{cursor: 'pointer', color: '#007acc', textDecoration: 'underline'}}>阿里云百炼</a>
          </div>
        </div>

        <div className="setting-item">
          <label htmlFor="intentAnalysisModel">意图分析模型:</label>
          <select
            id="intentAnalysisModel"
            value={intentAnalysisModel || ''}
            onChange={(e) => dispatch(setIntentAnalysisModel(e.target.value))}
          >
            <option value="">使用默认模型（自动选择）</option>
            {availableModels.map(model => (
              <option key={model.id} value={model.id}>
                {model.name} ({model.provider})
              </option>
            ))}
          </select>
          <div className="setting-description">
            用于分析写作意图和生成检索词的AI模型
          </div>
        </div>

        {/* 自定义提供商设置组件 */}
        <CustomProviderSettings />
      </div>

      <div className="modal-actions" style={{ marginTop: '20px' }}>
        <button className="save-button" onClick={handleSave}>
          保存
        </button>
      </div>
    </div>
  );
};

export default ApiSettingsTab;