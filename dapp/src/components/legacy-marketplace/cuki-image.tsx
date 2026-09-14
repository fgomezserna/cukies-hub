'use client';

import { useState } from 'react';
import Image from 'next/image';

type CukiImageProps = {
  src?: string | null;
  alt: string;
  priority?: boolean;
  sizes: string;
  className?: string;
};

export function CukiImage({
  src,
  alt,
  priority = false,
  sizes,
  className = 'object-cover',
}: CukiImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_35%_25%,rgba(214,75,235,0.16),transparent_42%),linear-gradient(145deg,#1a0e25,#0d0914)] p-8">
        <Image
          src="/Cukie_logo_first.png"
          alt="Cukies World"
          width={220}
          height={96}
          className="object-contain opacity-80"
        />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}
