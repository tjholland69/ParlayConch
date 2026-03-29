import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/use-bets";
import type { Notification } from "@shared/schema";

const TYPE_STYLES: Record<string, { dot: string; icon: string }> = {
  announcement: { dot: "bg-primary", icon: "📢" },
  parlay_approved: { dot: "bg-green-500", icon: "✅" },
  parlay_rejected: { dot: "bg-red-500", icon: "❌" },
  reminder: { dot: "bg-yellow-500", icon: "⏰" },
  system: { dot: "bg-blue-500", icon: "ℹ️" },
};

function NotifItem({ notif, onRead }: { notif: Notification; onRead: (id: number) => void }) {
  const style = TYPE_STYLES[notif.type] || TYPE_STYLES.system;

  return (
    <button
      className={cn(
        "w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0",
        !notif.isRead && "bg-primary/5"
      )}
      onClick={() => !notif.isRead && onRead(notif.id)}
      data-testid={`notification-item-${notif.id}`}
    >
      <span className="text-base mt-0.5 shrink-0">{style.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn("text-sm font-medium truncate", !notif.isRead && "text-white")}>{notif.title}</p>
          {!notif.isRead && (
            <span className={cn("w-2 h-2 rounded-full shrink-0", style.dot)} />
          )}
        </div>
        {notif.message && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
        </p>
      </div>
    </button>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: notifs = [] } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = notifs.filter((n) => !n.isRead).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-white"
          data-testid="button-notification-bell"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] bg-primary text-primary-foreground border-0 flex items-center justify-center"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 bg-card/95 backdrop-blur-xl border border-white/10 shadow-2xl"
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-white h-auto py-1"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              data-testid="button-mark-all-read"
            >
              Mark all read
            </Button>
          )}
        </div>

        {notifs.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            {notifs.map((n) => (
              <NotifItem
                key={n.id}
                notif={n}
                onRead={(id) => markRead.mutate(id)}
              />
            ))}
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
