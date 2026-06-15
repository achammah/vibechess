// ── Lichess puzzle ingestion ──────────────────────────────────────────────────
// Streams the zstd-compressed Lichess puzzle DB, decodes on the fly, samples a
// balanced pool across rating buckets, and aborts the 300 MB download as soon as
// the buckets are full. Upserts to Supabase via the PAT (service-role). CC0 data.
//
//   SUPABASE_ACCESS_TOKEN=... node scripts/ingest-puzzles/run.js
//
// Tunables via env: PUZZLES_PER_BUCKET (default 400), PUZZLE_BUCKET_MIN/MAX.

import { createClient } from "@supabase/supabase-js";
import { Decompress } from "fzstd";

import { fetchServiceRoleKey, loadEnv } from "../_env.js";

const URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const PER_BUCKET = Number(process.env.PUZZLES_PER_BUCKET ?? 400);
const MIN_R = Number(process.env.PUZZLE_BUCKET_MIN ?? 600);
const MAX_R = Number(process.env.PUZZLE_BUCKET_MAX ?? 2800);
const CHUNK = 500;

const bucketOf = (rating) => Math.floor(rating / 100) * 100;

const parseRow = (line) => {
  // PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
  const c = line.split(",");
  if (c.length < 8) return null;
  const rating = parseInt(c[3], 10);
  if (!Number.isFinite(rating)) return null;
  return {
    id: c[0],
    fen: c[1],
    moves: c[2].split(" ").filter(Boolean),
    rating,
    rating_deviation: parseInt(c[4], 10) || null,
    popularity: parseInt(c[5], 10) || null,
    nb_plays: parseInt(c[6], 10) || null,
    themes: (c[7] || "").split(" ").filter(Boolean),
    opening_tags: (c[10] || "").split(" ").filter(Boolean),
  };
};

const main = async () => {
  loadEnv();
  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supaUrl) {
    console.error("Missing SUPABASE_URL / VITE_SUPABASE_URL.");
    process.exit(1);
  }
  const key = await fetchServiceRoleKey();
  const supabase = createClient(supaUrl, key, { auth: { persistSession: false } });

  const buckets = new Map(); // bucket -> count
  const kept = [];
  let header = true;
  let textRemainder = "";
  let done = false;

  const targetBuckets = Math.floor((MAX_R - MIN_R) / 100) + 1;

  const handleLine = (line) => {
    if (header) {
      header = false;
      return;
    }
    if (done || !line) return;
    const row = parseRow(line);
    if (!row || row.rating < MIN_R || row.rating > MAX_R) return;
    const b = bucketOf(row.rating);
    const n = buckets.get(b) ?? 0;
    if (n >= PER_BUCKET) return;
    buckets.set(b, n + 1);
    kept.push(row);
    // Done when every bucket in range is full.
    if (buckets.size >= targetBuckets && [...buckets.values()].every((v) => v >= PER_BUCKET)) {
      done = true;
    }
  };

  const decoder = new TextDecoder();
  const onData = (chunk) => {
    textRemainder += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = textRemainder.indexOf("\n")) >= 0) {
      const line = textRemainder.slice(0, nl);
      textRemainder = textRemainder.slice(nl + 1);
      handleLine(line.trimEnd());
    }
  };
  const dec = new Decompress(onData);

  console.log(`Streaming ${URL} … sampling ${PER_BUCKET}/bucket, ratings ${MIN_R}-${MAX_R}`);
  const controller = new AbortController();
  const res = await fetch(URL, { signal: controller.signal });
  const reader = res.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      bytes += value.length;
      dec.push(value, false);
      if (done) {
        controller.abort();
        break;
      }
    }
  } catch (e) {
    if (e.name !== "AbortError") throw e;
  }
  console.log(
    `Collected ${kept.length} puzzles across ${buckets.size} buckets ` +
      `(downloaded ~${(bytes / 1e6).toFixed(0)} MB of compressed data).`,
  );

  console.log("Upserting puzzles…");
  for (let i = 0; i < kept.length; i += CHUNK) {
    const batch = kept.slice(i, i + CHUNK);
    const { error } = await supabase.from("puzzles").upsert(batch, { onConflict: "id" });
    if (error) throw error;
    process.stdout.write(`\r  ${Math.min(i + CHUNK, kept.length)}/${kept.length}`);
  }
  process.stdout.write("\n");
  console.log("Done.");
};

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
