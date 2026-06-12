'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { LandingWalletConnectButton } from './wallet-connect-dynamic';

const navItems = [
  { label: 'Inicio', href: '/' },
  { label: 'Premios', href: '/premios' },
  { label: 'Vesting', href: '/vesting' },
];

export function LandingHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial state

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <>
      <header className={`uki-landing-header ${isScrolled ? 'is-scrolled' : ''}`}>
        <nav className="uki-container flex h-[5.7rem] items-center justify-between">
          <Link href="/" className="uki-header-logo relative block h-[5.1rem] w-48 overflow-hidden" aria-label="Inicio Cukies World" onClick={closeMenu}>
            <Image src="/Cukie_logo_first.png" alt="Cukies World" fill className="object-contain object-left" sizes="11rem" priority />
          </Link>

          {/* Menú de Desktop */}
          <div className="hidden items-center gap-6 lg:flex">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`uki-nav-link ${isActive ? 'is-active' : ''}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="hidden items-center lg:block">
            <LandingWalletConnectButton />
          </div>

          {/* Botón de Menú Móvil */}
          <button
            className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-white/10 bg-white/5 text-[var(--uki-cyan)] hover:bg-white/10 lg:hidden"
            onClick={toggleMenu}
            aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </header>

      {/* Drawer del Menú Móvil */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-64 transform border-l border-white/10 bg-[#060a12]/95 p-6 shadow-[0_0_40px_rgba(228,92,255,0.15)] backdrop-blur-md transition-transform duration-300 ease-in-out lg:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <span className="font-headline text-lg font-black uppercase text-[var(--uki-cyan)]">Menú</span>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-white/10 bg-white/5 text-[var(--uki-muted)] hover:text-white"
                onClick={closeMenu}
                aria-label="Cerrar menú"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-col gap-4">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMenu}
                    className={`font-headline text-xl font-black uppercase tracking-[0.04em] transition ${
                      isActive ? 'text-[var(--uki-cyan)]' : 'text-[var(--uki-cream)] hover:text-[var(--uki-cyan)]'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="pt-6 border-t border-white/10" onClick={closeMenu}>
            <LandingWalletConnectButton />
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={closeMenu}
        />
      )}
    </>
  );
}
