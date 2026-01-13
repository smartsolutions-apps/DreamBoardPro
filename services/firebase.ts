import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  User
} from "firebase/auth";
// Import helper removed
import { getFirestore, collection, query, orderBy, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, getDoc, setDoc, where, getDocs } from "firebase/firestore/lite";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { Project, StoryScene } from "../types";

// CORRECT CONFIGURATION for Dreamboard Pro
const firebaseConfig = {
  apiKey: "AIzaSyD1FdaTiNvTV7YjCfpVOpeo2auau-5fsD0",
  authDomain: "dreamboard-pro-app.firebaseapp.com",
  projectId: "dreamboard-pro-app",
  storageBucket: "dreamboard-pro-app.firebasestorage.app",
  messagingSenderId: "399676823018",
  appId: "1:399676823018:web:601f7a1c94542b5d580e93",
  measurementId: "G-SRZ7XE6XLD"
};

// --- SAFE INITIALIZATION PATTERN ---
// This prevents the app from white-screening if Firebase fails to load (e.g. ad blockers, bad internet, bad config)
let app, auth: any, db: any, storage: any, googleProvider: any;
let isFirebaseActive = false;

try {
  // Check if we have internet before trying, or just try/catch
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  googleProvider = new GoogleAuthProvider();
  isFirebaseActive = true;
  console.log("Firebase initialized successfully.");
} catch (error) {
  console.error("CRITICAL: Firebase failed to initialize. Falling back to LOCAL OFFLINE MODE.", error);

  // Mock objects to prevent crashes in other files
  const noop = async () => { };
  auth = {
    currentUser: null,
    onAuthStateChanged: (cb: any) => { cb(null); return () => { }; },
    signOut: noop,
    signInWithPopup: noop
  };

  // Create dummy objects for db/storage to prevent 'undefined' access errors before the helper functions intercept them
  db = { type: 'mock-db' };
  storage = { type: 'mock-storage' };
  googleProvider = {};

  isFirebaseActive = false;
}

export type UserData = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

export {
  auth,
  db,
  storage,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  collection,
  query,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  ref,
  uploadString,
  getDownloadURL,
  deleteDoc,
  getDoc,
  setDoc,
  where,
  getDocs
};

// --- CONSTANTS FOR LOCAL FALLBACK ---
const MOCK_USER_ID = 'local-guest';
const LS_AUTH_KEY = 'dreamBoard_localGuest';

// --- INDEXED DB HELPERS (For Local Storage Mode) ---
const DB_NAME = 'DreamBoardLocalDB';
const DB_VERSION = 1;

const openLocalDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB Error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Store for Projects
      if (!db.objectStoreNames.contains('projects')) {
        const pStore = db.createObjectStore('projects', { keyPath: 'id' });
        pStore.createIndex('userId', 'userId', { unique: false });
        pStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Store for Scenes
      if (!db.objectStoreNames.contains('scenes')) {
        const sStore = db.createObjectStore('scenes', { keyPath: 'id' });
        sStore.createIndex('projectId', 'projectId', { unique: false });
        sStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
};

const localPut = async (storeName: string, item: any) => {
  try {
    const db = await openLocalDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) { console.error("Local Put Failed", e); }
};

const localGet = async (storeName: string, id: string): Promise<any> => {
  try {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return null; }
};

const localGetAll = async (storeName: string): Promise<any[]> => {
  try {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return []; }
};

const localGetFromIndex = async (storeName: string, indexName: string, value: string): Promise<any[]> => {
  try {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return []; }
}

// Clear Database function for resetting state
export const clearLocalDatabase = async () => {
  try {
    localStorage.removeItem(LS_AUTH_KEY);
    if (typeof indexedDB !== 'undefined') {
      const req = indexedDB.deleteDatabase(DB_NAME);
      return new Promise<void>((resolve) => {
        req.onsuccess = () => resolve();
        req.onerror = () => resolve(); // Resolve anyway
      });
    }
  } catch (e) { }
};

// --- HELPER FUNCTIONS FOR APP.TSX ---

export const signInAsGuest = async () => {
  try {
    if (isFirebaseActive) {
      const result = await signInAnonymously(auth);
      return result.user;
    } else {
      throw new Error("Firebase inactive");
    }
  } catch (error: any) {
    // Force fallback to Local Mode immediately if any error occurs
    console.warn("Switching to Local Offline Mode due to:", error.message);
    const mockUser = {
      uid: MOCK_USER_ID,
      isAnonymous: true,
      displayName: 'Guest (Offline Mode)',
      email: null,
      photoURL: null,
      emailVerified: false,
      phoneNumber: null,
      tenantId: null,
      providerData: [],
      metadata: {},
      refreshToken: '',
      delete: async () => { },
      getIdToken: async () => 'mock-token',
      getIdTokenResult: async () => ({} as any),
      reload: async () => { },
      toJSON: () => ({})
    } as unknown as User;

    localStorage.setItem(LS_AUTH_KEY, JSON.stringify(mockUser));
    return mockUser;
  }
};

export const signInUser = async () => {
  if (!isFirebaseActive) return signInAsGuest();

  try {
    const result = await signInWithPopup(auth, googleProvider);
    localStorage.removeItem(LS_AUTH_KEY); // Clear local fallback if real auth works
    return result.user;
  } catch (error: any) {
    if (error.code === 'auth/unauthorized-domain' || error.code === 'auth/operation-not-allowed') {
      return signInAsGuest();
    }
    throw error;
  }
};

export const logoutUser = async () => {
  if (isFirebaseActive && auth.currentUser) {
    await signOut(auth);
  }
  localStorage.removeItem(LS_AUTH_KEY);
};

export const getAuthInstance = () => auth;

// --- PROJECT MANAGEMENT ---

export const getOrCreateProject = async (userId: string, title: string): Promise<Project> => {
  const activeUserId = userId;

  // Force local mode if Firebase is down or user is the mock user
  if (activeUserId === MOCK_USER_ID || !isFirebaseActive || activeUserId.startsWith('guest_')) {
    const projects = await localGetAll('projects');
    const existing = projects.find((p: Project) => p.title === title && p.userId === userId);
    if (existing) return existing;

    const newProject: Project = {
      id: `local-proj-${Date.now()}`,
      userId,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sceneCount: 0,
      scenes: []
    };

    await localPut('projects', newProject);
    return newProject;
  }

  // QUERY SUBCOLLECTION: users/{userId}/projects
  const projectsRef = collection(db, "users", userId, "projects");
  const q = query(projectsRef, where("title", "==", title));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    const docData = snapshot.docs[0].data();
    return { id: snapshot.docs[0].id, ...docData } as Project;
  }

  const newProject: Omit<Project, 'id'> = {
    userId,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sceneCount: 0,
    scenes: []
  };

  const docRef = await addDoc(projectsRef, newProject);
  return { id: docRef.id, ...newProject };
};

export const getUserProjects = async (userId: string): Promise<Project[]> => {
  if (!userId) return [];

  if (userId === MOCK_USER_ID || !isFirebaseActive) {
    const projects = await localGetAll('projects');
    return projects.sort((a: Project, b: Project) => b.updatedAt - a.updatedAt);
  }

  // QUERY SUBCOLLECTION: users/{userId}/projects
  try {
    const projectsRef = collection(db, "users", userId, "projects");
    const q = query(projectsRef, orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);

    const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
    console.log(`Fetched ${projects.length} projects for user ${userId}`);
    return projects;
  } catch (error) {
    console.error("Error fetching projects:", error);
    return [];
  }
};

