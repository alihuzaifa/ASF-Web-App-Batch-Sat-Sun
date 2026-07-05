import { PROJECTURL, ANON_PUBLIC_KEY } from './credentials.js'
const supabase =
 window.supabase.createClient(PROJECTURL, ANON_PUBLIC_KEY)
console.log(supabase);
