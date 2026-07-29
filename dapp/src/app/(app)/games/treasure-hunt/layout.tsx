import TreasureHuntExperienceShell from '@/components/games/treasure-hunt-experience-shell';

export default function TreasureHuntLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <TreasureHuntExperienceShell>{children}</TreasureHuntExperienceShell>;
}
