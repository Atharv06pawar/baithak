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
  it('returns null when no credentials configured', () => {
    expect(getCloudCredentials()).toBeNull();
    expect(isCloudConfigured()).toBe(false);
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
