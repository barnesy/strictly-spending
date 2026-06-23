import { useState, useEffect } from 'react';
import { db } from '../../db/drizzle';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';

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

    db.select().from(schema.documentContents).where(eq(schema.documentContents.id, previewId))
      .then((records) => {
        if (!isMounted) return;
        const record = records[0];
        if (record) {
          setLoadedContent(record.content);
          setIsContentLoading(false);
        } else {
          db.select().from(schema.documents).where(eq(schema.documents.id, previewId))
            .then((docRecords) => {
              if (!isMounted) return;
              setLoadedContent((docRecords[0] as any)?.content || null);
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
