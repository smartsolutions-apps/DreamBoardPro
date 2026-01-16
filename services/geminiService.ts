import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ImageSize, AspectRatio, ColorMode, ArtStyle } from "../types";
import { urlToBase64 } from "./firebase";

// --- STYLE DEFINITIONS ---
export const STYLE_DEFINITIONS: Record<string, string> = {
  "Pencil Sketch": "Rough graphite textures, visible cross-hatching, sketch paper grain, loose and expressive lines, artistic shading.",
  "Ink & Line Art": "Clean crisp black ink lines, cross-hatching shading, comic book inking style, high contrast, no gradients.",
  "Minimalist Vector": "Flat colors, geometric shapes, clean lines, corporate memphis style, no textures, high vector quality.",
  "Watercolor": "Bleeding wet paint edges, soaking paper texture, soft translucent colors, artistic brush blobs, dreamy atmosphere.",
  "Western Comic Book": "Thick black ink outlines, halftone dot shading, vibrant flat coloring, Ben-Day dots, dynamic action lines, Marvel/DC aesthetic.",
  "Anime / Manga": "Cel-shaded, distinct line art, high-quality anime production, Studio Ghibli inspired, soft lighting, expressive character design.",
  "Retro 80s": "Neon grid aesthetics, synthwave colors (magenta, cyan), VHS noise grain, chrome reflections, retro-futurism.",
  "Ghibli Style": "Hand-painted backgrounds, lush greenery, soft natural lighting, gouache textures, whimsical and nostalgic atmosphere.",
  "Oil Painting": "Thick impasto brushstrokes, textured canvas visibility, visible mixing of paints, classical artistic technique, rich depth.",
  "Frank Miller Style (High Contrast)": "Extreme high contrast, pure black shadows (chiaroscuro), stark white highlights, gritty noir atmosphere, sin city aesthetic.",
  "Film Noir": "Cinematic high contrast black and white, dramatic shadows, dutch angles, foggy atmosphere, detective movie aesthetic.",
  "Claymation": "Plasticine textures, fingerprint marks on clay, stop-motion lighting style, shallow depth of field, Aardman animation style.",
  "3D Animation (Pixar style)": "Subsurface scattering, soft ambient occlusion, bright vibrant colors, appealing character proportions, RenderMan quality.",
  "Cyberpunk": "High-tech low-life, neon sign lighting, rain-slicked streets, metallic textures, holographic overlays, dark atmosphere.",
  "Digital Concept Art": "Speedpaint aesthetic, tablet brush strokes, epic scale, atmospheric perspective, ArtStation trending quality.",
  "Cinematic Realistic": "8k resolution, photorealistic textures, ray-traced lighting, anamorphic lens flares, movie set production quality.",
  "Charcoal Drawing": "Rough charcoal texture, smudged shadows, deep blacks and greys, sketch paper texture, artistic messiness.",
  "Leonardo da Vinci": "Renaissance masterpiece, sfumato technique, soft transitions, sepia tones, anatomical precision, sketch-like quality, historical parchment texture.",
  "Michelangelo": "High Renaissance style, sculptural forms, muscular anatomy, dramatic compositions, fresco texture, classical grandeur, Sistine Chapel aesthetic.",
  "Vincent van Gogh": "Post-Impressionism, thick impasto brushwork, swirling dynamic lines, vibrant contrasting colors (yellows and blues), emotional intensity, Oil on canvas.",
  "Pablo Picasso": "Cubism, fragmented geometric shapes, abstract perspective, bold outlines, surreal composition, artistic distortion, avant-garde aesthetic.",
  "Claude Monet": "Impressionism, loose brushstrokes, capture of light and atmosphere, soft pastel colors, outdoor plein air feel, water lilies aesthetic, blurry edges.",
  "Salvador Dalí": "Surrealism, dreamlike imagery, melting objects, hyper-realistic detail mixed with absurdity, vast barren landscapes, subconscious symbolism.",
  "Rembrandt": "Baroque period, strong Chiaroscuro (dramatic lighting), deep dark backgrounds, golden light on subjects, emotional depth, oil painting texture.",
  "Andy Warhol": "Pop Art, high contrast, screen print texture, bold flat colors, repetitive patterns, celebrity culture aesthetic, commercial art style.",
  "Frida Kahlo": "Naïve art style, self-portrait aesthetic, vibrant Mexican colors, symbolic imagery, nature elements, surreal and personal usage of space.",
  "Edvard Munch": "Expressionism, emotional distortion, psychological intensity, flowing lines, dark and moody colors, 'The Scream' aesthetic."
};

const BW_FORCED_STYLES = [
  "Pencil Sketch",
  "Ink & Line Art",
  "Charcoal Drawing",
  "Film Noir",
  "Frank Miller Style (High Contrast)"
];

