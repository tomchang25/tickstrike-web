# World、Resolver、Content 與 Schema 流程報告

## 1. 這份報告要解決什麼

本報告整理 Tickstrike Web 中 `World`、`resolver`、`content`、`schema`、`Runtime` 與 presentation 之間的呼叫關係，並用 Godot 概念重新翻譯一次。

閱讀這份報告時，最重要的前提是：這些模組不是同一條連續的呼叫鏈。它們主要分成兩條流程：

```text
資料初始化流程：Content -> Schema -> Catalog -> Scenario -> World

遊戲執行流程：UI -> Runtime -> Resolver -> World -> Events -> Presentation
```

`Content` 和 `Schema` 主要在建立遊戲資料時工作；玩家操作時，`Resolver` 主要依賴已經建立好的 `World`，不會重新查詢整個 `contentCatalog`。

## 2. 先記住每一層負責什麼

| 模組 | 主要責任 | 不應該負責的事情 |
| --- | --- | --- |
| `src/content/` | 作者定義的角色、敵人、攻擊、Wave、Artifact 資料 | 持有戰鬥中的 mutable state、播放動畫 |
| `src/core/content/*-schema.ts` | 型別、runtime validation、cross-reference validation、freeze | 建立 `World`、執行玩家命令 |
| `World` | 目前 arena、entity、HP、occupancy、reservation、telegraph、tick 等狀態 | React、Pixi、GSAP、DOM |
| `action-resolver.ts` | 解讀 `GameCommand`、判斷規則、呼叫 World mutation、產生事件 | 播放動畫、直接操作 React 或 Pixi |
| `GameRuntime` | 排隊 command、呼叫 resolver、發 snapshot、等待 presentation、處理 generation | 重新實作戰鬥規則 |
| `WorldSnapshot` | World 對外公開的 immutable-style state projection | 成為另一份可寫的遊戲狀態 |
| `PixiGameRenderer` | 把 snapshot 畫成持續存在的 Pixi objects | 決定攻擊是否命中 |
| `PresentationDirector` | 把 combat events 轉成 GSAP timeline 與 transient effects | 修改 World、HP、tick、phase |

用一句話記：

```text
Content 告訴遊戲有哪些東西。
Schema 確認資料合法。
World 記住現在的狀態。
Resolver 決定 command 如何改變 World。
Runtime 把邏輯結果送到畫面。
Presentation 只負責呈現結果。
```

## 3. Content 與 Schema 的初始化流程

### 3.1 Actor content

入口是 `src/content/actor-catalog.ts`：

```text
character-definitions.ts
enemy-definitions.ts
        |
        v
createActorContentCatalog(...)
        |
        v
actorCatalog
```

`createActorContentCatalog()` 位於 `src/core/content/actor-schema.ts`，執行順序是：

```text
validateActorContent(input)
        |
        +-- 檢查欄位型別
        +-- 檢查 ID 格式與重複
        +-- 檢查 attackIds、guardId reference
        |
        v
有錯誤：throw ActorContentValidationError
沒有錯誤：cloneAndFreeze(input)
        |
        v
ActorContentCatalog
```

這裡的 `schema` 不是 Godot Scene，也不是 runtime object。它比較接近：

```text
Resource data contract
+ import validation
+ typed database factory
```

### 3.2 Wave content

Wave 需要依賴 actor catalog，因為 Wave 裡的 entry 會引用 enemy ID：

```text
wave-definitions.ts + actorCatalog
             |
             v
createWaveContentCatalog(input, actorCatalog)
             |
             +-- 檢查 group、demo wave、endless template
             +-- 檢查 enemyId 是否存在
             +-- 檢查 spawnGroupId 是否存在
             +-- 檢查 population cap 與 progression
             |
             v
waveCatalog
```

### 3.3 Artifact content

```text
artifact-definitions.ts
        |
        v
createArtifactContentCatalog(...)
        |
        +-- 檢查 ID、類別、stack、effect、mobility requirement
        |
        v
artifactCatalog
```

### 3.4 整合成總 catalog

