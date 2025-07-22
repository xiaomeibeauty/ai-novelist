import React, { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { saveCheckpoint, restoreCheckpoint, getHistory, getDiff } from '../ipc/checkpointIpcHandler';
import './CheckpointPanel.css';

const CheckpointPanel = () => {
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const currentTaskId = useSelector(state => state.novel.currentTaskId || 'default-task');

    const loadHistory = useCallback(async () => {
        if (!currentTaskId) return;
        setIsLoading(true);
        setError(null);
        try {
            const historyResult = await getHistory(currentTaskId);
            setHistory(historyResult.all || []);
        } catch (err) {
            setError('加载历史记录失败。');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [currentTaskId]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    const handleSaveCheckpoint = async () => {
        if (!currentTaskId) return;
        const message = prompt('请输入本次保存的说明:', `Checkpoint at ${new Date().toLocaleString()}`);
        if (message) {
            setIsLoading(true);
            try {
                await saveCheckpoint(currentTaskId, message);
                await loadHistory(); // Reload history after saving
            } catch (err) {
                setError('保存快照失败。');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleRestoreCheckpoint = async (commitHash) => {
        if (!currentTaskId) return;
        if (window.confirm(`确定要恢复到这个版本吗？\n\n${commitHash}\n\n此操作不可撤销。`)) {
            setIsLoading(true);
            try {
                await restoreCheckpoint(currentTaskId, commitHash);
                alert('恢复成功！');
                await loadHistory(); // Reload history to reflect the change
            } catch (err) {
                setError('恢复快照失败。');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleShowDiff = async (from, to) => {
        if (!currentTaskId) return;
        // This is a placeholder for showing the diff.
        // In a real implementation, you'd probably open a modal or a new view
        // with a proper diff viewer component.
        try {
            const diffs = await getDiff(currentTaskId, from, to);
            console.log(diffs);
            alert('差异信息已打印到控制台。');
        } catch (err) {
            setError('获取差异失败。');
            console.error(err);
        }
    };

    return (
        <div className="checkpoint-panel">
            <div className="checkpoint-panel-header">
                <h3>版本历史</h3>
                {/* This button should probably be handled by the parent component to switch views */}
            </div>
            <button onClick={handleSaveCheckpoint} disabled={isLoading}>
                {isLoading ? '处理中...' : '创建新快照'}
            </button>
            {error && <div className="error-message">{error}</div>}
            <ul className="checkpoint-history">
                {history.map((item, index) => (
                    <li key={item.hash}>
                        <div className="checkpoint-info">
                            <strong>{item.message}</strong>
                            <span>{new Date(item.date).toLocaleString()}</span>
                            <small>{item.hash.substring(0, 7)}</small>
                        </div>
                        <div className="checkpoint-actions">
                            <button onClick={() => handleRestoreCheckpoint(item.hash)} disabled={isLoading}>恢复</button>
                            <button onClick={() => handleShowDiff(item.hash, 'HEAD')} disabled={isLoading}>与当前版本比较</button>
                            {index < history.length - 1 && (
                                <button onClick={() => handleShowDiff(history[index + 1].hash, item.hash)} disabled={isLoading}>与上一版本比较</button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default CheckpointPanel;