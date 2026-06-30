'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Mic,
  MicOff,
  Volume2,
  Webhook,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { VoiceInput } from '@/components/voice/VoiceInput';
import { textToSpeech } from '@/services/voice.service';

export default function VoiceSettingsPage() {
  const [wakeWord, setWakeWord] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState('default');
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [ttsTested, setTtsTested] = useState(false);

  const handleVoiceResult = (text: string) => {
    setLastCommand(text);
  };

  const testTTS = async () => {
    try {
      await textToSpeech('Voice feedback is working correctly.');
      setTtsTested(true);
      setTimeout(() => setTtsTested(false), 3000);
    } catch {
      // Silently handle
    }
  };

  const voices = [
    { id: 'default', name: 'Default Voice', provider: 'Web Speech API' },
    { id: 'elevenlabs_male', name: 'Premium Male', provider: 'ElevenLabs' },
    { id: 'elevenlabs_female', name: 'Premium Female', provider: 'ElevenLabs' },
    { id: 'openai_nova', name: 'Nova (OpenAI)', provider: 'OpenAI' },
  ];

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Voice Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">Configure speech recognition and voice feedback</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Wake Word */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Wake Word Detection</h3>
              <p className="text-[10px] text-zinc-500">Say "Hey Agent" to activate</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${wakeWord ? 'bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-zinc-600'}`} />
              <span className="text-xs font-semibold text-zinc-300">
                {wakeWord ? 'Active' : 'Disabled'}
              </span>
            </div>
            <button
              onClick={() => setWakeWord(!wakeWord)}
              className={`relative w-12 h-6 rounded-full transition-all ${wakeWord ? 'bg-red-500' : 'bg-zinc-700'}`}
            >
              <motion.div
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
                animate={{ left: wakeWord ? 26 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
        </motion.div>

        {/* Voice Feedback */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Volume2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Voice Feedback</h3>
              <p className="text-[10px] text-zinc-500">Agent speaks responses aloud</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="text-xs font-semibold text-zinc-300">Enable Voice Feedback</span>
              <button
                onClick={() => setVoiceFeedback(!voiceFeedback)}
                className={`relative w-12 h-6 rounded-full transition-all ${voiceFeedback ? 'bg-emerald-500' : 'bg-zinc-700'}`}
              >
                <motion.div
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
                  animate={{ left: voiceFeedback ? 26 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </button>
            </div>

            <button
              onClick={testTTS}
              className="w-full p-3 rounded-xl border border-white/5 bg-white/[0.02] text-xs font-semibold text-zinc-300 hover:bg-white/[0.04] transition-all flex items-center justify-center gap-2"
            >
              {ttsTested ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Test Successful
                </>
              ) : (
                'Test Voice Feedback'
              )}
            </button>
          </div>
        </motion.div>

        {/* Voice Selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Webhook className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Voice Selection</h3>
              <p className="text-[10px] text-zinc-500">Choose TTS voice</p>
            </div>
          </div>

          <div className="space-y-2">
            {voices.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVoice(v.id)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                  selectedVoice === v.id
                    ? 'border-white/20 bg-white/[0.05]'
                    : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <div className="text-left">
                  <div className="text-xs font-semibold text-zinc-200">{v.name}</div>
                  <div className="text-[10px] text-zinc-500">{v.provider}</div>
                </div>
                {selectedVoice === v.id && (
                  <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Test Voice Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Mic className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Test Microphone</h3>
              <p className="text-[10px] text-zinc-500">Speak a command to test</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <VoiceInput onResult={handleVoiceResult} />
            <div className="flex-1 min-w-0">
              {lastCommand ? (
                <p className="text-xs text-zinc-300 truncate">&ldquo;{lastCommand}&rdquo;</p>
              ) : (
                <p className="text-[10px] text-zinc-500">Tap the mic and speak</p>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
