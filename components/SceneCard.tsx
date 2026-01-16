import React, { useState, useRef } from 'react';
import { RefreshCw, Download, Edit2, Check, X, GripVertical, AlertCircle, Image as ImageIcon, Sparkles, Upload, Copy, Clock, RotateCcw, Zap, Sliders, Palette, Link as LinkIcon, Pencil, Save, Play, SplitSquareHorizontal, Type, Video, Music, Tag as TagIcon, Volume2, Maximize2, MoreHorizontal, Trash2 } from 'lucide-react';
import { StoryScene, ShotType, AspectRatio, SceneVersion, SceneFilter, SceneTransition, TextStyle } from '../types';
import { SketchPad } from './SketchPad';

interface SceneCardProps {
  scene: StoryScene;
  index: number;
  aspectRatio: AspectRatio;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onRegenerate: (id: string, newPrompt: string, referenceImage?: string) => void;
  onRefine: (id: string, instruction: string, strength: number) => void;
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
  onExpand: (imageUrl: string) => void;
  onRetryUpload?: (id: string) => void;
  onDelete: (id: string) => void; // New Prop
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
  onDrop,
  onExpand,
  onRetryUpload
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false); // NEW STATE
  const [showHistory, setShowHistory] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showTextStyles, setShowTextStyles] = useState(false);
  const [showSketchPad, setShowSketchPad] = useState(false);
  const [isPreviewingTransition, setIsPreviewingTransition] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // TRIGGER LOADING WHEN URL CHANGES
  React.useEffect(() => {
    if (scene.imageUrl && !scene.videoUrl) {
      setIsImageLoading(true);
    }
  }, [scene.imageUrl, scene.videoUrl]);

  const [editPrompt, setEditPrompt] = useState(scene.prompt);
  const [selectedShot, setSelectedShot] = useState<ShotType>(scene.shotType || ShotType.None);
  const [refImagePreview, setRefImagePreview] = useState<string | undefined>(scene.referenceImage);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [mode, setMode] = useState<'edit' | 'refine'>('edit');
  const [editStrength, setEditStrength] = useState(50);

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
    onRefine(scene.id, refineInstruction, editStrength);
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

  const handleCopyImage = async () => {
    if (!scene.imageUrl) return;
    try {
      // Try Text/URL Copy First (for browsers)
      await navigator.clipboard.writeText(scene.imageUrl);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      console.error("Text copy failed, trying blob", err);
      // Fallback to Blob Copy (for image editors)
      try {
        const response = await fetch(scene.imageUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ]);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      } catch (blobErr) {
        console.error("Blob copy failed", blobErr);
        alert("Could not copy to clipboard.");
      }
    }
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
        bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border flex flex-col group relative
        ${isEditing ? 'ring-2 ring-brand-300 z-10 scale-[1.02] border-brand-200' : 'border-gray-100'}
        ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500' : ''}
      `}
    >
      {/* Checkbox - Elevated z-index */}
      {!isEditing && (
        <div className="absolute top-3 left-3 z-30">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(scene.id)}
            className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer shadow-sm"
          />
        </div>
      )}

      {/* Drag Handle - Elevated z-index */}
      {!isEditing && (
        <div className="absolute top-3 left-10 z-30 opacity-0 group-hover:opacity-100 transition-opacity cursor-move bg-white/80 p-1.5 rounded-lg text-gray-500 hover:text-gray-800 backdrop-blur-sm shadow-sm">
          <GripVertical size={16} />
        </div>
      )}

      {/* Image Area */}
      <div
        className={`relative bg-gray-50 ${getAspectRatioClass(aspectRatio)} cursor-pointer group/image`}
        onClick={() => {
          if (!isEditing && scene.imageUrl && !scene.videoUrl) {
            onExpand(hoveredVersion || scene.imageUrl);
          }
        }}
      >
        {/* COMBINED LOADING STATE: Scene Loading OR Image Loading */}
        {(scene.isLoading || isImageLoading) && !scene.videoUrl ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-gray-400 bg-gray-50/90 backdrop-blur-sm animate-fade-in">
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-brand-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
            </div>
            <span className="text-xs font-bold text-brand-500 animate-pulse tracking-wide">
              {scene.isLoading ? "Generating..." : "Rendering New Style..."}
            </span>
          </div>
        ) : null}

        {scene.error && !scene.imageUrl ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-gray-400 p-6 text-center bg-red-50/50">
            <AlertCircle size={32} className="mb-2 text-red-400" />
            <span className="text-sm text-red-500 font-medium">{scene.error}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onRegenerate(scene.id, scene.prompt); }}
              className="mt-4 px-5 py-2 bg-white border border-red-200 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition-colors shadow-sm"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Main Image or Video */}
            {scene.videoUrl && !videoError ? (
              <video
                src={scene.videoUrl}
                controls
                autoPlay
                loop
                muted
                className="w-full h-full object-cover relative z-10"
                onError={() => setVideoError(true)}
              />
            ) : (scene.imageUrl || hoveredVersion) ? (
              <>
                <img
                  crossOrigin="anonymous"
                  src={hoveredVersion || scene.imageUrl}
                  alt={scene.prompt}
                  onLoad={() => setIsImageLoading(false)} // THE FIX: Turn off loading when real pixels arrive
                  className={`
                      w-full h-full object-cover transition-all duration-700 relative z-10
                      ${!hoveredVersion && FILTERS.find(f => f.id === scene.filter)?.class}
                      ${isPreviewingTransition ? 'opacity-50 scale-110' : ''} 
                    `}
                />
                {/* Hover Overlay - z-20 to be above image but below controls if needed, but here it IS the control trigger */}
                <div className="absolute inset-0 z-20 bg-black/0 group-hover/image:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
                  <Maximize2 className="text-white opacity-0 group-hover/image:opacity-100 drop-shadow-md transition-opacity" size={32} />
                </div>

                {/* Fallback Error for Video */}
                {scene.videoUrl && videoError && (
                  <div className="absolute bottom-4 left-4 right-4 bg-red-100 border border-red-200 p-2 rounded text-xs text-red-700 z-30 flex items-center gap-2">
                    <AlertCircle size={12} /> Upload Failed - Check Console
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-100 relative z-10">
                <ImageIcon size={48} />
              </div>
            )}

            {/* Loading Overlay for Video/Audio */}
            {((scene.isVideoLoading && !scene.videoUrl) || scene.isAudioLoading) && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-30 backdrop-blur-sm">
                <div className="bg-white/95 px-5 py-3 rounded-2xl flex items-center gap-3 text-sm font-bold shadow-xl animate-bounce-in">
                  {scene.isVideoLoading ? <Video size={18} className="text-brand-500 animate-pulse" /> : <Music size={18} className="text-brand-500 animate-pulse" />}
                  <span className="bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                    {scene.isVideoLoading ? 'Generating Video...' : 'Creating Audio...'}
                  </span>
                </div>
              </div>
            )}

            {/* Filter/Style Pills */}
            <div className="absolute top-3 right-3 flex flex-col gap-1 items-end pointer-events-none z-30">
              {scene.filter && scene.filter !== 'none' && !scene.isLoading && (
                <div className="bg-black/50 backdrop-blur-md text-white px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider">
                  {FILTERS.find(f => f.id === scene.filter)?.label}
                </div>
              )}
            </div>

            {/* Comparison Label */}
            {hoveredVersion && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white px-4 py-2 rounded-full font-bold text-sm backdrop-blur-md pointer-events-none z-30">
                Viewing Old Version
              </div>
            )}

            {/* Upload Status Icons */}
            {!isEditing && (
              <div className="absolute top-3 left-10 z-30 flex items-center gap-2">
                {scene.isUploading && (
                  <div title="Uploading to Safe Cloud..." className="bg-black/50 backdrop-blur-md p-1.5 rounded-full text-white animate-pulse">
                    <RefreshCw size={14} className="animate-spin" />
                  </div>
                )}
                {scene.uploadError ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRetryUpload?.(scene.id); }}
                    title="Upload Failed. Click to Retry."
                    className="bg-red-500/90 backdrop-blur-md p-1.5 rounded-full text-white hover:bg-red-600 border border-white/20 shadow-md transition-transform hover:scale-110 flex items-center gap-1 px-2"
                  >
                    <Upload size={14} />
                    <span className="text-[10px] font-bold">Retry Save</span>
                  </button>
                ) : !scene.isUploading && !scene.isLoading && scene.imageUrl && (
                  <div title="Saved to Cloud" className="bg-green-500/90 backdrop-blur-md p-1.5 rounded-full text-white shadow-sm">
                    <Check size={14} />
                  </div>
                )}
              </div>
            )}

            {/* Version History Toggle */}
            {!isEditing && scene.versions && scene.versions.length > 0 && (
              <div className="absolute bottom-2 right-2 z-30" onClick={(e) => e.stopPropagation()}>
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

      {/* TOOLBAR: High Z-Index to prevent blocking */}
      {!isEditing && !scene.isLoading && (
        <div className="relative z-40 flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-b border-gray-100">
          <div className="flex gap-1">
            {/* Main Creation Actions */}
            <button
              onClick={() => { setVideoError(false); onGenerateVideo(scene.id); }}
              title={scene.videoUrl ? "Regenerate Video" : "Animate Scene (Veo)"}
              className={`p-1.5 rounded-lg transition-colors ${scene.videoUrl && !videoError ? 'bg-pink-100 text-pink-600' : 'hover:bg-gray-200 text-gray-600'}`}
            >
              <Video size={16} />
            </button>

            <button
              onClick={toggleAudio}
              title={scene.audioUrl ? (isPlayingAudio ? "Pause Narration" : "Play Narration") : "Generate Narration"}
              className={`p-1.5 rounded-lg transition-colors ${isPlayingAudio ? 'bg-green-100 text-green-600 animate-pulse' : (scene.audioUrl ? 'text-green-600' : 'hover:bg-gray-200 text-gray-600')}`}
            >
              {scene.audioUrl && isPlayingAudio ? <Volume2 size={16} /> : <Music size={16} />}
            </button>

            <div className="w-px h-6 bg-gray-300 mx-1"></div>

            {/* Editing Actions */}
            <button
              onClick={() => onUpscale(scene.id)}
              title="Upscale"
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
            >
              <Zap size={16} />
            </button>

            <button
              onClick={() => setIsEditing(true)}
              title="Edit Scene"
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
            >
              <Edit2 size={16} />
            </button>

            {/* History Icon */}
            {scene.assetHistory && scene.assetHistory.length > 0 && (
              <button
                onClick={() => onCompareVersion({
                  id: scene.assetHistory![scene.assetHistory!.length - 1].id,
                  imageUrl: scene.assetHistory![scene.assetHistory!.length - 1].url,
                  prompt: scene.assetHistory![scene.assetHistory!.length - 1].prompt,
                  timestamp: scene.assetHistory![scene.assetHistory!.length - 1].createdAt
                })}
                title="Version History"
                className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500 transition-colors"
              >
                <Clock size={16} />
              </button>
            )}

            {/* Delete Icon */}
            <button
              onClick={() => {
                if (confirm("Delete this scene?")) {
                  onDelete(scene.id);
                }
              }}
              title="Delete Scene"
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="flex gap-1 relative">
            {/* Secondary Actions in a "More" or simple list */}

            {/* Filters Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
                title="Filters"
              >
                <Sliders size={16} />
              </button>
              {showFilters && (
                <div className="absolute bottom-full right-0 mb-1 w-32 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-30 flex flex-col overflow-hidden animate-fade-in-up">
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

            <button
              onClick={() => onRegenerate(scene.id, scene.prompt)}
              disabled={scene.isLoading}
              title={`Regenerate with style: ${scene.filter || 'Current Settings'}`}
              className={`p-2 rounded-full transition-colors ${scene.isLoading ? 'bg-gray-100 text-gray-400' : 'hover:bg-blue-100 text-blue-600'}`}
            >
              <RefreshCw size={16} className={scene.isLoading ? 'animate-spin' : ''} />
            </button>

            <div className="relative">
              <button
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
                title="Download"
              >
                <Download size={16} />
              </button>
              {showDownloadMenu && (
                <div className="absolute bottom-full right-0 mb-1 w-32 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-30 flex flex-col overflow-hidden animate-fade-in-up">
                  <button onClick={() => downloadImage('png')} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-brand-600 transition-colors">PNG (Default)</button>
                  <button onClick={() => downloadImage('jpeg')} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-brand-600 transition-colors">JPEG (Small)</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Panel */}
      {isEditing && (
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col gap-4 relative z-40">
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

              <div className="flex flex-col gap-1 mt-1">
                <div className="flex justify-between items-center text-xs text-gray-500 font-medium">
                  <span>Edit Strength</span>
                  <span>{editStrength}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={editStrength}
                  onChange={(e) => setEditStrength(parseInt(e.target.value))}
                  className="w-full accent-indigo-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 uppercase tracking-wide font-semibold">
                  <span>Subtle (Tweaks)</span>
                  <span>Strong (Redraw)</span>
                </div>
              </div>
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
        <div className="p-4 flex-1 flex flex-col bg-white rounded-b-3xl gap-2 relative z-40">
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
              {scene.tags?.map(tag => (
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