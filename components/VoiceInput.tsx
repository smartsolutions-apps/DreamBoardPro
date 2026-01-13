import React, { useState, useRef, useEffect } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { AudioWaveIcon } from './AudioWaveIcon';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, disabled }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptBufferRef = useRef<string>("");

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []); // Empty dependency array for cleanup only

  const startRecording = async () => {
    try {
      // 1. Get Audio Stream for Visualizer
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(mediaStream);

      // 2. Init Speech Recognition
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Speech Recognition not supported in this browser. Try Chrome/Safari.");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        // We buffer everything. 
        // Note: For 'continuous' recognition, we might just want to append final chunks.
        // Or strictly use the buffer logic.
        // Ideally we just keep the TOTAL session transcript in buffer handling duplicates?
        // Actually, easiest is to just capture everything.

        // Simpler approach: Just accumulate FINAL results.
        if (finalTranscript) {
          transcriptBufferRef.current += (" " + finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech Recognition Error", event.error);
        if (event.error === 'not-allowed') {
          alert("Mic Access Denied.");
          stopRecording();
        }
      };

      recognition.onend = () => {
        // Auto-restart if we didn't explicitly stop (optional, but 'isRecording' state controls logic)
        if (isRecording) {
          // recognition.start(); // Keep alive? Or just stop.
          // Let's stop to be safe.
          setIsRecording(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
      transcriptBufferRef.current = ""; // Reset buffer

    } catch (err) {
      console.error("Failed to start recording", err);
      alert("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    // 1. Stop components
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }

    setIsRecording(false);

    // 2. Paste Logic
    const fullText = transcriptBufferRef.current.trim();
    if (fullText) {
      onTranscript(fullText);
    }
  };

  return (
    <button
      onClick={isRecording ? stopRecording : startRecording}
      disabled={disabled}
      className={`
        relative p-3 rounded-full transition-all duration-300 shadow-md flex items-center justify-center
        ${isRecording
          ? 'bg-red-50 ring-2 ring-red-100'
          : 'bg-white text-gray-500 hover:text-brand-600 hover:bg-brand-50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      title={isRecording ? "Stop & Paste" : "Voice Input"}
    >
      {isRecording ? (
        <AudioWaveIcon stream={stream} isRecording={isRecording} />
      ) : (
        <Mic size={20} />
      )}
    </button>
  );
};