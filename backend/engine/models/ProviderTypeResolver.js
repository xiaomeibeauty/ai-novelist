/**
 * 提供商类型解析器 - JavaScript版本
 * 负责提供商类型的智能映射和解析
 */

// 静态类型映射表
const PROVIDER_TYPE_MAPPING = {
  // OpenAI兼容提供商
  'siliconflow': 'openai',
  'deepseek': 'openai',
  'zhipu': 'openai',
  'custom-openai': 'openai',
  'groq': 'openai',
  'anthropic': 'openai',
  
  // 其他类型提供商
  'ollama': 'ollama',
  'openrouter': 'openrouter',
  'azure-openai': 'azure',
  'azure': 'azure',
  'custom': 'custom'
};

/**
 * 提供商类型解析器类
 */
class ProviderTypeResolver {
  /**
   * 解析提供商类型
   * @param {string} providerId - 提供商ID
   * @param {Object} [providerConfig={}] - 提供商配置
   * @returns {string} 解析后的提供商类型
   */
  static resolveProviderType(providerId, providerConfig = {}) {
    if (!providerId) {
      throw new Error('providerId is required for type resolution');
    }

    // 1. 优先从映射表解析
    if (PROVIDER_TYPE_MAPPING[providerId]) {
      return PROVIDER_TYPE_MAPPING[providerId];
    }

    // 2. 从配置类型字段解析
    if (providerConfig.type && PROVIDER_TYPE_MAPPING[providerConfig.type]) {
      return PROVIDER_TYPE_MAPPING[providerConfig.type];
    }

    // 3. 根据API特征自动检测
    if (providerConfig.baseURL) {
      const urlHost = this._getUrlHost(providerConfig.baseURL);
      
      if (urlHost.includes('openai') || urlHost.includes('api.deepseek.com') || 
          urlHost.includes('api.siliconflow.cn') || urlHost.includes('open.bigmodel.cn')) {
        return 'openai';
      }
      
      if (urlHost.includes('azure.com') || urlHost.endsWith('.azure.com')) {
        return 'azure';
      }
      
      if (urlHost.includes('ollama') || urlHost.includes('127.0.0.1:11434')) {
        return 'ollama';
      }
      
      if (urlHost.includes('openrouter.ai')) {
        return 'openrouter';
      }
    }

    // 4. Fallback到提供商ID
    return providerId;
  }

  /**
   * 检查是否为OpenAI兼容提供商
   * @param {string} providerType - 提供商类型
   * @returns {boolean} 是否为OpenAI兼容
   */
  static isOpenAICompatible(providerType) {
    return providerType === 'openai' || 
           providerType === 'azure' ||
           providerType === 'custom-openai';
  }

  /**
   * 获取所有支持的提供商类型
   * @returns {string[]} 支持的提供商类型列表
   */
  static getSupportedProviderTypes() {
    return Array.from(new Set(Object.values(PROVIDER_TYPE_MAPPING)));
  }

  /**
   * 根据提供商类型获取适配器类名
   * @param {string} providerType - 提供商类型
   * @returns {string} 适配器类名
   */
  static getAdapterClassName(providerType) {
    const typeToAdapterMap = {
      'openai': 'BaseOpenAiCompatibleAdapter',
      'azure': 'BaseOpenAiCompatibleAdapter',
      'ollama': 'OllamaAdapter',
      'openrouter': 'OpenRouterAdapter',
      'custom': 'CustomProviderAdapter'
    };

    return typeToAdapterMap[providerType] || 'BaseModelAdapter';
  }

  /**
   * 添加自定义类型映射
   * @param {string} providerId - 提供商ID
   * @param {string} providerType - 提供商类型
   */
  static addTypeMapping(providerId, providerType) {
    if (!providerId || !providerType) {
      throw new Error('providerId and providerType are required');
    }
    PROVIDER_TYPE_MAPPING[providerId] = providerType;
  }

  /**
   * 移除类型映射
   * @param {string} providerId - 提供商ID
   */
  static removeTypeMapping(providerId) {
    if (PROVIDER_TYPE_MAPPING[providerId]) {
      delete PROVIDER_TYPE_MAPPING[providerId];
    }
  }

  /**
   * 获取URL的主机名
   * @param {string} url - URL字符串
   * @returns {string} 主机名
   * @private
   */
  static _getUrlHost(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch (error) {
      return '';
    }
  }
}

module.exports = ProviderTypeResolver;
module.exports.PROVIDER_TYPE_MAPPING = PROVIDER_TYPE_MAPPING;