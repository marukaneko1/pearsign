"use client";

import { useRef, useCallback, useEffect } from "react";

interface UsePinchZoomOptions {
  minScale?: number;
  maxScale?: number;
  onZoomChange: (scale: number) => void;
  currentScale: number;
}

interface TouchPoint {
  x: number;
  y: number;
}

function getDistance(touch1: TouchPoint, touch2: TouchPoint): number {
  const dx = touch1.x - touch2.x;
  const dy = touch1.y - touch2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getMidpoint(touch1: TouchPoint, touch2: TouchPoint): TouchPoint {
  return {
    x: (touch1.x + touch2.x) / 2,
    y: (touch1.y + touch2.y) / 2,
  };
}

export function usePinchZoom({
  minScale = 0.5,
  maxScale = 3,
  onZoomChange,
  currentScale,
}: UsePinchZoomOptions) {
  const initialDistanceRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(currentScale);
  const isPinchingRef = useRef(false);
  const lastTapTimeRef = useRef<number>(0);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch gesture started
        isPinchingRef.current = true;
        initialScaleRef.current = currentScale;

        const touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        initialDistanceRef.current = getDistance(touch1, touch2);

        // Prevent default to stop page scrolling during pinch
        e.preventDefault();
      } else if (e.touches.length === 1) {
        // Check for double tap to reset zoom
        const now = Date.now();
        const timeSinceLastTap = now - lastTapTimeRef.current;

        if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
          // Double tap detected - reset to 1x or zoom to 2x
          if (currentScale === 1) {
            onZoomChange(2);
          } else {
            onZoomChange(1);
          }
          e.preventDefault();
        }

        lastTapTimeRef.current = now;
      }
    },
    [currentScale, onZoomChange]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && initialDistanceRef.current !== null && isPinchingRef.current) {
        const touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        const currentDistance = getDistance(touch1, touch2);

        // Calculate zoom factor based on pinch distance change
        const scaleFactor = currentDistance / initialDistanceRef.current;
        let newScale = initialScaleRef.current * scaleFactor;

        // Clamp to min/max bounds
        newScale = Math.max(minScale, Math.min(maxScale, newScale));

        onZoomChange(newScale);

        // Prevent default to stop page scrolling during pinch
        e.preventDefault();
      }
    },
    [minScale, maxScale, onZoomChange]
  );

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      // Pinch gesture ended
      initialDistanceRef.current = null;
      isPinchingRef.current = false;
    }
  }, []);

  // Return touch event handlers and utility functions
  return {
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    isPinching: isPinchingRef.current,
  };
}

// CSS helper for touch-action
export const pinchZoomStyles = {
  touchAction: "none" as const, // Disable browser's built-in touch gestures
  WebkitUserSelect: "none" as const,
  userSelect: "none" as const,
};
