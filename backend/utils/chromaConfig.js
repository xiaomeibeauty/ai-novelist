// ChromaDB 配置管理器
class ChromaConfig {
    constructor() {
        this.port = 8000; // 默认端口
        this.host = 'localhost';
        this.ssl = false;
    }

    // 设置端口
    setPort(port) {
        this.port = port;
        console.log(`[ChromaConfig] 端口已设置为: ${port}`);
    }

    // 获取当前配置
    getConfig() {
        return {
            host: this.host,
            port: this.port,
            ssl: this.ssl
        };
    }

    // 获取连接字符串
    getConnectionString() {
        return `http://${this.host}:${this.port}`;
    }
}

// 导出单例
module.exports = new ChromaConfig();