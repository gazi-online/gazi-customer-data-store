import React, { useEffect, useState } from 'react';
import { Sparkles, Bot } from 'lucide-react';
import { ProviderCard, PROVIDER_CONFIGS, ProviderConfig } from './ProviderCard';
import { ProviderDocumentModal } from './ProviderDocumentModal';
import { getAiProviderStatus } from '@/app/(dashboard)/customers/ai-actions';
import { toast } from 'sonner';

interface JsonAiGeneratorProps {
  onJsonGenerated: (jsonString: string, providerName: string) => void;
}

export const JsonAiGenerator: React.FC<JsonAiGeneratorProps> = ({ onJsonGenerated }) => {
  const [providerStatuses, setProviderStatuses] = useState<{
    gemini: boolean;
    openai: boolean;
    claude: boolean;
    local: boolean;
  }>({
    gemini: false,
    openai: false,
    claude: false,
    local: true,
  });

  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    getAiProviderStatus()
      .then((status) => {
        if (isMounted) {
          setProviderStatuses(status);
        }
      })
      .catch((err) => {
        console.warn("[JsonAiGenerator] Could not fetch provider status:", err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectCard = (baseConfig: Omit<ProviderConfig, 'isConfigured'>) => {
    const isConfigured = providerStatuses[baseConfig.id] ?? false;

    if (!isConfigured) {
      const envKeyMap: Record<string, string> = {
        gemini: 'GEMINI_API_KEY',
        openai: 'OPENAI_API_KEY',
        claude: 'ANTHROPIC_API_KEY'
      };
      toast.error(`${baseConfig.name} API key not configured. Set ${envKeyMap[baseConfig.id] || 'key'} in .env.local.`);
      return;
    }

    const fullProviderConfig: ProviderConfig = {
      ...baseConfig,
      isConfigured: true
    };

    setSelectedProvider(fullProviderConfig);
    setIsModalOpen(true);
  };

  const providersList: ProviderConfig[] = [
    { ...PROVIDER_CONFIGS.gemini, isConfigured: providerStatuses.gemini },
    { ...PROVIDER_CONFIGS.openai, isConfigured: providerStatuses.openai },
    { ...PROVIDER_CONFIGS.claude, isConfigured: providerStatuses.claude },
    { ...PROVIDER_CONFIGS.local, isConfigured: providerStatuses.local },
  ];

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
            AI Document → JSON Generator
          </h3>
        </div>
        <span className="text-[11px] text-zinc-500 font-medium">
          Select an AI Engine to generate customer JSON
        </span>
      </div>

      {/* 4 Provider Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {providersList.map((prov) => (
          <ProviderCard
            key={prov.id}
            provider={prov}
            onSelect={() => handleSelectCard(prov)}
          />
        ))}
      </div>

      {/* Provider Document Selection Modal */}
      {selectedProvider && (
        <ProviderDocumentModal
          provider={selectedProvider}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onJsonGenerated={onJsonGenerated}
        />
      )}
    </div>
  );
};
