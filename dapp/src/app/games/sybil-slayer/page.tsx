'use client';

import { Button } from "@/components/ui/button";
import { ArrowLeft, Maximize } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function SybilSlayerPage() {
  const router = useRouter();
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const handleFullScreen = () => {
    const iframe = gameContainerRef.current?.querySelector('iframe');
    if (!iframe) return;

    if (!document.fullscreenElement) {
      iframe.requestFullscreen().catch(err => {
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
      setIsFullScreen(true);
    } else {
      document.exitFullscreen();
      setIsFullScreen(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <div className="flex items-center p-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold ml-4">Sybil Slayer</h1>
        <Button variant="outline" size="sm" onClick={handleFullScreen} className="ml-auto">
          <Maximize className="mr-2 h-4 w-4" />
          {isFullScreen ? "Salir de Pantalla Completa" : "Pantalla Completa"}
        </Button>
      </div>
      <div ref={gameContainerRef} className="flex-1 bg-black flex items-center justify-center overflow-hidden">
        <iframe
          src="/games/sybil-slayer/play"
          className="w-full h-full border-0"
          title="Sybil Slayer Game"
          allowFullScreen
        ></iframe>
      </div>
    </div>
  );
} 