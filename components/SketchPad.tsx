import React, { useRef, useState, useEffect } from 'react';
import { Eraser, Pen, RotateCcw, Check, X } from 'lucide-react';

interface SketchPadProps {
  onSave: (base64Image: string) => void;
  onCancel: () => void;
  initialImage?: string;
}

export const SketchPad: React.FC<SketchPadProps> = ({ onSave, onCancel, initialImage }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [brushSize, setBrushSize] = useState(3);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set resolution (handle high DPI screens)
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (initialImage) {
      const img = new Image();
      img.src = initialImage;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
    }
  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.beginPath(); // Reset path
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;

    if ('touches' in e) {
       x = e.touches[0].clientX - rect.left;
       y = e.touches[0].clientY - rect.top;
    } else {
       x = (e as React.MouseEvent).clientX - rect.left;
       y = (e as React.MouseEvent).clientY - rect.top;
    }

    ctx.lineWidth = brushSize;
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : '#000000';
    
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
    }
  };

  const handleSave = () => {
    if (canvasRef.current) {
        const dataUrl = canvasRef.current.toDataURL('image/png');
        onSave(dataUrl);
    }
  };

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between bg-gray-100 p-2 rounded-lg">
         <div className="flex gap-2">
            <button 
              onClick={() => setTool('pen')}
              className={`p-2 rounded-md ${tool === 'pen' ? 'bg-white text-brand-600 shadow' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              <Pen size={18} />
            </button>
            <button 
              onClick={() => setTool('eraser')}
              className={`p-2 rounded-md ${tool === 'eraser' ? 'bg-white text-brand-600 shadow' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              <Eraser size={18} />
            </button>
            <div className="w-px h-6 bg-gray-300 mx-1 self-center"></div>
             <input 
              type="range" 
              min="1" 
              max="20" 
              value={brushSize} 
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-20 accent-brand-500"
            />
         </div>
         <button onClick={clearCanvas} className="text-gray-500 hover:text-red-500 p-2" title="Clear">
            <RotateCcw size={18} />
         </button>
      </div>
      
      <div className="flex-1 relative border border-gray-300 bg-white rounded-lg overflow-hidden touch-none">
         <canvas
           ref={canvasRef}
           className="w-full h-full cursor-crosshair"
           onMouseDown={startDrawing}
           onMouseUp={stopDrawing}
           onMouseMove={draw}
           onMouseLeave={stopDrawing}
           onTouchStart={startDrawing}
           onTouchEnd={stopDrawing}
           onTouchMove={draw}
         />
      </div>

      <div className="flex gap-2">
         <button onClick={onCancel} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1">
            <X size={14} /> Cancel
         </button>
         <button onClick={handleSave} className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1">
            <Check size={14} /> Use Sketch
         </button>
      </div>
    </div>
  );
};