// --- HELPER: Place this at the top level (outside other functions) ---
async function withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      // Check for Quota/Rate Limit errors
      const isQuotaError = error.message?.includes('429') ||
        error.message?.includes('Quota') ||
        error.message?.includes('RESOURCE_EXHAUSTED');

      if (isQuotaError && i < retries - 1) {
        const waitTime = (i + 1) * 5000; // 5s, 10s, 15s
        console.warn(`[Gemini] Quota hit. Retrying in ${waitTime / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // If it's a real error (or we are out of retries), fail
      throw error;
    }
  }
  throw new Error("Max retries reached");
}

const getAiClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  console.log("Gemini Key Present:", !!apiKey);
  return new GoogleGenAI({ apiKey });
};

const TEXT_MODEL = "gemini-1.5-flash";
const IMAGE_MODEL = "imagen-3.0-fast-generate-001";
const CHAT_MODEL = "gemini-1.5-flash";
const ANALYSIS_MODEL = "gemini-1.5-flash";
const VIDEO_MODEL = "veo-3.1-fast-generate-preview";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

// Helper to convert raw PCM (16-bit, 24kHz, Mono) to WAV for playback
function pcmToWav(pcmBase64: string, sampleRate: number = 24000) {
  if (!pcmBase64 || typeof pcmBase64 !== 'string') return "";
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

// Updated Interface for Analysis Result
export interface AnalysisResult {
  scenes: string[];
  characters: string;
}

export const analyzeScript = async (script: string, sceneCount: number = 5): Promise<AnalysisResult> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `Read the story script. 
      1. Extract a "Character Bible" (names, ages, specific visual details like hair, clothes).
      2. Break the script into EXACTLY ${sceneCount} distinct, visually descriptive scenes.

      Return ONLY valid JSON with this structure:
      {
        "characters": "A summary string describing main characters...",
        "scenes": ["Scene 1 description...", "Scene 2 description..."]
      }
      
      Script:
      "${script}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            characters: { type: Type.STRING },
            scenes: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");

    return JSON.parse(jsonText) as AnalysisResult;
  } catch (error) {
    console.error("Error analyzing script:", error);
    throw new Error("Failed to analyze the story. Please try again!");
  }
};

const cleanPromptText = (text: string): string => {
  if (!text || typeof text !== 'string') return "";

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

const buildPrompt = (prompt: string, style: ArtStyle, colorMode: ColorMode, masterStylePrompt?: string, characterSheet?: string) => {
  const cleanedPrompt = cleanPromptText(prompt);

  // 1. Get Rich Style Description (Prioritize Master Prompt for batch consistency)
  let styleDescription = masterStylePrompt || STYLE_DEFINITIONS[style] || style;

  // 2. Enforce Color Logic
  let colorInstruction = colorMode === ColorMode.BlackAndWhite
    ? "Black and white, high contrast, monochromatic, no color."
    : "Full color, vibrant, professional lighting.";

  // Override for specific styles (Only if using default style description)
  if (!masterStylePrompt && BW_FORCED_STYLES.includes(style)) {
    colorInstruction = "Strictly Black and White, Monochromatic, Greyscale. NO COLOR.";
  }

  // 3. Construct Prompt: [STYLE] + [COLOR] + [CHARACTERS] + [SCENE]
  // FORCE: Style must be at the very start for Gemini/Imagen effectiveness.
  const styleHeader = `
  *** ART STYLE ENFORCEMENT ***
  STYLE: ${style}
  VISUAL DESCRIPTION: ${styleDescription}
  STRICT RULE: Do NOT generate realistic photos. Do NOT generate photorealism.
  Must look like a ${style} illustration.
  `;

  return `
    ${styleHeader}
    
    COLOR PALETTE: ${colorInstruction}
    ${characterSheet ? `CHARACTERS (MAINTAIN CONSISTENCY): ${characterSheet}` : ''}
    
    SCENE ACTION: ${cleanedPrompt}
    
    Ensure high quality, detailed composition. Do not render text, titles, or UI elements.
  `.trim();
};

// --- VALIDATION HELPER ---
const isValidBase64 = (str: string) => {
  if (!str || typeof str !== 'string') return false;
  // If it starts with http, it failed conversion
  if (str.startsWith('http') || str.startsWith('blob:')) return false;
  return true;
};

export const generateSceneImage = async (
  prompt: string,
  size: ImageSize,
  aspectRatio: AspectRatio,
  style: ArtStyle,
  colorMode: ColorMode,
  referenceImage?: string,
  styleReferenceImage?: string,
  masterStylePrompt?: string,
  characterSheet?: string
): Promise<string> => {
  return withRetry(async () => {
    const ai = getAiClient();
    const fullPrompt = buildPrompt(prompt, style, colorMode, masterStylePrompt, characterSheet);

    const parts: any[] = [];

    if (referenceImage) {
      if (isValidBase64(referenceImage)) {
        const base64Data = referenceImage.split(',')[1] || referenceImage;
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: base64Data
          }
        });
        parts.push({ text: `Use the FIRST attached image as a composition reference/sketch. ${fullPrompt}` });
      } else {
        console.warn("Invalid reference image passed to generate (likely URL/Failed fetch). Ignoring ref.");
        // Still generate, just without ref
      }
    }

    if (styleReferenceImage) {
      if (isValidBase64(styleReferenceImage)) {
        const base64Data = styleReferenceImage.split(',')[1] || styleReferenceImage;
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: base64Data
          }
        });
        parts.push({ text: `Use the attached image as a STYLE reference. Copy the artistic style, color palette, and rendering technique of this image exactly.` });
      } else {
        console.warn("Invalid style reference image passed. Ignoring.");
      }
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
  });
};

