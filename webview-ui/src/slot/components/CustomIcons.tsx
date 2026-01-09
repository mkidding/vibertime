import React from 'react';

export const LuckySeven: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ shapeRendering: 'crispEdges' }} 
  >
    <path 
      d="M4 4H20V8H18V6H6V18L10 10H14L8 22H4L10 10H8L4 18V4Z" 
      fill="currentColor" 
      stroke="currentColor" 
      strokeWidth="1.5"
    />
    <rect x="5" y="5" width="14" height="2" fill="currentColor" />
  </svg>
);