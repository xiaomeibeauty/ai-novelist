import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setShowSettingsModal } from '../store/slices/chatSlice';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faSave, faCancel, faCog, faSlidersH, faDatabase } from '@fortawesome/free-solid-svg-icons';
import ApiSettingsTab from './ApiSettingsTab';
import GeneralSettingsTab from './GeneralSettingsTab';
import MemorySettingsTab from './MemorySettingsTab';
import NotificationModal from './NotificationModal';
import './PromptManagerModal.css'; // 复用标签页样式

const UnifiedSettingsModal = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState('api'); // 'api', 'general', 'advanced'
  const [notification, setNotification] = useState({
    isOpen: false,
    message: '',
    success: false
  });
  
  const handleClose = () => {
    dispatch(setShowSettingsModal(false));
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


  if (!isOpen) return null;

  return (
    <>
      <div className="prompt-manager-modal-overlay">
        <div className="prompt-manager-modal-content">
          <div className="prompt-manager-header">
            <h2>系统设置</h2>
            <button className="close-button" onClick={handleClose}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>

          {/* 标签页导航 */}
          <div className="tab-navigation">
            <button
              className={`tab-button ${activeTab === 'api' ? 'active' : ''}`}
              onClick={() => setActiveTab('api')}
            >
              <FontAwesomeIcon icon={faCog} /> API设置
            </button>
            <button
              className={`tab-button ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <FontAwesomeIcon icon={faSlidersH} /> 通用设置
            </button>
            <button
              className={`tab-button ${activeTab === 'memory' ? 'active' : ''}`}
              onClick={() => setActiveTab('memory')}
            >
              <FontAwesomeIcon icon={faDatabase} /> 持久记忆
            </button>
          </div>

          {/* 标签页内容 */}
          {activeTab === 'api' && <ApiSettingsTab onSaveComplete={showNotification} />}
          {activeTab === 'general' && <GeneralSettingsTab onSaveComplete={showNotification} />}
          {activeTab === 'memory' && <MemorySettingsTab onSaveComplete={showNotification} />}

          <div className="modal-actions">
            <button className="cancel-button" onClick={handleClose}>
              关闭
            </button>
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

export default UnifiedSettingsModal;