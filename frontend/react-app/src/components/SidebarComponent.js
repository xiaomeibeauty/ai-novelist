import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setShowApiSettingsModal,
  setShowRagSettingsModal,
  setShowGeneralSettingsModal
} from '../store/slices/chatSlice';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGear,
  faBook,
  faRobot
} from '@fortawesome/free-solid-svg-icons';
import './SidebarComponent.css';

const SidebarComponent = () => {
  const dispatch = useDispatch();
  const [activeItem, setActiveItem] = useState(null);

  // 获取当前模态框状态
  const showApiSettingsModal = useSelector(state => state.chat.showApiSettingsModal);
  const showRagSettingsModal = useSelector(state => state.chat.showRagSettingsModal);
  const showGeneralSettingsModal = useSelector(state => state.chat.showGeneralSettingsModal);

  // 关闭所有模态框的函数
  const closeAllModals = () => {
    dispatch(setShowApiSettingsModal(false));
    dispatch(setShowRagSettingsModal(false));
    dispatch(setShowGeneralSettingsModal(false));
  };

  // 侧边栏项目配置 - 每个图标绑定独立的设置模态框
  const sidebarItems = [
    {
      id: 'api-settings',
      icon: faGear,
      label: 'API设置',
      action: () => {
        if (showApiSettingsModal) {
          // 如果当前已经打开，则关闭
          dispatch(setShowApiSettingsModal(false));
          setActiveItem(null);
        } else {
          // 如果当前未打开，则关闭其他模态框并打开当前模态框
          closeAllModals();
          dispatch(setShowApiSettingsModal(true));
          setActiveItem('api-settings');
        }
      }
    },
    {
      id: 'rag-settings',
      icon: faBook,
      label: '插入信息',
      action: () => {
        if (showRagSettingsModal) {
          // 如果当前已经打开，则关闭
          dispatch(setShowRagSettingsModal(false));
          setActiveItem(null);
        } else {
          // 如果当前未打开，则关闭其他模态框并打开当前模态框
          closeAllModals();
          dispatch(setShowRagSettingsModal(true));
          setActiveItem('rag-settings');
        }
      }
    },
    {
      id: 'general-settings',
      icon: faRobot,
      label: '通用设置',
      action: () => {
        if (showGeneralSettingsModal) {
          // 如果当前已经打开，则关闭
          dispatch(setShowGeneralSettingsModal(false));
          setActiveItem(null);
        } else {
          // 如果当前未打开，则关闭其他模态框并打开当前模态框
          closeAllModals();
          dispatch(setShowGeneralSettingsModal(true));
          setActiveItem('general-settings');
        }
      }
    }
  ];

  const handleItemClick = (item) => {
    item.action();
  };

  // 根据当前打开的模态框更新 activeItem 状态
  React.useEffect(() => {
    if (showApiSettingsModal) {
      setActiveItem('api-settings');
    } else if (showRagSettingsModal) {
      setActiveItem('rag-settings');
    } else if (showGeneralSettingsModal) {
      setActiveItem('general-settings');
    } else {
      setActiveItem(null);
    }
  }, [showApiSettingsModal, showRagSettingsModal, showGeneralSettingsModal]);

  return (
    <div className="sidebar">
      {/* 侧边栏项目列表 */}
      <div className="sidebar-items">
        {sidebarItems.map((item) => (
          <div
            key={item.id}
            className={`sidebar-item ${activeItem === item.id ? 'active' : ''}`}
            onClick={() => handleItemClick(item)}
            title={item.label}
          >
            <FontAwesomeIcon icon={item.icon} className="item-icon" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default SidebarComponent;