export const refineSceneImage = async (
  originalImage: string,
  instruction: string,
  size: ImageSize,
  aspectRatio: AspectRatio,
  style: ArtStyle,
  colorMode: ColorMode,
  strength: number = 50
): Promise<string> => {
  return withRetry(async () => {
    const ai = getAiClient();

    // GUARD: Ensure we have a string
    if (!originalImage || typeof originalImage !== 'string') {
      throw new Error("Invalid image source for refinement.");
    }

    // GUARD: Ensure valid base64 (not a URL)
    if (!isValidBase64(originalImage)) {
      throw new Error("Cannot refine image: Source is a URL or invalid. Please refresh or retry.");
    }

    const base64Data = originalImage.split(',')[1] || originalImage;

    // Dynamic Prompting based on Strength
    let strengthPrompt = "";
    if (strength > 60) {
      strengthPrompt = "Based on the input image, but you must SIGNIFICANTLY REDRAW the composition to match the new request. Do not be constrained by the original positions or sizes. Be creative and transformative.";
    } else {
      strengthPrompt = "Modify the image to match the instruction, but MAINTAIN the original composition, pose, and structure as much as possible. Keep it subtle.";
    }

    const fullPrompt = `IMPORTANT: ${strengthPrompt} INSTRUCTION: ${instruction}. Style: ${style}, ${colorMode === ColorMode.BlackAndWhite ? 'Black & White' : 'Color'}. Do not add text.`;

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
  });
};


export const upscaleImage = async (
  originalImage: string,
  aspectRatio: AspectRatio
): Promise<string> => {
  try {
    const ai = getAiClient();

    // GUARD: Ensure we have a string
    if (!originalImage || typeof originalImage !== 'string') {
      throw new Error("Invalid image source for upscale.");
    }

    // GUARD: Ensure valid base64
    if (!isValidBase64(originalImage)) {
      throw new Error("Cannot upscale image: Source is a URL. Please ensure image is fully loaded.");
    }

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
      if (s.imageUrl && isValidBase64(s.imageUrl)) {
        const base64Data = s.imageUrl.split(',')[1] || s.imageUrl;
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: base64Data
          }
        });
      } else {
        parts.push({ text: "[Image not yet generated or invalid]" });
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
    return await withRetry(async () => {
      const ai = getAiClient();
      let base64Data = "";

      // GUARD: Ensure we have a string
      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error("Invalid image input for video generation.");
      }

      // CRITICAL FIX: Convert URL to Base64 if needed (CORS fix)
      if (imageUrl.startsWith('http')) {
        console.log("Fetching remote image for video generation...");
        // Note: usage of urlToBase64 here relies on the import from firebase.ts
        const dataUri = await urlToBase64(imageUrl);

        // If conversion fails, urlToBase64 returns the original URL. Check again:
        if (dataUri.startsWith('http')) {
          throw new Error("Failed to fetch/convert image for video. Please ensure image is accessible.");
        }

        base64Data = dataUri.split(',')[1];
      } else {
        // Must be base64
        base64Data = imageUrl.split(',')[1] || imageUrl;
      }

      if (!base64Data) throw new Error("Failed to process input image for video");

      const veoRatio: '9:16' | '16:9' = aspectRatio === AspectRatio.Portrait ? '9:16' : '16:9';

      console.log("Starting Video Generation (Attempt)...");

      let operation = await ai.models.generateVideos({
        model: VIDEO_MODEL,
        prompt: `Cinematic camera movement. Simple animation, efficient style. ${cleanPromptText(prompt)}.
        LIP SYNC INSTRUCTION: If the character is speaking in the script, they must have clear lip movement. If they are just listening or observing, keep mouth closed.
        Make the animation smooth and realistic.`,
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

      // Polling Loop inside retry
      let attempts = 0;
      const maxAttempts = 30;

      while (!operation.done) {
        if (attempts > maxAttempts) throw new Error("Video generation timed out.");
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
        attempts++;
      }

      if (operation.error) throw new Error(operation.error.message || "Unknown Video Generation Error");

      const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!uri) throw new Error("No video URI returned");

      return `${uri}&key=${import.meta.env.VITE_GEMINI_API_KEY}`;
    });

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

    if (image && isValidBase64(image)) {
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