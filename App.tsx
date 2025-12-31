import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Sparkles, BookOpen, AlertCircle, RefreshCw, Wand2, Key, Layout, FileDown, Trash2, CheckSquare, Square, FileWarning, Star, X, Image as ImageIcon, PlayCircle, Search } from 'lucide-react';
import { jsPDF } from "jspdf";
import { ChatWidget } from './components/ChatWidget';
import { SettingsBar } from './components/SettingsBar';
import { SceneCard } from './components/SceneCard';
import { TemplateLibrary } from './components/TemplateLibrary';
import { VoiceInput } from './components/VoiceInput';
import { CompareView } from './components/CompareView';
import { ImageLibrary } from './components/ImageLibrary';
import { AnimaticPlayer } from './components/AnimaticPlayer';
import { analyzeScript, generateSceneImage, refineSceneImage, upscaleImage, checkContinuity, generateSceneVideo, generateNarration, autoTagScene } from './services/geminiService';
import { ImageSize, AspectRatio, StoryScene, ColorMode, ArtStyle, ART_STYLES, SceneVersion, SceneTemplate } from './types';

function App() {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [script, setScript] = useState('');
  
  // Settings State
  const [imageSize, setImageSize] = useState<ImageSize>(ImageSize.Size1K);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.Cinematic);
  const [colorMode, setColorMode] = useState<ColorMode>(ColorMode.BlackAndWhite);
  const [artStyle, setArtStyle] = useState<ArtStyle>(ART_STYLES[0]);
  const [sceneCount, setSceneCount] = useState<number>(5);
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
  const [continuityReport, setContinuityReport] = useState<string | null>(null);
  const [showAnimatic, setShowAnimatic] = useState(false);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  // Comparison State
  const [compareState, setCompareState] = useState<{ sceneId: string, version: SceneVersion } | null>(null);
  
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    localStorage.setItem('dreamBoard_templates', JSON.stringify(customTemplates));
  }, [customTemplates]);

  const handleApiKeySelect = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
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
    if (!script.trim()) return;
    
    setIsAnalyzing(true);
    setError(null);
    setContinuityReport(null);
    setScenes([]);
    setSelectedSceneIds(new Set());

    try {
      const prompts = await analyzeScript(script, sceneCount);
      
      const initialScenes: StoryScene[] = prompts.map((prompt, index) => ({
        id: `scene-${Date.now()}-${index}`,
        title: `Scene ${index + 1}`,
        prompt,
        isLoading: true,
        versions: []
      }));
      
      setScenes(initialScenes);
      setIsAnalyzing(false);

      initialScenes.forEach((scene) => {
        generateSceneImage(scene.prompt, imageSize, aspectRatio, artStyle, colorMode, undefined, styleReference)
          .then(async (imageUrl) => {
            // Auto Tag
            const tags = await autoTagScene(scene.prompt, imageUrl);
            
            setScenes(prev => prev.map(s => 
              s.id === scene.id ? { ...s, imageUrl, tags, isLoading: false } : s
            ));
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
    if (errString.includes("Requested entity was not found")) {
       setHasApiKey(false);
       setError("Please select a valid API Key to continue.");
    } else {
      if (id === 'global') {
        setError(err.message || "Something went wrong.");
      } else {
        setScenes(prev => prev.map(s => 
          s.id === id ? { ...s, error: "Oops! Couldn't paint this one.", isLoading: false } : s
        ));
      }
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
      const imageUrl = await generateSceneImage(prompt, imageSize, aspectRatio, artStyle, colorMode, referenceImage, styleReference);
      setScenes(prev => prev.map(s => 
        s.id === sceneId ? { ...s, imageUrl, prompt, isLoading: false } : s
      ));
    } catch (err: any) {
       handleGenerationError(sceneId, err);
    }
  }, [imageSize, aspectRatio, artStyle, colorMode, styleReference]);

  const handleRefine = useCallback(async (sceneId: string, instruction: string) => {
     const scene = scenes.find(s => s.id === sceneId);
     if (!scene?.imageUrl) return;

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
       const imageUrl = await refineSceneImage(scene.imageUrl, instruction, imageSize, aspectRatio, artStyle, colorMode);
       setScenes(prev => prev.map(s => 
         s.id === sceneId ? { ...s, imageUrl, isLoading: false } : s
       ));
     } catch (err: any) {
       handleGenerationError(sceneId, err);
     }
  }, [scenes, imageSize, aspectRatio, artStyle, colorMode]);

  const handleUpscale = useCallback(async (sceneId: string) => {
     const scene = scenes.find(s => s.id === sceneId);
     if (!scene?.imageUrl) return;

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
       const imageUrl = await upscaleImage(scene.imageUrl, aspectRatio);
       setScenes(prev => prev.map(s => 
         s.id === sceneId ? { ...s, imageUrl, isLoading: false } : s
       ));
     } catch (err: any) {
       handleGenerationError(sceneId, err);
     }
  }, [scenes, aspectRatio]);

  const handleGenerateVideo = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene?.imageUrl) return;

    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isVideoLoading: true } : s));
    try {
      const videoUrl = await generateSceneVideo(scene.imageUrl, scene.prompt);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoUrl, isVideoLoading: false } : s));
    } catch (err: any) {
      console.error(err);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isVideoLoading: false, error: "Video generation failed" } : s));
    }
  };

  const handleGenerateAudio = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isAudioLoading: true } : s));
    try {
      const audioUrl = await generateNarration(scene.prompt);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, audioUrl, isAudioLoading: false } : s));
    } catch (err: any) {
      console.error(err);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isAudioLoading: false } : s));
    }
  };

  const handleRestoreVersion = (sceneId: string, version: SceneVersion) => {
    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s;
      const currentAsVersion: SceneVersion | null = s.imageUrl ? {
        id: Date.now().toString(),
        imageUrl: s.imageUrl,
        prompt: s.prompt,
        timestamp: Date.now()
      } : null;
      
      return {
        ...s,
        imageUrl: version.imageUrl,
        prompt: version.prompt,
        versions: currentAsVersion ? [...s.versions, currentAsVersion] : s.versions
      };
    }));
  };

  const handleUpdateScene = (id: string, updates: Partial<StoryScene>) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
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
    alert("Template Saved!");
  };
  
  const handleDeleteTemplate = (id: string) => {
    if (window.confirm("Delete this custom template?")) {
      setCustomTemplates(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleCheckContinuity = async () => {
    if (scenes.length < 2) return;
    setIsAnalyzing(true);
    setContinuityReport(null);
    const report = await checkContinuity(scenes.map(s => ({ 
      title: s.title || '', 
      prompt: s.prompt,
      imageUrl: s.imageUrl 
    })));
    setContinuityReport(report);
    setIsAnalyzing(false);
  };

  // Filter scenes based on search
  const filteredScenes = scenes.filter(scene => {
    const searchLower = searchTerm.toLowerCase();
    return (
      scene.title?.toLowerCase().includes(searchLower) ||
      scene.prompt.toLowerCase().includes(searchLower) ||
      (scene.tags && scene.tags.some(tag => tag.toLowerCase().includes(searchLower)))
    );
  });

  // Drag and Drop Logic
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
      // Insert new scene from template
      const newScene: StoryScene = {
        id: `scene-template-${Date.now()}`,
        title: template.label || 'New Scene',
        prompt: template.prompt,
        shotType: template.shotType,
        filter: template.filter,
        isLoading: false,
        versions: []
      };
      const newScenes = [...scenes];
      newScenes.splice(dropIndex + 1, 0, newScene);
      setScenes(newScenes);
      // Automatically trigger generation for the template
      setTimeout(() => {
         handleRegenerate(newScene.id, newScene.prompt);
      }, 100);
      return;
    }

    // Handle Scene Reorder
    if (draggedSceneIndex !== null && draggedSceneIndex !== dropIndex) {
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
  
  // Selection Logic
  const toggleSceneSelection = (id: string) => {
    const newSet = new Set(selectedSceneIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedSceneIds(newSet);
  };

  const selectAll = () => {
    if (selectedSceneIds.size === scenes.length) {
      setSelectedSceneIds(new Set());
    } else {
      setSelectedSceneIds(new Set(scenes.map(s => s.id)));
    }
  };

  const deleteSelected = () => {
    if (window.confirm(`Delete ${selectedSceneIds.size} scenes?`)) {
      setScenes(prev => prev.filter(s => !selectedSceneIds.has(s.id)));
      setSelectedSceneIds(new Set());
    }
  };

  const regenerateSelected = () => {
     scenes.forEach(s => {
       if (selectedSceneIds.has(s.id)) {
         handleRegenerate(s.id, s.prompt, s.referenceImage);
       }
     });
     setSelectedSceneIds(new Set());
  };

  // PDF Export
  const exportToPdf = async () => {
    if (scenes.length === 0) return;
    setIsExporting(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);
      
      let yPos = 20;

      // Title Page
      doc.setFontSize(24);
      doc.setTextColor(40, 40, 40);
      doc.text("Storyboard Shot List", pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;
      
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text(new Date().toLocaleDateString(), pageWidth / 2, yPos, { align: 'center' });
      yPos += 20;

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text(`${i + 1}. ${scene.title || 'Untitled Scene'}`, margin, yPos);
        
        if (scene.transition) {
          doc.setFontSize(10);
          doc.setTextColor(100, 100, 200);
          doc.text(`[${scene.transition}]`, pageWidth - margin, yPos, { align: 'right' });
        }
        
        yPos += 10;

        if (scene.imageUrl) {
          try {
             const imgRatio = aspectRatio === AspectRatio.Cinematic ? 9/16 : 1;
             const imgHeight = contentWidth * imgRatio;
             
             doc.addImage(scene.imageUrl, 'PNG', margin, yPos, contentWidth, imgHeight);
             yPos += imgHeight + 10;
          } catch (e) {
             doc.text("[Image Error]", margin, yPos);
             yPos += 10;
          }
        } else {
          doc.setFillColor(240, 240, 240);
          doc.rect(margin, yPos, contentWidth, contentWidth * 0.56, 'F');
          doc.text("No Image", pageWidth / 2, yPos + 20, { align: 'center' });
          yPos += 60;
        }

        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        const splitText = doc.splitTextToSize(scene.prompt, contentWidth);
        doc.text(splitText, margin, yPos);
        yPos += (splitText.length * 5) + 20;
      }

      doc.save("storyboard.pdf");
    } catch (e) {
      console.error("PDF Export failed", e);
      setError("Failed to create PDF. Please try again.");
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

  if (!hasApiKey && window.aistudio) {
    return (
      <div className="min-h-screen bg-indigo-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center border border-indigo-100">
          <div className="w-16 h-16 bg-brand-100 text-brand-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles size={32} />
          </div>
          <h1 className="text-2xl font-black text-gray-800 mb-4">Unlock DreamBoard Pro</h1>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Please select a valid API Key from a paid project to access pro features like HD generation and image editing.
          </p>
          <button onClick={handleApiKeySelect} className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
            <Key size={20} /> Select API Key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 relative">
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

      {showAnimatic && (
        <AnimaticPlayer 
          scenes={scenes}
          onClose={() => setShowAnimatic(false)}
        />
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

      {/* Header */}
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
            <div className="flex items-center gap-3">
              <div className="bg-brand-600 text-white p-2 rounded-lg shadow-md hidden sm:block">
                 <Sparkles size={22} />
              </div>
              <h1 className="text-2xl font-bold text-gray-800 tracking-tight hidden md:block">DreamBoard<span className="text-brand-600">Pro</span></h1>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-lg relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
             <input 
               type="text" 
               placeholder="Search scenes or prompts..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-brand-200 transition-all text-sm"
             />
          </div>
          
          <div className="flex items-center gap-3">
             <button
               onClick={() => setIsLibraryOpen(true)}
               className="p-2 rounded-xl hover:bg-gray-100 text-gray-600"
               title="Open Asset Library"
             >
               <ImageIcon size={20} />
             </button>

             {selectedSceneIds.size > 0 && (
               <div className="hidden sm:flex items-center gap-2 mr-4 bg-gray-100 px-3 py-1.5 rounded-lg">
                 <span className="text-xs font-bold text-gray-600">{selectedSceneIds.size} Selected</span>
                 <button onClick={regenerateSelected} className="p-1.5 hover:bg-white hover:text-brand-600 rounded-md transition" title="Regenerate Selected"><RefreshCw size={16} /></button>
                 <button onClick={deleteSelected} className="p-1.5 hover:bg-white hover:text-red-600 rounded-md transition" title="Delete Selected"><Trash2 size={16} /></button>
               </div>
             )}
             
             <button 
               onClick={exportToPdf} 
               disabled={scenes.length === 0 || isExporting}
               className="hidden sm:flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-800 transition shadow-lg disabled:opacity-50"
             >
               {isExporting ? <RefreshCw size={16} className="animate-spin" /> : <FileDown size={16} />}
               Export
             </button>
          </div>
        </div>
      </header>

      <main 
        className="max-w-7xl mx-auto px-4 py-8 flex flex-col gap-8 transition-all duration-300"
        style={{ marginLeft: isTemplatesOpen ? '16rem' : 'auto', width: isTemplatesOpen ? 'calc(100% - 16rem)' : '100%' }}
      >
        
        {/* Input Section */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6 md:p-8 flex flex-col md:flex-row gap-8">
          <div className="flex-1 relative">
             <div className="flex justify-between items-end mb-2">
                <div>
                   <h2 className="text-2xl font-bold text-gray-800">Script</h2>
                   <p className="text-gray-500 text-sm">Paste your script, screenplay, or book excerpt.</p>
                </div>
                <VoiceInput onTranscript={handleVoiceTranscript} disabled={isAnalyzing} />
             </div>
             
             <textarea
                ref={textAreaRef}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="INT. SPACESHIP - DAY..."
                className="w-full bg-gray-50 text-gray-800 border border-gray-200 focus:border-brand-500 focus:ring-0 rounded-xl resize-none h-64 text-base p-4 transition-all"
                disabled={isAnalyzing || scenes.some(s => s.isLoading)}
              />
              
              <div className="flex justify-end mt-4">
                 <button
                  onClick={handleAnalyze}
                  disabled={!script.trim() || isAnalyzing || scenes.some(s => s.isLoading)}
                  className="bg-brand-600 text-white hover:bg-brand-700 px-8 py-3 rounded-xl font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                 >
                   {isAnalyzing ? (
                     <>
                        <RefreshCw size={18} className="animate-spin" />
                        Analyzing...
                     </>
                   ) : (
                     <>
                        <Wand2 size={18} />
                        Generate {sceneCount} Scenes
                     </>
                   )}
                 </button>
              </div>
          </div>
          
          <div className="w-full md:w-80 flex flex-col justify-start">
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

        {/* Continuity Checker Report */}
        {continuityReport && (
           <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 relative animate-fade-in">
             <button onClick={() => setContinuityReport(null)} className="absolute top-4 right-4 text-amber-400 hover:text-amber-600"><X size={18}/></button>
             <h3 className="font-bold text-amber-800 flex items-center gap-2 mb-2">
               <FileWarning size={20} /> Continuity Analysis
             </h3>
             <div className="prose prose-sm text-amber-900 whitespace-pre-line">
               {continuityReport}
             </div>
           </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-center gap-3 animate-fade-in">
            <AlertCircle size={20} />
            <p>{error}</p>
          </div>
        )}

        {/* Results Grid */}
        {scenes.length > 0 && (
          <section className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <BookOpen size={24} className="text-brand-600" />
                <h3 className="text-xl font-bold text-gray-800">Shot List</h3>
                <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-md">
                   {filteredScenes.length} Scenes
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                 <button 
                   onClick={() => setShowAnimatic(true)}
                   className="flex items-center gap-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg shadow-md transition-colors"
                   title="Play Animatic"
                 >
                   <PlayCircle size={16} /> Play Animatic
                 </button>

                 <button 
                   onClick={handleCheckContinuity}
                   className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 transition-colors"
                   title="Check for visual/narrative consistency"
                 >
                   <FileWarning size={16} /> Check Continuity
                 </button>

                 <button 
                  onClick={selectAll}
                  className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-brand-600 ml-2"
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
                />
              ))}
              {filteredScenes.length === 0 && scenes.length > 0 && (
                <div className="col-span-3 text-center py-20 text-gray-400">
                   No scenes match your search.
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <ChatWidget />
    </div>
  );
}

export default App;