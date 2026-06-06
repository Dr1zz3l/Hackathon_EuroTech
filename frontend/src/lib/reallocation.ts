/**
 * Client-side land reallocation engine — Concept C: bounded quadratic program.
 *
 * Pure TypeScript — no React, no side effects, no network calls.
 * Agent B imports `createAllocator`; never edits this file.
 *
 * ## Problem statement
 * Given a city-wide growth goal G (km² of target category T to add), find per-district
 * additions Δ_d that:
 *
 *   minimize  Σ_d  Δ_d² / (2·viability_d)  −  μ · Σ_d  affinity_d · Δ_d
 *   subject to  Σ_d Δ_d = G
 *               0  ≤  Δ_d  ≤  cap_d
 *
 * Interpretation:
 *  - First term: weighted L2 disruption — prefer districts where change is "cheap"
 *    (high viability = low density, good headroom).
 *  - Second term: agglomeration reward — prefer districts that already concentrate T
 *    or are neighbours of such districts.
 *  - μ = scenario.cluster_strength tunes the tradeoff.
 *
 * ## Solution
 * KKT conditions give Δ_d(ν) = clip(viability_d · (μ·affinity_d + ν), 0, cap_d).
 * Σ Δ_d(ν) is monotone increasing in ν → bisection on ν to hit G.
 *
 * ## Donor split
 * Within each receiving district, the Δ_d km² added to category T are removed from
 * all other planning categories (NOT other = transport/water) proportionally to their
 * current area, flooring each at DONOR_FLOOR of its current area so nothing is wiped.
 */

import type {
  AdjacencyMap,
  AllocationResult,
  Allocator,
  District,
  DistrictAllocation,
  LandCategory,
  LandUse,
  Scenario,
  Scorer,
} from '../types';

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

/** Donor categories shrink proportionally but never below this fraction of current. */
const DONOR_FLOOR = 0.50;

/** Target category never exceeds this fraction of a district's total area. */
const TARGET_MAX = 0.70;

/** Viability floor — prevents division-by-zero; unlikely given 18 real districts. */
const VIABILITY_EPS = 0.01;

/** Categories that can donate land (never 'other' = transport/water). */
const DONOR_CATS: LandCategory[] = ['residential', 'industrial', 'commercial', 'green', 'educational'];

/** All categories including other — used for delta bookkeeping. */
const ALL_CATS = [...DONOR_CATS, 'other'] as const;

// ------------------------------------------------------------
// Neighbour-average helper (mirrors scoring.ts pattern)
// ------------------------------------------------------------

type NeighbourAvgMap = Map<string, Partial<Record<LandCategory, number>>>;

function buildNeighbourAvgs(districts: District[], adjacency: AdjacencyMap): NeighbourAvgMap {
  const lookup = new Map(districts.map(d => [d.name, d]));
  const result: NeighbourAvgMap = new Map();
  for (const d of districts) {
    const neighbours = adjacency[d.name] ?? [];
    const entry: Partial<Record<LandCategory, number>> = {};
    for (const cat of DONOR_CATS) {
      if (neighbours.length === 0) {
        entry[cat] = d.land[cat]; // isolated: own share only
      } else {
        const sum = neighbours.reduce((s, name) => {
          const n = lookup.get(name);
          return s + (n ? n.land[cat] : 0);
        }, 0);
        entry[cat] = sum / neighbours.length;
      }
    }
    result.set(d.name, entry);
  }
  return result;
}

// ------------------------------------------------------------
// Min-max normalisation helper
// ------------------------------------------------------------

function normalise(values: number[]): number[] {
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  if (mx === mn) return values.map(() => 0.5);
  return values.map(v => (v - mn) / (mx - mn));
}

// ------------------------------------------------------------
// Per-district receive cap
// ------------------------------------------------------------

