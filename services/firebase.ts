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
  const noop = async () => {};
  auth = { 
      currentUser: null, 
      onAuthStateChanged: (cb: any) => { cb(null); return () => {}; },
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
  } catch(e) { console.error("Local Put Failed", e); }
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
  } catch(e) { return null; }
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
    } catch(e) { return []; }
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
    } catch(e) { return []; }
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
  } catch(e) {}
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
        delete: async () => {},
        getIdToken: async () => 'mock-token',
        getIdTokenResult: async () => ({} as any),
        reload: async () => {},
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

// --- PROJECT MANAGEMENT (With Local Fallback) ---

export const getOrCreateProject = async (userId: string, title: string): Promise<Project> => {
  if (!userId) throw new Error("User ID is required to create a project");

  // Force local mode if Firebase is down or user is the mock user
  if (userId === MOCK_USER_ID || !isFirebaseActive) {
    const projects = await localGetAll('projects');
    const existing = projects.find((p: Project) => p.title === title && p.userId === userId);
    if (existing) return existing;

    const newProject: Project = {
        id: `local-proj-${Date.now()}`,
        userId,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sceneCount: 0
    };
    
    await localPut('projects', newProject);
    return newProject;
  }

  const projectsRef = collection(db, "projects");
  const q = query(projectsRef, where("userId", "==", userId), where("title", "==", title));
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
    sceneCount: 0
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

  const projectsRef = collection(db, "projects");
  const q = query(projectsRef, where("userId", "==", userId), orderBy("updatedAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
};

export const getProjectScenes = async (projectId: string): Promise<StoryScene[]> => {
    if (!projectId) return [];

    if (projectId.startsWith('local-') || !isFirebaseActive) {
        const scenes = await localGetFromIndex('scenes', 'projectId', projectId);
        return scenes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    }

    const scenesRef = collection(db, "scenes");
    const q = query(scenesRef, where("projectId", "==", projectId), orderBy("timestamp", "asc")); 
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StoryScene));
}

// --- STORAGE & SCENE SAVING (With Local Fallback) ---

export const uploadImageToStorage = async (userId: string, projectName: string, sceneTitle: string, base64Image: string): Promise<string> => {
  if (userId === MOCK_USER_ID || !isFirebaseActive) {
      console.warn("Skipping Firebase Upload (Local Mode/Offline)");
      return base64Image;
  }

  const safeProjectName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  
  let safeSceneTitle = sceneTitle.toLowerCase().trim();
  safeSceneTitle = safeSceneTitle.replace(/[\s\W-]+/g, '_'); 
  safeSceneTitle = safeSceneTitle.replace(/^_+|_+$/g, '');
  
  if (!safeSceneTitle) safeSceneTitle = "untitled_scene";

  const timestamp = Date.now();
  const filename = `${safeSceneTitle}_${timestamp}.png`;
  
  const path = `users/${userId}/scenes/${filename}`;

  try {
      const storageRef = ref(storage, path);
      await uploadString(storageRef, base64Image, 'data_url');
      const url = await getDownloadURL(storageRef);
      return url;
  } catch (error) {
      console.error("Firebase Storage Upload FAILED:", error);
      return base64Image;
  }
};

export const saveSceneToFirestore = async (projectId: string, scene: StoryScene) => {
    if (!projectId) return;

    if (projectId.startsWith('local-') || !isFirebaseActive) {
        const cleanScene = JSON.parse(JSON.stringify(scene));
        cleanScene.projectId = projectId;
        cleanScene.timestamp = Date.now();
        
        await localPut('scenes', cleanScene);
        
        const project = await localGet('projects', projectId);
        if (project) {
            const allScenes = await localGetFromIndex('scenes', 'projectId', projectId);
            project.updatedAt = Date.now();
            project.sceneCount = allScenes.length;
            if (!project.thumbnailUrl && cleanScene.imageUrl) {
                project.thumbnailUrl = cleanScene.imageUrl;
            }
            await localPut('projects', project);
        }
        return scene.id;
    }

    const scenesRef = collection(db, "scenes");
    const cleanScene = JSON.parse(JSON.stringify(scene)); 
    cleanScene.projectId = projectId;
    cleanScene.timestamp = Date.now(); 

    if (scene.id.startsWith('scene-')) {
        const docRef = await addDoc(scenesRef, cleanScene);
        return docRef.id;
    } else {
        const docRef = doc(db, "scenes", scene.id);
        await setDoc(docRef, cleanScene, { merge: true });
        return scene.id;
    }
};

export const updateProjectThumbnail = async (projectId: string, thumbnailUrl: string) => {
    if (!projectId) return;

    if (projectId.startsWith('local-') || !isFirebaseActive) {
        const project = await localGet('projects', projectId);
        if (project) {
            project.thumbnailUrl = thumbnailUrl;
            project.updatedAt = Date.now();
            await localPut('projects', project);
        }
        return;
    }

    const projectRef = doc(db, "projects", projectId);
    await updateDoc(projectRef, { thumbnailUrl, updatedAt: Date.now() });
};