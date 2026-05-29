// frontend/src/components/tasks/BrowserPreview.tsx

'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '@/providers/SocketProvider';
import { useAuth } from '@/hooks/useAuth';
import {
  Play,
  Pause,
  X,
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react';

interface BrowserPreviewProps {
  sessionId?: string;
  onClose?: () => void;
}

export function BrowserPreview({ sessionId, onClose }: BrowserPreviewProps) {
  const { user } = useAuth();
  const { latestFrame, pauseSession, resumeSession, cancelSession, joinSession, leaveSession } =
    useSocket();

  useEffect(() => {
    if (!sessionId || !user?.id) return;
    joinSession(sessionId, user.id);
    return () => leaveSession(sessionId);
  }, [sessionId, user?.id, joinSession, leaveSession]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fps, setFps] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsCounterRef = useRef({ lastTime: Date.now(), frameCount: 0 });

  useEffect(() => {
    if (!latestFrame || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Decode base64 image
    const img = new Image();
    img.onload = () => {
      canvas.width = latestFrame.width;
      canvas.height = latestFrame.height;
      ctx.drawImage(img, 0, 0);

      // Draw cursor if available
      if (latestFrame.cursorPosition) {
        ctx.beginPath();
        ctx.arc(latestFrame.cursorPosition.x, latestFrame.cursorPosition.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 107, 107, 0.2)';
        ctx.fill();
      }

      // Update frame count
      setFrameCount((prev) => prev + 1);

      // Calculate FPS
      const now = Date.now();
      fpsCounterRef.current.frameCount++;
      if (now - fpsCounterRef.current.lastTime >= 1000) {
        setFps(fpsCounterRef.current.frameCount);
        fpsCounterRef.current = { lastTime: now, frameCount: 0 };
      }
    };
    img.src = `data:image/jpeg;base64,${latestFrame.base64}`;
  }, [latestFrame]);

  const handlePlayPause = () => {
    if (sessionId) {
      if (isPlaying) {
        pauseSession(sessionId);
      } else {
        resumeSession(sessionId);
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleStop = () => {
    if (sessionId) {
      cancelSession(sessionId);
      onClose?.();
    }
  };

  const toggleFullscreen = async () => {
    const container = document.getElementById('browser-preview-container');
    if (!container) return;

    if (!isFullscreen) {
      try {
        await container.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.error('Fullscreen request failed:', err);
      }
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div
      id="browser-preview-container"
      className="flex flex-col bg-white border rounded-lg overflow-hidden shadow-lg"
    >
      {/* Chrome-like header */}
      <div className="bg-gray-100 border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <button className="p-1 hover:bg-gray-200 rounded" title="Back">
            <X className="w-4 h-4" />
          </button>
          <div className="flex-1 bg-white border rounded px-3 py-1 text-sm truncate">
            {latestFrame?.width}x{latestFrame?.height}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayPause}
            className="p-1 hover:bg-gray-200 rounded"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            onClick={handleStop}
            className="p-1 hover:bg-red-100 rounded text-red-600"
            title="Stop"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded font-mono">
            {fps} FPS
          </div>

          <div className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded font-mono">
            {frameCount} frames
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-1 hover:bg-gray-200 rounded"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 bg-black flex items-center justify-center overflow-auto">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full"
          onKeyDown={(e) => {
            if (e.code === 'Space') {
              e.preventDefault();
              handlePlayPause();
            } else if (e.code === 'Escape') {
              e.preventDefault();
              toggleFullscreen();
            }
          }}
          tabIndex={0}
        />
      </div>

      {/* Status */}
      <div className="bg-gray-50 border-t px-4 py-2 text-xs text-gray-600 flex justify-between">
        <span>Step: {latestFrame?.stepIndex ?? 'N/A'}</span>
        <span>{new Date(latestFrame?.timestamp || Date.now()).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
