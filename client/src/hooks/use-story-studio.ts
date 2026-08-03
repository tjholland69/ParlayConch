import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  AnalyticsReport,
  StoryCandidate,
  StoryReportWithSections,
  StorySection,
  StorySectionKind,
} from "@shared/schema";

export function useStoryAnalytics(leagueId: number | undefined, weekId: number | undefined) {
  return useQuery<AnalyticsReport>({
    queryKey: [api.storyStudio.analytics.path, leagueId, weekId],
    queryFn: async () => {
      const url = `${api.storyStudio.analytics.path}?leagueId=${leagueId}&weekId=${weekId}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load weekly analytics");
      return res.json();
    },
    enabled: !!leagueId && !!weekId,
  });
}

export function useStoryCandidates(leagueId: number | undefined, weekId: number | undefined) {
  return useQuery<StoryCandidate[]>({
    queryKey: [api.storyStudio.candidates.path, leagueId, weekId],
    queryFn: async () => {
      const url = `${api.storyStudio.candidates.path}?leagueId=${leagueId}&weekId=${weekId}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load story candidates");
      return res.json();
    },
    enabled: !!leagueId && !!weekId,
  });
}

export function useStoryReport(reportId: number | undefined) {
  return useQuery<StoryReportWithSections>({
    queryKey: [api.storyStudio.getReport.path, reportId],
    queryFn: async () => {
      const url = buildUrl(api.storyStudio.getReport.path, { id: reportId! });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load report");
      return res.json();
    },
    enabled: !!reportId,
  });
}

export function useCreateStoryReport() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: {
      leagueId: number;
      weekId: number;
      selectedStory: StoryCandidate;
      thesis: string;
      tone: string;
    }) => {
      const res = await apiRequest("POST", api.storyStudio.createReport.path, data);
      return res.json() as Promise<StoryReportWithSections>;
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't start report", description: error.message, variant: "destructive" });
    },
  });
}

export function useGenerateSection(reportId: number | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (kind: StorySectionKind) => {
      const url = buildUrl(api.storyStudio.generateSection.path, { id: reportId!, kind });
      const res = await apiRequest("POST", url);
      return res.json() as Promise<StorySection>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.storyStudio.getReport.path, reportId] });
    },
    onError: (error: Error) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useSaveSection(reportId: number | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ kind, content }: { kind: StorySectionKind; content: string }) => {
      const url = buildUrl(api.storyStudio.saveSection.path, { id: reportId!, kind });
      const res = await apiRequest("PATCH", url, { content });
      return res.json() as Promise<StorySection>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.storyStudio.getReport.path, reportId] });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't save edit", description: error.message, variant: "destructive" });
    },
  });
}

export async function exportStoryReportMarkdown(reportId: number): Promise<string> {
  const url = buildUrl(api.storyStudio.exportMarkdown.path, { id: reportId });
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to export report");
  const data = await res.json();
  return data.markdown as string;
}
