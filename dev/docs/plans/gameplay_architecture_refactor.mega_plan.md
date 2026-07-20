# Gameplay 架構重構 Mega Plan：Pre-ECS 去中央化 → 延後的 Entity 模型決策

> **Status**: Phase A 之 A1–A5、A7 已完成（2026-07-20）；A6 已定案為 [gameplay_architecture_refactor_a6_world_ownership_split.implementation_spec.md](gameplay_architecture_refactor_a6_world_ownership_split.implementation_spec.md) 待執行；character 軸的同模式套用見 [character_featurization_and_viking_split.md](character_featurization_and_viking_split.md)（依賴 A6 Step 3）；Phase B 延後（等 Port 完成 + 更多機制與 Entity 落地後再決策）
> **A1–A5 落地摘要**：`resolveEnemyActionDefinition` 收斂為單一 role-keyed resolver（`src/content/enemy-action-resolution.ts`）；`ChargeEnemyTuning` 死欄位（minRange/preferredMinRange）已刪；water animation 改為可選；behavior registry 於 `src/core/enemies/behaviors/`（decide/retarget/resolveAttack/restsAfterMove hooks）；World 的 charge 專屬方法改為通用 `retargetCommittedAttack` + `resolveCommittedAttackTransaction`（staged transaction），charge 政策移入 `behaviors/charge-enemy.ts`；enemy-phase 與 world 已零 role 分支；PresentationDirector 縮為 coordinator，enemy 事件全部經 `enemy-presenters/` registry dispatch；per-enemy feature module 於 `src/content/enemies/features/`，actor catalog、presentation profiles、sheet URLs、water assets 全部由 feature list 衍生；A7 分級驗收與檔案預算已抽為 `dev/standards/verification_tiers.md` 與 `dev/standards/gameplay_feature_architecture.md`（root AGENTS.md / CLAUDE.md 為純 entry point）。
> **Supersedes**: 無（[future_partial_ecs_gameplay_model.md](future_partial_ecs_gameplay_model.md) 併入本文 Phase B 作為候選形態 B-1，該文件保留原有 promotion gate 效力）
> **本文性質**: 這是一份不設篇幅限制的完整記錄，包含問題陳述、三方討論、事實查核結果與分階段重構方案。執行時以 §5（Phase A）為工單；§1–§4 與 §6–§8 是決策依據與背景，供未來重新評估時參考。

---

## 1. 問題陳述

### 1.1 核心痛點

**每新增一個敵人行為，被迫橫跨多個中央檔案（change amplification）。** 這不是 PixiJS 造成的，而是專案在規範層被設計成按 function 切層（所有敵人的決策一層、所有結算一層、所有演出一層），導致單一 feature 的知識散落在每一層的中央匯流點。

### 1.2 實測數據（2026-07 盤點，port branch）

| 檔案 | 行數 | 內容 |
| --- | --- | --- |
| `src/core/world/world.ts` | 1,658 行 / ~97 methods | Entity repository、occupancy、reservation、telegraph、wave、reward、damage、movement、snapshot 全部集中（state 欄位見 world.ts:209-229） |
| `src/presentation/pixi/PixiGameRenderer.ts` | 1,372 行 | Snapshot 投影與 reconcile |
| `src/presentation/timelines/PresentationDirector.ts` | 715 行 | 兩個大型 switch，涵蓋 **43 種 CombatEvent**（約 158-533 行） |

- 整個 `src/` 約 13,000 行，三個中樞檔佔近 3,800 行 ≈ **29% 的 codebase 是中央調度**。
- Charge Enemy 一個 vertical slice 觸及 **~31 個檔案**（source + asset + scenario + test）；純 runtime 部分約 10–14 個檔案。

### 1.3 新增一個敵人行為的實際修改路徑（現況）

1. `src/core/model/types.ts` — EntityState 欄位 + action definition union
2. `src/core/content/actor-schema.ts` / content mapping — role/schema union
3. `src/core/enemies/enemy-actions.ts` — `decideEnemyAction` 的中央 role 判斷（367-463 行是 ranged/charge/bomb 的 if-chain）
4. `src/core/actions/enemy-phase.ts` + `src/core/world/world.ts` — 特殊結算
5. `src/core/events/combat-events.ts` — 新 event type 加入 union
6. `src/presentation/timelines/PresentationDirector.ts` — 兩個 switch 各加 case + terminal classifier
7. `src/presentation/pixi/enemy-sprites.ts` — 視覺 profile 集中註冊（56-62 行）
8. Scenario / unit / Playwright 測試

