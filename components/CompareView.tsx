import React from 'react';
import { X, ArrowRightLeft, Check, RotateCcw } from 'lucide-react';
import { SceneVersion } from '../types';

interface CompareViewProps {
  currentImage: string;
  version: SceneVersion;
  onClose: () => void;
  onRestore: () => void;
}

export const CompareView: React.FC<CompareViewProps> = ({ currentImage, version, onClose, onRestore }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
       <div className="bg-white rounded-3xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden shadow-2xl">
         
         <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <ArrowRightLeft size={20} className="text-brand-500" />
              Version Comparison
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <X size={20} className="text-gray-500" />
            </button>
         </div>

         <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 overflow-hidden bg-gray-100">
            {/* Current */}
            <div className="flex-1 flex flex-col gap-2 h-full">
               <div className="bg-white py-2 px-4 rounded-t-xl font-bold text-sm text-gray-500 border-b-4 border-gray-300 flex justify-between items-center">
                  <span>Current Version</span>
                  <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-1 rounded-full uppercase">Active</span>
               </div>
               <div className="flex-1 bg-white rounded-b-xl shadow-inner p-2 overflow-hidden flex items-center justify-center opacity-75">
                  <img src={currentImage} alt="Current" className="max-w-full max-h-full object-contain" />
               </div>
            </div>

            {/* Previous */}
            <div className="flex-1 flex flex-col gap-2 h-full cursor-pointer group" onClick={onRestore} title="Click to Restore this version">
               <div className="bg-white py-2 px-4 rounded-t-xl font-bold text-sm text-indigo-600 border-b-4 border-indigo-500 flex justify-between items-center shadow-md z-10">
                  <span>Selected History Version</span>
                  <div className="flex items-center gap-2">
                     <span className="text-xs font-normal text-gray-400">{new Date(version.timestamp).toLocaleString()}</span>
                     <Check size={16} className="text-indigo-500" />
                  </div>
               </div>
               <div className="flex-1 bg-white rounded-b-xl shadow-lg p-2 overflow-hidden flex items-center justify-center ring-4 ring-indigo-100 group-hover:ring-indigo-300 transition-all relative">
                  <img src={version.imageUrl} alt="Version" className="max-w-full max-h-full object-contain" />
                  <div className="absolute inset-0 flex items-center justify-center bg-indigo-900/0 group-hover:bg-indigo-900/10 transition-colors">
                      <div className="bg-indigo-600 text-white px-4 py-2 rounded-full font-bold opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all flex items-center gap-2 shadow-xl">
                          <RotateCcw size={16} /> Restore This
                      </div>
                  </div>
               </div>
            </div>
         </div>

         <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3">
            <button onClick={onClose} className="px-6 py-2 rounded-xl text-gray-600 font-bold hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            <button onClick={onRestore} className="px-6 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-md transition-colors flex items-center gap-2">
              <RotateCcw size={16} /> Restore Selected Version
            </button>
         </div>

       </div>
    </div>
  );
};