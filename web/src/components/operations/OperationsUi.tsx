import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { cn } from "@/lib/utils";

export function PageIntro({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <h2 className="font-expanded text-lg font-semibold tracking-[0.04em] text-foreground">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
  icon?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </div>
            <div
              className={cn(
                "mt-2 text-2xl font-semibold tabular-nums",
                tone === "success" && "text-success",
                tone === "warning" && "text-warning",
                tone === "danger" && "text-destructive",
              )}
            >
              {value}
            </div>
          </div>
          {icon ? <div className="text-muted-foreground">{icon}</div> : null}
        </div>
        {detail ? (
          <div className="mt-2 text-xs text-muted-foreground">{detail}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"
      aria-live="polite"
    >
      <Spinner />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  positive = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  positive?: boolean;
}) {
  const Icon = positive ? CheckCircle2 : AlertCircle;
  return (
    <Card>
      <CardContent className="flex flex-col items-center px-6 py-10 text-center">
        <Icon
          className={cn(
            "h-8 w-8",
            positive ? "text-success" : "text-muted-foreground",
          )}
        />
        <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        {action ? <div className="mt-4">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
