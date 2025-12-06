const DB_NAME = 'VlogRouletteDB';
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'current_vlog_draft';

// Initialize the database
export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export interface DraftData {
  clips: {
    id: string;
    base64: string; // Changed from Blob to string for reliability
    originalDuration: number;
    trimStart: number;
    trimEnd: number;
  }[];
  captions: any[];
  vlogTitle: string;
  vlogDescription: string;
  updatedAt: number;
}

// Save draft to IndexedDB
export const saveDraftToDB = async (data: DraftData) => {
  try {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(data, DRAFT_KEY);
      request.onsuccess = () => resolve();
      request.onerror = (e) => {
        console.error("IndexedDB Save Error:", (e.target as any).error);
        reject((e.target as any).error);
      };
    });
  } catch (error) {
    console.error("Database Init Error:", error);
    throw error;
  }
};

// Retrieve draft from IndexedDB
export const getDraftFromDB = async (): Promise<DraftData | undefined> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(DRAFT_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    return undefined;
  }
};

// Clear draft from IndexedDB
export const clearDraftFromDB = async () => {
  try {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(DRAFT_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Clear DB Error:", error);
  }
};