import React, { useRef } from 'react';
import { ImageSize, AspectRatio, ColorMode, ArtStyle, ART_STYLES } from '../types';
import { Settings, Monitor, LayoutTemplate, Palette, Layers, ListOrdered, Upload, X, Image as ImageIcon } from 'lucide-react';

interface SettingsBarProps {
  currentSize: ImageSize;
  currentRatio: AspectRatio;
  currentColorMode: ColorMode;
  currentStyle: ArtStyle;
  sceneCount: number;
  styleReferenceImage?: string;
  onSizeChange: (size: ImageSize) => void;
  onRatioChange: (ratio: AspectRatio) => void;
  onColorModeChange: (mode: ColorMode) => void;
  onStyleChange: (style: ArtStyle) => void;
  onSceneCountChange: (count: number) => void;
  onStyleRefChange: (image?: string) => void;
  disabled: boolean;
}

export const SettingsBar: React.FC<SettingsBarProps> = ({ 
  currentSize, 
  currentRatio, 
  currentColorMode,
  currentStyle,
  sceneCount,
  styleReferenceImage,
  onSizeChange, 
  onRatioChange, 
  onColorModeChange,
  onStyleChange,
  onSceneCountChange,
  onStyleRefChange,
  disabled 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onStyleRefChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-6">
       <div className="flex items-center gap-2 text-gray-700 pb-2 border-b border-gray-100">
         <Settings size={20} className="text-brand-500" />
         <span className="font-bold text-sm">Project Configuration</span>
       </div>
       
       <div className="grid grid-cols-1 gap-6">
         
         {/* Row 1: Aesthetics */}
         <div className="space-y-4">
            {/* Art Style */}
            <div className="flex flex-col gap-2">
               <div className="flex items-center gap-2 text-gray-400">
                 <Palette size={16} />
                 <span className="text-xs font-bold uppercase tracking-wider">Art Style</span>
               </div>
               <select 
                 value={currentStyle}
                 onChange={(e) => onStyleChange(e.target.value as ArtStyle)}
                 disabled={disabled}
                 className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-xl focus:ring-brand-500 focus:border-brand-500 block p-2.5 outline-none transition-colors"
               >
                  {ART_STYLES.map(style => (
                    <option key={style} value={style}>{style}</option>
                  ))}
               </select>
            </div>

            {/* Custom Style Reference */}
            <div className="flex flex-col gap-2">
               <div className="flex items-center gap-2 text-gray-400">
                 <ImageIcon size={16} />
                 <span className="text-xs font-bold uppercase tracking-wider">Style Reference (AI Transfer)</span>
               </div>
               
               {styleReferenceImage ? (
                  <div className="relative h-20 w-full bg-gray-100 rounded-xl overflow-hidden border border-brand-200 group">
                     <img src={styleReferenceImage} alt="Style Ref" className="w-full h-full object-cover" />
                     <button 
                       onClick={() => onStyleRefChange(undefined)}
                       className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white p-1 rounded-full transition-colors"
                     >
                       <X size={12} />
                     </button>
                     <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white text-xs font-bold text-shadow">Active Style</span>
                     </div>
                  </div>
               ) : (
                  <div className="relative">
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/*"
                      className="hidden"
                      disabled={disabled}
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={disabled}
                      className="w-full border-2 border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50 text-gray-400 hover:text-brand-600 rounded-xl p-4 flex flex-col items-center justify-center gap-1 transition-all"
                    >
                       <Upload size={18} />
                       <span className="text-xs font-medium">Upload Image Style</span>
                    </button>
                  </div>
               )}
            </div>

            {/* Color Mode */}
             <div className="flex flex-col gap-2">
               <div className="flex items-center gap-2 text-gray-400">
                 <Layers size={16} />
                 <span className="text-xs font-bold uppercase tracking-wider">Color Mode</span>
               </div>
               <div className="flex bg-gray-100 p-1 rounded-xl">
                 {(Object.values(ColorMode) as ColorMode[]).map((mode) => (
                   <button
                     key={mode}
                     onClick={() => onColorModeChange(mode)}
                     disabled={disabled}
                     className={`
                       flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
                       ${currentColorMode === mode 
                         ? 'bg-white text-brand-600 shadow-sm' 
                         : 'text-gray-500 hover:text-gray-700'
                       }
                       ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                     `}
                   >
                     {mode === ColorMode.BlackAndWhite ? 'B&W' : 'Color'}
                   </button>
                 ))}
               </div>
            </div>
         </div>

         <div className="border-t border-gray-100 my-1"></div>

         {/* Row 2: Technical Specs */}
         <div className="space-y-4">
             {/* Scene Count */}
            <div className="flex flex-col gap-2">
               <div className="flex items-center gap-2 text-gray-400">
                 <ListOrdered size={16} />
                 <span className="text-xs font-bold uppercase tracking-wider">Scene Count</span>
               </div>
               <select 
                 value={sceneCount}
                 onChange={(e) => onSceneCountChange(Number(e.target.value))}
                 disabled={disabled}
                 className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-xl focus:ring-brand-500 focus:border-brand-500 block p-2.5 outline-none transition-colors"
               >
                  {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>{num} Scenes</option>
                  ))}
               </select>
            </div>

            {/* Aspect Ratio */}
            <div className="flex flex-col gap-2">
               <div className="flex items-center gap-2 text-gray-400">
                 <LayoutTemplate size={16} />
                 <span className="text-xs font-bold uppercase tracking-wider">Ratio</span>
               </div>
               <div className="flex flex-wrap gap-2 bg-gray-100 p-2 rounded-xl">
                 {(Object.values(AspectRatio) as AspectRatio[]).map((ratio) => (
                   <button
                     key={ratio}
                     onClick={() => onRatioChange(ratio)}
                     disabled={disabled}
                     className={`
                       flex-grow px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-200 whitespace-nowrap
                       ${currentRatio === ratio 
                         ? 'bg-white text-brand-600 shadow-sm' 
                         : 'text-gray-500 hover:text-gray-700'
                       }
                       ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                     `}
                   >
                     {ratio}
                   </button>
                 ))}
               </div>
            </div>

            {/* Resolution */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-gray-400">
                  <Monitor size={16} />
                  <span className="text-xs font-bold uppercase tracking-wider">Resolution</span>
                </div>
               <div className="flex bg-gray-100 p-1 rounded-xl">
                 {(Object.values(ImageSize) as ImageSize[]).map((size) => (
                   <button
                     key={size}
                     onClick={() => onSizeChange(size)}
                     disabled={disabled}
                     className={`
                       flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
                       ${currentSize === size 
                         ? 'bg-white text-brand-600 shadow-sm' 
                         : 'text-gray-500 hover:text-gray-700'
                       }
                       ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                     `}
                   >
                     {size}
                   </button>
                 ))}
               </div>
             </div>
         </div>

       </div>
    </div>
  );
};