const HERO_POSTER = '/brand/generated/uki-hero-stage-generated.png';
const HERO_IDLE_VIDEO = '/brand/generated/uki-hero-stage-idle-loop.mp4';

export function HeroBackgroundVideo() {
  return (
    <video
      className="uki-hero-bg uki-hero-bg-video"
      poster={HERO_POSTER}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
    >
      <source src={HERO_IDLE_VIDEO} type="video/mp4" />
    </video>
  );
}
