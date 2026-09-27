/**
 * BaithakOS — Mobile Hardware / Gesture Back Button Handler
 *
 * Ensures that pressing the Android back button or swiping back on iOS
 * closes active modals, drawers, or sub-views rather than exiting the PWA.
 *
 * Safeguards:
 * - Does NOT trigger cleanup or pop history on re-renders / form inputs.
 * - Only pops history when closed from UI or unmounted if the modal is still on top of history.
 */

import { useEffect, useRef } from 'react';

export function useMobileBackHandler(
  isOpen: boolean,
  onClose: () => void,
  stateKey: string
) {
  // Store onClose in a ref so changes to onClose reference NEVER re-trigger effects
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const isPushedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isOpen) {
      // Push history state exactly once when modal opens
      if (!isPushedRef.current) {
        window.history.pushState({ baithak_modal: stateKey }, '');
        isPushedRef.current = true;
      }

      const handlePopState = (event: PopStateEvent) => {
        // Intercept back button and trigger close handler
        if (isPushedRef.current) {
          isPushedRef.current = false;
          onCloseRef.current();
        }
      };

      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    } else {
      // Modal was closed via UI (close button, backdrop tap, or form submit)
      if (isPushedRef.current) {
        isPushedRef.current = false;
        // Clean up history entry only if this modal is currently on top of the stack
        if (window.history.state?.baithak_modal === stateKey) {
          window.history.back();
        }
      }
    }
  }, [isOpen, stateKey]);

  // Clean up if component unmounts while modal was still open
  useEffect(() => {
    return () => {
      if (isPushedRef.current) {
        isPushedRef.current = false;
        if (typeof window !== 'undefined' && window.history.state?.baithak_modal === stateKey) {
          window.history.back();
        }
      }
    };
  }, [stateKey]);
}
