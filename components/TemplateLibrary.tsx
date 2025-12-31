import React from 'react';
import { SceneTemplate } from '../types';
import { Layout, User, Zap, ArrowRight, Camera, Move, Star, Trash2 } from 'lucide-react';

const DEFAULT_TEMPLATES: SceneTemplate[] = [
  { id: 't1', label: 'Over Shoulder', prompt: 'Over-the-shoulder shot looking at a character, focus on foreground shoulder', category: 'Composition', icon: 'User' },
  { id: 't2', label: 'Wide Establish', prompt: 'Wide establishing shot of the environment, highly detailed background', category: 'Composition', icon: 'Camera' },
  { id: 't3', label: 'Close-Up Emotion', prompt: 'Extreme close-up on character face showing intense emotion', category: 'Emotion', icon: 'User' },
  { id: 't4', label: 'Low Angle Hero', prompt: 'Low angle shot looking up at the hero, making them look powerful', category: 'Composition', icon: 'ArrowRight' },
  { id: 't5', label: 'Bird\'s Eye', prompt: 'High angle bird\'s eye view looking straight down', category: 'Composition', icon: 'Move' },
  { id: 't6', label: 'Action Blur', prompt: 'Dynamic action shot with motion blur, fast paced', category: 'Action', icon: 'Zap' },
];

interface TemplateLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onDragStart: (e: React.DragEvent, template: SceneTemplate) => void;
  customTemplates: SceneTemplate[];
  onDeleteTemplate: (id: string) => void;
}

export const TemplateLibrary: React.FC<TemplateLibraryProps> = ({ isOpen, onClose, onDragStart, customTemplates, onDeleteTemplate }) => {
  const allTemplates = [...customTemplates, ...DEFAULT_TEMPLATES];
  const categories = ['Custom', 'Composition', 'Action', 'Emotion'];

  return (
    <div className={`fixed left-0 top-0 bottom-0 z-50 bg-white shadow-2xl transition-all duration-300 border-r border-gray-200 flex flex-col w-64 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
       <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
         <h3 className="font-bold text-gray-800 flex items-center gap-2">
           <Layout size={18} className="text-brand-500" />
           Templates
         </h3>
         <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
           &times;
         </button>
       </div>

       <div className="flex-1 overflow-y-auto p-4 space-y-6">
         
         {/* Categories */}
         {categories.map(category => {
           const categoryTemplates = allTemplates.filter(t => t.category === category);
           if (categoryTemplates.length === 0) return null;

           return (
             <div key={category}>
               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                 {category === 'Custom' && <Star size={12} className="text-amber-500" />}
                 {category}
               </h4>
               <div className="grid grid-cols-1 gap-3">
                 {categoryTemplates.map(template => (
                   <div
                     key={template.id}
                     draggable
                     onDragStart={(e) => onDragStart(e, template)}
                     className={`
                       bg-white border rounded-xl p-3 cursor-grab hover:shadow-md transition-all flex items-center gap-3 group relative
                       ${category === 'Custom' ? 'border-amber-200 hover:border-amber-400' : 'border-gray-200 hover:border-brand-300'}
                     `}
                   >
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${category === 'Custom' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-50 text-indigo-500 group-hover:bg-brand-50 group-hover:text-brand-500'}`}>
                        {template.icon === 'User' && <User size={16} />}
                        {template.icon === 'Camera' && <Camera size={16} />}
                        {template.icon === 'ArrowRight' && <ArrowRight size={16} />}
                        {template.icon === 'Move' && <Move size={16} />}
                        {template.icon === 'Zap' && <Zap size={16} />}
                        {template.icon === 'Star' && <Star size={16} />}
                     </div>
                     <div className="text-sm font-medium text-gray-700 truncate pr-4">
                       {template.label}
                     </div>
                     
                     {category === 'Custom' && (
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           onDeleteTemplate(template.id);
                         }}
                         className="absolute right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1"
                       >
                         <Trash2 size={14} />
                       </button>
                     )}
                   </div>
                 ))}
               </div>
             </div>
           );
         })}

       </div>
       <div className="p-4 bg-gray-50 text-xs text-gray-500 text-center">
          Drag to add to storyboard
       </div>
    </div>
  );
};