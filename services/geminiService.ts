import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ImageSize, AspectRatio, ColorMode, ArtStyle } from "../types";

const getAiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const TEXT_MODEL = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-3-pro-image-preview";
const CHAT_MODEL = "gemini-3-pro-preview";
const ANALYSIS_MODEL = "gemini-3-pro-preview"; 
const VIDEO_MODEL = "veo-3.1-fast-generate-preview";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

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

const buildPrompt = (prompt: string, style: ArtStyle, colorMode: ColorMode) => {
  const colorInstruction = colorMode === ColorMode.BlackAndWhite 
    ? "Black and white, high contrast, traditional ink storyboard style, charcoal sketch, monochrome, no color."
    : "Full color, vibrant, professional lighting.";
  
  return `Create a storyboard image. Style: ${style}. Mode: ${colorInstruction}. Subject: ${prompt}. ensure high quality, detailed composition.`;
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
    const fullPrompt = `Edit this image: ${instruction}. Maintain the following style: ${style}, ${colorMode === ColorMode.BlackAndWhite ? 'Black & White' : 'Color'}. Keep composition similar.`;

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
          { text: "High resolution, 4K, sharpen details, enhance lighting, professional masterpiece. Maintain exact composition." }
        ]
      },
      config: {
        imageConfig: {
          imageSize: ImageSize.Size4K,
          aspectRatio: aspectRatio === AspectRatio.Wide ? '16:9' : aspectRatio
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("Upscale failed");
  } catch (error) {
    console.error("Error upscaling:", error);
    throw error;
  }
};

export const checkContinuity = async (scenes: { title: string, prompt: string, imageUrl?: string }[]): Promise<string> => {
  try {
    const ai = getAiClient();
    
    const parts: any[] = [];
    parts.push({ text: `Analyze the following sequence of storyboard scenes for VISUAL and NARRATIVE continuity.
    Check specifically for:
    1. Visual Consistency: Do characters look the same (clothes, hair) across shots? Is the lighting consistent?
    2. Narrative Logic: Do the shots follow a logical sequence? Are object positions consistent?
    If images are provided, analyze the pixels. If only text is provided, analyze the descriptions.
    Output Format:
    - Issue 1: [Description] -> [Suggestion]
    If everything looks good, simply say "Continuity looks good!".
    `});

    scenes.forEach((s, i) => {
      parts.push({ text: `\n--- SCENE ${i + 1}: ${s.title} ---\nDescription: ${s.prompt}\n` });
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
    });
    
    return response.text || "No analysis available.";
  } catch (error) {
    console.error("Continuity check failed", error);
    return "Failed to check continuity. Please ensure you have generated images first for best results.";
  }
};

export const generateSceneVideo = async (imageUrl: string, prompt: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const base64Data = imageUrl.split(',')[1] || imageUrl;

    let operation = await ai.models.generateVideos({
      model: VIDEO_MODEL,
      prompt: `Cinematic camera movement. ${prompt}`,
      image: {
        imageBytes: base64Data,
        mimeType: 'image/png',
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9' // VEO preview often defaults to this or requires specific ratios
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({operation: operation});
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Video generation failed");
    
    // In a real app, we would fetch this blob with the key. For this demo, we'll return the URI.
    // The main app must append the key when setting src.
    return `${downloadLink}&key=${process.env.API_KEY}`;
  } catch (error) {
    console.error("Video generation failed", error);
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

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated");
    
    return `data:audio/mp3;base64,${base64Audio}`;
  } catch (error) {
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
       parts.push({ inlineData: { mimeType: 'image/png', data: base64Data }});
    }
    parts.push({ text: `Scene description: ${prompt}` });

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text || "[]");
  } catch (e) {
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
