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
import { getGuestId } from "./auth"; // Import helper
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

    // If we have scenes list, map them to lightweight metadata
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

    await setDoc(projectRef, deployPayload, { merge: true });
    console.log("Project metadata saved to Firestore:", project.id);

  } catch (e) {
    console.error("Failed to save project:", e);
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
    await setDoc(docRef, cleanScene);
  } else {
    const docRef = doc(db, "scenes", scene.id);
    await setDoc(docRef, cleanScene, { merge: true });
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
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("urlToBase64 Failed:", error);
    return url;
  }
};

export const uploadAudioToStorage = async (userId: string, sceneTitle: string, audioData: string): Promise<string> => {
  if (userId === MOCK_USER_ID || !isFirebaseActive) return audioData;

  const timestamp = Date.now();
  const filename = `audio_${sanitizeName(sceneTitle)}_${timestamp}.wav`; // Use sanitized
  const path = `users/${userId}/audio/${filename}`;

  try {
    const storageRef = ref(storage, path);
    await uploadString(storageRef, audioData, 'data_url');
    return await getDownloadURL(storageRef);
  } catch (error) {
    console.error("Audio Upload Failed:", error);
    return audioData;
  }
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

    await setDoc(projectRef, deployPayload, { merge: true });
    console.log("🔥 SUCCESS: Project saved to DB", project.id);

  } catch (e) {
    console.error("Failed to save project:", e);
  }
};
