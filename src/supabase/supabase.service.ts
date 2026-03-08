import { Injectable, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
    private supabase: SupabaseClient;

    onModuleInit() {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('Supabase URL and Anon Key must be provided in environment variables');
        }

        this.supabase = createClient(supabaseUrl, supabaseAnonKey);
    }

    getClient(): SupabaseClient {
        return this.supabase;
    }

    getClientForUser(token: string): SupabaseClient {
        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const client = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
        });
        return client;
    }
}
