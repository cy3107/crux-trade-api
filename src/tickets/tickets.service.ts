import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';

type TicketRecord = {
  id?: string;
  user_id: string;
  market_id: string;
  status: string;
};

@Injectable()
export class TicketsService {
  constructor(private supabaseService: SupabaseService) {}

  async mintTickets(userId: string, marketId: string, quantity = 1) {
    const tickets: TicketRecord[] = Array(quantity)
      .fill(null)
      .map(() => ({
        user_id: userId,
        market_id: marketId,
        status: 'minted',
      }));

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tickets')
      .insert(tickets)
      .select();

    if (error) throw new Error('Mint failed');
    return data;
  }

  async armTickets(ticketIds: string[]) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tickets')
      .update({ status: 'armed' })
      .in('id', ticketIds)
      .select();

    if (error) throw new Error('Arm failed');
    return data;
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
      armed_active: rows.filter((t) => t.status === 'armed').length,
      triggered: rows.filter((t) => t.status === 'triggered').length,
      used: rows.filter((t) => t.status === 'used').length,
      expired: rows.filter((t) => t.status === 'expired').length,
      ready_count: rows.filter((t) => t.status === 'armed').length,
    };

    return { summary, tickets: rows };
  }
}
