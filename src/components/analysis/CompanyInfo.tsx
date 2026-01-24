import type { StockAnalysis } from '../../types';

interface CompanyInfoProps {
  analysis: StockAnalysis;
}

export function CompanyInfo({ analysis }: CompanyInfoProps) {
  return (
    <div className="bg-[#FFFDF8] border border-[#D4C9B5] rounded-lg p-6 shadow-sm">
      <h2 className="text-xl font-serif font-bold text-[#3D3D3D] mb-4">
        About {analysis.name || analysis.symbol}
      </h2>

      {/* Description */}
      {analysis.description && (
        <p className="text-[#6B6B6B] text-sm leading-relaxed mb-4 line-clamp-4">
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
            <div className="text-xs text-[#6B6B6B] uppercase tracking-wide mb-1">Website</div>
            <a
              href={analysis.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#6B7B4C] hover:text-[#5a6a3f] underline text-sm truncate block"
            >
              {analysis.website.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}
      </div>

      {/* Exchange Badge */}
      {analysis.exchange && (
        <div className="mt-4 pt-4 border-t border-[#D4C9B5]">
          <span className="text-xs text-[#6B6B6B]">
            Listed on <span className="font-medium text-[#3D3D3D]">{analysis.exchange}</span>
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
      <div className="text-xs text-[#6B6B6B] uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm font-medium text-[#3D3D3D] truncate">{value}</div>
    </div>
  );
}
