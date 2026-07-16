"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PriceSettingDto, PriceSettingsResponse, SessionResponse } from "../../lib/contracts/api";

function number(value: number | null) {
  return value === null ? "No current price" : `${new Intl.NumberFormat("en-US").format(value)} aUEC`;
}

export default function PriceSettings() {
  const [session, setSession] = useState<SessionResponse>({ user: null });
  const [items, setItems] = useState<PriceSettingDto[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [targetItem, setTargetItem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sessionResponse = await fetch("/api/session", { cache: "no-store" });
    const nextSession = await sessionResponse.json() as SessionResponse;
    setSession(nextSession);
    if (!nextSession.user) {
      setLoading(false);
      return;
    }
    const response = await fetch("/api/settings/prices", { cache: "no-store" });
    if (!response.ok) {
      setError("Price settings could not be loaded.");
      setLoading(false);
      return;
    }
    const nextItems = ((await response.json()) as PriceSettingsResponse).settings;
    const target = new URL(window.location.href).searchParams.get("item");
    setTargetItem(target);
    setItems(target ? [...nextItems].sort((left, right) => Number(right.itemId === target) - Number(left.itemId === target) || left.name.localeCompare(right.name)) : nextItems);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term ? items.filter((item) => `${item.name} ${item.currentUexName ?? ""}`.toLocaleLowerCase().includes(term)) : items;
  }, [items, query]);

  async function save(item: PriceSettingDto, form: HTMLFormElement) {
    const data = new FormData(form);
    const mode = String(data.get("mode"));
    setPending(item.itemId);
    setError(null);
    setNotice(null);
    const body = mode === "override"
      ? { itemId: item.itemId, mode, overridePriceAuec: Number(data.get("overridePriceAuec")) }
      : { itemId: item.itemId, mode, uexItemId: Number(data.get("uexItemId")), uexName: String(data.get("uexName") ?? "") };
    const response = await fetch("/api/settings/prices", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      setError(payload?.error ?? "The correction could not be saved.");
    } else {
      setNotice(`${item.name} will now use your ${mode === "override" ? "custom price" : "matched UEX listing"}.`);
      await load();
    }
    setPending(null);
  }

  async function reset(item: PriceSettingDto) {
    setPending(item.itemId);
    setError(null);
    const response = await fetch("/api/settings/prices", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.itemId }) });
    if (!response.ok) setError("The correction could not be reset.");
    else {
      setNotice(`${item.name} is using the automatic UEX match again.`);
      await load();
    }
    setPending(null);
  }

  return (
    <main className="settings-shell">
      <header className="topbar">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">W</span><span>Wikelo <em>Solver</em></span></Link>
        <nav className="main-nav" aria-label="Primary navigation"><Link href="/">Planner</Link><Link className="active" href="/settings">Settings</Link></nav>
        {session.user ? <span className="settings-account">Signed in as <strong>{session.user.displayName}</strong></span> : null}
      </header>
      <section className="settings-intro">
        <p className="eyebrow">Personal price controls</p>
        <h1>Correct a price without changing it for everyone.</h1>
        <p>Set a fixed aUEC price, or point an item at the UEX listing you trust. Resetting a correction restores automatic matching.</p>
      </section>
      {!session.user && !loading ? (
        <section className="settings-signin"><h2>Sign in to manage price corrections</h2><p>Corrections follow your account and apply only to your recipe totals.</p><a className="primary-action" href="/auth/discord/start">Sign in with Discord</a></section>
      ) : (
        <section className="settings-content" aria-busy={loading}>
          <label className="settings-search" htmlFor="settings-search"><span>Find a recipe component</span><input id="settings-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by item or current UEX match" /></label>
          {(notice || error) && <p className={`settings-notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{error ?? notice}</p>}
          {loading ? <p className="settings-state">Loading your price settings…</p> : filtered.length === 0 ? <p className="settings-state">No matching items.</p> : (
            <div className="settings-list">
              {filtered.map((item) => (
                <article className={`price-setting ${item.itemId === targetItem ? "targeted" : ""}`} key={item.itemId}>
                  <div className="price-setting-summary"><div><h2>{item.name}</h2><p>{item.currentUexName ?? "No automatic UEX match"}{item.currentUexItemId ? ` · Listing ${item.currentUexItemId}` : ""}</p></div><div><span>Effective unit price</span><strong>{number(item.currentUnitPriceAuec)}</strong>{item.mode && <small>{item.mode === "override" ? "Personal override" : "Personal listing match"}</small>}</div></div>
                  <form className="price-setting-form" onSubmit={(event) => { event.preventDefault(); void save(item, event.currentTarget); }}>
                    <label><span>Correction type</span><select name="mode" defaultValue={item.mode ?? "override"}><option value="override">Fixed price</option><option value="listing">Match another UEX listing</option></select></label>
                    <label><span>Fixed price (aUEC)</span><input name="overridePriceAuec" type="number" min="0" step="1" defaultValue={item.overridePriceAuec ?? item.currentUnitPriceAuec ?? ""} /></label>
                    <label><span>UEX listing ID</span><input name="uexItemId" type="number" min="1" step="1" defaultValue={item.matchedUexItemId ?? item.currentUexItemId ?? ""} /></label>
                    <label><span>Listing label (optional)</span><input name="uexName" defaultValue={item.matchedUexName ?? ""} placeholder="e.g. Wikelo Favor" /></label>
                    <div className="setting-actions"><button className="primary-action" type="submit" disabled={pending === item.itemId}>{pending === item.itemId ? "Saving…" : "Save correction"}</button>{item.mode && <button className="quiet-action" type="button" disabled={pending === item.itemId} onClick={() => void reset(item)}>Use automatic match</button>}</div>
                  </form>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