export const getProjectScenes = async (projectId: string): Promise<StoryScene[]> => {
  if (!projectId) return [];
  const authInstance = getAuth();
  const userId = authInstance.currentUser?.uid;

  if (projectId.startsWith('local-') || !isFirebaseActive) {
    const scenes = await localGetFromIndex('scenes', 'projectId', projectId);
    return scenes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  const scenesRef = collection(db, "scenes");
  const q = query(scenesRef, where("projectId", "==", projectId), orderBy("timestamp", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StoryScene));
}

// --- STORAGE ---

// --- STORAGE HELPERS ---
const sanitizeName = (name: string) => {
  return name.replace(/[^a-z0-9]/gi, '_').toLowerCase().replace(/^_+|_+$/g, '');
};

const getCompactDate = () => {
  const d = new Date();
  return d.toISOString().split('T')[0].replace(/-/g, ''); // 20260113
};

export const uploadImageToStorage = async (userOrId: any, projectName: string, sceneIndexOrTitle: string | number, imageData: string): Promise<string> => {
  if (!isFirebaseActive) {
    console.warn("Skipping Firebase Upload (Offline)");
    return imageData;
  }

  // 1. Resolve User ID and Folder Name
  let userId = 'guest';
  let userFolder = `guest_${getCompactDate()}`;

  if (userOrId && typeof userOrId === 'object' && userOrId.uid) {
    // It's a User object
    userId = userOrId.uid;
    const safeName = userOrId.displayName ? sanitizeName(userOrId.displayName) : 'user';
    userFolder = `${safeName}_${userId.substring(0, 6)}`;
  } else if (typeof userOrId === 'string' && userOrId !== 'temp_guest') {
    // It's a UID string
    userId = userOrId;
    userFolder = `user_${userId.substring(0, 6)}`;
  }

  // 2. Sanitize Project & Filename
  const safeTitle = sanitizeName(projectName) || 'untitled_project';
  const safeScene = typeof sceneIndexOrTitle === 'number'
    ? `scene_${String(sceneIndexOrTitle + 1).padStart(3, '0')}`
    : sanitizeName(String(sceneIndexOrTitle));

  const fullDate = getCompactDate();
  const filename = `${safeTitle}_${safeScene}_${fullDate}.png`;

  // 3. Construct Path: users/{UserFolder}/{Project}/{Filename}
  const path = `users/${userFolder}/${safeTitle}/${filename}`;

  try {
    const storageRef = ref(storage, path);
    let base64ToUpload = imageData;
    if (imageData.startsWith('http')) {
      base64ToUpload = await urlToBase64(imageData);
    }

    await uploadString(storageRef, base64ToUpload, 'data_url');
    const url = await getDownloadURL(storageRef);
    console.log(`✅ UPLOAD SUCCESS: ${path}`);
    return url;
  } catch (error) {
    console.error("Firebase Upload FAILED:", error);
    return imageData; // Fallback to local data
  }
};

export const saveSceneToFirestore = async (projectId: string, scene: StoryScene) => {
  if (!projectId) return;

  // Local Mode
  if (projectId.startsWith('local-') || !isFirebaseActive) {
    const cleanScene = JSON.parse(JSON.stringify(scene));
    cleanScene.projectId = projectId;
    cleanScene.timestamp = Date.now();
    await localPut('scenes', cleanScene);
    return scene.id;
  }

  // 1. Save Full Scene Data to 'scenes' collection (or we could move to subcollection)
  // Staying with top-level 'scenes' for now to match getProjectScenes logic above
  const scenesRef = collection(db, "scenes");
  const cleanScene = JSON.parse(JSON.stringify(scene));
  cleanScene.projectId = projectId;
  // Ensure timestamp exists
  cleanScene.timestamp = cleanScene.timestamp || Date.now();

  if (scene.id.startsWith('scene-')) {
    // It's a temp ID, might want a real one, but usually we just setDoc with the ID we generated
    const docRef = doc(db, "scenes", scene.id);
    await setDoc(docRef, sanitizeForFirestore(cleanScene));
  } else {
    const docRef = doc(db, "scenes", scene.id);
    await setDoc(docRef, sanitizeForFirestore(cleanScene), { merge: true });
  }

  // 2. TRIGGER PROJECT UPDATE (Vital for Metadata)
  // We need to trigger saveProject to update the array.
  // Ideally App.tsx calls saveProject. 
  // But here we can just update the updatedAt on the project to show activity.
  // Note: We cannot easily update the 'scenes' array here without reading all scenes.
  // So we rely on App.tsx to call saveProject(project, scenes) periodically or after generation.
  // We WILL update the timestamp though.

  // Need userId. Query or pass it?
  // We'll skip deep project update here and rely on the explicit saveProject call from App.tsx 
  // which passing the full list.

  return scene.id;
};

export const updateProjectThumbnail = async (projectId: string, thumbnailUrl: string) => {
  // This function is less useful now that saveProject handles thumbnails.
  // We'll keep it as a no-op or simple update if needed.
};

// --- HELPER FIXES ---

export const urlToBase64 = async (url: string): Promise<string> => {
  if (!url || !url.startsWith('http')) return url;
  try {
    // FIX: Add Cache Buster & CORS Mode
    const corsUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;

    const response = await fetch(corsUrl, {
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Origin': window.location.origin // Explicit origin often helps
      }
    });

    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("urlToBase64 Failed (CORS likely):", error);
    return url; // Return original URL if conversion fails
  }
};

