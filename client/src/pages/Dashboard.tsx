import { Tile1Stats } from "@/components/dashboard/Tile1Stats";
import { Tile2Performance } from "@/components/dashboard/Tile2Performance";
import { NewsFeed } from "@/components/NewsFeed";

export default function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <Tile1Stats />
      <Tile2Performance />
      <NewsFeed />
    </div>
  );
}
