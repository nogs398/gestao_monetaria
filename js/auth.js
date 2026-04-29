// Auth - usado apenas pelo login.html
// As funcoes login/register estao inline no login.html para evitar conflitos

async function logoutGlobal() {
  const { createClient } = window.supabase;
  const client = createClient(
    'https://zqabtcffiptuudxiorzz.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxYWJ0Y2ZmaXB0dXVkeGlvcnp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NDcwNjMsImV4cCI6MjA5MzAyMzA2M30.v2NAR0weyLMmwb6Vmez1hutuXN633ONpxe_g8cRUK78'
  );
  await client.auth.signOut();
  window.location.href = 'login.html';
}
