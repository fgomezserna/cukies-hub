import { DailyCheckin } from "@/components/daily-checkin";

export default function Home() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <h1 className="text-3xl font-bold">Welcome to Hyppie Gambling</h1>
        <p className="text-muted-foreground mt-2">
          Explore the games, complete quests to earn XP, and climb the leaderboard!
        </p>
        {/* Future content like featured games or quests can go here */}
      </div>
      <aside className="space-y-6">
        <DailyCheckin />
      </aside>
    </div>
  );
}
