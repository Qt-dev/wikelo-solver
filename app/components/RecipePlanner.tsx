"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentAllocation, RecipeDto, RecipesResponse, RecipeTodosResponse, SessionResponse } from "../../lib/contracts/api";

type SortKey = "price" | "granted" | "needed" | "name";
type ReadinessFilter = "all" | "ready" | "needed";
type ViewMode = "table" | "cards";
type AllocationMap = Record<string, ComponentAllocation>;
type TodoMap = Record<string, number>;
type AggregateMaterial = RecipeDto["components"][number] & { required: number; owned: number; farmable: number; needed: number; costAuec: number };

const LOCAL_ALLOCATIONS_KEY = "wikelo-solver:allocations:v2";
const VIEW_MODE_KEY = "wikelo-solver:recipe-view";
const LOCAL_TODOS_KEY = "wikelo-solver:todos:v1";
const SEARCH_VISIBLE_KEY = "wikelo-solver:search-visible";
const RECIPE_STALE_MS = 36 * 60 * 60 * 1000;
const PRICE_STALE_MS = 12 * 60 * 60 * 1000;

function formatAuec(value: number) { return new Intl.NumberFormat("en-US").format(value); }
function formatTimestamp(value: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
function isOlderThan(value: string | null | undefined, age: number) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) || Date.now() - timestamp > age;
}
function categoryTone(category: string) {
  const tones = ["copper", "violet", "sage", "sand"];
  return tones[[...category].reduce((sum, character) => sum + character.charCodeAt(0), 0) % tones.length];
}
function cleanAllocation(value: unknown): ComponentAllocation | null {
  if (!value || typeof value !== "object") return null;
  const allocation = value as Partial<ComponentAllocation>;
  return Number.isInteger(allocation.ownedQuantity) && Number(allocation.ownedQuantity) >= 0 && Number.isInteger(allocation.farmableQuantity) && Number(allocation.farmableQuantity) >= 0
    ? { ownedQuantity: Number(allocation.ownedQuantity), farmableQuantity: Number(allocation.farmableQuantity) }
    : null;
}
function parseAllocations(payload: unknown): AllocationMap {
  const result: AllocationMap = {};
  const source = payload && typeof payload === "object" && "preferences" in payload ? (payload as { preferences: unknown }).preferences : payload;
  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry || typeof entry !== "object" || typeof (entry as { itemId?: unknown }).itemId !== "string") continue;
      const parsed = cleanAllocation(entry);
      if (parsed) result[(entry as { itemId: string }).itemId] = parsed;
    }
  } else if (source && typeof source === "object") {
    for (const [itemId, value] of Object.entries(source)) {
      const parsed = cleanAllocation(value);
      if (parsed) result[itemId] = parsed;
    }
  }
  return result;
}
function readLocalAllocations() {
  try { return parseAllocations(JSON.parse(window.localStorage.getItem(LOCAL_ALLOCATIONS_KEY) ?? "{}")); } catch { return {}; }
}
function parseTodos(payload: unknown): TodoMap {
  const result: TodoMap = {};
  const source = payload && typeof payload === "object" && "todos" in payload ? (payload as { todos: unknown }).todos : payload;
  if (!Array.isArray(source)) return result;
  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const recipeId = (entry as { recipeId?: unknown }).recipeId;
    const quantity = Number((entry as { quantity?: unknown }).quantity);
    if (typeof recipeId === "string" && Number.isInteger(quantity) && quantity >= 1 && quantity <= 99) result[recipeId] = quantity;
  }
  return result;
}
function readLocalTodos() {
  try { return parseTodos(JSON.parse(window.localStorage.getItem(LOCAL_TODOS_KEY) ?? "[]")); } catch { return {}; }
}
function defaultAllocations(recipes: RecipeDto[]) {
  const result: AllocationMap = {};
  for (const recipe of recipes) for (const component of recipe.components) result[component.itemId] = component.allocation;
  return result;
}
async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json() as Promise<T>;
}

