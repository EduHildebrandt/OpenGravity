import admin from 'firebase-admin';

export function initDb() {
  // Inicializamos Firebase Admin.
  // Utiliza GOOGLE_APPLICATION_CREDENTIALS por defecto.
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  console.log('Firebase Firestore inicializado exitosamente.');
}

/**
 * Interface that represents a message in Firestore
 */
export interface MessageRow {
  id?: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  name: string | null;
  tool_calls: string | null;
  tool_call_id: string | null;
  timestamp: FirebaseFirestore.Timestamp;
}

/**
 * Guardar un mensaje en la subcolección de un usuario (Firestore)
 */
export async function saveMessage(message: Omit<MessageRow, 'id' | 'timestamp'>) {
  const db = admin.firestore();
  
  // Guardamos los mensajes bajo users/{user_id}/messages
  const messagesRef = db.collection('users').doc(message.user_id).collection('messages');
  
  await messagesRef.add({
    ...message,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * Obtener los mensajes del historial de un usuario
 */
export async function getMessagesByUser(userId: string, limitCount = 50): Promise<MessageRow[]> {
  const db = admin.firestore();
  const messagesRef = db.collection('users').doc(userId).collection('messages');
  
  const snapshot = await messagesRef
    .orderBy('timestamp', 'asc')
    .limit(limitCount)
    .get();

  if (snapshot.empty) {
    return [];
  }

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      user_id: data.user_id,
      role: data.role,
      content: data.content,
      name: data.name,
      tool_calls: data.tool_calls,
      tool_call_id: data.tool_call_id,
      timestamp: data.timestamp
    } as MessageRow;
  });
}

/**
 * Eliminar todo el historial de un usuario
 */
export async function clearMessages(userId: string) {
  const db = admin.firestore();
  const messagesRef = db.collection('users').doc(userId).collection('messages');
  
  // Obtener todos los documentos y borrarlos en un batch
  const snapshot = await messagesRef.get();
  
  if (snapshot.size === 0) return;
  
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
}