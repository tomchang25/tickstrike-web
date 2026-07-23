import { Application, Assets, Container, Graphics, type Sprite, type Texture } from "pixi.js";
import type { Cell } from "@core/model/types";
import { enemyPresentationProfiles, enemySpriteSheetUrls } from "@content/enemies/features";
import ninjaSpriteSheetUrl from "@content/characters/assets/ninja/body-sprite-sheet.png";
import { CELL_SIZE } from "./pointer-aim";
import { createPlayerSprite, type PlayerSpritePose } from "./character-sprites";
import { createEnemyPresentation, type EnemySpritePose } from "./enemy-sprites";
import type { EntityPresentationRig } from "./entity-presentation-rig";
import { applyEntityShadowStyle, type EntityShadowStyle } from "./entity-shadow";

export type EntityPresentationLabDirection = "down" | "up" | "left" | "right";
export type EntityPresentationLabPose = PlayerSpritePose | EnemySpritePose;
export type EntityPresentationLabCellFill = "purple" | "white";

export interface EntityPresentationLabProfile {
  readonly id: string;
  readonly label: string;
  readonly poses: readonly EntityPresentationLabPose[];
}

export interface EntityPresentationLabConfig {
  readonly profileId: string;
  readonly direction: EntityPresentationLabDirection;
  readonly pose: EntityPresentationLabPose;
  readonly cellFill: EntityPresentationLabCellFill;
  readonly groundY: number;
  readonly bodyAnchorX: number;
  readonly bodyAnchorY: number;
  readonly bodyScale: number;
  readonly shadowVisible: boolean;
  readonly guidesVisible: boolean;
  readonly shadowStyle: EntityShadowStyle;
}

export interface EntityPresentationLabScene {
  update(config: EntityPresentationLabConfig): void;
  destroy(): void;
}

const PLAYER_POSES: readonly PlayerSpritePose[] = ["idle", "move", "dash"];
const ENEMY_POSES: readonly EnemySpritePose[] = ["idle", "move", "prepareAttack", "commitCue"];
const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 520;
const PREVIEW_SCALE = 3;

export const ENTITY_PRESENTATION_LAB_PROFILES: readonly EntityPresentationLabProfile[] = [
  { id: "character.ninja", label: "Ninja", poses: PLAYER_POSES },
  ...Array.from(enemyPresentationProfiles.values()).map((profile) => ({
    id: profile.id,
    label: profile.id
      .replace("enemy.", "Enemy ")
      .replace(/^Enemy (.)/, (_, initial: string) => `Enemy ${initial.toUpperCase()}`),
    poses: ENEMY_POSES,
  })),
];

interface LabPresentation {
  readonly root: Container;
  readonly rig: EntityPresentationRig;
  readonly body: Sprite;
  setFacing(facing: Cell): void;
  setPose(pose: EntityPresentationLabPose): void;
}

const DIRECTION_CELLS: Readonly<Record<EntityPresentationLabDirection, Cell>> = {
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function createBackdrop(): Graphics {
  const backdrop = new Graphics().rect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT).fill(0x10141d);
  for (let x = 0; x <= PREVIEW_WIDTH; x += 32) {
    backdrop.moveTo(x, 0).lineTo(x, PREVIEW_HEIGHT).stroke({ color: 0x263043, width: 1, alpha: 0.38 });
  }
  for (let y = 0; y <= PREVIEW_HEIGHT; y += 32) {
    backdrop.moveTo(0, y).lineTo(PREVIEW_WIDTH, y).stroke({ color: 0x263043, width: 1, alpha: 0.38 });
  }
  return backdrop;
}

function createGuides(): Graphics {
  return new Graphics()
    .moveTo(-56, 0)
    .lineTo(56, 0)
    .stroke({ color: 0x72d4ff, width: 0.5, alpha: 0.9 })
    .moveTo(-4, 0)
    .lineTo(4, 0)
    .moveTo(0, -4)
    .lineTo(0, 4)
    .stroke({ color: 0xffd166, width: 1, alpha: 1 });
}

function applyCellFill(backdrop: Graphics, fill: EntityPresentationLabCellFill): void {
  const color = fill === "purple" ? 0x694a91 : 0xf4f1e8;
  const border = fill === "purple" ? 0xc7a8f5 : 0x5c5268;
  backdrop
    .clear()
    .rect(-CELL_SIZE / 2, -CELL_SIZE / 2, CELL_SIZE, CELL_SIZE)
    .fill(color)
    .stroke({ color: border, width: 1.5 });
}

