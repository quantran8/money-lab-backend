import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-strategy';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Custom Passport strategy for Supabase JWT auth.
 * Uses SupabaseService.auth.getUser(token) (current Supabase API); does not use
 * nestjs-supabase-auth's auth.api.getUser which is deprecated.
 */
@Injectable()
export class SupabaseStrategy extends PassportStrategy(Strategy, 'supabase') {
  constructor(private readonly supabaseService: SupabaseService) {
    super();
  }

  validate(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  authenticate(req: { headers?: { authorization?: string } }): void {
    const authHeader = req.headers?.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    if (!token) {
      this.fail({ message: 'Missing authorization' }, 401);
      return;
    }
    this.supabaseService
      .getClient()
      .auth.getUser(token)
      .then(({ data: { user }, error }) => {
        if (error || !user) {
          this.fail({ message: 'Invalid token' }, 401);
          return;
        }
        this.success(user, {});
      })
      .catch((err: Error) => {
        this.fail({ message: err?.message ?? 'Invalid token' }, 401);
      });
  }
}
