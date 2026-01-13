import React, { useEffect, useRef } from 'react';

interface AudioWaveIconProps {
    stream: MediaStream | null;
    isRecording: boolean;
}

export const AudioWaveIcon: React.FC<AudioWaveIconProps> = ({ stream, isRecording }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isRecording || !stream || !canvasRef.current) {
            // Cleanup if stopped
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            return;
        }

        // Initialize Audio Context
        const initAudio = async () => {
            try {
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                audioContextRef.current = audioCtx;

                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 32; // Low FFT size for just a few bars
                analyserRef.current = analyser;

                const source = audioCtx.createMediaStreamSource(stream);
                source.connect(analyser);
                sourceRef.current = source;

                draw();
            } catch (e) {
                console.error("Audio Context Init Failed", e);
            }
        };

        const draw = () => {
            if (!analyserRef.current || !canvasRef.current) return;

            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyserRef.current.getByteFrequencyData(dataArray);

            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const width = canvas.width;
            const height = canvas.height;

            ctx.clearRect(0, 0, width, height);

            // Draw 5 bars
            const barCount = 5;
            const gap = 2;
            const barWidth = (width - ((barCount - 1) * gap)) / barCount;

            // Select 5 distributed frequencies
            const indices = [1, 3, 5, 7, 9];

            indices.forEach((dataIndex, i) => {
                const value = dataArray[dataIndex] || 0;
                // Map 0-255 to height (min 20% height for visibility)
                const percent = Math.max(0.2, value / 255);
                const barHeight = height * percent;

                const x = i * (barWidth + gap);
                const y = (height - barHeight) / 2; // Center vertically

                // Color based on volume/activity
                ctx.fillStyle = value > 50 ? '#ec4899' : '#9ca3af'; // Brand-500 vs Gray-400

                // Rounded rect simulation (simple rect for now)
                ctx.beginPath();
                // Using 'round' cap style trick or manual rounded rect
                // Simple rect
                ctx.fillRect(x, y, barWidth, barHeight);
            });

            animationFrameRef.current = requestAnimationFrame(draw);
        };

        initAudio();

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, [isRecording, stream]);

    // If not recording, return null or a static fallback (logic handled by parent usually)
    // But here we might want to just show the canvas cleared
    return <canvas ref={canvasRef} width={24} height={24} className="pointer-events-none" />;
};
