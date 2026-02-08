# MVP UX + Validation + Cache Planning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve UX (map marker, auto-fill), add CPF/CNPJ validation end-to-end, and update MVP planning with index review + analysis cache table scope.

**Architecture:** Add shared CPF/CNPJ validation utilities in both web and API; enhance NewAnalysis auto-fill with debounced lookup; replace map search marker with a custom Leaflet pin icon. Keep API validations in services, preserve DTOs. Update planning/cards to reflect new MVP scope.

**Tech Stack:** Vue 3 + Vite + Vitest, NestJS + Prisma + Jest, Leaflet.

---

### Task 1: CPF/CNPJ validation utilities (web)

**Files:**
- Create: `apps/web/src/lib/doc-utils.ts`
- Create: `apps/web/src/lib/__tests__/doc-utils.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { isValidCpf, isValidCnpj } from "../doc-utils";

describe("doc-utils", () => {
  it("validates CPF check digits", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
  });

  it("validates CNPJ check digits", () => {
    expect(isValidCnpj("27865757000102")).toBe(true);
    expect(isValidCnpj("27865757000103")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/doc-utils.test.ts` (apps/web)
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

```ts
export function isValidCpf(cpf: string): boolean {
  // digits-only check, reject repeated digits, compute check digits
}

export function isValidCnpj(cnpj: string): boolean {
  // digits-only check, compute check digits
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/doc-utils.test.ts` (apps/web)
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/doc-utils.ts apps/web/src/lib/__tests__/doc-utils.test.ts
git commit -m "feat(web): add cpf/cnpj validation utils"
```

---

### Task 2: CPF/CNPJ validation + masking in forms (web)

**Files:**
- Modify: `apps/web/src/views/NewAnalysisView.vue`
- Modify: `apps/web/src/views/FarmsView.vue`
- Modify: `apps/web/src/views/FarmDetailView.vue`
- Modify: `apps/web/src/views/HomeView.vue`
- Test: `apps/web/src/views/__tests__/NewAnalysisView.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import NewAnalysisView from "@/views/NewAnalysisView.vue";

vi.mock("@/api/http", () => ({ http: { get: vi.fn(), post: vi.fn() } }));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: "/analyses/new", query: {} }),
}));

describe("NewAnalysisView", () => {
  it("blocks submit on invalid CPF", async () => {
    const wrapper = mount(NewAnalysisView);
    await wrapper.find("#analysis-car").setValue("SP-1234567-0000000000000000000000000000000000");
    await wrapper.find("#analysis-doc").setValue("111.111.111-11");
    await wrapper.find("button").trigger("click");
    expect(wrapper.text()).toContain("CPF/CNPJ inválido");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/views/__tests__/NewAnalysisView.test.ts` (apps/web)
Expected: FAIL (message missing)

**Step 3: Write minimal implementation**

- Use `isValidCpf` / `isValidCnpj` to validate when length is 11/14 digits.
- Show inline error and block submit when invalid.
- Apply same logic in FarmsView + FarmDetailView + HomeView.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/views/__tests__/NewAnalysisView.test.ts` (apps/web)
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/views/NewAnalysisView.vue apps/web/src/views/FarmsView.vue apps/web/src/views/FarmDetailView.vue apps/web/src/views/HomeView.vue apps/web/src/views/__tests__/NewAnalysisView.test.ts
git commit -m "feat(web): validate cpf/cnpj in forms"
```

---

### Task 3: Auto-fill farm data in New Analysis (web)

**Files:**
- Modify: `apps/web/src/views/NewAnalysisView.vue`
- Test: `apps/web/src/views/__tests__/NewAnalysisView.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import NewAnalysisView from "@/views/NewAnalysisView.vue";
import { http } from "@/api/http";

vi.mock("@/api/http", () => ({ http: { get: vi.fn(), post: vi.fn() } }));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: "/analyses/new", query: {} }),
}));

