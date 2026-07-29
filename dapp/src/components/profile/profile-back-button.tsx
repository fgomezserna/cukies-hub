'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

export default function ProfileBackButton() {
  const router = useRouter();

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/games/treasure-hunt');
  };

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={goBack}
      className="-ml-3 inline-flex min-h-11 items-center gap-2 text-slate-300 hover:bg-white/5 hover:text-emerald-200"
      aria-label="Volver a la pantalla anterior"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Volver
    </Button>
  );
}
