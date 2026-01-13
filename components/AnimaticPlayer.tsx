import React, { useState, useEffect, useRef } from 'react';
import { StoryScene } from '../types';
import { X, Play, Pause, ChevronRight, ChevronLeft, Volume2, VolumeX } from 'lucide-react';

interface AnimaticPlayerProps {
  scenes: StoryScene[];
  onClose: () => void;
}

export const AnimaticPlayer: React.FC<AnimaticPlayerProps> = ({ scenes, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);

  const currentScene = scenes[currentIndex];

  useEffect(() => {
    if (isPlaying && currentScene) {
      if (currentScene.audioUrl && !isMuted) {
        if (!audioRef.current) {
          audioRef.current = new Audio(currentScene.audioUrl);
        } else {
          audioRef.current.src = currentScene.audioUrl;
        }

        audioRef.current.play().catch(e => console.warn("Audio play failed", e));

        audioRef.current.onended = () => {
          handleNext();
        };

        // Fallback safety timeout in case audio hangs or is very short
        // But mainly rely on 'ended'. 
      } else {
        // No audio, default timer (5s)
        const timer = setTimeout(() => {
          handleNext();
        }, 5000);
        return () => clearTimeout(timer);
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
      }
    }
  }, [currentIndex, isPlaying, isMuted, currentScene]);


  // Handle progress bar for current slide if needed, 
  // currently we just advance on finish.

  const handleNext = () => {
    if (currentIndex < scenes.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsPlaying(false); // End of show
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  if (!currentScene) return null;

  // Transition Styles
  const validTransition = currentScene.transition || 'Fade In';
  const getTransitionClass = (transition: string) => {
    switch (transition) {
      case 'Cut': return '';
      case 'Fade In': return 'animate-fade-in';
      case 'Fade Out': return 'animate-fade-out'; // Might need custom keyframe
      case 'Dissolve': return 'opacity-0 animate-fade-in duration-1000';
      case 'Wipe Left': return 'animate-slide-in-right'; // CSS defined elsewhere ideally
      case 'Wipe Right': return 'animate-slide-in-left';
      case 'Zoom In': return 'animate-zoom-in';
      default: return 'animate-fade-in';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors z-50 p-2 bg-black/20 rounded-full"
      >
        <X size={32} />
      </button>

      {/* Main Stage */}
      <div className="relative w-full h-full max-w-7xl max-h-screen flex items-center justify-center p-4 md:p-10">

        {/* Media */}
        <div className={`relative w-full h-full flex items-center justify-center overflow-hidden rounded-lg shadow-2xl bg-black ${getTransitionClass(validTransition)}`} key={currentScene.id}>
          {currentScene.videoUrl ? (
            <video
              src={currentScene.videoUrl}
              className="w-full h-full object-contain"
              autoPlay
              muted={true} // Video muted, narration plays separately usually or mixed? User asked for narration sync.
              loop
              playsInline
            />
          ) : (
            <img
              src={currentScene.imageUrl}
              alt={currentScene.prompt}
              className="w-full h-full object-contain"
            />
          )}
        </div>

        {/* Captions Overlay */}
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 text-center">
          <div className="bg-black/60 backdrop-blur-sm text-white px-6 py-4 rounded-xl inline-block max-w-[90%] md:max-w-[80%]">
            <p className="font-medium text-lg md:text-xl line-clamp-2 md:line-clamp-3 leading-relaxed drop-shadow-md">
              {currentScene.prompt}
            </p>
          </div>
        </div>

      </div>

      {/* Controls Bar */}
      <div className="absolute bottom-0 left-0 w-full h-20 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-between px-8 pb-4">
        <div className="flex items-center gap-4 text-white">
          {/* Simple counter */}
          <span className="font-mono text-sm opacity-70">{currentIndex + 1} / {scenes.length}</span>
        </div>

        <div className="flex items-center gap-6">
          <button onClick={handlePrev} className="text-white hover:text-brand-400 disabled:opacity-30 disabled:hover:text-white" disabled={currentIndex === 0}>
            <ChevronLeft size={32} />
          </button>

          <button
            onClick={togglePlay}
            className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
          >
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
          </button>

          <button onClick={handleNext} className="text-white hover:text-brand-400 disabled:opacity-30 disabled:hover:text-white" disabled={currentIndex === scenes.length - 1}>
            <ChevronRight size={32} />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => setIsMuted(!isMuted)} className="text-white hover:text-gray-300 transition-colors">
            {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
          </button>
        </div>
      </div>
    </div>
  );
};