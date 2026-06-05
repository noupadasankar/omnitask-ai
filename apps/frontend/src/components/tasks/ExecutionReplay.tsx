// frontend/src/components/tasks/ExecutionReplay.tsx

'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '@/providers/SocketProvider';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

interface ReplayFrame {
  base64: string;
  stepIndex: number;
  timestamp: number;
  description?: string;
  action?: string;
  status?: string;
}

interface ExecutionReplayProps {
  frames?: ReplayFrame[];
}

export function ExecutionReplay({ frames: initialFrames = [] }: ExecutionReplayProps) {
  const { latestFrame } = useSocket();
  const [frames, setFrames] = useState<ReplayFrame[]>(initialFrames);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Collect frames as they come in
  useEffect(() => {
    if (latestFrame) {
      setFrames((prev) => {
        const exists = prev.some((f) => f.timestamp === latestFrame.timestamp);
        if (!exists) {
          return [
            ...prev,
            {
              base64: latestFrame.base64,
              stepIndex: latestFrame.stepIndex,
              timestamp: latestFrame.timestamp,
            },
          ];
        }
        return prev;
      });
    }
  }, [latestFrame]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying || frames.length === 0) {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
      return;
    }

    const speed = [0.5, 1, 2, 4].find((s) => s === playbackSpeed) || 1;
    const frameDuration = (1000 / 30) / speed;

    playbackIntervalRef.current = setInterval(() => {
      setCurrentFrameIndex((prev) => {
        if (prev >= frames.length - 1) {
          setIsPlaying(false);
          return frames.length - 1;
        }
        return prev + 1;
      });
    }, frameDuration);

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [isPlaying, frames.length, playbackSpeed]);

  // Draw frame
  useEffect(() => {
    if (!canvasRef.current || frames.length === 0) return;

    const frame = frames[currentFrameIndex];
    if (!frame) return;

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = `data:image/jpeg;base64,${frame.base64}`;
  }, [currentFrameIndex, frames]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handlePrevFrame = () => {
    setCurrentFrameIndex((prev) => Math.max(0, prev - 1));
    setIsPlaying(false);
  };

  const handleNextFrame = () => {
    setCurrentFrameIndex((prev) => Math.min(frames.length - 1, prev + 1));
    setIsPlaying(false);
  };

  const handleFirstFrame = () => {
    setCurrentFrameIndex(0);
    setIsPlaying(false);
  };

  const handleLastFrame = () => {
    setCurrentFrameIndex(frames.length - 1);
    setIsPlaying(false);
  };

  const currentFrame = frames[currentFrameIndex];

  return (
    <div className="flex flex-col bg-white border rounded-lg overflow-hidden shadow-sm h-full">
      <div className="px-4 py-3 border-b font-semibold text-sm">
        Replay ({frames.length} frames)
      </div>

      <div className="flex-1 bg-black flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full"
        />
      </div>

      {/* Controls */}
      <div className="bg-gray-50 border-t px-4 py-3 space-y-3">
        {/* Playback controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFirstFrame}
            className="p-1.5 hover:bg-gray-200 rounded"
            title="First frame"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          <button
            onClick={handlePrevFrame}
            className="p-1.5 hover:bg-gray-200 rounded"
            title="Previous frame"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={handlePlayPause}
            className="p-1.5 hover:bg-blue-100 rounded"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 text-blue-600" />
            ) : (
              <Play className="w-4 h-4 text-blue-600" />
            )}
          </button>

          <button
            onClick={handleNextFrame}
            className="p-1.5 hover:bg-gray-200 rounded"
            title="Next frame"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            onClick={handleLastFrame}
            className="p-1.5 hover:bg-gray-200 rounded"
            title="Last frame"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>

          {/* Speed selector */}
          <div className="ml-auto flex items-center gap-1">
            <span className="text-xs text-gray-600">Speed:</span>
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              className="px-2 py-1 text-xs border rounded"
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </div>
        </div>

        {/* Timeline scrubber */}
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={currentFrameIndex}
          onChange={(e) => {
            setCurrentFrameIndex(parseInt(e.target.value));
            setIsPlaying(false);
          }}
          className="w-full"
        />

        {/* Info */}
        <div className="grid grid-cols-4 gap-2 text-xs text-gray-600">
          <div>
            <span className="font-semibold">Frame:</span>
            <div>{currentFrameIndex + 1}/{frames.length}</div>
          </div>
          <div>
            <span className="font-semibold">Step:</span>
            <div>{currentFrame?.stepIndex ?? 'N/A'}</div>
          </div>
          <div>
            <span className="font-semibold">Time:</span>
            <div>{currentFrame ? new Date(currentFrame.timestamp).toLocaleTimeString() : '-'}</div>
          </div>
          <div>
            <span className="font-semibold">Status:</span>
            <div>{currentFrame?.status ?? 'N/A'}</div>
          </div>
        </div>

        {currentFrame?.description && (
          <div className="text-xs bg-blue-50 p-2 rounded">
            <strong>Action:</strong> {currentFrame.description}
          </div>
        )}
      </div>
    </div>
  );
}