describe("NewAnalysisView auto-fill", () => {
  it("auto-fills farm data when carKey is entered", async () => {
    (http.get as any).mockResolvedValueOnce({
      data: { data: [{ id: "farm-1", name: "Fazenda Teste", carKey: "SP-123", cpfCnpj: "52998224725" }], meta: { page: 1, pageSize: 20, total: 1 } },
    });

    const wrapper = mount(NewAnalysisView);
    await wrapper.find("#analysis-car").setValue("SP-123");

    await new Promise((r) => setTimeout(r, 400));
    await wrapper.vm.$nextTick();

    expect(wrapper.find("#analysis-name").element.value).toBe("Fazenda Teste");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/views/__tests__/NewAnalysisView.test.ts` (apps/web)
Expected: FAIL (auto-fill not implemented)

**Step 3: Write minimal implementation**

- Add debounced lookup to `/v1/farms?q=...` when farmName/carKey/cpfCnpj changes.
- Fill missing fields and set `farmId` when match is confident.
- Add small loading indicator text while fetching.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/views/__tests__/NewAnalysisView.test.ts` (apps/web)
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/views/NewAnalysisView.vue apps/web/src/views/__tests__/NewAnalysisView.test.ts
git commit -m "feat(web): autofill farm data in new analysis"
```

---

### Task 4: Map marker (CAR search) uses location pin

**Files:**
- Modify: `apps/web/src/components/maps/CarSelectMap.vue`
- Test: `apps/web/src/components/maps/__tests__/car-search-pin.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { getSearchPinHtml } from "../CarSelectMap";

describe("car search pin", () => {
  it("returns a pin svg with primary color", () => {
    const html = getSearchPinHtml();
    expect(html).toContain("car-search-pin");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/components/maps/__tests__/car-search-pin.test.ts` (apps/web)
Expected: FAIL (export missing)

**Step 3: Write minimal implementation**

- Extract pin HTML generator (`getSearchPinHtml`) and use Leaflet `divIcon`.
- Use CSS class with `background: hsl(var(--primary))` and `stroke: hsl(var(--primary-foreground))`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/components/maps/__tests__/car-search-pin.test.ts` (apps/web)
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/maps/CarSelectMap.vue apps/web/src/components/maps/__tests__/car-search-pin.test.ts
git commit -m "feat(web): use pin marker for car search"
```

---

### Task 5: CPF/CNPJ validation utilities (API)

**Files:**
- Create: `apps/api/src/common/validators/cpf-cnpj.ts`
- Create: `apps/api/src/common/validators/cpf-cnpj.spec.ts`

**Step 1: Write the failing test**

```ts
import { isValidCpf, isValidCnpj } from './cpf-cnpj';

describe('cpf-cnpj', () => {
  it('validates cpf digits', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('52998224724')).toBe(false);
  });

  it('validates cnpj digits', () => {
    expect(isValidCnpj('27865757000102')).toBe(true);
    expect(isValidCnpj('27865757000103')).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/common/validators/cpf-cnpj.spec.ts` (apps/api)
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

- Add `sanitizeCpfCnpj`, `isValidCpf`, `isValidCnpj`, `isValidCpfCnpj`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/common/validators/cpf-cnpj.spec.ts` (apps/api)
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/common/validators/cpf-cnpj.ts apps/api/src/common/validators/cpf-cnpj.spec.ts
git commit -m "feat(api): add cpf/cnpj validation utils"
```

---

### Task 6: Enforce CPF/CNPJ validation in API services

**Files:**
- Modify: `apps/api/src/farms/farms.service.ts`
- Modify: `apps/api/src/analyses/analyses.service.ts`
- Modify: `apps/api/src/farms/farms.service.spec.ts`

**Step 1: Write the failing test**

```ts
it('rejects invalid cpf on update', async () => {
  const prisma = makePrismaMock();
  prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
  prisma.farm.findUnique.mockResolvedValue({ id: 'farm-1', ownerUserId: 'user-1' });
  const service = new FarmsService(prisma as any);

  await expect(
    service.update({ sub: 'entra-1' } as any, 'farm-1', { cpfCnpj: '11111111111' }),
  ).rejects.toMatchObject({ response: { code: 'INVALID_CPF_CNPJ' } });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/farms/farms.service.spec.ts` (apps/api)
Expected: FAIL (invalid cpf accepted)

**Step 3: Write minimal implementation**

- Use `isValidCpfCnpj` from validator in `normalizeCpfCnpj`.
- In analyses service, use the same validation helper.
- Keep error code `INVALID_CPF_CNPJ`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/farms/farms.service.spec.ts` (apps/api)
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/farms/farms.service.ts apps/api/src/analyses/analyses.service.ts apps/api/src/farms/farms.service.spec.ts
git commit -m "feat(api): validate cpf/cnpj check digits"
```

---

### Task 7: Update MVP planning + cards

**Files:**
- Modify: `planning.md`
- Modify: `docs/status-cards.md`

**Step 1: Add new MVP final step**

- Add DB index review task for app + landwatch schemas.
- Add analysis cache table (TTL 2 months) as planned only.

**Step 2: Update cards**

- Add the same items to EPIC-09 / MVP checklist.

**Step 3: Commit**

```bash
git add planning.md docs/status-cards.md
git commit -m "chore: update MVP planning for index review and analysis cache"
```

---

### Task 8: Run full test suite for touched projects

**Run:**
- `npm test -- src/lib/__tests__/doc-utils.test.ts` (apps/web)
- `npm test -- src/views/__tests__/NewAnalysisView.test.ts` (apps/web)
- `npm test -- src/components/maps/__tests__/car-search-pin.test.ts` (apps/web)
- `npm test -- src/common/validators/cpf-cnpj.spec.ts` (apps/api)
- `npm test -- src/farms/farms.service.spec.ts` (apps/api)

**Expected:** All PASS

---
