
export interface SceneVersion {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: number;
}

export type SceneFilter = 'none' | 'sepia' | 'grayscale' | 'contrast' | 'vivid' | 'noir' | 'warm' | 'cool';

export type SceneTransition = 'Cut' | 'Fade In' | 'Fade Out' | 'Dissolve' | 'Wipe Left' | 'Wipe Right' | 'Zoom In';

export type TextStyle = 'Standard' | 'Outline' | 'Shadow' | 'Neon' | 'Retro' | 'Glitch' | 'Cinema';

export interface AssetVersion {
  id: string; // timestamp
  type: 'illustration' | 'video' | 'audio';
  url: string; // Firebase Storage URL
  prompt: string; // The exact text used to generate
  createdAt: number;
}

export interface StoryScene {
  id: string;
  title?: string;
  prompt: string;
  imageUrl?: string;
  videoUrl?: string; // For Veo generated video
  audioUrl?: string; // For TTS narration
  referenceImage?: string;
  shotType?: ShotType;
  filter?: SceneFilter;
  transition?: SceneTransition;
  textStyle?: TextStyle;
  tags?: string[];
  isLoading: boolean;
  isUploading?: boolean;
  uploadError?: boolean;
  isVideoLoading?: boolean;
  isAudioLoading?: boolean;
  error?: string;
  versions: SceneVersion[];
  assetHistory?: AssetVersion[]; // Full chain of custody
  projectId?: string; // Link to parent project
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  thumbnailUrl?: string;
  sceneCount: number;
  scenes?: { storageUrl: string }[]; // Metadata for dashboard previews
  script?: string;
  characterSheet?: string;
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface SceneTemplate {
  id: string;
  label: string;
  prompt: string;
  icon: string;
  category: 'Composition' | 'Action' | 'Emotion' | 'Custom';
  shotType?: ShotType;
  filter?: SceneFilter;
}

export enum ImageSize {
  Size1K = '1K',
  Size2K = '2K',
  Size4K = '4K'
}

export enum AspectRatio {
  Square = '1:1',
  Cinematic = '16:9',
  Portrait = '9:16',
  Standard = '4:3',
  Wide = '2:1'
}

export enum ShotType {
  None = 'Default',
  CloseUp = 'Close-up',
  MediumShot = 'Medium Shot',
  WideShot = 'Wide Shot',
  ExtremeWideShot = 'Extreme Wide Shot',
  LowAngle = 'Low Angle',
  HighAngle = 'High Angle',
  OverTheShoulder = 'Over-the-shoulder'
}

export enum ColorMode {
  Color = 'Color',
  BlackAndWhite = 'B&W'
}

export const ART_STYLES = [
  "Pencil Sketch",
  "Ink & Line Art",
  "Minimalist Vector",
  "Watercolor",
  "Western Comic Book",
  "Anime / Manga",
  "Retro 80s",
  "Ghibli Style",
  "Oil Painting",
  "Frank Miller Style (High Contrast)",
  "Film Noir",
  "Claymation",
  "3D Animation (Pixar style)",
  "Cyberpunk",
  "Digital Concept Art",
  "Cinematic Realistic",
  "Charcoal Drawing"
] as const;

export type ArtStyle = typeof ART_STYLES[number];

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}