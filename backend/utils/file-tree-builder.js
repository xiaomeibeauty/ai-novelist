const path = require('path');
const fs = require('fs').promises;
const sortConfigManager = require('./sortConfigManager');

// 检查排序配置管理器是否已初始化
let isSortConfigInitialized = false;

// 对项目列表进行排序（支持自定义排序）
const sortItems = (items, directoryPath = '') => {
    if (!items || !Array.isArray(items)) {
        console.log(`[file-tree-builder] sortItems: 传入空数组或无效数据，返回空数组`);
        return [];
    }

    console.log(`[file-tree-builder] sortItems: 开始排序目录 ${directoryPath}，项目数量: ${items.length}`);
    console.log(`[file-tree-builder] sortItems: 原始项目:`, items.map(item => ({ title: item.title, isFolder: item.isFolder })));

    // 首先应用自定义排序
    const customSorted = sortConfigManager.applyCustomOrder(items, directoryPath);
    
    console.log(`[file-tree-builder] sortItems: 自定义排序结果 === 原始项目: ${customSorted === items}`);
    console.log(`[file-tree-builder] sortItems: 排序是否启用: ${sortConfigManager.isSortEnabled()}`);
    
    // 如果没有自定义排序或排序被禁用，使用默认排序
    if (customSorted === items || !sortConfigManager.isSortEnabled()) {
        console.log(`[file-tree-builder] sortItems: 使用默认排序`);
        const defaultSorted = sortConfigManager.sortItemsDefault(customSorted); // 使用 customSorted 而不是 items
        const result = addDisplayPrefixes(defaultSorted);
        console.log(`[file-tree-builder] sortItems: 默认排序完成，结果数量: ${result.length}`);
        return result;
    }
    
    // 为自定义排序后的项目添加显示前缀
    console.log(`[file-tree-builder] sortItems: 使用自定义排序`);
    const result = addDisplayPrefixes(customSorted);
    console.log(`[file-tree-builder] sortItems: 自定义排序完成，结果数量: ${result.length}`);
    return result;
};

// 为项目添加显示前缀
const addDisplayPrefixes = (items) => {
    if (!items || !Array.isArray(items)) {
        return items;
    }

    // 分离文件夹和文件
    const folders = items.filter(item => item.isFolder);
    const files = items.filter(item => !item.isFolder);

    // 为文件夹添加数字前缀
    const foldersWithPrefix = folders.map((folder, index) => ({
        ...folder,
        displayPrefix: (index + 1).toString()
    }));

    // 为文件添加数字前缀
    const filesWithPrefix = files.map((file, index) => ({
        ...file,
        displayPrefix: (index + 1).toString()
    }));

    // 合并结果（文件夹在前，文件在后）
    return [...foldersWithPrefix, ...filesWithPrefix];
};

// 辅助函数：递归读取目录结构
const readDirectoryRecursive = async (dirPath, baseDirPath) => {
    console.log(`[file-tree-builder] readDirectoryRecursive: 正在读取目录: ${dirPath}`);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    console.log(`[file-tree-builder] readDirectoryRecursive: 目录 ${dirPath} 读取到的条目:`, entries.map(e => e.name));
    const result = [];

    for (const entry of entries) {
        // 忽略隐藏文件和文件夹
        if (entry.name.startsWith('.') || entry.name.startsWith('$')) {
            console.log(`[file-tree-builder] readDirectoryRecursive: 忽略条目: ${entry.name}`);
            continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(baseDirPath, fullPath);

        if (entry.isDirectory()) {
            const children = await readDirectoryRecursive(fullPath, baseDirPath);
            result.push({
                id: relativePath.replace(/\\/g, '/'), // 统一路径分隔符
                title: entry.name,
                isFolder: true,
                children: sortItems(children, relativePath) // 对子项进行排序
            });
        } else {
            result.push({
                id: relativePath.replace(/\\/g, '/'), // 统一路径分隔符
                title: entry.name,
                isFolder: false
            });
        }
    }

    // 对当前层级的项目进行排序
    const currentDirPath = dirPath === baseDirPath ? '' : path.relative(baseDirPath, dirPath).replace(/\\/g, '/');
    console.log(`[file-tree-builder] readDirectoryRecursive: 准备排序目录 ${currentDirPath}，项目数量: ${result.length}`);
    const sortedResult = sortItems(result, currentDirPath);
    console.log(`[file-tree-builder] readDirectoryRecursive: 排序完成，返回项目数量: ${sortedResult.length}`);
    return sortedResult;
};

// 获取指定目录的文件树
const getFileTree = async (absolutePathToDir) => {
    try {
        console.log(`[file-tree-builder] getFileTree: 开始构建文件树，路径: ${absolutePathToDir}`);
        
        // 确保排序配置管理器已初始化
        if (!isSortConfigInitialized) {
            console.log(`[file-tree-builder] getFileTree: 初始化排序配置管理器`);
            await sortConfigManager.initialize(absolutePathToDir);
            isSortConfigInitialized = true;
        }
        
        await fs.mkdir(absolutePathToDir, { recursive: true }).catch(() => {}); // 确保目录存在
        const tree = await readDirectoryRecursive(absolutePathToDir, absolutePathToDir);
        console.log(`[file-tree-builder] getFileTree: 文件树构建完成，根节点数量: ${tree.length}`);
        return { success: true, tree };
    } catch (error) {
        console.error(`[file-tree-builder] 获取文件树失败: ${error}`);
        return { success: false, error: error.message };
    }
};

module.exports = {
    getFileTree
};