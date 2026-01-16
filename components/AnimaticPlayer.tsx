import React, { useState, useEffect, useRef } from 'react';
import { StoryScene } from '../types';
import { X, Play, Pause, ChevronRight, ChevronLeft, Volume2, VolumeX, RotateCcw } from 'lucide-react';

interface AnimaticPlayerProps {
  scenes: StoryScene[];
  projectTitle?: string;
  onClose: () => void;
}

export const AnimaticPlayer: React.FC<AnimaticPlayerProps> = ({ scenes, projectTitle, onClose }) => {
  // Sort scenes by index (just in case they come in mixed)
  const sortedScenes = [...scenes].sort((a, b) => {
    // Try to grab numbers from titles if they exist, or just use array index implicitly via sort stability if needed
    // But since scenes usually come from array index, we trust the input order mostly.
    // However, the prompt asked for filtering/sorting.
    return scenes.indexOf(a) - scenes.indexOf(b);
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showEndScreen, setShowEndScreen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const currentScene = sortedScenes[currentIndex];

  useEffect(() => {
    if (showEndScreen) return;

    // Auto-advance logic driven by timeouts if everything is missing
    let timeoutId: NodeJS.Timeout;

    if (isPlaying && currentScene) {
      // If we have neither video nor audio, we need manual advance
      const hasVideo = !!currentScene.videoUrl;
      const hasAudio = !!currentScene.audioUrl;

      if (!hasVideo && !hasAudio) {
        timeoutId = setTimeout(() => {
          handleNext();
        }, 5000); // 5s slide duration for static images
      }
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [currentIndex, isPlaying, currentScene, showEndScreen]);

  // Sync mute
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isMuted;
    if (videoRef.current) videoRef.current.muted = isMuted;
  }, [isMuted]);

  // Handle Play/Pause side effects
  useEffect(() => {
    if (showEndScreen) return;

    if (isPlaying) {
      audioRef.current?.play().catch(e => console.warn("Audio play failed", e));
      videoRef.current?.play().catch(e => console.warn("Video play failed", e));
    } else {
      audioRef.current?.pause();
      videoRef.current?.pause();
    }
  }, [isPlaying, currentIndex]);

  const handleNext = () => {
    if (currentIndex < sortedScenes.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsPlaying(false);
      setShowEndScreen(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setShowEndScreen(false);
      setIsPlaying(true);
    }
  };

  const handleReplay = () => {
    setCurrentIndex(0);
    setShowEndScreen(false);
    setIsPlaying(true);
  };

  const togglePlay = () => {
    if (showEndScreen) {
      handleReplay();
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  if (!currentScene && !showEndScreen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center animate-fade-in">

      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors z-50 p-2 bg-white/10 rounded-full backdrop-blur-sm"
      >
        <X size={24} />
      </button>

      {/* STAGE */}
      <div className="relative w-[90%] h-[80%] flex items-center justify-center">

        {showEndScreen ? (
          // END SCREEN
          <div className="text-center text-white space-y-8 animate-fade-in-up">
            <h2 className="text-6xl font-black tracking-tighter">The End</h2>
            <p className="text-xl text-gray-400 font-medium tracking-wide">{projectTitle || "Project Complete"}</p>
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={handleReplay}
                className="bg-white text-black px-8 py-3 rounded-full font-bold hover:scale-105 transition-transform flex items-center gap-2"
              >
                <RotateCcw size={20} /> Replay
              </button>
              <button
                onClick={onClose}
                className="bg-gray-800 text-white px-8 py-3 rounded-full font-bold hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          // CONTENT PLAYER
          <div className="relative w-full h-full flex flex-col items-center justify-center">
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-xl bg-black border border-gray-900 shadow-2xl">

              {/* VIDEO OR IMAGE */}
              {currentScene.videoUrl ? (
                <video
                  ref={videoRef}
                  src={currentScene.videoUrl}
                  className="w-full h-full object-contain"
                  autoPlay={isPlaying}
                  muted={isMuted}
                  playsInline
                  onEnded={() => {
                    // Video dictates timing if present
                    handleNext();
                  }}
                />
              ) : (
                <img
                  src={currentScene.imageUrl}
                  alt={currentScene.prompt}
                  className="w-full h-full object-contain animate-fade-in"
                />
              )}

              {/* DEDICATED AUDIO PLAYER (For Images or separate audio track) */}
              {!currentScene.videoUrl && currentScene.audioUrl && (
                <audio
                  ref={audioRef}
                  src={currentScene.audioUrl}
                  autoPlay={isPlaying}
                  muted={isMuted}
                  onEnded={() => {
                    // Audio dictates timing if no video
                    handleNext();
                  }}
                />
              )}

            </div>

            {/* Script Overlay - Subtitle Style */}
            <div className="absolute bottom-8 w-full max-w-3xl px-6 text-center z-20">
              <div className="bg-black/70 backdrop-blur-md rounded-xl p-4 border border-white/10 shadow-lg">
                <p className="text-white text-lg font-medium leading-relaxed drop-shadow-md">
                  {currentScene.prompt}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CONTROLS (Hide on End Screen) */}
      {!showEndScreen && (
        <div className="absolute bottom-6 flex items-center gap-6 bg-gray-900/80 backdrop-blur-lg px-8 py-3 rounded-full border border-white/10 shadow-2xl z-50">
          <button onClick={handlePrev} disabled={currentIndex === 0} className="text-white hover:text-brand-400 disabled:opacity-30">
            <ChevronLeft size={24} />
          </button>

          <span className="text-gray-400 text-xs font-mono w-16 text-center">
            Scene {currentIndex + 1}
          </span>

          <button onClick={togglePlay} className="text-white hover:scale-110 transition-transform">
            {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
          </button>

          <button onClick={handleNext} disabled={currentIndex === sortedScenes.length - 1} className="text-white hover:text-brand-400 disabled:opacity-30">
            <ChevronRight size={24} />
          </button>

          <div className="w-px h-6 bg-white/20 mx-2"></div>

          <button onClick={() => setIsMuted(!isMuted)} className="text-white hover:text-gray-300">
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      )}
    </div>
  );
};