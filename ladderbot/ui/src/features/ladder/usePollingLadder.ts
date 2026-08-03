/**
 * usePollingLadder — one-stop live-data hook for the LadderBot dashboard.
 *
 * Polls snapshot + monthly-profile + report/summary on a shared interval;
 * hands each of the three components exactly the shape it expects. Pass
 * intervalMs=0 to disable polling (initial fetch only) — useful for
 * demos and reduced-motion / battery-saving deployments.
 *
 * Every fetch is cancellable — component unmount aborts in-flight
 * requests via AbortController and stops the timer.
 */

import { useEffect, useMemo, useState } from "react";

import { LadderApiClient, defaultLadderClient } from "./api";
import type {
  CycleView, MonthlyProfile as MonthlyProfileData, ReportSummary,
} from "./types";


export interface UsePollingLadderOptions {
  client?: LadderApiClient;
  intervalMs?: number;         // default 15000; pass 0 to disable
  enabled?: boolean;           // default true
}


export interface LadderPollState {
  cycle: CycleView | null;
  profile: MonthlyProfileData | null;
  summary: ReportSummary | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;  // epoch ms; null until first success
  refresh: () => void;
}


export function usePollingLadder(
  opts: UsePollingLadderOptions = {},
): LadderPollState {
  const { intervalMs = 15000, enabled = true } = opts;
  const api = useMemo(
    () => opts.client ?? defaultLadderClient,
    [opts.client],
  );

  const [cycle, setCycle] = useState<CycleView | null>(null);
  const [profile, setProfile] = useState<MonthlyProfileData | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!enabled || !api) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;

    const doFetch = async () => {
      try {
        const [snap, prof, sum] = await Promise.all([
          api.snapshot(),
          api.monthlyProfile(),
          api.reportSummary(),
        ]);
        if (cancelled) return;
        setCycle(snap.cycle);
        setProfile(prof.profile);
        setSummary(sum.summary);
        setError(null);
        setLastUpdated(nowMs());
      } catch (e) {
        if (cancelled) return;
        setError((e as Error)?.message ?? "poll failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    doFetch();
    if (intervalMs > 0) {
      const h = setInterval(doFetch, intervalMs);
      return () => {
        cancelled = true;
        clearInterval(h);
        controller?.abort();
      };
    }
    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [api, intervalMs, enabled, refreshTick]);

  return {
    cycle, profile, summary,
    loading, error, lastUpdated,
    refresh: () => setRefreshTick((t) => t + 1),
  };
}


// Extracted so tests can freeze time without stubbing Date.
function nowMs(): number {
  return typeof Date !== "undefined" ? Date.now() : 0;
}