**6–8 個檔案起跳，還沒算測試與資產。**

---

## 2. 診斷

### 2.1 三個疊加的病因

**病因一：按 function 切層，而非按 feature 切。**
Godot 讓人舒服的根本原因是它按 feature 切（一隻怪一個 scene，行為、狀態、動畫收在一起）。本專案按 function 切，每個中央檔案都是所有 feature 的匯流點。這兩個軸（純函式 vs 物件、按功能切 vs 按特性切）是獨立的——**可以在保留 deterministic core 的前提下按 feature 切**，這是 Phase A 的理論基礎。

**病因二：Port 時代的 AGENTS.md feature completion contract（已刪除）。**
原 contract 要求每個 feature 交付 Core 定義、deterministic scenario、unit assertion、Pixi/GSAP 演出、Playwright 驗收、無殘留動畫共六項。這是為 port 驗證設計的暫時規範，但驅動了整個架構的形狀。目前 working tree 已刪除該段；替代的分級驗收制度見 §5.7。

**病因三：同一概念被多次翻譯，且靠手動對應。**
以 Charge 為例，同一概念同時存在：

- `charge_enemy`（content id）
- `role: "charge"`（schema union）
- attack `kind: "charge"`
- presentation key `enemy.charge`
- sheet `skull` + palette `skull`

之間沒有單一型別安全的 feature registration，漏改不會報錯、只會默默壞掉。這是「加一隻怪要摸 N 個檔案」裡最陰險的部分。

### 2.2 已確認的 accidental coupling

- `src/content/wave-enemy-spawn.ts:26-40` — `attack.shape.shape === "line"` 被直接硬轉成 Charge tuning：**幾何形狀隱含行為語意**。
- 固定 inventory list、重複的 fixture builder（`resolveEnemyActionDefinition` 的註解自承 wave spawn path 與 fixed fixture 曾有 drift 風險）。
- base sprite 依賴 water animation 資產。

### 2.3 澄清兩個常見誤判（事實查核結果）

1. **Snapshot 不是每幀投影。** 實際流程是 command/scenario-driven：Command → Core 直接修改 World 並產生 semantic events（`GameRuntime.ts:147-152`）→ 保留 motion/terminal view ownership → 發布最終 Snapshot 一次（`GameRuntime.ts:234-243`）→ Pixi reconcile → GSAP 播放 events（`GameRuntime.ts:163-180`）。Pixi 每幀 render、GSAP 每幀插值，但不會每幀重建 WorldSnapshot。
2. **Semantic events 在 Core 結算時產生，不是 Renderer 之後。** 批評此架構時不要打稻草人。

**結論：病根是中央 dispatch 與重複翻譯，不是 Snapshot、不是 PixiJS、也不是「EntityState 沒有 method」。**

---

## 3. 討論記錄（三方意見的收斂與分歧)

### 3.1 報告一：Hybrid + Phaser 提案

主張全面改為 Godot-style stateful Entity（`class SkullEnemy extends GameEntity`，component 為普通物件、entity 自持 view、`async enterWater()` await 動畫後 destroy），Snapshot 降級為 save/debug 用途，下一款遊戲改用 Phaser 4。

**正確的部分**：診斷 change amplification 成立、數字屬實（部分還低估）；「換 Phaser 但沿用同一套規範仍會長成同樣架構」的自我警告正確；signal 三分法（entity-local / scene-level / 直接 method call，禁止萬用 EventBus）是好紀律。

**過頭或錯誤的部分**：把 Snapshot 描述成每幀投影（誤）；`await this.animations.play(...)` 之後才 `this.destroy()` 讓動畫生命週期控制 gameplay occupancy（違反本專案格子規則需要敵人立即從邏輯世界消失、畫面留 detached view 播完的原則，見 `project_structure.md:105-109`）；把「按 feature 切」的客觀收益與「Godot 心智模型順手」的主觀偏好混在一起論證。

### 3.2 三主張拆解（誠實度檢驗）

問題：「Entity+Component 化確定對擴充性更好，還是在迎合我對 Godot 的偏好？」答案是把混在一起的主張拆開：

- **主張一（客觀成立）**：按 feature 切（colocation）對本痛點更好，與範式無關，純函式架構也做得到。→ Phase A 只做這件事。
- **主張二（有代價的交換）**：mutable Entity + 自持 view 消掉「每行為都要定義 event type + switch case + projection」的稅，但付出 replay/rollback/determinism 的架構保證（詳見 §3.4）。是否划算取決於產品方向。
- **主張三（合法但主觀）**：Godot 心智模型順手是 solo dev 的真實生產力因素，但不該偽裝成客觀優勢。

