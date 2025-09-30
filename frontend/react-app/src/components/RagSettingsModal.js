import React, { useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setShowRagSettingsModal } from '../store/slices/chatSlice';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faSave, faBook, faDatabase } from '@fortawesome/free-solid-svg-icons';
import RagKnowledgeBaseSettings from './RagKnowledgeBaseSettings';
import MemorySettingsTab from './MemorySettingsTab';
import NotificationModal from './NotificationModal';
import './PromptManagerModal.css'; // 复用标签页样式

const RagSettingsModal = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const ragSettingsRef = useRef(null);
  const memorySettingsRef = useRef(null);
  const [activeTab, setActiveTab] = useState('rag'); // 'rag', 'memory'
  const [notification, setNotification] = useState({
    isOpen: false,
    message: '',
    success: false
  });
  
  const handleClose = () => {
    dispatch(setShowRagSettingsModal(false));
    if (onClose) onClose();
  };

  const handleNotificationClose = () => {
    setNotification({ isOpen: false, message: '', success: false });
    if (notification.success) {
      handleClose();
    }
  };

  const showNotification = (message, success = true) => {
    setNotification({
      isOpen: true,
      message,
      success
    });
  };

  // 保存处理函数
  const handleSave = () => {
    if (activeTab === 'rag' && ragSettingsRef.current && ragSettingsRef.current.handleSave) {
      ragSettingsRef.current.handleSave();
    } else if (activeTab === 'memory' && memorySettingsRef.current && memorySettingsRef.current.handleSave) {
      memorySettingsRef.current.handleSave();
    } else {
      console.error('无法调用当前标签页的保存方法');
      showNotification('保存失败：无法调用保存逻辑', false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="prompt-manager-modal-overlay">
        <div className="prompt-manager-modal-content">
          <div className="prompt-manager-header">
            <h2>插入信息</h2>
            <div className="header-actions">
              <button className="save-button" onClick={handleSave}>
                保存
              </button>
              <button className="cancel-button" onClick={handleClose}>
                关闭
              </button>
            </div>
          </div>

          {/* 标签页导航 */}
          <div className="tab-navigation">
            <button
              className={`tab-button ${activeTab === 'rag' ? 'active' : ''}`}
              onClick={() => setActiveTab('rag')}
            >
              <FontAwesomeIcon icon={faBook} /> RAG知识库
            </button>
            <button
              className={`tab-button ${activeTab === 'memory' ? 'active' : ''}`}
              onClick={() => setActiveTab('memory')}
            >
              <FontAwesomeIcon icon={faDatabase} /> 持久记忆
            </button>
          </div>

          {/* 标签页内容 */}
          <div className="tab-content-container">
            {activeTab === 'rag' && (
              <RagKnowledgeBaseSettings
                ref={ragSettingsRef}
                onSaveComplete={showNotification}
              />
            )}
            {activeTab === 'memory' && (
              <MemorySettingsTab
                ref={memorySettingsRef}
                onSaveComplete={showNotification}
              />
            )}
          </div>

        </div>
      </div>

      {/* 通知模态框 */}
      {notification.isOpen && (
        <NotificationModal
          message={notification.message}
          onClose={handleNotificationClose}
        />
      )}
    </>
  );
};

export default RagSettingsModal;