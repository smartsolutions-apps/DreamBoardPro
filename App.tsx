import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Sparkles, BookOpen, AlertCircle, RefreshCw, Wand2, Layout, FileDown, CheckSquare, Square, FileWarning, X, Image as ImageIcon, PlayCircle, Search, LogOut, LayoutGrid, FolderOpen, Plus, User as UserIcon, Check, Trash2 } from 'lucide-react';
import { jsPDF } from "jspdf";
import { User } from 'firebase/auth';

// Components
import { ChatWidget } from './components/ChatWidget';
import { SettingsBar } from './components/SettingsBar';
import { SceneCard } from './components/SceneCard';
import { TemplateLibrary } from './components/TemplateLibrary';
import { VoiceInput } from './components/VoiceInput';
import { CompareView } from './components/CompareView';
import { ImageLibrary } from './components/ImageLibrary';
import { AnimaticPlayer } from './components/AnimaticPlayer';
import { LoginScreen } from './components/LoginScreen';

// Services
import { analyzeScript, generateSceneImage, refineSceneImage, upscaleImage, checkContinuity, generateSceneVideo, generateNarration, autoTagScene, ContinuityIssue, STYLE_DEFINITIONS } from './services/geminiService';
import { getAuthInstance, getOrCreateProject, uploadImageToStorage, saveSceneToFirestore, updateProjectThumbnail, getUserProjects, getProjectScenes, clearLocalDatabase, urlToBase64, uploadAudioToStorage, uploadVideoToStorage, saveProject } from './services/firebase';
import { logout, ensureAuthenticated, loginWithGoogle } from './services/auth';

// Types
import { ImageSize, AspectRatio, StoryScene, ColorMode, ArtStyle, SceneVersion, SceneTemplate, Project } from './types';

type ViewMode = 'editor' | 'studio';

