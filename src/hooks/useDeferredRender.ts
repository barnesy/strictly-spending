import { useState, useEffect, startTransition } from 'react';

/**
 * Defers rendering of expensive components to allow navigation or initial
 * mount to paint immediately without freezing the main thread.
 * 
 * @param delayMs Optional delay before allowing render. 0 uses requestAnimationFrame.
 * @returns true when the component should start its heavy rendering
 */
export function useDeferredRender(delayMs = 0) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    let timerId: number | ReturnType<typeof setTimeout>;

    if (delayMs > 0) {
      timerId = setTimeout(() => {
        startTransition(() => {
          setShouldRender(true);
        });
      }, delayMs);
    } else {
      timerId = requestAnimationFrame(() => {
        // Wait one frame to ensure the browser paints the loading state
        requestAnimationFrame(() => {
          startTransition(() => {
            setShouldRender(true);
          });
        });
      });
    }

    return () => {
      if (delayMs > 0) {
        clearTimeout(timerId as ReturnType<typeof setTimeout>);
      } else {
        cancelAnimationFrame(timerId as number);
      }
    };
  }, [delayMs]);

  return shouldRender;
}
