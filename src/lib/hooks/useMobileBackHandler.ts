/**
 * BaithakOS — Mobile Hardware / Gesture Back Button Handler
 *
 * Ensures that pressing the Android back button or swiping back on iOS
 * closes active modals, drawers, or sub-views rather than exiting the PWA.
 */

import { useEffect, useRef } from 'react';

export function useMobileBackHandler(
  isOpen: boolean,
  onClose: () => void,
  stateKey: string
) {
  const isPushedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isOpen) {
      // Push history entry when modal/drawer opens
      window.history.pushState({ baithak_modal: stateKey }, '');
      isPushedRef.current = true;

      const handlePopState = (event: PopStateEvent) => {
        // Intercept back button and trigger close handler
        if (isPushedRef.current) {
          isPushedRef.current = false;
          onClose();
        }
      };

      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
        // If closed via UI button rather than back button, clean up history entry
        if (isPushedRef.current) {
          isPushedRef.current = false;
          window.history.back();
        }
      };
    }
  }, [isOpen, onClose, stateKey]);
}
