import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveCloudCredentials,
  getCloudCredentials,
  isCloudConfigured,
  getSupabaseClient,
} from '@/lib/cloud/supabase';

beforeEach(() => {
  localStorage.clear();
});

describe('Supabase Free Cloud Service', () => {
  it('returns active cloud credentials out of the box', () => {
    const creds = getCloudCredentials();
    expect(creds).not.toBeNull();
    expect(creds.supabaseUrl).toContain('supabase.co');
    expect(creds.supabaseAnonKey).toBeDefined();
    expect(isCloudConfigured()).toBe(true);
  });

  it('saves and retrieves custom Supabase credentials', () => {
    saveCloudCredentials({
      supabaseUrl: 'https://xyzcompany.supabase.co',
      supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    });

    const creds = getCloudCredentials();
    expect(creds).not.toBeNull();
    expect(creds?.supabaseUrl).toBe('https://xyzcompany.supabase.co');
    expect(isCloudConfigured()).toBe(true);
  });

  it('initializes Supabase client when credentials exist', () => {
    saveCloudCredentials({
      supabaseUrl: 'https://testproject.supabase.co',
      supabaseAnonKey: 'anon-key-test',
    });

    const client = getSupabaseClient();
    expect(client).not.toBeNull();
  });
});
