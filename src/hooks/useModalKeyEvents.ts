import React, { useEffect, useCallback } from 'react';

export interface UseModalKeyEventsProps {
  isOpen?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onSave?: () => void | Promise<void>;
  /**
   * If true, Enter key will not trigger onSave/onClose when focus is inside a textarea or certain elements,
   * but Ctrl+Enter or Cmd+Enter will still trigger save.
   * Defaults to true.
   */
  ignoreInTextarea?: boolean;
  enabled?: boolean;
}

export function useModalKeyEvents({
  isOpen = true,
  onClose,
  onCancel,
  onSave,
  ignoreInTextarea = true,
  enabled = true,
}: UseModalKeyEventsProps) {
  const handleCancelOrClose = useCallback(() => {
    if (onCancel) {
      onCancel();
    } else if (onClose) {
      onClose();
    }
  }, [onCancel, onClose]);

  const handleSaveOrClose = useCallback(() => {
    if (onSave) {
      onSave();
    } else if (onClose) {
      onClose();
    } else if (onCancel) {
      onCancel();
    }
  }, [onSave, onClose, onCancel]);

  useEffect(() => {
    if (!isOpen || !enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextarea = target?.tagName === 'TEXTAREA';
      const isEditable = target?.isContentEditable;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancelOrClose();
        return;
      }

      if (e.key === 'Enter') {
        // If it's a textarea or contentEditable, allow normal line break unless Ctrl/Cmd is held
        if (ignoreInTextarea && (isTextarea || isEditable)) {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            handleSaveOrClose();
          }
          return;
        }

        // If focus is specifically on a cancel/close button, let standard button click handle it
        if (target && target.tagName === 'BUTTON') {
          const btnText = (target.textContent || '').trim().toLowerCase();
          const btnTitle = (target.getAttribute('title') || '').toLowerCase();
          if (btnText.includes('cancelar') || btnTitle.includes('fechar') || target.classList.contains('close-btn')) {
            return;
          }
        }

        // Trigger save (or close if no save action exists)
        e.preventDefault();
        e.stopPropagation();
        handleSaveOrClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, enabled, handleCancelOrClose, handleSaveOrClose, ignoreInTextarea]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        e.preventDefault();
        e.stopPropagation();
        handleCancelOrClose();
      }
    },
    [handleCancelOrClose]
  );

  return {
    handleBackdropClick,
    handleCancelOrClose,
    handleSaveOrClose,
  };
}

