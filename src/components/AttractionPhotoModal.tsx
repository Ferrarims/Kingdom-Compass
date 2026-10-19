import React from 'react';
import { X, ExternalLink, Camera, Sparkles, Utensils, MapPin, Youtube, Search, Compass } from 'lucide-react';
import { getGoogleImagesSearchUrl, getYouTubeSearchUrl } from '../data/attractionImages';
import { useModalKeyboard } from '../hooks/useModalKeyboard';

export interface PhotoModalItem {
  title: string;
  category: 'park' | 'attraction' | 'restaurant';
  parkName?: string;
  description?: string;
  imageUrl: string;
  proTip?: string;
}

interface AttractionPhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: PhotoModalItem | null;
}

export const AttractionPhotoModal: React.FC<AttractionPhotoModalProps> = ({
  isOpen,
  onClose,
  item,
}) => {
  useModalKeyboard({
    isOpen,
    onClose,
  });

  if (!isOpen || !item) return null;

  const categoryLabel =
    item.category === 'park'
      ? 'Parque Temático'
      : item.category === 'restaurant'
      ? 'Restaurante & Gastronomia'
      : 'Brinquedo & Atração Imperdível';

  const categoryIcon =
    item.category === 'park' ? (
      <Compass className="w-4 h-4 text-[#D4AF37]" />
    ) : item.category === 'restaurant' ? (
      <Utensils className="w-4 h-4 text-rose-500" />
    ) : (
      <Sparkles className="w-4 h-4 text-[#D4AF37]" />
    );

  const googleSearchUrl = getGoogleImagesSearchUrl(`${item.title} ${item.parkName || ''}`);
  const youtubeSearchUrl = getYouTubeSearchUrl(`${item.title} ${item.parkName || ''}`);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 z-50 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 relative"
      >
        {/* Modal Header */}
        <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                {categoryLabel} {item.parkName ? `• ${item.parkName}` : ''}
              </span>
              <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                {item.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {/* Description */}
          {item.description && (
            <div className="space-y-1.5 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Descrição & Experiência:
              </span>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
                {item.description}
              </p>
            </div>
          )}

          {/* Pro Tip if provided */}
          {item.proTip && (
            <div className="bg-amber-50/80 p-4 rounded-2xl border border-amber-200 text-amber-950 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                Dica Especial do Especialista:
              </span>
              <p className="text-xs text-amber-900 leading-relaxed font-medium">
                {item.proTip}
              </p>
            </div>
          )}

          {/* External Links Hub for Real Photos & Videos */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-[#1A2B4C] font-serif block">
                📸 Ver Fotos Reais & Vídeos Oficiais:
              </span>
              <p className="text-[11px] text-slate-500">
                Clique abaixo para abrir fotos reais da atração no Google Imagens ou assistir aos vídeos em HD no YouTube.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href={googleSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border border-blue-200 text-blue-950 text-xs font-bold flex items-center justify-between transition-all group cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Search className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block font-bold">Ver Fotos no Google</span>
                    <span className="text-[10px] text-blue-700 font-normal">Galeria completa de imagens</span>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-blue-400 group-hover:text-blue-700 transition-colors" />
              </a>

              <a
                href={youtubeSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3.5 rounded-2xl bg-gradient-to-r from-red-50 to-rose-50 hover:from-red-100 hover:to-rose-100 border border-red-200 text-red-950 text-xs font-bold flex items-center justify-between transition-all group cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Youtube className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block font-bold">Assistir Vídeo / POV</span>
                    <span className="text-[10px] text-red-700 font-normal">Vídeo a bordo completo</span>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-red-400 group-hover:text-red-700 transition-colors" />
              </a>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#1A2B4C] text-[#D4AF37] font-bold text-xs hover:bg-[#243B68] transition-all cursor-pointer shadow-sm"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