function computeCap(d: District, target: LandCategory): number {
  const area = d.area_km2;

  // How much room to grow toward TARGET_MAX
  const headroomCap = Math.max(0, TARGET_MAX - d.land[target]) * area;

  // How much can donors give (each keeps at least DONOR_FLOOR of current)
  const donatable = DONOR_CATS
    .filter(c => c !== target)
    .reduce((sum, c) => {
      const currentKm2 = d.land[c] * area;
      const floorKm2   = DONOR_FLOOR * currentKm2;
      return sum + Math.max(0, currentKm2 - floorKm2);
    }, 0);

  return Math.min(headroomCap, donatable);
}

// ------------------------------------------------------------
// Donor split — subtract Δ km² from donor categories proportionally
// ------------------------------------------------------------

function applyDonors(current: LandUse, deltaKm2: number, target: LandCategory, area: number): LandUse {
  const future = { ...current };

  // Eligible donors: planning cats excluding target and excluding other
  const donors = DONOR_CATS.filter(c => c !== target);
  const totalDonorKm2 = donors.reduce((s, c) => s + current[c] * area, 0);

  if (totalDonorKm2 <= 0 || deltaKm2 <= 0) return future;

  for (const c of donors) {
    const currentKm2 = current[c] * area;
    const share      = currentKm2 / totalDonorKm2;
    const rawTake    = share * deltaKm2;
    // Respect floor — each donor keeps at least DONOR_FLOOR of its current
    const maxTake    = Math.max(0, currentKm2 - DONOR_FLOOR * currentKm2);
    const actualTake = Math.min(rawTake, maxTake);
    future[c] = Math.max(0, (currentKm2 - actualTake) / area);
  }

  // Add Δ to target
  future[target] = Math.min(TARGET_MAX, current[target] + deltaKm2 / area);

  return future;
}

// ------------------------------------------------------------
// Bisection solver  —  find ν s.t. Σ clip(v_d·(μ·a_d + ν), 0, cap_d) = G
// ------------------------------------------------------------

function bisect(
  viabilities: number[],
  affinities:  number[],
  caps:        number[],
  G:           number,
  mu:          number,
  maxIter = 120,
): number[] {
  const n = viabilities.length;

  function totalAlloc(nu: number): number {
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += Math.min(caps[i], Math.max(0, viabilities[i] * (mu * affinities[i] + nu)));
    }
    return s;
  }

  // Quick check: if all districts at cap still can't hit G, return saturated
  const totalCap = caps.reduce((a, b) => a + b, 0);
  if (totalCap <= G) {
    return caps.map(c => c); // saturate
  }

  // Find bracket for ν
  let lo = -mu * Math.max(...affinities) - 1;
  let hi = G / (Math.min(...viabilities.filter(v => v > 0)) || VIABILITY_EPS);

  // Ensure hi is large enough
  while (totalAlloc(hi) < G) hi *= 2;
  // Ensure lo gives totalAlloc ≤ G (some districts might still have positive alloc at lo,
  // but at lo all are floored at 0 since viability*(mu*a+lo) < 0 for large enough negative lo)
  while (totalAlloc(lo) > G) lo *= 2;

  for (let iter = 0; iter < maxIter; iter++) {
    const mid = (lo + hi) / 2;
    if (totalAlloc(mid) < G) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 1e-9) break;
  }

  const nu = (lo + hi) / 2;
  return viabilities.map((v, i) =>
    Math.min(caps[i], Math.max(0, v * (mu * affinities[i] + nu)))
  );
}

// ------------------------------------------------------------
// Sanity check (dev builds)
// ------------------------------------------------------------