`src/content/content-catalog.ts` 最後把三個 domain 合在一起：

```text
actorCatalog
waveCatalog
artifactCatalog
        |
        v
createContentCatalog(...)
        |
        +-- 檢查三個 domain 是否存在
        +-- 檢查 inventory 數量與順序
        +-- 檢查跨 domain references
        +-- 檢查 Mobility availability
        |
        v
contentCatalog
```

這些步驟通常在 ES module 載入時執行一次。正常遊戲操作期間不會每次 attack 都重新驗證 catalog。

## 4. Content 如何變成 World state

Scenario 是 Godot Scene fixture 的 Web 替代品。以 `tick-arena` 為例：

```text
App
  |
  v
GameRuntime.loadScenario(tickArena)
  |
  v
scenario.createWorld(seed)
  |
  v
createFoundationArena(seed)
  |
  +-- new World(arenaGeometry, seed)
  +-- actorCatalog 找到 ninja、thrust、slash、ranged
  +-- world.spawn(player)
  +-- world.spawn(enemy-thrust)
  +-- world.spawn(enemy-slash)
  +-- world.spawn(enemy-ranged)
  |
  v
World instance
```

`createFoundationArena()` 會把 authored content 的一部分資料轉成 `World.spawn()` 能理解的 `SpawnEntityInput`：

```ts
world.spawn({
  id: "player",
  kind: "player",
  cell: { x: 6, y: 6 },
  hp: player.hp,
  normalAttackDamage: player.normalAttack.damage,
  mobilityAttackDamage: player.mobility.damage,
});
```

這個轉換很重要：

```text
CharacterDefinition
        |
        v
Scenario fixture 讀取 authored data
        |
        v
SpawnEntityInput
        |
        v
World 內部的 EntityState
```

目前 `World` 不直接持有 `actorCatalog`，`resolver` 也不直接搜尋 `contentCatalog`。玩家的攻擊數值在 spawn 時被放進 entity state，之後 resolver 讀的是：

```text
entity.normalAttackDamage
entity.mobilityAttackDamage
```

而不是再次查詢：

```text
contentCatalog.actor.characters.find(...)
```

目前 Wave 與 Artifact catalog 主要在 `content-inspection` scenario 中被讀取與展示，尚未成為主要 combat resolver 的直接依賴。

## 5. World 的內部角色

`World` 是純 TypeScript 的 mutable gameplay state owner。它內部保存：

```text
entities       EntityId -> EntityState
occupancy      cell -> EntityId
reservations   reservation owner -> Reservation
telegraphs     sourceId -> Telegraph
currentTick
currentPlayerCell
currentArmedSmashTarget
lastEvents
```

它提供兩種方向的 API：

### 5.1 查詢 API

```ts
world.requireEntity(id)
world.getEntity(id)
world.findAliveAt(cell)
world.isWalkable(cell)
world.listAliveEnemiesAround(center, radius)
world.snapshot()
```

這些 API 只回答目前 World 是什麼狀態。

### 5.2 Mutation API

```ts
world.spawn(input)
world.moveEntity(id, cell)
world.applyDamage(targetId, damage)
world.setPhase(id, phase)
world.requestReservation(request)
world.setTelegraph(input)
world.advancePlayerAction()
```

這些 API 才會改變 authoritative state。

`World` 對外回傳 entity、reservation、telegraph 和 snapshot 時會 clone 資料，目的是避免外部直接拿到內部 map 裡的可變物件。

## 6. 玩家命令的完整執行流程

### 6.1 UI 建立 command

`App.tsx` 不直接改 World。它只建立一個 `GameCommand`：

```ts
runtime.execute({
  type: "attack",
  actorId: "player",
  direction: { x: 1, y: 0 },
});
```

這個物件只代表：

```text
玩家想做什麼
```

它還不是結果。

### 6.2 Runtime 放進 command queue

`GameRuntime.execute()` 會把 command 放入 queue，`drainCommands()` 再逐一處理：

```text
App
  |
  v
GameRuntime.execute(command)
  |
  v
queuedCommands
  |
  v
GameRuntime.drainCommands()
```

