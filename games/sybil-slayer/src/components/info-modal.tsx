"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { SoundType } from '@/hooks/useAudio';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlaySound?: (soundType: SoundType) => void;
}

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, onPlaySound }) => {
  const [currentPage, setCurrentPage] = useState(0);

  // Array con la información de cada página
  const pages = [
    {
      image: "/assets/ui/buttons/controls_info.png",
      alt: "Información sobre controles del juego"
    },
    {
      image: "/assets/ui/buttons/coin_info.png",
      alt: "Información sobre monedas"
    },
    {
      image: "/assets/ui/buttons/hippie_info.png", 
      alt: "Información sobre Hyppie"
    },
    {
      image: "/assets/ui/buttons/whale_info.png",
      alt: "Información sobre ballenas"
    },
    {
      image: "/assets/ui/buttons/cz_info.png",
      alt: "Información sobre CZ"
    },
    {
      image: "/assets/ui/buttons/purr_info.png",
      alt: "Información sobre Purr"
    },
    {
      image: "/assets/ui/buttons/trump_info.png",
      alt: "Información sobre Trump"
    },
    {
      image: "/assets/ui/buttons/vaul_info.png",
      alt: "Información sobre Vaul"
    },
    {
      image: "/assets/ui/buttons/wallet_info.png",
      alt: "Información sobre Evil Wallet"
    }
  ];

  const handlePrevPage = () => {
    onPlaySound?.('button_click');
    setCurrentPage((prev) => prev === 0 ? pages.length - 1 : prev - 1);
  };

  const handleNextPage = () => {
    onPlaySound?.('button_click');
    setCurrentPage((prev) => prev === pages.length - 1 ? 0 : prev + 1);
  };

  const handleClose = () => {
    onPlaySound?.('button_click');
    setCurrentPage(0); // Reset to first page when closing
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[80] p-4"
      onClick={handleClose} // Click outside to close
    >
      <div 
        className="relative bg-transparent w-full max-w-5xl h-full max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        {/* Contenedor principal con espaciado */}
        <div className="relative w-full h-full flex items-center justify-center">
          
          {/* Botón izquierdo - Página anterior - MÁS SEPARADO */}
          <button
            onClick={handlePrevPage}
            className="absolute left-4 top-1/2 transform -translate-y-1/2 focus:outline-none hover:scale-110 transition-transform z-20"
            aria-label="Página anterior"
            style={{ marginRight: '200px' }} // Aumentado de 120px a 200px
          >
            <Image
              src="/assets/ui/buttons/button_left.png"
              alt="Anterior"
              width={80}
              height={80}
              className="game-img"
            />
          </button>

          {/* Imagen principal de información - CENTRADA Y FIJA con más espacio */}
          <div className="flex items-center justify-center w-full h-full px-32"> {/* Añadido padding horizontal */}
            <div className="relative flex items-center justify-center"> {/* Contenedor fijo sin max-w ni max-h */}
              {/* Contenedor con tamaño fijo para todas las imágenes */}
              <div 
                className="relative bg-transparent flex items-center justify-center"
                style={{
                  width: '700px',  // Tamaño fijo horizontal
                  height: '525px', // Tamaño fijo vertical
                  overflow: 'hidden' // Para recortar si es necesario
                }}
              >
                <Image
                  src={pages[currentPage].image}
                  alt={pages[currentPage].alt}
                  fill // Usar fill para llenar el contenedor
                  className="object-contain" // Mantener proporción sin recortar
                  priority
                  style={{
                    objectPosition: 'center' // Centrar la imagen
                  }}
                />
              </div>
              
              {/* Botón de cerrar (esquina superior derecha del contenedor fijo) */}
              <button
                onClick={handleClose}
                className="absolute focus:outline-none hover:scale-110 transition-transform z-30 bg-black bg-opacity-50 rounded-full p-2"
                aria-label="Cerrar información"
                style={{ 
                  top: '-60px',    // Más separación hacia arriba 
                  right: '-60px',  // Más separación hacia la derecha
                  margin: '8px'    // Margen adicional
                }}
              >
                <Image
                  src="/assets/ui/buttons/out.png"
                  alt="Cerrar"
                  width={50}
                  height={50}
                  className="game-img"
                />
              </button>
            </div>
          </div>

          {/* Botón derecho - Página siguiente - MÁS SEPARADO */}
          <button
            onClick={handleNextPage}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 focus:outline-none hover:scale-110 transition-transform z-20"
            aria-label="Página siguiente"
            style={{ marginLeft: '200px' }} // Aumentado de 120px a 200px
          >
            <Image
              src="/assets/ui/buttons/button_right.png"
              alt="Siguiente"
              width={80}
              height={80}
              className="game-img"
            />
          </button>

        </div>

        {/* Indicador de página - SEPARADO con margen */}
        <div 
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex space-x-3 z-20"
          style={{ marginTop: '24px' }} // Margen adicional desde la imagen
        >
          {pages.map((_, index) => (
            <div
              key={index}
              className={`w-4 h-4 rounded-full transition-all duration-300 ${
                index === currentPage 
                  ? 'bg-white border-2 border-blue-400 shadow-lg scale-125' 
                  : 'bg-gray-500 border-2 border-gray-400 hover:bg-gray-400'
              }`}
              style={{ 
                margin: '0 4px',
                boxShadow: index === currentPage ? '0 0 10px rgba(59, 130, 246, 0.5)' : 'none'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default InfoModal; 