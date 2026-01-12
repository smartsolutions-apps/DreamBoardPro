import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ImageSize, AspectRatio, ColorMode, ArtStyle } from "../types";
import { urlToBase64 } from "./firebase";

const getAiClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  console.log("Gemini Key Present:", !!apiKey);
  return new GoogleGenAI({ apiKey });
};

const TEXT_MODEL = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-3-pro-image-preview";
const CHAT_MODEL = "gemini-3-pro-preview";
const ANALYSIS_MODEL = "gemini-3-pro-preview";
const VIDEO_MODEL = "veo-3.1-fast-generate-preview";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

// Helper to convert raw PCM (16-bit, 24kHz, Mono) to WAV for playback
function pcmToWav(pcmBase64: string, sampleRate: number = 24000) {
  const binaryString = atob(pcmBase64);
  const len = binaryString.length;
  const buffer = new ArrayBuffer(44 + len);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + len, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sampleRate * blockAlign)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, len, true);

  // data
  const bytes = new Uint8Array(buffer, 44);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Convert back to base64
  let binary = '';
  const bytesAll = new Uint8Array(buffer);
  const lenAll = bytesAll.byteLength;
  for (let i = 0; i < lenAll; i++) {
    binary += String.fromCharCode(bytesAll[i]);
  }
  return btoa(binary);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export const analyzeScript = async (script: string, sceneCount: number = 5): Promise<string[]> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `Read the following story script and break it down into EXACTLY ${sceneCount} distinct, visually descriptive scenes suitable for a storyboard. 
      Return ONLY a JSON array of strings, where each string is the visual description.
      
      Script:
      "${script}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");

    return JSON.parse(jsonText) as string[];
  } catch (error) {
    console.error("Error analyzing script:", error);
    throw new Error("Failed to analyze the story. Please try again!");
  }
};

const cleanPromptText = (text: string): string => {
  if (!text) return "";

  // 1. Remove explicit labels like "PANEL 1:", "Scene 3 -", "Shot 5."
  let cleaned = text.replace(/^(PANEL|SCENE|SHOT|STORYBOARD|FRAME)\s*(\d+|[A-Z])?[:\-.]?\s*/i, '');

  // 2. Remove "Title:" or "Action:" prefixes
  cleaned = cleaned.replace(/^(Title|Caption|Action|Description)[:\-.]?\s*/i, '');

  // 3. Heuristic: Remove short titles at start (e.g. "The Arrival. A spaceship lands...")
  // Only if followed by a period and the prefix is short (< 50 chars)
  const firstPeriodIndex = cleaned.indexOf('.');
  if (firstPeriodIndex > -1 && firstPeriodIndex < 50) {
    const remaining = cleaned.substring(firstPeriodIndex + 1).trim();
    // Heuristic: If remaining text is substantial, assume the first part was a title
    if (remaining.length > 10) {
      cleaned = remaining;
    }
  }

  return cleaned.trim();
};

const buildPrompt = (prompt: string, style: ArtStyle, colorMode: ColorMode) => {
  const cleanedPrompt = cleanPromptText(prompt);

  const colorInstruction = colorMode === ColorMode.BlackAndWhite
    ? "Black and white, high contrast, traditional ink storyboard style, charcoal sketch, monochrome, no color."
    : "Full color, vibrant, professional lighting.";

  return `Create a storyboard image. Style: ${style}. Mode: ${colorInstruction}. Subject: ${cleanedPrompt}. Ensure high quality, detailed composition. Do not render text, titles, or UI elements.`;
};

export const generateSceneImage = async (
  prompt: string,
  size: ImageSize,
  aspectRatio: AspectRatio,
  style: ArtStyle,
  colorMode: ColorMode,
  referenceImage?: string,
  styleReferenceImage?: string
): Promise<string> => {
  try {
    const ai = getAiClient();
    const fullPrompt = buildPrompt(prompt, style, colorMode);

    const parts: any[] = [];

    if (referenceImage) {
      const base64Data = referenceImage.split(',')[1] || referenceImage;
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64Data
        }
      });
      parts.push({ text: `Use the FIRST attached image as a composition reference/sketch. ${fullPrompt}` });
    }

    if (styleReferenceImage) {
      const base64Data = styleReferenceImage.split(',')[1] || styleReferenceImage;
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64Data
        }
      });
      parts.push({ text: `Use the attached image as a STYLE reference. Copy the artistic style, color palette, and rendering technique of this image exactly.` });
    }

    if (!referenceImage && !styleReferenceImage) {
      parts.push({ text: fullPrompt });
    } else if (!referenceImage && styleReferenceImage) {
      parts.push({ text: fullPrompt });
    }

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { parts },
      config: {
        imageConfig: {
          imageSize: size,
          aspectRatio: aspectRatio === AspectRatio.Wide ? '16:9' : aspectRatio
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image generated");
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

export const refineSceneImage = async (
  originalImage: string,
  instruction: string,
  size: ImageSize,
  aspectRatio: AspectRatio,
  style: ArtStyle,
  colorMode: ColorMode
): Promise<string> => {
  try {
    const ai = getAiClient();
    const base64Data = originalImage.split(',')[1] || originalImage;
    // We don't clean instruction here usually as it's a command, but we enforce style/mode
    const fullPrompt = `Edit this image: ${instruction}. Maintain the following style: ${style}, ${colorMode === ColorMode.BlackAndWhite ? 'Black & White' : 'Color'}. Keep composition similar. Do not add text.`;

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          },
          { text: fullPrompt }
        ]
      },
      config: {
        imageConfig: {
          imageSize: size,
          aspectRatio: aspectRatio === AspectRatio.Wide ? '16:9' : aspectRatio
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Error refining image:", error);
    throw error;
  }
};

export const upscaleImage = async (
  originalImage: string,
  aspectRatio: AspectRatio
): Promise<string> => {
  try {
    const ai = getAiClient();
    const base64Data = originalImage.split(',')[1] || originalImage;

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          },
          { text: "Upscale this image. High resolution, 4K, sharpen details, enhance lighting, professional masterpiece. Maintain exact composition. Do not add text." }
        ]
      },
      config: {
        imageConfig: {
          imageSize: ImageSize.Size4K,
          aspectRatio: aspectRatio === AspectRatio.Wide ? '16:9' : aspectRatio
        }
      }
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

    if (imagePart && imagePart.inlineData) {
      return `data:image/png;base64,${imagePart.inlineData.data}`;
    }

    // Check for refusal/text
    const textPart = response.candidates?.[0]?.content?.parts?.find(p => p.text);
    if (textPart && textPart.text) {
      console.warn("Upscale Model Refusal/Response:", textPart.text);
      throw new Error(`Upscale failed: Model returned text instead of image (${textPart.text.substring(0, 50)}...)`);
    }

    throw new Error("Upscale failed: No image returned");
  } catch (error) {
    console.error("Error upscaling:", error);
    throw error;
  }
};

export interface ContinuityIssue {
  sceneIndex: number;
  issue: string;
  suggestion: string;
}

export const checkContinuity = async (scenes: { title: string, prompt: string, imageUrl?: string }[]): Promise<ContinuityIssue[]> => {
  try {
    const ai = getAiClient();

    const parts: any[] = [];
    parts.push({
      text: `Analyze the following sequence of storyboard scenes for VISUAL and NARRATIVE continuity.
    Check specifically for:
    1. Visual Consistency: Do characters look the same (clothes, hair) across shots? Is the lighting consistent?
    2. Narrative Logic: Do the shots follow a logical sequence? Are object positions consistent?
    
    IMPORTANT: Return the result as a JSON array of objects.
    Each object must have:
    - sceneIndex: The 0-based index of the scene having the issue.
    - issue: A short description of the problem.
    - suggestion: A specific instruction to fix the prompt (e.g., "Add 'wearing red scarf' to the prompt").
    
    If a scene is fine, do not include it in the array.
    `});

    scenes.forEach((s, i) => {
      parts.push({ text: `\n--- SCENE ${i} (Index ${i}): ${s.title} ---\nDescription: ${s.prompt}\n` });
      if (s.imageUrl) {
        const base64Data = s.imageUrl.split(',')[1] || s.imageUrl;
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: base64Data
          }
        });
      } else {
        parts.push({ text: "[Image not yet generated]" });
      }
    });

    const response = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sceneIndex: { type: Type.INTEGER },
              issue: { type: Type.STRING },
              suggestion: { type: Type.STRING }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text) as ContinuityIssue[];
  } catch (error) {
    console.error("Continuity check failed", error);
    return [];
  }
};

export const generateSceneVideo = async (imageUrl: string, prompt: string, aspectRatio?: AspectRatio): Promise<string> => {
  // Check/Request Key for Veo if needed (fallback for non-env setup)
  if (typeof window !== 'undefined' && (window as any).aistudio) {
    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await (window as any).aistudio.openSelectKey();
    }
  }

  try {
    const ai = getAiClient();

    let base64Data = "";

    // CRITICAL FIX: Convert URL to Base64 if needed (CORS fix)
    if (imageUrl.startsWith('http')) {
      console.log("Fetching remote image for video generation...");
      // This returns a data URI: "data:image/png;base64,..."
      const dataUri = await urlToBase64(imageUrl);
      // Strip prefix to get raw base64 string for the SDK
      base64Data = dataUri.split(',')[1];
    } else {
      base64Data = imageUrl.split(',')[1] || imageUrl;
    }

    if (!base64Data) throw new Error("Failed to process input image for video");

    const veoRatio: '9:16' | '16:9' = aspectRatio === AspectRatio.Portrait ? '9:16' : '16:9';

    console.log("Starting Video Generation...");

    let operation = await ai.models.generateVideos({
      model: VIDEO_MODEL,
      prompt: `Cinematic camera movement. ${cleanPromptText(prompt)}`,
      image: {
        imageBytes: base64Data,
        mimeType: 'image/png',
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: veoRatio
      }
    });

    console.log("Video Operation Started:", operation);

    // Safety timeout loop (max 5 minutes)
    let attempts = 0;
    const maxAttempts = 30; // 30 * 10000ms = 300 seconds (5 minutes)

    while (!operation.done) {
      if (attempts > maxAttempts) throw new Error("Video generation timed out. Please try again.");
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
      attempts++;
    }

    console.log("Video Operation Complete:", operation);

    if (operation.error) {
      throw new Error(operation.error.message || "Unknown Video Generation Error");
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Video generation failed: No download URI returned.");

    // CRITICAL FIX: Append the correct API_KEY.
    return `${downloadLink}&key=${import.meta.env.VITE_GEMINI_API_KEY}`;
  } catch (error: any) {
    console.error("Video generation failed", error);

    if (typeof window !== 'undefined' && (window as any).aistudio) {
      if (error.message?.includes('Requested entity was not found') || error.message?.includes('404')) {
        await (window as any).aistudio.openSelectKey();
      }
    }
    throw error;
  }
};

export const generateNarration = async (text: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Pcm = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Pcm) throw new Error("No audio generated");

    // Convert raw PCM to WAV data URI for browser playback
    const base64Wav = pcmToWav(base64Pcm, 24000); // 24kHz is default for this model

    return `data:audio/wav;base64,${base64Wav}`;
  } catch (error: any) {
    console.error("TTS failed", error);
    throw error;
  }
};

export const autoTagScene = async (prompt: string, image?: string): Promise<string[]> => {
  try {
    const ai = getAiClient();
    const parts: any[] = [{ text: `Generate 3-5 short descriptive tags (single words) for this scene for organization (e.g., 'outdoor', 'action', 'sad'). Return JSON string array.` }];

    if (image) {
      const base64Data = image.split(',')[1] || image;
      parts.push({ inlineData: { mimeType: 'image/png', data: base64Data } });
    }
    parts.push({ text: `Scene description: ${prompt}` });

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text || "[]");
  } catch (e: any) {
    return [];
  }
};

export const createChatSession = () => {
  const ai = getAiClient();
  return ai.chats.create({
    model: CHAT_MODEL,
    config: {
      systemInstruction: "You are an expert storyboard artist and director assistant. Help with shot composition, camera angles, and visual storytelling.",
    }
  });
};