function isPlayerProfile(profileId: string): boolean {
  return profileId === "character.ninja";
}

export async function mountEntityPresentationLabScene(host: HTMLElement): Promise<EntityPresentationLabScene> {
  const app = new Application();
  await app.init({ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, antialias: false });

  const ninjaSheet = await Assets.load<Texture>(ninjaSpriteSheetUrl);
  const enemySheets = new Map<string, Texture>();
  await Promise.all(
    Object.entries(enemySpriteSheetUrls).map(async ([key, url]) => {
      enemySheets.set(key, await Assets.load<Texture>(url));
    }),
  );

  app.stage.addChild(createBackdrop());
  app.canvas.setAttribute("data-testid", "entity-presentation-canvas");
  app.canvas.style.width = "100%";
  app.canvas.style.height = "auto";
  app.canvas.style.imageRendering = "pixelated";
  host.appendChild(app.canvas);

  let currentProfileId: string | undefined;
  let presentation: LabPresentation | undefined;
  let guides: Graphics | undefined;
  let cellBackdrop: Graphics | undefined;

  const createPresentation = (profileId: string): LabPresentation => {
    if (isPlayerProfile(profileId)) {
      const player = createPlayerSprite(profileId, ninjaSheet);
      if (!player) {
        throw new Error(`Presentation Lab could not create ${profileId}.`);
      }
      return {
        root: player.root,
        rig: player.rig,
        body: player.body,
        setFacing: player.setFacing,
        setPose: (pose) =>
          player.setPose(PLAYER_POSES.includes(pose as PlayerSpritePose) ? (pose as PlayerSpritePose) : "idle"),
      };
    }

    const profile = enemyPresentationProfiles.get(profileId);
    const sheet = profile ? enemySheets.get(profile.sheet) : undefined;
    const enemy = profile && sheet ? createEnemyPresentation(profileId, sheet, undefined) : undefined;
    if (!enemy) {
      throw new Error(`Presentation Lab could not create ${profileId}.`);
    }
    return {
      root: enemy.root,
      rig: enemy.rig,
      body: enemy.body,
      setFacing: enemy.setFacing.bind(enemy),
      setPose: (pose) =>
        enemy.setPose(ENEMY_POSES.includes(pose as EnemySpritePose) ? (pose as EnemySpritePose) : "idle"),
    };
  };

  const update = (config: EntityPresentationLabConfig): void => {
    if (currentProfileId !== config.profileId) {
      presentation?.root.destroy({ children: true });
      presentation = createPresentation(config.profileId);
      presentation.root.position.set(PREVIEW_WIDTH / 2, PREVIEW_HEIGHT / 2 - 32);
      presentation.root.scale.set(PREVIEW_SCALE);
      cellBackdrop = new Graphics();
      presentation.root.addChildAt(cellBackdrop, 0);
      guides = createGuides();
      presentation.rig.groundRoot.addChild(guides);
      app.stage.addChild(presentation.root);
      currentProfileId = config.profileId;
    }

    if (!presentation) {
      throw new Error(`Presentation Lab has no presentation for ${config.profileId}.`);
    }
    presentation.setFacing(DIRECTION_CELLS[config.direction]);
    presentation.setPose(config.pose);
    if (cellBackdrop) {
      applyCellFill(cellBackdrop, config.cellFill);
    }
    app.canvas.dataset.cellFill = config.cellFill;
    app.canvas.dataset.cellSize = String(CELL_SIZE);
    presentation.rig.groundRoot.position.y = config.groundY;
    presentation.body.anchor.set(config.bodyAnchorX / 16, config.bodyAnchorY / 16);
    presentation.body.scale.set(config.bodyScale);
    presentation.rig.shadow.visible = config.shadowVisible;
    applyEntityShadowStyle(presentation.rig.shadow, config.shadowStyle);
    if (guides) {
      guides.visible = config.guidesVisible;
    }
  };

  return {
    update,
    destroy() {
      presentation = undefined;
      guides = undefined;
      cellBackdrop = undefined;
      app.destroy(true, { children: true });
    },
  };
}
