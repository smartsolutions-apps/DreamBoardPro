import React, { useState, useRef } from 'react';
import { RefreshCw, Download, Edit2, Check, X, GripVertical, AlertCircle, Image as ImageIcon, Sparkles, Upload, Copy, Clock, RotateCcw, Zap, Sliders, Palette, Link as LinkIcon, Pencil, Save, Play, SplitSquareHorizontal, Type, Video, Music, Tag as TagIcon, Volume2 } from 'lucide-react';
import { StoryScene, ShotType, AspectRatio, SceneVersion, SceneFilter, SceneTransition, TextStyle } from '../types';
import { SketchPad } from './SketchPad';

interface SceneCardProps {
  scene: StoryScene;
  index: number;
  aspectRatio: AspectRatio;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onRegenerate: (id: string, newPrompt: string, referenceImage?: string) => void;
  onRefine: (id: string, instruction: string) => void;
  onUpscale: (id: string) => void;
  onUpdateScene: (id: string, updates: Partial<StoryScene>) => void;
  onRestoreVersion: (id: string, version: SceneVersion) => void;
  onSaveTemplate: (scene: StoryScene) => void;
  onCompareVersion: (version: SceneVersion) => void;
  onGenerateVideo: (id: string) => void;
  onGenerateAudio: (id: string) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
}

const FILTERS: { id: SceneFilter; label: string; class: string }[] = [
  { id: 'none', label: 'Normal', class: '' },
  { id: 'sepia', label: 'Sepia', class: 'sepia' },
  { id: 'grayscale', label: 'B&W', class: 'grayscale' },
  { id: 'contrast', label: 'Contrast', class: 'contrast-125' },
  { id: 'vivid', label: 'Vivid', class: 'saturate-150' },
  { id: 'noir', label: 'Noir', class: 'grayscale contrast-150 brightness-90' },
  { id: 'warm', label: 'Warm', class: 'sepia-[.30] saturate-125' },
  { id: 'cool', label: 'Cool', class: 'hue-rotate-15 saturate-80' },
];

const TEXT_STYLES: { id: TextStyle; label: string; class: string }[] = [
  { id: 'Standard', label: 'Standard', class: 'text-gray-800' },
  { id: 'Outline', label: 'Outline', class: 'text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)] font-black tracking-wide' },
  { id: 'Shadow', label: 'Shadow', class: 'text-gray-900 drop-shadow-lg font-bold' },
  { id: 'Neon', label: 'Neon', class: 'text-white drop-shadow-[0_0_10px_rgba(236,72,153,0.8)] font-bold' },
  { id: 'Retro', label: 'Retro', class: 'text-yellow-400 drop-shadow-[2px_2px_0_rgba(180,83,9,1)] font-black uppercase' },
  { id: 'Cinema', label: 'Cinema', class: 'text-white bg-black/50 px-2 font-serif tracking-widest' },
];

const TRANSITIONS: SceneTransition[] = ['Cut', 'Fade In', 'Fade Out', 'Dissolve', 'Wipe Left', 'Wipe Right', 'Zoom In'];

