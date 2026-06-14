import { ClerkProvider } from "@clerk/clerk-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.jsx";
import DataSyncProvider from "./components/data-sync-provider.jsx";

// Auth is optional: with no Clerk key the app still runs fully (anonymous,
// IndexedDB-only). With a key it gains accounts + Supabase cloud sync.
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const tree = clerkKey ? (
  <ClerkProvider publishableKey={clerkKey} afterSignOutUrl="/">
    <DataSyncProvider>
      <App />
    </DataSyncProvider>
  </ClerkProvider>
) : (
  <App />
);

createRoot(document.getElementById("root")).render(
  <StrictMode>{tree}</StrictMode>,
);
