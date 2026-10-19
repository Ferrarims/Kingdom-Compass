import { useEffect } from 'react';

interface UseConfirmationKeyboardOptions {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  enabled?: boolean;
}

/**
 * Hook para adicionar atalhos de teclado globais em telas e modais de confirmação:
 * - Pressionar [Enter]: Executa a confirmação (onConfirm)
 * - Pressionar [Esc]: Executa o cancelamento/fechamento (onCancel)
 */
export function useConfirmationKeyboard({
  isOpen,
  onConfirm,
  onCancel,
  enabled = true,
}: UseConfirmationKeyboardOptions) {
  useEffect(() => {
    if (!isOpen || !enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter') {
        // Se o usuário estiver focado em um campo de texto ou textarea, não interceptar
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
    };

    // Usando captura (true) para garantir prioridade sobre outros handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onConfirm, onCancel, enabled]);
}
