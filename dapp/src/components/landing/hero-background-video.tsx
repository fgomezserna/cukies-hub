const HERO_POSTER = '/brand/generated/uki-hero-stage-generated.png';
const HERO_IDLE_VIDEO_SM = '/brand/generated/uki-hero-stage-idle-loop-960.mp4';
const HERO_IDLE_VIDEO_MD = '/brand/generated/uki-hero-stage-idle-loop-1464.mp4';
const HERO_IDLE_VIDEO_LG = '/brand/generated/uki-hero-stage-idle-loop-1920.mp4';

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
      <source src={HERO_IDLE_VIDEO_LG} type="video/mp4" media="(min-width: 1440px)" />
      <source src={HERO_IDLE_VIDEO_MD} type="video/mp4" media="(min-width: 768px)" />
      <source src={HERO_IDLE_VIDEO_SM} type="video/mp4" />
    </video>
  );
}
