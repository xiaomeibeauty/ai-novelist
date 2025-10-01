import React, { useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useSelector } from 'react-redux';
import TabBar from './TabBar'; // 引入 TabBar
import SidebarComponent from './SidebarComponent'; // 引入侧边栏组件
import SplitViewPanel from './SplitViewPanel'; // 引入分屏对比组件

function LayoutComponent({ chapterPanel, editorPanel, chatPanel }) {
  const { splitView } = useSelector((state) => state.novel);
  // 保持 leftPanelSize 和 rightPanelSize 作为初始尺寸，也可以作为拖动后的尺寸
  const [leftPanelSize, setLeftPanelSize] = useState(20);
  const [rightPanelSize, setRightPanelSize] = useState(20);

  // 处理左侧面板尺寸变化
  const handleLeftPanelChange = (size) => {
    setLeftPanelSize(size);
  };

  // 处理右侧面板尺寸变化
  const handleRightPanelChange = (size) => {
    setRightPanelSize(size);
  };

  return (
    <PanelGroup direction="horizontal" className="main-layout">
      {/* 左侧组件栏 - 固定宽度图标栏，不能拖动 */}
      <div className="sidebar-panel-fixed">
        <SidebarComponent />
      </div>
      
      {/* 细长的普通灰色分隔线 */}
      <div className="divider-line"></div>
      
      {/* 章节面板 */}
      <Panel
        defaultSize={leftPanelSize} /* 使用 defaultSize 允许用户拖动 */
        minSize={0} /* 允许完全隐藏 */
        maxSize={100} /* 允许全范围拖动 */
        className="left-panel"
        onResize={handleLeftPanelChange} /* 监听尺寸变化 */
      >
        {chapterPanel}
      </Panel>
      <PanelResizeHandle className="resize-handle" />
      
      {/* 编辑器面板 */}
      <Panel
        defaultSize={60}
        minSize={0}
        maxSize={100}
        className="middle-panel"
        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {!splitView.enabled && <TabBar />}
        <div className="editor-content-wrapper">
          {splitView.enabled ? <SplitViewPanel /> : editorPanel}
        </div>
      </Panel>
      <PanelResizeHandle className="resize-handle" />
      
      {/* 聊天面板 */}
      <Panel
        defaultSize={rightPanelSize} /* 使用 defaultSize 允许用户拖动 */
        minSize={0} /* 允许完全隐藏 */
        maxSize={100} /* 允许全范围拖动 */
        className="right-panel"
        style={{ overflow: 'hidden' }}
        onResize={handleRightPanelChange} /* 监听尺寸变化 */
      >
        {chatPanel}
      </Panel>
    </PanelGroup>
  );
}

export default LayoutComponent;