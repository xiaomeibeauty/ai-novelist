import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setCustomPromptForMode,
  resetCustomPromptForMode,
  setModeFeatureSetting,
  resetModeFeatureSettings,
  setAdditionalInfoForMode,
  resetAdditionalInfoForMode,
  setContextLimitSettings
} from '../store/slices/chatSlice';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUndo, faSave } from '@fortawesome/free-solid-svg-icons';
import useIpcRenderer from '../hooks/useIpcRenderer';
import ModeContextSettings from './ModeContextSettings';

const GeneralSettingsTab = ({ onSaveComplete }) => {
  const dispatch = useDispatch();
  const { invoke, getStoreValue } = useIpcRenderer();
  const { customPrompts, modeFeatureSettings, additionalInfo } = useSelector((state) => state.chat);
  
  const [localPrompts, setLocalPrompts] = useState({});
  const [localFeatureSettings, setLocalFeatureSettings] = useState({});
  const [localAdditionalInfo, setLocalAdditionalInfo] = useState({});
  const [defaultPrompts, setDefaultPrompts] = useState({});
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);

  // 从后端获取默认提示词
  const fetchDefaultPrompts = async () => {
    setIsLoadingPrompts(true);
    try {
      const result = await invoke('get-default-prompts');
      if (result.success) {
        setDefaultPrompts(result.prompts);
      } else {
        // 如果后端获取失败，使用前端默认值作为fallback
        setDefaultPrompts({
          general: `你是一个**工具使用型AI**，精通使用各种工具来完成用户请求。`,
          outline: `你是一位小说创作顾问，负责与用户深度沟通本章核心需求。`,
          writing: `你是一位专业小说代笔，需严格基于用户提供的【最终版细纲】进行创作。`,
          adjustment: `你是一位资深编辑和小说精修师。`
        });
      }
    } catch (error) {
      console.error('调用获取默认提示词API失败:', error);
    } finally {
      setIsLoadingPrompts(false);
    }
  };

  // 直接从存储加载设置，避免Redux状态同步问题
  const loadSettingsFromStore = async () => {
    try {
      console.log('[GeneralSettingsTab] 开始直接从存储加载设置...');
      
      // 从存储获取所有设置
      const [storedCustomPrompts, storedModeFeatureSettings, storedAdditionalInfo] = await Promise.all([
        getStoreValue('customPrompts'),
        getStoreValue('modeFeatureSettings'),
        getStoreValue('additionalInfo')
      ]);
      
      console.log('[GeneralSettingsTab] 从存储获取的设置:');
      console.log('[GeneralSettingsTab] customPrompts:', JSON.stringify(storedCustomPrompts, null, 2));
      console.log('[GeneralSettingsTab] modeFeatureSettings:', JSON.stringify(storedModeFeatureSettings, null, 2));
      console.log('[GeneralSettingsTab] additionalInfo:', JSON.stringify(storedAdditionalInfo, null, 2));
      
      // 设置本地状态
      setLocalPrompts(storedCustomPrompts || {});
      setLocalFeatureSettings(storedModeFeatureSettings || {});
      
      // 处理附加信息的旧格式迁移
      const migratedAdditionalInfo = {};
      const additionalInfoData = storedAdditionalInfo || {};
      
      for (const mode of ['general', 'outline', 'writing', 'adjustment']) {
        const modeInfo = additionalInfoData[mode];
        if (typeof modeInfo === 'string') {
          migratedAdditionalInfo[mode] = {
            outline: modeInfo,
            previousChapter: '',
            characterSettings: ''
          };
        } else if (typeof modeInfo === 'object' && modeInfo !== null) {
          migratedAdditionalInfo[mode] = {
            outline: modeInfo.outline || '',
            previousChapter: modeInfo.previousChapter || '',
            characterSettings: modeInfo.characterSettings || ''
          };
        } else {
          migratedAdditionalInfo[mode] = {
            outline: '',
            previousChapter: '',
            characterSettings: ''
          };
        }
      }
      setLocalAdditionalInfo(migratedAdditionalInfo);
      
      console.log('[GeneralSettingsTab] 直接从存储加载完成:');
      console.log('[GeneralSettingsTab] localPrompts:', JSON.stringify(storedCustomPrompts, null, 2));
      console.log('[GeneralSettingsTab] localFeatureSettings:', JSON.stringify(storedModeFeatureSettings, null, 2));
      console.log('[GeneralSettingsTab] migratedAdditionalInfo:', JSON.stringify(migratedAdditionalInfo, null, 2));
      
    } catch (error) {
      console.error('[GeneralSettingsTab] 从存储加载设置失败:', error);
      // 如果存储加载失败，回退到Redux状态
      console.log('[GeneralSettingsTab] 回退到Redux状态');
      setLocalPrompts(customPrompts);
      setLocalFeatureSettings(modeFeatureSettings);
      
      const migratedAdditionalInfo = {};
      for (const mode of ['general', 'outline', 'writing', 'adjustment']) {
        const modeInfo = additionalInfo[mode];
        if (typeof modeInfo === 'string') {
          migratedAdditionalInfo[mode] = {
            outline: modeInfo,
            previousChapter: '',
            characterSettings: ''
          };
        } else if (typeof modeInfo === 'object' && modeInfo !== null) {
          migratedAdditionalInfo[mode] = {
            outline: modeInfo.outline || '',
            previousChapter: modeInfo.previousChapter || '',
            characterSettings: modeInfo.characterSettings || ''
          };
        } else {
          migratedAdditionalInfo[mode] = {
            outline: '',
            previousChapter: '',
            characterSettings: ''
          };
        }
      }
      setLocalAdditionalInfo(migratedAdditionalInfo);
    }
  };

  useEffect(() => {
    fetchDefaultPrompts();
    loadSettingsFromStore();
  }, []); // 空依赖数组，只在组件挂载时执行一次

  const handlePromptChange = (mode, value) => {
    setLocalPrompts(prev => ({
      ...prev,
      [mode]: value
    }));
  };

  // 功能设置变更处理（现在主要用于其他功能，RAG设置已移到专门页面）
  const handleFeatureSettingChange = (mode, feature, enabled) => {
    setLocalFeatureSettings(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        [feature]: enabled
      }
    }));
  };

  const handleAdditionalInfoChange = (mode, field, value) => {
    setLocalAdditionalInfo(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        [field]: value
      }
    }));
  };

  const handleReset = (mode) => {
    setLocalPrompts(prev => ({
      ...prev,
      [mode]: ''
    }));
    setLocalFeatureSettings(prev => ({
      ...prev,
      [mode]: {}
    }));
    setLocalAdditionalInfo(prev => ({
      ...prev,
      [mode]: {
        outline: '',
        previousChapter: '',
        characterSettings: ''
      }
    }));
    
    dispatch(resetCustomPromptForMode({ mode }));
    dispatch(resetModeFeatureSettings({ mode }));
    dispatch(resetAdditionalInfoForMode({ mode }));
  };


  const handleSave = async () => {
    try {
      console.log('[GeneralSettingsTab] 开始保存通用设置');
      
      // 保存所有模式的自定义提示词
      for (const mode of Object.keys(localPrompts)) {
        dispatch(setCustomPromptForMode({ mode, prompt: localPrompts[mode] }));
        console.log(`[GeneralSettingsTab] 保存模式 ${mode} 的自定义提示词: ${localPrompts[mode] ? '有内容' : '空'}`);
      }
      
      // 保存所有模式的功能设置（现在只保存其他功能设置，RAG设置已移到专门页面）
      for (const mode of Object.keys(localFeatureSettings)) {
        const settings = localFeatureSettings[mode];
        console.log(`[GeneralSettingsTab] 保存模式 ${mode} 的功能设置:`, settings);
        
        // 这里可以保存其他功能设置，RAG设置现在在专门页面处理
      }
      
      // 保存所有模式的附加信息
      for (const mode of Object.keys(localAdditionalInfo)) {
        const info = localAdditionalInfo[mode];
        console.log(`[GeneralSettingsTab] 保存模式 ${mode} 的附加信息:`, {
          outlineLength: info.outline?.length || 0,
          previousChapterLength: info.previousChapter?.length || 0,
          characterSettingsLength: info.characterSettings?.length || 0
        });
        dispatch(setAdditionalInfoForMode({ mode, info: localAdditionalInfo[mode] }));
      }
      
      // 保存到持久化存储
      console.log('[GeneralSettingsTab] 保存到持久化存储...');
      await invoke('set-store-value', 'customPrompts', localPrompts);
      await invoke('set-store-value', 'modeFeatureSettings', localFeatureSettings);
      await invoke('set-store-value', 'additionalInfo', localAdditionalInfo);

      console.log('[GeneralSettingsTab] 通用设置保存完成');
      
      // 通知保存成功
      if (onSaveComplete) {
        onSaveComplete('通用设置保存成功！', true);
      }
    } catch (error) {
      console.error('保存通用设置失败:', error);
      // 通知保存失败
      if (onSaveComplete) {
        onSaveComplete('通用设置保存失败，请重试。', false);
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

  return (
    <div className="tab-content">
      <h3>通用设置</h3>
      
      {isLoadingPrompts ? (
        <div className="loading-prompts">
          <p>正在加载默认提示词...</p>
        </div>
      ) : Object.keys(defaultPrompts).length === 0 ? (
        <div className="no-prompts">
          <p>无法加载默认提示词</p>
        </div>
      ) : (
        <div className="prompt-sections">
          {Object.entries(defaultPrompts).map(([mode, defaultPrompt]) => (
            <div key={mode} className="prompt-section">
              <h3>{getModeDisplayName(mode)}模式</h3>
              
              <div className="default-prompt">
                <h4>默认提示词:</h4>
                <textarea
                  readOnly
                  value={defaultPrompt}
                  className="default-prompt-textarea"
                  rows={4}
                />
              </div>

              <div className="custom-prompt">
                <h4>自定义提示词:</h4>
                <textarea
                  value={localPrompts[mode] || ''}
                  onChange={(e) => handlePromptChange(mode, e.target.value)}
                  placeholder={`输入${getModeDisplayName(mode)}模式的自定义提示词...`}
                  rows={4}
                />
                <button
                  className="reset-button"
                  onClick={() => handleReset(mode)}
                  disabled={!localPrompts[mode]}
                >
                  <FontAwesomeIcon icon={faUndo} /> 重置
                </button>
              </div>

              <div className="feature-settings">
                <h4>功能设置:</h4>
                
                {/* 工具功能状态说明 */}
                {mode === 'general' ? (
                  <div className="feature-info">
                    <strong>工具功能：始终启用</strong>
                    <div className="feature-description">
                      通用模式下AI可以自动使用工具进行文件操作、代码编辑等
                    </div>
                  </div>
                ) : (
                  <div className="feature-info">
                    <strong>工具功能：禁用</strong>
                    <div className="feature-description">
                      此模式下AI仅提供对话功能，无法使用工具
                    </div>
                  </div>
                )}


                {/* 单个模式的上下文设置 */}
                <ModeContextSettings mode={mode} modeName={getModeDisplayName(mode)} />
              </div>
            </div>
          ))}
        </div>
      )}


      <div className="modal-actions" style={{ marginTop: '20px' }}>
        <button className="save-button" onClick={handleSave}>
          保存
        </button>
      </div>
    </div>
  );
};

export default GeneralSettingsTab;