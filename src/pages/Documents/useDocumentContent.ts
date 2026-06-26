import { useState, useEffect } from 'react';
import { api } from '../../api';

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

    api.getDocumentContents()
      .then((records) => {
        if (!isMounted) return;
        const record = records.find(r => r.id === previewId);
        if (record) {
          setLoadedContent(record.content);
          setIsContentLoading(false);
        } else {
          api.getDocuments()
            .then((docRecords) => {
              if (!isMounted) return;
              const docRecord = docRecords.find(d => d.id === previewId);
              setLoadedContent((docRecord as any)?.content || null);
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