queue 的目的不是 gameplay 規則，而是協調：

```text
同一時間只處理一個 command
上一個 command 的 presentation 還沒結束時，不亂序處理下一個
scenario reset/replacement 時取消舊 generation
```

### 6.3 Runtime 呼叫 resolver

核心呼叫是：

```ts
const resolution = resolveCommand(world, job.command);
```

傳入的 `world` 是同一個 World instance 的參考，不是複製一份：

```text
GameRuntime
      |
      +------> World instance
      |
      +------> resolveCommand(world, command)
                         |
                         +-- 讀 World
                         +-- 修改同一個 World
                         +-- 回傳 ActionResolution
```

### 6.4 Resolver 分派 command

`resolveCommand()` 只做 command type dispatch：

```ts
switch (command.type) {
  case "move":
    return resolveMove(world, command);
  case "attack":
    return resolveAttack(world, command);
  case "dash":
    return resolveDash(world, command);
  case "smash":
    return resolveSmash(world, command);
}
```

這裡的 `return` 不是遞迴，也不是重新包裝整個 World。它只是把專門 resolver 的結果交回上一層。

可以用 Godot 風格理解成：

```gdscript
func resolve_command(world, command):
    match command.type:
        "attack":
            return resolve_attack(world, command)
```

## 7. Preview 與 Resolve 的差別

目前 action flow 通常分成兩段：

```text
Preview：先試算是否合法、會碰到誰、結果可能是什麼
Resolve：正式修改 World，並產生事件
```

例如 Attack：

```text
resolveAttack(world, command)
  |
  +-- world.requireEntity(actorId)
  +-- previewAttack(world, actorId, direction)
  |      |
  |      +-- 檢查 actor 是否 alive
  |      +-- 檢查方向是否 cardinal
  |      +-- 找出 target cell
  |      +-- 試算 BasicHitResult
  |
  +-- world.applyBasicHit(preview.hit)
  +-- 建立 player_attacked / enemy_damaged / enemy_died
  +-- finishAccepted(...)
```

`previewAttack()` 不應該扣 HP；真正的 mutation 在 `World.applyBasicHit()`。

這樣做的目的，是讓畫面 hover preview 和 command commit 可以共享同一套幾何與規則，而不會因為 hover 就真的改變遊戲狀態。

## 8. World mutation 與事件產生

以命中敵人的 Normal Attack 為例：

```text
Resolver 判定 target
        |
        v
World.applyBasicHit(preview.hit)
        |
        +-- applyDamage()
        +-- 計算 hpAfter
        +-- HP 歸零時 setPhase("dead")
        +-- 釋放 occupancy / reservation / telegraph
        |
        v
Resolver 讀取 mutation 後的 entity
        |
        +-- enemy_damaged
        +-- 若 killed，加入 enemy_died
```

責任分工是：

```text
Resolver：決定這次攻擊打誰、事件順序
World：執行扣血、死亡、位置與 occupancy 的合法 mutation
```

Resolver 不應自己操作 `World` 內部的 map；World 也不應自己決定玩家攻擊的方向規則。

## 9. `events` 與 `semanticEvents` 的目前狀態

目前程式仍有兩個欄位：

```ts
interface ActionResolution {
  readonly events: readonly CombatEvent[];
  readonly semanticEvents?: readonly CombatEvent[];
}
```

目前語意如下：

```text
events = gameplay-only events
semanticEvents = 完整 ordered event stream
```

例如一次 accepted attack 可能是：

```text
events:
  player_attacked
  enemy_damaged
  enemy_attack_committed
  telegraph_changed
  enemy_moved
```

```text
semanticEvents:
  command_resolved
  player_attacked
  enemy_damaged
  enemy_attack_committed
  telegraph_changed
  enemy_moved
  world_advanced
```

目前 `World.recordEvents()` 與 `WorldSnapshot.lastEvents` 保存的是完整的 `semanticEvents`。`GameRuntime` 也優先把 `semanticEvents` 傳給 presentation：