function App() {
  // --- Auth State ---
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // --- App View State ---
  const [currentView, setCurrentView] = useState<ViewMode>('editor');
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projectTitle, setProjectTitle] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // --- Editor State ---
  const [script, setScript] = useState('');
  const [characterSheet, setCharacterSheet] = useState(''); // NEW: For consistency

  // Settings State
  const [imageSize, setImageSize] = useState<ImageSize>(ImageSize.Size1K);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.Cinematic);
  const [colorMode, setColorMode] = useState<ColorMode>(ColorMode.Color);
  const [artStyle, setArtStyle] = useState<ArtStyle>("Pencil Sketch");
  const [sceneCount, setSceneCount] = useState<number>(1);
  const [styleReference, setStyleReference] = useState<string | undefined>();

  const [scenes, setScenes] = useState<StoryScene[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());
  const [customTemplates, setCustomTemplates] = useState<SceneTemplate[]>(() => {
    const saved = localStorage.getItem('dreamBoard_templates');
    return saved ? JSON.parse(saved) : [];
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* New Loading State for Serial Progress */
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);

  const [draggedSceneIndex, setDraggedSceneIndex] = useState<number | null>(null);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [continuityReport, setContinuityReport] = useState<ContinuityIssue[]>([]);

  const [showAnimatic, setShowAnimatic] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [compareState, setCompareState] = useState<{ sceneId: string, version: SceneVersion } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // --- Auth Effect ---
  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadProjects(currentUser.uid);
      } else {
        setUser(null);
        setProjects([]);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentView === 'studio' && user) {
      loadProjects(user.uid);
    }
  }, [currentView, user]);

  useEffect(() => {
    localStorage.setItem('dreamBoard_templates', JSON.stringify(customTemplates));
  }, [customTemplates]);

  // --- SETTINGS PERSISTENCE ---
  useEffect(() => {
    localStorage.setItem('user_prefs', JSON.stringify({
      sceneCount,
      aspectRatio,
      artStyle,
      colorMode,
      styleReference,
      imageSize
    }));
  }, [sceneCount, aspectRatio, artStyle, colorMode, styleReference, imageSize]);

  // --- SAFTEY NET: LOCAL CACHING ---
  useEffect(() => {
    if (scenes.length > 0 || script.trim()) {
      try {
        // PERF: Create lightweight scenes (No Base64) to prevent QuotaExceededError
        const lightweightScenes = scenes.map(s => ({
          ...s,
          imageUrl: s.imageUrl?.startsWith('data:') ? "[IMAGE_SAVED_IN_CLOUD]" : s.imageUrl, // Only keep cloud URLs
          versions: [] // Don't cache version history (too heavy)
        }));

        localStorage.setItem('cached_story', JSON.stringify({
          projectTitle,
          script,
          scenes: lightweightScenes,
          lastSaved: new Date().toISOString()
        }));
      } catch (e) {
        console.warn("LocalStorage Cache Failed (Quota Exceeded likely)", e);
      }
    }
  }, [scenes, script, projectTitle]);

  useEffect(() => {
    // RESTORE ON MOUNT
    const cached = localStorage.getItem('cached_story');
    const userPrefs = localStorage.getItem('user_prefs');

    if (userPrefs) {
      try {
        const settings = JSON.parse(userPrefs);
        if (settings.sceneCount) setSceneCount(settings.sceneCount);
        if (settings.aspectRatio) setAspectRatio(settings.aspectRatio);
        if (settings.artStyle) setArtStyle(settings.artStyle);
        if (settings.colorMode) setColorMode(settings.colorMode);
        if (settings.styleReference) setStyleReference(settings.styleReference);
        if (settings.imageSize) setImageSize(settings.imageSize);
      } catch (e) { console.error("Failed to restore settings", e); }
    }

    if (cached && !scenes.length && !script) {
      try {
        const data = JSON.parse(cached);
        if (data.scenes?.length > 0 || data.script) {
          console.log("Restoring cached session...");
          setProjectTitle(data.projectTitle || '');
          setScript(data.script || '');
          setScenes(data.scenes || []);
          setLastSaved(data.lastSaved ? new Date(data.lastSaved) : null);
        }
      } catch (e) {
        console.error("Failed to restore cache", e);
      }
    }
  }, []);

  // --- GOOGLE ONE-TAP ---
  useEffect(() => {
    if (!user && (window as any).google) {
      try {
        (window as any).google.accounts.id.initialize({
          client_id: "399676823018-86d119100523-289520442308.apps.googleusercontent.com", // Placeholder - often requires real Client ID
          callback: (response: any) => {
            // This is just a UI prompt, real auth happens via Firebase usually
            // but we can try to sign in with credential if needed.
            // For now, let's just let the user know they can sign in.
            console.log("One Tap Response", response);
            // Ideally: loginWithGoogle() or signInWithCredential
          },
          auto_select: false,
          cancel_on_tap_outside: true
        });
        (window as any).google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            console.log("One Tap skipped/not displayed");
          }
        });
      } catch (e) {
        console.error("One Tap Error", e);
      }
    }
  }, [user]);

  const loadProjects = async (uid: string) => {
    if (!uid) return;
    try {
      const userProjects = await getUserProjects(uid);
      setProjects(userProjects);
    } catch (err) {
      console.error("Failed to load projects", err);
    }
  };

  const handleOpenProject = async (project: Project) => {
    setCurrentProject(project);
    setProjectTitle(project.title);

    // RESTORE FULL STATE
    if (project.script) setScript(project.script);
    if (project.characterSheet) setCharacterSheet(project.characterSheet);

    setProcessingStatus(`Loading ${project.title}...`);

    try {
      const projectScenes = await getProjectScenes(project.id);

      // Batch State Updates for smoothness
      if (projectScenes.length > 0) {
        setScenes(projectScenes);
      } else {
        setScenes([]);
      }

      // UX: Scroll up & Switch View
      window.scrollTo(0, 0);
      setCurrentView('editor');

      // Success Feedback
      setProcessingStatus(null);
      console.log("Project Loaded:", project.title);

    } catch (err) {
      console.error("Error loading project scenes", err);
      setError("Failed to load project.");
      setProcessingStatus(null);
    }
  };

  // --- SCENE DELETION ---
  const handleDeleteScene = async (sceneId: string) => {
    // 1. Optimistic Update
    const updatedScenes = scenes.filter(s => s.id !== sceneId);
    setScenes(updatedScenes);

    // 2. Persist Project Update (Important for scene count sync)
    if (currentProject) {
      await saveProject({
        ...currentProject,
        sceneCount: updatedScenes.length
      }, updatedScenes);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setCurrentView('studio');
    setScenes([]);
    setScript('');
    setCurrentProject(null);
    setProjectTitle('');
    setProjects([]);
    window.location.reload(); // Ensure clean state
  };

  const handleNewProject = async () => {
    if (window.confirm("Start a new project? This will clear your current workspace.")) {
      // 1. Clear Cache
      localStorage.removeItem('cached_story');
      // Note: We deliberately KEEP user_prefs (Standard SaaS Persistence)

      // 2. Reset State
      setScript('');
      setScenes([]);
      setCharacterSheet('');
      setProjectTitle('');
      setCurrentProject(null);
      setLastSaved(null);

      // 3. UX
      window.scrollTo(0, 0);
      setIsLibraryOpen(false);
      setShowAnimatic(false);
    }
  };

  // Helper to persist a scene and update UI state
  const persistSceneUpdate = async (updatedScene: StoryScene, fullScenesList?: StoryScene[]) => {
    if (user && currentProject) {
      setIsSaving(true);
      try {
        // 1. Save the specific scene
        await saveSceneToFirestore(currentProject.id, updatedScene);

        // 2. Save Project Metadata (with scenes array)
        // We need the latest scenes list. If passed, use it, otherwise mapped from state (which might be stale, so better to pass it)
        const scenesToSave = fullScenesList || scenes.map(s => s.id === updatedScene.id ? updatedScene : s);

        await saveProject({
          ...currentProject,
          sceneCount: scenesToSave.length
        }, scenesToSave);

        setLastSaved(new Date());
      } catch (e) {
        console.error("Auto-save failed", e);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const saveToHistory = (scene: StoryScene) => {
    if (!scene.imageUrl) return [];
    const newVersion: SceneVersion = {
      id: Date.now().toString(),
      imageUrl: scene.imageUrl,
      prompt: scene.prompt,
      timestamp: Date.now()
    };
    return [...(scene.versions || []), newVersion].slice(-10);
  };

  const handleAnalyze = async () => {
    // FIX: Define safeTitle to prevent ReferenceError
    const safeTitle = projectTitle ? projectTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'untitled_project';
    let activeProjectId = currentProject?.id;

    // --- INSTANT LOCK UI ---
    setIsAnalyzing(true);
    setProcessingStatus("Initializing AI Engine...");
    // -----------------------

    // Only create project if user is logged in
    if (user) {
      try {
        const project = await getOrCreateProject(user.uid, safeTitle);
        setCurrentProject(project);
        activeProjectId = project.id;
        loadProjects(user.uid);
      } catch (err) {
        console.error("Project creation failed", err);
        // Don't block generation, just proceed in Guest Mode
      }
    }

    setScenes([]);
    setSelectedSceneIds(new Set());

    try {
      // FIX: Extract Characters for Consistency
      const analysis = await analyzeScript(script, sceneCount);
      const prompts = analysis.scenes;
      const extractedCharacters = analysis.characters;
      setCharacterSheet(extractedCharacters);
      console.log("Character Sheet Extracted:", extractedCharacters);

      const initialScenes: StoryScene[] = prompts.map((prompt, index) => ({
        id: `scene-${Date.now()}-${index}`,
        title: `Scene ${index + 1}`,
        prompt,
        isLoading: true,
        versions: [],
        assetHistory: [], // Initialize empty
        projectId: activeProjectId
      }));

      // Update UI with placeholders
      setScenes(initialScenes);

      const total = initialScenes.length;

      // --- PHASE 1: BATCH GENERATION (Consistency & Speed) ---
      setProcessingStatus(`Generating ${total} scenes in parallel (Consistency Mode)...`);

      // Resolve Master Style Prompt (Consistent Styles)
      const masterStylePrompt = STYLE_DEFINITIONS[artStyle] || artStyle;

      // Launch all generation requests in parallel
      const generationPromises = initialScenes.map(async (scene) => {
        try {
          const base64Image = await generateSceneImage(
            scene.prompt,
            imageSize,
            aspectRatio,
            artStyle,
            colorMode,
            undefined,
            styleReference,
            masterStylePrompt, // Style Bible
            extractedCharacters // Character Bible
          );
          return { ...scene, imageUrl: base64Image, isLoading: false };
        } catch (err: any) {
          console.error(`Generation failed for scene ${scene.id}`, err);
          return { ...scene, isLoading: false, error: err.message || "Generation failed." };
        }
      });

      const generatedScenes = await Promise.all(generationPromises);

      // IMMEDIATE UI UPDATE: Show all images
      setScenes(generatedScenes);

      // --- PHASE 2: SERIAL UPLOAD (Network Safety) ---
      setProcessingStatus("Saving to cloud...");

      const uploadedScenes: StoryScene[] = [];
      let savedCount = 0;

      for (const [index, scene] of generatedScenes.entries()) {
        const currentScene = scene;

        // Skip failed generations
        if (!currentScene.imageUrl || currentScene.error) {
          uploadedScenes.push(currentScene);
          continue;
        }

        try {
          setProcessingStatus(`Saving Scene ${index + 1} of ${total} to cloud...`);

          let cloudUrl = currentScene.imageUrl;
          let uploadSuccess = false;

          try {
            // Calculate index for strict naming
            const safeIndex = index;

            // Upload to Firebase
            cloudUrl = await uploadImageToStorage(user, projectTitle, safeIndex, currentScene.imageUrl);
            uploadSuccess = true;
          } catch (e) {
            console.error(`Upload failed for Scene ${index + 1}`, e);
          }

          // Create Asset Entry
          const initialAsset: AssetVersion = {
            id: Date.now().toString(),
            type: 'illustration',
            url: cloudUrl,
            prompt: currentScene.prompt,
            createdAt: Date.now()
          };

          const finalSceneWithHistory = {
            ...currentScene,
            imageUrl: cloudUrl,
            assetHistory: [initialAsset] // First entry
          };

          uploadedScenes.push(finalSceneWithHistory);
          savedCount++;

          // Update State incrementally 
          setScenes(current => current.map(s => s.id === finalSceneWithHistory.id ? finalSceneWithHistory : s));

          // Save Scene Metadata to Firestore (if uploaded)
          if (activeProjectId && uploadSuccess) {
            await saveSceneToFirestore(activeProjectId, finalSceneWithHistory);

            // Incremental Project Save 
            if (currentProject) {
              await saveProject({
                ...currentProject,
                id: activeProjectId,
                title: safeTitle,
                sceneCount: savedCount,
                script, // Persist Script
                characterSheet // Persist Characters
              }, uploadedScenes);
            }
          }

          // Auto-Tagging (Background)
          if (uploadSuccess) {
            autoTagScene(finalScene.prompt, cloudUrl).catch(console.error);
          }


          if (index === 0 && activeProjectId && uploadSuccess) {
            await updateProjectThumbnail(activeProjectId, cloudUrl);
          }

        } catch (err: any) {
          console.error(`Save failed for Scene ${index}`, err);
          uploadedScenes.push(currentScene);
        }
      }

      // Final Polish & Sync
      const finalScenes = uploadedScenes.length > 0 ? uploadedScenes : generatedScenes;
      setScenes(finalScenes);

      // Final Consistency Update
      setScenes(finalScenes);
      setIsAnalyzing(false);
      setProcessingStatus(null);

      // CRITICAL: Force Save Project immediately after ALL are done
      if (activeProjectId && currentProject) {
        await saveProject({
          ...currentProject,
          id: activeProjectId,
          title: safeTitle,
          sceneCount: finalScenes.length,
          script,
          characterSheet
        }, finalScenes);
        setLastSaved(new Date());
      }

    } catch (err: any) {
      handleGenerationError('global', err);
      setIsAnalyzing(false);
    }
  };

  const handleGenerationError = (id: string, err: any) => {
    const errString = err.toString();
    console.error(err);
    if (id === 'global') {
      setError(err.message || "Something went wrong.");
    } else {
      setScenes(prev => prev.map(s =>
        s.id === id ? { ...s, error: "Generation failed. Try retrying.", isLoading: false } : s
      ));
    }
  };

  const handleRegenerate = useCallback(async (sceneId: string, prompt: string, referenceImage?: string) => {
    // 1. Set Loading State
    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s;
      return {
        ...s,
        isLoading: true,
        error: undefined,
        versions: saveToHistory(s)
      };
    }));

    try {
      // PROXY FIX: Ensure we send Base64, not URL
      let validReference = referenceImage;
      if (referenceImage && referenceImage.startsWith('http')) {
        validReference = await urlToBase64(referenceImage);
      }

      // Also check styleReference
      let validStyleRef = styleReference;
      if (styleReference && styleReference.startsWith('http')) {
        validStyleRef = await urlToBase64(styleReference);
      }

      // Resolve consistency data
      const masterStylePrompt = STYLE_DEFINITIONS[artStyle] || artStyle;

      // 2. Generate Image
      const base64Image = await generateSceneImage(
        prompt,
        imageSize,
        aspectRatio,
        artStyle,
        colorMode,
        validReference,
        validStyleRef,
        masterStylePrompt,
        characterSheet
      );

      // 3. Upload Immediately (Universal Persistence)
      const sceneIndex = scenes.findIndex(s => s.id === sceneId);
      const indexNum = sceneIndex >= 0 ? sceneIndex + 1 : scenes.length + 1;

      // strict naming: scene_001_regen_123456789
      const storageName = `scene_${String(indexNum).padStart(3, '0')}_regen_${Date.now()}`;

      let finalUrl = base64Image;
      try {
        finalUrl = await uploadImageToStorage(user || 'guest', projectTitle || 'Untitled', storageName, base64Image);
      } catch (e) {
        console.error("Upload failed during regeneration", e);
        // Fallback to base64 but warn
      }

      // 4. Update State & History
      const scene = scenes.find(s => s.id === sceneId);

      const newAsset: AssetVersion = {
        id: Date.now().toString(),
        type: 'illustration',
        url: finalUrl,
        prompt: prompt,
        createdAt: Date.now()
      };

      const finalScene = {
        ...scene!,
        imageUrl: finalUrl,
        prompt,
        isLoading: false,
        assetHistory: [...(scene?.assetHistory || []), newAsset]
      };

      const updatedScenes = scenes.map(s => s.id === sceneId ? finalScene : s);
      setScenes(updatedScenes);

      // 5. Save to DB
      if (currentProject) {
        await persistSceneUpdate(finalScene, updatedScenes);
      }

    } catch (err: any) {
      handleGenerationError(sceneId, err);
    } finally {
      // Ensure loading is cleared even if unexpected error
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoading: false } : s));
    }
  }, [imageSize, aspectRatio, artStyle, colorMode, styleReference, user, projectTitle, currentProject, scenes, characterSheet]);

  const handleRefine = useCallback(async (sceneId: string, instruction: string) => {
    // 1. Set Loading
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoading: true, error: undefined, versions: saveToHistory(s) } : s));
    const scene = scenes.find(s => s.id === sceneId);

    // GUARD: Check if image exists
    if (!scene?.imageUrl || !scene.imageUrl.startsWith('http')) {
      alert("Please wait for the image to save to the cloud before editing.");
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoading: false } : s));
      return;
    }

    try {
      let sourceImage = scene.imageUrl;
      // Always ensure base64 source
      if (sourceImage.startsWith('http')) {
        sourceImage = await urlToBase64(sourceImage);
      }

      // 2. Generate
      const base64Image = await refineSceneImage(sourceImage, instruction, imageSize, aspectRatio, artStyle, colorMode);

      // 3. Upload Immediately
      const sceneIndex = scenes.findIndex(s => s.id === sceneId);
      const indexNum = sceneIndex >= 0 ? sceneIndex + 1 : scenes.length + 1;

      const storageName = `scene_${String(indexNum).padStart(3, '0')}_edit_${Date.now()}`;

      let finalUrl = base64Image;
      try {
        finalUrl = await uploadImageToStorage(user || 'guest', projectTitle || 'Untitled', storageName, base64Image);
      } catch (e) {
        console.error("Upload failed during refine", e);
      }

      // 4. Update State
      const localScene = { ...scene, imageUrl: finalUrl, isLoading: false };

      // Add to History
      const newAsset: AssetVersion = {
        id: Date.now().toString(),
        type: 'illustration',
        url: finalUrl,
        prompt: instruction, // The refine instruction
        createdAt: Date.now()
      };

      const finalScene = {
        ...localScene,
        assetHistory: [...(scene.assetHistory || []), newAsset]
      };

      const updatedScenes = scenes.map(s => s.id === sceneId ? finalScene : s);
      setScenes(updatedScenes);

      if (currentProject) {
        await persistSceneUpdate(finalScene, updatedScenes);
      }

    } catch (err: any) {
      handleGenerationError(sceneId, err);
    } finally {
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoading: false } : s));
    }
  }, [scenes, imageSize, aspectRatio, artStyle, colorMode, user, projectTitle, currentProject]);

  const handleUpscale = useCallback(async (sceneId: string) => {
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoading: true, error: undefined, versions: saveToHistory(s) } : s));
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene?.imageUrl) {
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoading: false } : s));
      return;
    }

    try {
      let sourceImage = scene.imageUrl;
      if (sourceImage.startsWith('http')) {
        sourceImage = await urlToBase64(sourceImage);
      }

      const base64Image = await upscaleImage(sourceImage, aspectRatio);

      const sceneIndex = scenes.findIndex(s => s.id === sceneId);
      const indexNum = sceneIndex >= 0 ? sceneIndex + 1 : scenes.length + 1;
      const storageName = `scene_${String(indexNum).padStart(3, '0')}_upscale_${Date.now()}`;

      let finalUrl = base64Image;
      try {
        finalUrl = await uploadImageToStorage(user || 'guest', projectTitle || 'Untitled', storageName, base64Image);
      } catch (e) {
        // Log/Warn
      }

      const localScene = { ...scene, imageUrl: finalUrl, isLoading: false };
      const updatedScenes = scenes.map(s => s.id === sceneId ? localScene : s);
      setScenes(updatedScenes);

      if (currentProject) {
        await persistSceneUpdate(localScene, updatedScenes);
      }
    } catch (err: any) {
      handleGenerationError(sceneId, err);
    } finally {
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoading: false } : s));
    }
  }, [scenes, aspectRatio, user, projectTitle, currentProject]);

  const handleGenerateVideo = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene?.imageUrl) return;

    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isVideoLoading: true, error: undefined } : s));

    try {
      const videoUrl = await generateSceneVideo(scene.imageUrl, scene.prompt, aspectRatio);

      let finalVideoUrl = videoUrl;
      const sceneIndex = scenes.findIndex(s => s.id === sceneId);
      const indexNum = sceneIndex >= 0 ? sceneIndex + 1 : scenes.length + 1;
      // Fix: Ensure strict string naming
      const storageName = `scene_${String(indexNum).padStart(3, '0')}_video_${Date.now()}`; // Unique name

      try {
        // Convert URL to Base64/Blob Data for Upload
        const videoData = await urlToBase64(videoUrl); // Re-use helper

        finalVideoUrl = await uploadVideoToStorage(
          user || 'guest',
          projectTitle || 'Untitled',
          storageName,
          videoData
        );
      } catch (uploadErr) {
        console.error("Video upload failed, keeping original URL", uploadErr);
      }

      const newAsset: AssetVersion = {
        id: Date.now().toString(),
        type: 'video',
        url: finalVideoUrl,
        prompt: scene.prompt,
        createdAt: Date.now()
      };

      const updatedScene = {
        ...scene,
        videoUrl: finalVideoUrl,
        isVideoLoading: false,
        assetHistory: [...(scene.assetHistory || []), newAsset]
      };

      const updatedScenes = scenes.map(s => s.id === sceneId ? updatedScene : s);
      setScenes(updatedScenes);

      await persistSceneUpdate(updatedScene, updatedScenes);

    } catch (err: any) {
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, error: err.message || "Video generation failed" } : s));
    } finally {
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isVideoLoading: false } : s));
    }
  };

  const handleGenerateAudio = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isAudioLoading: true } : s));
    try {
      const audioUrl = await generateNarration(scene.prompt);

      let finalAudioUrl = audioUrl;
      const sceneIndex = scenes.findIndex(s => s.id === sceneId);
      const indexNum = sceneIndex >= 0 ? sceneIndex + 1 : scenes.length + 1;

      const storageName = `scene_${String(indexNum).padStart(3, '0')}_audio_${Date.now()}`;

      try {
        const audioData = await urlToBase64(audioUrl);
        finalAudioUrl = await uploadAudioToStorage(
          user || 'guest',
          projectTitle || 'Untitled',
          storageName,
          audioData
        );
      } catch (uploadErr) {
        console.error("Audio upload failed", uploadErr);
      }

      const newAsset: AssetVersion = {
        id: Date.now().toString(),
        type: 'audio',
        url: finalAudioUrl,
        prompt: scene.prompt,
        createdAt: Date.now()
      };

      const updatedScene = {
        ...scene,
        audioUrl: finalAudioUrl,
        isAudioLoading: false,
        assetHistory: [...(scene.assetHistory || []), newAsset]
      };

      const updatedScenes = scenes.map(s => s.id === sceneId ? updatedScene : s);
      setScenes(updatedScenes);

      await persistSceneUpdate(updatedScene, updatedScenes);

    } catch (err: any) {
      console.error("Audio generation error", err);
    } finally {
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isAudioLoading: false } : s));
    }
  };

  const handleRestoreVersion = async (sceneId: string, version: SceneVersion) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const updatedScene = { ...scene, imageUrl: version.imageUrl, prompt: version.prompt };
    setScenes(prev => prev.map(s => s.id !== sceneId ? s : updatedScene));
  };

  const handleUpdateScene = async (id: string, updates: Partial<StoryScene>) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    if (user && currentProject) {
      const scene = scenes.find(s => s.id === id);
      if (scene) {
        const updatedScene = { ...scene, ...updates };
        await persistSceneUpdate(updatedScene);
      }
    }
  };

  const handleSaveTemplate = (scene: StoryScene) => {
    const name = window.prompt("Enter a name for this template:", scene.title || "My Template");
    if (!name) return;
    const newTemplate: SceneTemplate = {
      id: `custom-${Date.now()}`,
      label: name,
      prompt: scene.prompt,
      category: 'Custom',
      icon: 'Star',
      shotType: scene.shotType,
      filter: scene.filter
    };
    setCustomTemplates(prev => [...prev, newTemplate]);
  };

  const handleDeleteTemplate = (id: string) => {
    if (window.confirm("Delete this custom template?")) {
      setCustomTemplates(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleRetryUpload = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene || !scene.imageUrl) return;

    // 1. Set uploading state
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isUploading: true, uploadError: false } : s));

    try {
      // Ensure valid user ID
      const authInstance = getAuthInstance();
      const activeUserId = authInstance.currentUser?.uid;

      if (!activeUserId) throw new Error("CRITICAL: No user ID found for upload");

      const sceneIndex = scenes.findIndex(s => s.id === sceneId);

      // 2. Upload
      const cloudUrl = await uploadImageToStorage(activeUserId, projectTitle, `scene_${sceneIndex + 1}`, scene.imageUrl);

      if (!cloudUrl.startsWith('http')) throw new Error("Retry Upload Failed");

      // 3. Update State & Persist
      const finalScene = { ...scene, imageUrl: cloudUrl, isUploading: false, uploadError: false };
      setScenes(prev => prev.map(s => s.id === sceneId ? finalScene : s));

      if (currentProject) {
        await saveSceneToFirestore(currentProject.id, finalScene);
        await saveProject({ ...currentProject }, scenes.map(s => s.id === sceneId ? finalScene : s));
      }

    } catch (e) {
      console.error("Retry failed", e);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isUploading: false, uploadError: true } : s));
    }
  };

  const handleCheckContinuity = async () => {
    if (scenes.length < 2) return;
    setIsAnalyzing(true);
    setContinuityReport([]);
    try {
      const report = await checkContinuity(scenes.map(s => ({
        title: s.title || '',
        prompt: s.prompt,
        imageUrl: s.imageUrl
      })));
      setContinuityReport(report);
    } catch (e) {
      console.error("Failed continuity check", e);
      setError("Failed to run continuity check.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyContinuityFix = (sceneIndex: number, suggestion: string) => {
    const scene = scenes[sceneIndex];
    if (!scene) return;
    const newPrompt = `${scene.prompt}. FIX: ${suggestion}`;
    handleRegenerate(scene.id, newPrompt, scene.imageUrl);
    setContinuityReport(prev => prev.filter(item => item.sceneIndex !== sceneIndex));
  };

  const filteredScenes = scenes.filter(scene => {
    const searchLower = searchTerm.toLowerCase();
    return (
      scene.title?.toLowerCase().includes(searchLower) ||
      scene.prompt.toLowerCase().includes(searchLower) ||
      (scene.tags && scene.tags.some(tag => tag.toLowerCase().includes(searchLower)))
    );
  });

  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedSceneIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({ index }));
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dataStr = e.dataTransfer.getData("text/plain");

    // Handle Template Drop
    if (dataStr.includes("templateId")) {
      const template = JSON.parse(dataStr) as SceneTemplate & { templateId: string };
      const newScene: StoryScene = {
        id: `scene-template-${Date.now()}`,
        title: template.label || 'New Scene',
        prompt: template.prompt,
        shotType: template.shotType,
        filter: template.filter,
        isLoading: false,
        versions: [],
        projectId: currentProject?.id
      };
      const newScenes = [...scenes];
      newScenes.splice(dropIndex + 1, 0, newScene);
      setScenes(newScenes);
      setTimeout(() => {
        handleRegenerate(newScene.id, newScene.prompt);
      }, 100);
      return;
    }

    // Handle Reordering
    if (draggedSceneIndex !== null) {
      if (draggedSceneIndex === dropIndex) {
        setDraggedSceneIndex(null);
        return;
      }
      const newScenes = [...scenes];
      const [draggedItem] = newScenes.splice(draggedSceneIndex, 1);
      newScenes.splice(dropIndex, 0, draggedItem);
      setScenes(newScenes);
      setDraggedSceneIndex(null);
    }
  };

  const handleTemplateDragStart = (e: React.DragEvent, template: SceneTemplate) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({
      templateId: template.id,
      prompt: template.prompt,
      label: template.label,
      shotType: template.shotType,
      filter: template.filter
    }));
    e.dataTransfer.effectAllowed = "copy";
  };

  const toggleSceneSelection = (id: string) => {
    const newSet = new Set(selectedSceneIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedSceneIds(newSet);
  };

  const selectAll = () => {
    if (selectedSceneIds.size === scenes.length) setSelectedSceneIds(new Set());
    else setSelectedSceneIds(new Set(scenes.map(s => s.id)));
  };

  const exportToPdf = async () => {
    if (scenes.length === 0) return;
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);

      let yPos = 20;
      doc.setFontSize(24);
      doc.text(projectTitle || "Storyboard Shot List", pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        doc.text(`${i + 1}. ${scene.title || 'Untitled Scene'}`, margin, yPos);
        yPos += 10;

        if (scene.imageUrl) {
          try {
            const imgRatio = aspectRatio === AspectRatio.Cinematic ? 9 / 16 : 1;
            const imgHeight = contentWidth * imgRatio;
            doc.addImage(scene.imageUrl, 'PNG', margin, yPos, contentWidth, imgHeight);
            yPos += imgHeight + 10;
          } catch (e) {
            yPos += 10;
          }
        }

        doc.setFontSize(10);
        const splitText = doc.splitTextToSize(scene.prompt, contentWidth);
        doc.text(splitText, margin, yPos);
        yPos += (splitText.length * 5) + 20;
      }
      doc.save(`${projectTitle.replace(/\s+/g, '_')}_storyboard.pdf`);
    } catch (e) {
      console.error("PDF Export failed", e);
      setError("Failed to create PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleVoiceTranscript = (text: string) => {
    const textarea = textAreaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = script.substring(0, start) + (script.length > 0 && start > 0 ? ' ' : '') + text + script.substring(end);
      setScript(newText);
      textarea.focus();
    } else {
      setScript(prev => prev + (prev ? ' ' : '') + text);
    }
  };

  if (authLoading && !script) {
    // Only show loading if we don't have content (e.g. from cache)
    // Actually, let's just show the app skeleton to avoid flicker
    // return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><RefreshCw className="animate-spin text-brand-500" /></div>;
  }

  // --- REMOVED FORCED LOGIN GUARD ---


  return (
    <div className="min-h-screen bg-gray-50 pb-20 relative font-sans">
      <TemplateLibrary
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        onDragStart={handleTemplateDragStart}
        customTemplates={customTemplates}
        onDeleteTemplate={handleDeleteTemplate}
      />

      <ImageLibrary
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        scenes={scenes}
      />

      {showAnimatic && <AnimaticPlayer scenes={scenes} onClose={() => setShowAnimatic(false)} />}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <button className="absolute top-4 right-4 text-white hover:text-gray-300">
            <X size={32} />
          </button>
          <img
            src={lightboxImage}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {compareState && (
        <CompareView
          currentImage={scenes.find(s => s.id === compareState.sceneId)?.imageUrl || ''}
          version={compareState.version}
          onClose={() => setCompareState(null)}
          onRestore={() => {
            handleRestoreVersion(compareState.sceneId, compareState.version);
            setCompareState(null);
          }}
        />
      )}

      {/* --- HEADER --- */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm transition-all duration-300" style={{ marginLeft: isTemplatesOpen ? '16rem' : '0' }}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-shrink-0">
            <button
              onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
              className={`p-2 rounded-xl transition-colors ${isTemplatesOpen ? 'bg-brand-50 text-brand-600' : 'hover:bg-gray-100 text-gray-500'}`}
              title="Toggle Template Library"
            >
              <Layout size={20} />
            </button>
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('editor')}>
              <div className="bg-brand-600 text-white p-2 rounded-lg shadow-md hidden sm:block">
                <Sparkles size={22} />
              </div>
              <h1 className="text-2xl font-bold text-gray-800 tracking-tight hidden md:block">DreamBoard<span className="text-brand-600">Pro</span></h1>
            </div>
            {lastSaved && currentView === 'editor' && (
              <div className="flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-100 animate-fade-in">
                {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                <span className="hidden sm:inline">Saved</span>
              </div>
            )}
          </div>

          {currentView === 'editor' && (
            <div className="flex-1 max-w-lg relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search scenes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-brand-200 transition-all text-sm"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentView(currentView === 'editor' ? 'studio' : 'editor')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${currentView === 'studio' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {currentView === 'editor' ? <LayoutGrid size={18} /> : <Wand2 size={18} />}
              <span className="hidden sm:inline">{currentView === 'editor' ? 'Studio' : 'Editor'}</span>
            </button>

            <div className="flex items-center gap-3">
              {!user ? (
                <button
                  onClick={() => loginWithGoogle().then(setUser).catch(console.error)}
                  className="bg-brand-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-brand-700 transition-colors flex items-center gap-2"
                >
                  <UserIcon size={18} /> Sign In
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex flex-col items-end mr-2">
                    <span className="text-xs font-bold text-gray-700">
                      {user.displayName || 'Creator'}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {user.email}
                    </span>
                  </div>
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-gray-200" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center"><UserIcon size={16} /></div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLogout();
                    }}
                    className="p-2 text-gray-400 hover:text-red-500 transition hover:bg-red-50 rounded-lg"
                    title="Sign Out"
                  >
                    <LogOut size={20} />
                  </button>
                </div>
              )}
            </div>

            {currentView === 'editor' && (
              <button
                onClick={exportToPdf}
                disabled={scenes.length === 0 || isExporting}
                className="hidden sm:flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-800 transition shadow-lg disabled:opacity-50"
              >
                {isExporting ? <RefreshCw size={16} className="animate-spin" /> : <FileDown size={16} />}
                Export
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ... Rest of Main Content ... */}
      <main
        className="max-w-7xl mx-auto px-4 py-8 flex flex-col gap-8 transition-all duration-300"
        style={{ marginLeft: isTemplatesOpen ? '16rem' : 'auto', width: isTemplatesOpen ? 'calc(100% - 16rem)' : '100%' }}
      >

        {currentView === 'studio' && (
          <div className="animate-fade-in space-y-8">
            <div className="flex justify-between items-end border-b border-gray-200 pb-6">
              <div>
                <h2 className="text-3xl font-black text-gray-800">My Studio</h2>
                <p className="text-gray-500 mt-1">Manage your folders and creative projects.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleNewProject}
                  className="bg-gray-100 text-gray-600 px-4 py-3 rounded-xl font-bold shadow-sm hover:bg-red-50 hover:text-red-600 flex items-center gap-2 transition-transform hover:-translate-y-1"
                  title="Clear Local Storage Cache"
                >
                  <Trash2 size={18} /> <span className="hidden sm:inline">Reset Cache</span>
                </button>
                <button
                  onClick={handleNewProject}
                  className="bg-brand-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-brand-700 flex items-center gap-2 transition-transform hover:-translate-y-1"
                >
                  <Plus size={20} /> New Project
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {projects.map(project => (
                <div
                  key={project.id}
                  onClick={() => handleOpenProject(project)}
                  className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-brand-200 transition-all cursor-pointer overflow-hidden flex flex-col h-full"
                >
                  <div className="aspect-video bg-gray-100 relative overflow-hidden group-hover:scale-[1.02] transition-transform">
                    {project.thumbnailUrl ? (
                      <img src={project.thumbnailUrl} alt={project.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
                        <FolderOpen size={48} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-gray-800 truncate text-lg">{project.title}</h3>
                    <div className="flex justify-between items-center mt-2">
                      <p className="text-xs text-gray-500 font-medium">{new Date(project.updatedAt).toLocaleDateString()}</p>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{project.sceneCount || 0} scenes</span>
                    </div>
                  </div>
                </div>
              ))}

              <div
                onClick={handleNewProject}
                className="border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center p-8 cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-all group min-h-[200px]"
              >
                <div className="w-12 h-12 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mb-4 group-hover:bg-brand-200 group-hover:text-brand-600 transition-colors">
                  <Plus size={24} />
                </div>
                <span className="font-bold text-gray-400 group-hover:text-brand-600">Create New Project</span>
              </div>
            </div>
          </div>
        )}

        {currentView === 'editor' && (
          <>
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6 md:p-8 flex flex-col md:flex-row gap-8">
              <div className="flex-1 relative">
                <div className="flex flex-col gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Project Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={projectTitle}
                      onChange={(e) => setProjectTitle(e.target.value)}
                      placeholder="e.g. Space Adventure 2024"
                      className="w-full text-2xl font-black text-gray-800 border-b-2 border-gray-100 focus:border-brand-500 outline-none py-2 bg-transparent transition-colors placeholder:text-gray-300"
                    />
                  </div>

                  <div className="flex justify-between items-end">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <BookOpen size={20} className="text-brand-500" /> Script Source
                      </h2>
                    </div>
                  </div>
                </div>

                <div className="relative group">
                  <textarea
                    ref={textAreaRef}
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="Paste your story script here... (INT. LAB - NIGHT...)"
                    className="w-full bg-gray-50 text-gray-800 border border-gray-200 focus:border-brand-500 focus:ring-4 focus:ring-brand-50/50 rounded-xl resize-none h-64 text-base p-4 pb-14 transition-all"
                    disabled={isAnalyzing || scenes.some(s => s.isLoading)}
                  />
                  <div className="absolute bottom-4 right-4 z-10">
                    <VoiceInput onTranscript={handleVoiceTranscript} disabled={isAnalyzing} />
                  </div>
                </div>

                <div className="flex justify-between items-center mt-6 pt-6 border-t border-gray-100">
                  <div className="text-sm text-gray-400">
                    {script.length > 0 ? `${script.split(/\s+/).length} words` : 'Ready to write'}
                  </div>
                  <button
                    onClick={handleAnalyze}
                    disabled={!script.trim() || !projectTitle.trim() || isAnalyzing || scenes.some(s => s.isLoading)}
                    className="bg-brand-600 text-white hover:bg-brand-700 px-8 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-brand-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 text-lg"
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw size={20} className="animate-spin" />
                        {processingStatus || "Analyzing Script..."}
                      </>
                    ) : (
                      <>
                        <Wand2 size={20} />
                        Generate Storyboard
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="w-full md:w-80 flex flex-col justify-start border-l border-gray-100 md:pl-8">
                <SettingsBar
                  currentSize={imageSize}
                  currentRatio={aspectRatio}
                  currentColorMode={colorMode}
                  currentStyle={artStyle}
                  sceneCount={sceneCount}
                  styleReferenceImage={styleReference}
                  onSizeChange={setImageSize}
                  onRatioChange={setAspectRatio}
                  onColorModeChange={setColorMode}
                  onStyleChange={setArtStyle}
                  onSceneCountChange={setSceneCount}
                  onStyleRefChange={setStyleReference}
                  disabled={isAnalyzing || scenes.some(s => s.isLoading)}
                />
              </div>
            </section>

            {continuityReport.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 relative animate-fade-in shadow-sm">
                <button onClick={() => setContinuityReport([])} className="absolute top-4 right-4 text-amber-400 hover:text-amber-600"><X size={18} /></button>
                <h3 className="font-bold text-amber-800 flex items-center gap-2 mb-4">
                  <FileWarning size={20} /> Continuity Analysis - {continuityReport.length} Issues Found
                </h3>

                <div className="space-y-3">
                  {continuityReport.map((item, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-amber-100 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-amber-700 mb-1">SCENE {item.sceneIndex + 1}: {item.issue}</div>
                        <div className="text-sm text-gray-700">{item.suggestion}</div>
                      </div>
                      <button
                        onClick={() => handleApplyContinuityFix(item.sceneIndex, item.suggestion)}
                        className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-2 rounded-lg hover:bg-amber-200 transition-colors flex items-center gap-1 flex-shrink-0"
                      >
                        <Wand2 size={12} />
                        Auto-Fix Scene
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-center gap-3 animate-fade-in shadow-sm">
                <AlertCircle size={20} />
                <p className="font-medium">{error}</p>
              </div>
            )}

            {scenes.length > 0 && (
              <section className="animate-fade-in pb-20">
                <div className="flex items-center justify-between mb-6 sticky top-20 z-30 bg-gray-50/90 backdrop-blur-sm py-2">
                  <div className="flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-200">
                      <LayoutGrid size={20} className="text-gray-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">Generated Scenes</h3>
                      <p className="text-xs text-gray-500">{filteredScenes.length} items • {aspectRatio}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsLibraryOpen(true)}
                      className="flex items-center gap-1 text-xs font-bold text-gray-600 hover:bg-gray-100 px-3 py-2 rounded-lg border border-gray-200 transition-colors bg-white shadow-sm"
                    >
                      <ImageIcon size={16} /> Assets
                    </button>

                    <button
                      onClick={async () => {
                        // 1. Pre-Flight Audio Check
                        const missingAudio = scenes.filter(s => !s.audioUrl);
                        if (missingAudio.length > 0) {
                          if (!confirm(`Generating narration for ${missingAudio.length} scenes first. Continue?`)) return;
                          setProcessingStatus(`Generating Narration for ${missingAudio.length} scenes...`);

                          // Serial Generation for safety
                          for (const s of missingAudio) {
                            await handleGenerateAudio(s.id);
                          }
                          setProcessingStatus(null);
                        }
                        setShowAnimatic(true);
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-2 rounded-lg shadow-md transition-colors"
                    >
                      <PlayCircle size={16} /> Play Animatic
                    </button>

                    <button
                      onClick={handleCheckContinuity}
                      className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 transition-colors bg-white"
                    >
                      <FileWarning size={16} /> Check Continuity
                    </button>

                    <button
                      onClick={selectAll}
                      className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-brand-600 ml-2 px-2"
                    >
                      {selectedSceneIds.size === scenes.length ? <CheckSquare size={16} /> : <Square size={16} />}
                      {selectedSceneIds.size === scenes.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredScenes.map((scene, index) => (
                    <SceneCard
                      key={scene.id}
                      index={index}
                      scene={scene}
                      aspectRatio={aspectRatio}
                      isSelected={selectedSceneIds.has(scene.id)}
                      onToggleSelect={toggleSceneSelection}
                      onRegenerate={handleRegenerate}
                      onRefine={handleRefine}
                      onUpscale={handleUpscale}
                      onUpdateScene={handleUpdateScene}
                      onRestoreVersion={handleRestoreVersion}
                      onSaveTemplate={handleSaveTemplate}
                      onRetryUpload={handleRetryUpload}
                      onCompareVersion={(v) => setCompareState({ sceneId: scene.id, version: v })}
                      onGenerateVideo={handleGenerateVideo}
                      onGenerateAudio={handleGenerateAudio}
                      onDragStart={onDragStart}
                      onDragOver={onDragOver}
                      onDrop={onDrop}
                      onDrop={onDrop}
                      onExpand={setLightboxImage}
                      onDelete={handleDeleteScene} // Pass delete handler
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {showAnimatic && (
        <AnimaticPlayer
          scenes={filteredScenes}
          onClose={() => setShowAnimatic(false)}
        />
      )}

      <ChatWidget />
    </div>
  );
}

export default App;