function assertConservation(
  districts: District[],
  result: AllocationResult,
  G: number,
): void {
  if (import.meta.env.PROD) return;

  let totalReceived = 0;
  for (const d of districts) {
    const alloc = result.byDistrict.get(d.name);
    if (!alloc) continue;
    totalReceived += alloc.received_km2;

    // Fractions still sum to ≤ 1
    const sumFuture = ALL_CATS.reduce((s, c) => s + alloc.future[c], 0);
    if (Math.abs(sumFuture - 1.0) > 0.01) {
      console.warn(`[reallocation] ${d.name}: future fractions sum = ${sumFuture.toFixed(4)}`);
    }

    // No fraction < 0 or > 1
    for (const c of ALL_CATS) {
      if (alloc.future[c] < -0.001 || alloc.future[c] > 1.001) {
        console.warn(`[reallocation] ${d.name}.future.${c} = ${alloc.future[c].toFixed(4)}`);
      }
    }
  }

  const rel = Math.abs(totalReceived - result.achievedKm2) / (result.goalKm2 || 1);
  if (rel > 0.01) {
    console.warn(`[reallocation] sum mismatch: totalReceived=${totalReceived.toFixed(2)} achievedKm2=${result.achievedKm2.toFixed(2)}`);
  }

  const shortfallPct = ((result.goalKm2 - result.achievedKm2) / result.goalKm2 * 100).toFixed(1);
  console.info(
    `[reallocation] ${result.target}: goal=${result.goalKm2.toFixed(1)} km² ` +
    `achieved=${result.achievedKm2.toFixed(1)} km² ` +
    `(${shortfallPct}% shortfall) ` +
    `G_target=${G.toFixed(1)} km²`
  );
}

// ------------------------------------------------------------
// Public factory
// ------------------------------------------------------------

/**
 * Call once at app startup with the full district array (same as createScorer).
 * The returned allocator is bound to the adjacency data and safe to reuse
 * across all scenario switches with no overhead.
 *
 * @example
 * const allocator = createAllocator(districts, adjacency);
 * const result = allocator.allocate(activeScenario, scorer);
 * // result is null for Urban Renewal (no goal_delta)
 */
export function createAllocator(districts: District[], adjacency?: AdjacencyMap): Allocator {
  const neighbourAvg: NeighbourAvgMap = adjacency
    ? buildNeighbourAvgs(districts, adjacency)
    : new Map();

  return {
    allocate(scenario: Scenario, scorer: Scorer): AllocationResult | null {
      const { goal_delta, target, cluster_strength } = scenario;
      if (goal_delta == null) return null;

      const mu = cluster_strength ?? 1.0;

      // ---- 1. City-wide goal in km² ----
      const cityCurrentKm2 = districts.reduce((s, d) => s + d.land[target] * d.area_km2, 0);
      const G = goal_delta * cityCurrentKm2;

      // ---- 2. Per-district caps ----
      const caps = districts.map(d => computeCap(d, target));

      // ---- 3. Viability scores (clamped) ----
      const viabilities = districts.map(d =>
        Math.max(VIABILITY_EPS, scorer.score(d, scenario).score)
      );

      // ---- 4. Affinity = own + neighbour-avg, normalised ----
      const rawAffinities = districts.map(d => {
        const own   = d.land[target];
        const navg  = neighbourAvg.get(d.name)?.[target] ?? own;
        return own + navg;
      });
      const affinities = normalise(rawAffinities);

      // ---- 5. Solve QP via bisection ----
      const deltas = bisect(viabilities, affinities, caps, G, mu);

      // ---- 6. Build per-district allocations ----
      const byDistrict = new Map<string, DistrictAllocation>();
      let achievedKm2 = 0;

      for (let i = 0; i < districts.length; i++) {
        const d      = districts[i];
        const deltaKm2 = deltas[i];
        achievedKm2 += deltaKm2;

        const current = { ...d.land };
        const future  = applyDonors(current, deltaKm2, target, d.area_km2);

        // Normalise future fractions so they sum to exactly the same total as current
        // (floating-point drift guard)
        const currentSum = ALL_CATS.reduce((s, c) => s + current[c], 0);
        const futureSum  = ALL_CATS.reduce((s, c) => s + future[c], 0);
        if (Math.abs(futureSum - currentSum) > 1e-6 && futureSum > 0) {
          const scale = currentSum / futureSum;
          for (const c of ALL_CATS) future[c] *= scale;
        }

        const delta = {} as LandUse;
        for (const c of ALL_CATS) {
          delta[c] = future[c] - current[c];
        }

        byDistrict.set(d.name, {
          name: d.name,
          current,
          future,
          delta,
          received_km2: deltaKm2,
        });
      }

      const result: AllocationResult = {
        byDistrict,
        target,
        goalKm2:     G,
        achievedKm2,
      };

      assertConservation(districts, result, G);
      return result;
    },
  };
}