**可證偽檢驗**：Phase A 完成後實際新增一隻怪。若痛消失 → Phase B 純屬偏好，可理性決定要不要為順手付代價；若仍痛 → 痛點會具體指向 event/projection 樣板稅，Phase B 就有客觀理由。預測分歧：一方押「Phase A 消掉七成痛、剩三成要 Phase B」，另一方押「Phase A 之後不再需要 Phase B」。不需現在裁決。

### 3.3 報告二：保守版方案

保留 deterministic core、GridBoard、Command 與 Snapshot 邊界，把敵人決策、特殊結算和演出從中央 switch 移回敵人模組；不建議 Pixi Container 成為 canonical gameplay entity、不建議先導入大量 Component classes、不建議現在遷 Phaser、不建議移除 semantic events。其事實查核（§2.3 兩點修正、AGENTS.md working tree 狀態）與引用行號經抽查全部準確。其「同概念五重翻譯」與 accidental coupling 清單（§2.1 病因三、§2.2）為本文採納的原創發現。其 behavior interface 草案（含 `retarget`/`resolve` hook）與檔案預算指標為 Phase A 直接採用。

**三方收斂點**：Phase A 的全部內容。**唯一實質分歧**：Phase B 是否終將需要——以 §3.2 的可證偽檢驗延後裁決。

### 3.4 Entity+Component 對 Replay / Rollback 的影響（技術備忘）

Replay 前提：`初始狀態 + 相同指令序列 → 必然相同結果`。Rollback = 還原到第 N tick 後高頻重模擬。四個機制說明 stateful Entity 為何有代價：

1. **狀態封閉性消失**：現在模擬狀態全部住在 World 的 plain data，`snapshot()` 即完整狀態，架構保證沒有別處可藏狀態。E+C 化後狀態散在活物件 private 欄位、closure、物件參照裡；序列化漏掉一個欄位不會報錯，只會還原後默默走岔。每加一個 component 都要記得同步序列化——永久紀律稅。
2. **Determinism 從建構保證變成紀律維持**：純 core 的輸入只有指令 + seeded RNG。E+C 讓 gameplay 與 presentation 同住一物件，`if (this.animations.isPlaying(...))`、`this.progress += dt`、Set 迭代順序、listener 註冊順序都成為隱藏輸入。Replay 岔一個 tick 就雪崩；rollback 高頻重模擬會把任何不確定性放大成 desync。
3. **物件圖難以還原**：plain data 的還原是整塊複製回去；物件圖要重建交叉參照（`enemy.target` 指向 player 物件）、重新註冊 event listener（且順序要一致）、且 view 是不可回溯的外部資源——還原後需要「view 對齊邏輯」的 reconcile，**那就是被刪掉的 snapshot projection，rollback 需求會逼你蓋回來**。
4. **重模擬的副作用**：純 core 重跑只產出 events，丟棄即無聲重算。E+C 行為方法直接觸發演出/音效，重模擬會重新開火，除非每個行為都支援靜音模式——又一筆每行為稅。

**但不是做不到**：格鬥遊戲 rollback netcode 也是 OO 程式碼，做法是把所有模擬狀態集中在可整塊複製的 POD 結構、物件只是操作資料的殼——**即在 E+C 內部手動重建「狀態＝一份封閉資料」這道牆，而那道牆就是現在的 pure core**。所以代價的準確描述是：把架構免費送的保證，換成未來要做時得手動補回的工程。對回合制單機 roguelite 通常划算，但這筆帳存在，且 Phase B 決策時必須重新過目。

### 3.5 Phaser 決策記錄

- **本專案不遷移 Phaser**（三方一致）。Phaser 提供 Scene/lifecycle/Tween，但不會自動消除中央 switch、重複 registry 或過度驗收；沿用同一套規範換 Phaser 仍長成相同架構。
- **下一款綠地專案另行決策**，不在本文範圍。屆時注意：Phaser 4 較新，v4 社群範例與文件量遠少於 v3；`GameObjects.Components` 是框架內部 mixin，不是 Godot Node Component，自己的 HealthComponent 仍要自行定義。

---

## 4. 設計原則（重構全程的不變式）

### 4.1 保留（Keep）

