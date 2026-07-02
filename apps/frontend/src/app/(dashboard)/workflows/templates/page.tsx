'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ArrowLeft,
  Plus,
  Import,
  Eye,
  X,
  Filter,
  Layers,
  Clock,
  CheckCircle2,
} from 'lucide-react';

import { cn } from '@/lib/utils';

interface TemplateStep {
  action: string;
  description: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  steps: TemplateStep[];
  estimatedDuration: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  usageCount: number;
  successRate: number;
}

const CATEGORIES = [
  'All',
  'Data Extraction',
  'Monitoring',
  'Form Filling',
  'Social Media',
  'Research',
] as const;

const TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'tpl-ds-1',
    name: 'E-commerce Product Scraper',
    category: 'Data Extraction',
    description: 'Extract product details, prices, and availability from any e-commerce store.',
    icon: '🛒',
    steps: [
      { action: 'Navigate', description: 'Navigate to product listing page' },
      { action: 'Scroll', description: 'Scroll to load all products' },
      { action: 'Extract', description: 'Extract product name, price, rating, and stock status' },
      { action: 'Extract', description: 'Extract product image URLs and descriptions' },
      { action: 'Click', description: 'Click "Next page" and repeat' },
    ],
    estimatedDuration: '5-15 min',
    difficulty: 'beginner',
    usageCount: 2841,
    successRate: 96,
  },
  {
    id: 'tpl-ds-2',
    name: 'Real Estate Listings Collector',
    category: 'Data Extraction',
    description: 'Gather property listings from real estate websites with full details.',
    icon: '🏠',
    steps: [
      { action: 'Navigate', description: 'Navigate to property search page' },
      { action: 'Input', description: 'Enter search criteria (location, price range)' },
      { action: 'Wait', description: 'Wait for results to load' },
      { action: 'Extract', description: 'Extract property details (price, sqft, beds, baths)' },
      { action: 'Click', description: 'Navigate through pagination and repeat' },
    ],
    estimatedDuration: '10-20 min',
    difficulty: 'intermediate',
    usageCount: 1567,
    successRate: 93,
  },
  {
    id: 'tpl-mn-1',
    name: 'Price Change Monitor',
    category: 'Monitoring',
    description: 'Monitor competitor pricing and get alerted when prices change by more than a threshold.',
    icon: '💰',
    steps: [
      { action: 'Navigate', description: 'Navigate to competitor product page' },
      { action: 'Extract', description: 'Extract current price' },
      { action: 'Assert', description: 'Compare price against baseline' },
      { action: 'Screenshot', description: 'Capture screenshot if price changed' },
      { action: 'Navigate', description: 'Navigate to alert endpoint with notification' },
    ],
    estimatedDuration: '2-5 min',
    difficulty: 'intermediate',
    usageCount: 3204,
    successRate: 91,
  },
  {
    id: 'tpl-mn-2',
    name: 'Website Uptime Checker',
    category: 'Monitoring',
    description: 'Regularly check if your website is accessible and core elements are loading.',
    icon: '🔍',
    steps: [
      { action: 'Navigate', description: 'Navigate to target URL' },
      { action: 'Wait', description: 'Wait for full page load' },
      { action: 'Assert', description: 'Check that key elements are present' },
      { action: 'Screenshot', description: 'Capture page screenshot for verification' },
      { action: 'Extract', description: 'Extract page load time metrics' },
    ],
    estimatedDuration: '1-3 min',
    difficulty: 'beginner',
    usageCount: 4562,
    successRate: 99,
  },
  {
    id: 'tpl-ff-1',
    name: 'Contact Form Filler',
    category: 'Form Filling',
    description: 'Automatically fill and submit contact forms with test data for QA testing.',
    icon: '📝',
    steps: [
      { action: 'Navigate', description: 'Navigate to form URL' },
      { action: 'Input', description: 'Fill name field' },
      { action: 'Input', description: 'Fill email field' },
      { action: 'Input', description: 'Fill message/description field' },
      { action: 'Click', description: 'Submit the form' },
      { action: 'Assert', description: 'Verify success confirmation appears' },
    ],
    estimatedDuration: '2-4 min',
    difficulty: 'beginner',
    usageCount: 1892,
    successRate: 97,
  },
  {
    id: 'tpl-ff-2',
    name: 'Multi-Step Registration Bot',
    category: 'Form Filling',
    description: 'Complete multi-page registration flows with data validation.',
    icon: '📋',
    steps: [
      { action: 'Navigate', description: 'Navigate to registration start page' },
      { action: 'Input', description: 'Fill account details (email, password)' },
      { action: 'Click', description: 'Click "Next" to proceed' },
      { action: 'Input', description: 'Fill profile information' },
      { action: 'Click', description: 'Accept terms and submit' },
      { action: 'Assert', description: 'Verify registration success' },
    ],
    estimatedDuration: '5-8 min',
    difficulty: 'intermediate',
    usageCount: 1124,
    successRate: 88,
  },
  {
    id: 'tpl-sm-1',
    name: 'LinkedIn Profile Scraper',
    category: 'Social Media',
    description: 'Extract profile information, experience, and skills from LinkedIn search results.',
    icon: '💼',
    steps: [
      { action: 'Navigate', description: 'Navigate to LinkedIn search results' },
      { action: 'Scroll', description: 'Scroll through search results' },
      { action: 'Click', description: 'Click on each profile' },
      { action: 'Extract', description: 'Extract name, title, company, location' },
      { action: 'Extract', description: 'Extract experience and education sections' },
    ],
    estimatedDuration: '15-30 min',
    difficulty: 'advanced',
    usageCount: 2341,
    successRate: 85,
  },
  {
    id: 'tpl-sm-2',
    name: 'Twitter/X Data Collector',
    category: 'Social Media',
    description: 'Collect tweets, engagement metrics, and trends from Twitter/X search.',
    icon: '🐦',
    steps: [
      { action: 'Navigate', description: 'Navigate to Twitter/X search' },
      { action: 'Input', description: 'Enter search query' },
      { action: 'Wait', description: 'Wait for results to load' },
      { action: 'Extract', description: 'Extract tweet text, likes, retweets, replies' },
      { action: 'Scroll', description: 'Scroll for more results' },
    ],
    estimatedDuration: '10-20 min',
    difficulty: 'intermediate',
    usageCount: 1876,
    successRate: 89,
  },
  {
    id: 'tpl-rs-1',
    name: 'Competitor Analysis Report',
    category: 'Research',
    description: 'Research competitor websites and generate a comparison report.',
    icon: '📊',
    steps: [
      { action: 'Navigate', description: 'Navigate to competitor homepage' },
      { action: 'Screenshot', description: 'Capture homepage screenshot' },
      { action: 'Extract', description: 'Extract product offerings and pricing' },
      { action: 'Navigate', description: 'Navigate to features page' },
      { action: 'Extract', description: 'Extract feature list' },
    ],
    estimatedDuration: '20-40 min',
    difficulty: 'advanced',
    usageCount: 967,
    successRate: 90,
  },
  {
    id: 'tpl-rs-2',
    name: 'Academic Research Helper',
    category: 'Research',
    description: 'Extract paper titles, authors, and citations from academic databases.',
    icon: '🎓',
    steps: [
      { action: 'Navigate', description: 'Navigate to academic database' },
      { action: 'Input', description: 'Enter search query' },
      { action: 'Extract', description: 'Extract paper titles and authors' },
      { action: 'Click', description: 'Click on each paper for more details' },
      { action: 'Extract', description: 'Extract abstract, citations, and DOI' },
    ],
    estimatedDuration: '15-25 min',
    difficulty: 'beginner',
    usageCount: 1452,
    successRate: 94,
  },
];

