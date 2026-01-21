import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

/**
 * DEXScreener API 响应结构
 * 参考文档: https://docs.dexscreener.com/api/reference
 */
interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels?: string[];
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
  // 多时间段数据
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  txns: {
    h24: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    m5: { buys: number; sells: number };
  };
  info?: {
    imageUrl?: string;
    websites?: { url: string }[];
    socials?: { platform: string; handle: string }[];
  };
  boosts?: {
    active: number;
  };
}

interface DexScreenerResponse {
  schemaVersion?: string;
  pairs: DexScreenerPair[] | null;
}

// 链 ID 映射
const CHAIN_ID_MAP: Record<string, string> = {
  ethereum: 'ethereum',
  eth: 'ethereum',
  bsc: 'bsc',
  solana: 'solana',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
  avalanche: 'avalanche',
  fantom: 'fantom',
  optimism: 'optimism',
};

@Injectable()
export class Web3DataProvider {
  private readonly BASE_URL = 'https://api.dexscreener.com';
  private dexScreenerCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60 * 1000; // 1分钟缓存
  private proxyAgent: ProxyAgent | null = null;

  // API 速率限制: 300 requests/minute for pairs/tokens endpoints
  private readonly RATE_LIMIT = 300;

  constructor(private config: ConfigService) {
    // 初始化代理配置
    const proxyUrl = this.config.get('HTTP_PROXY') || this.config.get('HTTPS_PROXY');
    if (proxyUrl) {
      this.proxyAgent = new ProxyAgent(proxyUrl);
      console.log('[Web3DataProvider] 使用代理:', proxyUrl);
    }
  }

  /**
   * 带代理支持的 fetch
   */
  private async fetchWithProxy(url: string, options: any = {}): Promise<Response> {
    const fetchOptions: any = {
      ...options,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        ...options.headers,
      },
    };

    if (this.proxyAgent) {
      fetchOptions.dispatcher = this.proxyAgent;
    }