1. **GameRuntime 的 command queue + generation 取消機制**（`src/runtime/GameRuntime.ts`）：指令排隊、scenario 替換整代作廢、race condition 已處理完畢。重構時它幾乎不動，只換下游餵的東西。
2. **「gameplay 瞬間結算、presentation 事後追趕」邊界**：敵人死亡/落水時立即從邏輯世界消失（occupancy 釋放），畫面保留 detached view 播完動畫。動畫完成時間永遠不決定死亡、occupancy 或 turn progression。
3. **Deterministic core**：seeded RNG 注入、固定 phase 順序、同 seed 同指令必同結果。
4. **GridBoard 作為唯一空間權威**：occupancy、reservation、movement validation、footprint、atomic displacement。行為模組透過受限 transaction context 操作，不得直接改其他 entity。
5. **Semantic events**：多 Entity 位移排序、舊位置、blocked impact 等結果無法只靠最終 Snapshot 還原。事件流保留，但事件的「產生」與「消費」都下放到 feature 模組（見 Phase A）。
6. **已是純函式的計算**：damage/guard 數學、action preview 與 targeting、pathfinding（`enemy-path-planner`）、artifact 數值合成、reward 抽取、wave spawn planning、save migration、seeded RNG。原則：**需要預覽、重算、序列化或大量測試的東西才抽純邏輯**，不再要求每個行為都先變成 immutable data + event。
7. **Snapshot**，但重新定位為：React UI read model、Debug API、scenario assertion、save/replay checkpoint、agent semantic mirror。它不決定 Entity 行為，也不是動畫狀態來源。

### 4.2 消滅（Kill）

1. 中央 type dispatch：`decideEnemyAction` 的 role if-chain、PresentationDirector 的 43-case switch、terminal classifier 的集中判斷。
2. 中樞檔案持有 feature knowledge：新增敵人時**不必修改** World、enemy-phase、PresentationDirector、PixiGameRenderer、combat-events union、enemy-sprites 註冊表。
3. 同概念多重翻譯：一個 feature 一個型別安全的註冊點。
4. Accidental coupling：`line === charge`、fixture 重複、資產隱性依賴。

### 4.3 成功度量（檔案預算）

| 變更類型 | 允許觸及的主要檔案數 |
| --- | --- |
| 新敵人，沿用既有 behavior（改數值/外觀） | **2–4 個** |
| 全新 enemy behavior | **4–7 個**（且全部在該 feature 自己的模組內 + 註冊點一行） |

超出預算 = 架構回歸，當 bug 處理。

---

## 5. Phase A — Pre-ECS 去中央化（現在執行）

> 原則：每一步完成後全部測試保持綠燈；行為與玩家可見結果不變（refactor，非 redesign）。步驟間可以停下來加內容，不是不可中斷的大遷移。

### A1. 清除 accidental coupling

- 消除 `line === charge` 硬轉換：行為語意由明確的 behavior id 決定，幾何形狀只描述幾何。
- 合併重複的 fixture builder / 固定 inventory list（wave spawn path 與 fixed fixture 共用同一 resolution，現有 `resolveEnemyActionDefinition` 已部分做到，補完剩餘 drift 點）。
- 拆掉 base sprite 對 water animation 資產的依賴。

**驗收**：現有測試綠燈；content 定義中不再有「形狀隱含行為」的推導。

### A2. Enemy Behavior Registry（本 Phase 核心）

以多型取代中央 role 判斷：

```ts
interface EnemyBehavior {
  decide(context: EnemyDecisionContext): EnemyActionDecision;
  retarget?(context: EnemyRetargetContext, attack: CommittedAttack): RetargetResult;
  resolve?(context: EnemyResolutionContext, attack: CommittedAttack): CombatResolution;
}
```

```text
src/core/enemies/behaviors/
├── thrust-enemy.ts
├── ranged-enemy.ts
├── charge-enemy.ts
└── bomb-enemy.ts
```

`enemy-phase` 從 `if (action.role === "charge") ...` 改為：

```ts
const behavior = enemyBehaviors.get(enemy.behaviorId);
const decision = behavior.decide(context);
```

Charge 的攻擊範圍判斷、移動候選、live retarget、landing policy、side displacement policy、charge-specific result/event construction 全部收進 `charge-enemy.ts`。

**約束**：實際 occupancy mutation 仍透過 GridBoard / transaction context 完成；behavior 不得任意修改其他 Entity。

**驗收**：`decideEnemyAction` 不再含任何 role 字串判斷；新增 behavior 不觸碰 enemy-phase。

