// ============================================================
//  Froggy & Jumper settings
// ============================================================
//
//  MODE 1 — LOCAL (works right away, no setup)
//  Password = "froggyjumper" (change it! see README steps below)
//  Lists are saved in THIS browser only, so you and your partner
//  would NOT see each other's edits.
//
//  To set your own password, get its SHA-256 hash (e.g. search
//  "sha256 online" and paste your password), then replace below.
//
//  MODE 2 — SHARED (recommended: real password + both of you see
//  the same lists on any device). Fill in FIREBASE_CONFIG below.
//  Setup (free):
//   1. console.firebase.google.com → create project → add a Web app,
//      copy its config object into FIREBASE_CONFIG.
//   2. Build → Authentication → enable "Email/Password" → add ONE user
//      using SHARED_EMAIL below + the password you both will type.
//   3. Build → Firestore Database → create → Rules tab, paste:
//        rules_version = '2';
//        service cloud.firestore {
//          match /databases/{db}/documents {
//            match /{document=**} {
//              allow read, write: if request.auth != null;
//            }
//          }
//        }
//   4. Authentication → Settings → Authorized domains → add
//      <your-username>.github.io
// ============================================================

const PASSWORD_HASH =
  "660e09e8a378b75a535c17e078ffe9a6e85a278dd268cb36881cf002857701c6";

const SHARED_EMAIL = "froggy-and-jumper@example.com"; // any email you create in step 2

const FIREBASE_CONFIG = null;
// Example:
// const FIREBASE_CONFIG = {
//   apiKey: "...",
//   authDomain: "...firebaseapp.com",
//   projectId: "...",
//   appId: "..."
// };
