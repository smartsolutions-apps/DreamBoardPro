import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, disabled }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const transcriptBufferRef = useRef<string>("");
  
  // Refs for audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);

  const cleanup = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current = null;
    }
    setIsRecording(false);
    setIsConnecting(false);
  };

  const startRecording = async () => {
    if (!process.env.API_KEY) return;
    
    try {
      setIsConnecting(true);
      transcriptBufferRef.current = ""; // Clear buffer
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });

      // Connect to Gemini Live
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          inputAudioTranscription: {}, // Enable transcription without specific model arg
          systemInstruction: "You are a helpful transcriber. You listen to the user and do not reply, just acknowledge.",
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
            setIsConnecting(false);
            setIsRecording(true);
          },
          onmessage: (message) => {
            // We mainly care about the user's input transcription here
            if (message.serverContent?.inputTranscription?.text) {
               const text = message.serverContent.inputTranscription.text;
               // Accumulate instead of sending immediately
               transcriptBufferRef.current += text;
            }
          },
          onclose: () => {
            console.log("Gemini Live Session Closed");
            if (isRecording) cleanup();
          },
          onerror: (err) => {
            console.error("Gemini Live Error", err);
            cleanup();
          }
        }
      });

      sessionRef.current = sessionPromise;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Ensure context is running
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = floatTo16BitPCM(inputData);
        const base64Data = arrayBufferToBase64(pcmData);

        sessionPromise.then(session => {
            session.sendRealtimeInput({
                media: {
                    mimeType: "audio/pcm;rate=16000",
                    data: base64Data
                }
            });
        });
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

    } catch (error) {
      console.error("Failed to start recording:", error);
      cleanup();
    }
  };

  const stopRecording = () => {
    // Send buffered text to parent
    if (transcriptBufferRef.current.trim()) {
        onTranscript(transcriptBufferRef.current.trim());
    }
    cleanup();
  };

  function floatTo16BitPCM(input: Float32Array) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output.buffer;
  }

  function arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  return (
    <button
      onClick={isRecording ? stopRecording : startRecording}
      disabled={disabled || isConnecting}
      className={`
        p-3 rounded-full transition-all duration-300 shadow-md flex items-center justify-center relative
        ${isRecording 
          ? 'bg-red-50 text-red-600 ring-2 ring-red-200' 
          : 'bg-white text-gray-500 hover:text-brand-600 hover:bg-brand-50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      title={isRecording ? "Stop Recording (Inserts Text)" : "Voice Input"}
    >
      {isConnecting ? (
        <Loader2 size={20} className="animate-spin text-brand-500" />
      ) : isRecording ? (
        <>
           <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
           </span>
           <MicOff size={20} />
        </>
      ) : (
        <Mic size={20} />
      )}
    </button>
  );
};