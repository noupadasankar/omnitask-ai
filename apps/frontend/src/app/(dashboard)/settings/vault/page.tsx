'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock,
  Plus,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Globe,
} from 'lucide-react';
import { listCredentials, storeCredential, deleteCredential } from '@/services/vault.service';

const SERVICE_ICONS: Record<string, string> = {
  linkedin: '💼',
  gmail: '📧',
  outlook: '📧',
  swiggy: '🍔',
  zomato: '🍕',
  spotify: '🎵',
  youtube: '▶️',
  amazon: '🛒',
  flipkart: '🛍️',
};

const SERVICE_PLACEHOLDERS: Record<string, string[]> = {
  linkedin: ['email', 'password'],
  gmail: ['email', 'appPassword'],
  outlook: ['email', 'password'],
  swiggy: ['phone', 'password'],
  zomato: ['phone', 'password'],
  spotify: ['email', 'password'],
  youtube: ['email', 'password'],
};

export default function VaultSettingsPage() {
  const [credentials, setCredentials] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [newCred, setNewCred] = useState({ service: '', label: '', hints: '' });
  const [newFields, setNewFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      const list = await listCredentials();
      setCredentials(list);
    } catch {
      // Silently handle
    }
  };

  const handleAdd = async () => {
    if (!newCred.service || !newCred.label) return;

    try {
      const fields = Object.keys(newFields).length > 0 ? newFields : { password: '********' };
      await storeCredential(newCred.service, newCred.label, fields, newCred.hints || undefined);
      setMessage({ type: 'success', text: `Credential stored for ${newCred.service}` });
      setShowAddForm(false);
      setNewCred({ service: '', label: '', hints: '' });
      setNewFields({});
      await loadCredentials();
    } catch {
      setMessage({ type: 'error', text: 'Failed to store credential' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDelete = async (service: string) => {
    try {
      await deleteCredential(service);
      setMessage({ type: 'success', text: `Credential removed for ${service}` });
      await loadCredentials();
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete credential' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleServiceSelect = (service: string) => {
    setNewCred({ ...newCred, service });
    const placeholders = SERVICE_PLACEHOLDERS[service] || ['apiKey'];
    const fields: Record<string, string> = {};
    placeholders.forEach((f) => { fields[f] = ''; });
    setNewFields(fields);
  };

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Credential Vault</h1>
          <p className="text-sm text-zinc-400 mt-1">Securely store encrypted credentials for automated tasks</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          ADD CREDENTIAL
        </button>
      </div>

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`flex items-center gap-2 p-3 rounded-xl text-xs font-semibold ${
              message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {Object.keys(SERVICE_PLACEHOLDERS).map((svc) => (
                  <button
                    key={svc}
                    onClick={() => handleServiceSelect(svc)}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all ${
                      newCred.service === svc
                        ? 'border-white/20 bg-white/[0.08] text-white'
                        : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span>{SERVICE_ICONS[svc] || '🔐'}</span>
                    {svc.charAt(0).toUpperCase() + svc.slice(1)}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Label (e.g. Work Email)"
                value={newCred.label}
                onChange={(e) => setNewCred({ ...newCred, label: e.target.value })}
                className="w-full p-3 rounded-xl bg-black/60 border border-white/10 text-xs text-white placeholder-zinc-500"
              />

              <input
                type="text"
                placeholder="Hint (e.g. user@example.com)"
                value={newCred.hints}
                onChange={(e) => setNewCred({ ...newCred, hints: e.target.value })}
                className="w-full p-3 rounded-xl bg-black/60 border border-white/10 text-xs text-white placeholder-zinc-500"
              />

              {Object.keys(newFields).length > 0 && (
                <div className="space-y-2">
                  {Object.keys(newFields).map((field) => (
                    <input
                      key={field}
                      type="password"
                      placeholder={field}
                      value={newFields[field]}
                      onChange={(e) => setNewFields({ ...newFields, [field]: e.target.value })}
                      className="w-full p-3 rounded-xl bg-black/60 border border-white/10 text-xs text-white placeholder-zinc-500"
                    />
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!newCred.service || !newCred.label}
                  className="flex-1 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-xs font-bold text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-40"
                >
                  ENCRYPT & STORE
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 p-3 rounded-xl border border-white/10 text-xs font-semibold text-zinc-400 hover:bg-white/[0.04] transition-all"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {credentials.map((cred) => (
          <motion.div
            key={cred.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl p-5 group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-lg">
                  {SERVICE_ICONS[cred.service] || '🔐'}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{cred.label}</h3>
                  <p className="text-[10px] text-zinc-500 capitalize">{cred.service}</p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(cred.service)}
                className="opacity-0 group-hover:opacity-100 transition-all p-2 rounded-lg hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </button>
            </div>

            {cred.hints && (
              <div className="flex items-center gap-2 text-[10px] text-zinc-500 mb-3">
                <Globe className="h-3 w-3" />
                {cred.hints}
              </div>
            )}

            <div className="flex items-center gap-2 text-[10px] text-zinc-600">
              <Lock className="h-3 w-3" />
              AES-256-GCM Encrypted
              <span className="ml-auto">
                {new Date(cred.createdAt).toLocaleDateString()}
              </span>
            </div>
          </motion.div>
        ))}

        {credentials.length === 0 && !showAddForm && (
          <div className="col-span-full flex flex-col items-center justify-center p-12 rounded-2xl border border-dashed border-white/5">
            <Lock className="h-8 w-8 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-500">No credentials stored yet</p>
            <p className="text-[10px] text-zinc-600 mt-1">Add credentials for automated logins</p>
          </div>
        )}
      </div>
    </div>
  );
}
