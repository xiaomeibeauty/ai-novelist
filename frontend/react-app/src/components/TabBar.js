import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setActiveTab, closeTab } from '../store/slices/novelSlice';
import './TabBar.css';

function TabBar() {
  const dispatch = useDispatch();
  const { openTabs, activeTabId } = useSelector((state) => state.novel);

  const handleTabClick = (tabId) => {
    dispatch(setActiveTab(tabId));
  };

  const handleCloseTab = (e, tabId) => {
    e.stopPropagation(); // 防止触发 handleTabClick
    dispatch(closeTab(tabId));
  };

  if (openTabs.length === 0) {
    return null; // 如果没有打开的标签页，则不渲染任何内容
  }

  return (
    <div className="tab-bar">
      {openTabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab-item ${tab.id === activeTabId ? 'active' : ''} ${tab.isDeleted ? 'deleted' : ''}`}
          onClick={() => handleTabClick(tab.id)}
        >
          <span className="tab-title">{tab.title}</span>
          {tab.isDirty && <span className="dirty-indicator">*</span>}
          {tab.isDeleted && <span className="deleted-indicator">🗑️</span>}
          <button
            className="close-tab-button"
            onClick={(e) => handleCloseTab(e, tab.id)}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}

export default TabBar;