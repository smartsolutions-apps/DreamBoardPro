import React, { useState } from 'react';
import { X, Search, Tag, Copy, Trash, Image as ImageIcon, Check } from 'lucide-react';
import { StoryScene, SceneVersion } from '../types';

interface ImageLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: StoryScene[];
}

export const ImageLibrary: React.FC<ImageLibraryProps> = ({ isOpen, onClose, scenes }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Flatten all images from scenes and versions
  const allImages = scenes.flatMap(scene => {
    const main = scene.imageUrl ? [{ 
      id: scene.id,
      url: scene.imageUrl, 
      prompt: scene.prompt, 
      title: scene.title, 
      date: Date.now(),
      tags: scene.tags || []
    }] : [];
    
    const vers = scene.versions.map(v => ({
      id: v.id,
      url: v.imageUrl,
      prompt: v.prompt,
      title: `${scene.title} (Version)`,
      date: v.timestamp,
      tags: []
    }));
    
    return [...main, ...vers];
  });

  const allTags = Array.from(new Set(allImages.flatMap(img => img.tags)));

  const filteredImages = allImages.filter(img => {
    const matchesSearch = img.prompt.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          img.title?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = selectedTag ? img.tags.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  const handleCopyImage = async (img: typeof allImages[0]) => {
     try {
         const response = await fetch(img.url);
         const blob = await response.blob();
         await navigator.clipboard.write([
            new ClipboardItem({
                [blob.type]: blob
            })
         ]);
         setCopiedId(img.id);
         setTimeout(() => setCopiedId(null), 2000);
     } catch (err) {
         console.error("Failed to copy image to clipboard", err);
         alert("Could not copy image. Try right-clicking and 'Copy Image'.");
     }
  };

  return (
    <div className={`fixed right-0 top-0 bottom-0 z-50 bg-white shadow-2xl transition-all duration-300 border-l border-gray-200 flex flex-col w-96 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
       <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
         <h3 className="font-bold text-gray-800 flex items-center gap-2">
           <ImageIcon size={18} className="text-brand-500" />
           Asset Library
         </h3>
         <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
           <X size={20} />
         </button>
       </div>

       <div className="p-4 border-b border-gray-100 bg-white space-y-3">
          <div className="relative">
             <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
             <input 
               type="text" 
               placeholder="Search assets..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full pl-9 pr-4 py-2 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-brand-200"
             />
          </div>
          
          {allTags.length > 0 && (
             <div className="flex flex-wrap gap-2">
               {allTags.map(tag => (
                 <button
                   key={tag}
                   onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                   className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                     selectedTag === tag 
                       ? 'bg-brand-500 text-white border-brand-500' 
                       : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                   }`}
                 >
                   #{tag}
                 </button>
               ))}
             </div>
          )}
       </div>

       <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 bg-gray-50/50">
          {filteredImages.map((img, i) => (
             <div key={i} className="group relative aspect-square bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
                <img src={img.url} className="w-full h-full object-cover" loading="lazy" />
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-auto">
                   <p className="text-[10px] text-white line-clamp-2 mb-2">{img.prompt}</p>
                   <button 
                     onClick={() => handleCopyImage(img)}
                     className="bg-white/20 hover:bg-white/40 text-white p-1 rounded text-xs flex items-center justify-center gap-1 backdrop-blur-sm transition-colors w-full"
                   >
                     {copiedId === img.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />} 
                     {copiedId === img.id ? 'Copied' : 'Copy Image'}
                   </button>
                </div>
             </div>
          ))}
          {filteredImages.length === 0 && (
             <div className="col-span-2 text-center text-gray-400 py-10 text-sm">
                No images found.
             </div>
          )}
       </div>
    </div>
  );
};