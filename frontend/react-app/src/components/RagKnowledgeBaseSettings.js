import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setModeFeatureSetting,
  setRagCollectionNames,
  setAliyunEmbeddingApiKey,
  setIntentAnalysisModel,
  setAvailableModels,
  setShowRagSettingsModal
} from '../store/slices/chatSlice';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBook, faCheckSquare, faSquare, faSync } from '@fortawesome/free-solid-svg-icons';
import useIpcRenderer from '../hooks/useIpcRenderer';

const RagKnowledgeBaseSettings = forwardRef(({ onSaveComplete }, ref) => {
  const dispatch = useDispatch();
  const { invoke, setStoreValue } = useIpcRenderer();
  const {
    modeFeatureSettings,
    aliyunEmbeddingApiKey,
    intentAnalysisModel,
    availableModels
  } = useSelector((state) => state.chat);
  
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [localSettings, setLocalSettings] = useState({});
  const [localAliyunKey, setLocalAliyunKey] = useState('');
  const [localIntentModel, setLocalIntentModel] = useState('');

  // 从后端获取所有集合列表
  const fetchCollections = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke('list-kb-collections');
      if (result.success) {
        setCollections(result.collections || []);
      } else {
        setError(result.error || '获取集合列表失败');
      }
    } catch (err) {
      console.error('调用获取集合列表API失败:', err);
      setError('调用API失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 加载RAG相关设置
  const loadRagSettings = useCallback(async () => {
    try {
      // 从存储加载阿里云API Key和意图分析模型
      const [storedAliyunKey, storedIntentModel] = await Promise.all([
        invoke('get-store-value', 'aliyunEmbeddingApiKey'),
        invoke('get-store-value', 'intentAnalysisModel')
      ]);
      
      setLocalAliyunKey(storedAliyunKey || '');
      setLocalIntentModel(storedIntentModel || '');
      
      // 加载可用模型列表
      const models = await invoke('get-available-models');
      if (models.success) {
        dispatch(setAvailableModels(models.models));
      }
    } catch (error) {
      console.error('加载RAG设置失败:', error);
    }
  }, [invoke, dispatch]);

  // 初始化加载设置和集合列表
  useEffect(() => {
    // 从Redux状态初始化本地设置
    setLocalSettings(modeFeatureSettings);
    fetchCollections();
    loadRagSettings();
  }, [modeFeatureSettings, loadRagSettings]);

  // 处理集合选择变化
  const handleCollectionChange = (mode, collectionName, checked) => {
    setLocalSettings(prev => {
      const currentCollections = prev[mode]?.ragCollectionNames || [];
      let newCollections;
      
      if (checked) {
        // 添加集合
        newCollections = [...currentCollections, collectionName];
      } else {
        // 移除集合
        newCollections = currentCollections.filter(name => name !== collectionName);
      }
      
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          ragCollectionNames: newCollections
        }
      };
    });
  };

  // 处理RAG检索开关变化
  const handleRagToggle = (mode, enabled) => {
    setLocalSettings(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        ragRetrievalEnabled: enabled
      }
    }));
  };

  // 处理外部链接点击
  const handleExternalLinkClick = (url, e) => {
    e.preventDefault();
    invoke('open-external', url);
  };

  // 保存设置
  const handleSave = async () => {
    try {
      // 保存所有模式的设置
      for (const mode of ['general', 'outline', 'writing', 'adjustment']) {
        const settings = localSettings[mode];
        if (settings) {
          // 保存RAG检索启用状态
          dispatch(setModeFeatureSetting({
            mode,
            feature: 'ragRetrievalEnabled',
            enabled: settings.ragRetrievalEnabled || false
          }));
          
          // 保存集合选择
          dispatch(setRagCollectionNames({
            mode,
            collectionNames: settings.ragCollectionNames || []
          }));
        }
      }
      
      // 保存RAG模型设置
      dispatch(setAliyunEmbeddingApiKey(localAliyunKey));
      dispatch(setIntentAnalysisModel(localIntentModel));
      
      // 保存到持久化存储
      await Promise.all([
        invoke('set-store-value', 'modeFeatureSettings', localSettings),
        setStoreValue('aliyunEmbeddingApiKey', localAliyunKey),
        setStoreValue('intentAnalysisModel', localIntentModel)
      ]);
      
      // 重新初始化阿里云嵌入函数
      await invoke('reinitialize-aliyun-embedding');
      
      if (onSaveComplete) {
        onSaveComplete('RAG知识库设置保存成功！', true);
      }
    } catch (error) {
      console.error('保存RAG知识库设置失败:', error);
      if (onSaveComplete) {
        onSaveComplete('RAG知识库设置保存失败，请重试。', false);
      }
    }
  };

  const getModeDisplayName = (mode) => {
    const names = {
      general: '通用',
      outline: '细纲',
      writing: '写作',
      adjustment: '调整'
    };
    return names[mode] || mode;
  };

  const isCollectionSelected = (mode, collectionName) => {
    return localSettings[mode]?.ragCollectionNames?.includes(collectionName) || false;
  };

  // 暴露保存方法给父组件
  useImperativeHandle(ref, () => ({
    handleSave
  }));

  return (
    <div className="tab-content">
      {/* RAG模型配置部分 */}
      <div className="settings-section">
        <h4>RAG模型配置</h4>
        
        <div className="setting-item">
          <label htmlFor="aliyunEmbeddingApiKey">阿里云嵌入API Key:</label>
          <input
            type="password"
            id="aliyunEmbeddingApiKey"
            value={localAliyunKey || ''}
            onChange={(e) => setLocalAliyunKey(e.target.value)}
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
            value={localIntentModel || ''}
            onChange={(e) => setLocalIntentModel(e.target.value)}
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
      </div>

      <div className="rag-settings-header">
        <button
          className="refresh-button"
          onClick={fetchCollections}
          disabled={loading}
        >
          <FontAwesomeIcon icon={faSync} spin={loading} />
          {loading ? '加载中...' : '刷新集合列表'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}

      {collections.length === 0 && !loading ? (
        <div className="no-collections">
          <p>暂无知识库集合，请先导入文件到知识库。</p>
        </div>
      ) : (
        <div className="rag-settings-sections">
          {['general', 'outline', 'writing', 'adjustment'].map((mode) => (
            <div key={mode} className="rag-settings-section">
              <h3>{getModeDisplayName(mode)}模式</h3>
              
              <div className="rag-toggle">
                <input
                  type="checkbox"
                  id={`${mode}-rag-toggle`}
                  checked={localSettings[mode]?.ragRetrievalEnabled || false}
                  onChange={(e) => handleRagToggle(mode, e.target.checked)}
                />
                <label htmlFor={`${mode}-rag-toggle`}>
                  启用RAG检索
                </label>
                <div className="feature-description">
                  在此模式下允许AI使用知识库检索功能获取相关信息
                </div>
              </div>

              {localSettings[mode]?.ragRetrievalEnabled && (
                <div className="collection-selection">
                  <h4>选择要查询的知识库集合:</h4>
                  <div className="collection-list">
                    {collections.map((collection) => (
                      <div key={collection.collectionName} className="collection-item">
                        <label>
                          <FontAwesomeIcon
                            icon={isCollectionSelected(mode, collection.collectionName) ? faCheckSquare : faSquare}
                            className="collection-checkbox"
                            onClick={(e) => {
                              if (!localSettings[mode]?.ragRetrievalEnabled) return;
                              handleCollectionChange(mode, collection.collectionName, !isCollectionSelected(mode, collection.collectionName));
                            }}
                            style={{
                              cursor: localSettings[mode]?.ragRetrievalEnabled ? 'pointer' : 'not-allowed',
                              opacity: localSettings[mode]?.ragRetrievalEnabled ? 1 : 0.5
                            }}
                          />
                          <span className="collection-info">
                            <strong>{collection.filename}</strong>
                            <span className="collection-details">
                              ({collection.documentCount} 个片段) - {collection.collectionName}
                            </span>
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="collection-help">
                    <p>💡 提示：选择特定的集合可以提高检索精度，减少无关信息的干扰。</p>
                    <p>如果不选择任何集合，将查询所有可用的知识库集合。</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  );
});

export default RagKnowledgeBaseSettings;