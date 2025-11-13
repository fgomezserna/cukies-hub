"use client";

import React, { useRef, useEffect, useCallback } from 'react';
import type { Vector2D } from '@/types/game';

interface VirtualDPadProps {
  x: number;
  y: number;
  size: number;
  onDirectionChange: (direction: Vector2D) => void;
  onRelease: () => void;
  visible: boolean;
}

interface DirectionButton {
  id: string;
  direction: Vector2D;
  label: string;
  position: { x: number; y: number };
  angle: number;
}

const VirtualDPad: React.FC<VirtualDPadProps> = ({
  x,
  y,
  size,
  onDirectionChange,
  onRelease,
  visible,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeDirectionRef = useRef<Vector2D | null>(null);

  // 8 directions: up, down, left, right, and 4 diagonals
  const directions: DirectionButton[] = [
    { id: 'up', direction: { x: 0, y: -1 }, label: '↑', position: { x: 0, y: -1 }, angle: -90 },
    { id: 'down', direction: { x: 0, y: 1 }, label: '↓', position: { x: 0, y: 1 }, angle: 90 },
    { id: 'left', direction: { x: -1, y: 0 }, label: '←', position: { x: -1, y: 0 }, angle: 180 },
    { id: 'right', direction: { x: 1, y: 0 }, label: '→', position: { x: 1, y: 0 }, angle: 0 },
    { id: 'north-east', direction: { x: 1 / Math.sqrt(2), y: -1 / Math.sqrt(2) }, label: '↗', position: { x: 1, y: -1 }, angle: -45 },
    { id: 'north-west', direction: { x: -1 / Math.sqrt(2), y: -1 / Math.sqrt(2) }, label: '↖', position: { x: -1, y: -1 }, angle: -135 },
    { id: 'south-east', direction: { x: 1 / Math.sqrt(2), y: 1 / Math.sqrt(2) }, label: '↘', position: { x: 1, y: 1 }, angle: 45 },
    { id: 'south-west', direction: { x: -1 / Math.sqrt(2), y: 1 / Math.sqrt(2) }, label: '↙', position: { x: -1, y: 1 }, angle: 135 },
  ];

  const buttonSize = size * 0.25;
  const centerRadius = size * 0.15;
  const buttonDistance = size * 0.35;

  const getButtonPosition = (pos: { x: number; y: number }): { left: string; top: string } => {
    const left = 50 + (pos.x * buttonDistance * 100) / size;
    const top = 50 + (pos.y * buttonDistance * 100) / size;
    return {
      left: `${left}%`,
      top: `${top}%`,
    };
  };

  const calculateDirectionFromPosition = useCallback((touchX: number, touchY: number, rect: DOMRect): Vector2D => {
    // Calculate distance from center
    const distanceFromCenter = Math.sqrt(touchX * touchX + touchY * touchY);
    
    // If touch is near center, return neutral direction
    if (distanceFromCenter < centerRadius * 1.5) {
      return { x: 0, y: 0 };
    }

    // Calculate angle from center (in degrees)
    const angle = Math.atan2(touchY, touchX) * (180 / Math.PI);
    
    // Normalize angle to 0-360
    const normalizedAngle = angle < 0 ? angle + 360 : angle;

    // Determine direction based on angle (8 directions)
    // Each direction covers 45 degrees (360/8 = 45)
    let direction: Vector2D;
    
    if (normalizedAngle >= 337.5 || normalizedAngle < 22.5) {
      // Right (0°)
      direction = { x: 1, y: 0 };
    } else if (normalizedAngle >= 22.5 && normalizedAngle < 67.5) {
      // South-East (45°)
      direction = { x: 1 / Math.sqrt(2), y: 1 / Math.sqrt(2) };
    } else if (normalizedAngle >= 67.5 && normalizedAngle < 112.5) {
      // Down (90°)
      direction = { x: 0, y: 1 };
    } else if (normalizedAngle >= 112.5 && normalizedAngle < 157.5) {
      // South-West (135°)
      direction = { x: -1 / Math.sqrt(2), y: 1 / Math.sqrt(2) };
    } else if (normalizedAngle >= 157.5 && normalizedAngle < 202.5) {
      // Left (180°)
      direction = { x: -1, y: 0 };
    } else if (normalizedAngle >= 202.5 && normalizedAngle < 247.5) {
      // North-West (225°)
      direction = { x: -1 / Math.sqrt(2), y: -1 / Math.sqrt(2) };
    } else if (normalizedAngle >= 247.5 && normalizedAngle < 292.5) {
      // Up (270°)
      direction = { x: 0, y: -1 };
    } else {
      // North-East (315°)
      direction = { x: 1 / Math.sqrt(2), y: -1 / Math.sqrt(2) };
    }

    return direction;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const touch = e.touches[0];
    if (!touch) return;

    const touchX = touch.clientX - centerX;
    const touchY = touch.clientY - centerY;

    const direction = calculateDirectionFromPosition(touchX, touchY, rect);
    activeDirectionRef.current = direction;
    onDirectionChange(direction);
  }, [calculateDirectionFromPosition, onDirectionChange]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const touch = e.touches[0];
    if (!touch) return;

    const touchX = touch.clientX - centerX;
    const touchY = touch.clientY - centerY;

    const direction = calculateDirectionFromPosition(touchX, touchY, rect);
    
    // Only update if direction changed
    if (!activeDirectionRef.current || 
        activeDirectionRef.current.x !== direction.x || 
        activeDirectionRef.current.y !== direction.y) {
      activeDirectionRef.current = direction;
      onDirectionChange(direction);
    }
  }, [calculateDirectionFromPosition, onDirectionChange]);

  const handleButtonTouchStart = useCallback((e: React.TouchEvent, direction: Vector2D) => {
    e.preventDefault();
    e.stopPropagation();
    activeDirectionRef.current = direction;
    onDirectionChange(direction);
  }, [onDirectionChange]);

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    activeDirectionRef.current = null;
    onRelease();
  };

  const handleTouchCancel = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    activeDirectionRef.current = null;
    onRelease();
  };

  // Prevent context menu on long press
  useEffect(() => {
    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };

    if (containerRef.current) {
      containerRef.current.addEventListener('contextmenu', handleContextMenu);
      return () => {
        containerRef.current?.removeEventListener('contextmenu', handleContextMenu);
      };
    }
  }, []);

  // When D-pad becomes visible, capture any active touches
  useEffect(() => {
    if (!visible || !containerRef.current) return;

    const processTouch = (touch: Touch) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const touchX = touch.clientX - centerX;
      const touchY = touch.clientY - centerY;

      // Check if touch is within D-pad bounds
      const distanceFromCenter = Math.sqrt(touchX * touchX + touchY * touchY);
      if (distanceFromCenter < size / 2) {
        const direction = calculateDirectionFromPosition(touchX, touchY, rect);
        if (!activeDirectionRef.current || 
            activeDirectionRef.current.x !== direction.x || 
            activeDirectionRef.current.y !== direction.y) {
          activeDirectionRef.current = direction;
          onDirectionChange(direction);
        }
      }
    };

    const handleGlobalTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        processTouch(e.touches[0]);
      }
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        processTouch(e.touches[0]);
      }
    };

    // Small delay to ensure D-pad is rendered, then add global listeners
    const timer = setTimeout(() => {
      document.addEventListener('touchstart', handleGlobalTouchStart, { passive: false });
      document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('touchstart', handleGlobalTouchStart);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
    };
  }, [visible, size, calculateDirectionFromPosition, onDirectionChange]);

  if (!visible) return null;

  // Ensure D-pad is always on top when visible
  return (
    <div
      ref={containerRef}
      className="virtual-dpad"
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        width: `${size}px`,
        height: `${size}px`,
        transform: 'translate(-50%, -50%)',
        zIndex: 9999, // Very high z-index to ensure it's above everything
        pointerEvents: 'auto',
        touchAction: 'none',
        isolation: 'isolate', // Create new stacking context
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Center circle */}
      <div
        className="virtual-dpad__center"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: `${centerRadius * 2}px`,
          height: `${centerRadius * 2}px`,
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          pointerEvents: 'none',
        }}
      />

      {/* Direction buttons */}
      {directions.map((dir) => {
        const isActive =
          activeDirectionRef.current &&
          activeDirectionRef.current.x === dir.direction.x &&
          activeDirectionRef.current.y === dir.direction.y;
        const buttonPos = getButtonPosition(dir.position);

        return (
          <div
            key={dir.id}
            className={`virtual-dpad__button ${isActive ? 'virtual-dpad__button--active' : ''}`}
            style={{
              position: 'absolute',
              left: buttonPos.left,
              top: buttonPos.top,
              width: `${buttonSize}px`,
              height: `${buttonSize}px`,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              backgroundColor: isActive
                ? 'rgba(59, 130, 246, 0.6)'
                : 'rgba(255, 255, 255, 0.15)',
              border: `2px solid ${isActive ? 'rgba(59, 130, 246, 0.9)' : 'rgba(255, 255, 255, 0.4)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: `${buttonSize * 0.5}px`,
              color: isActive ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.7)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              transition: 'all 0.1s ease',
              boxShadow: isActive
                ? '0 0 15px rgba(59, 130, 246, 0.6)'
                : '0 2px 8px rgba(0, 0, 0, 0.3)',
              transform: isActive
                ? 'translate(-50%, -50%) scale(1.15)'
                : 'translate(-50%, -50%)',
            }}
            onTouchStart={(e) => handleButtonTouchStart(e, dir.direction)}
          >
            {dir.label}
          </div>
        );
      })}
    </div>
  );
};

export default VirtualDPad;

