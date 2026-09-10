"use client";

import Image, { type ImageProps } from 'next/image';
import React from 'react';

import { gamePublicPath } from '../lib/public-path';

const PUBLIC_ASSET_ROOT = gamePublicPath('/assets/');

/**
 * Public game assets are served by the game application below its base path.
 * Keep protocol-relative, remote and statically imported images on Next's
 * original path and optimization semantics.
 */
export function isLocalGameAsset(src: ImageProps['src']): src is string {
  return (
    typeof src === 'string' &&
    (src.startsWith('/assets/') || src.startsWith(PUBLIC_ASSET_ROOT))
  );
}

export function resolveGameImageProps(props: ImageProps): ImageProps {
  if (!isLocalGameAsset(props.src)) return props;

  return {
    ...props,
    src: gamePublicPath(props.src),
    unoptimized: true,
  };
}

export const GameImage = React.forwardRef<HTMLImageElement, ImageProps>(
  function GameImage(props, ref) {
    const resolvedProps = resolveGameImageProps(props);
    return <Image ref={ref} {...resolvedProps} alt={resolvedProps.alt} />;
  },
);

GameImage.displayName = 'GameImage';
