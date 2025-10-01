const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs'); // 修改为直接引入fs，不使用promises
const fsPromises = require('fs').promises;

/**
 * 启动独立的ChromaDB服务器
 * @param {number} port 服务器端口，默认为8000
 */
async function startChromaServer(port = 8000) {
    console.log(`🚀 正在启动ChromaDB服务器，端口: ${port}`);
    
    // 检查Python环境是否存在
    const portablePythonPath = path.join(__dirname, 'python_portable');
    const pythonPath = path.join(portablePythonPath, 'python.exe');
    
    if (!fs.existsSync(pythonPath)) {
        console.error('❌ Python环境不存在，请确保python_portable目录包含完整的Python环境');
        console.error('📁 预期路径:', pythonPath);
        process.exit(1);
    }
    
    const dbPath = path.join(__dirname, 'db', 'chroma_db');
    
    try {
        // 确保数据库目录存在
        await fsPromises.mkdir(dbPath, { recursive: true });
        console.log(`📁 数据库目录已准备: ${dbPath}`);
    } catch (error) {
        console.warn('⚠️ 创建数据库目录时出现警告:', error.message);
    }
    
    // 使用Python直接运行ChromaDB
    const escapedDbPath = dbPath.replace(/\\/g, '\\\\');
    const pythonScript = `
import chromadb.cli.cli as cli
import sys
sys.argv = ["chroma", "run", "--path", r"${escapedDbPath}", "--port", "${port}"]
cli.app()
    `.trim();
    
    console.log(`🐍 执行命令: ${pythonPath} -c "pythonScript"`);
    console.log(`📊 数据库路径: ${dbPath}`);
    console.log('🔌 服务器启动中...');
    
    const chromaProcess = spawn(pythonPath, ['-c', pythonScript], {
        cwd: __dirname,
        stdio: 'inherit', // 直接输出到控制台
        detached: false
    });
    
    // 处理进程事件
    chromaProcess.on('close', (code) => {
        console.log(`\n📋 ChromaDB进程退出，代码: ${code}`);
        if (code !== 0) {
            console.log('💡 提示: 如果端口被占用，可以尝试指定其他端口，如: node chroma-server.js 8001');
        }
    });
    
    chromaProcess.on('error', (error) => {
        console.error('❌ 启动ChromaDB失败:', error.message);
        console.log('💡 请检查:');
        console.log('   1. Python环境是否完整');
        console.log('   2. ChromaDB是否已安装 (pip install chromadb)');
        console.log('   3. 端口是否被占用');
    });
    
    // 处理Ctrl+C优雅关闭
    process.on('SIGINT', () => {
        console.log('\n🛑 收到停止信号，正在关闭ChromaDB服务器...');
        chromaProcess.kill('SIGTERM');
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        console.log('\n🛑 收到终止信号，正在关闭ChromaDB服务器...');
        chromaProcess.kill('SIGTERM');
        process.exit(0);
    });
}

// 解析命令行参数
const args = process.argv.slice(2);
let port = 8000;

if (args.length > 0) {
    const portArg = parseInt(args[0]);
    if (!isNaN(portArg) && portArg > 0 && portArg < 65536) {
        port = portArg;
    } else {
        console.log('⚠️  无效的端口号，使用默认端口8000');
    }
}

console.log('========================================');
console.log('          ChromaDB 独立服务器');
console.log('========================================');
console.log('📖 用法: node chroma-server.js [端口]');
console.log('💡 示例: node chroma-server.js 8000');
console.log('💡 示例: node chroma-server.js 8001');
console.log('========================================\n');

// 启动服务器
startChromaServer(port).catch(console.error);