```ts
resolution.semanticEvents ?? resolution.events
```

這就是目前兩條 event view 的來源，也是 P4.5 要收斂的地方。

### 9.1 P4.5 的目標狀態

P4.5 規格要求最後只留下：

```ts
interface ActionResolution {
  readonly events: readonly CombatEvent[];
}
```

accepted command 的唯一 event stream：

```text
command_resolved
  -> 玩家直接結果
  -> enemy phase 結果
  -> world_advanced
```

rejected command 則保持：

```text
accepted: false
events: []
tick 不變
World 狀態不變
舊的 lastEvents 不被覆寫
```

這樣 Resolver、World snapshot、Runtime、Presentation、debug API 和 browser event log 都讀同一條資料。

## 10. Runtime 如何把結果交給畫面

Resolver 完成後，`GameRuntime` 的順序是：

```text
resolveCommand(world, command)
        |
        v
resolution
        |
        +-- emit()
        |     |
        |     +-- world.snapshot()
        |     +-- renderer.updateSnapshot(snapshot)
        |     +-- React listeners 收到 snapshot
        |
        +-- presentation.play(events)
              |
              v
          GSAP / Pixi one-shot presentation
```

這裡有一個核心設計：

```text
邏輯先完成，動畫後播放。
```

因此死亡 entity 的邏輯 phase 可以先變成 `dead`，occupancy 先釋放；Pixi view 可以暫時留在畫面上播放死亡動畫，動畫完成後再 remove view。

動畫時間不會決定：

```text
HP 是否扣除
Entity 是否死亡
格子是否釋放
Tick 是否前進
下一條規則是否成立
```

## 11. Snapshot、Pixi 與 React 的關係

`World.snapshot()` 建立一份給外部讀取的狀態 projection：

```text
World internal maps
        |
        v
WorldSnapshot
        |
        +-- PixiGameRenderer.updateSnapshot()
        +-- React setSnapshot()
        +-- SemanticMirror
        +-- TestbedPanel
        +-- Debug API
```

React 不會每 frame 重新管理每一個 combat entity。Pixi 負責 entity rendering，React 主要負責 HUD、panel、semantic mirror 和 test controls。

`WorldSnapshot` 不是另一個可以修改的 World。它是：

```text
目前 World 狀態的 read-only boundary
```

## 12. Presentation 的兩種輸入

Presentation 同時會看到兩種資料，但用途不同：

### 12.1 Snapshot：持續狀態

用於投影目前狀態：

```text
entity position
entity hp / phase
facing
telegraph
reservation
armed smash target
```

### 12.2 Event：一次性動作

用於播放一次性的 feedback：

```text
actor_moved
player_attacked
enemy_damaged
enemy_died
enemy_knocked
smash_impact
```

`command_resolved` 與 `world_advanced` 是完整事件順序的一部分，但目前沒有直接動畫，所以 `PresentationDirector` 會略過它們。

記法：

```text
Snapshot = 現在長什麼樣子
Event    = 剛剛發生了什麼
```

## 13. 一次 Attack 的完整例子

玩家按下攻擊右方：

```text
1. App 建立 GameCommand
   { type: "attack", actorId: "player", direction: { x: 1, y: 0 } }

2. GameRuntime.execute() 將 command 放入 queue。

3. GameRuntime.drainCommands() 呼叫 resolveCommand(world, command)。

4. resolveCommand() 分派到 resolveAttack()。

5. resolveAttack() 從 World 取得 player。

6. previewAttack() 計算 target cell 與 BasicHitResult。

7. World.applyBasicHit() 正式扣 HP；如果 HP 歸零，World 將 enemy 設為 dead。

8. Resolver 建立 player_attacked、enemy_damaged、可能的 enemy_died。

9. finishAccepted() 推進 player action / enemy phase，並加入 world_advanced。

10. Resolver 回傳 ActionResolution。

11. Runtime 呼叫 emit()，World 建立 snapshot，React 與 Pixi 看到最新邏輯狀態。

12. Runtime 將完整 event stream 傳給 PresentationDirector。

13. PresentationDirector 建立 GSAP impact / damage / death timeline。

14. 動畫完成後移除 terminal Pixi view，Runtime 完成這次 command。
```

