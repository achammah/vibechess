// ── Training progress ─────────────────────────────────────────────────────────
// Routes to Supabase when signed in, else local IndexedDB. Public API unchanged.

import { getDataContext, isCloud } from "./data-context";

const PROGRESS_DB_NAME = "chess-progress-db";
const PROGRESS_DB_VERSION = 1;
const PROGRESS_STORE_NAME = "progress";

// ── IndexedDB backend (anonymous) ─────────────────────────────────────────────
const openProgressDB = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(PROGRESS_DB_NAME, PROGRESS_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(PROGRESS_STORE_NAME)) {
        const store = database.createObjectStore(PROGRESS_STORE_NAME, { keyPath: "id" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("solved", "solved", { unique: false });
      }
    };
  });

const progressPut = (record) =>
  openProgressDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(PROGRESS_STORE_NAME, "readwrite");
        const request = tx.objectStore(PROGRESS_STORE_NAME).put(record);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );

const progressGet = (id) =>
  openProgressDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(PROGRESS_STORE_NAME, "readonly");
        const request = tx.objectStore(PROGRESS_STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      }),
  );

const progressGetAll = () =>
  openProgressDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction(PROGRESS_STORE_NAME, "readonly");
        const request = tx.objectStore(PROGRESS_STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result ?? []);
        request.onerror = () => reject(request.error);
      }),
  );

// ── Supabase backend (signed in) ──────────────────────────────────────────────
const fromRow = (row) => ({
  id: `${row.type}_${row.item_id}`,
  type: row.type,
  itemId: row.item_id,
  solved: row.solved,
  solvedAt: row.solved_at ? new Date(row.solved_at).getTime() : null,
});

const cloudSet = async (id, type, solved) => {
  const { supabase, userId } = getDataContext();
  await supabase.from("progress").upsert(
    {
      user_id: userId,
      type,
      item_id: id,
      solved,
      solved_at: solved ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,type,item_id" },
  );
};

const cloudGet = async (id, type) => {
  const { supabase, userId } = getDataContext();
  const { data } = await supabase
    .from("progress")
    .select("*")
    .eq("user_id", userId)
    .eq("type", type)
    .eq("item_id", id)
    .maybeSingle();
  return data ? fromRow(data) : null;
};

const cloudGetAll = async () => {
  const { supabase, userId } = getDataContext();
  const { data } = await supabase.from("progress").select("*").eq("user_id", userId);
  return (data ?? []).map(fromRow);
};

const cloudClear = async () => {
  const { supabase, userId } = getDataContext();
  await supabase.from("progress").delete().eq("user_id", userId);
};

// ── Public API (backend-agnostic) ─────────────────────────────────────────────

export const TYPE_TUTORIAL = "tutorial";
export const TYPE_PUZZLE = "puzzle";
export const TYPE_QUIZ = "quiz";
export const TYPE_OPENING = "opening";

export const markSolved = async (id, type) => {
  if (isCloud()) return cloudSet(id, type, true);
  await progressPut({ id: `${type}_${id}`, type, itemId: id, solved: true, solvedAt: Date.now() });
};

export const markUnsolved = async (id, type) => {
  if (isCloud()) return cloudSet(id, type, false);
  await progressPut({ id: `${type}_${id}`, type, itemId: id, solved: false, solvedAt: null });
};

export const getProgress = async (id, type) =>
  isCloud() ? cloudGet(id, type) : progressGet(`${type}_${id}`);

export const getAllProgress = async () => (isCloud() ? cloudGetAll() : progressGetAll());

export const getSolvedItems = async (type) => {
  const all = await getAllProgress();
  return all.filter((p) => p.type === type && p.solved);
};

export const isSolved = async (id, type) => {
  const progress = await getProgress(id, type);
  return progress?.solved ?? false;
};

export const clearProgress = async () => {
  if (isCloud()) return cloudClear();
  const database = await openProgressDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(PROGRESS_STORE_NAME, "readwrite");
    const request = tx.objectStore(PROGRESS_STORE_NAME).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