    return undiciFetch(url, fetchOptions) as unknown as Response;
  }

  /**
   * 获取 Token 基础信息
   * 使用 DexScreener API (免费)
   * 文档: https://docs.dexscreener.com/api/reference
   *
   * @param tokenAddress Token 合约地址
   * @param chain 可选的链标识 (ethereum, bsc, solana, base, etc.)
   */
  async getTokenMetrics(tokenAddress: string, chain?: string) {
    try {
      const data = await this.fetchDexScreenerData(tokenAddress, chain);

      if (!data.pairs || data.pairs.length === 0) {
        throw new Error('Token not found on any DEX');
      }

      // 如果指定了链，优先匹配该链的交易对
      let pair: DexScreenerPair;
      if (chain) {
        const chainId = CHAIN_ID_MAP[chain.toLowerCase()] || chain;
        const chainPair = data.pairs.find((p: DexScreenerPair) => p.chainId === chainId);
        pair = chainPair || data.pairs[0];
      } else {
        // 默认选择流动性最高的交易对
        pair = data.pairs.sort((a: DexScreenerPair, b: DexScreenerPair) =>
          (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        )[0];
      }

      return {
        // 基础信息
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
        address: pair.baseToken.address,
        chainId: pair.chainId,
        dexId: pair.dexId,
        pairAddress: pair.pairAddress,
        url: pair.url,

        // 价格数据
        priceUsd: parseFloat(pair.priceUsd || '0'),
        priceNative: parseFloat(pair.priceNative || '0'),

        // 流动性
        liquidity: pair.liquidity?.usd || 0,
        liquidityBase: pair.liquidity?.base || 0,
        liquidityQuote: pair.liquidity?.quote || 0,

        // 市值
        marketCap: pair.marketCap || 0,
        fdv: pair.fdv || 0,

        // 24 小时数据
        volume24h: pair.volume?.h24 || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        txns24h: (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0),
        buys24h: pair.txns?.h24?.buys || 0,
        sells24h: pair.txns?.h24?.sells || 0,

        // 6 小时数据
        volume6h: pair.volume?.h6 || 0,
        priceChange6h: pair.priceChange?.h6 || 0,
        txns6h: (pair.txns?.h6?.buys || 0) + (pair.txns?.h6?.sells || 0),

        // 1 小时数据
        volume1h: pair.volume?.h1 || 0,
        priceChange1h: pair.priceChange?.h1 || 0,
        txns1h: (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0),

        // 5 分钟数据
        volume5m: pair.volume?.m5 || 0,
        priceChange5m: pair.priceChange?.m5 || 0,
        txns5m: (pair.txns?.m5?.buys || 0) + (pair.txns?.m5?.sells || 0),

        // 交易对创建时间
        pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null,

        // 额外信息
        labels: pair.labels || [],
        imageUrl: pair.info?.imageUrl || null,
        websites: pair.info?.websites?.map(w => w.url) || [],
        socials: pair.info?.socials || [],
        boostsActive: pair.boosts?.active || 0,

        // 报价代币信息
        quoteToken: {
          address: pair.quoteToken.address,
          symbol: pair.quoteToken.symbol,
          name: pair.quoteToken.name,
        },
      };
    } catch (error) {
      console.error('获取 Token 数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取多个 Token 的信息 (批量查询)
   * 最多支持 30 个地址
   *
   * @param tokenAddresses Token 地址数组
   * @param chain 链标识
   */
  async getMultipleTokens(tokenAddresses: string[], chain: string = 'ethereum') {
    if (tokenAddresses.length > 30) {
      throw new Error('Maximum 30 addresses allowed per request');
    }

    const chainId = CHAIN_ID_MAP[chain.toLowerCase()] || chain;
    const addresses = tokenAddresses.join(',');
    const cacheKey = `multi:${chainId}:${addresses}`;

    const cached = this.dexScreenerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const response = await this.fetchWithProxy(
        `${this.BASE_URL}/tokens/v1/${chainId}/${addresses}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.dexScreenerCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error('批量获取 Token 数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取 Token 的所有交易对
   *
   * @param tokenAddress Token 地址
   * @param chain 链标识
   */
  async getTokenPairs(tokenAddress: string, chain: string = 'ethereum') {
    const chainId = CHAIN_ID_MAP[chain.toLowerCase()] || chain;
    const cacheKey = `pairs:${chainId}:${tokenAddress}`;

    const cached = this.dexScreenerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const response = await this.fetchWithProxy(
        `${this.BASE_URL}/token-pairs/v1/${chainId}/${tokenAddress}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.dexScreenerCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error('获取交易对数据失败:', error);
      throw error;
    }
  }

  /**
   * 搜索交易对
   *
   * @param query 搜索关键词 (如 "PEPE" 或 "SOL/USDC")
   */
  async searchPairs(query: string) {
    const cacheKey = `search:${query}`;

    const cached = this.dexScreenerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const response = await this.fetchWithProxy(
        `${this.BASE_URL}/latest/dex/search?q=${encodeURIComponent(query)}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.dexScreenerCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error('搜索交易对失败:', error);
      throw error;
    }
  }

  /**
   * 获取最新的 Token Profiles
   */
  async getLatestTokenProfiles() {
    const cacheKey = 'profiles:latest';

    const cached = this.dexScreenerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const response = await this.fetchWithProxy(
        `${this.BASE_URL}/token-profiles/latest/v1`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.dexScreenerCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error('获取 Token Profiles 失败:', error);
      throw error;
    }
  }

  /**
   * 获取热门 Token Boosts
   */
  async getTopTokenBoosts() {
    const cacheKey = 'boosts:top';

    const cached = this.dexScreenerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const response = await this.fetchWithProxy(
        `${this.BASE_URL}/token-boosts/top/v1`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.dexScreenerCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error('获取 Token Boosts 失败:', error);
      throw error;
    }
  }

  /**
   * 从 DexScreener 获取数据（带缓存和重试）
   *
   * API 端点说明:
   * - /tokens/v1/{chainId}/{tokenAddresses} - 指定链查询 (推荐)
   * - /latest/dex/tokens/{tokenAddress} - 全链搜索 (兼容旧版)
   *
   * 速率限制: 300 requests/minute
   */
  private async fetchDexScreenerData(
    tokenAddress: string,
    chain?: string,
    retries = 3
  ): Promise<DexScreenerResponse> {
    const chainId = chain ? (CHAIN_ID_MAP[chain.toLowerCase()] || chain) : null;
    const cacheKey = chainId ? `${chainId}:${tokenAddress}` : tokenAddress;

    const cached = this.dexScreenerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

        // 根据是否指定链选择不同的 API 端点
        let url: string;
        if (chainId) {
          // 使用新版 API: /tokens/v1/{chainId}/{tokenAddresses}
          url = `${this.BASE_URL}/tokens/v1/${chainId}/${tokenAddress}`;
        } else {
          // 使用兼容版 API: /latest/dex/tokens/{tokenAddress} (全链搜索)
          url = `${this.BASE_URL}/latest/dex/tokens/${tokenAddress}`;
        }

        const response = await this.fetchWithProxy(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          // 如果指定链查询失败，尝试全链搜索
          if (chainId && response.status === 404) {
            console.warn(`[DexScreener] 在 ${chainId} 链未找到，尝试全链搜索`);
            return this.fetchDexScreenerData(tokenAddress, undefined, retries - attempt);
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // 标准化响应格式
        const normalizedData: DexScreenerResponse = {
          schemaVersion: data.schemaVersion,
          pairs: data.pairs || (Array.isArray(data) ? data : null),
        };

        this.dexScreenerCache.set(cacheKey, { data: normalizedData, timestamp: Date.now() });
        return normalizedData;
      } catch (error) {
        lastError = error as Error;
        console.warn(`[DexScreener] 第 ${attempt} 次请求失败:`, error instanceof Error ? error.message : error);

        if (attempt < retries) {
          // 指数退避重试
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('获取 DexScreener 数据失败');
  }

  /**
   * 获取持有者数据
   * 优先使用 Moralis API，备用方案使用 Etherscan API
   */
  async getHolderData(tokenAddress: string) {
    // 尝试 Moralis API
    const moralisKey = this.config.get('MORALIS_API_KEY');
    if (moralisKey) {
      try {
        return await this.getHolderDataFromMoralis(tokenAddress, moralisKey);
      } catch (error) {
        console.warn('Moralis API 失败，尝试备用方案:', error);
      }
    }

    // 尝试 Etherscan API
    const etherscanKey = this.config.get('ETHERSCAN_API_KEY');
    if (etherscanKey) {
      try {
        return await this.getHolderDataFromEtherscan(tokenAddress, etherscanKey);
      } catch (error) {
        console.warn('Etherscan API 失败:', error);
      }
    }

    // 最终备用：从 DexScreener 数据估算
    return await this.estimateHolderDataFromDex(tokenAddress);
  }

  /**
   * 从 Moralis 获取持有者数据
   */
  private async getHolderDataFromMoralis(tokenAddress: string, apiKey: string) {
    const response = await this.fetchWithProxy(
      `https://deep-index.moralis.io/api/v2.2/erc20/${tokenAddress}/owners?chain=eth&order=DESC`,
      {
        headers: {
          'X-API-Key': apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Moralis API error: ${response.status}`);
    }

    const data = await response.json();
    const holders = data.result || [];
    const totalHolders = data.total || holders.length;

    // 计算前10持有者占比
    const top10 = holders.slice(0, 10);
    const totalSupply = holders.reduce((sum: number, h: any) =>
      sum + parseFloat(h.balance_formatted || '0'), 0);
    const top10Sum = top10.reduce((sum: number, h: any) =>
      sum + parseFloat(h.balance_formatted || '0'), 0);
    const top10Pct = totalSupply > 0 ? (top10Sum / totalSupply) * 100 : 0;

    // 识别巨鲸地址（持有超过1%的地址）
    const whaleThreshold = totalSupply * 0.01;
    const whaleAddresses = holders
      .filter((h: any) => parseFloat(h.balance_formatted || '0') > whaleThreshold)
      .map((h: any) => h.owner_address)
      .slice(0, 10);

    return {
      holderCount: totalHolders,
      top10HoldingPct: Math.round(top10Pct * 100) / 100,
      whaleAddresses,
    };
  }

  /**
   * 从 Etherscan 获取持有者数据
   */
  private async getHolderDataFromEtherscan(tokenAddress: string, apiKey: string) {
    // Etherscan 没有直接的持有者 API，但可以通过 token holder list 页面获取数量
    // 这里使用 token info API
    const response = await this.fetchWithProxy(
      `https://api.etherscan.io/api?module=token&action=tokeninfo&contractaddress=${tokenAddress}&apikey=${apiKey}`
    );

    const data = await response.json();

    if (data.status === '1' && data.result) {
      const tokenInfo = Array.isArray(data.result) ? data.result[0] : data.result;
      return {
        holderCount: parseInt(tokenInfo.holdersCount || '0', 10),
        top10HoldingPct: 0, // Etherscan 不提供此数据
        whaleAddresses: [],
      };
    }

    throw new Error('Etherscan API 返回无效数据');
  }

  /**
   * 从 DexScreener 数据估算持有者信息
   */
  private async estimateHolderDataFromDex(tokenAddress: string) {
    try {
      const data = await this.fetchDexScreenerData(tokenAddress);

      if (!data.pairs || data.pairs.length === 0) {
        return { holderCount: 0, top10HoldingPct: 0, whaleAddresses: [] };
      }

      const pair = data.pairs[0];

      // 基于交易数据估算持有者数量
      // 经验公式：活跃交易者 * 系数
      const txns24h = (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0);
      const estimatedHolders = Math.round(txns24h * 5); // 假设1/5的持有者每天交易

      // 基于流动性和市值估算集中度
      const liquidity = pair.liquidity?.usd || 0;
      const fdv = pair.fdv || 0;
      const liquidityRatio = fdv > 0 ? liquidity / fdv : 0;

      // 流动性占比低可能意味着更集中
      const estimatedTop10Pct = liquidityRatio < 0.05 ? 60 :
                                liquidityRatio < 0.1 ? 45 : 30;

      return {
        holderCount: estimatedHolders,
        top10HoldingPct: estimatedTop10Pct,
        whaleAddresses: [],
      };
    } catch (error) {
      console.error('估算持有者数据失败:', error);
      return { holderCount: 0, top10HoldingPct: 0, whaleAddresses: [] };
    }
  }

  /**
   * 获取链上活动数据
   */
  async getOnChainActivity(tokenAddress: string) {
    // 优先使用 Moralis API
    const moralisKey = this.config.get('MORALIS_API_KEY');
    if (moralisKey) {
      try {
        return await this.getOnChainActivityFromMoralis(tokenAddress, moralisKey);
      } catch (error) {
        console.warn('Moralis 链上活动 API 失败:', error);
      }
    }

    // 备用：从 DexScreener 估算
    return await this.estimateOnChainActivityFromDex(tokenAddress);
  }

  /**
   * 从 Moralis 获取链上活动数据
   */
  private async getOnChainActivityFromMoralis(tokenAddress: string, apiKey: string) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const response = await this.fetchWithProxy(
      `https://deep-index.moralis.io/api/v2.2/erc20/${tokenAddress}/transfers?chain=eth&from_date=${yesterday.toISOString()}&to_date=${now.toISOString()}`,
      {
        headers: {
          'X-API-Key': apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Moralis API error: ${response.status}`);
    }

    const data = await response.json();
    const transfers = data.result || [];

    // 统计唯一的发送者和接收者
    const uniqueAddresses = new Set<string>();
    const newReceivers = new Set<string>();
    let totalValue = 0;

    transfers.forEach((tx: any) => {
      uniqueAddresses.add(tx.from_address);
      uniqueAddresses.add(tx.to_address);
      newReceivers.add(tx.to_address);
      totalValue += parseFloat(tx.value_decimal || '0');
    });

    return {
      newHolders24h: newReceivers.size,
      activeTraders24h: uniqueAddresses.size,
      avgTxSize: transfers.length > 0 ? totalValue / transfers.length : 0,
    };
  }

  /**
   * 从 DexScreener 估算链上活动
   */
  private async estimateOnChainActivityFromDex(tokenAddress: string) {
    try {
      const data = await this.fetchDexScreenerData(tokenAddress);

      if (!data.pairs || data.pairs.length === 0) {
        return { newHolders24h: 0, activeTraders24h: 0, avgTxSize: 0 };
      }

      const pair = data.pairs[0];
      const buys = pair.txns?.h24?.buys || 0;
      const sells = pair.txns?.h24?.sells || 0;
      const volume24h = pair.volume?.h24 || 0;
      const totalTxns = buys + sells;

      // 估算新持有者：买入交易数的一定比例是新持有者
      const estimatedNewHolders = Math.round(buys * 0.3);

      // 估算活跃交易者：总交易数 / 平均每人交易次数
      const estimatedActiveTraders = Math.round(totalTxns / 2.5);

      // 平均交易规模
      const avgTxSize = totalTxns > 0 ? volume24h / totalTxns : 0;

      return {
        newHolders24h: estimatedNewHolders,
        activeTraders24h: estimatedActiveTraders,
        avgTxSize: Math.round(avgTxSize * 100) / 100,
      };
    } catch (error) {
      console.error('估算链上活动失败:', error);
      return { newHolders24h: 0, activeTraders24h: 0, avgTxSize: 0 };
    }
  }
}
