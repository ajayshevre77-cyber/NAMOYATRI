import React from 'react';
import { Info, ExternalLink } from 'lucide-react';

interface Props {
  title: string;
  description: string;
  integrationName?: string;
  variant?: 'subtle' | 'card' | 'banner';
}

export const PlaceholderNotice: React.FC<Props> = ({
  title,
  description,
  integrationName,
  variant = 'card',
}) => {
  if (variant === 'subtle') {
    return (
      <div 
        id="integration-notice-subtle"
        className="flex items-center gap-1.5 text-xs text-stone-500 bg-stone-100/80 px-2.5 py-1 rounded-md border border-stone-200"
      >
        <Info className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        <span>{description}</span>
      </div>
    );
  }

  return (
    <div 
      id="integration-notice-card"
      className="p-3.5 rounded-xl bg-orange-50/70 border border-orange-200/80 text-orange-950 text-xs sm:text-sm leading-relaxed"
    >
      <div className="flex items-start gap-2.5">
        <div className="p-1 rounded-md bg-orange-100 text-orange-700 shrink-0 mt-0.5">
          <Info className="w-4 h-4" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-semibold text-orange-900">
            <span>{title}</span>
            {integrationName && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-orange-200/60 rounded text-orange-800">
                {integrationName}
              </span>
            )}
          </div>
          <p className="text-orange-800/90 text-xs">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
};
