import React, { useState, useEffect } from 'react';
import { loadImageFromDB } from '../utils/imageStore';

export default function AsyncImage({ src, alt, className, fallbackLayout }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    if (!src) {
      if (isMounted) {
        setDataUrl(null);
        setLoading(false);
      }
      return;
    }

    if (src.startsWith('idb://')) {
      if (isMounted) setLoading(true);
      loadImageFromDB(src).then((result) => {
        if (isMounted) {
          setDataUrl(result);
          setLoading(false);
        }
      }).catch((err) => {
        console.error("AsyncImage error:", err);
        if (isMounted) {
          setDataUrl(null);
          setLoading(false);
        }
      });
    } else {
      // It's a normal URL or base64
      if (isMounted) {
        setDataUrl(src);
        setLoading(false);
      }
    }
    
    return () => {
      isMounted = false;
    };
  }, [src]);

  if (loading) {
    return (
      <div className={`animate-pulse bg-cyan-900/30 ${className}`}>
        {fallbackLayout}
      </div>
    );
  }

  if (!dataUrl) {
    return fallbackLayout ? (
      <div className={`${className}`}>{fallbackLayout}</div>
    ) : null;
  }

  return <img src={dataUrl} alt={alt || ''} className={className} />;
}
