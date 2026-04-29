const SUPABASE_URL = "https://zqabtcffiptuudxiorzz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxYWJ0Y2ZmaXB0dXVkeGlvcnp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NDcwNjMsImV4cCI6MjA5MzAyMzA2M30.v2NAR0weyLMmwb6Vmez1hutuXN633ONpxe_g8cRUK78";

const client = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
