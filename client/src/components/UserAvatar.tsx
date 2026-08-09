import { User } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeClass = {
  sm: "w-7 h-7 text-xs",
  md: "w-8 h-8 text-sm",
  lg: "w-9 h-9 text-sm",
  xl: "w-10 h-10 text-lg",
  "2xl": "w-16 h-16 text-2xl",
} as const;

type UserAvatarProps = {
  profileImageUrl?: string | null;
  /** Display character or name; first character is used for the fallback. */
  name?: string | null;
  size?: keyof typeof sizeClass;
  className?: string;
  alt?: string;
};

export function UserAvatar({
  profileImageUrl,
  name,
  size = "md",
  className,
  alt = "",
}: UserAvatarProps) {
  const initial = (name?.trim()?.[0] ?? "").toUpperCase();

  if (profileImageUrl) {
    return (
      <img
        src={profileImageUrl}
        alt={alt}
        className={cn("rounded-full object-cover shrink-0", sizeClass[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground font-bold shrink-0",
        sizeClass[size],
        className,
      )}
    >
      {initial || <User className="w-[55%] h-[55%]" />}
    </div>
  );
}
