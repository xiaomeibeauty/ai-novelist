const path = require('path');
const fs = require('fs').promises;

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
                children: children
            });
        } else {
            result.push({
                id: relativePath.replace(/\\/g, '/'), // 统一路径分隔符
                title: entry.name,
                isFolder: false
            });
        }
    }
    return result;
};

// 获取指定目录的文件树
const getFileTree = async (targetDir) => {
    const novelDirPath = path.join(__dirname, '../..', targetDir); // 从 utils 目录向上两级到项目根目录，然后进入 targetDir
    try {
        await fs.mkdir(novelDirPath, { recursive: true }).catch(() => {}); // 确保目录存在
        const tree = await readDirectoryRecursive(novelDirPath, novelDirPath);
        return { success: true, tree };
    } catch (error) {
        console.error(`[file-tree-builder] 获取文件树失败: ${error}`);
        return { success: false, error: error.message };
    }
};

module.exports = {
    getFileTree
};