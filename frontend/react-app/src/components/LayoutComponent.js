import React, { useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import TabBar from './TabBar'; // 引入 TabBar

function LayoutComponent({ chapterPanel, editorPanel, chatPanel }) {
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
      <Panel
        defaultSize={60}
        minSize={0}
        maxSize={100}
        className="middle-panel"
        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <TabBar />
        {editorPanel}
      </Panel>
      <PanelResizeHandle className="resize-handle" />
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