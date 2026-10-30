import { ReactNode, useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

/** Loads data from the API and exposes loading, error and a reload function. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const reload = useCallback(() => {
    setLoading(true);
    run()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [run]);
  useEffect(reload, [reload]);
  return { data, error, loading, reload, setData };
}

export const errorText = (e: unknown) =>
  e instanceof ApiError && e.fields.length ? e.fields.map((f) => f.message).join(". ") : e instanceof Error ? e.message : "Something went wrong";

export function Card({ title, sub, actions, children }: { title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-h">
        <h2>{title}</h2>
        {sub && <span className="sub">{sub}</span>}
        {actions && <div className="toolbar">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Status({ loading, error, empty }: { loading: boolean; error: string | null; empty?: string | false }) {
  if (loading) return <div className="empty">Loading…</div>;
  if (error) return <div className="empty err">{error}</div>;
  if (empty) return <div className="empty">{empty}</div>;
  return null;
}

export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "info" | "mute"; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Who({ name, sub }: { name: string; sub: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div className="who">
      <div className="av" aria-hidden="true">{initials}</div>
      <div>
        <div className="nm">{name}</div>
        <div className="id">{sub}</div>
      </div>
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-h">
          <h2>{title}</h2>
          <button className="x" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="sheet-b">{children}</div>
      </div>
    </div>
  );
}
