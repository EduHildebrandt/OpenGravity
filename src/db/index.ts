/**
 * @file src/db/index.ts
 * @description Firestore data-access layer.
 *
 * All Firestore interaction is centralised here so that the rest of the app
 * never imports firebase-admin directly.
 *
 * Data model:
 *   users/{userId}/messages/{messageId}  →  MessageRow
 */

import admin from 'firebase-admin';

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/** Initialise Firebase Admin SDK (safe to call multiple times). */
export function initDb() {
  if (!admin.apps.length) {
    // Uses GOOGLE_APPLICATION_CREDENTIALS env var in local dev,
    // and the attached service account in Google Cloud automatically.
    admin.initializeApp();
  }
  console.log('Firebase Firestore initialised.');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single conversation message stored in Firestore. */
export interface MessageRow {
  id?: string;
  user_id: string;
  /** LLM role: 'user' | 'assistant' | 'system' | 'tool' */
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  /** Function name (only used for role=tool rows) */
  name: string | null;
  /** JSON-serialised array of tool_call objects (only for role=assistant rows) */
  tool_calls: string | null;
  /** Correlates a tool-result row back to its tool_call (only for role=tool rows) */
  tool_call_id: string | null;
  timestamp: FirebaseFirestore.Timestamp;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMessagesRef(userId: string) {
  return admin
    .firestore()
    .collection('users')
    .doc(userId)
    .collection('messages');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a new message for a user.
 * The `timestamp` is set server-side so it is always monotonically increasing.
 */
export async function saveMessage(
  message: Omit<MessageRow, 'id' | 'timestamp'>
) {
  await getMessagesRef(message.user_id).add({
    ...message,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Fetch the most-recent `limit` messages for a user, returned in
 * chronological (oldest-first) order so they can be fed directly to an LLM.
 */
export async function getMessagesByUser(
  userId: string,
  limit = 50
): Promise<MessageRow[]> {
  const snapshot = await getMessagesRef(userId)
    .orderBy('timestamp', 'desc') // newest first …
    .limit(limit)
    .get();

  if (snapshot.empty) return [];

  // … then reverse so the LLM sees them oldest-first
  return snapshot.docs
    .slice()
    .reverse()
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        user_id: d.user_id,
        role: d.role,
        content: d.content,
        name: d.name,
        tool_calls: d.tool_calls,
        tool_call_id: d.tool_call_id,
        timestamp: d.timestamp,
      } as MessageRow;
    });
}

/**
 * Delete the entire conversation history for a user.
 * Used by the /clear bot command.
 */
export async function clearMessages(userId: string) {
  const ref = getMessagesRef(userId);
  const snapshot = await ref.get();
  if (snapshot.empty) return;

  const batch = admin.firestore().batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}