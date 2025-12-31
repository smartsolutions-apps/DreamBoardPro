import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, SkipForward, SkipBack } from 'lucide-react';
import { StoryScene, SceneTransition } from '../types';

interface AnimaticPlayerProps {
  scenes: StoryScene[];
  onClose: () => void;
}

export const AnimaticPlayer: React.FC<AnimaticPlayerProps> = ({ scenes, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const timerRef = useRef<number | null>(null);
  const DURATION = 3000; // 3 seconds per slide default

  useEffect(() => {
    if (isPlaying) {
      const startTime = Date.now();
      const startProgress = progress;
      
      const animate = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const newProgress = Math.min(100, startProgress + (elapsed / DURATION) * 100);
        
        setProgress(newProgress);
        
        if (elapsed >= DURATION) {
          if (currentIndex < scenes.length - 1) {
             setCurrentIndex(prev => prev + 1);
             setProgress(0);
             // Restart timer effectively
             timerRef.current = requestAnimationFrame(animate) as unknown as number; 
             // Logic simplified: in real animatic we would reset start time here
          } else {
             setIsPlaying(false);
             setProgress(100);
          }
        } else {
           timerRef.current = requestAnimationFrame(animate) as unknown as number;
        }
      };
      
      timerRef.current = requestAnimationFrame(animate) as unknown as number;
    } else if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
    }
    
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [isPlaying, currentIndex, scenes.length]);

  // Reset progress when slide changes manually
  useEffect(() => {
     if (!isPlaying) setProgress(0);
  }, [currentIndex, isPlaying]);

  const togglePlay = () => {
    if (currentIndex === scenes.length - 1 && progress === 100) {
       setCurrentIndex(0);
       setProgress(0);
    }
    setIsPlaying(!isPlaying);
  };

  const currentScene = scenes[currentIndex];

  const getTransitionClass = (transition?: SceneTransition) => {
    switch (transition) {
      case 'Fade In': return 'animate-fade-in';
      case 'Zoom In': return 'animate-zoom-in'; // Assuming these animations exist or generic fade
      case 'Wipe Left': return 'animate-slide-in-right';
      default: return 'animate-fade-in';
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col items-center justify-center">
       {/* Screen */}
       <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
          {currentScene.videoUrl ? (
             <video 
               src={currentScene.videoUrl} 
               autoPlay={isPlaying} 
               loop 
               muted 
               className="max-w-full max-h-full object-contain" 
             />
          ) : (
             <img 
               key={currentIndex} // Force re-render for animation
               src={currentScene.imageUrl} 
               className={`max-w-full max-h-full object-contain ${getTransitionClass(currentScene.transition)}`}
               alt={currentScene.title}
             />
          )}
          
          {/* Subtitles/Title Overlay */}
          <div className="absolute bottom-20 left-0 right-0 text-center">
             <h2 className="text-white text-3xl font-bold shadow-black drop-shadow-md">{currentScene.title}</h2>
             <p className="text-white/80 text-lg bg-black/40 inline-block px-4 py-1 rounded mt-2 backdrop-blur-sm max-w-3xl">
               {currentScene.prompt}
             </p>
          </div>
       </div>

       {/* Controls */}
       <div className="absolute bottom-0 w-full bg-gradient-to-t from-black/90 to-transparent p-6 pb-8">
          {/* Progress Bar */}
          <div className="w-full bg-gray-700 h-2 rounded-full mb-4 overflow-hidden cursor-pointer" onClick={(e) => {
             // Basic seeking logic could go here
          }}>
             <div 
               className="bg-brand-500 h-full transition-all duration-100 ease-linear"
               style={{ width: `${((currentIndex * DURATION) + (progress/100 * DURATION)) / (scenes.length * DURATION) * 100}%` }}
             />
          </div>

          <div className="flex items-center justify-center gap-6 text-white">
             <button onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} className="hover:text-brand-400">
               <SkipBack size={24} />
             </button>
             
             <button 
               onClick={togglePlay}
               className="bg-white text-black rounded-full p-4 hover:scale-105 transition-transform"
             >
               {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
             </button>

             <button onClick={() => setCurrentIndex(Math.min(scenes.length - 1, currentIndex + 1))} className="hover:text-brand-400">
               <SkipForward size={24} />
             </button>
          </div>
          
          <button onClick={onClose} className="absolute top-6 right-6 text-white/50 hover:text-white">
             <X size={32} />
          </button>
       </div>
    </div>
  );
};