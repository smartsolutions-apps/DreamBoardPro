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
import { analyzeScript, generateSceneImage, refineSceneImage, upscaleImage, checkContinuity, generateSceneVideo, generateNarration, autoTagScene, ContinuityIssue } from './services/geminiService';
import { getAuthInstance, getOrCreateProject, uploadImageToStorage, saveSceneToFirestore, updateProjectThumbnail, getUserProjects, getProjectScenes, clearLocalDatabase, urlToBase64, uploadAudioToStorage, saveProject } from './services/firebase';
import { logout } from './services/auth';

// Types
import { ImageSize, AspectRatio, StoryScene, ColorMode, ArtStyle, SceneVersion, SceneTemplate, Project } from './types';

type ViewMode = 'editor' | 'studio';

function App() {
  // --- Auth State ---
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // --- App View State ---
  const [currentView, setCurrentView] = useState<ViewMode>('studio');
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projectTitle, setProjectTitle] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // --- Editor State ---
  const [script, setScript] = useState('');

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
        setAuthLoading(false);
      } else {
        // Fallback: Check for Local Guest User (created if domain auth fails)
        const localGuest = localStorage.getItem('dreamBoard_localGuest');
        if (localGuest) {
          try {
            const guestUser = JSON.parse(localGuest);
            setUser(guestUser);
            loadProjects(guestUser.uid);
          } catch (e) {
            console.error("Failed to parse local guest", e);
            setUser(null);
          }
        } else {
          setUser(null);
        }
        setAuthLoading(false);
      }
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
    try {
      const projectScenes = await getProjectScenes(project.id);
      if (projectScenes.length > 0) {
        setScenes(projectScenes);
      } else {
        setScenes([]);
        setScript('');
      }
      setCurrentView('editor');
    } catch (err) {
      console.error("Error loading project scenes", err);
      setError("Failed to load project.");
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

  const handleResetData = async () => {
    if (window.confirm("This will clear all locally saved data (guest mode projects) and log you out. Continue?")) {
      await clearLocalDatabase();
      window.location.reload();
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
    if (!user) return;
    if (!projectTitle.trim()) {
      alert("Please give your project a title before generating.");
      return;
    }
    if (!script.trim()) return;

    setIsAnalyzing(true);
    setError(null);
    setContinuityReport([]);

    let activeProjectId = currentProject?.id;
    try {
      const project = await getOrCreateProject(user.uid, projectTitle);
      setCurrentProject(project);
      activeProjectId = project.id;
      loadProjects(user.uid);
    } catch (err) {
      console.error("Project creation failed", err);
      setError("Failed to initialize project folders. Check connection.");
      setIsAnalyzing(false);
      return;
    }

    setScenes([]);
    setSelectedSceneIds(new Set());

    try {
      const prompts = await analyzeScript(script, sceneCount);

      const initialScenes: StoryScene[] = prompts.map((prompt, index) => ({
        id: `scene-${Date.now()}-${index}`,
        title: `Scene ${index + 1}`,
        prompt,
        isLoading: true,
        versions: [],
        projectId: activeProjectId
      }));

      setScenes(initialScenes);
      setIsAnalyzing(false);

      // Trigger Generation for each scene
      initialScenes.forEach((scene, index) => {
        generateSceneImage(scene.prompt, imageSize, aspectRatio, artStyle, colorMode, undefined, styleReference)
          .then(async (base64Image) => {
            // 1. Show Image Immediately (Optimistic UI)
            const localScene = { ...scene, imageUrl: base64Image, isLoading: false };
            setScenes(prev => prev.map(s => s.id === scene.id ? localScene : s));

            // 2. Upload in Background
            if (activeProjectId) {
              // Try Upload
              const cloudUrl = await uploadImageToStorage(user.uid, projectTitle, scene.title || `Scene ${index + 1}`, base64Image);

              // Update with Cloud URL (or keep base64 if upload failed and returned fallback)
              const finalScene = { ...localScene, imageUrl: cloudUrl };

              // Generate Tags in Background
              autoTagScene(scene.prompt, cloudUrl).then(tags => {
                const taggedScene = { ...finalScene, tags };
                setScenes(prev => prev.map(s => s.id === scene.id ? taggedScene : s));
                saveSceneToFirestore(activeProjectId, taggedScene);
              });

              // Save to Firestore and Sync Project
              const updatedScenesList = initialScenes.map(s => s.id === scene.id ? finalScene : s);
              // Note: We can't easily access the React state 'scenes' inside this loop accurately for all items if they update concurrently.
              // But 'initialScenes' is the base.
              // Better: Just save the scene, then trigger a project save at the end? 
              // Or just use persistSceneUpdate which we updated.

              await persistSceneUpdate(finalScene); // persistSceneUpdate will try to use 'scenes' state which might be partial

              setLastSaved(new Date());

              if (index === 0) {
                await updateProjectThumbnail(activeProjectId, cloudUrl);
              }
            }
          })
          .catch((err) => {
            handleGenerationError(scene.id, err);
          });
      });

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

      const base64Image = await generateSceneImage(prompt, imageSize, aspectRatio, artStyle, colorMode, validReference, validStyleRef);

      const scene = scenes.find(s => s.id === sceneId);
      const localScene = { ...scene!, imageUrl: base64Image, prompt, isLoading: false };

      // Optimistic Update
      setScenes(prev => prev.map(s => s.id === sceneId ? localScene : s));

      if (user && currentProject) {
        const sceneTitle = localScene.title || `Scene ${Date.now()}`;
        const cloudUrl = await uploadImageToStorage(user.uid, projectTitle, sceneTitle, base64Image);

        const finalScene = { ...localScene, imageUrl: cloudUrl };
        const updatedScenes = prev.map(s => s.id === sceneId ? finalScene : s);
        setScenes(updatedScenes);

        // Pass updated scenes to ensure project metadata is synced
        await persistSceneUpdate(finalScene, updatedScenes);
      }
    } catch (err: any) {
      handleGenerationError(sceneId, err);
    }
  }, [imageSize, aspectRatio, artStyle, colorMode, styleReference, user, projectTitle, currentProject, scenes]);

  const handleRefine = useCallback(async (sceneId: string, instruction: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene?.imageUrl) return;

    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoading: true, error: undefined, versions: saveToHistory(s) } : s));

    try {
      // PROXY FIX
      let sourceImage = scene.imageUrl;
      if (sourceImage.startsWith('http')) {
        sourceImage = await urlToBase64(sourceImage);
      }

      const base64Image = await refineSceneImage(sourceImage, instruction, imageSize, aspectRatio, artStyle, colorMode);

      const localScene = { ...scene, imageUrl: base64Image, isLoading: false };
      setScenes(prev => prev.map(s => s.id === sceneId ? localScene : s));

      if (user && currentProject) {
        const sceneTitle = localScene.title || `Scene ${Date.now()}`;
        const cloudUrl = await uploadImageToStorage(user.uid, projectTitle, sceneTitle, base64Image);
        const finalScene = { ...localScene, imageUrl: cloudUrl };
        setScenes(prev => prev.map(s => s.id === sceneId ? finalScene : s));
        await persistSceneUpdate(finalScene);
      }
    } catch (err: any) {
      handleGenerationError(sceneId, err);
    }
  }, [scenes, imageSize, aspectRatio, artStyle, colorMode, user, projectTitle, currentProject]);

  const handleUpscale = useCallback(async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene?.imageUrl) return;

    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoading: true, error: undefined, versions: saveToHistory(s) } : s));

    try {
      // PROXY FIX
      let sourceImage = scene.imageUrl;
      if (sourceImage.startsWith('http')) {
        sourceImage = await urlToBase64(sourceImage);
      }

      const base64Image = await upscaleImage(sourceImage, aspectRatio);

      const localScene = { ...scene, imageUrl: base64Image, isLoading: false };
      setScenes(prev => prev.map(s => s.id === sceneId ? localScene : s));

      if (user && currentProject) {
        const sceneTitle = localScene.title || `Scene ${Date.now()}`;
        const cloudUrl = await uploadImageToStorage(user.uid, projectTitle, sceneTitle, base64Image);
        const finalScene = { ...localScene, imageUrl: cloudUrl };
        setScenes(prev => prev.map(s => s.id === sceneId ? finalScene : s));
        await persistSceneUpdate(finalScene);
      }
    } catch (err: any) {
      handleGenerationError(sceneId, err);
    }
  }, [scenes, aspectRatio, user, projectTitle, currentProject]);

  const handleGenerateVideo = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene?.imageUrl) return;

    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isVideoLoading: true, error: undefined } : s));

    try {
      const videoUrl = await generateSceneVideo(scene.imageUrl, scene.prompt, aspectRatio);

      const updatedScene = { ...scene, videoUrl, isVideoLoading: false };
      setScenes(prev => prev.map(s => s.id === sceneId ? updatedScene : s));

      persistSceneUpdate(updatedScene).catch(e => console.error("Failed to save video URL", e));

    } catch (err: any) {
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isVideoLoading: false, error: err.message || "Video generation failed" } : s));
    }
  };

  const handleGenerateAudio = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isAudioLoading: true } : s));
    try {
      const audioUrl = await generateNarration(scene.prompt);

      // PERSIST AUDIO TO STORAGE
      let finalAudioUrl = audioUrl;
      if (user && currentProject) {
        // Use sanitized project/scene names for pathing
        const sceneTitle = scene.title || `scene_${sceneId}`;
        finalAudioUrl = await uploadAudioToStorage(user.uid, projectTitle, sceneTitle, audioUrl);
      }

      const updatedScene = { ...scene, audioUrl: finalAudioUrl, isAudioLoading: false };
      setScenes(prev => prev.map(s => s.id === sceneId ? updatedScene : s));

      await persistSceneUpdate(updatedScene);

    } catch (err: any) {
      console.error("Audio generation error", err);
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

  if (authLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><RefreshCw className="animate-spin text-brand-500" /></div>;
  }

  // --- FORCE LOGIN SCREEN IF NO USER ---
  if (!user) {
    return <LoginScreen />;
  }

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

            <div className={`flex items-center gap-3 ${!user || user.isAnonymous ? 'cursor-pointer hover:bg-gray-50 p-1 rounded-lg transition-colors' : ''}`}
              onClick={() => {
                if (!user || user.isAnonymous) {
                  signInUser().then(setUser).catch(console.error);
                }
              }}
            >
              <div className="hidden sm:flex flex-col items-end mr-2">
                <span className="text-xs font-bold text-gray-700">
                  {user && !user.isAnonymous ? (user.displayName || 'Creator') : 'Guest User'}
                </span>
                <span className="text-[10px] text-gray-400">
                  {user && !user.isAnonymous ? user.email : 'Click to Sign In'}
                </span>
              </div>
              {user && !user.isAnonymous && user.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-gray-200" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center"><UserIcon size={16} /></div>
              )}

              {user && !user.isAnonymous && (
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering sign-in
                    handleLogout();
                  }}
                  className="p-2 text-gray-400 hover:text-red-500 transition hover:bg-red-50 rounded-lg"
                  title="Sign Out"
                >
                  <LogOut size={20} />
                </button>
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
                  onClick={handleResetData}
                  className="bg-gray-100 text-gray-600 px-4 py-3 rounded-xl font-bold shadow-sm hover:bg-red-50 hover:text-red-600 flex items-center gap-2 transition-transform hover:-translate-y-1"
                  title="Clear Local Storage Cache"
                >
                  <Trash2 size={18} /> <span className="hidden sm:inline">Reset Cache</span>
                </button>
                <button
                  onClick={() => {
                    setCurrentProject(null);
                    setProjectTitle('');
                    setScenes([]);
                    setScript('');
                    setCurrentView('editor');
                  }}
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
                onClick={() => {
                  setCurrentProject(null);
                  setProjectTitle('');
                  setScenes([]);
                  setScript('');
                  setCurrentView('editor');
                }}
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
                        Analyzing Script...
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
                      onClick={() => setShowAnimatic(true)}
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
                      onCompareVersion={(v) => setCompareState({ sceneId: scene.id, version: v })}
                      onGenerateVideo={handleGenerateVideo}
                      onGenerateAudio={handleGenerateAudio}
                      onDragStart={onDragStart}
                      onDragOver={onDragOver}
                      onDrop={onDrop}
                      onExpand={setLightboxImage}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <ChatWidget />
    </div>
  );
}

export default App;