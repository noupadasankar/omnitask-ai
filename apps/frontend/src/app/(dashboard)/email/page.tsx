'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Mail,
  Send,
  Inbox,
  Plus,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { listEmailAccounts, addEmailAccount, removeEmailAccount, sendEmail, listMessages } from '@/services/email.service';

export default function EmailPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [newAccount, setNewAccount] = useState({ provider: 'gmail', email: '', accessToken: '' });
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' });

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccount) loadMessages(selectedAccount);
  }, [selectedAccount]);

  const loadAccounts = async () => {
    try {
      const list = await listEmailAccounts();
      setAccounts(list);
      if (list.length > 0 && !selectedAccount) setSelectedAccount(list[0].id);
    } catch { /* empty */ }
  };

  const loadMessages = async (accountId: string) => {
    try {
      const msgs = await listMessages(accountId, { limit: 20 });
      setMessages(msgs);
    } catch { /* empty */ }
  };

  const handleAddAccount = async () => {
    try {
      await addEmailAccount(newAccount);
      setShowAdd(false);
      setNewAccount({ provider: 'gmail', email: '', accessToken: '' });
      await loadAccounts();
    } catch { /* empty */ }
  };

  const handleSend = async () => {
    if (!selectedAccount || !compose.to || !compose.subject) return;
    try {
      await sendEmail(selectedAccount, {
        to: compose.to.split(',').map((s: string) => s.trim()),
        subject: compose.subject,
        body: compose.body,
      });
      setShowCompose(false);
      setCompose({ to: '', subject: '', body: '' });
    } catch { /* empty */ }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Email</h1>
          <p className="text-sm text-zinc-400 mt-1">Manage your email accounts and messages</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCompose(!showCompose)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all"
          >
            <Send className="h-3.5 w-3.5" />
            COMPOSE
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-400 hover:bg-blue-500/20 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            ADD ACCOUNT
          </button>
        </div>
      </div>

      {showAdd && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl p-6 space-y-3"
        >
          <select
            value={newAccount.provider}
            onChange={(e) => setNewAccount({ ...newAccount, provider: e.target.value })}
            className="w-full p-3 rounded-xl bg-black/60 border border-white/10 text-xs text-white"
          >
            <option value="gmail">Gmail</option>
            <option value="outlook">Outlook</option>
          </select>
          <input
            type="email"
            placeholder="Email address"
            value={newAccount.email}
            onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })}
            className="w-full p-3 rounded-xl bg-black/60 border border-white/10 text-xs text-white placeholder-zinc-500"
          />
          <input
            type="password"
            placeholder="App password / OAuth token"
            value={newAccount.accessToken}
            onChange={(e) => setNewAccount({ ...newAccount, accessToken: e.target.value })}
            className="w-full p-3 rounded-xl bg-black/60 border border-white/10 text-xs text-white placeholder-zinc-500"
          />
          <div className="flex gap-2">
            <button onClick={handleAddAccount} className="flex-1 p-3 rounded-xl bg-blue-500/20 border border-blue-500/30 text-xs font-bold text-blue-400 hover:bg-blue-500/30 transition-all">CONNECT</button>
            <button onClick={() => setShowAdd(false)} className="px-4 p-3 rounded-xl border border-white/10 text-xs font-semibold text-zinc-400 hover:bg-white/[0.04] transition-all">CANCEL</button>
          </div>
        </motion.div>
      )}

      {showCompose && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl p-6 space-y-3"
        >
          <input
            type="text"
            placeholder="To (comma separated)"
            value={compose.to}
            onChange={(e) => setCompose({ ...compose, to: e.target.value })}
            className="w-full p-3 rounded-xl bg-black/60 border border-white/10 text-xs text-white placeholder-zinc-500"
          />
          <input
            type="text"
            placeholder="Subject"
            value={compose.subject}
            onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
            className="w-full p-3 rounded-xl bg-black/60 border border-white/10 text-xs text-white placeholder-zinc-500"
          />
          <textarea
            placeholder="Message body"
            value={compose.body}
            onChange={(e) => setCompose({ ...compose, body: e.target.value })}
            rows={6}
            className="w-full p-3 rounded-xl bg-black/60 border border-white/10 text-xs text-white placeholder-zinc-500 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={handleSend} className="flex-1 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-xs font-bold text-emerald-400 hover:bg-emerald-500/30 transition-all">
              <Send className="h-3.5 w-3.5 inline mr-1" />
              SEND
            </button>
            <button onClick={() => setShowCompose(false)} className="px-4 p-3 rounded-xl border border-white/10 text-xs font-semibold text-zinc-400 hover:bg-white/[0.04] transition-all">DISCARD</button>
          </div>
        </motion.div>
      )}

      {accounts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {accounts.map((acct) => (
            <button
              key={acct.id}
              onClick={() => { setSelectedAccount(acct.id); setShowCompose(false); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${
                selectedAccount === acct.id
                  ? 'border-white/20 bg-white/[0.08] text-white'
                  : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.04]'
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              {acct.email}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl overflow-hidden">
        <div className="p-4 border-b border-white/5 flex items-center gap-2">
          <Inbox className="h-4 w-4 text-zinc-400" />
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Inbox</span>
          <span className="text-[10px] text-zinc-600 ml-auto">{messages.length} messages</span>
        </div>

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12">
            <Mail className="h-8 w-8 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-500">No messages loaded</p>
            <p className="text-[10px] text-zinc-600 mt-1">Select an account to view messages</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="p-4 border-b border-white/5 hover:bg-white/[0.02] transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{msg.from}</span>
                  {!msg.isRead && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                </div>
                <p className="text-xs text-zinc-300 mt-0.5 truncate">{msg.subject}</p>
                <p className="text-[10px] text-zinc-500 mt-1 truncate">{msg.bodyText}</p>
              </div>
              <span className="text-[10px] text-zinc-600 whitespace-nowrap ml-4">
                {new Date(msg.receivedAt).toLocaleDateString()}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