export const uploadAudioToStorage = async (userOrId: any, projectName: string, sceneTitle: string, audioData: string): Promise<string> => {
  if (!isFirebaseActive) return audioData;

  // 1. Resolve User ID and Folder Name
  let userId = 'guest';
  let userFolder = `guest_${getCompactDate()}`;

  if (userOrId && typeof userOrId === 'object' && userOrId.uid) {
    userId = userOrId.uid;
    const safeName = userOrId.displayName ? sanitizeName(userOrId.displayName) : 'user';
    userFolder = `${safeName}_${userId.substring(0, 6)}`;
  } else if (typeof userOrId === 'string' && userOrId !== 'temp_guest') {
    userId = userOrId;
    userFolder = `user_${userId.substring(0, 6)}`;
  }

  const safeProjectName = sanitizeName(projectName) || 'untitled_project';
  const safeSceneTitle = sanitizeName(sceneTitle) || 'untitled_audio';
  const fullDate = getCompactDate().replace(/-/g, '');

  const filename = `${safeProjectName}_${safeSceneTitle}_${fullDate}.wav`;
  // Uniform Path: users/{Folder}/{Project}/{File}
  const path = `users/${userFolder}/${safeProjectName}/${filename}`;

  try {
    const storageRef = ref(storage, path);
    await uploadString(storageRef, audioData, 'data_url');
    const url = await getDownloadURL(storageRef);
    console.log("Audio Uploaded:", url);
    return url;
  } catch (error) {
    console.error("Audio Upload Failed:", error);
    return audioData;
  }
};

export const uploadVideoToStorage = async (userOrId: any, projectName: string, sceneTitle: string, videoUrlOrBlob: string): Promise<string> => {
  if (!isFirebaseActive) return videoUrlOrBlob;

  // 1. Resolve User ID and Folder Name
  let userId = 'guest';
  let userFolder = `guest_${getCompactDate()}`;

  if (userOrId && typeof userOrId === 'object' && userOrId.uid) {
    userId = userOrId.uid;
    const safeName = userOrId.displayName ? sanitizeName(userOrId.displayName) : 'user';
    userFolder = `${safeName}_${userId.substring(0, 6)}`;
  } else if (typeof userOrId === 'string' && userOrId !== 'temp_guest') {
    userId = userOrId;
    userFolder = `user_${userId.substring(0, 6)}`;
  }

  const safeProjectName = sanitizeName(projectName) || 'untitled_project';
  const safeSceneTitle = sanitizeName(sceneTitle) || 'untitled_video';
  const fullDate = getCompactDate();

  const filename = `${safeProjectName}_${safeSceneTitle}_${fullDate}.mp4`;
  const path = `users/${userFolder}/${safeProjectName}/${filename}`;

  try {
    const storageRef = ref(storage, path);

    // Check if it's already a URL (e.g. from Veo or re-upload)
    if (videoUrlOrBlob.startsWith('http')) {
      // Return original if we can't easily re-upload without CORS issues
      return videoUrlOrBlob;
    }

    await uploadString(storageRef, videoUrlOrBlob, 'data_url');
    const url = await getDownloadURL(storageRef);
    console.log("Video Uploaded:", url);
    return url;
  } catch (error) {
    console.error("Video Upload Failed:", error);
    return videoUrlOrBlob;
  }
};

// --- SANITIZATION HELPER (CRITICAL FOR FIRESTORE) ---
const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  const newObj: any = {};
  for (const key in obj) {
    newObj[key] = sanitizeForFirestore(obj[key]);
  }
  return newObj;
};

export const saveProject = async (project: Project, scenesList?: StoryScene[]) => {
  if (!project.id) return;

  /* 
     CRITICAL: We must save to users/{userId}/projects/{projectId}
     AND include the 'scenes' metadata array.
  */

  if (project.id.startsWith('local-') || !isFirebaseActive) {
    await localPut('projects', project);
    return;
  }

  try {
    const projectRef = doc(db, "users", project.userId, "projects", project.id);

    const { id, ...data } = project;
    const deployPayload: any = {
      ...data,
      updatedAt: serverTimestamp() // Use server time
    };

    // If we have scenesList, map them to lightweight metadata
    // If not, we trust the project object might already have it or we skip updating scenes
    if (scenesList && scenesList.length > 0) {
      deployPayload.scenes = scenesList.map(s => ({
        storageUrl: s.imageUrl || '',
        id: s.id
      })).filter(s => s.storageUrl);

      // Sync scene count
      deployPayload.sceneCount = scenesList.length;

      // Sync thumbnail (use first image)
      if (scenesList[0].imageUrl) {
        deployPayload.thumbnailUrl = scenesList[0].imageUrl;
      }
    }

    // SANITIZE BEFORE SAVE
    const cleanPayload = sanitizeForFirestore(deployPayload);

    await setDoc(projectRef, cleanPayload, { merge: true });
    console.log("🔥 SUCCESS: Project saved to DB", project.id);

  } catch (e) {
    console.error("Failed to save project:", e);
  }
};
