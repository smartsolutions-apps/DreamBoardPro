import React from 'react';
import { X, Download, ExternalLink } from 'lucide-react';
import { AssetVersion } from '../types';

interface MediaPreviewModalProps {
    asset: AssetVersion | null;
    onClose: () => void;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({ asset, onClose }) => {
    if (!asset) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
            onClick={handleBackdropClick}
        >
            <div className="relative w-full max-w-6xl max-h-[90vh] flex flex-col items-center">

                {/* Header Controls */}
                <div className="absolute top-0 right-0 z-10 flex gap-2 p-4">
                    <a
                        href={asset.url}
                        download={`asset-${asset.id}.${asset.type === 'video' ? 'mp4' : asset.type === 'audio' ? 'mp3' : 'png'}`}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-sm transition-colors"
                        title="Download"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Download size={24} />
                    </a>
                    <button
                        onClick={onClose}
                        className="bg-white/10 hover:bg-red-500/80 text-white p-2 rounded-full backdrop-blur-sm transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content Viewer */}
                <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-lg shadow-2xl">
                    {asset.type === 'video' ? (
                        <video
                            src={asset.url}
                            controls
                            autoPlay
                            className="max-w-full max-h-[85vh] object-contain rounded-lg bg-black"
                        />
                    ) : asset.type === 'audio' ? (
                        <div className="bg-gray-900 p-12 rounded-2xl flex flex-col items-center gap-6 border border-gray-800 w-full max-w-md">
                            <div className="w-32 h-32 rounded-full bg-indigo-600/20 flex items-center justify-center animate-pulse">
                                <div className="w-24 h-24 rounded-full bg-indigo-600/40 flex items-center justify-center">
                                    <span className="text-4xl">🎵</span>
                                </div>
                            </div>
                            <audio src={asset.url} controls className="w-full" />
                            <div className="text-center">
                                <p className="text-gray-400 text-sm font-mono mt-2 break-all">{asset.prompt.substring(0, 100)}...</p>
                            </div>
                        </div>
                    ) : (
                        <img
                            src={asset.url}
                            alt={asset.prompt}
                            className="max-w-full max-h-[85vh] object-contain rounded-lg"
                        />
                    )}
                </div>

                {/* Caption */}
                <div className="mt-4 bg-black/50 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 max-w-2xl">
                    <p className="text-white text-sm font-medium text-center truncate px-4">
                        {asset.prompt}
                    </p>
                </div>

            </div>
        </div>
    );
};
