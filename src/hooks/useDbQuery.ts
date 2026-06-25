import { useState, useEffect } from 'react';

/**
 * A custom hook to replace dexie-react-hooks' useLiveQuery.
 * It takes a query function (which calls the backend API) and a dependency array.
 * It listens to the global 'db-update' CustomEvent and automatically re-fetches
 * whenever the backend API notifies that a database mutation occurred.
 */
export function useDbQuery<T>(queryFn: () => Promise<T>, deps: any[] = []): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);

  useEffect(() => {
    let active = true;

    const fetch = async () => {
      try {
        const res = await queryFn();
        if (active) setData(res);
      } catch (err) {
        console.error('useDbQuery error:', err);
      }
    };

    // Initial fetch
    fetch();

    // Listen for frontend-triggered mutations
    const listener = () => {
      fetch();
    };
    
    window.addEventListener('db-update', listener);

    return () => {
      active = false;
      window.removeEventListener('db-update', listener);
    };
  }, deps);

  return data;
}