### A3. 特殊結算移出 enemy-phase / World

Charge/Bomb 的特殊結算邏輯經由 A2 的 `resolve` hook 移入各 behavior 檔案，World 對這些行為的 knowledge 歸零。World 暫時保留 facade API，避免一次重寫所有 tests 和 runtime。

### A4. Presentation 兩層化

`EnemyPresentation` 已是現成的 seam（`enemy-sprites.ts:21-45`）。中央 Director 改為：

```text
PresentationCoordinator
├── Generic motion tracks（多 Entity 位移排序）
├── Terminal view lifecycle（detached view）
├── Global hit-stop / camera / wave transition / cutscene / 全畫面效果
└── EnemyPresenterRegistry
    ├── ChargeEnemyPresenter
    ├── BombEnemyPresenter
    └── GenericEnemyPresenter
```

回到 enemy presenter 的行為：prepare attack、attack commit、fuse blink、charge impact、damage reaction、role-specific death。中央層**不認識任何 role-specific 事件語意**。

**驗收**：PresentationDirector 的 switch 中不再有 role-specific case；新增演出 = 新增一個 presenter 檔案 + 註冊一行。

### A5. 單一型別安全的 Feature Registration（消滅五重翻譯）

一個敵人 feature 在單一模組內宣告它的：behavior id、content schema 片段、attack kind、presentation profile（sheet/palette/animation keys）、event 貢獻。註冊點負責把這些接進各 registry，型別系統保證缺一不可、改名同步。

目標形態（示意，實作時依現有 schema 系統調整）：

```text
src/core/enemies/features/charge/
├── charge.behavior.ts        # EnemyBehavior 實作
├── charge.presenter.ts       # EnemyPresenter 實作
├── charge.content.ts         # schema 片段 + tuning 預設
└── index.ts                  # register(chargeFeature) 單一入口
```

### A6. World ownership 拆分（Phase A 的收尾，風險最高、放最後）

```text
World（facade 暫留）
├── Entity repository
├── GridBoard（occupancy / reservations / movement validation / footprint / atomic displacement）
├── Combat operations（damage / guard）
├── WaveRuntime
├── RunBuild / Rewards
└── Snapshot projection
```

抽離順序：GridBoard → Wave/Reward state → Damage/guard operations。每抽一塊，World 對應方法變成委派；tests 與 runtime 介面不變。

### A7. 測試分級制度（取代已刪除的 completion contract）

| 變更類型 | 驗收要求 |
| --- | --- |
| 新敵人數值/外觀，沿用既有 behavior | Content/schema test；必要時 sprite test |
| 新 enemy behavior | Behavior unit test + 一個 deterministic scenario |
| 新 browser-visible integration | 共用 Playwright scenario（驗系統能力，不逐 content variant 重複） |
| 新 terminal / multi-entity animation | Presentation unit + Playwright cleanup 斷言 |
| 新全域系統 | 完整 vertical slice |

**原則**：Playwright 驗證「系統能力」，不為每個 content variant 重複一套；按新增風險決定驗收層級。

### Phase A 明確不做的事

- 不導入 HealthComponent/AnimationComponent 等 stateful component classes（那只是把大檔變多小檔，不消除跨層修改）。
- 不讓 Pixi Container 成為 canonical gameplay entity。
- 不動 Snapshot 的發布流程與 position ownership 機制（「先發布最終位置、靠 ownership 避免覆蓋 GSAP 起點」可逐步改善，但不為它推翻 runtime）。
- 不遷移 Phaser。
- 不移除 semantic events。

---

## 6. Phase B — Entity 模型（延後決策）

### 6.1 決策 Gate（兩道都要過）

**Gate 1 — 經驗證據（本文 §3.2 的可證偽檢驗）**：Phase A 完成後，以檔案預算（§4.3）實測新增數隻敵人與數個機制。只有當痛點仍具體存在——典型形態是「每個新行為仍要定義 event type + presentation 樣板」——才考慮 Phase B。

**Gate 2 — 內容需求（沿用 [future_partial_ecs_gameplay_model.md](future_partial_ecs_gameplay_model.md) 的 promotion gate）**：已核准的 gameplay 內容同時需要多個 shared-interaction 類別（多種移動/攻擊風格的敵人、autonomous tower、projectile、triggered trap、persistent area hazard），且現有 entity-state model 已無法清楚表達這些組合。**單純敵人 role 變多不構成理由**。