export default function RecipePlanner() {
  const [data, setData] = useState<RecipesResponse | null>(null);
  const [session, setSession] = useState<SessionResponse>({ user: null });
  const [allocations, setAllocations] = useState<AllocationMap>({});
  const [search, setSearch] = useState("");
  const [readiness, setReadiness] = useState<ReadinessFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("price");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [searchVisible, setSearchVisible] = useState(true);
  const [todos, setTodos] = useState<TodoMap>({});
  const [todoOpen, setTodoOpen] = useState(false);
  const [todoQuantity, setTodoQuantity] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recipeFocused, setRecipeFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<Set<string>>(new Set());
  const [pendingTodos, setPendingTodos] = useState<Set<string>>(new Set());
  const [loggingOut, setLoggingOut] = useState(false);

  const loadPlanner = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [recipeResult, sessionResult, allocationResult, todoResult] = await Promise.allSettled([
      readJson<RecipesResponse>("/api/recipes", { cache: "no-store" }),
      readJson<SessionResponse>("/api/session", { cache: "no-store" }),
      readJson<unknown>("/api/preferences", { cache: "no-store" }),
      readJson<RecipeTodosResponse>("/api/todos", { cache: "no-store" }),
    ]);
    if (recipeResult.status === "rejected") {
      setLoadError("Recipe data could not be loaded. Check the connection and try again.");
      setLoading(false);
      return;
    }
    const nextData = recipeResult.value;
    const nextSession = sessionResult.status === "fulfilled" ? sessionResult.value : { user: null };
    const saved = allocationResult.status === "fulfilled" ? parseAllocations(allocationResult.value) : {};
    setData(nextData);
    setSession(nextSession);
    setAllocations({ ...defaultAllocations(nextData.recipes), ...(nextSession.user ? saved : readLocalAllocations()) });
    setTodos(nextSession.user && todoResult.status === "fulfilled" ? parseTodos(todoResult.value) : readLocalTodos());
    const requestedRecipeId = new URL(window.location.href).searchParams.get("recipe");
    const requestedRecipe = requestedRecipeId && nextData.recipes.some((recipe) => recipe.id === requestedRecipeId)
      ? requestedRecipeId
      : null;
    setSelectedId((current) => requestedRecipe ?? (current && nextData.recipes.some((recipe) => recipe.id === current) ? current : nextData.recipes[0]?.id ?? null));
    setRecipeFocused(Boolean(requestedRecipe));
    if (sessionResult.status === "rejected") setNotice("Account status is unavailable. Changes will stay on this device.");
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setViewMode(window.localStorage.getItem(VIEW_MODE_KEY) === "cards" ? "cards" : "table");
        setSearchVisible(window.localStorage.getItem(SEARCH_VISIBLE_KEY) !== "false");
      } catch { /* preferences are optional */ }
      void loadPlanner();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPlanner]);

  const recipes = useMemo(() => data?.recipes ?? [], [data]);
  const allocationFor = useCallback((itemId: string, fallback: ComponentAllocation) => allocations[itemId] ?? fallback, [allocations]);
  const summaryFor = useCallback((recipe: RecipeDto) => {
    let valueAuec = 0;
    let ownedQuantity = 0;
    let farmableQuantity = 0;
    let neededQuantity = 0;
    let totalQuantity = 0;
    const missingItemIds: string[] = [];
    for (const component of recipe.components) {
      const allocation = allocationFor(component.itemId, component.allocation);
      const owned = Math.min(component.quantity, allocation.ownedQuantity);
      const farmable = Math.min(component.quantity - owned, allocation.farmableQuantity);
      const needed = component.quantity - owned - farmable;
      totalQuantity += component.quantity;
      ownedQuantity += owned;
      farmableQuantity += farmable;
      neededQuantity += needed;
      if (needed > 0 && component.unitPriceAuec === null) missingItemIds.push(component.itemId);
      else if (needed > 0) valueAuec += (component.unitPriceAuec ?? 0) * needed;
    }
    return {
      valueAuec,
      complete: missingItemIds.length === 0,
      missingItemIds,
      ownedQuantity,
      farmableQuantity,
      neededQuantity,
      totalQuantity,
      readiness: totalQuantity ? Math.round((ownedQuantity / totalQuantity) * 100) : 100,
      ready: ownedQuantity === totalQuantity,
    };
  }, [allocationFor]);
  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return recipes.filter((recipe) => {
      const ready = summaryFor(recipe).ready;
      const matchesReadiness = readiness === "all" || (readiness === "ready" ? ready : !ready);
      const haystack = [recipe.name, ...recipe.outputs.map((output) => output.name), ...recipe.components.map((component) => component.name)].join(" ").toLocaleLowerCase();
      return matchesReadiness && (!query || haystack.includes(query));
    }).sort((left, right) => {
      if (sortBy === "price") return summaryFor(left).valueAuec - summaryFor(right).valueAuec || left.name.localeCompare(right.name);
      if (sortBy === "granted") return right.reputationGranted - left.reputationGranted;
      if (sortBy === "needed") return left.reputationNeeded - right.reputationNeeded;
      return left.name.localeCompare(right.name);
    });
  }, [readiness, recipes, search, sortBy, summaryFor]);
  const selectedRecipe = recipes.find((recipe) => recipe.id === selectedId) ?? recipes[0] ?? null;
  const selectedSummary = selectedRecipe ? summaryFor(selectedRecipe) : null;
  const todoSummary = useMemo(() => {
    const entries = recipes.flatMap((recipe) => todos[recipe.id] ? [{ recipe, quantity: todos[recipe.id] }] : []);
    const materials = new Map<string, AggregateMaterial>();
    let totalCompletions = 0;
    let reputationGranted = 0;
    let reputationNeeded = 0;
    for (const { recipe, quantity } of entries) {
      totalCompletions += quantity;
      reputationGranted += recipe.reputationGranted * quantity;
      reputationNeeded = Math.max(reputationNeeded, recipe.reputationNeeded);
      for (const component of recipe.components) {
        const required = component.quantity * quantity;
        const current = materials.get(component.itemId);
        materials.set(component.itemId, current ? { ...current, required: current.required + required } : { ...component, required, owned: 0, farmable: 0, needed: 0, costAuec: 0 });
      }
    }
    let totalRequired = 0;
    let ownedTotal = 0;
    let farmingUnits = 0;
    let missingUnits = 0;
    let valueAuec = 0;
    let unpricedItems = 0;
    const materialRows = [...materials.values()].map((material) => {
      const allocation = allocationFor(material.itemId, material.allocation);
      const owned = Math.min(material.required, allocation.ownedQuantity);
      const farmable = Math.min(material.required - owned, allocation.farmableQuantity);
      const needed = material.required - owned - farmable;
      const costAuec = (material.unitPriceAuec ?? 0) * needed;
      totalRequired += material.required;
      ownedTotal += owned;
      farmingUnits += farmable;
      missingUnits += needed;
      valueAuec += costAuec;
      if (needed > 0 && material.unitPriceAuec === null) unpricedItems += 1;
      return { ...material, owned, farmable, needed, costAuec };
    }).sort((left, right) => (right.needed + right.farmable) - (left.needed + left.farmable) || left.name.localeCompare(right.name));
    return { entries, materials: materialRows, totalCompletions, reputationGranted, reputationNeeded, totalRequired, ownedTotal, farmingUnits, missingUnits, valueAuec, unpricedItems, readiness: totalRequired ? Math.round((ownedTotal / totalRequired) * 100) : 100 };
  }, [allocationFor, recipes, todos]);
  const recipeStale = Boolean(data && (data.freshness.recipesStale || isOlderThan(data.patch?.extractedAt, RECIPE_STALE_MS)));
  const priceStale = Boolean(data && (data.freshness.pricesStale || isOlderThan(data.freshness.latestPriceAt, PRICE_STALE_MS)));

  function chooseRecipe(id: string) {
    setSelectedId(id);
    setRecipeFocused(true);
    const url = new URL(window.location.href);
    url.searchParams.set("recipe", id);
    window.history.replaceState(null, "", url);
    window.setTimeout(() => document.getElementById("recipe-details")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  function changeRecipe() {
    setRecipeFocused(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("recipe");
    window.history.replaceState(null, "", url);
    window.setTimeout(() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  function changeView(next: ViewMode) {
    setViewMode(next);
    try { window.localStorage.setItem(VIEW_MODE_KEY, next); } catch { /* preference is optional */ }
  }
  function toggleSearch() {
    setSearchVisible((current) => {
      const next = !current;
      try { window.localStorage.setItem(SEARCH_VISIBLE_KEY, String(next)); } catch { /* preference is optional */ }
      return next;
    });
  }
  async function updateTodo(recipeId: string, quantity: number) {
    const nextQuantity = Math.max(0, Math.min(99, Math.trunc(quantity)));
    const previous = todos[recipeId] ?? 0;
    if (pendingTodos.has(recipeId) || nextQuantity === previous) return;
    setNotice(null);
    setSaveError(null);
    setTodos((current) => { const next = { ...current }; if (nextQuantity) next[recipeId] = nextQuantity; else delete next[recipeId]; return next; });
    if (!session.user) {
      try {
        const next = { ...todos }; if (nextQuantity) next[recipeId] = nextQuantity; else delete next[recipeId];
        window.localStorage.setItem(LOCAL_TODOS_KEY, JSON.stringify(Object.entries(next).map(([id, value]) => ({ recipeId: id, quantity: value }))));
        setNotice("To-do list saved on this device. Sign in to sync it across devices.");
      } catch {
        setTodos((current) => { const next = { ...current }; if (previous) next[recipeId] = previous; else delete next[recipeId]; return next; });
        setSaveError("This browser could not save the to-do list change.");
      }
      return;
    }
    setPendingTodos((current) => new Set(current).add(recipeId));
    try {
      const response = await fetch("/api/todos", nextQuantity
        ? { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipeId, quantity: nextQuantity }) }
        : { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipeId }) });
      if (!response.ok) throw new Error("Save failed");
      setNotice("To-do list synced to your account.");
    } catch {
      setTodos((current) => { const next = { ...current }; if (previous) next[recipeId] = previous; else delete next[recipeId]; return next; });
      setSaveError("The to-do list change was not saved. The previous quantity was restored.");
    } finally {
      setPendingTodos((current) => { const next = new Set(current); next.delete(recipeId); return next; });
    }
  }
  async function updateAllocation(itemId: string, next: ComponentAllocation, previous: ComponentAllocation) {
    if (pendingItems.has(itemId) || (next.ownedQuantity === previous.ownedQuantity && next.farmableQuantity === previous.farmableQuantity)) return;
    setSaveError(null);
    setNotice(null);
    setAllocations((current) => ({ ...current, [itemId]: next }));
    if (!session.user) {
      const saved = { ...allocations, [itemId]: next };
      try {
        window.localStorage.setItem(LOCAL_ALLOCATIONS_KEY, JSON.stringify(saved));
        setNotice("Inventory saved on this device. Sign in to keep it across devices.");
      } catch {
        setAllocations((current) => ({ ...current, [itemId]: previous }));
        setSaveError("This browser could not save the inventory change.");
      }
      return;
    }
    setPendingItems((current) => new Set(current).add(itemId));
    try {
      await readJson("/api/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId, ...next }) });
      setNotice("Inventory synced to your account.");
    } catch {
      setAllocations((current) => ({ ...current, [itemId]: previous }));
      setSaveError("The inventory change was not saved. The previous quantities were restored.");
    } finally {
      setPendingItems((current) => { const copy = new Set(current); copy.delete(itemId); return copy; });
    }
  }
  async function logout() {
    setLoggingOut(true);
    try {
      const response = await fetch("/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      setSession({ user: null });
      setAllocations({ ...defaultAllocations(recipes), ...readLocalAllocations() });
      setTodos(readLocalTodos());
      setNotice("Signed out. Inventory changes now stay on this device.");
    } catch { setSaveError("Could not sign out. Please try again."); }
    finally { setLoggingOut(false); }
  }

  return (
    <main className={`planner-shell ${recipeFocused ? "recipe-focus" : ""}`}>
      <header className="topbar">
        <a className="brand" href="#planner" aria-label="Wikelo Solver home"><span className="brand-mark" aria-hidden="true">W</span><span>Wikelo <em>Solver</em></span></a>
        <nav aria-label="Primary navigation" className="main-nav"><a href="#planner" className="active" onClick={(event) => { if (recipeFocused) { event.preventDefault(); changeRecipe(); } }}>Planner</a><a href="/settings">Settings</a></nav>
        <button className="todo-nav-button" type="button" onClick={() => setTodoOpen(true)}><span>To-do list</span><b>{todoSummary.totalCompletions}</b></button>
        {session.user ? <div className="account-control"><span className="account-avatar" aria-hidden="true">{session.user.displayName.slice(0, 1)}</span><span><strong>{session.user.displayName}</strong><small>Inventory synced</small></span><button type="button" onClick={() => void logout()} disabled={loggingOut}>{loggingOut ? "Signing out…" : "Log out"}</button></div> : <a className="discord-button" href="/auth/discord/start"><span aria-hidden="true">◆</span><span>Sign in with Discord<small>Sync inventory</small></span></a>}
      </header>

      {todoOpen && <div className="todo-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTodoOpen(false); }}>
        <aside className="todo-drawer" role="dialog" aria-modal="true" aria-labelledby="todo-title">
          <header><div><p className="eyebrow">Full completion plan</p><h2 id="todo-title">To-do list</h2></div><button type="button" className="todo-close" onClick={() => setTodoOpen(false)} aria-label="Close to-do list">×</button></header>
          {todoSummary.entries.length === 0 ? <div className="todo-empty"><span aria-hidden="true">◇</span><h3>No recipes queued</h3><p>Open a recipe and add one or more completions to build a combined material plan.</p><button type="button" onClick={() => setTodoOpen(false)}>Browse recipes</button></div> : <>
            <section className="todo-stat-grid" aria-label="To-do totals"><div><span>Completions</span><strong>{todoSummary.totalCompletions}</strong><small>{todoSummary.entries.length} unique recipes</small></div><div><span>Ready now</span><strong>{todoSummary.readiness}%</strong><small>{todoSummary.ownedTotal}/{todoSummary.totalRequired} owned</small></div><div><span>To farm</span><strong>{todoSummary.farmingUnits}</strong><small>units still to gather</small></div><div><span>To source</span><strong>{todoSummary.missingUnits}</strong><small>{todoSummary.materials.filter((item) => item.needed > 0).length} item types</small></div><div><span>Estimated purchases</span><strong>{formatAuec(todoSummary.valueAuec)}</strong><small>aUEC{todoSummary.unpricedItems ? ` + ${todoSummary.unpricedItems} unpriced` : ""}</small></div><div><span>Reputation</span><strong>+{todoSummary.reputationGranted}</strong><small>{todoSummary.reputationNeeded} required to unlock all</small></div></section>
            <section className="todo-section"><div className="todo-section-heading"><div><h3>Queued recipes</h3><p>Change the number of completions at any time.</p></div></div><div className="todo-recipes">{todoSummary.entries.map(({ recipe, quantity }) => <article key={recipe.id}><div><strong>{recipe.name}</strong><small>{recipe.outputs.map((output) => `${output.quantity * quantity}× ${output.name}`).join(" · ")}</small></div><label><span>Qty</span><input key={`${recipe.id}-${quantity}`} type="number" min="1" max="99" defaultValue={quantity} disabled={pendingTodos.has(recipe.id)} onBlur={(event) => void updateTodo(recipe.id, Number(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label><button type="button" onClick={() => { setTodoOpen(false); chooseRecipe(recipe.id); }}>Open</button><button type="button" className="remove" disabled={pendingTodos.has(recipe.id)} onClick={() => void updateTodo(recipe.id, 0)}>Remove</button></article>)}</div></section>
            <section className="todo-section"><div className="todo-section-heading"><div><h3>Combined materials</h3><p>Inventory is applied once across every queued recipe.</p></div><span>{todoSummary.farmingUnits} to farm · {todoSummary.missingUnits} to source</span></div><div className="todo-materials">{todoSummary.materials.map((material) => <article className={material.needed ? "missing" : material.farmable ? "farming" : "ready"} key={material.itemId}><div><strong>{material.name}</strong><small>{material.required} required</small></div><dl><div><dt>Owned</dt><dd>{material.owned}</dd></div><div><dt>To farm</dt><dd>{material.farmable}</dd></div><div><dt>To source</dt><dd>{material.needed}</dd></div></dl><div className="todo-material-cost"><strong>{material.unitPriceAuec === null && material.needed ? "Price missing" : `${formatAuec(material.costAuec)} aUEC`}</strong>{material.uexMarketplaceUrl && <a href={material.uexMarketplaceUrl} target="_blank" rel="noreferrer">UEX listing</a>}</div></article>)}</div></section>
            {!session.user && <p className="local-disclaimer">This to-do list is saved only in this browser. <a href="/auth/discord/start">Sign in</a> to sync it across devices.</p>}
          </>}
        </aside>
      </div>}

      <section className="hero" aria-labelledby="page-title">
        <div><p className="eyebrow">Wikelo reward planner</p><h1 id="page-title">Pick a reward.<br /><i>Plan every material.</i></h1><p className="hero-copy">Choose a Wikelo recipe, separate what you already own from what you can farm, and see exactly what remains to source.</p></div>
        <div className="plan-snapshot" aria-label="Completion plan summary">
          <div><span>Your completion plan</span><strong>{todoSummary.totalCompletions > 0 ? `${todoSummary.totalCompletions} completion${todoSummary.totalCompletions === 1 ? "" : "s"} queued` : "Nothing queued yet"}</strong><p>{todoSummary.totalCompletions > 0 ? `${todoSummary.ownedTotal} owned · ${todoSummary.farmingUnits} to farm · ${todoSummary.missingUnits} to source` : "Add one or more recipes to combine their requirements and track the full run."}</p></div>
          {todoSummary.totalCompletions > 0 ? <><div className="progress-track" aria-hidden="true"><span style={{ width: `${todoSummary.readiness}%` }} /></div><button type="button" onClick={() => setTodoOpen(true)}>Open full plan</button></> : <button type="button" onClick={() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{loading ? "Loading recipes…" : `Browse ${recipes.length} recipes`}</button>}
        </div>
      </section>
      {(notice || saveError) && <div className={`notice-bar ${saveError ? "error" : ""}`} role={saveError ? "alert" : "status"}>{saveError ?? notice}</div>}

      {searchVisible ? <section className="planner-controls" id="planner" aria-label="Search and filter recipes">
        <label className="global-search" htmlFor="recipe-search"><span>Search recipes and ingredients</span><div className="search-box"><span aria-hidden="true">⌕</span><input id="recipe-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try a recipe, reward, or component name…" /></div></label>
        <div className="control-group"><span>Inventory</span><div className="segmented-control">{([["all", "All"], ["ready", "Fully owned"], ["needed", "Needs work"]] as Array<[ReadinessFilter, string]>).map(([value, label]) => <button key={value} type="button" className={readiness === value ? "selected" : ""} aria-pressed={readiness === value} onClick={() => setReadiness(value)}>{label}</button>)}</div></div>
        <label className="sort-control"><span>Sort</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)}><option value="price">Lowest price</option><option value="name">Recipe name</option><option value="needed">Reputation needed</option><option value="granted">Reputation granted</option></select></label>
        <div className="view-toggle" role="group" aria-label="Recipe summary view"><span>View</span><div><button type="button" className={viewMode === "table" ? "selected" : ""} onClick={() => changeView("table")} aria-pressed={viewMode === "table"}>Table</button><button type="button" className={viewMode === "cards" ? "selected" : ""} onClick={() => changeView("cards")} aria-pressed={viewMode === "cards"}>Cards</button></div></div>
        <button type="button" className="search-visibility-toggle" onClick={toggleSearch}>Hide search & filters</button>
      </section> : <div className="planner-controls-collapsed" id="planner"><button type="button" onClick={toggleSearch}>Show search & filters{search || readiness !== "all" ? " (filtered)" : ""}</button></div>}

      <section className={`planner-workspace ${recipeFocused ? "focused" : ""}`} aria-busy={loading}>
        {!recipeFocused && <aside className={`recipe-browser ${viewMode}-view`} aria-label="Recipe summaries">
          <div className="browser-heading"><div><p className="eyebrow">Recipe index</p><h2>Choose a recipe</h2></div><span>{loading ? "Loading" : `${filteredRecipes.length} of ${recipes.length}`}</span></div>
          {data?.status === "importing" && <div className="state-banner importing" role="status"><span className="spinner" aria-hidden="true" />A new patch is importing. The last complete patch remains available.</div>}
          {loading ? <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" /><h3>Loading live recipes</h3><p>Reading the active patch and current prices.</p></div>
            : loadError ? <div className="empty-state error-state" role="alert"><span>!</span><h3>Recipes unavailable</h3><p>{loadError}</p><button type="button" onClick={() => void loadPlanner()}>Try again</button></div>
            : recipes.length === 0 ? <div className="empty-state"><span>◇</span><h3>No active recipes</h3><p>Import a complete game snapshot to begin planning.</p></div>
            : filteredRecipes.length === 0 ? <div className="empty-state"><span>⌕</span><h3>No matching recipes</h3><p>Try another recipe, reward, or component name.</p><button type="button" onClick={() => { setSearch(""); setReadiness("all"); }}>Clear filters</button></div>
            : <div className="recipe-summaries">{filteredRecipes.map((recipe) => {
              const summary = summaryFor(recipe);
              return <article className={`recipe-summary ${recipe.id === selectedRecipe?.id ? "chosen" : ""}`} key={recipe.id}><button type="button" onClick={() => chooseRecipe(recipe.id)} aria-pressed={recipe.id === selectedRecipe?.id}><span className={`recipe-glyph ${categoryTone(recipe.category)}`} aria-hidden="true">✦</span><span className="recipe-name"><strong>{recipe.name}</strong><small>{recipe.output.quantity}× {recipe.output.name}{recipe.outputs.length > 1 ? ` · +${recipe.outputs.length - 1} more` : ""}</small></span><span className="summary-price"><b>{formatAuec(summary.valueAuec)}</b><small>{summary.complete ? "aUEC left" : `+ ${summary.missingItemIds.length} unpriced`}</small></span><span className={`readiness-pill ${summary.ready ? "ready" : ""}`}>{summary.readiness}% owned</span><span className="card-reputation"><b>{recipe.reputationNeeded}</b> rep needed · +{recipe.reputationGranted}</span></button></article>;
            })}</div>}
        </aside>}

        <section className="detail-panel" id="recipe-details" aria-live="polite">
          {selectedRecipe && selectedSummary ? <>
            {recipeFocused && <div className="focus-toolbar"><button type="button" onClick={changeRecipe}><span aria-hidden="true">←</span> Change recipe</button><span><strong>{selectedRecipe.name}</strong><small>{selectedSummary.readiness}% owned · {selectedSummary.farmableQuantity} to farm</small></span></div>}
            <header className="detail-title"><div><p className="eyebrow">Current recipe</p><h2>{selectedRecipe.name}</h2></div><div className="detail-actions"><div className="detail-progress"><span>{selectedSummary.readiness}% owned</span><div className="progress-track" aria-hidden="true"><span style={{ width: `${selectedSummary.readiness}%` }} /></div></div><div className="todo-add-control"><input aria-label="Number of completions to add" type="number" min="1" max="99" value={todoQuantity} onChange={(event) => setTodoQuantity(Math.max(1, Math.min(99, Number(event.target.value))))} /><button type="button" disabled={pendingTodos.has(selectedRecipe.id)} onClick={() => void updateTodo(selectedRecipe.id, (todos[selectedRecipe.id] ?? 0) + todoQuantity)}>Add to to-do</button></div></div></header>
            <section className="recipe-rewards" aria-labelledby="recipe-rewards-title"><div className="reward-heading"><div><p className="eyebrow">Produced on completion</p><h3 id="recipe-rewards-title">Recipe rewards</h3></div><span>{selectedRecipe.outputs.length} item{selectedRecipe.outputs.length === 1 ? "" : "s"}</span></div><div className="reward-list">{selectedRecipe.outputs.map((output, index) => <article key={`${output.itemId ?? output.name}-${index}`}><span className="reward-quantity">{output.quantity}×</span><div><strong>{output.name}</strong><small>{output.quantity === 1 ? "Item awarded" : "Items awarded"}</small></div></article>)}</div></section>
            <div className="recipe-overview"><div><span>Reputation needed</span><strong>{selectedRecipe.reputationNeeded}</strong></div><div><span>Granted</span><strong>+{selectedRecipe.reputationGranted}</strong></div><div className="overview-cost"><span>Still to source</span><strong>{formatAuec(selectedSummary.valueAuec)} <small>aUEC</small></strong><p>{selectedSummary.complete ? "All needed units are priced." : `${selectedSummary.missingItemIds.length} needed item price${selectedSummary.missingItemIds.length === 1 ? " is" : "s are"} missing.`}</p></div></div>
            <div className="component-heading"><div><h3>Allocate required units</h3><p>Keep owned inventory separate from materials you still need to farm or source.</p></div><span>{selectedSummary.ownedQuantity}/{selectedSummary.totalQuantity} in inventory</span></div>
            <div className="component-list">{selectedRecipe.components.map((component) => {
              const allocation = allocationFor(component.itemId, component.allocation);
              const owned = Math.min(component.quantity, allocation.ownedQuantity);
              const farmable = Math.min(component.quantity - owned, allocation.farmableQuantity);
              const needed = component.quantity - owned - farmable;
              const pending = pendingItems.has(component.itemId);
              const setOwned = (value: number) => updateAllocation(component.itemId, { ownedQuantity: Math.max(0, Math.min(component.quantity, value)), farmableQuantity: Math.min(farmable, component.quantity - Math.max(0, Math.min(component.quantity, value))) }, allocation);
              const setFarmable = (value: number) => updateAllocation(component.itemId, { ownedQuantity: owned, farmableQuantity: Math.max(0, Math.min(component.quantity - owned, value)) }, allocation);
              return <article className={`component ${owned === component.quantity ? "owned-complete" : farmable > 0 ? "has-farmable" : ""}`} key={component.itemId}>
                <div className="component-main"><span className="component-token" aria-hidden="true">◆</span><div><strong>{component.name}</strong><small>{owned} owned · {farmable} to farm · {needed} to source</small></div><b className={component.unitPriceAuec === null && needed > 0 ? "missing" : ""}>{component.unitPriceAuec === null && needed > 0 ? "Price missing" : `${formatAuec((component.unitPriceAuec ?? 0) * needed)} aUEC`}<small>{component.unitPriceAuec === null && needed > 0 ? "Sourced units not counted" : `${formatAuec(component.unitPriceAuec ?? 0)} each · ${needed} to source`}</small></b></div>
                <div className="allocation-grid" aria-label={`${component.name} unit allocation`}>
                  <label className="allocation owned"><span>Owned</span><input key={`${component.itemId}-owned-${owned}`} type="number" min="0" max={component.quantity} defaultValue={owned} disabled={pending} onBlur={(event) => void setOwned(Number(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small>in inventory</small></label>
                  <label className="allocation farmable"><span>To farm</span><input key={`${component.itemId}-farmable-${farmable}`} type="number" min="0" max={component.quantity - owned} defaultValue={farmable} disabled={pending} onBlur={(event) => void setFarmable(Number(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small>still must gather</small></label>
                  <div className="allocation needed"><span>To source</span><strong>{needed}</strong><small>buy or find</small></div>
                  <div className="allocation-actions"><button type="button" disabled={pending} onClick={() => void updateAllocation(component.itemId, { ownedQuantity: component.quantity, farmableQuantity: 0 }, allocation)}>Mark owned</button><button type="button" disabled={pending} onClick={() => void updateAllocation(component.itemId, { ownedQuantity: 0, farmableQuantity: component.quantity }, allocation)}>Farm all</button><button type="button" disabled={pending} onClick={() => void updateAllocation(component.itemId, { ownedQuantity: 0, farmableQuantity: 0 }, allocation)}>Source all</button></div>
                </div>
                <div className="component-data">{component.mappingStatus !== "matched" && <span className="data-flag mapping">{component.mappingStatus === "review" ? "UEX match needs review" : "UEX match missing"}</span>}{component.priceMode !== "uex" && <span className="data-flag current">{component.priceMode === "override" ? "Your price override" : "Your UEX match"}</span>}{component.uexMarketplaceUrl && <a href={component.uexMarketplaceUrl} target="_blank" rel="noreferrer">Open UEX listing</a>}<span>Price updated {formatTimestamp(component.priceCapturedAt)}</span><a href={`/settings?item=${encodeURIComponent(component.itemId)}`}>Correct price</a>{pending && <span role="status">Saving…</span>}</div>
              </article>;
            })}</div>
            {!session.user && <p className="local-disclaimer">Inventory is saved only in this browser. <a href="/auth/discord/start">Sign in</a> to sync it and manage personal price corrections.</p>}
          </> : <div className="detail-placeholder"><span aria-hidden="true">◇</span><h2>No recipe selected</h2><p>Recipe details will appear when an active patch is available.</p></div>}
        </section>
      </section>

      <section className="data-status" id="data-status" aria-label="Live data status"><strong>Data status</strong><dl><div><dt>Active patch</dt><dd>{data?.patch ? `${data.patch.version} · ${data.patch.channel}` : "Unavailable"}</dd></div><div><dt>Recipes extracted</dt><dd>{formatTimestamp(data?.patch?.extractedAt ?? null)}</dd></div><div><dt>Prices refreshed</dt><dd>{formatTimestamp(data?.freshness.latestPriceAt ?? null)}</dd></div></dl><div className="freshness-warnings">{recipeStale && <span className="data-flag warning">Recipe data may be stale</span>}{priceStale && <span className="data-flag warning">Price data may be stale</span>}{data && data.counts.missingMappings > 0 && <span className="data-flag mapping">{data.counts.missingMappings} unmatched items</span>}</div></section>
      <footer><span className="brand-mark small" aria-hidden="true">W</span><p>Wikelo Solver is an independent planning tool and is not affiliated with Cloud Imperium Games, Discord, or UEX Corp.</p><span>Verify live market data before spending.</span></footer>
    </main>
  );
}
