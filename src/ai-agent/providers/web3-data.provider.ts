import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

interface DexScreenerPair {
  baseToken: { address: string; symbol: string; name: string };
  priceUsd: string;
  volume: { h24: number };
  liquidity: { usd: number };
  priceChange: { h24: number };
  txns: { h24: { buys: number; sells: number } };
  fdv: number;
}

@Injectable()
export class Web3DataProvider {
  private dexScreenerCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60 * 1000; // 1分钟缓存
  private proxyAgent: ProxyAgent | null = null;

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
   */
  async getTokenMetrics(tokenAddress: string) {
    try {
      const data = await this.fetchDexScreenerData(tokenAddress);

      if (!data.pairs || data.pairs.length === 0) {
        throw new Error('Token not found');
      }

      const pair = data.pairs[0] as DexScreenerPair;

      return {
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
        priceUsd: parseFloat(pair.priceUsd),
        volume24h: parseFloat(String(pair.volume.h24)),
        liquidity: parseFloat(String(pair.liquidity.usd)),
        priceChange24h: parseFloat(String(pair.priceChange.h24)),
        txns24h: pair.txns.h24.buys + pair.txns.h24.sells,
        marketCap: parseFloat(String(pair.fdv || 0)),
      };
    } catch (error) {
      console.error('获取 Token 数据失败:', error);
      throw error;
    }
  }

  /**
   * 从 DexScreener 获取数据（带缓存和重试）
   */
  private async fetchDexScreenerData(tokenAddress: string, retries = 3) {
    const cached = this.dexScreenerCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

        const response = await this.fetchWithProxy(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        this.dexScreenerCache.set(tokenAddress, { data, timestamp: Date.now() });
        return data;
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
      const liquidity = parseFloat(pair.liquidity?.usd || '0');
      const fdv = parseFloat(pair.fdv || '0');
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
      const volume24h = parseFloat(pair.volume?.h24 || '0');
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
