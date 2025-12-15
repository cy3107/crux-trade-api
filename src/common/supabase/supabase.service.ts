import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

type AnyTableSchema = {
  Row: Record<string, any>;
  Insert: Record<string, any>;
  Update: Record<string, any>;
  Relationships?: never;
};

type SupabaseDatabase = {
  public: {
    Tables: Record<string, AnyTableSchema>;
    Views: Record<string, AnyTableSchema>;
    Functions: Record<string, any>;
    Enums: Record<string, any>;
    CompositeTypes: Record<string, any>;
  };
};

type GenericClient = SupabaseClient<SupabaseDatabase, 'public', any>;

@Injectable()
export class SupabaseService {
  private supabase: GenericClient;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        'Supabase configuration missing: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
      );
    }

    this.supabase = createClient<SupabaseDatabase, 'public'>(
      supabaseUrl,
      serviceRoleKey, // 后端用高权限 key
    );
  }

  getClient(): GenericClient {
    return this.supabase;
  }
}
