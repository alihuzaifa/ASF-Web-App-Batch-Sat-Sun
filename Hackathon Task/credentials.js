// credentials.js
// Supabase configuration - yahan apni project ki details daalo

const SUPABASE_URL = "https://nsvqfchaamsdlgorgqlp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zdnFmY2hhYW1zZGxnb3JncWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MDQ1NzEsImV4cCI6MjA5OTk4MDU3MX0.cEGUjM3FVgoZjzbv2sqpWpBbk5ScjAL-rcd1s6c4Wrc";

// createClient supabase library se aata hai (HTML me CDN se load kiya hai)
const { createClient } = supabase;

// db banaya aur export default kar diya taake dusri files import kar saken
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default db;

/*
============================================================
 SUPABASE SQL EDITOR ME YE QUERY RUN KARO (ek dafa)
 Dashboard -> SQL Editor -> New query -> paste -> RUN
 (policies ki zaroorat nahi - SQL se bani table me RLS off
  hoti hai, isliye anon key se data seedha chal jayega)
============================================================

-- 1) STUDENTS table
create table students (
  id bigint generated always as identity primary key,
  name text,
  roll_no text,
  class text
);

-- 2) TEACHERS table
create table teachers (
  id bigint generated always as identity primary key,
  name text,
  subject text,
  email text
);

============================================================
 NOTE: RLS off hone ki wajah se koi bhi anon key waala
 data padh/likh sakta hai - ye sirf seekhne/testing ke
 liye theek hai, real project me RLS + policies lagana.
============================================================
*/
