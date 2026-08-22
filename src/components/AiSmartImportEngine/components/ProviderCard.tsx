import React from 'react';
import { Sparkles, Cpu, Brain, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

export interface ProviderConfig {
  id: 'gemini' | 'openai' | 'claude' | 'local';
  name: string;
  subtitle: string;
  badge?: string;
  isCloud: boolean;
  isConfigured: boolean;
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

export const PROVIDER_CONFIGS: Record<string, Omit<ProviderConfig, 'isConfigured'>> = {
  gemini: {
    id: 'gemini',
    name: 'Gemini AI',
    subtitle: 'Fast multimodal document extraction',
    isCloud: true,
    icon: Sparkles,
    colorTheme: {
      bg: 'bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40',
      border: 'border-indigo-200 dark:border-indigo-800/60',
      text: 'text-indigo-950 dark:text-indigo-200',
      iconBg: 'bg-indigo-600 text-white',
      badgeBg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300'
    }
  },
  openai: {
    id: 'openai',
    name: 'OpenAI GPT',
    subtitle: 'Advanced vision/document extraction',
    isCloud: true,
    icon: Cpu,
    colorTheme: {
      bg: 'bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40',
      border: 'border-emerald-200 dark:border-emerald-800/60',
      text: 'text-emerald-950 dark:text-emerald-200',
      iconBg: 'bg-emerald-600 text-white',
      badgeBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
    }
  },
  claude: {
    id: 'claude',
    name: 'Claude AI',
    subtitle: 'Document & vision extraction',
    isCloud: true,
    icon: Brain,
    colorTheme: {
      bg: 'bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100/60 dark:hover:bg-amber-900/40',
      border: 'border-amber-200 dark:border-amber-800/60',
      text: 'text-amber-950 dark:text-amber-200',
      iconBg: 'bg-amber-600 text-white',
      badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
    }
  },
  local: {
    id: 'local',
    name: 'Local OCR',
    subtitle: 'Offline • Free • Private',
    badge: '100% Offline',
    isCloud: false,
    icon: ShieldCheck,
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
      disabled={!provider.isConfigured}
      className={`p-4 rounded-xl border transition-all text-left flex flex-col justify-between relative overflow-hidden group shadow-sm ${colorTheme.bg} ${colorTheme.border} ${
        !provider.isConfigured ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'
      }`}
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
          {provider.isConfigured ? (
            <span className="inline-flex items-center text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Ready
            </span>
          ) : (
            <span className="inline-flex items-center text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
              <AlertCircle className="h-3 w-3 mr-1" /> Not Configured
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
