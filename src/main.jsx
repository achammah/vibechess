import { ClerkProvider } from "@clerk/clerk-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.jsx";
import AuthGate from "./components/auth-gate.jsx";
import DataSyncProvider from "./components/data-sync-provider.jsx";

// With a Clerk key, sign-in is REQUIRED (AuthGate). Without a key the app runs
// open (local dev), gaining no accounts/sync.
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const tree = clerkKey ? (
  <ClerkProvider publishableKey={clerkKey} afterSignOutUrl="/">
    <AuthGate>
      <DataSyncProvider>
        <App />
      </DataSyncProvider>
    </AuthGate>
  </ClerkProvider>
) : (
  <App />
);

createRoot(document.getElementById("root")).render(
  <StrictMode>{tree}</StrictMode>,
);
