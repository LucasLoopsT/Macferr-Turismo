'use client';

import { useEffect, useState } from 'react';

// <img> com fallback em gradiente quando a URL falha ou está vazia.
export default function SafeImg({ src, alt, className = '' }: { src?: string; alt: string; className?: string }) {
  const [erro, setErro] = useState(false);
  useEffect(() => setErro(false), [src]);

  if (erro || !src) {
    return <div role="img" aria-label={alt} className={`bg-gradient-to-br from-violet-200 to-violet-500 ${className}`} />;
  }
  return <img src={src} alt={alt} loading="lazy" className={className} onError={() => setErro(true)} />;
}
