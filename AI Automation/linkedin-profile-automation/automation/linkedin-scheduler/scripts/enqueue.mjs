// ============================================================================
// Put one post in the queue.
//   npm run enqueue -- --caption=../../output/first-post.caption.md --image=../../output/first-post.png --date=2026-09-29
//   npm run enqueue -- --caption=post.md --now        # due immediately (for a test post)
//   npm run queue                                     # show the queue
//
// --date posts at 09:00 Karachi on that day. --image is optional (text-only post).
// Requires .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';

if (args.includes('--list')) {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('id, status, scheduled_for, image_path, posted_at, error')
    .order('scheduled_for');
  if (error) { console.error(error.message); process.exit(1); }
  console.table(data);
  process.exit(0);
}

const captionFile = flag('caption');
if (!captionFile) { console.error('--caption=<file> is required'); process.exit(1); }
const caption = readFileSync(captionFile, 'utf8').trim();
if (caption.length > 3000) { console.error(`caption is ${caption.length} characters; LinkedIn allows 3000`); process.exit(1); }

let scheduledFor;
if (args.includes('--now')) {
  scheduledFor = new Date().toISOString();
} else {
  const date = flag('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error('pass --date=YYYY-MM-DD or --now'); process.exit(1); }
  scheduledFor = `${date}T09:00:00+05:00`;
  if (new Date(scheduledFor) < new Date()) { console.error(`${scheduledFor} is in the past; it would post on the next run`); process.exit(1); }
}

let imagePath = null;
const imageFile = flag('image');
if (imageFile) {
  const bytes = readFileSync(imageFile);
  const ext = path.extname(imageFile).toLowerCase();
  const type = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
  if (!type) { console.error('image must be .png or .jpg'); process.exit(1); }
  imagePath = `${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12)}${ext}`;
  const { error } = await supabase.storage.from('post-images').upload(imagePath, bytes, { contentType: type, upsert: true });
  if (error) { console.error(`image upload failed: ${error.message}`); process.exit(1); }
}

const { data, error } = await supabase
  .from('scheduled_posts')
  .insert({ image_path: imagePath, caption, scheduled_for: scheduledFor, status: 'pending' })
  .select('id')
  .single();
if (error) { console.error(`insert failed: ${error.message}`); process.exit(1); }
console.log(`queued id=${data.id} for ${scheduledFor}${imagePath ? ` with ${imagePath}` : ' (text only)'}`);
