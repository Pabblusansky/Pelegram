// One-off backfill for Chat.directKey on one-to-one chats created before the
// field existed. The server also adopts these lazily when a chat is opened,
// so running this is optional; its main use is surfacing duplicate chats for
// the same pair of users, which the old create path could produce.
//
// Usage (after `npm run build`):
//   MONGO_URI=... node scripts/backfill-direct-keys.mjs          # dry run
//   MONGO_URI=... node scripts/backfill-direct-keys.mjs --apply  # write keys
//
// For each pair the most recently active chat gets the key. Duplicates are
// listed and left untouched: they stay reachable, and merging their messages
// is a decision for a human.
import mongoose from 'mongoose';

const { default: Chat } = await import('../dist/models/Chat.js');
const { directChatKey } = await import('../dist/utils/directChat.js');

const apply = process.argv.includes('--apply');
const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI is required');
  process.exit(1);
}

await mongoose.connect(uri);

const chats = await Chat.find({
  isGroupChat: false,
  directKey: { $exists: false },
  participants: { $size: 2 },
}).sort({ updatedAt: -1 }).lean();

const keyed = new Set(
  (await Chat.find({ directKey: { $type: 'string' } }).select('directKey').lean()).map(c => c.directKey)
);

const groups = new Map();
for (const chat of chats) {
  const key = directChatKey(chat.participants[0].toString(), chat.participants[1].toString());
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(chat);
}

let stamped = 0;
let duplicates = 0;
for (const [key, group] of groups) {
  const [keep, ...rest] = keyed.has(key) ? [null, ...group] : group;
  if (keep) {
    if (apply) await Chat.updateOne({ _id: keep._id }, { $set: { directKey: key } });
    stamped++;
  }
  for (const dup of rest) {
    duplicates++;
    console.log(`duplicate chat ${dup._id} for pair ${key} (last active ${dup.updatedAt?.toISOString?.() ?? 'unknown'})`);
  }
}

console.log(`${apply ? 'Stamped' : 'Would stamp'} ${stamped} chat(s); ${duplicates} duplicate(s) left for review.`);
await mongoose.disconnect();
