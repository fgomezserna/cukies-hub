"use client";

import Image from 'next/image';
import React from 'react';

import { BASE_GAME_HEIGHT, BASE_GAME_WIDTH } from '../lib/constants';
import { InfoIcon, MusicIcon, VolumeIcon, VolumeMutedIcon } from './treasure-icons';

type TreasureButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';
type TreasureButtonSize = 'large' | 'medium' | 'small';

interface TreasureButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TreasureButtonVariant;
  size?: TreasureButtonSize;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

interface TreasureStageProps {
  scale: number;
  children: React.ReactNode;
  label?: string;
}

interface TreasureTopBarProps {
  musicEnabled: boolean;
  soundsEnabled: boolean;
  onMusicToggle: () => void;
  onSoundsToggle: () => void;
  onInfo: () => void;
  infoDisabled?: boolean;
}

interface HeartMeterProps {
  value: number;
  max: number;
  compact?: boolean;
}

interface HudMetricProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'teal' | 'warning' | 'danger' | 'success';
  className?: string;
}

interface PlayerPortraitProps {
  src: string;
  label: string;
  status?: string;
  tone?: 'local' | 'opponent';
  dimmed?: boolean;
}

const joinClasses = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export function TreasureStage({ scale, children, label = 'Treasure Hunt' }: TreasureStageProps) {
  return (
    <div className="th-viewport">
      <div
        className="th-stage-slot"
        style={{ width: BASE_GAME_WIDTH * scale, height: BASE_GAME_HEIGHT * scale }}
      >
        <section
          className="th-stage"
          data-testid="treasure-hunt-stage"
          aria-label={label}
          style={{ transform: `scale(${scale})` }}
        >
          {children}
        </section>
      </div>
    </div>
  );
}

export const TreasureButton = React.forwardRef<HTMLButtonElement, TreasureButtonProps>(
  function TreasureButton(
    {
      variant = 'primary',
      size = 'medium',
      icon,
      fullWidth = false,
      className,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={joinClasses(
          'th-button',
          `th-button--${variant}`,
          `th-button--${size}`,
          fullWidth && 'th-button--full',
          className,
        )}
        {...props}
      >
        {icon ? <span className="th-button__icon" aria-hidden="true">{icon}</span> : null}
        <span className="th-button__label">{children}</span>
      </button>
    );
  },
);

export function TreasurePanel({
  children,
  className,
  tone = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: 'default' | 'danger' | 'warning' }) {
  return (
    <div
      className={joinClasses('th-panel', `th-panel--${tone}`, className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function TreasureTopBar({
  musicEnabled,
  soundsEnabled,
  onMusicToggle,
  onSoundsToggle,
  onInfo,
  infoDisabled = false,
}: TreasureTopBarProps) {
  return (
    <header className="th-topbar">
      <div className="th-brand-lockup">
        <span className="th-brand-lockup__world">Cukies World</span>
        <span className="th-brand-lockup__divider" aria-hidden="true" />
        <span className="th-brand-lockup__game">Treasure Hunt</span>
      </div>
      <div className="th-topbar__actions" role="group" aria-label="Controles de audio e información">
        <button
          type="button"
          className="th-topbar-button"
          onClick={onMusicToggle}
          aria-pressed={musicEnabled}
          aria-label={musicEnabled ? 'Desactivar música' : 'Activar música'}
        >
          <MusicIcon aria-hidden="true" width={20} height={20} strokeWidth={2.4} />
          <span>Música</span>
        </button>
        <button
          type="button"
          className="th-topbar-button"
          onClick={onSoundsToggle}
          aria-pressed={soundsEnabled}
          aria-label={soundsEnabled ? 'Desactivar efectos' : 'Activar efectos'}
        >
          {soundsEnabled ? (
            <VolumeIcon aria-hidden="true" width={20} height={20} strokeWidth={2.4} />
          ) : (
            <VolumeMutedIcon aria-hidden="true" width={20} height={20} strokeWidth={2.4} />
          )}
          <span>Efectos</span>
        </button>
        <button
          type="button"
          className="th-topbar-button"
          onClick={onInfo}
          disabled={infoDisabled}
          aria-label="Abrir reglas"
        >
          <InfoIcon aria-hidden="true" width={20} height={20} strokeWidth={2.4} />
          <span>Info</span>
        </button>
      </div>
    </header>
  );
}

export function HeartMeter({ value, max, compact = false }: HeartMeterProps) {
  return (
    <div
      className={joinClasses('th-hearts', compact && 'th-hearts--compact')}
      role="status"
      aria-live="polite"
      aria-label={`${value} de ${max} vidas`}
    >
      {Array.from({ length: max }).map((_, index) => (
        <Image
          key={index}
          src="/assets/collectibles/corazoncukies.png"
          alt=""
          width={compact ? 28 : 34}
          height={compact ? 28 : 34}
          className={joinClasses('th-heart', index >= value && 'th-heart--empty')}
        />
      ))}
    </div>
  );
}

export function HudMetric({ label, value, icon, tone = 'default', className }: HudMetricProps) {
  return (
    <div className={joinClasses('th-hud-metric', `th-hud-metric--${tone}`, className)}>
      {icon ? <span className="th-hud-metric__icon" aria-hidden="true">{icon}</span> : null}
      <span className="th-hud-metric__copy">
        <span className="th-hud-metric__label">{label}</span>
        <span className="th-hud-metric__value">{value}</span>
      </span>
    </div>
  );
}

export function PlayerPortrait({
  src,
  label,
  status,
  tone = 'local',
  dimmed = false,
}: PlayerPortraitProps) {
  return (
    <div className={joinClasses('th-player', `th-player--${tone}`, dimmed && 'th-player--dimmed')}>
      <div className="th-player__portrait">
        <Image src={src} alt="" width={280} height={280} className="th-player__image" />
      </div>
      <strong className="th-player__label">{label}</strong>
      {status ? <span className="th-player__status">{status}</span> : null}
    </div>
  );
}

export function OrnamentalDivider({ danger = false }: { danger?: boolean }) {
  return (
    <span className={joinClasses('th-divider', danger && 'th-divider--danger')} aria-hidden="true">
      <span />
      <i />
      <span />
    </span>
  );
}

export function StageBackdrop({ variant = 'menu' }: { variant?: 'menu' | 'game' }) {
  return <div className={joinClasses('th-backdrop', `th-backdrop--${variant}`)} aria-hidden="true" />;
}

export { joinClasses };