整體圖：

```text
UI input
  |
  v
GameCommand
  |
  v
GameRuntime queue
  |
  v
resolveCommand(world, command)
  |
  +-- preview rules
  +-- World mutation
  +-- CombatEvent stream
  |
  +--------------------+
  |                    |
  v                    v
WorldSnapshot       PresentationDirector
  |                    |
  +-- React            +-- Pixi / GSAP
  +-- Pixi sync        +-- transient effects
  +-- Debug API        +-- terminal cleanup
```

## 14. 與 Godot 概念的對照

| Tickstrike Web | Godot 中較接近的概念 | 差異 |
| --- | --- | --- |
| `content/*-definitions.ts` | Resource data / exported data | 不是 Scene node |
| `*-schema.ts` | Resource validation / import contract | 不負責 lifecycle |
| `*Catalog` | 已載入的 data database | 不是 Autoload state owner |
| `Scenario` / fixture | 測試 Scene setup | 只負責 deterministic setup |
| `World` | BattleState / Board model | 不在 Scene Tree 中 |
| `GameCommand` | Input command / method payload | 是 plain data object |
| `action-resolver` | Command handler / gameplay system | 不掛在 Player Node 上 |
| `WorldSnapshot` | View model / state projection | 不直接回寫 World |
| `PixiGameRenderer` | Node2D / Sprite projection | 不決定 gameplay result |
| `PresentationDirector` | AnimationPlayer / Tween orchestration | 動畫不擁有邏輯狀態 |
| `GameRuntime` | Main coordinator / game loop adapter | 協調 command、snapshot、presentation |

最重要的差別是：Godot 常把以下東西放在同一個 scene/object lifecycle 裡：

```text
輸入
狀態
碰撞
動畫
signal
Node 生命週期
```

目前 Web 架構刻意拆開：

```text
輸入       -> GameCommand
規則       -> Resolver
狀態       -> World
結果       -> CombatEvent
持續投影   -> Snapshot / Renderer
一次動畫   -> PresentationDirector
協調       -> GameRuntime
```

## 15. 如何閱讀這個專案而不迷路

建議不要一開始從 `contentCatalog` 一路追到所有檔案。分三次讀：

### 第一次：只讀戰鬥主線

```text
App
  -> GameRuntime.execute()
  -> resolveCommand()
  -> resolveAttack / resolveMove / resolveDash / resolveSmash
  -> World mutation
  -> ActionResolution
```

### 第二次：只讀 World state

```text
World constructor
  -> spawn
  -> moveEntity
  -> applyDamage
  -> setPhase
  -> snapshot
```

### 第三次：再讀資料初始化

```text
definitions
  -> schema validation
  -> catalog
  -> scenario fixture
  -> World.spawn
```

如果正在追一個玩家攻擊 bug，通常只需要先看：

```text
GameRuntime.ts
action-resolver.ts
world.ts
combat-events.ts
```

如果正在追 content bug，才看：

```text
content definitions
*-schema.ts
*-catalog.ts
content-catalog.ts
content-inspection.ts
```

## 16. 最後的簡化模型

把整個架構壓縮成三個問題：

```text
World：現在場上有什麼？

Resolver：這個 command 合法嗎？合法的話要如何修改 World？

Runtime / Presentation：修改完成後，怎麼把結果送給 UI 並播放視覺效果？
```

而 Content / Schema 位於更前面的資料準備階段：

```text
Content / Schema：建立 World 時，可以使用哪些合法的 authored data？
```

因此最短的心智模型是：

```text
Definitions 是資料。
Catalog 是驗證後的資料集合。
Scenario 把資料放進 World。
Command 描述玩家意圖。
Resolver 把意圖解析成 World mutation。
World 保存結果。
Events 描述發生了什麼。
Snapshot 提供目前狀態。
Presentation 把結果畫出來。
```
