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