時程前提：Port 完整做完 + 數個新機制與 Entity 以 Phase A 架構實作過之後。

### 6.2 兩個候選形態

**B-1：Data-oriented Partial ECS**（既有計畫，詳見 `future_partial_ecs_gameplay_model.md`）
Entity = stable identity + typed data components；component 只有 state、沒有行為；deterministic systems 按固定 Tick 順序決定並套用行為；World 仍是唯一 mutable authority；semantic events 與 snapshot projection 契約不變；boss 可帶 explicit custom state。**保留全部 determinism/replay 架構保證**，代價是行為仍與資料分離、樣板較多。

**B-2：Stateful Entity + Component（Godot-style Hybrid）**
Entity 是有生命週期、有行為的物件並自持 view；component 是普通物件；signal 三分法（entity-local / scene-level / 直接呼叫）；Snapshot 降級為 on-demand serializer。**開發手感最接近 Godot、樣板最少**，代價是 §3.4 的全部帳單（replay/rollback 從架構保證變成手動工程）。若走此路，強制設計要點：

- View 是**可選掛載**：entity 邏輯不依賴 view 存在，`present(callback)` 在無 view 時 no-op——headless 單元測試的生命線。
- Gameplay **永不 await 動畫**：演出 callback 進當前回合的 presentation script，由 coordinator 排程；死亡/落水立即定案邏輯狀態。
- GridBoard 仍為中央空間權威；entity 不得直接改其他 entity 的格子狀態。
- 禁止全域 EventBus。

### 6.3 選型時的判斷矩陣

| 未來需求 | 傾向 |
| --- | --- |
| Replay / rollback / lockstep / 大量同質單位批次處理 | B-1（或停在 Phase A） |
| 數十隻以內、每隻有明確個性的敵人；不做 netcode | B-2 可考慮 |
| 兩者皆非、Phase A 後已不痛 | **停在 Phase A，不做 Phase B** |

### 6.4 Phase B 無論選哪個形態都不做的事

- 不引入通用 ECS framework、plugin registry、dynamic system scheduler、string-keyed component bag。
- 不讓 Pixi/React/GSAP/browser API/persistence 進入 deterministic gameplay model（B-2 下 view 掛載也必須維持單向：邏輯推演出、演出不回寫邏輯）。
- 不因遷移順帶改變 combat rules、tick timing、event ordering 或玩家可見行為。

---

## 7. 決策記錄摘要（ADR-style）

| # | 決策 | 理由 | 狀態 |
| --- | --- | --- | --- |
| D1 | 病因判定為 change amplification（中央 dispatch + 多重翻譯 + port-era 驗收合約），非 PixiJS | §1–§2 實測 | 定案 |
| D2 | 刪除 port-era feature completion contract，改分級驗收（§5.7） | 合約是 port 驗證的暫時規範 | 已執行（AGENTS.md 已刪該段） |
| D3 | Phase A：保留 deterministic 邊界，按 feature 去中央化 | 三方共識；風險最低且直接命中痛點 | 待執行 |
| D4 | Phase B 延後，雙 gate 決策；B-1/B-2 二選一或不做 | §3.2 可證偽檢驗 + §3.4 代價分析 | 延後 |
| D5 | 本專案不遷移 Phaser；下一款另議 | 換框架不消除規範造成的架構形狀 | 定案 |
| D6 | Gameplay 永不 await 動畫；terminal detached view 原則保留 | 格子規則要求邏輯立即定案 | 定案（不變式） |
| D7 | Semantic events 保留；Snapshot 重定位為 read model / serializer | 多實體位移不可從最終 snapshot 還原 | 定案 |

---

## 8. 開放問題

1. **Position ownership 機制的簡化**：「先發布最終 Snapshot、靠 motion owner 避免覆蓋 GSAP 起點」目前能用但彆扭；A4 之後 presenter 就地持有動畫起點資訊，可能有更直接的做法。不阻塞 Phase A。
2. **Feature registration（A5）與現有 zod/schema 系統的整合深度**：註冊點要做到多少編譯期保證（mapped type 窮舉 vs 執行期 registry 檢查），實作時再定。
3. **Phase A 完成後的實測樣本**：預計以「新增 1 隻沿用 behavior 的怪 + 1 個全新 behavior」量測檔案預算達成率，結果記錄回本文 §6.1 Gate 1。
4. **下一款專案的技術選型**（Phaser 4 vs PixiJS + 自建）：獨立文件另議，本文僅保留 §3.5 的備忘。
