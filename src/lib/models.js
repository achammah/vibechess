// ── Model catalogs (single source of truth) ──────────────────────────────────
// Centralizes the available AI models per provider plus the localStorage-backed
// provider/model selection helpers. Both settings-dialog.jsx and the inline
// ModelPicker import from here so the catalog never drifts.

/** Available Gemini models. First entry is the recommended default. */
export const GEMINI_MODELS = [
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    description: "Fast, strong reasoning — recommended",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    description: "Most capable",
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    description: "Fastest & cheapest",
  },
  {
    id: "gemini-3-pro-preview",
    label: "Gemini 3 Pro",
    description: "",
  },
];

/** Available OpenAI models. */
export const OPENAI_MODELS = [
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    description: "Flagship — complex reasoning & coding",
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    description: "Affordable, strong",
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    description: "Fast & cheap — recommended",
  },
  {
    id: "gpt-5.4-nano",
    label: "GPT-5.4 Nano",
    description: "Lowest latency & cost",
  },
];

/** Provider id → its model catalog. */
export const MODELS_BY_PROVIDER = {
  google: GEMINI_MODELS,
  openai: OPENAI_MODELS,
};

// ── Defaults & localStorage keys ──────────────────────────────────────────────
const PROVIDER_KEY = "chess-ai-provider";
const GOOGLE_MODEL_KEY = "chess-google-model";
const OPENAI_MODEL_KEY = "chess-coach-model";

const DEFAULT_PROVIDER = "google";
const DEFAULT_GOOGLE_MODEL = "gemini-3.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

const MODEL_KEY_BY_PROVIDER = {
  google: GOOGLE_MODEL_KEY,
  openai: OPENAI_MODEL_KEY,
};

const DEFAULT_MODEL_BY_PROVIDER = {
  google: DEFAULT_GOOGLE_MODEL,
  openai: DEFAULT_OPENAI_MODEL,
};

const canUseStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

/** Current provider id from localStorage, defaulting to 'google'. */
export const getProvider = () => {
  if (!canUseStorage()) return DEFAULT_PROVIDER;
  return localStorage.getItem(PROVIDER_KEY) || DEFAULT_PROVIDER;
};

/** Current model id for the given provider, falling back to that provider's default. */
export const getModel = (provider = getProvider()) => {
  const fallback = DEFAULT_MODEL_BY_PROVIDER[provider] || DEFAULT_GOOGLE_MODEL;
  const key = MODEL_KEY_BY_PROVIDER[provider];
  if (!key || !canUseStorage()) return fallback;
  return localStorage.getItem(key) || fallback;
};

/** Persist the selected provider. */
export const setProvider = (provider) => {
  if (!canUseStorage()) return;
  localStorage.setItem(PROVIDER_KEY, provider);
};

/** Persist the selected model id for the given provider. */
export const setModel = (provider, id) => {
  if (!canUseStorage()) return;
  const key = MODEL_KEY_BY_PROVIDER[provider];
  if (key) localStorage.setItem(key, id);
};
