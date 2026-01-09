import React from 'react';
import {
    Bug,
    Terminal,
    Coffee,
    Code2,
    Database,
    Flame,
    Lock
} from 'lucide-react';

/**
 * Custom Pixel-Art "7" Icon
 * Replaces standard font number for a more retro aesthetic.
 */
export const PixelSeven: React.FC<{ size: number, className?: string }> = ({ size, className = '' }) => {
    // A chunky 8x10 pixel grid 7
    // Grid unit = 10%
    // Uses fill="currentColor" to inherit text color (e.g. text-neon-green)
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 80 100"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ filter: 'drop-shadow(0 0 5px rgba(57, 255, 20, 0.5))' }}
        >
            {/* Top Bar (4 blocks wide: 0, 20, 40, 60) */}
            <rect x="0" y="0" width="20" height="20" />
            <rect x="20" y="0" width="20" height="20" />
            <rect x="40" y="0" width="20" height="20" />
            <rect x="60" y="0" width="20" height="20" />

            {/* Down Stroke (Diagonal-ish via blocks) */}
            <rect x="60" y="20" width="20" height="20" />
            <rect x="40" y="40" width="20" height="20" />
            <rect x="20" y="60" width="20" height="20" />
            <rect x="20" y="80" width="20" height="20" />

            {/* Optional: Add a subtle inner detail/highlight opacity */}
            <rect x="5" y="5" width="10" height="10" fill="white" fillOpacity="0.2" pointerEvents="none" />
            <rect x="25" y="5" width="10" height="10" fill="white" fillOpacity="0.2" pointerEvents="none" />
            <rect x="45" y="5" width="10" height="10" fill="white" fillOpacity="0.2" pointerEvents="none" />
            <rect x="65" y="5" width="10" height="10" fill="white" fillOpacity="0.2" pointerEvents="none" />
        </svg>
    );
};

// Re-export Lucide icons for unified consumption
export {
    Bug,
    Terminal,
    Coffee,
    Code2,
    Database,
    Flame,
    Lock
};
