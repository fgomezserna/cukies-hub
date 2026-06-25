import { ArrowRight, Lock, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
  external?: boolean;
};

export function LandingButton({ href, children, variant = 'primary', className = '', external = false }: ButtonProps) {
  const variantClass = {
    primary: 'uki-button-primary',
    secondary: 'uki-button-secondary',
    ghost: 'uki-button-ghost',
  }[variant];

  return (
    <a
      href={href}
      className={`uki-button ${variantClass} ${className}`}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
    >
      <span>{children}</span>
      <span className="uki-button-icon" aria-hidden="true">
        <ArrowRight className="h-4 w-4" />
      </span>
    </a>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'left',
  tone = 'cream',
  withRule = false,
  className = '',
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: string;
  align?: 'left' | 'center';
  tone?: 'cream' | 'cyan';
  withRule?: boolean;
  className?: string;
}) {
  return (
    <div className={`${align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'} ${className}`}>
      {eyebrow ? <p className="uki-eyebrow">{eyebrow}</p> : null}
      <h2 className={`uki-section-title ${tone === 'cyan' ? 'uki-section-title-cyan' : ''}`}>
        <span>{title}</span>
        {withRule ? <span className="uki-heading-rule" aria-hidden="true" /> : null}
      </h2>
      {subtitle ? <p className="mt-3 text-sm leading-relaxed text-[var(--uki-muted)] sm:text-base">{subtitle}</p> : null}
    </div>
  );
}

export function Panel({
  children,
  className = '',
  innerClassName = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  id?: string;
}) {
  return (
    <div id={id} className={`uki-panel-shell ${className}`}>
      <div className={`uki-panel-core ${innerClassName}`}>{children}</div>
    </div>
  );
}

export function MetricTile({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <article className="uki-metric-tile">
      <Icon className="h-9 w-9 text-[var(--uki-cyan)]" strokeWidth={1.8} />
      <div>
        <p className="uki-label">{label}</p>
        <p className="mt-1 font-headline text-lg font-black uppercase leading-tight text-[var(--uki-cream)]">{value}</p>
        {helper ? <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">{helper}</p> : null}
      </div>
    </article>
  );
}

export function TokenCoin({
  label,
  tone = 'cyan',
  size = 'md',
}: {
  label: string;
  tone?: 'cyan' | 'gold' | 'purple' | 'bsc';
  size?: 'sm' | 'md' | 'lg';
}) {
  const toneClass = {
    cyan: 'uki-token-cyan',
    gold: 'uki-token-gold',
    purple: 'uki-token-purple',
    bsc: 'uki-token-bsc',
  }[tone];
  const sizeClass = {
    sm: 'uki-token-sm',
    md: 'uki-token-md',
    lg: 'uki-token-lg',
  }[size];

  return <span className={`uki-token-coin ${toneClass} ${sizeClass}`}>{label}</span>;
}

export function ProgressTrack({
  color,
  labels,
}: {
  color: string;
  labels: string[];
}) {
  return (
    <div>
      <div className="uki-progress">
        <span className="uki-progress-fill" style={{ background: `linear-gradient(90deg, ${color}22, ${color})` }} />
        <span className="uki-progress-lock" aria-hidden="true">
          <Lock className="h-3 w-3" strokeWidth={2} />
        </span>
      </div>
      <div className="mt-3 flex justify-between gap-2 text-[0.65rem] font-semibold text-[var(--uki-muted)]">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}
