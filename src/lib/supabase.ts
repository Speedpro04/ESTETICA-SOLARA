import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mvqkelauwscxdwnzevtz.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWtlbGF1d3NjeGR3bnpldnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MDUxMjQsImV4cCI6MjA5MzI4MTEyNH0.wHOy6sFPCsLELJi5V03yWZKsH1CHAXBLvYRHElv1_UA';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL e ANON KEY devem estar configuradas');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
