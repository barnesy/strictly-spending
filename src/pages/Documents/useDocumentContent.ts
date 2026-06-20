import { useState, useEffect } from 'react';
import { db } from '../../db';

export function useDocumentContent(previewId: string | null) {
  const [loadedContent, setLoadedContent] = useState<string | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [prevPreviewId, setPrevPreviewId] = useState(previewId);

  if (previewId !== prevPreviewId) {
    setPrevPreviewId(previewId);
    setLoadedContent(null);
    setIsContentLoading(!!previewId);
  }

  useEffect(() => {
    if (!previewId) return;

    let isMounted = true;
    setTimeout(() => { if (isMounted) setIsContentLoading(true); }, 0);

    db.documentContents.get(previewId)
      .then((record) => {
        if (!isMounted) return;
        if (record) {
          setLoadedContent(record.content);
          setIsContentLoading(false);
        } else {
          db.documents.get(previewId)
            .then((docObj) => {
              if (!isMounted) return;
              setLoadedContent(docObj?.content || null);
              setIsContentLoading(false);
            })
            .catch(() => {
              if (isMounted) {
                setLoadedContent(null);
                setIsContentLoading(false);
              }
            });
        }
      })
      .catch((err) => {
        console.error('Error lazy loading content:', err);
        if (isMounted) {
          setIsContentLoading(false);
          setLoadedContent(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [previewId]);

  return { loadedContent, setLoadedContent, isContentLoading };
}
