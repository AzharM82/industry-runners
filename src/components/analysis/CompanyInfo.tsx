import type { StockAnalysis } from '../../types';

interface CompanyInfoProps {
  analysis: StockAnalysis;
}

export function CompanyInfo({ analysis }: CompanyInfoProps) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-4">
        About {analysis.name || analysis.symbol}
      </h2>

      {/* Description */}
      {analysis.description && (
        <p className="text-gray-400 text-sm leading-relaxed mb-4 line-clamp-4">
          {analysis.description}
        </p>
      )}

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-4">
        {analysis.sector && (
          <InfoItem label="Sector" value={analysis.sector} />
        )}
        {analysis.industry && analysis.industry !== analysis.sector && (
          <InfoItem label="Industry" value={analysis.industry} />
        )}
        {analysis.website && (
          <div className="col-span-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Website</div>
            <a
              href={analysis.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline text-sm truncate block"
            >
              {analysis.website.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}
      </div>

      {/* Exchange Badge */}
      {analysis.exchange && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <span className="text-xs text-gray-500">
            Listed on <span className="font-medium text-gray-300">{analysis.exchange}</span>
          </span>
        </div>
      )}
    </div>
  );
}

interface InfoItemProps {
  label: string;
  value: string;
}

function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm font-medium text-gray-200 truncate">{value}</div>
    </div>
  );
}
