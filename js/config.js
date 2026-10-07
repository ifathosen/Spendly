const SUPABASE_URL = 'https://vpsbxxolwfgbbtmzmzjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwc2J4eG9sd2ZnYmJ0bXptemprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNDIyNDAsImV4cCI6MjEwNjkxODI0MH0.6c-vvDugLc9tvoot5x1MM4uaidx77uWPXZHd621nPNQ';

var dbClient = null;
if (typeof supabase !== 'undefined') {
  dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
