'use client';

import Link, { LinkProps } from 'next/link';
import { usePathname } from 'next/navigation';

// This is a simple wrapper around Next.js's Link component.
// In some complex client-side scenarios, ensuring a component is fully client-side
// can help prevent hydration or routing issues.
export function ClientLink({ href, children, ...props }: LinkProps & { children: React.ReactNode }) {
  const pathname = usePathname();
  
  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
} 