import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../common/supabase/supabase.service';

type QuoteRequest = {
  userId?: string | null;
  marketId: string;
  direction: 'Up' | 'Down';
  orderType: 'Market' | 'Limit';
  limitPrice?: number;
  shares: number;
  token: string;
};

type QuoteTx = {
  chainId: number;
  from: string;
  to: string;
  data: string;
  value: string;
};

type QuoteRecord = {
  quoteId: string;
  userId?: string | null;
  marketId: string;
  direction: 'Up' | 'Down';
  orderType: 'Market' | 'Limit';
  limitPrice?: number | null;
  shares: number;
  token: string;
  amount: number;
  spender: string;
  deadline: string;
  tx: QuoteTx;
  status: 'quoted' | 'paid' | 'expired';
  txHash?: string;
  createdAt: number;
};

type PaidPayment = {
  quoteId: string;
  token: string;
  amount: number;
  spender: string;
  deadline: string;
  txHash: string;
};

type PaymentQuoteRow = {
  quote_id: string;
  user_id: string | null;
  market_id: string;
  direction: string;
  order_type: string;
  limit_price: number | string | null;
  shares: number | string;
  token: string;
  amount: number | string;
  spender: string;
  deadline: string;
  tx_chain_id: number | string;
  tx_from: string;
  tx_to: string;
  tx_data: string;
  tx_value: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly config: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private toNumber(value: number | string | null) {
    return value == null ? 0 : Number(value);
  }

  private mapRowToQuote(row: PaymentQuoteRow): QuoteRecord {
    return {
      quoteId: row.quote_id,
      userId: row.user_id,
      marketId: row.market_id,
      direction: row.direction as 'Up' | 'Down',
      orderType: row.order_type as 'Market' | 'Limit',
      limitPrice: row.limit_price == null ? null : this.toNumber(row.limit_price),
      shares: this.toNumber(row.shares),
      token: row.token,
      amount: this.toNumber(row.amount),
      spender: row.spender,
      deadline: row.deadline,
      tx: {
        chainId: this.toNumber(row.tx_chain_id),
        from: row.tx_from,
        to: row.tx_to,
        data: row.tx_data,
        value: row.tx_value,
      },
      status: row.status as QuoteRecord['status'],
      txHash: row.tx_hash ?? undefined,
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  async createQuote(input: QuoteRequest) {
    const quoteId = `quote-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const ttlSeconds = Number(this.config.get('X402_QUOTE_TTL_SECONDS') ?? 600);
    const deadline = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const spender = this.config.get('X402_SPENDER') ?? '0xSpender';
    const chainId = Number(this.config.get('X402_CHAIN_ID') ?? 1);
    const from = this.config.get('X402_DEFAULT_FROM') ?? '0xUser';
    const to = this.config.get('X402_TX_TO') ?? spender;
    const data = this.config.get('X402_TX_DATA') ?? '0x';
    const value = this.config.get('X402_TX_VALUE') ?? '0';
    const amount = this.calculateAmount(input);

    const record: QuoteRecord = {
      quoteId,
      userId: input.userId ?? null,
      marketId: input.marketId,
      direction: input.direction,
      orderType: input.orderType,
      limitPrice: input.limitPrice ?? null,
      shares: input.shares,
      token: input.token,
      amount,
      spender,
      deadline,
      tx: {
        chainId,
        from,
        to,
        data,
        value,
      },
      status: 'quoted',
      createdAt: Date.now(),
    };

    const {
      error,
    }: { data: PaymentQuoteRow | null; error: PostgrestError | null } =
      await this.supabaseService
        .getClient()
        .from('payments_quotes')
        .insert({
          quote_id: record.quoteId,
          user_id: record.userId,
          market_id: record.marketId,
          direction: record.direction,
          order_type: record.orderType,
          limit_price: record.limitPrice ?? null,
          shares: record.shares,
          token: record.token,
          amount: record.amount,
          spender: record.spender,
          deadline: record.deadline,
          tx_chain_id: record.tx.chainId,
          tx_from: record.tx.from,
          tx_to: record.tx.to,
          tx_data: record.tx.data,
          tx_value: record.tx.value,
          status: record.status,
          tx_hash: null,
        })
        .select('*')
        .single();

    if (error) {
      throw new Error(`Create quote failed: ${error.message}`);
    }

    return {
      quoteId,
      token: record.token,
      amount: record.amount,
      spender: record.spender,
      deadline: record.deadline,
      tx: record.tx,
    };
  }

  async confirmPayment(quoteId: string, txHash: string) {
    const {
      data,
      error,
    }: { data: PaymentQuoteRow | null; error: PostgrestError | null } =
      await this.supabaseService
        .getClient()
        .from('payments_quotes')
        .select('*')
        .eq('quote_id', quoteId)
        .maybeSingle();

    if (error) {
      throw new Error(`Load quote failed: ${error.message}`);
    }

    if (!data) {
      throw new Error('Quote not found');
    }

    const quote = this.mapRowToQuote(data);
    if (quote.status === 'paid') {
      if (quote.txHash !== txHash) {
        throw new Error('Quote already paid with a different txHash');
      }
      return this.buildPaidResponse(quote);
    }

    if (this.isExpired(quote)) {
      await this.supabaseService
        .getClient()
        .from('payments_quotes')
        .update({ status: 'expired' })
        .eq('quote_id', quoteId);
      throw new Error('Quote expired');
    }

    if (!this.isTxHashValid(txHash)) {
      throw new Error('Invalid txHash format');
    }

    const { data: existing }: { data: PaymentQuoteRow[] | null } =
      await this.supabaseService
        .getClient()
        .from('payments_quotes')
        .select('quote_id')
        .eq('tx_hash', txHash);

    if ((existing ?? []).some((row) => row.quote_id !== quoteId)) {
      throw new Error('txHash already used for another quote');
    }

    const {
      data: updated,
      error: updateError,
    }: { data: PaymentQuoteRow | null; error: PostgrestError | null } =
      await this.supabaseService
        .getClient()
        .from('payments_quotes')
        .update({ status: 'paid', tx_hash: txHash })
        .eq('quote_id', quoteId)
        .select('*')
        .single();

    if (updateError) {
      throw new Error(`Confirm payment failed: ${updateError.message}`);
    }

    return this.buildPaidResponse(this.mapRowToQuote(updated as PaymentQuoteRow));
  }

  async assertPaid(txHash: string): Promise<PaidPayment> {
    const {
      data,
      error,
    }: { data: PaymentQuoteRow | null; error: PostgrestError | null } =
      await this.supabaseService
        .getClient()
        .from('payments_quotes')
        .select('*')
        .eq('tx_hash', txHash)
        .eq('status', 'paid')
        .maybeSingle();

    if (error) {
      throw new Error(`Lookup payment failed: ${error.message}`);
    }

    if (!data) {
      throw new Error('Payment not confirmed');
    }

    return this.buildPaidResponse(this.mapRowToQuote(data));
  }

  private buildPaidResponse(quote: QuoteRecord): PaidPayment {
    if (!quote.txHash) {
      throw new Error('Missing txHash');
    }
    return {
      quoteId: quote.quoteId,
      token: quote.token,
      amount: quote.amount,
      spender: quote.spender,
      deadline: quote.deadline,
      txHash: quote.txHash,
    };
  }

  private isExpired(quote: QuoteRecord) {
    return Date.now() > new Date(quote.deadline).getTime();
  }

  private isTxHashValid(txHash: string) {
    return /^0x[a-fA-F0-9]{64}$/.test(txHash);
  }

  private calculateAmount(input: QuoteRequest) {
    const defaultPrice = Number(this.config.get('X402_DEFAULT_PRICE') ?? 0.52);
    const price = input.limitPrice ?? defaultPrice;
    return Math.max(0, Number((price * input.shares).toFixed(6)));
  }
}
