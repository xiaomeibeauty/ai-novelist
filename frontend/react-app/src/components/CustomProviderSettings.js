import React, { useState, useEffect, useCallback } from 'react';
import useIpcRenderer from '../hooks/useIpcRenderer';
import './CustomProviderSettings.css';

const CustomProviderSettings = () => {
    const { getStoreValue, setStoreValue } = useIpcRenderer();
    const [providers, setProviders] = useState([]);
    const [editingProvider, setEditingProvider] = useState(null);
    const [isEditing, setIsEditing] = useState(false);

    const loadProviders = useCallback(async () => {
        const storedProviders = await getStoreValue('customProviders') || [];
        setProviders(storedProviders);
    }, [getStoreValue]);

    useEffect(() => {
        loadProviders();
    }, [loadProviders]);

    const handleSave = async (providersToSave) => {
        await setStoreValue('customProviders', providersToSave);
        alert('自定义提供商设置已保存！请重启应用以使更改生效。');
        setEditingProvider(null);
        setIsEditing(false);
    };

    const handleAddNew = () => {
        setEditingProvider({
            providerName: '',
            apiKey: '',
            baseURL: '',
            modelId: '',
            enabled: true
        });
        setIsEditing(true);
    };

    const handleEdit = (provider) => {
        setEditingProvider({ ...provider });
        setIsEditing(true);
    };
    
    const handleDelete = async (providerNameToDelete) => {
        if (window.confirm(`确定要删除提供商 "${providerNameToDelete}" 吗？`)) {
            const updatedProviders = providers.filter(p => p.providerName !== providerNameToDelete);
            setProviders(updatedProviders);
            // 直接保存更新后的列表
            await setStoreValue('customProviders', updatedProviders);
            alert('提供商已删除。');
        }
    };

    const handleCancel = () => {
        setEditingProvider(null);
        setIsEditing(false);
    };

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setEditingProvider(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };
    
    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (editingProvider.providerName) {
            let updatedProviders;
            const existingIndex = providers.findIndex(p => p.providerName === editingProvider.providerName);
            if (existingIndex > -1) {
                updatedProviders = [...providers];
                updatedProviders[existingIndex] = editingProvider;
            } else {
                updatedProviders = [...providers, editingProvider];
            }
            setProviders(updatedProviders);
            handleSave(updatedProviders); // 将更新后的列表直接传递给 handleSave
        }
    };

    if (isEditing) {
        return (
            <div className="custom-provider-form">
                <h3>{editingProvider.providerName ? '编辑' : '新增'}提供商</h3>
                <form onSubmit={handleFormSubmit}>
                    <input name="providerName" value={editingProvider.providerName} onChange={handleFormChange} placeholder="提供商名称 (唯一标识)" required />
                    <input name="apiKey" type="password" value={editingProvider.apiKey} onChange={handleFormChange} placeholder="API Key" required />
                    <input name="baseURL" value={editingProvider.baseURL} onChange={handleFormChange} placeholder="Base URL (e.g., https://.../v1)" required />
                    <input name="modelId" value={editingProvider.modelId} onChange={handleFormChange} placeholder="模型 ID" required />
                    <label>
                        <input name="enabled" type="checkbox" checked={editingProvider.enabled} onChange={handleFormChange} />
                        启用
                    </label>
                    <div className="form-actions">
                        <button type="submit">保存</button>
                        <button type="button" onClick={handleCancel}>取消</button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="custom-provider-settings">
            <h3>管理自定义提供商</h3>
            <button onClick={handleAddNew}>新增提供商</button>
            <ul>
                {providers.map(provider => (
                    <li key={provider.providerName}>
                        <span>{provider.providerName} ({provider.modelId}) - {provider.enabled ? '已启用' : '已禁用'}</span>
                        <div className="provider-actions">
                            <button onClick={() => handleEdit(provider)}>编辑</button>
                            <button onClick={() => handleDelete(provider.providerName)}>删除</button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default CustomProviderSettings;