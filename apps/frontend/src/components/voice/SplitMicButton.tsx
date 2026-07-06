'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SplitMicButtonProps {
  onTranscript: (text: string) => void;
}

export function SplitMicButton({ onTranscript }: SplitMicButtonProps) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeOption, setActiveOption] = useState('Record voice');
  const containerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsPopoverOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const SpeechRecognition =
      typeof window !== 'undefined'
        ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
        : null;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) onTranscript(transcript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;

    return () => {
      try { recognitionRef.current?.abort(); } catch (e) {}
    };
  }, [onTranscript]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Please use Chrome, Safari, or Edge.');
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      try { recognitionRef.current.start(); } catch (e) {}
    }
  };

  const handleOptionClick = (option: string) => {
    setActiveOption(option);
    if (option === 'Voice settings') router.push('/settings/voice');
    setIsPopoverOpen(false);
  };

  const showActiveUI = isHovered || isPopoverOpen || isRecording;
  const menuItems = ['Record voice', 'Wake word', 'Language', 'Voice settings'];

  return (
    <div
      ref={containerRef}
      className="relative flex items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Outer Pill — overflow:hidden clips the mic button flush to the 24px radius */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',     /* children fill full height — no gaps */
          height: '48px',
          boxSizing: 'border-box',
          backgroundColor: showActiveUI ? '#111' : 'transparent',
          border: showActiveUI
            ? '1px solid rgba(255,255,255,0.08)'
            : '1px solid transparent',
          borderRadius: '24px',
          overflow: 'hidden',        /* clips mic button top/bottom corners */
          transition:
            'background-color 0.2s ease-in-out, border-color 0.2s ease-in-out',
        }}
        className="select-none relative z-10"
      >
        {/* ── Chevron (left side) ── */}
        <div
          style={{
            width: showActiveUI ? '36px' : '0px',
            minWidth: showActiveUI ? '36px' : '0px',
            opacity: showActiveUI ? 1 : 0,
            overflow: 'hidden',
            transition:
              'width 0.2s ease-in-out, min-width 0.2s ease-in-out, opacity 0.2s ease-in-out',
          }}
          className="flex items-center justify-center"
        >
          <button
            type="button"
            onClick={() => setIsPopoverOpen((v) => !v)}
            className="flex items-center justify-center w-full h-full text-zinc-500 hover:text-zinc-300 focus:outline-none"
            style={{ background: 'transparent', border: 'none' }}
          >
            <ChevronDown
              className="h-4 w-4"
              style={{
                transform: isPopoverOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease-in-out',
              }}
            />
          </button>
        </div>

        {/* ── Mic Button (right side) — fills parent height via alignSelf stretch ── */}
        <button
          type="button"
          onClick={toggleRecording}
          title={isRecording ? 'Stop voice capture' : 'Start voice capture'}
          style={{
            /* Fixed 48 × 48 square; overflow:hidden on parent clips the
               outer-right corners to the pill's 24px radius automatically */
            width: '48px',
            height: '48px',
            flexShrink: 0,
            margin: 0,
            padding: 0,
            backgroundColor: showActiveUI ? '#1e1e1e' : 'transparent',
            /* Left edge: slight rounding; right edge: matches pill curve */
            borderRadius: showActiveUI ? '10px 24px 24px 10px' : '24px',
            border: isRecording ? '2px solid rgb(239,68,68)' : 'none',
            transition:
              'background-color 0.2s ease-in-out, border-radius 0.2s ease-in-out, border 0.2s ease-in-out',
          }}
          className={cn(
            'flex items-center justify-center text-zinc-400 hover:text-white focus:outline-none',
            isRecording && 'mic-recording-pulse',
          )}
        >
          <Mic
            className={cn(
              'h-5 w-5 transition-colors',
              isRecording ? 'text-red-500 animate-pulse' : 'text-zinc-400',
            )}
          />
        </button>
      </div>

      {/* ── Popover Menu ── */}
      {isPopoverOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: '58px',
            right: 0,
            width: '180px',
            backgroundColor: 'rgba(17,17,17,0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '8px',
            boxShadow:
              '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
            zIndex: 9999,
          }}
          className="flex flex-col gap-1"
        >
          {menuItems.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => handleOptionClick(item)}
              className="flex items-center w-full px-3 py-2 rounded-lg hover:bg-white/[0.04] text-left hover:text-white transition-all text-xs font-medium text-zinc-300"
            >
              {item}
              {activeOption === item && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] ml-auto" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
