const SUPABASE_URL = 'https://vpsbxxolwfgbbtmzmzjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwc2J4eG9sd2ZnYmJ0bXptemprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNDIyNDAsImV4cCI6MjEwNjkxODI0MH0.6c-vvDugLc9tvoot5x1MM4uaidx77uWPXZHd621nPNQ';

// নাম পরিবর্তন করে window.sbClient ব্যবহার করা হয়েছে যেন লাইব্রেরির সাথে সংঘাত না হয়
window.sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
