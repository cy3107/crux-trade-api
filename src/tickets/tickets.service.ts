import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { PostgrestError } from '@supabase/supabase-js';

type TicketRecord = {
  id?: string;
  user_id: string;
  market_id: string;
  status: string;
  created_at?: string;
};

type TicketResponse = {
  id?: string;
  userId: string;
  marketId: string;
  status: string;
  createdAt?: string;
};

@Injectable()
export class TicketsService {
  constructor(private supabaseService: SupabaseService) {}

  private mapTicket(ticket: TicketRecord): TicketResponse {
    return {
      id: ticket.id,
      userId: ticket.user_id,
      marketId: ticket.market_id,
      status: ticket.status,
      createdAt: ticket.created_at,
    };
  }

  async mintTickets(userId: string, marketId: string, quantity = 1) {
    const tickets: TicketRecord[] = Array(quantity)
      .fill(null)
      .map(() => ({
        user_id: userId,
        market_id: marketId,
        status: 'minted',
      }));

    const {
      data,
      error,
    }: { data: TicketRecord[] | null; error: PostgrestError | null } =
      await this.supabaseService
        .getClient()
        .from('tickets')
        .insert(tickets)
        .select();

    if (error) {
      throw new Error(`Mint failed: ${error.message}`);
    }
    return (data ?? []).map((ticket) => this.mapTicket(ticket));
  }

  async armTickets(ticketIds: string[]) {
    const {
      data,
      error,
    }: { data: TicketRecord[] | null; error: PostgrestError | null } =
      await this.supabaseService
        .getClient()
        .from('tickets')
        .update({ status: 'armed' })
        .in('id', ticketIds)
        .select();

    if (error) {
      throw new Error(`Arm failed: ${error.message}`);
    }
    return (data ?? []).map((ticket) => this.mapTicket(ticket));
  }

  async getUserTickets(userId: string) {
    const { data } = await this.supabaseService
      .getClient()
      .from('tickets')
      .select('*')
      .eq('user_id', userId);

    const rows = (data ?? []) as TicketRecord[];
    const summary = {
      minted: rows.filter((t) => t.status === 'minted').length,
      armedActive: rows.filter((t) => t.status === 'armed').length,
      triggered: rows.filter((t) => t.status === 'triggered').length,
      used: rows.filter((t) => t.status === 'used').length,
      expired: rows.filter((t) => t.status === 'expired').length,
      readyCount: rows.filter((t) => t.status === 'armed').length,
    };

    return { summary, tickets: rows.map((ticket) => this.mapTicket(ticket)) };
  }
}
