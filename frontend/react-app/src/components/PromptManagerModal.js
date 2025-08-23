import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  setCustomPromptForMode, 
  resetCustomPromptForMode 
} from '../store/slices/chatSlice';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faSave, faUndo } from '@fortawesome/free-solid-svg-icons';
import './PromptManagerModal.css';

const PromptManagerModal = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const { customPrompts } = useSelector((state) => state.chat);
  const [localPrompts, setLocalPrompts] = useState({
    general: '',
    outline: '',
    writing: '',
    adjustment: ''
  });

  // 从后端加载默认提示词
  const defaultPrompts = {
    general: `你是一个**工具使用型AI**，精通使用各种工具来完成用户请求。

**你的核心任务是：**
1. **准确理解用户意图。**
2. **根据用户意图，规划需要使用的工具和步骤。**
3. **严格按照工具的 JSON Schema 定义，生成有效的 'tool_calls' 对象。**
   - **极其重要：** 你必须将工具调用生成在响应的 **'tool_calls' 字段**中。
   - **绝对禁止：** **切勿**将工具调用的 JSON 结构以文本形式（例如，Markdown 代码块）输出到 'content' 字段中。系统无法解析 'content' 字段中的工具调用。
   - **只有通过 'tool_calls' 字段生成的工具请求，系统才能识别并执行。**
4. **根据工具执行结果，继续执行任务或进行后续工具调用。**
5. **当所有任务都已完成时，你必须、也只能调用名为 'end_task' 的工具来结束对话。`,

    outline: `你是一位小说创作顾问，负责与用户深度沟通本章核心需求。通过多轮对话收集以下信息：核心情节冲突、人物行为动机、场景氛围要求、用户特殊偏好（如文风/禁忌）。工作流程：根据多轮对话，得到最重要的信息。随后生成完整的结构化细纲（含场景序列、关键对话、情绪转折点），向用户展示细纲并询问：『是否需调整？请指出修改方向』`,

    writing: `你是一位专业小说代笔，需严格基于用户提供的【最终版细纲】进行创作。核心任务：解析细纲中的场景节点，扩展为2000字左右的正文。文风模仿知识库中的句式结构、高频词汇、描写偏好。重点在于补充各种描写，非必要时禁止添加细纲外新情节。`,

    adjustment: `你是一位资深编辑和小说精修师。你的任务是：
1.  **诊断问题**：根据用户提供的草稿，从剧情逻辑、语言问题（如"AI味"）、风格一致性等方面进行检查。
2.  **提供报告**：输出一份检查报告，每个问题都需提供修改案例，格式为：【原句】、【建议】、【理由】。
3.  **执行修改**：根据用户批准的修改建议，对草稿进行精修，确保修改后的内容逻辑清晰、文风与原文保持一致，并且不得变更用户已确认的核心情节。`
  };

  useEffect(() => {
    if (isOpen) {
      // 初始化本地状态
      setLocalPrompts(customPrompts);
    }
  }, [isOpen, customPrompts]);

  const handlePromptChange = (mode, value) => {
    setLocalPrompts(prev => ({
      ...prev,
      [mode]: value
    }));
  };

  const handleSave = async () => {
    // 保存所有模式的自定义提示词
    for (const mode of Object.keys(localPrompts)) {
      dispatch(setCustomPromptForMode({ mode, prompt: localPrompts[mode] }));
    }
    
    // 保存到持久化存储
    // 使用 window.api.invoke 或 window.ipcRenderer.invoke
    const invoke = window.api?.invoke || window.ipcRenderer?.invoke;
    if (invoke) {
      try {
        console.log('保存自定义提示词到存储 - 开始:', localPrompts);
        console.log('localPrompts 类型:', typeof localPrompts);
        console.log('localPrompts 键:', Object.keys(localPrompts));
        
        // 检查每个模式的内容
        for (const mode in localPrompts) {
          console.log(`localPrompts[${mode}]:`, localPrompts[mode]);
        }
        
        const result = await invoke('set-store-value', 'customPrompts', localPrompts);
        console.log('set-store-value 调用结果:', result);
        
        // 立即验证保存是否成功
        const savedValue = await invoke('get-store-value', 'customPrompts');
        console.log('从存储读取的验证值:', savedValue);
        console.log('验证值类型:', typeof savedValue);
        
        if (savedValue) {
          console.log('验证值键:', Object.keys(savedValue));
        }
      } catch (error) {
        console.error('保存自定义提示词失败:', error);
        console.error('错误详情:', error.message, error.stack);
      }
    } else {
      console.error('IPC invoke 方法不可用，可用对象:', {
        hasApi: !!window.api,
        hasIpcRenderer: !!window.ipcRenderer,
        hasElectron: !!window.electron
      });
    }
    
    onClose();
  };

  const handleReset = (mode) => {
    setLocalPrompts(prev => ({
      ...prev,
      [mode]: ''
    }));
    dispatch(resetCustomPromptForMode({ mode }));
  };

  if (!isOpen) return null;

  return (
    <div className="prompt-manager-modal-overlay">
      <div className="prompt-manager-modal-content">
        <div className="prompt-manager-header">
          <h2>提示词管理</h2>
          <button className="close-button" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

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
                  rows={6}
                />
              </div>

              <div className="custom-prompt">
                <h4>自定义提示词:</h4>
                <textarea
                  value={localPrompts[mode] || ''}
                  onChange={(e) => handlePromptChange(mode, e.target.value)}
                  placeholder={`输入${getModeDisplayName(mode)}模式的自定义提示词...`}
                  rows={6}
                />
                <button
                  className="reset-button"
                  onClick={() => handleReset(mode)}
                  disabled={!localPrompts[mode]}
                >
                  <FontAwesomeIcon icon={faUndo} /> 重置
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="save-button" onClick={handleSave}>
            <FontAwesomeIcon icon={faSave} /> 保存所有
          </button>
          <button className="cancel-button" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
};

// 辅助函数：获取模式显示名称
const getModeDisplayName = (mode) => {
  const names = {
    general: '通用',
    outline: '细纲',
    writing: '写作',
    adjustment: '调整'
  };
  return names[mode] || mode;
};

export default PromptManagerModal;