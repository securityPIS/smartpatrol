const DB_NAME = 'smartpatrol-images';
const STORE_NAME = 'photos';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    
    request.onerror = (event) => {
      dbPromise = null;
      reject(event.target.error);
    };
  });
  
  return dbPromise;
}

export async function saveImageToDB(dataUrl) {
  try {
    const db = await openDB();
    const key = `idb://img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(dataUrl, key);
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(key);
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Failed to save image to IndexedDB:', error);
    return null;
  }
}

export async function loadImageFromDB(key) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to load image from IndexedDB:', error);
    return null;
  }
}
