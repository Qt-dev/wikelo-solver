"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ComponentPreferenceStatus,
  RecipeDto,
  RecipesResponse,
  SessionResponse,
} from "../../lib/contracts/api";

type SortKey = "price" | "granted" | "needed" | "category";
type ReadinessFilter = "all" | "ready" | "needed";
type PreferenceMap = Record<string, ComponentPreferenceStatus>;

const LOCAL_PREFERENCES_KEY = "wikelo-solver:preferences:v1";
const RECIPE_STALE_MS = 36 * 60 * 60 * 1000;
const PRICE_STALE_MS = 12 * 60 * 60 * 1000;
const preferenceOptions: Array<{ value: ComponentPreferenceStatus; label: string }> = [
  { value: "needed", label: "Needed" },
  { value: "owned", label: "Owned" },
  { value: "farmable", label: "Farmable" },
];

function formatAuec(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTimestamp(value: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function isOlderThan(value: string | null | undefined, age: number) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) || Date.now() - timestamp > age;
}

function categoryTone(category: string) {
  const tones = ["copper", "violet", "sage", "sand"];
  let total = 0;
  for (const character of category) total += character.charCodeAt(0);
  return tones[total % tones.length];
}

function readLocalPreferences(): PreferenceMap {
  try {
    const value = window.localStorage.getItem(LOCAL_PREFERENCES_KEY);
    if (!value) return {};
    return parsePreferences(JSON.parse(value));
  } catch {
    return {};
  }
}

function parsePreferences(payload: unknown): PreferenceMap {
  const result: PreferenceMap = {};
  const source =
    payload && typeof payload === "object" && "preferences" in payload
      ? (payload as { preferences: unknown }).preferences
      : payload;

  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry || typeof entry !== "object") continue;
      const itemId = (entry as { itemId?: unknown }).itemId;
      const status = (entry as { status?: unknown }).status;
      if (typeof itemId === "string" && isPreferenceStatus(status)) result[itemId] = status;
    }
  } else if (source && typeof source === "object") {
    for (const [itemId, status] of Object.entries(source)) {
      if (isPreferenceStatus(status)) result[itemId] = status;
    }
  }
  return result;
}

function isPreferenceStatus(value: unknown): value is ComponentPreferenceStatus {
  return value === "needed" || value === "owned" || value === "farmable";
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()) as T;
}

function defaultPreferences(recipes: RecipeDto[]) {
  const preferences: PreferenceMap = {};
  for (const recipe of recipes) {
    for (const component of recipe.components) preferences[component.itemId] = component.preference;
  }
  return preferences;
}

