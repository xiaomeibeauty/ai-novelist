import React, { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { saveArchive, restoreNovelArchive, getHistory, deleteNovelArchive } from '../ipc/checkpointIpcHandler';
import './CheckpointPanel.css';

const CheckpointPanel = ({ onClose }) => {
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const currentTaskId = useSelector(state => state.novel.currentTaskId || 'default-task');

    const loadHistory = useCallback(async () => {
        if (!currentTaskId) return;
        setIsLoading(true);
        setError(null);
        try {
            // The new getHistory returns the array directly
            const historyResult = await getHistory(currentTaskId);
            setHistory(historyResult || []);
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

    const handleSaveArchive = async () => {
        if (!currentTaskId) return;
        // Revert to automatic message generation to avoid unsupported prompt()
        const message = `存档于 ${new Date().toLocaleString()}`;
        if (message) {
            setIsLoading(true);
            try {
                await saveArchive(currentTaskId, message);
                await loadHistory(); // Reload history after saving
            } catch (err) {
                setError('保存存档失败。');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleRestoreArchive = async (archiveId) => {
        if (!currentTaskId) return;
        if (window.confirm(`当前操作可能使得内容丢失，请提前存档。\n\n确定要恢复到这个存档吗？`)) {
            setIsLoading(true);
            try {
                await restoreNovelArchive(currentTaskId, archiveId);
                alert('恢复成功！');
                // Potentially refresh other parts of the app, e.g., the file tree
                window.location.reload(); // Simple way to force a full refresh
            } catch (err) {
                setError('恢复存档失败。');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleDeleteArchive = async (archiveId) => {
        if (!currentTaskId) return;
        if (window.confirm(`确定要永久删除这个存档吗？\n\n此操作不可撤销。`)) {
            setIsLoading(true);
            try {
                await deleteNovelArchive(currentTaskId, archiveId);
                await loadHistory(); // Refresh the list after deletion
            } catch (err) {
                setError('删除存档失败。');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
    };

    return (
        <div className="checkpoint-panel">
            <div className="checkpoint-panel-header">
                <h3>版本历史</h3>
                {/* This button should probably be handled by the parent component to switch views */}
            </div>
            <div className="checkpoint-panel-controls">
                <button onClick={handleSaveArchive} disabled={isLoading}>
                    {isLoading ? '处理中...' : '创建新存档'}
                </button>
                {onClose && <button onClick={onClose} className="button-secondary">退出</button>}
            </div>
            {error && <div className="error-message">{error}</div>}
            <ul className="checkpoint-history">
                {history.map((item) => (
                    <li key={item.id}>
                        <div className="checkpoint-info">
                            <strong>{item.message}</strong>
                            {/* The date can be parsed from the ID */}
                            <span>{new Date(item.id.split('_')[0]).toLocaleString()}</span>
                            <small>ID: {item.id.substring(0, 10)}...</small>
                        </div>
                        <div className="checkpoint-actions">
                            <button onClick={() => handleDeleteArchive(item.id)} disabled={isLoading} className="button-delete">删除</button>
                            <button onClick={() => handleRestoreArchive(item.id)} disabled={isLoading}>恢复</button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default CheckpointPanel;