export const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  index,
  aspectRatio,
  isSelected,
  onToggleSelect,
  onRegenerate,
  onRefine,
  onUpscale,
  onUpdateScene,
  onRestoreVersion,
  onSaveTemplate,
  onCompareVersion,
  onGenerateVideo,
  onGenerateAudio,
  onDragStart,
  onDragOver,
  onDrop
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showTextStyles, setShowTextStyles] = useState(false);
  const [showSketchPad, setShowSketchPad] = useState(false);
  const [isPreviewingTransition, setIsPreviewingTransition] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [editPrompt, setEditPrompt] = useState(scene.prompt);
  const [selectedShot, setSelectedShot] = useState<ShotType>(scene.shotType || ShotType.None);
  const [refImagePreview, setRefImagePreview] = useState<string | undefined>(scene.referenceImage);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [mode, setMode] = useState<'edit' | 'refine'>('edit');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [hoveredVersion, setHoveredVersion] = useState<string | null>(null);
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(scene.title || `Scene ${index + 1}`);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAspectRatioClass = (ratio: AspectRatio) => {
    switch (ratio) {
      case AspectRatio.Cinematic: return 'aspect-video';
      case AspectRatio.Portrait: return 'aspect-[9/16]';
      case AspectRatio.Standard: return 'aspect-[4/3]';
      case AspectRatio.Wide: return 'aspect-[2/1]';
      default: return 'aspect-square';
    }
  };

  const handleSaveEdit = () => {
    let finalPrompt = editPrompt;
    if (selectedShot !== ShotType.None && !editPrompt.toLowerCase().includes(selectedShot.toLowerCase())) {
        finalPrompt = `${selectedShot} of ${editPrompt}`;
    }

    onUpdateScene(scene.id, { 
      prompt: editPrompt, 
      shotType: selectedShot, 
      referenceImage: refImagePreview 
    });

    onRegenerate(scene.id, finalPrompt, refImagePreview);
    setIsEditing(false);
  };

  const handleTitleSave = () => {
    onUpdateScene(scene.id, { title: titleInput });
    setIsEditingTitle(false);
  };

  const handleRefine = () => {
    if (!refineInstruction.trim()) return;
    onRefine(scene.id, refineInstruction);
    setRefineInstruction('');
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditPrompt(scene.prompt);
    setRefImagePreview(scene.referenceImage);
    setSelectedShot(scene.shotType || ShotType.None);
    setIsEditing(false);
    setMode('edit');
    setShowSketchPad(false);
  };

  const downloadImage = async (format: 'png' | 'jpeg' | 'webp') => {
    if (!scene.imageUrl) return;
    setShowDownloadMenu(false);

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = scene.imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const filterClass = FILTERS.find(f => f.id === scene.filter)?.class || '';
      if (filterClass) {
         ctx.filter = getComputedStyle(document.documentElement).getPropertyValue(`--tw-${filterClass}`) || filterClass; 
      }

      if (format === 'jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(img, 0, 0);

      const mimeType = `image/${format}`;
      const dataUrl = canvas.toDataURL(mimeType, 0.9);

      const safeTitle = (scene.title || `Scene-${index + 1}`).replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
      const filename = `${safeTitle}.${format}`;

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Download failed", e);
      alert("Failed to process image for download.");
    }
  };

  const handleCopyPrompt = () => {
     navigator.clipboard.writeText(scene.prompt);
     setCopyFeedback(true);
     setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setRefImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handlePreviewTransition = () => {
    setIsPreviewingTransition(true);
    setTimeout(() => setIsPreviewingTransition(false), 2000);
  };

  const toggleAudio = () => {
    if (audioRef.current) {
       if (isPlayingAudio) {
         audioRef.current.pause();
         setIsPlayingAudio(false);
       } else {
         audioRef.current.play();
         setIsPlayingAudio(true);
       }
    } else if (scene.audioUrl) {
       const audio = new Audio(scene.audioUrl);
       audio.onended = () => setIsPlayingAudio(false);
       audio.play();
       audioRef.current = audio;
       setIsPlayingAudio(true);
    } else {
       onGenerateAudio(scene.id);
    }
  };

  return (
    <div 
      draggable={!isEditing}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      className={`
        bg-white rounded-3xl overflow-visible shadow-sm hover:shadow-xl transition-all duration-300 border flex flex-col group relative
        ${isEditing ? 'ring-2 ring-brand-300 z-10 scale-[1.02] border-brand-200' : 'border-gray-100'}
        ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500' : ''}
      `}
    >
      {/* Checkbox */}
      {!isEditing && (
        <div className="absolute top-3 left-3 z-20">
           <input 
             type="checkbox"
             checked={isSelected}
             onChange={() => onToggleSelect(scene.id)}
             className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer shadow-sm"
           />
        </div>
      )}

      {/* Drag Handle */}
      {!isEditing && (
        <div className="absolute top-3 left-10 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-move bg-white/80 p-1.5 rounded-lg text-gray-500 hover:text-gray-800 backdrop-blur-sm shadow-sm">
          <GripVertical size={16} />
        </div>
      )}

      {/* Image Area */}
      <div className={`relative overflow-hidden rounded-t-3xl bg-gray-50 ${getAspectRatioClass(aspectRatio)}`}>
        {scene.isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-brand-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
            </div>
            <span className="text-sm font-bold text-brand-500 animate-pulse">Rendering Scene {index + 1}...</span>
          </div>
        ) : scene.error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 p-6 text-center bg-red-50/50">
            <AlertCircle size={32} className="mb-2 text-red-400" />
            <span className="text-sm text-red-500 font-medium">{scene.error}</span>
            <button 
              onClick={() => onRegenerate(scene.id, scene.prompt)}
              className="mt-4 px-5 py-2 bg-white border border-red-200 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition-colors shadow-sm"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Main Image or Video or Comparison Image */}
            {scene.videoUrl ? (
                <video src={scene.videoUrl} autoPlay loop muted className="w-full h-full object-cover" />
            ) : (scene.imageUrl || hoveredVersion) ? (
              <img 
                src={hoveredVersion || scene.imageUrl} 
                alt={scene.prompt} 
                className={`
                  w-full h-full object-cover transition-all duration-700 
                  ${!hoveredVersion && 'group-hover:scale-105'}
                  ${!hoveredVersion && FILTERS.find(f => f.id === scene.filter)?.class}
                  ${isPreviewingTransition ? 'opacity-50 scale-110' : ''} 
                `}
              />
            ) : (
               <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-100">
                  <ImageIcon size={48} />
               </div>
            )}
            
            {/* Loading Overlay for Video/Audio */}
            {(scene.isVideoLoading || scene.isAudioLoading) && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="bg-white/90 px-4 py-2 rounded-full flex items-center gap-2 text-xs font-bold shadow-lg animate-pulse">
                     {scene.isVideoLoading ? <Video size={14} className="text-brand-500"/> : <Music size={14} className="text-brand-500"/>}
                     Generating...
                  </div>
              </div>
            )}

            {/* Filter/Style Pills */}
            <div className="absolute top-3 right-3 flex flex-col gap-1 items-end pointer-events-none">
              {scene.filter && scene.filter !== 'none' && !scene.isLoading && (
                 <div className="bg-black/50 backdrop-blur-md text-white px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider">
                   {FILTERS.find(f => f.id === scene.filter)?.label}
                 </div>
              )}
              {scene.textStyle && scene.textStyle !== 'Standard' && (
                 <div className="bg-indigo-900/50 backdrop-blur-md text-white px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider">
                   {scene.textStyle} Text
                 </div>
              )}
            </div>

            {/* Comparison Label */}
            {hoveredVersion && (
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white px-4 py-2 rounded-full font-bold text-sm backdrop-blur-md pointer-events-none">
                  Viewing Old Version
               </div>
            )}
            
            {/* Overlay Actions */}
            {!isEditing && !hoveredVersion && (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
                 {/* Generate Video (Veo) */}
                 <button 
                  onClick={() => onGenerateVideo(scene.id)}
                  title={scene.videoUrl ? "Regenerate Video" : "Animate Scene (Veo)"}
                  className="bg-white/90 p-2 rounded-xl text-pink-500 shadow-sm hover:text-pink-600 hover:bg-white transition-colors"
                >
                   <Video size={18} />
                 </button>

                 {/* Generate Audio (TTS) */}
                 <button 
                  onClick={toggleAudio}
                  title={scene.audioUrl ? (isPlayingAudio ? "Pause Narration" : "Play Narration") : "Generate Narration"}
                  className={`bg-white/90 p-2 rounded-xl shadow-sm hover:bg-white transition-colors ${isPlayingAudio ? 'text-green-500 animate-pulse' : 'text-cyan-500 hover:text-cyan-600'}`}
                >
                   {scene.audioUrl && isPlayingAudio ? <Volume2 size={18} /> : <Music size={18} />}
                </button>

                 {/* Upscale */}
                 <button 
                  onClick={() => onUpscale(scene.id)}
                  title="Upscale / Enhance"
                  className="bg-white/90 p-2 rounded-xl text-amber-500 shadow-sm hover:text-amber-600 hover:bg-white transition-colors"
                >
                   <Zap size={18} />
                 </button>
                 
                 {/* Filters */}
                 <div className="relative">
                   <button 
                    onClick={() => setShowFilters(!showFilters)}
                    title="Apply Filters"
                    className="bg-white/90 p-2 rounded-xl text-purple-500 shadow-sm hover:text-purple-600 hover:bg-white transition-colors"
                  >
                     <Sliders size={18} />
                   </button>
                   {showFilters && (
                     <div className="absolute top-0 right-full mr-2 w-32 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-30 flex flex-col overflow-hidden animate-fade-in-right">
                       {FILTERS.map(filter => (
                         <button 
                           key={filter.id}
                           onClick={() => {
                             onUpdateScene(scene.id, { filter: filter.id });
                             setShowFilters(false);
                           }} 
                           className={`px-3 py-2 text-left text-xs font-semibold hover:bg-gray-50 transition-colors flex justify-between items-center ${scene.filter === filter.id ? 'text-brand-600 bg-brand-50' : 'text-gray-600'}`}
                         >
                           {filter.label}
                           {scene.filter === filter.id && <Check size={12} />}
                         </button>
                       ))}
                     </div>
                   )}
                 </div>
                 
                 {/* Text Styles */}
                 <div className="relative">
                   <button 
                    onClick={() => setShowTextStyles(!showTextStyles)}
                    title="Text Effects"
                    className="bg-white/90 p-2 rounded-xl text-blue-500 shadow-sm hover:text-blue-600 hover:bg-white transition-colors"
                  >
                     <Type size={18} />
                   </button>
                   {showTextStyles && (
                     <div className="absolute top-0 right-full mr-2 w-32 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-30 flex flex-col overflow-hidden animate-fade-in-right">
                       {TEXT_STYLES.map(style => (
                         <button 
                           key={style.id}
                           onClick={() => {
                             onUpdateScene(scene.id, { textStyle: style.id });
                             setShowTextStyles(false);
                           }} 
                           className={`px-3 py-2 text-left text-xs font-semibold hover:bg-gray-50 transition-colors flex justify-between items-center ${scene.textStyle === style.id ? 'text-brand-600 bg-brand-50' : 'text-gray-600'}`}
                         >
                           {style.label}
                           {scene.textStyle === style.id && <Check size={12} />}
                         </button>
                       ))}
                     </div>
                   )}
                 </div>

                 {/* Save Template */}
                 <button 
                  onClick={() => onSaveTemplate(scene)}
                  title="Save as Template"
                  className="bg-white/90 p-2 rounded-xl text-amber-600 shadow-sm hover:text-amber-700 hover:bg-white transition-colors"
                >
                   <Save size={18} />
                 </button>

                 <button 
                  onClick={handleCopyPrompt}
                  title="Copy Prompt"
                  className="bg-white/90 p-2 rounded-xl text-gray-700 shadow-sm hover:text-indigo-600 hover:bg-white transition-colors relative"
                >
                   {copyFeedback ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                 </button>
                
                <button 
                  onClick={() => setIsEditing(true)}
                  title="Edit Scene"
                  className="bg-white/90 p-2 rounded-xl text-gray-700 shadow-sm hover:text-brand-600 hover:bg-white transition-colors"
                >
                  <Edit2 size={18} />
                </button>
                 
                 {/* Download Button with Dropdown */}
                 <div className="relative">
                   <button 
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                    title="Download Image"
                    className="bg-white/90 p-2 rounded-xl text-gray-700 shadow-sm hover:text-indigo-600 hover:bg-white transition-colors"
                  >
                     <Download size={18} />
                   </button>
                   {showDownloadMenu && (
                     <div className="absolute top-full right-0 mt-1 w-32 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-30 flex flex-col overflow-hidden animate-fade-in-up">
                       <button onClick={() => downloadImage('png')} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-brand-600 transition-colors">PNG (Default)</button>
                       <button onClick={() => downloadImage('jpeg')} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-brand-600 transition-colors">JPEG (Small)</button>
                       <button onClick={() => downloadImage('webp')} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-brand-600 transition-colors">WebP (Web)</button>
                     </div>
                   )}
                 </div>
              </div>
            )}

            {/* Version History Toggle */}
             {!isEditing && scene.versions && scene.versions.length > 0 && (
              <div className="absolute bottom-2 right-2 z-20">
                 <button 
                   onClick={() => setShowHistory(!showHistory)}
                   className="bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-lg backdrop-blur-sm transition-all"
                   title="Version History"
                 >
                   <Clock size={16} />
                 </button>
                 
                 {/* History Dropdown */}
                 {showHistory && (
                   <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in-up">
                     <div className="p-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase">
                       History (Hover to preview)
                     </div>
                     <div className="max-h-40 overflow-y-auto">
                        {scene.versions.slice().reverse().map((v, i) => (
                          <div 
                            key={v.id}
                            className="p-2 hover:bg-indigo-50 cursor-pointer flex items-center justify-between group/item"
                            onMouseEnter={() => setHoveredVersion(v.imageUrl)}
                            onMouseLeave={() => setHoveredVersion(null)}
                          >
                             <div className="flex flex-col">
                               <span className="text-xs font-medium text-gray-700">Ver {scene.versions.length - i}</span>
                               <span className="text-[10px] text-gray-400">{new Date(v.timestamp).toLocaleTimeString()}</span>
                             </div>
                             <div className="flex gap-1">
                               <button 
                                 onClick={() => {
                                    onCompareVersion(v);
                                    setShowHistory(false);
                                 }}
                                 className="opacity-0 group-hover/item:opacity-100 text-purple-600 hover:bg-purple-100 p-1 rounded"
                                 title="Compare side-by-side"
                               >
                                  <SplitSquareHorizontal size={14} />
                               </button>
                               <button 
                                 onClick={() => {
                                   onRestoreVersion(scene.id, v);
                                   setShowHistory(false);
                                 }}
                                 className="opacity-0 group-hover/item:opacity-100 text-brand-600 hover:bg-brand-50 p-1 rounded"
                                 title="Restore this version"
                               >
                                  <RotateCcw size={14} />
                               </button>
                             </div>
                          </div>
                        ))}
                     </div>
                   </div>
                 )}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Edit Panel */}
      {isEditing && (
         <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col gap-4">
             {/* ... (Existing Edit Panel Logic) ... */}
             <div className="flex bg-gray-200 p-1 rounded-lg">
                <button 
                  onClick={() => setMode('edit')}
                  className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all ${mode === 'edit' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
                >
                  Compose
                </button>
                <button 
                  onClick={() => setMode('refine')}
                  disabled={!scene.imageUrl}
                  className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all flex items-center justify-center gap-1 ${mode === 'refine' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 disabled:opacity-50'}`}
                >
                   <Sparkles size={12} />
                   Magic Edit
                </button>
             </div>

             {mode === 'edit' ? (
               showSketchPad ? (
                 <div className="h-64">
                   <SketchPad 
                    initialImage={refImagePreview}
                    onSave={(img) => {
                      setRefImagePreview(img);
                      setShowSketchPad(false);
                    }}
                    onCancel={() => setShowSketchPad(false)}
                   />
                 </div>
               ) : (
                 <>
                   <div className="flex gap-2">
                     <select 
                       value={selectedShot} 
                       onChange={(e) => setSelectedShot(e.target.value as ShotType)}
                       className="bg-white border border-gray-200 text-xs rounded-lg px-2 py-2 outline-none focus:border-brand-300 w-1/2"
                     >
                       {Object.values(ShotType).map(t => <option key={t} value={t}>{t}</option>)}
                     </select>
                     
                     <div className="flex w-1/2 gap-1">
                        <button 
                          onClick={() => setShowSketchPad(true)}
                          className={`flex-1 border border-dashed rounded-lg flex items-center justify-center gap-1 text-xs font-medium transition-colors ${refImagePreview ? 'border-brand-300 bg-brand-50 text-brand-600' : 'border-gray-300 text-gray-500 hover:bg-white'}`}
                        >
                          <Pencil size={14} />
                          {refImagePreview ? 'Edit Sketch' : 'Draw'}
                        </button>
                        
                        <div className="relative flex-1">
                          <input 
                            type="file" 
                            ref={fileInputRef}
                            onChange={handleImageUpload}
                            accept="image/*"
                            className="hidden"
                          />
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full h-full border border-dashed rounded-lg flex items-center justify-center gap-1 text-xs font-medium text-gray-500 hover:bg-white border-gray-300"
                          >
                             <Upload size={14} /> Upload
                          </button>
                        </div>
                     </div>
                   </div>

                   {refImagePreview && !showSketchPad && (
                      <div className="relative h-16 w-full bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                         <img src={refImagePreview} alt="Ref" className="w-full h-full object-contain opacity-50" />
                         <div className="absolute inset-0 flex items-center justify-center gap-2">
                            <span className="text-xs font-bold text-gray-500 bg-white/80 px-2 py-1 rounded">Ref Image Active</span>
                            <button onClick={() => setRefImagePreview(undefined)} className="bg-red-500 text-white p-1 rounded-full"><X size={12} /></button>
                         </div>
                      </div>
                   )}
                   
                   <textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    className="w-full text-sm p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-100 focus:border-brand-400 outline-none resize-none bg-white text-gray-700"
                    rows={3}
                    placeholder="Describe the scene..."
                  />
                 </>
               )
             ) : (
                <div className="flex flex-col gap-2">
                   <p className="text-xs text-gray-500">Describe changes to the current image (e.g., "Change the time to sunset" or "Make the character smile")</p>
                   <textarea
                    value={refineInstruction}
                    onChange={(e) => setRefineInstruction(e.target.value)}
                    className="w-full text-sm p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-100 focus:border-brand-400 outline-none resize-none bg-white text-gray-700"
                    rows={3}
                    placeholder="What should change?"
                  />
                </div>
             )}

             {!showSketchPad && (
               <div className="flex gap-2 justify-end">
                  <button onClick={handleCancel} className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg"><X size={18} /></button>
                  {mode === 'edit' ? (
                     <button onClick={handleSaveEdit} className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-bold shadow-md hover:bg-brand-700">Generate New</button>
                  ) : (
                     <button onClick={handleRefine} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-bold shadow-md hover:bg-indigo-700">Refine Image</button>
                  )}
               </div>
             )}
         </div>
      )}
      
      {/* Footer Info & Transitions */}
      {!isEditing && (
        <div className="p-4 flex-1 flex flex-col bg-white rounded-b-3xl gap-2">
           <div className="flex items-center justify-between">
             {isEditingTitle ? (
               <input 
                 value={titleInput}
                 onChange={(e) => setTitleInput(e.target.value)}
                 onBlur={handleTitleSave}
                 onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
                 autoFocus
                 className={`text-xs uppercase tracking-wider bg-transparent border-b border-brand-300 outline-none w-full ${TEXT_STYLES.find(t => t.id === scene.textStyle)?.class || 'font-bold text-gray-800'}`}
               />
             ) : (
                <span 
                  onClick={() => setIsEditingTitle(true)}
                  className={`text-xs uppercase tracking-wider cursor-pointer hover:text-brand-500 flex items-center gap-1 group/title transition-colors ${TEXT_STYLES.find(t => t.id === scene.textStyle)?.class || 'font-extrabold text-gray-400'}`}
                >
                  {scene.title || `Scene ${index + 1}`}
                  <Edit2 size={10} className="opacity-0 group-hover/title:opacity-100 transition-opacity text-gray-400" />
                </span>
             )}

            {scene.shotType && scene.shotType !== ShotType.None && (
               <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold border border-gray-200">
                  {scene.shotType}
               </span>
            )}
          </div>
          
          <p 
            className="text-gray-700 text-sm leading-relaxed line-clamp-3 hover:line-clamp-none transition-all cursor-pointer"
            onClick={() => setIsEditing(true)}
          >
            {scene.prompt}
          </p>
          
          {/* Tags */}
          {scene.tags && scene.tags.length > 0 && (
             <div className="flex flex-wrap gap-1 mt-1">
               {scene.tags.map(tag => (
                 <span key={tag} className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded border border-blue-100">
                   #{tag}
                 </span>
               ))}
             </div>
          )}

          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
             <LinkIcon size={12} className="text-gray-400" />
             <div className="flex items-center gap-1 flex-1">
               <select 
                 value={scene.transition || 'Cut'}
                 onChange={(e) => onUpdateScene(scene.id, { transition: e.target.value as SceneTransition })}
                 className="text-[10px] bg-transparent text-gray-500 font-semibold uppercase tracking-wider outline-none cursor-pointer hover:text-brand-600 w-full"
               >
                 {TRANSITIONS.map(t => <option key={t} value={t}>{t}</option>)}
               </select>
               {scene.transition && scene.transition !== 'Cut' && (
                 <button onClick={handlePreviewTransition} title="Preview Transition" className="text-gray-400 hover:text-brand-500">
                   <Play size={12} />
                 </button>
               )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};