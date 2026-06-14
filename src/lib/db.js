// ── Game persistence ──────────────────────────────────────────────────────────
// Routes to Supabase when a user is signed in (cross-device sync), else to local
// IndexedDB. Public API is unchanged so call sites (stores, App.jsx) don't care.

import { getDataContext, isCloud } from "./data-context";

const DB_NAME = "chess-games-db";
const DB_VERSION = 1;
const STORE_NAME = "games";
const AUTOSAVE_ID = "autosave";

// ── IndexedDB backend (anonymous) ─────────────────────────────────────────────
const openDB = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });

const databasePut = (record) =>
  openDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, "readwrite");
        const request = tx.objectStore(STORE_NAME).put(record);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );

const databaseGet = (id) =>
  openDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      }),
  );

const databaseGetAll = () =>
  openDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );

const databaseDelete = (id) =>
  openDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, "readwrite");
        const request = tx.objectStore(STORE_NAME).delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
  );

// ── Supabase backend (signed in) ──────────────────────────────────────────────
// Fixed columns are mapped; everything else (moveHistory, opponent, difficulty,
// boardOrientation, playerColor, …) rides in metadata jsonb. fromRow rebuilds
// the exact object shape the IndexedDB backend returned.
const toRow = (gameData, { userId, isAutosave }) => {
  const { name, pgn, fen, result, white, black, eco, ...rest } = gameData;
  return {
    user_id: userId,
    name: name ?? null,
    pgn: pgn ?? null,
    fen: fen ?? null,
    result: result ?? null,
    white: white ?? null,
    black: black ?? null,
    eco: eco ?? null,
    is_autosave: isAutosave,
    metadata: rest,
  };
};

const fromRow = (row) => ({
  id: row.id,
  name: row.name,
  pgn: row.pgn,
  fen: row.fen,
  result: row.result,
  isAutosave: row.is_autosave,
  timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  ...(row.metadata ?? {}),
});

const cloudAutoSave = async (gameData) => {
  const { supabase, userId } = getDataContext();
  const row = toRow(gameData, { userId, isAutosave: true });
  const { data: existing } = await supabase
    .from("games")
    .select("id")
    .eq("user_id", userId)
    .eq("is_autosave", true)
    .maybeSingle();
  if (existing?.id) {
    await supabase.from("games").update(row).eq("id", existing.id);
  } else {
    await supabase.from("games").insert(row);
  }
};

const cloudLoadAutoSave = async () => {
  const { supabase, userId } = getDataContext();
  const { data } = await supabase
    .from("games")
    .select("*")
    .eq("user_id", userId)
    .eq("is_autosave", true)
    .maybeSingle();
  return data ? fromRow(data) : null;
};

const cloudSaveGame = async (gameData) => {
  const { supabase, userId } = getDataContext();
  const { data, error } = await supabase
    .from("games")
    .insert(toRow(gameData, { userId, isAutosave: false }))
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
};

const cloudListGames = async () => {
  const { supabase, userId } = getDataContext();
  const { data } = await supabase
    .from("games")
    .select("*")
    .eq("user_id", userId)
    .eq("is_autosave", false)
    .order("created_at", { ascending: false });
  return (data ?? []).map(fromRow);
};

const cloudDeleteGame = async (id) => {
  const { supabase, userId } = getDataContext();
  await supabase.from("games").delete().eq("id", id).eq("user_id", userId);
};

// ── Public API (backend-agnostic) ─────────────────────────────────────────────

/** Silently upsert the rolling auto-save record. */
export const autoSave = (gameData) =>
  isCloud()
    ? cloudAutoSave(gameData)
    : databasePut({ ...gameData, id: AUTOSAVE_ID, timestamp: Date.now(), isAutosave: true });

/** Load the auto-save record (or null if none). */
export const loadAutoSave = () => (isCloud() ? cloudLoadAutoSave() : databaseGet(AUTOSAVE_ID));

/** Save the current game with a user-visible name. Returns the generated id. */
export const saveGame = (gameData) => {
  if (isCloud()) return cloudSaveGame(gameData);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return databasePut({ ...gameData, id, timestamp: Date.now(), isAutosave: false }).then(() => id);
};

/** List all manually saved games, newest first. */
export const listGames = () =>
  isCloud()
    ? cloudListGames()
    : databaseGetAll().then((all) =>
        all.filter((g) => g.id !== AUTOSAVE_ID).sort((a, b) => b.timestamp - a.timestamp),
      );

/** Delete a saved game by id. */
export const deleteGame = (id) => (isCloud() ? cloudDeleteGame(id) : databaseDelete(id));
