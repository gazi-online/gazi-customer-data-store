import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ProviderCard, PROVIDER_CONFIGS, ProviderConfig } from './ProviderCard';
import { ProviderDocumentModal } from './ProviderDocumentModal';

interface JsonAiGeneratorProps {
  onJsonGenerated: (jsonString: string, providerName: string) => void;
}

export const JsonAiGenerator: React.FC<JsonAiGeneratorProps> = ({ onJsonGenerated }) => {
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const handleSelectCard = (providerConfig: ProviderConfig) => {
    setSelectedProvider(providerConfig);
    setIsModalOpen(true);
  };

  const providersList: ProviderConfig[] = [
    PROVIDER_CONFIGS.gemini_web,
    PROVIDER_CONFIGS.chatgpt_web,
    PROVIDER_CONFIGS.claude_web,
    PROVIDER_CONFIGS.ocr_space,
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
          Use Browser AI or OCR.space to generate customer JSON
        </span>
      </div>

      {/* 4 Cards Grid */}
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
