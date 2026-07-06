'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { speechToText } from '@/services/voice.service';

interface VoiceInputProps {
  onResult: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceInput({ onResult, disabled, className }: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const cleanup = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
    mediaRecorder.current = null;
    chunks.current = [];
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.current = recorder;
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunks.current.length === 0) return;

        setIsProcessing(true);
        const blob = new Blob(chunks.current, { type: 'audio/webm' });

        try {
          const result = await speechToText(blob);
          if (result.text) {
            onResult(result.text);
          }
        } catch (err) {
          setError('Speech recognition failed');
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setError('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={toggleRecording}
        disabled={disabled || isProcessing}
        className={cn(
          'relative flex items-center justify-center w-10 h-10 rounded-xl border transition-all',
          isRecording
            ? 'bg-red-500/20 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3)]'
            : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20',
          disabled && 'opacity-40 cursor-not-allowed',
        )}
      >
        {isProcessing ? (
          <Loader2 className="h-4 w-4 text-red-400 animate-spin" />
        ) : isRecording ? (
          <>
            <motion.span
              className="absolute inset-0 rounded-xl bg-red-500/20"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <MicOff className="h-4 w-4 text-red-400 relative z-10" />
          </>
        ) : (
          <Mic className="h-4 w-4 text-zinc-400" />
        )}
      </button>

      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-mono text-red-400/70 whitespace-nowrap"
          >
            LISTENING...
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-mono text-red-500/70 whitespace-nowrap"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
