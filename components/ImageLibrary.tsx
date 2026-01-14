import React, { useState } from 'react';
import { X, Search, Tag, Copy, Trash, Image as ImageIcon, Check, Video, Mic, RefreshCw, Film, Music } from 'lucide-react';
import { StoryScene, AssetVersion } from '../types';
import { MediaPreviewModal } from './MediaPreviewModal';

interface ImageLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: StoryScene[];
  onRestoreAsset: (sceneId: string, asset: AssetVersion) => void;
  onDeleteAsset: (sceneId: string, assetId: string, url: string) => void;
}

export const ImageLibrary: React.FC<ImageLibraryProps> = ({ isOpen, onClose, scenes, onRestoreAsset, onDeleteAsset }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<AssetVersion | null>(null);

  // Group assets by Scene
  const sceneGroups = scenes.map(scene => {
    // Collect all unique assets from history
    // We utilize a Map to ensure unique URL is the key (or ID if reliable)
    // Actually, assetHistory should be the source of truth.

    // BUT, we want to make sure the CURRENT active images are shown even if history is empty (legacy support)
    const assets = [...(scene.assetHistory || [])];

    // Legacy fallback: If active asset exists but not in history, add it?
    // This is "Ghost Asset" Task 2 related. 
    // Ideally we assume history is populated. If not, we can synthesized one.
    // For now, let's just stick to assetHistory + making sure we flag the active one.

    // Sort by newest first
    assets.sort((a, b) => b.createdAt - a.createdAt);

    return {
      scene,
      assets
    };
  }).sort((a, b) => (a.scene.number || 0) - (b.scene.number || 0)) // STRICT SORTING BY SCENE NUMBER
    .filter(group => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return group.scene.prompt.toLowerCase().includes(term) ||
        group.scene.title?.toLowerCase().includes(term) ||
        `scene ${group.scene.number}`.includes(term);
    });

  const getIconForType = (type: string) => {
    switch (type) {
      case 'video': return <Video size={14} />;
      case 'audio': return <Mic size={14} />;
      default: return <ImageIcon size={14} />;
    }
  };

  const isActiveAsset = (scene: StoryScene, asset: AssetVersion) => {
    if (asset.type === 'video') return scene.videoUrl === asset.url;
    if (asset.type === 'audio') return scene.audioUrl === asset.url;
    return scene.imageUrl === asset.url;
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      // feedback?
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className={`fixed right-0 top-0 bottom-0 z-50 bg-white shadow-2xl transition-all duration-300 border-l border-gray-200 flex flex-col w-[480px] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <ImageIcon size={18} className="text-brand-500" />
          Asset Manager
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>

      <div className="p-4 border-b border-gray-100 bg-white">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search scene prompts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-200"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8 bg-gray-50/50">
        {sceneGroups.map(({ scene, assets }, index) => (
          <div key={scene.id} className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
              <div className="bg-gray-200 text-gray-600 font-bold text-xs px-2 py-1 rounded">
                {index + 1}
              </div>
              <p className="text-sm font-medium text-gray-700 line-clamp-1 flex-1">
                {scene.title || `Scene ${index + 1}`}
              </p>
              <span className="text-xs text-gray-400">{assets.length} assets</span>
            </div>

            {assets.length === 0 ? (
              <div className="text-xs text-gray-400 italic pl-2">No history found.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {assets.map((asset) => {
                  const isActive = isActiveAsset(scene, asset);
                  const isConfirming = confirmDeleteId === asset.id;

                  return (
                    <div key={asset.id} className={`group relative aspect-video bg-gray-100 rounded-lg overflow-hidden border ${isActive ? 'border-brand-500 ring-2 ring-brand-100' : 'border-gray-200'}`}>
                      {/* Content Preview */}
                      {asset.type === 'video' ? (
                        <video src={asset.url} className="w-full h-full object-cover" />
                      ) : asset.type === 'audio' ? (
                        <div className="w-full h-full flex items-center justify-center bg-indigo-50 text-indigo-400">
                          <Mic size={24} />
                        </div>
                      ) : (
                        <img src={asset.url} className="w-full h-full object-cover" loading="lazy" />
                      )}

                      {/* Badges */}
                      <div className="absolute top-2 left-2 flex gap-1">
                        <span className="bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 backdrop-blur-md">
                          {getIconForType(asset.type)}
                          <span className="capitalize">{asset.type}</span>
                        </span>
                      </div>

                      {isActive && (
                        <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm font-bold animate-pulse">
                          Active
                        </div>
                      )}

                      {/* Click to Preview Overlay */}
                      <div
                        className="absolute inset-0 cursor-pointer"
                        onClick={() => setPreviewAsset(asset)}
                      />

                      {/* Hover Actions */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-auto gap-1">
                        {!isActive && (
                          <button
                            onClick={() => onRestoreAsset(scene.id, asset)}
                            className="bg-white hover:bg-white text-gray-900 py-1.5 rounded text-xs flex items-center justify-center gap-1 font-semibold transition-colors w-full"
                          >
                            <RefreshCw size={12} /> Make Active
                          </button>
                        )}

                        <div className="flex gap-1">
                          <button
                            onClick={() => handleCopyUrl(asset.url)}
                            className="bg-white/20 hover:bg-white/40 text-white py-1.5 rounded text-xs flex items-center justify-center gap-1 flex-1 backdrop-blur-sm transition-colors"
                            title="Copy URL"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            onClick={() => {
                              if (isConfirming) {
                                onDeleteAsset(scene.id, asset.id, asset.url);
                                setConfirmDeleteId(null);
                              } else {
                                setConfirmDeleteId(asset.id);
                              }
                            }}
                            className={`${isConfirming ? 'bg-red-500 hover:bg-red-600' : 'bg-white/20 hover:bg-red-500/80'} text-white py-1.5 rounded text-xs flex items-center justify-center gap-1 transition-colors w-8`}
                            title="Delete"
                          >
                            <Trash size={12} />
                          </button>
                        </div>
                        {isConfirming && <div className="text-[10px] text-red-200 text-center">Click trash again to delete</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {sceneGroups.length === 0 && (
          <div className="text-center text-gray-400 py-10 text-sm">
            No scenes found.
          </div>
        )}
      </div>

      {/* Media Preview Modal */}
      {previewAsset && (
        <MediaPreviewModal
          asset={previewAsset}
          onClose={() => setPreviewAsset(null)}
        />
      )}
    </div>
  );
};