export default function RecipePlanner() {
  const [data, setData] = useState<RecipesResponse | null>(null);
  const [session, setSession] = useState<SessionResponse>({ user: null });
  const [preferences, setPreferences] = useState<PreferenceMap>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [readiness, setReadiness] = useState<ReadinessFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("price");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<Set<string>>(new Set());
  const [loggingOut, setLoggingOut] = useState(false);

  const loadPlanner = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setAccountNotice(null);

    const [recipeResult, sessionResult, preferenceResult] = await Promise.allSettled([
      readJson<RecipesResponse>("/api/recipes", { cache: "no-store" }),
      readJson<SessionResponse>("/api/session", { cache: "no-store" }),
      readJson<unknown>("/api/preferences", { cache: "no-store" }),
    ]);

    if (recipeResult.status === "rejected") {
      setLoadError("Recipe data could not be loaded. Check the connection and try again.");
      setLoading(false);
      return;
    }

    const nextData = recipeResult.value;
    const nextSession = sessionResult.status === "fulfilled" ? sessionResult.value : { user: null };
    const apiPreferences =
      preferenceResult.status === "fulfilled" ? parsePreferences(preferenceResult.value) : {};
    const localPreferences = nextSession.user ? {} : readLocalPreferences();

    setData(nextData);
    setSession(nextSession);
    setPreferences({
      ...defaultPreferences(nextData.recipes),
      ...apiPreferences,
      ...localPreferences,
    });
    setSelectedId((current) =>
      current && nextData.recipes.some((recipe) => recipe.id === current)
        ? current
        : (nextData.recipes[0]?.id ?? null),
    );
    if (sessionResult.status === "rejected") {
      setAccountNotice("Account status is unavailable. Preferences will stay on this device for now.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPlanner(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPlanner]);

  const recipes = useMemo(() => data?.recipes ?? [], [data]);
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(recipes.map((recipe) => recipe.category))).sort()],
    [recipes],
  );
  const effectiveCategory = categories.includes(category) ? category : "All";

  const statusFor = useCallback(
    (itemId: string, fallback: ComponentPreferenceStatus) => preferences[itemId] ?? fallback,
    [preferences],
  );

  const summaryFor = useCallback(
    (recipe: RecipeDto) => {
      let valueAuec = 0;
      let accounted = 0;
      const missingItemIds: string[] = [];
      for (const component of recipe.components) {
        const status = statusFor(component.itemId, component.preference);
        if (status !== "needed") {
          accounted += 1;
          continue;
        }
        if (component.unitPriceAuec === null) missingItemIds.push(component.itemId);
        else valueAuec += component.unitPriceAuec * component.quantity;
      }
      return {
        valueAuec,
        complete: missingItemIds.length === 0,
        missingItemIds,
        accounted,
        readiness: recipe.components.length
          ? Math.round((accounted / recipe.components.length) * 100)
          : 100,
        ready: accounted === recipe.components.length,
      };
    },
    [statusFor],
  );

  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return recipes
      .filter((recipe) => {
        const haystack = [
          recipe.name,
          recipe.output.name,
          recipe.category,
          ...recipe.components.map((component) => component.name),
        ]
          .join(" ")
          .toLocaleLowerCase();
        const ready = summaryFor(recipe).ready;
        return (
          (effectiveCategory === "All" || recipe.category === effectiveCategory) &&
          (readiness === "all" || (readiness === "ready" ? ready : !ready)) &&
          (!query || haystack.includes(query))
        );
      })
      .sort((a, b) => {
        if (sortBy === "price") {
          const left = summaryFor(a);
          const right = summaryFor(b);
          if (left.complete !== right.complete) return left.complete ? -1 : 1;
          return left.valueAuec - right.valueAuec || a.name.localeCompare(b.name);
        }
        if (sortBy === "granted") return b.reputationGranted - a.reputationGranted;
        if (sortBy === "needed") return a.reputationNeeded - b.reputationNeeded;
        return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      });
  }, [effectiveCategory, readiness, recipes, search, sortBy, summaryFor]);

  const selectedRecipe =
    recipes.find((recipe) => recipe.id === selectedId) ?? recipes[0] ?? null;
  const selectedSummary = selectedRecipe ? summaryFor(selectedRecipe) : null;
  const recipeTimestamp = data?.patch?.extractedAt ?? null;
  const recipeStale = Boolean(data && (data.freshness.recipesStale || isOlderThan(recipeTimestamp, RECIPE_STALE_MS)));
  const priceStale = Boolean(
    data && (data.freshness.pricesStale || isOlderThan(data.freshness.latestPriceAt, PRICE_STALE_MS)),
  );

  async function updatePreference(
    itemId: string,
    nextStatus: ComponentPreferenceStatus,
    previousStatus: ComponentPreferenceStatus,
  ) {
    if (nextStatus === previousStatus || pendingItems.has(itemId)) return;
    setPreferenceError(null);
    setAccountNotice(null);
    setPreferences((current) => ({ ...current, [itemId]: nextStatus }));

    if (!session.user) {
      const nextPreferences = { ...preferences, [itemId]: nextStatus };
      setPreferences(nextPreferences);
      try {
        window.localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify(nextPreferences));
        setAccountNotice("Saved on this device. Sign in with Discord to keep preferences across devices.");
      } catch {
        setPreferences((current) => ({ ...current, [itemId]: previousStatus }));
        setPreferenceError("This browser could not save the preference locally.");
      }
      return;
    }

    setPendingItems((current) => new Set(current).add(itemId));
    try {
      await readJson("/api/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, status: nextStatus }),
      });
      setAccountNotice("Preference synced to your account.");
    } catch {
      setPreferences((current) => ({ ...current, [itemId]: previousStatus }));
      setPreferenceError("The preference was not saved. Your previous selection has been restored.");
    } finally {
      setPendingItems((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  }

  async function logout() {
    setLoggingOut(true);
    setAccountNotice(null);
    try {
      const response = await fetch("/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      setSession({ user: null });
      const localPreferences = readLocalPreferences();
      setPreferences({ ...defaultPreferences(recipes), ...localPreferences });
      setAccountNotice("Signed out. Preference changes now stay on this device.");
    } catch {
      setAccountNotice("Could not sign out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="planner-shell">
      <header className="topbar">
        <a className="brand" href="#planner" aria-label="Wikelo Solver home">
          <span className="brand-mark" aria-hidden="true">W</span>
          <span>Wikelo <em>Solver</em></span>
        </a>
        <nav aria-label="Primary navigation" className="main-nav">
          <a href="#planner" className="active">Planner</a>
          <a href="#recipe-details">Recipe details</a>
          <a href="#data-status">Data status</a>
        </nav>
        {session.user ? (
          <div className="account-control">
            <span className="account-avatar" aria-hidden="true">{session.user.displayName.slice(0, 1)}</span>
            <span><strong>{session.user.displayName}</strong><small>Preferences synced</small></span>
            <button type="button" onClick={() => void logout()} disabled={loggingOut}>
              {loggingOut ? "Signing out…" : "Log out"}
            </button>
          </div>
        ) : (
          <a className="discord-button" href="/auth/discord/start">
            <span aria-hidden="true">◆</span>
            <span>Sign in with Discord<small>Sync preferences</small></span>
          </a>
        )}
      </header>

      <section className="hero" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Live Wikelo mission planner</p>
          <h1 id="page-title">Plan the craft.<br /><i>Spend with intent.</i></h1>
          <p className="hero-copy">
            Compare active-patch recipes, flag what you own or can farm, and keep missing market data visible before you commit aUEC.
          </p>
        </div>
        <div className="field-note" aria-label="Current recipe summary">
          <span>Current undertaking</span>
          <strong>{loading ? "Loading recipes…" : (selectedRecipe?.name ?? "No active recipe")}</strong>
          <p>{selectedSummary ? `${selectedSummary.accounted} of ${selectedRecipe?.components.length ?? 0} components accounted for` : "Waiting for an active patch"}</p>
          <div className="progress-track" aria-hidden="true"><span style={{ width: `${selectedSummary?.readiness ?? 0}%` }} /></div>
        </div>
      </section>

      {(accountNotice || preferenceError) && (
        <div className={`notice-bar ${preferenceError ? "error" : ""}`} role={preferenceError ? "alert" : "status"}>
          {preferenceError ?? accountNotice}
        </div>
      )}

      <section className="planner-grid" id="planner" aria-label="Recipe planner" aria-busy={loading}>
        <aside className="filter-panel">
          <div className="panel-heading"><p className="eyebrow">Find a commission</p><h2>Recipe index</h2></div>
          <label className="search-label" htmlFor="recipe-search">Search recipe, output, component, or category</label>
          <div className="search-box"><span aria-hidden="true">⌕</span><input id="recipe-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. RMC, helmet, copper…" /></div>

          <fieldset>
            <legend>Category</legend>
            <div className="filter-list">
              {categories.map((item) => (
                <label key={item} className="check-option"><input type="radio" name="category" checked={effectiveCategory === item} onChange={() => setCategory(item)} /><span>{item}</span></label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Readiness</legend>
            <div className="segmented-control">
              {([[
                "all", "All",
              ], ["ready", "Ready"], ["needed", "Needs items"]] as Array<[ReadinessFilter, string]>).map(([value, label]) => (
                <button key={value} type="button" className={readiness === value ? "selected" : ""} onClick={() => setReadiness(value)} aria-pressed={readiness === value}>{label}</button>
              ))}
            </div>
          </fieldset>
          <p className="filter-footnote"><span>✦</span> A recipe is ready when every component is marked Owned or Farmable.</p>
        </aside>

        <section className="recipe-list" aria-label="Filtered recipes">
          <div className="list-toolbar">
            <div><p className="eyebrow">{loading ? "Reading active patch" : `${filteredRecipes.length} of ${recipes.length} recipes`}</p><h2>Choose a recipe</h2></div>
            <label className="sort-control">Sort by <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)} aria-label="Sort recipes"><option value="price">Lowest price</option><option value="needed">Reputation needed</option><option value="granted">Reputation granted</option><option value="category">Category</option></select></label>
          </div>

          {data?.status === "importing" && (
            <div className="state-banner importing" role="status"><span className="spinner" aria-hidden="true" />A new patch is importing. The last complete patch remains available.</div>
          )}
          {loading ? (
            <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" /><h3>Loading live recipes</h3><p>Reading the active patch and current prices.</p></div>
          ) : loadError ? (
            <div className="empty-state error-state" role="alert"><span>!</span><h3>Recipes unavailable</h3><p>{loadError}</p><button type="button" onClick={() => void loadPlanner()}>Try again</button></div>
          ) : data?.status === "empty" || recipes.length === 0 ? (
            <div className="empty-state"><span>◇</span><h3>{data?.status === "importing" ? "Import in progress" : "No active recipes"}</h3><p>{data?.status === "importing" ? "Recipes will appear after the complete patch is activated." : "Import a complete game snapshot to begin planning."}</p></div>
          ) : filteredRecipes.length === 0 ? (
            <div className="empty-state"><span>⌕</span><h3>No matching recipes</h3><p>Try another name, component, category, or readiness filter.</p><button type="button" onClick={() => { setSearch(""); setCategory("All"); setReadiness("all"); }}>Clear filters</button></div>
          ) : (
            <div className="recipe-rows">
              {filteredRecipes.map((recipe) => {
                const summary = summaryFor(recipe);
                return (
                  <article className={`recipe-row ${recipe.id === selectedRecipe?.id ? "chosen" : ""}`} key={recipe.id}>
                    <button type="button" className="recipe-select" onClick={() => setSelectedId(recipe.id)} aria-pressed={recipe.id === selectedRecipe?.id} aria-label={`View details for ${recipe.name}`}>
                      <span className={`recipe-glyph ${categoryTone(recipe.category)}`} aria-hidden="true">✦</span>
                      <span className="recipe-name"><strong>{recipe.name}</strong><small>{recipe.output.quantity}× {recipe.output.name}</small></span>
                      <span className="recipe-meta"><b>{recipe.reputationNeeded}</b> needed<small>+{recipe.reputationGranted} granted</small></span>
                      <span className={`row-price ${summary.complete ? "" : "missing"}`}><b>{formatAuec(summary.valueAuec)}</b><small>{summary.complete ? "aUEC to source" : `aUEC + ${summary.missingItemIds.length} missing`}</small></span>
                      <span className={`readiness-dot ${summary.ready ? "ready" : "limited"}`}><i aria-hidden="true" />{summary.readiness}%</span>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="detail-panel" id="recipe-details" aria-live="polite">
          {selectedRecipe && selectedSummary ? (
            <>
              <div className="detail-title"><p className="eyebrow">Selected commission</p><span className={`category-chip ${categoryTone(selectedRecipe.category)}`}>{selectedRecipe.category}</span><h2>{selectedRecipe.name}</h2><p>Produces {selectedRecipe.output.quantity}× {selectedRecipe.output.name}</p></div>
              <div className="rep-summary"><div><span>Reputation granted</span><strong>+{selectedRecipe.reputationGranted}</strong><small>on completion</small></div><div><span>Reputation needed</span><strong>{selectedRecipe.reputationNeeded}</strong><small>mission requirement</small></div></div>
              <div className="component-heading"><h3>Components</h3><span>{selectedSummary.accounted}/{selectedRecipe.components.length} set</span></div>
              <div className="component-list">
                {selectedRecipe.components.map((component) => {
                  const status = statusFor(component.itemId, component.preference);
                  const pending = pendingItems.has(component.itemId);
                  const mappingMissing = component.mappingStatus !== "matched";
                  return (
                    <article className={`component ${status !== "needed" ? "accounted" : ""}`} key={component.itemId}>
                      <div className="component-top">
                        <span className="component-token" aria-hidden="true">◆</span>
                        <div><strong>{component.name} <em>×{component.quantity}</em></strong><small>{component.category}</small></div>
                        <b className={component.unitPriceAuec === null ? "missing" : ""}>{component.unitPriceAuec === null ? "Price missing" : `${formatAuec(component.unitPriceAuec * component.quantity)} aUEC`}<small>{component.unitPriceAuec === null ? "Not counted as zero" : `${formatAuec(component.unitPriceAuec)} each`}</small></b>
                      </div>
                      <div className="component-data">
                        {mappingMissing && <span className="data-flag mapping">{component.mappingStatus === "review" ? "Mapping needs review" : "UEX mapping missing"}</span>}
                        {component.uexMarketplaceUrl && <a href={component.uexMarketplaceUrl} target="_blank" rel="noreferrer">UEX market</a>}
                        {component.priceSource && <span>{component.priceSource}{component.priceLocation ? ` · ${component.priceLocation}` : ""}</span>}
                        <span>Price: {formatTimestamp(component.priceCapturedAt)}</span>
                      </div>
                      <div className="component-controls" role="group" aria-label={`${component.name} preference`}>
                        {preferenceOptions.map((option) => (
                          <button key={option.value} type="button" className={status === option.value ? "selected" : ""} aria-pressed={status === option.value} disabled={pending} onClick={() => void updatePreference(component.itemId, option.value, status)}>{option.label}</button>
                        ))}
                        {pending && <span className="saving-status" role="status">Saving…</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="cost-box">
                <div><span>Price to source</span><strong>{formatAuec(selectedSummary.valueAuec)} <small>aUEC</small></strong><p>{selectedSummary.complete ? "Owned and farmable inputs excluded" : `${selectedSummary.missingItemIds.length} needed component price${selectedSummary.missingItemIds.length === 1 ? " is" : "s are"} missing; total is incomplete.`}</p></div>
                <div className="readiness-score"><span>Readiness</span><strong>{selectedSummary.readiness}%</strong><div className="progress-track" aria-hidden="true"><span style={{ width: `${selectedSummary.readiness}%` }} /></div></div>
              </div>
              {!session.user && <p className="local-disclaimer">Preferences are saved only in this browser. <a href="/auth/discord/start">Sign in</a> to persist them to your account.</p>}
            </>
          ) : (
            <div className="detail-placeholder"><span aria-hidden="true">◇</span><h2>No recipe selected</h2><p>Recipe details will appear when an active patch is available.</p></div>
          )}
        </aside>
      </section>

      <section className="data-status" id="data-status" aria-label="Live data status">
        <div><p className="eyebrow">Active data</p><strong>{data?.patch ? `${data.patch.version} · ${data.patch.channel}` : "No active patch"}</strong></div>
        <dl>
          <div><dt>Recipes extracted</dt><dd>{formatTimestamp(recipeTimestamp)}</dd></div>
          <div><dt>Latest price</dt><dd>{formatTimestamp(data?.freshness.latestPriceAt ?? null)}</dd></div>
          <div><dt>Coverage gaps</dt><dd>{data ? `${data.counts.missingMappings} mappings · ${data.counts.missingPrices} prices` : "Unavailable"}</dd></div>
        </dl>
        <div className="freshness-warnings" aria-live="polite">
          {recipeStale && <span className="data-flag warning">Recipe data is older than 36 hours</span>}
          {priceStale && <span className="data-flag warning">Price data is older than 12 hours</span>}
          {data && !recipeStale && !priceStale && <span className="data-flag current">Data is current</span>}
        </div>
      </section>

      <footer><span className="brand-mark small" aria-hidden="true">W</span><p>Wikelo Solver is an independent community planning companion and is not affiliated with Cloud Imperium Games, Discord, or UEX Corp.</p><span>Live data can be incomplete. Verify before spending.</span></footer>
    </main>
  );
}
