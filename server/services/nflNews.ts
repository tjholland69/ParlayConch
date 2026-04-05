interface ESPNArticle {
  headline: string;
  description: string;
  published: string;
  links: {
    web: { href: string };
  };
  images?: { url: string; caption?: string }[];
}

interface ESPNNewsResponse {
  articles: ESPNArticle[];
}

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
  tag?: string;
}

export async function fetchNFLNews(limit: number = 10): Promise<NewsItem[]> {
  const url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=" + limit;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status}`);
  }

  const data: ESPNNewsResponse = await response.json();
  
  return data.articles.map((article, index) => ({
    id: `espn-${index}-${Date.now()}`,
    title: article.headline,
    description: article.description || "",
    url: article.links?.web?.href || "",
    imageUrl: article.images?.[0]?.url,
    publishedAt: article.published,
  }));
}

interface ESPNInjuryAthlete {
  firstName: string;
  lastName: string;
  position?: { abbreviation: string };
  headshot?: { href: string };
}

interface ESPNInjury {
  id: string;
  longComment: string;
  shortComment: string;
  status: string;
  date: string;
  athlete: ESPNInjuryAthlete;
  source?: { id: number; description: string };
  type?: { id: string; description: string };
}

interface ESPNInjuryGroup {
  id: string;
  displayName: string;
  injuries: ESPNInjury[];
}

interface ESPNInjuriesResponse {
  injuries: ESPNInjuryGroup[];
}

const INJURY_STATUS_TAGS: Record<string, string> = {
  Out: "Out",
  Doubtful: "Doubtful",
  Questionable: "Questionable",
  "Injured Reserve": "IR",
  "Active": "Active",
  "Day-To-Day": "Day-To-Day",
};

export async function fetchNFLInjuries(): Promise<NewsItem[]> {
  const url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN Injuries API error: ${response.status}`);
  }

  const data: ESPNInjuriesResponse = await response.json();
  const items: NewsItem[] = [];

  for (const group of data.injuries ?? []) {
    for (const inj of group.injuries ?? []) {
      const name = `${inj.athlete?.firstName ?? ""} ${inj.athlete?.lastName ?? ""}`.trim();
      const position = inj.athlete?.position?.abbreviation;
      const teamName = group.displayName;
      const status = inj.status ?? "";
      const tag = INJURY_STATUS_TAGS[status] ?? status;

      const titleParts = [name];
      if (position) titleParts.push(`(${position})`);
      titleParts.push(`— ${teamName}`);

      items.push({
        id: `inj-${inj.id}`,
        title: titleParts.join(" "),
        description: inj.shortComment || inj.longComment || "",
        url: "",
        imageUrl: inj.athlete?.headshot?.href,
        publishedAt: inj.date,
        tag,
      });
    }
  }

  // Sort: Out > IR > Doubtful > Day-To-Day > Questionable > others, then by date desc
  const ORDER: Record<string, number> = { Out: 0, "Injured Reserve": 1, Doubtful: 2, "Day-To-Day": 3, Questionable: 4 };
  items.sort((a, b) => {
    const oa = ORDER[a.tag ?? ""] ?? 99;
    const ob = ORDER[b.tag ?? ""] ?? 99;
    if (oa !== ob) return oa - ob;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  // Only return the most notable injuries (cap at 60 to avoid huge payloads)
  return items.filter((i) => i.tag !== "Active").slice(0, 60);
}

interface ESPNCompetitor {
  team: { abbreviation: string; displayName: string; logo?: string };
  score?: string;
  homeAway: "home" | "away";
}

interface ESPNEvent {
  id: string;
  name: string;
  shortName: string;
  date: string;
  week?: { number: number };
  status: { type: { description: string; completed: boolean } };
  competitions: {
    competitors: ESPNCompetitor[];
    notes?: { headline?: string }[];
  }[];
  links?: { href: string }[];
}

interface ESPNScoreboardResponse {
  events: ESPNEvent[];
  week?: { number: number };
  season?: { year: number; type: number };
}

export async function fetchNFLScores(): Promise<NewsItem[]> {
  const url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=16";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN Scoreboard API error: ${response.status}`);
  }

  const data: ESPNScoreboardResponse = await response.json();
  const items: NewsItem[] = [];

  for (const event of data.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const home = comp.competitors?.find((c) => c.homeAway === "home");
    const away = comp.competitors?.find((c) => c.homeAway === "away");
    if (!home || !away) continue;

    const statusDesc = event.status?.type?.description ?? "";
    const completed = event.status?.type?.completed ?? false;

    let title: string;
    let description: string;

    if (completed) {
      const winnerScore = Math.max(Number(home.score ?? 0), Number(away.score ?? 0));
      const loserScore = Math.min(Number(home.score ?? 0), Number(away.score ?? 0));
      const winner = Number(home.score ?? 0) >= Number(away.score ?? 0) ? home : away;
      const loser = winner === home ? away : home;
      title = `${winner.team.abbreviation} def. ${loser.team.abbreviation} ${winnerScore}-${loserScore}`;
      description = `${away.team.displayName} ${away.score} @ ${home.team.displayName} ${home.score}`;
    } else {
      title = `${away.team.abbreviation} @ ${home.team.abbreviation}`;
      description = statusDesc || "Scheduled";
    }

    const noteHeadline = comp.notes?.[0]?.headline;
    if (noteHeadline) description = `${noteHeadline} — ${description}`;

    items.push({
      id: `score-${event.id}`,
      title,
      description,
      url: event.links?.[0]?.href ?? "",
      publishedAt: event.date,
      tag: completed ? "Final" : statusDesc || "Upcoming",
    });
  }

  return items;
}
