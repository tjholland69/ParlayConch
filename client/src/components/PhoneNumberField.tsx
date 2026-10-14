import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMyPhone, useSetMyPhone } from "@/hooks/use-parlay-extras";
import { formatPhone, normalizePhone, PHONE_HINT } from "@shared/phone";

/**
 * The member's own mobile number, in Settings. Only they (and a super user)
 * ever see it. Nothing texts it yet: it's kept for reminders and two-factor
 * sign-in later, and the copy says so rather than promising either.
 */
export function PhoneNumberField() {
  const { data, isLoading } = useMyPhone();
  const save = useSetMyPhone();
  const saved = data?.phoneNumber ?? null;
  const [text, setText] = useState("");
  useEffect(() => {
    setText(formatPhone(saved));
  }, [saved]);

  const blank = text.trim() === "";
  const parsed = normalizePhone(text);
  const invalid = !blank && !parsed;
  const unchanged = (blank ? null : parsed) === saved;

  return (
    <div className="space-y-2">
      <Label htmlFor="phoneNumber">Mobile Number</Label>
      <div className="flex gap-3">
        <Input
          id="phoneNumber"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="(508) 555-1234"
          className="bg-background border-white/10"
          aria-invalid={invalid}
          disabled={isLoading}
          data-testid="input-phone-number"
        />
        <Button
          onClick={() => save.mutate(blank ? null : parsed)}
          disabled={isLoading || save.isPending || invalid || unchanged}
          data-testid="button-save-phone-number"
        >
          {save.isPending ? "Saving…" : blank && saved ? "Remove" : "Save"}
        </Button>
      </div>
      <p className={invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {invalid
          ? `That doesn't look like a phone number. Use ${PHONE_HINT}`
          : "Only you can see this. We'll use it for text reminders and extra sign-in security once those are available; nothing is sent to it yet."}
      </p>
    </div>
  );
}
