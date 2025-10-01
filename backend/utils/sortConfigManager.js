/**
 * 排序配置管理器
 * 负责管理章节排序的持久化配置（基于JSON配置排序）
 */

const path = require('path');
const fs = require('fs').promises;

class SortConfigManager {
  constructor() {
    this.configPath = null;
    this.config = {
      version: '1.0.0',
      sortEnabled: true, // 是否启用排序
      customOrders: {}   // 自定义排序配置 { [directoryPath]: { items: [itemId1, itemId2, ...] } }
    };
  }

  /**
   * 初始化配置管理器
   * @param {string} novelDirPath novel目录路径
   */
  async initialize(novelDirPath) {
    this.configPath = path.join(novelDirPath, '.sort-config.json');
    await this.loadConfig();
  }

  /**
   * 加载配置
   */
  async loadConfig() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      const loadedConfig = JSON.parse(configData);
      
      // 合并配置，保持向后兼容
      this.config = {
        ...this.config,
        ...loadedConfig
      };
      
      console.log('[SortConfigManager] 排序配置已加载');
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 配置文件不存在，使用默认配置
        console.log('[SortConfigManager] 排序配置文件不存在，使用默认配置');
        await this.saveConfig();
      } else {
        console.error('[SortConfigManager] 加载排序配置失败:', error);
      }
    }
  }

  /**
   * 保存配置
   */
  async saveConfig() {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      console.log('[SortConfigManager] 排序配置已保存');
    } catch (error) {
      console.error('[SortConfigManager] 保存排序配置失败:', error);
    }
  }

  /**
   * 获取目录的自定义排序
   * @param {string} directoryPath 目录路径
   * @returns {Array} 排序后的项目ID列表
   */
  getCustomOrder(directoryPath) {
    const cleanPath = this.normalizePath(directoryPath);
    return this.config.customOrders[cleanPath]?.items || null;
  }

  /**
   * 设置目录的自定义排序
   * @param {string} directoryPath 目录路径
   * @param {Array} itemIds 项目ID列表
   */
  async setCustomOrder(directoryPath, itemIds) {
    const cleanPath = this.normalizePath(directoryPath);
    
    if (!this.config.customOrders[cleanPath]) {
      this.config.customOrders[cleanPath] = {};
    }
    
    this.config.customOrders[cleanPath].items = itemIds;
    this.config.customOrders[cleanPath].lastUpdated = new Date().toISOString();
    
    await this.saveConfig();
  }

  /**
   * 清除目录的自定义排序
   * @param {string} directoryPath 目录路径
   */
  async clearCustomOrder(directoryPath) {
    const cleanPath = this.normalizePath(directoryPath);
    delete this.config.customOrders[cleanPath];
    await this.saveConfig();
  }

  /**
   * 获取排序启用状态
   * @returns {boolean} 是否启用排序
   */
  isSortEnabled() {
    return this.config.sortEnabled;
  }

  /**
   * 设置排序启用状态
   * @param {boolean} enabled 是否启用
   */
  async setSortEnabled(enabled) {
    this.config.sortEnabled = enabled;
    await this.saveConfig();
  }

  /**
   * 应用自定义排序到项目列表
   * @param {Array} items 项目列表
   * @param {string} directoryPath 目录路径
   * @returns {Array} 排序后的项目列表
   */
  applyCustomOrder(items, directoryPath) {
    const customOrder = this.getCustomOrder(directoryPath);
    
    if (!customOrder || !this.config.sortEnabled) {
      return items;
    }

    // 创建项目ID到项目的映射
    const itemMap = new Map();
    items.forEach(item => {
      itemMap.set(item.id, item);
    });

    // 按照自定义顺序排序
    const sortedItems = [];
    const remainingItems = new Set(items.map(item => item.id));

    // 首先添加自定义顺序中的项目
    customOrder.forEach(itemId => {
      if (itemMap.has(itemId)) {
        sortedItems.push(itemMap.get(itemId));
        remainingItems.delete(itemId);
      }
    });

    // 然后添加剩余的项目（按默认排序）
    const remainingArray = Array.from(remainingItems).map(id => itemMap.get(id));
    const defaultSorted = this.sortItemsDefault(remainingArray);
    
    return [...sortedItems, ...defaultSorted];
  }

  /**
   * 默认排序（按字母排序）
   * @param {Array} items 项目列表
   * @returns {Array} 排序后的项目列表
   */
  sortItemsDefault(items) {
    if (!items || !Array.isArray(items)) {
      return [];
    }

    console.log('[SortConfigManager] 开始默认排序，项目数量:', items.length);

    const sorted = [...items].sort((a, b) => {
      // 文件夹优先
      if (a.isFolder && !b.isFolder) {
        console.log(`[SortConfigManager] 文件夹优先: ${a.title} < ${b.title}`);
        return -1;
      }
      if (!a.isFolder && b.isFolder) {
        console.log(`[SortConfigManager] 文件夹优先: ${a.title} > ${b.title}`);
        return 1;
      }

      // 相同类型按字母排序
      const alphaResult = a.title.localeCompare(b.title);
      console.log(`[SortConfigManager] 字母排序结果: ${alphaResult}`);
      return alphaResult;
    });

    console.log('[SortConfigManager] 排序后项目列表:', sorted.map(item => ({
      title: item.title,
      isFolder: item.isFolder,
      id: item.id
    })));
    
    return sorted;
  }

  /**
   * 规范化路径
   */
  normalizePath(filePath) {
    return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  }

  /**
   * 获取所有配置信息（用于调试）
   */
  getConfig() {
    return { ...this.config };
  }
}

// 创建单例实例
const sortConfigManager = new SortConfigManager();

module.exports = sortConfigManager;