export default function TemplatesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplate | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return TEMPLATES.filter((tpl) => {
      const matchesSearch =
        tpl.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tpl.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || tpl.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  const handleImport = async (tpl: WorkflowTemplate) => {
    setImporting(tpl.id);
    await new Promise((r) => setTimeout(r, 1000));
    setImporting(null);
    router.push('/workflows/create');
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-black/30 text-zinc-500 hover:text-white transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Workflow Templates</h1>
          <p className="mt-1 text-sm text-zinc-500">Start faster with pre-built workflow templates</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full h-10 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:bg-white/[0.04] focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <motion.button
            key={cat}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'rounded-xl border px-4 py-1.5 text-xs font-semibold transition-all',
              selectedCategory === cat
                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                : 'border-white/[0.07] bg-black/30 text-zinc-500 hover:text-zinc-300 hover:border-white/15',
            )}
          >
            {cat}
          </motion.button>
        ))}
      </div>

      {/* Template Grid */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-16 text-center">
          <Filter className="h-6 w-6 text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-400">No templates found</p>
          <p className="mt-1 text-xs text-zinc-600">Try a different search or category</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tpl, i) => (
          <motion.div
            key={tpl.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.35) }}
            className="group relative overflow-hidden rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl transition-all duration-300 hover:border-white/15"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{tpl.icon}</span>
                <div>
                  <h3 className="text-sm font-semibold text-white">{tpl.name}</h3>
                  <span className="text-[10px] text-zinc-600">{tpl.category}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                {tpl.successRate}%
              </div>
            </div>

            <p className="mb-3 text-[11px] text-zinc-500 line-clamp-2">{tpl.description}</p>

            <div className="mb-3 flex items-center gap-3 text-[10px] text-zinc-600">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {tpl.estimatedDuration}
              </span>
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {tpl.steps.length} steps
              </span>
              <span
                className={cn(
                  'font-semibold uppercase tracking-wider',
                  tpl.difficulty === 'beginner'
                    ? 'text-emerald-400'
                    : tpl.difficulty === 'intermediate'
                      ? 'text-yellow-400'
                      : 'text-red-400',
                )}
              >
                {tpl.difficulty}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPreviewTemplate(tpl)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleImport(tpl)}
                disabled={importing === tpl.id}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-red-400 disabled:opacity-50 transition-all shadow-lg shadow-red-500/20"
              >
                {importing === tpl.id ? (
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" /></svg>
                ) : (
                  <>
                    <Import className="h-3.5 w-3.5" />
                    Import
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setPreviewTemplate(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-[24px] border border-white/10 bg-zinc-950 p-6 shadow-2xl"
            >
              <div className="mb-5 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{previewTemplate.icon}</span>
                  <div>
                    <h2 className="text-lg font-bold text-white">{previewTemplate.name}</h2>
                    <p className="text-xs text-zinc-500">{previewTemplate.category}</p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-500 hover:bg-white/[0.06] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mb-4 text-sm text-zinc-400">{previewTemplate.description}</p>

              <div className="mb-4 flex items-center gap-4 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {previewTemplate.estimatedDuration}
                </span>
                <span>{previewTemplate.usageCount.toLocaleString()} uses</span>
                <span className="text-emerald-400 font-semibold">{previewTemplate.successRate}% success</span>
              </div>

              <h3 className="mb-3 text-sm font-semibold text-white">Steps</h3>
              <div className="space-y-2">
                {previewTemplate.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-500/10 text-[10px] font-bold text-red-400">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-white">{step.action}</p>
                      <p className="text-[10px] text-zinc-500">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/[0.05]"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setPreviewTemplate(null);
                    handleImport(previewTemplate);
                  }}
                  className="flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2 text-sm font-semibold text-white hover:bg-red-400 shadow-lg shadow-red-500/20"
                >
                  <Plus className="h-4 w-4" />
                  Use This Template
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
