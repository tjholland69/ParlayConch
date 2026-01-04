import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Newspaper } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
}

export function NewsFeed() {
  const { data: news, isLoading } = useQuery<NewsItem[]>({
    queryKey: ["/api/news"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-blue-500" />
            NFL News
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-blue-500" />
          NFL News
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {news?.slice(0, 8).map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 rounded-lg hover-elevate transition-colors"
            data-testid={`news-item-${item.id}`}
          >
            <div className="flex gap-3">
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="w-16 h-16 object-cover rounded-md flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm leading-tight line-clamp-2 flex items-start gap-1">
                  {item.title}
                  <ExternalLink className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          </a>
        ))}
      </CardContent>
    </Card>
  );
}
