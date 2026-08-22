import React from 'react';
import { Sparkles, Cpu, Brain, FileSearch, ExternalLink, CheckCircle2 } from 'lucide-react';

export interface ProviderConfig {
  id: 'gemini_web' | 'chatgpt_web' | 'claude_web' | 'ocr_space';
  name: string;
  subtitle: string;
  badge?: string;
  isWeb: boolean;
  webUrl?: string;
  icon: any;
  colorTheme: {
    bg: string;
    border: string;
    text: string;
    iconBg: string;
    badgeBg: string;
  };
}

interface ProviderCardProps {
  provider: ProviderConfig;
  onSelect: (provider: ProviderConfig) => void;
}

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  gemini_web: {
    id: 'gemini_web',
    name: 'Gemini Web',
    subtitle: 'Use Gemini in your browser',
    badge: 'Web AI',
    isWeb: true,
    webUrl: 'https://gemini.google.com/',
    icon: Sparkles,
    colorTheme: {
      bg: 'bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40',
      border: 'border-indigo-200 dark:border-indigo-800/60',
      text: 'text-indigo-950 dark:text-indigo-200',
      iconBg: 'bg-indigo-600 text-white',
      badgeBg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300'
    }
  },
  chatgpt_web: {
    id: 'chatgpt_web',
    name: 'ChatGPT Web',
    subtitle: 'Use ChatGPT in your browser',
    badge: 'Web AI',
    isWeb: true,
    webUrl: 'https://chatgpt.com/',
    icon: Cpu,
    colorTheme: {
      bg: 'bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40',
      border: 'border-emerald-200 dark:border-emerald-800/60',
      text: 'text-emerald-950 dark:text-emerald-200',
      iconBg: 'bg-emerald-600 text-white',
      badgeBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
    }
  },
  claude_web: {
    id: 'claude_web',
    name: 'Claude Web',
    subtitle: 'Use Claude in your browser',
    badge: 'Web AI',
    isWeb: true,
    webUrl: 'https://claude.ai/',
    icon: Brain,
    colorTheme: {
      bg: 'bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100/60 dark:hover:bg-amber-900/40',
      border: 'border-amber-200 dark:border-amber-800/60',
      text: 'text-amber-950 dark:text-amber-200',
      iconBg: 'bg-amber-600 text-white',
      badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
    }
  },
  ocr_space: {
    id: 'ocr_space',
    name: 'OCR.space',
    subtitle: 'Image & PDF text extraction',
    badge: 'Hosted OCR',
    isWeb: false,
    icon: FileSearch,
    colorTheme: {
      bg: 'bg-sky-50/50 dark:bg-sky-950/30 hover:bg-sky-100/60 dark:hover:bg-sky-900/40',
      border: 'border-sky-200 dark:border-sky-800/60',
      text: 'text-sky-950 dark:text-sky-200',
      iconBg: 'bg-sky-600 text-white',
      badgeBg: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300'
    }
  }
};

export const ProviderCard: React.FC<ProviderCardProps> = ({ provider, onSelect }) => {
  const Icon = provider.icon;
  const { colorTheme } = provider;

  return (
    <button
      type="button"
      onClick={() => onSelect(provider)}
      className={`p-4 rounded-xl border transition-all text-left flex flex-col justify-between relative overflow-hidden group shadow-sm cursor-pointer hover:shadow-md ${colorTheme.bg} ${colorTheme.border}`}
    >
      <div className="flex items-start justify-between mb-3 w-full">
        <div className="flex items-center space-x-3">
          <div className={`p-2.5 rounded-lg ${colorTheme.iconBg} shadow-sm group-hover:scale-105 transition-transform`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className={`text-sm font-bold tracking-tight ${colorTheme.text}`}>
              {provider.name}
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-0.5 line-clamp-1">
              {provider.subtitle}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50 w-full mt-2">
        <div className="flex items-center space-x-1.5">
          {provider.isWeb ? (
            <span className="inline-flex items-center text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
              <ExternalLink className="h-3 w-3 mr-1" /> Browser AI
            </span>
          ) : (
            <span className="inline-flex items-center text-[10px] font-semibold text-sky-600 dark:text-sky-400">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Fast OCR
            </span>
          )}
        </div>

        {provider.badge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorTheme.badgeBg}`}>
            {provider.badge}
          </span>
        )}
      </div>
    </button>
  );
};
