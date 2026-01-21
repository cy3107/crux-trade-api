/**
 * 标准化错误码定义
 */
export enum ErrorCode {
  // 通用错误 (1xxx)
  UNKNOWN_ERROR = 'E1000',
  VALIDATION_ERROR = 'E1001',
  NOT_FOUND = 'E1002',

  // 认证错误 (2xxx)
  UNAUTHORIZED = 'E2001',
  INVALID_API_KEY = 'E2002',
  API_KEY_REQUIRED = 'E2003',

  // 速率限制 (3xxx)
  RATE_LIMIT_EXCEEDED = 'E3001',

  // 业务错误 (4xxx)
  INVALID_TOKEN_ADDRESS = 'E4001',
  TOKEN_NOT_FOUND = 'E4002',
  CHAIN_NOT_SUPPORTED = 'E4003',
  ANALYSIS_FAILED = 'E4004',
  DATA_FETCH_FAILED = 'E4005',
  AI_ANALYSIS_FAILED = 'E4006',

  // 外部服务错误 (5xxx)
  EXTERNAL_API_ERROR = 'E5001',
  GROQ_API_ERROR = 'E5002',
  DEXSCREENER_ERROR = 'E5003',
  COINGECKO_ERROR = 'E5004',
  DATABASE_ERROR = 'E5005',
}

/**
 * 错误码对应的用户友好消息
 */
export const ErrorMessages: Record<ErrorCode, { en: string; zh: string }> = {
  [ErrorCode.UNKNOWN_ERROR]: {
    en: 'An unexpected error occurred',
    zh: '发生未知错误',
  },
  [ErrorCode.VALIDATION_ERROR]: {
    en: 'Invalid input data',
    zh: '输入数据无效',
  },
  [ErrorCode.NOT_FOUND]: {
    en: 'Resource not found',
    zh: '资源不存在',
  },
  [ErrorCode.UNAUTHORIZED]: {
    en: 'Unauthorized access',
    zh: '未授权访问',
  },
  [ErrorCode.INVALID_API_KEY]: {
    en: 'Invalid API key',
    zh: 'API 密钥无效',
  },
  [ErrorCode.API_KEY_REQUIRED]: {
    en: 'API key is required',
    zh: '需要提供 API 密钥',
  },
  [ErrorCode.RATE_LIMIT_EXCEEDED]: {
    en: 'Too many requests, please try again later',
    zh: '请求过于频繁，请稍后再试',
  },
  [ErrorCode.INVALID_TOKEN_ADDRESS]: {
    en: 'Invalid token address format',
    zh: 'Token 地址格式无效',
  },
  [ErrorCode.TOKEN_NOT_FOUND]: {
    en: 'Token not found on any supported DEX',
    zh: '在支持的 DEX 上未找到此 Token',
  },
  [ErrorCode.CHAIN_NOT_SUPPORTED]: {
    en: 'Blockchain not supported',
    zh: '不支持此区块链网络',
  },
  [ErrorCode.ANALYSIS_FAILED]: {
    en: 'Token analysis failed',
    zh: 'Token 分析失败',
  },
  [ErrorCode.DATA_FETCH_FAILED]: {
    en: 'Failed to fetch market data',
    zh: '获取市场数据失败',
  },
  [ErrorCode.AI_ANALYSIS_FAILED]: {
    en: 'AI analysis service unavailable',
    zh: 'AI 分析服务暂时不可用',
  },
  [ErrorCode.EXTERNAL_API_ERROR]: {
    en: 'External service temporarily unavailable',
    zh: '外部服务暂时不可用',
  },
  [ErrorCode.GROQ_API_ERROR]: {
    en: 'AI service temporarily unavailable',
    zh: 'AI 服务暂时不可用',
  },
  [ErrorCode.DEXSCREENER_ERROR]: {
    en: 'DEX data service temporarily unavailable',
    zh: 'DEX 数据服务暂时不可用',
  },
  [ErrorCode.COINGECKO_ERROR]: {
    en: 'Price data service temporarily unavailable',
    zh: '价格数据服务暂时不可用',
  },
  [ErrorCode.DATABASE_ERROR]: {
    en: 'Database operation failed',
    zh: '数据库操作失败',
  },
};

/**
 * 业务异常类
 */
export class BusinessException extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number = 400,
    public readonly details?: any,
  ) {
    const messages = ErrorMessages[code];
    super(messages?.en || 'Unknown error');
    this.name = 'BusinessException';
  }

  toResponse() {
    const messages = ErrorMessages[this.code];
    return {
      success: false,
      error: {
        code: this.code,
        message: messages?.en || this.message,
        userMessage: messages?.zh || this.message,
        details: this.details,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
