import { createRoomRendering } from "./roomRendering";
import { applyAssetAppearance } from "./assetAppearance";
import { assetScale, transformAttachedItems } from "./assetCustomization";
import { setSurfaceColor } from "./woodSurfaceMaps";
import * as THREE from "three";
import { ACCENT_COLORS, CATALOG, placedItemElevation, DEFAULT_ATMOSPHERE, THEMES, canPlace, footprint, snapPosition } from "./roomState";
import { climbingPanelBacking, createFurniture, createMascot, createRoomShell, createWalkBlooms, disposeObject } from "./roomModels";
import { createRoomLighting } from "./roomLighting";
import { createRoomCeilingLighting } from "./roomCeilingLighting";
import { advanceClubhouseSign, updateClubhouseSign } from "./clubhouseExterior";
import { applyBakedFurnitureOcclusion, applyBakedWallOcclusion } from "./roomBakedOcclusion";
import { createWalkthrough } from "./roomWalkthrough";
import { getRoomLayout } from "./roomLayout";
import { getDioramaBounds } from "./islandLayout";
import { createIslandHorizon } from "./islandHorizon";
import { createRoomSkyOrb } from "./roomSkyOrb";
import { frameRoomCamera, frameRoomCameraFlight, frameRoomFrontCamera, setRoomFrontLens } from "./roomCamera";
import { createRoomCameraControls } from "./roomCameraControls";
import { DEFAULT_ROOM_ZOOM } from "./roomCameraZoom";
import { isWalkablePosition } from "./roomNavigation";
import { createYardGreeters } from "./roomGreeters";
import { commonFunctionForItem } from "./commonFunctionAssets";
import { ROOM_LIGHT_SWITCH_ID } from "./clubhouseInteractions";
import { GARDEN_CHOICES, itemInteraction, lightInteraction } from "./walkInteractions";
import { pickRoomItem } from "./roomPicking";
import { exhibitMessage, exhibitRecords, memoryForExhibit } from "./activityExhibit";

const PREVIEW_MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);
const PREVIEW_MOVE_SPEED = 8;
const PREVIEW_LIFT_SPEED = 4;

function surfaceColors(room) {
  const theme = THEMES.find((entry) => entry.id === room.theme) || THEMES[0];
  return {
    floor: room.atmosphere?.floorColor || theme.floor,
    wall: room.atmosphere?.wallColor || theme.wall
  };
}

function labelTexture(text, background = "#f5ddb0", color = "#604431") {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.font = '600 80px "Noto Sans KR", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 512, 64, 940);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function furnitureContactShadow(kind) {
  const type = CATALOG.find((entry) => entry.kind === kind);
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
    const offset = (y * size + x) * 4;
    pixels.set([255, 255, 255, Math.round(Math.max(0, 1 - radius) ** 1.4 * 255)], offset);
  }
  const map = new THREE.DataTexture(pixels, size, size);
  map.needsUpdate = true;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(type.width * 1.3, type.depth * 1.3),
    new THREE.MeshBasicMaterial({ map, color: "#382b28", transparent: true, opacity: 0.38, depthWrite: false }));
  shadow.name = "furniture-contact-shadow";
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.014;
  return shadow;
}

function commonFunctionMarker(asset, height) {
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: labelTexture(`${asset.symbol}  ${asset.shortLabel}`, "#fff9ed", asset.color),
    depthWrite: false
  }));
  marker.name = "common-function-label";
  marker.scale.set(2.8, 0.38, 1);
  marker.position.y = height + 0.35;
  return marker;
}

function speechSprite(message) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 300;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffaf2";
  context.beginPath();
  context.roundRect(8, 8, 496, 264, 24);
  context.fill();
  context.beginPath();
  context.moveTo(232, 270); context.lineTo(256, 298); context.lineTo(280, 270); context.fill();
  context.textAlign = "left";
  context.fillStyle = "#775b9b";
  context.font = '600 24px "Noto Sans KR", sans-serif';
  context.fillText(`${Array.from(message.memberName || "모임원").slice(0, 16).join("")} · 방금 한 말`, 28, 46, 456);
  context.fillStyle = "#3f3734";
  context.font = '500 30px "Noto Sans KR", sans-serif';
  const characters = Array.from(message.content);
  for (let line = 0; line < 4; line += 1) context.fillText(characters.slice(line * 15, (line + 1) * 15).join(""), 28, 94 + line * 48, 456);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, toneMapped: false }));
  sprite.scale.set(5.4, 5.4 * 300 / 512, 1);
  sprite.position.y = 3.1;
  return sprite;
}

export function createRoomScene(container, callbacks) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "default" });
  const settledPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const motionPixelRatio = Math.min(settledPixelRatio, 1);
  let pixelRatio = settledPixelRatio;
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.touchAction = "none";
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 7, -7, 0.1, 100);
  const flightCamera = camera.clone();
  const previewCamera = new THREE.PerspectiveCamera(40, 1, 0.08, 160);
  const previewBlendCamera = previewCamera.clone();
  const previewLook = new THREE.Euler(0, 0, 0, "YXZ");
  const previewForward = new THREE.Vector3();
  const previewRight = new THREE.Vector3();
  const horizon = createIslandHorizon();
  const skyOrb = createRoomSkyOrb();
  const backdrop = new THREE.Scene();
  backdrop.add(horizon.group, skyOrb.orb);
  const horizonCamera = new THREE.PerspectiveCamera(44, 1, 16, 1200);
  const horizonDirection = new THREE.Vector3();
  const rendering = createRoomRendering(renderer, scene, camera, backdrop, horizonCamera);
  const updateLighting = createRoomLighting(scene);
  const outdoorLightSource = scene.getObjectByName("room-sun-moonlight");
  const objectLayer = new THREE.Group();
  scene.add(objectLayer);
  const speechLayer = new THREE.Group();
  speechLayer.name = "recent-chat-speakers";
  scene.add(speechLayer);
  let speechMessages = [];
  let greetingMembers = [];
  let greetingLayer;
  const indicator = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    color: 0x8fe681, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide
  }));
  indicator.rotation.x = -Math.PI / 2;
  indicator.position.y = 0.07;
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0), new THREE.Vector3(-0.5, 0.5, 0)
    ]), new THREE.LineBasicMaterial({ color: 0xb5ff95 })
  );
  outline.position.z = 0.01;
  indicator.add(outline);
  scene.add(indicator);

  const objects = new Map();
  const itemElevations = new Map();
  let shell;
  let signs = [];
  let islandGround;
  let mascotLayer;
  let identityLayer;
  let lastIdentity;
  let activityExhibit;
  let activityExhibitKey;
  let lastTheme;
  let lastAtmosphere;
  let outdoorLight;
  let generalLighting = true;
  let lastSurfaces;
  let lastAvatar;
  let room;
  let selectedId;
  let view = "perspective";
  let focusBuilding = false;
  let floorView = "all";
  let zoom = DEFAULT_ROOM_ZOOM;
  let cameraReset = 0;
  let drag = null;
  let interactionTargets = [];
  const gardenChanges = new Set();
  const plantBlooms = new Map();
  let waterDrops;
  let waterTimer;
  let disposed = false;
  let animationFrame = 0;
  let templateFrame = 0;
  let queuedTemplateUpdate;
  let templateSwitching = false;
  let signTimer;
  let canvasOnScreen = true;
  const signFrustum = new THREE.Frustum();
  const signProjection = new THREE.Matrix4();
  const signPosition = new THREE.Vector3();
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let settleTimer;
  let renderWidth;
  let renderHeight;
  let flight;
  let preparationTask;
  let preparationStep = 0;
  let presentedFrontage = false;
  let presentedExterior = false;
  const previewKeys = new Set();
  let lastPreviewMove;
  let previewNavigating = false;
  let previewWideAngle = 0;
  let studioWideAngle = 0;
  let previewLens;
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const walkthrough = createWalkthrough(scene, container, {
    getRoom: () => room,
    getObstacles: () => [shell, objectLayer].filter(Boolean),
    onPosition: callbacks.onWalkPosition,
    getInteractionTargets: () => interactionTargets,
    onInteractionChange: callbacks.onWalkInteraction,
    onPointerLockChange: callbacks.onWalkPointerLock,
    onInteract: interactWithTarget,
    render: (moving) => moving ? renderMoving() : render()
  });

  const cameraControls = createRoomCameraControls(camera, renderer.domElement, {
    onChange(rotation) {
      if (view === "front" && rotation) {
        previewNavigating = true;
        previewLook.y -= rotation.dx * 0.006;
        previewLook.x = THREE.MathUtils.clamp(previewLook.x - rotation.dy * 0.006, -1.52, 1.52);
        previewCamera.quaternion.setFromEuler(previewLook);
        previewCamera.updateMatrixWorld();
      } else updateCamera(false);
      renderMoving();
    },
    onZoom(nextZoom) { zoom = nextZoom; updateCamera(false); renderMoving(); callbacks.onZoomChange?.(nextZoom); },
    onClick: (id) => { if (view !== "front") callbacks.onSelect(id); }
  });

  function updateSignScroll(camera, time) {
    if (!canvasOnScreen || document.hidden || !signs.some((sign) => sign.userData.signScroll)) return;
    camera.updateMatrixWorld();
    signFrustum.setFromProjectionMatrix(signProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const facingFront = camera.isOrthographicCamera && camera.getWorldDirection(signPosition).z < 0;
    let animated = false;
    for (const sign of signs) {
      if (!sign.userData.signScroll) continue;
      let object = sign;
      while (object?.visible) object = object.parent;
      const front = camera.isOrthographicCamera ? facingFront : camera.position.z > sign.getWorldPosition(signPosition).z;
      if (object || !front || !signFrustum.intersectsObject(sign)) continue;
      advanceClubhouseSign(sign, time);
      animated = true;
    }
    if (animated) signTimer = window.setTimeout(render, 1000 / 24);
  }

  function renderFrom(activeCamera, options, time) {
    const nextPixelRatio = options.moving && !options.flying && !options.preview ? motionPixelRatio : settledPixelRatio;
    if (renderWidth && renderHeight && pixelRatio !== nextPixelRatio) {
      pixelRatio = nextPixelRatio;
      renderer.setDrawingBufferSize(renderWidth, renderHeight, pixelRatio);
    }
    if (options.walking) {
      horizonCamera.copy(activeCamera);
      horizonCamera.near = 16;
      horizonCamera.far = 1200;
    } else {
      activeCamera.getWorldDirection(horizonDirection);
      horizonDirection.y *= 0.24;
      if (Math.hypot(horizonDirection.x, horizonDirection.z) < 0.1) horizonDirection.z = -0.1;
      horizonCamera.fov = 44;
      horizonCamera.aspect = activeCamera.isPerspectiveCamera ? activeCamera.aspect :
        (activeCamera.right - activeCamera.left) / (activeCamera.top - activeCamera.bottom);
      horizonCamera.position.set(0, 3, 0);
      horizonCamera.lookAt(horizonDirection.add(horizonCamera.position));
    }
    horizonCamera.updateProjectionMatrix();
    skyOrb.frame(horizonCamera);
    updateSignScroll(activeCamera, time);
    rendering.render(activeCamera, room?.atmosphere || DEFAULT_ATMOSPHERE, options);
  }

  function cancelFlightPreparation() {
    if (preparationTask === undefined) return;
    if (window.cancelIdleCallback) window.cancelIdleCallback(preparationTask);
    else window.clearTimeout(preparationTask);
    preparationTask = undefined;
  }

  function prepareFlight() {
    if (preparationStep === 2 || preparationTask !== undefined || view !== "front" || flight || !room ||
      settleTimer !== undefined || cameraControls.hasGesture() || previewKeys.size) return;
    const prepare = () => {
      preparationTask = undefined;
      if (disposed || view !== "front" || flight) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (!width || !height) return;
      const enteringRoom = preparationStep === 1;
      try {
        flightCamera.copy(camera);
        if (enteringRoom) {
          updatePresentation(false, true, false);
          frameRoomCamera(flightCamera, { layout: getRoomLayout(room), template: room.template, aspect: width / height, zoom: DEFAULT_ROOM_ZOOM });
        } else if (islandGround) {
          islandGround.visible = true;
        }
        // Warm objects that enter the frustum between the preview and the expanded shot.
        flightCamera.left *= 1.5;
        flightCamera.right *= 1.5;
        flightCamera.top *= 1.5;
        flightCamera.bottom *= 1.5;
        flightCamera.updateProjectionMatrix();
        rendering.prepareFlight(flightCamera, Math.floor(width * settledPixelRatio), Math.floor(height * settledPixelRatio),
          { warmShadows: enteringRoom });
      } finally {
        updatePresentation(true, false, false);
      }
      preparationStep += 1;
      prepareFlight();
    };
    preparationTask = window.requestIdleCallback ? window.requestIdleCallback(prepare) : window.setTimeout(prepare, 80);
  }

  function render() {
    if (disposed || animationFrame || templateFrame) return;
    window.clearTimeout(signTimer);
    animationFrame = requestAnimationFrame((time) => {
      animationFrame = 0;
      if (disposed || templateFrame) return;
      try {
        renderFrame(time);
        finishTemplateTransition();
      } catch (error) {
        if (!templateSwitching) throw error;
        onContextLost();
      }
    });
  }

  function renderFrame(time) {
    if (flight && flight.canvasRect && flight.targetRect) {
      if (flight.startedAt === undefined) {
        flight.startedAt = time;
        updateCamera(false);
      }
      const fraction = Math.min(1, (time - flight.startedAt) / flight.job.duration);
      const progress = fraction * fraction * (3 - 2 * fraction);
      const frontage = fraction < 0.5 ? flight.fromFrontage : view === "front";
      const walking = !frontage && (view === "front" ? flight.fromWalking : walkthrough.active());
      if (frontage !== presentedFrontage) {
        updatePresentation(frontage, walking, false);
        updateRoomLighting();
      }
      if (flight.fromFrontage !== (view === "front") && floorView === "all" && flight.fromFloor === "all") {
        revealIsland(view === "front" ? 1 - progress : progress);
      }
      const destination = walkthrough.active() ? walkthrough.camera : activePreviewCamera();
      const inFlight = flight.fromCamera.isPerspectiveCamera || destination.isPerspectiveCamera ? previewBlendCamera : flightCamera;
      frameRoomCameraFlight(inFlight, flight.fromCamera, destination, flight.job.from, flight.targetRect, flight.canvasRect, progress);
      renderFrom(inFlight, { moving: true, flying: true, walking }, time);
      if (fraction < 1) render();
      else flight.job.finish();
    } else {
      if (previewKeys.size) movePreview(time);
      renderFrom(walkthrough.active() ? walkthrough.camera : activePreviewCamera(), {
        walking: walkthrough.active(),
        moving: settleTimer !== undefined || cameraControls.isDragging() || previewKeys.size > 0,
        preview: view === "front"
      }, time);
      if (previewKeys.size) render();
      else prepareFlight();
    }
  }

  function renderMoving() {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      settleTimer = undefined;
      // A moving avatar can reuse the environment's shadows until it stops.
      if (walkthrough.active()) renderer.shadowMap.needsUpdate = true;
      if (!cameraControls.isDragging()) render();
    }, 140);
    render();
  }

  function updateCamera(schedule = true) {
    if (disposed) return;
    const canvasRect = container.getBoundingClientRect();
    const target = flight?.job.getTargetRect();
    const targetRect = target?.width && target.height ? target : canvasRect;
    if (flight) Object.assign(flight, { canvasRect, targetRect });
    const { width, height } = targetRect;
    if (!width || !height) return;
    const layout = getRoomLayout(room);
    const aspect = width / height;
    const framingZoom = canUseStudioCamera() ? zoom / (1 + studioWideAngle * 0.0035) : zoom;
    const center = frameRoomCamera(camera, { layout, template: room?.template, view, floorView, aspect, zoom: framingZoom, focusBuilding });
    cameraControls.frame(center);
    if (view === "front") {
      if (!previewNavigating) {
        previewLens = frameRoomFrontCamera(previewCamera, { layout, template: room?.template, aspect });
        previewLook.setFromQuaternion(previewCamera.quaternion);
      }
      setRoomFrontLens(previewCamera, previewLens, aspect, previewWideAngle);
    }
    if (schedule) render();
  }

  function resize() {
    if (disposed) return;
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    const resized = width !== renderWidth || height !== renderHeight;
    const nextPixelRatio = !flight && view !== "front" && (settleTimer !== undefined || cameraControls.isDragging()) ? motionPixelRatio : settledPixelRatio;
    if (resized || pixelRatio !== nextPixelRatio) {
      pixelRatio = nextPixelRatio;
      renderer.setDrawingBufferSize(width, height, pixelRatio);
    }
    if (resized) {
      renderWidth = width;
      renderHeight = height;
      rendering.resize(width, height);
      walkthrough.resize(width, height);
    }
    updateCamera();
  }

  function canUseStudioCamera() {
    return Boolean(room && !flight && !["front", "firstPerson", "thirdPerson"].includes(view) && callbacks.canEdit?.() !== false);
  }

  function showSelection(item, valid = true) {
    indicator.visible = Boolean(item);
    if (!item) return;
    const size = footprint(item);
    indicator.scale.set(size.width + 0.16, size.depth + 0.16, 1);
    indicator.position.set(item.x, placedItemElevation(item, room) + (item.kind === "rug" ? 0.11 : 0.075), item.z);
    indicator.material.color.set(valid ? 0x8fe681 : 0xef6b65);
    outline.material.color.set(valid ? 0xb5ff95 : 0xff9b91);
  }

  function clearWater() {
    window.clearTimeout(waterTimer);
    if (waterDrops) disposeObject(waterDrops);
    waterDrops = null;
  }

  function resetGarden() {
    for (const bed of gardenChanges) bed.reset();
    gardenChanges.clear();
    for (const bloom of plantBlooms.values()) disposeObject(bloom);
    plantBlooms.clear();
    clearWater();
  }

  function interactWithTarget(target, choice) {
    if (target.feature) {
      callbacks.onSelect(target.id);
      return;
    }
    const pot = objects.get(target.id);
    if (choice.color) {
      if (target.bed) {
        target.bed.paint(choice.color);
        gardenChanges.add(target.bed);
      } else if (pot) {
        if (plantBlooms.has(target.id)) disposeObject(plantBlooms.get(target.id));
        const bloom = createWalkBlooms(choice.color);
        bloom.position.set(0, (target.y - pot.position.y) / pot.scale.y, 0.12);
        pot.add(bloom);
        plantBlooms.set(target.id, bloom);
      }
      return `${choice.label}으로 바꿨어요.`;
    }
    if (choice.id === "water") {
      if (target.bed) {
        target.bed.water();
        gardenChanges.add(target.bed);
      }
      clearWater();
      waterDrops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.033, 8, 6),
        new THREE.MeshStandardMaterial({ color: "#76d9fb", emissive: "#3879a5", emissiveIntensity: 0.4 }), 5);
      const transform = new THREE.Object3D();
      for (let i = 0; i < 5; i += 1) {
        transform.position.set((i - 2) * 0.12, 0.2 + (i % 3) * 0.13, i % 2 * 0.1);
        transform.scale.y = 1.45;
        transform.updateMatrix();
        waterDrops.setMatrixAt(i, transform.matrix);
      }
      waterDrops.position.set(target.x, target.y, target.z);
      scene.add(waterDrops);
      waterTimer = window.setTimeout(() => { clearWater(); render(); }, 1100);
      return "물을 줬어요.";
    }
  }

  function rebuildShell(nextRoom) {
    gardenChanges.clear();
    preparationStep = 0;
    if (shell) { scene.remove(shell); disposeObject(shell); }
    const colors = surfaceColors(nextRoom);
    shell = createRoomShell({ floorColor: colors.floor, wallColor: colors.wall,
      template: nextRoom.template, version: nextRoom.version, atmosphere: nextRoom.atmosphere, onSurfaceReady: render, accentColor: nextRoom.accentColor, matColor: nextRoom.matColor });
    applyBakedWallOcclusion(shell, nextRoom.template, nextRoom.version);
    signs = ["exterior-tenant-lettering", "entry-led-sign"].map((name) => shell.getObjectByName(name)).filter(Boolean);
    islandGround = shell.getObjectByName("floating-island");
    const layout = getRoomLayout(nextRoom);
    shell.add(createRoomCeilingLighting(layout));
    scene.add(shell);
  }

  function revealIsland(amount) {
    if (!islandGround) return;
    const layout = getRoomLayout(room);
    const lawn = layout.island.surface;
    const base = getDioramaBounds(layout.building);
    const scaleX = THREE.MathUtils.lerp((base.maxX - base.minX) / (lawn.maxX - lawn.minX), 1, amount);
    const scaleZ = THREE.MathUtils.lerp((base.maxZ - base.minZ) / (lawn.maxZ - lawn.minZ), 1, amount);
    const centerZ = THREE.MathUtils.lerp((base.minZ + base.maxZ) / 2, (lawn.minZ + lawn.maxZ) / 2, amount);
    islandGround.visible = amount > 0;
    islandGround.scale.set(scaleX, THREE.MathUtils.lerp(0.12, 1, amount), scaleZ);
    islandGround.position.set(0, -0.05 * (1 - amount), centerZ - (lawn.minZ + lawn.maxZ) / 2 * scaleZ);
  }

  function addLabel(parent, text, width, height, x, y, z, background, color) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: labelTexture(text, background, color) }));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function addPhoto(parent, source, width, height, x, y, z) {
    if (!source) return;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mesh.position.set(x, y, z);
    mesh.visible = false;
    parent.add(mesh);
    const texture = new THREE.TextureLoader().load(source, (loaded) => {
      let root = mesh;
      while (root.parent) root = root.parent;
      if (disposed || root !== scene) { loaded.dispose(); return; }
      // Crop to the frame without stretching the user's photo.
      const imageAspect = loaded.image.width / loaded.image.height;
      const frameAspect = width / height;
      if (imageAspect > frameAspect) {
        loaded.repeat.x = frameAspect / imageAspect;
        loaded.offset.x = (1 - loaded.repeat.x) / 2;
      } else {
        loaded.repeat.y = imageAspect / frameAspect;
        loaded.offset.y = (1 - loaded.repeat.y) / 2;
      }
      mesh.visible = true;
      render();
    }, undefined, () => { disposeObject(mesh); render(); });
    texture.colorSpace = THREE.SRGBColorSpace;
    mesh.material.map = texture;
  }

  function rebuildIdentity(nextRoom) {
    if (identityLayer) { scene.remove(identityLayer); disposeObject(identityLayer); }
    identityLayer = new THREE.Group();
    scene.add(identityLayer);
    const mat = addLabel(identityLayer, nextRoom.name || "우리 공간", 2.1, 0.4,
      -2, 0.035, 5.85, "#8b7255", "#f6e3bf");
    mat.rotation.x = -Math.PI / 2;
    const records = nextRoom.items.filter((item) => item.kind === "memory").slice(-2);
    for (const item of nextRoom.items.filter((entry) => ["climbingBoard", "gameWallBoard", "clubPinboard"].includes(entry.kind))) {
      const board = new THREE.Group();
      board.position.set(item.x, placedItemElevation(item, nextRoom), item.z);
      board.scale.set(item.scaleX ?? 1, item.scaleY ?? 1, item.scaleZ ?? 1);
      board.rotation.y = item.rotation * Math.PI / 2;
      board.userData.itemId = item.id;
      board.userData.roomLevel = item.level || 0;
      identityLayer.add(board);
      const middle = item.kind === "climbingBoard" ? 2.8 : item.kind === "gameWallBoard" ? 2.6 : 2.3;
      addLabel(board, nextRoom.name || "우리 공간", 3.9, 0.25, 0, middle + 0.58, 0.105, "#f4d69c", "#604431");
      const slots = [{ title: "우리 모임 사진", photo: nextRoom.coverPhoto },
        ...[0, 1].map((index) => ({ ...(records[index] || {}), title: records[index]?.title || "추억을 걸어 주세요" }))];
      slots.forEach((slot, index) => {
        const frame = new THREE.Group();
        if (slot.id) frame.userData.memoryId = slot.id;
        board.add(frame);
        const x = (index - 1) * 1.46;
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.27, 0.85), new THREE.MeshBasicMaterial({ color: 0xfff7e9 }));
        paper.position.set(x, middle, 0.11);
        frame.add(paper);
        addLabel(frame, slot.photo ? "" : "+", 0.92, 0.48, x, middle + 0.05, 0.12, "#e5d9c8", "#9a8977");
        addPhoto(frame, slot.photo, 1.1, 0.58, x, middle + 0.04, 0.13);
        addLabel(frame, slot.title, 1.15, 0.15, x, middle - 0.3, 0.13, "#fff7e9");
      });
      addLabel(board, "활동 기록 · 사진을 눌러 꺼내 보기", 4.3, 0.2, 0, middle - 0.57, 0.13, "#fff0cd");
    }
    for (const item of nextRoom.items.filter((entry) => ["activityBoard", "clubDashboard"].includes(entry.kind))) {
      const board = new THREE.Group();
      board.position.set(item.x, placedItemElevation(item, nextRoom), item.z);
      board.scale.set(item.scaleX ?? 1, item.scaleY ?? 1, item.scaleZ ?? 1);
      board.rotation.y = item.rotation * Math.PI / 2;
      board.userData.itemId = item.id;
      board.userData.roomLevel = item.level || 0;
      identityLayer.add(board);
      for (const side of [0, Math.PI]) {
        const face = new THREE.Group();
        face.rotation.y = side;
        board.add(face);
        if (item.kind === "activityBoard") {
          const slots = activityExhibit === undefined
            ? [{ photo: nextRoom.coverPhoto }, ...nextRoom.items.filter((entry) => entry.kind === "memory").slice(-3)]
            : exhibitRecords(activityExhibit);
          slots.forEach((slot, index) => {
            const frame = new THREE.Group();
            frame.name = "activity-exhibit-slot";
            if (activityExhibit !== undefined) frame.userData.memoryId = { kind: "memory", link: slot.link, title: slot.title };
            else if (slot.id) frame.userData.memoryId = slot.id;
            face.add(frame);
            const x = index % 2 ? 0.52 : -0.52;
            const y = index < 2 ? 1.805 : 1.225;
            addPhoto(frame, slot.photo, 0.71, 0.35, x, y, 0.205);
            if (activityExhibit !== undefined) addLabel(frame, slot.title, 0.75, 0.12, x, y - 0.215, 0.21, "#fff1d9");
          });
          if (activityExhibit !== undefined && !slots.length) {
            addLabel(face, exhibitMessage(activityExhibit), 1.7, 0.18, 0, 1.52, 0.21, "#fff1d9");
          }
        } else {
          addLabel(face, "모임 공지", 1.04, 0.15, 0, 1.66, 0.19, "#fff1d9", "#6e519d");
          const notice = Array.from(nextRoom.notice?.replace(/\s+/g, " ").trim() || "아직 공지가 없어요");
          for (let line = 0; line < 3; line += 1) {
            const text = notice.slice(line * 12, (line + 1) * 12).join("") + (line === 2 && notice.length > 36 ? "…" : "");
            addLabel(face, text, 1.04, 0.1, 0, 1.53 - line * 0.11, 0.19, "#fff1d9");
          }
          addLabel(face, "일정·정보", 0.48, 0.13, -0.39, 1.02, 0.19, "#f1e4cb");
          addLabel(face, "참여·대화", 0.48, 0.13, 0.39, 1.02, 0.19, "#f1e4cb");
        }
      }
    }
  }

  function rebuildMascots(nextRoom) {
    if (mascotLayer) { scene.remove(mascotLayer); disposeObject(mascotLayer); }
    mascotLayer = new THREE.Group();
    // Decorative occupants follow actual stools, never implied online members.
    const tables = nextRoom.items.filter((item) => ["table", "diningTable", "gameTable", "feastTable", "studyDesk", "focusDesk", "photoEditDesk", "photoPrintBench", "mixingDesk"].includes(item.kind));
    const colors = ["#83a375", "#b99acb", "#e7c6a2", nextRoom.avatarColor];
    const avatars = [];
    nextRoom.items.filter((item) => ["stool", "gameChair", "roundChair"].includes(item.kind)).sort((a, b) => Number(a.z >= getRoomLayout(nextRoom).building.maxZ) - Number(b.z >= getRoomLayout(nextRoom).building.maxZ)).slice(0, 6).forEach((seat, index) => {
      const table = tables.filter((candidate) => (candidate.level || 0) === (seat.level || 0)).reduce((nearest, candidate) => !nearest ||
        Math.hypot(candidate.x - seat.x, candidate.z - seat.z) < Math.hypot(nearest.x - seat.x, nearest.z - seat.z) ? candidate : nearest, null);
      avatars.push({ ...seat, angle: table ? Math.atan2(table.x - seat.x, table.z - seat.z) : 0,
        color: colors[index % colors.length], pose: "seated" });
    });
    avatars.forEach((entry) => {
      const character = createMascot(entry);
      character.position.set(entry.x, placedItemElevation(entry, nextRoom) + (entry.pose === "seated" ? 0.5 : 0), entry.z);
      character.userData.roomLevel = entry.level || 0;
      character.userData.seatId = entry.id;
      character.rotation.y = entry.angle;
      mascotLayer.add(character);
    });
    scene.add(mascotLayer);
  }

  function rebuildSpeech() {
    [...speechLayer.children].forEach((child) => { speechLayer.remove(child); disposeObject(child); });
    if (!room || !speechMessages.length) return;
    const layout = getRoomLayout(room);
    const positions = [];
    for (let z = layout.building.maxZ - 2; z > layout.building.minZ + 1 && positions.length < 3; z -= 1.6) {
      for (let x = -1.5; x < layout.building.maxX - 1 && positions.length < 3; x += 3.4) {
        const position = { x, y: 0, z };
        if (isWalkablePosition(position, room, 0.5)) positions.push(position);
      }
    }
    speechMessages.forEach((message, index) => {
      const position = positions[index];
      if (!position) return;
      const seed = Array.from(String(message.memberId)).reduce((value, character) => value + character.charCodeAt(0), 0);
      const character = createMascot({ color: ["#8067b1", "#73a18a", "#c39260"][seed % 3] });
      character.name = `recent-speaker-${message.memberId}`;
      character.position.set(position.x, position.y, position.z);
      character.add(speechSprite(message));
      speechLayer.add(character);
    });
    speechLayer.visible = floorView !== "mezzanine" || walkthrough.active();
  }

  function updateGreetingVisibility() {
    if (!greetingLayer) return;
    greetingLayer.visible = floorView !== "mezzanine";
    greetingLayer.getObjectByName("yard-greeters-overflow").visible = !presentedFrontage;
  }

  function rebuildGreetings() {
    if (greetingLayer) {
      disposeObject(greetingLayer);
      greetingLayer = null;
    }
    if (!room || !greetingMembers.length) return;
    greetingLayer = createYardGreeters(room, greetingMembers);
    scene.add(greetingLayer);
    updateGreetingVisibility();
  }

  function finishTemplateTransition() {
    if (!templateSwitching) return;
    templateSwitching = false;
    callbacks.onTemplateTransition(false);
  }

  function update(nextRoom, ...args) {
    if (templateFrame) {
      queuedTemplateUpdate = [nextRoom, ...args];
      return;
    }
    if (!room || room.template === nextRoom.template || !callbacks.onTemplateTransition) {
      updateScene(nextRoom, ...args);
      return;
    }

    templateSwitching = true;
    queuedTemplateUpdate = [nextRoom, ...args];
    cancelFlightPreparation();
    callbacks.onTemplateTransition(true);
    // Leave one paint for the progress indicator before building the new scene.
    templateFrame = requestAnimationFrame(() => {
      templateFrame = requestAnimationFrame(() => {
        templateFrame = 0;
        const next = queuedTemplateUpdate;
        queuedTemplateUpdate = undefined;
        try {
          updateScene(...next);
        } catch {
          onContextLost();
        }
      });
    });
  }

  function updateScene(nextRoom, nextSelectedId, nextView, nextZoom = DEFAULT_ROOM_ZOOM, nextFloorView = "all", nextCameraReset = 0, nextFlight) {
    if (disposed) return;
    const flightChanged = flight?.job !== nextFlight;
    if (flightChanged) {
      cancelFlightPreparation();
      const fromWalking = walkthrough.active();
      flight = nextFlight ? {
        job: nextFlight,
        fromCamera: (fromWalking ? walkthrough.camera : activePreviewCamera()).clone(),
        fromFrontage: presentedFrontage,
        fromFloor: floorView,
        fromWalking
      } : undefined;
      if (!flight && islandGround) {
        islandGround.position.set(0, 0, 0);
        islandGround.scale.set(1, 1, 1);
      }
    }
    const interactive = callbacks.canInteract?.() ?? true;
    renderer.domElement.style.touchAction = interactive && nextView !== "front" ? "none" : "auto";
    if (!interactive) {
      cameraControls.reset();
      if (drag && renderer.domElement.hasPointerCapture(drag.pointerId)) renderer.domElement.releasePointerCapture(drag.pointerId);
      drag = null;
      renderer.domElement.removeAttribute("data-ph-capture-attribute-action");
    }
    const nextFocusBuilding = callbacks.focusBuilding?.() ?? false;
    const resetCamera = view !== nextView || floorView !== nextFloorView || room?.template !== nextRoom.template ||
      cameraReset !== nextCameraReset || focusBuilding !== nextFocusBuilding;
    focusBuilding = nextFocusBuilding;
    if (resetCamera || !interactive) {
      stopPreviewMovement();
      previewNavigating = false;
    }
    const roomChanged = room !== nextRoom;
    const greetingLayoutChanged = room?.template !== nextRoom.template || room?.items !== nextRoom.items;
    if (greetingLayoutChanged || room?.version !== nextRoom.version) itemElevations.clear();
    room = nextRoom;
    selectedId = nextSelectedId;
    const atmosphere = room.atmosphere || DEFAULT_ATMOSPHERE;
    const themeKey = [room.template, room.version, room.accentColor, room.matColor, atmosphere.wallMaterial, atmosphere.floorMaterial, atmosphere.wallPatternScale, atmosphere.floorPatternScale].join(":");
    const shellChanged = lastTheme !== themeKey;
    if (shellChanged) { rebuildShell(room); lastTheme = themeKey; }
    updateSigns();
    const surfaces = surfaceColors(room);
    const surfaceKey = JSON.stringify(surfaces);
    if (shellChanged || surfaceKey !== lastSurfaces) {
      shell.traverse((object) => {
        const surface = object.userData.roomSurface;
        if (surface) setSurfaceColor(object.material, surfaces[surface], object.userData.surfaceShade);
      });
      lastSurfaces = surfaceKey;
    }
    let furnishingsChanged = false;
    const avatarKey = JSON.stringify([room.template, room.version, room.avatarColor, room.items.filter((item) => ["stool", "gameChair", "roundChair", "table", "diningTable", "gameTable", "feastTable", "studyDesk", "focusDesk", "photoEditDesk", "photoPrintBench", "mixingDesk", "rehearsalStage", "crashMat", "crashMatWide"].includes(item.kind)).map(({ id, kind, x, z, level, rotation }) => [id, kind, x, z, level, rotation])]);
    const avatarsChanged = lastAvatar !== avatarKey;
    if (avatarsChanged) { rebuildMascots(room); lastAvatar = avatarKey; }
    const displayRoom = activityExhibit === undefined ? room : { ...room, items: room.items.map((item) => memoryForExhibit(item, activityExhibit)) };
    const identityKey = JSON.stringify([activityExhibitKey, room.template, room.version, room.name, room.accentColor, room.coverPhoto, room.notice,
      displayRoom.items.filter((item) => ["memory", "clubPinboard", "climbingBoard", "gameWallBoard", "activityBoard", "clubDashboard"].includes(item.kind))]);
    if (lastIdentity !== identityKey) { rebuildIdentity(displayRoom); lastIdentity = identityKey; }
    const ids = new Set(room.items.map((item) => item.id));
    objects.forEach((object, id) => {
      if (!ids.has(id)) { objectLayer.remove(object); disposeObject(object); objects.delete(id); furnishingsChanged = true; }
    });
    const plan = getRoomLayout(room);
    displayRoom.items.forEach((item) => {
      let object = objects.get(item.id);
      const soft = ["sofa", "armchair", "beanbag", "gameChair", "roundChair", "clubSofa"].includes(item.kind);
      const seatIndex = [...item.id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
      const palette = room.template === "boardgame" ? ["#456277", "#b4674d", "#7b8861", "#b99a59", "#bc803f", "#556d85"] : ["#888784", "#b29b80", "#697989"];
      const color = soft ? room.accentColor === ACCENT_COLORS[0].value
        ? item.color || (item.kind === "sofa" || item.kind === "clubSofa" ? palette[0] : palette[seatIndex % palette.length]) : item.color || room.accentColor : item.color;
      let elevation = itemElevations.get(item.id);
      if (elevation === undefined) {
        elevation = placedItemElevation(item, room);
        itemElevations.set(item.id, elevation);
      }
      const suspension = item.kind === "hangingLamp" ? Math.max(0.1, ((item.level || 0) === 0 && plan.mezzanine && item.x >= plan.mezzanine.minX && item.x <= plan.mezzanine.maxX && item.z >= plan.mezzanine.minZ && item.z <= plan.mezzanine.maxZ ? plan.mezzanine.height : plan.building.height) - elevation) / (item.scaleY || 1) : undefined;
      const panelBacking = climbingPanelBacking(item, room, plan);
      const modelKey = [room.template, item.kind, color, room.matColor, room.accentColor, item.variant, item.finish, suspension, panelBacking, ["diningTable", "foodPlates"].includes(item.kind) ? room.food : ""].join(":");
      if (object && object.userData.modelKey !== modelKey) {
        disposeObject(object); objects.delete(item.id); object = null;
      }
      if (!object) {
        furnishingsChanged = true;
        object = createFurniture(item.kind, { color, food: room.food, accentColor: room.accentColor, matColor: room.matColor, variant: item.variant, suspension, panelBacking });
        object.userData.originalScale = object.scale.clone();
        applyAssetAppearance(object, { ...item, color: item.kind === "lowEdgeLight" ? undefined : color });
        applyBakedFurnitureOcclusion(object, item.kind);
        const common = commonFunctionForItem(item);
        if (common) object.add(commonFunctionMarker(common, CATALOG.find((entry) => entry.kind === item.kind).height));
        if (!CATALOG.find((entry) => entry.kind === item.kind)?.mount && !["rug", "loungeRug"].includes(item.kind)) object.add(furnitureContactShadow(item.kind));
        object.userData.modelKey = modelKey;
        object.userData.itemId = item.id;
        objectLayer.add(object);
        objects.set(item.id, object);
      }
      const scale = assetScale(item);
      object.scale.copy(object.userData.originalScale).multiply(new THREE.Vector3(scale.x, scale.y, scale.z));
      object.position.set(item.x, elevation, item.z);
      object.userData.roomLevel = item.level || 0;
      const stairs = plan.stairs;
      object.userData.stairAccent = item.kind === "lowEdgeLight" && !item.level && stairs &&
        item.x >= stairs.minX && item.x <= stairs.maxX && item.z >= stairs.minZ && item.z <= stairs.maxZ + 0.04 &&
        Math.abs((item.elevation || 0) - (stairs.maxZ - item.z) * stairs.height / (stairs.maxZ - stairs.minZ)) < 0.1;
      object.rotation.y = item.rotation * Math.PI / 2;
      const contactShadow = object.getObjectByName("furniture-contact-shadow");
      if (contactShadow) contactShadow.visible = atmosphere.shadows;
      if (item.kind === "memory" && object.userData.title !== item.title) {
        const previousLabel = object.getObjectByName("memory-title");
        if (previousLabel) disposeObject(previousLabel);
        const titleLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.18), new THREE.MeshBasicMaterial({ map: labelTexture(item.title || "추억 액자", "#fff2d8") }));
        titleLabel.name = "memory-title";
        titleLabel.position.set(0, 0.36, 0.06);
        object.add(titleLabel);
        object.userData.title = item.title;
      }
      if (item.kind === "memory" && object.userData.photo !== item.photo) {
        const previousPhoto = object.getObjectByName("memory-photo");
        if (previousPhoto) disposeObject(previousPhoto);
        const photoGroup = new THREE.Group();
        photoGroup.name = "memory-photo";
        object.add(photoGroup);
        addPhoto(photoGroup, item.photo, 0.77, 0.65, 0, 0.94, 0.08);
        object.userData.photo = item.photo;
      }
    });
    showSelection(room.items.find((item) => item.id === selectedId));
    if (resetCamera || zoom !== nextZoom || shellChanged || flightChanged) {
      if (resetCamera) cameraControls.reset();
      view = nextView; zoom = nextZoom; floorView = nextFloorView; cameraReset = nextCameraReset; resize();
    }
    if (!interactive) renderer.domElement.style.cursor = "default";
    const walking = view === "firstPerson" || view === "thirdPerson";
    if (roomChanged || (!flight && (resetCamera || flightChanged)) || walking !== walkthrough.active()) {
      renderer.shadowMap.needsUpdate = true;
    }
    const frontage = flight ? presentedFrontage : view === "front";
    updatePresentation(frontage, !frontage && (walking || Boolean(flight?.fromWalking)), interactive);
    if (greetingLayoutChanged) rebuildGreetings();
    if (!walking || !interactive || greetingLayoutChanged) resetGarden();
    if (roomChanged || shellChanged || avatarsChanged) {
      const occupied = new Set(mascotLayer?.children.map((avatar) => avatar.userData.seatId));
      interactionTargets = room.items.map((item) => itemInteraction(item, itemElevations.get(item.id), occupied.has(item.id), room)).filter(Boolean);
      const wallSwitch = shell.getObjectByName(ROOM_LIGHT_SWITCH_ID);
      if (wallSwitch) {
        const { x, y, z } = wallSwitch.position;
        interactionTargets.push(lightInteraction({ x, y, z: z - 0.09 }));
      }
      for (const bed of islandGround?.getObjectByName("island-garden")?.userData.flowerBeds || []) {
        interactionTargets.push({ ...bed, bed, minY: 0, maxY: bed.y, name: "정원 화단", label: "화단 돌보기", choices: GARDEN_CHOICES });
      }
    }
    scene.updateMatrixWorld(true);
    walkthrough.update(view, room.avatarColor, interactive, {
      preservePose: callbacks.preserveWalkPose?.(), playing: callbacks.isPlayMode?.()
    });
    updateRoomLighting(shellChanged || furnishingsChanged || avatarsChanged);
    rebuildSpeech();
    render();
  }

  function updatePresentation(frontage, walking, interactive) {
    presentedFrontage = frontage;
    horizon.group.visible = !frontage && Boolean(getRoomLayout(room).island);
    horizon.setEdgeFade(frontage);
    const showExterior = frontage ? callbacks.showPreviewExterior?.() !== false : walking || view === "exterior";
    if (showExterior !== presentedExterior) {
      presentedExterior = showExterior;
      renderer.shadowMap.needsUpdate = true;
    }
    const levelVisible = (level) => walking || floorView === "all" || (floorView === "mezzanine") === (level === 1);
    shell.traverse((object) => {
      if (object.name === "floating-island") object.visible = !frontage && levelVisible(0);
      else if (object.userData.terraceEdging) object.visible = !frontage;
      else if (object.userData.entrance) object.visible = levelVisible(0);
      else if (object.userData.exteriorOnly) object.visible = showExterior;
      else if (object.userData.exteriorDetail) object.visible = walking || showExterior;
      else if (object.userData.walkthroughOnly) object.visible = walking || (showExterior && Boolean(object.userData.buildingWall));
      else if (object.userData.overhead) object.visible = walking || floorView === "all";
      else if (object.userData.mezzanine) object.visible = walking || floorView !== "ground";
    });
    const display = frontage ? getDioramaBounds(getRoomLayout(room)) : null;
    room.items.forEach((item) => {
      const object = objects.get(item.id);
      const size = footprint(item);
      object.visible = (object.userData.stairAccent ? walking || floorView !== "ground" : levelVisible(object.userData.roomLevel)) && (!display || (
        item.x - size.width / 2 >= display.minX && item.x + size.width / 2 <= display.maxX &&
        item.z - size.depth / 2 >= display.minZ && item.z + size.depth / 2 <= display.maxZ
      ));
    });
    mascotLayer.children.forEach((object) => { object.visible = levelVisible(object.userData.roomLevel); });
    updateGreetingVisibility();
    identityLayer.children.forEach((object) => { object.visible = levelVisible(object.userData.roomLevel || 0); });
    indicator.visible = interactive && !walking && view !== "exterior" && Boolean(room.items.find((item) => item.id === selectedId &&
      levelVisible(item.level || 0)));
  }

  function updateRoomLighting(force = false) {
    const atmosphere = room.atmosphere || DEFAULT_ATMOSPHERE;
    const atmosphereKey = JSON.stringify([atmosphere, presentedFrontage, outdoorLight, generalLighting]);
    if (force || lastAtmosphere !== atmosphereKey) {
      updateLighting(outdoorLight ? { ...atmosphere, outdoorLight } : atmosphere, scene, presentedFrontage, room.template,
        { generalLighting, building: getRoomLayout(room).building });
      skyOrb.update(outdoorLight, outdoorLightSource.position, presentedFrontage);
      renderer.shadowMap.needsUpdate = true;
      lastAtmosphere = atmosphereKey;
    }
  }

  function floorPoint(event, elevation = 0) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, walkthrough.active() ? walkthrough.camera : camera);
    plane.constant = -elevation;
    return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }

  function onDown(event) {
    if (callbacks.canInteract?.() === false || !room || drag || event.isPrimary === false || ![0, 1, 2].includes(event.button)) return;
    if (view === "front") {
      if (event.button === 0 && !event.shiftKey && event.pointerType === "mouse" && cameraControls.onDown(event)) {
        cancelFlightPreparation();
        container.focus({ preventScroll: true });
      }
      return;
    }
    if (walkthrough.active() && event.button !== 0) return;
    renderer.domElement.setAttribute("data-ph-capture-attribute-action", walkthrough.active() ? "space_walk_look" : "space_object_select");
    if (walkthrough.onDown(event)) return;
    container.focus({ preventScroll: true });
    if (event.button !== 0 || event.shiftKey) {
      cameraControls.onDown(event);
      return;
    }
    floorPoint(event);
    const editable = callbacks.canEdit?.() ?? true;
    const id = pickRoomItem(raycaster.intersectObjects([objectLayer, identityLayer, shell].filter(Boolean), true), editable);
    const item = room.items.find((entry) => entry.id === id);
    if (!item || !editable) {
      cameraControls.onDown(event, id);
      return;
    }
    callbacks.onSelect(item.id);
    const point = floorPoint(event, placedItemElevation(item, room));
    if (!point) return;
    drag = { id: item.id, start: item, x: event.clientX, y: event.clientY, offsetX: item.x - point.x, offsetZ: item.z - point.z, candidate: item, moved: false, pointerId: event.pointerId };
    renderer.domElement.setPointerCapture(event.pointerId);
    container.focus({ preventScroll: true });
  }

  function onMove(event) {
    if (callbacks.canInteract?.() === false) return;
    if (walkthrough.onMove(event) || cameraControls.onMove(event)) return;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5 && !drag.moved) return;
    const point = floorPoint(event, placedItemElevation(drag.start, room));
    if (!point) return;
    drag.moved = true;
    drag.candidate = { ...drag.start, x: snapPosition(point.x + drag.offsetX), z: snapPosition(point.z + drag.offsetZ) };
    const object = objects.get(drag.id);
    object.position.set(drag.candidate.x, placedItemElevation(drag.start, room) + 0.04, drag.candidate.z);
    for (const attached of transformAttachedItems(room.items, drag.id, drag.candidate)) {
      if (attached.id === drag.id) continue;
      objects.get(attached.id)?.position.set(attached.x, placedItemElevation(attached, room), attached.z);
    }
    showSelection(drag.candidate, canPlace(drag.candidate, room.items, room));
    renderer.domElement.style.cursor = "grabbing";
    renderMoving();
  }

  function endDrag(event) {
    if (callbacks.canInteract?.() === false) return;
    if (walkthrough.onUp(event)) return;
    const orbiting = cameraControls.isDragging();
    if (cameraControls.onUp(event)) {
      if ((orbiting || view === "front") && settleTimer === undefined) render();
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const previous = drag;
    drag = null;
    if (previous.moved) renderer.shadowMap.needsUpdate = true;
    const cancelled = event.type === "pointercancel" || event.type === "lostpointercapture";
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    renderer.domElement.style.cursor = "grab";
    if (previous.moved && !cancelled && canPlace(previous.candidate, room.items, room)) {
      callbacks.onMove(previous.id, previous.candidate.x, previous.candidate.z);
    } else {
      if (previous.moved && !cancelled) callbacks.onInvalid();
      room.items.forEach((item) => objects.get(item.id)?.position.set(item.x, placedItemElevation(item, room), item.z));
      showSelection(room.items.find((item) => item.id === selectedId));
    }
    render();
  }

  function onWheel(event) {
    if (callbacks.canInteract?.() === false || view === "front" || walkthrough.active()) return;
    if (drag) { event.preventDefault(); return; }
    cameraControls.onWheel(event, zoom);
  }

  function activePreviewCamera() {
    return view === "front" ? previewCamera : camera;
  }

  function movePreview(time) {
    const seconds = lastPreviewMove === undefined ? 1 / 60 : Math.min((time - lastPreviewMove) / 1000, 0.05);
    lastPreviewMove = time;
    const sideways = Number(previewKeys.has("KeyD")) - Number(previewKeys.has("KeyA"));
    const forward = Number(previewKeys.has("KeyW")) - Number(previewKeys.has("KeyS"));
    const vertical = Number(previewKeys.has("KeyE")) - Number(previewKeys.has("KeyQ"));
    const directionLength = Math.hypot(sideways, forward, vertical);
    if (!directionLength || !renderWidth || !renderHeight) return;
    previewNavigating = true;
    previewCamera.getWorldDirection(previewForward);
    previewForward.y = 0;
    previewForward.normalize();
    previewRight.set(-previewForward.z, 0, previewForward.x);
    const distance = PREVIEW_MOVE_SPEED * seconds / directionLength;
    previewCamera.position.addScaledVector(previewForward, forward * distance).addScaledVector(previewRight, sideways * distance);
    previewCamera.position.y = Math.max(0.35, previewCamera.position.y + vertical * PREVIEW_LIFT_SPEED * seconds / directionLength);
    previewCamera.updateMatrixWorld();
  }

  function stopPreviewMovement() {
    previewKeys.clear();
    lastPreviewMove = undefined;
  }

  function onPreviewKeyDown(event) {
    if (view !== "front" || !room || callbacks.canInteract?.() === false ||
      event.target !== container || event.altKey || event.ctrlKey || event.metaKey) return;
    const reset = event.key === "Home";
    if (!reset && !PREVIEW_MOVE_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.repeat) return;
    cancelFlightPreparation();
    if (reset) {
      stopPreviewMovement();
      previewNavigating = false;
      cameraControls.reset();
      updateCamera(false);
    } else {
      previewKeys.add(event.code);
    }
    render();
  }

  function onPreviewKeyUp(event) {
    if (previewKeys.delete(event.code) && !previewKeys.size) lastPreviewMove = undefined;
  }

  function onContextMenu(event) { if (view !== "front" && callbacks.canInteract?.() !== false) event.preventDefault(); }

  function onContextLost(event) {
    event?.preventDefault();
    cancelAnimationFrame(templateFrame);
    templateFrame = 0;
    queuedTemplateUpdate = undefined;
    finishTemplateTransition();
    callbacks.onError();
  }
  function updateSigns() {
    const signName = callbacks.getSignName?.()?.trim() || room?.name?.trim() || "우리 공간";
    for (const sign of signs) updateClubhouseSign(sign, signName, !reduceMotion?.matches);
  }
  function onSignMotionChange() { updateSigns(); render(); }
  function onSignVisibilityChange() {
    if (document.hidden) window.clearTimeout(signTimer);
    else render();
  }
  const signObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
    canvasOnScreen = entry.isIntersecting;
    if (canvasOnScreen) render();
    else window.clearTimeout(signTimer);
  });
  signObserver?.observe(container);
  reduceMotion?.addEventListener?.("change", onSignMotionChange);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  container.addEventListener("keydown", onPreviewKeyDown);
  container.addEventListener("keyup", onPreviewKeyUp);
  container.addEventListener("blur", stopPreviewMovement);
  window.addEventListener("blur", stopPreviewMovement);
  document.addEventListener("visibilitychange", stopPreviewMovement);
  document.addEventListener("visibilitychange", onSignVisibilityChange);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerup", endDrag);
  renderer.domElement.addEventListener("pointercancel", endDrag);
  renderer.domElement.addEventListener("lostpointercapture", endDrag);
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
  renderer.domElement.addEventListener("contextmenu", onContextMenu);
  resize();

  return {
    update,
    setStudioWideAngle(value) {
      const next = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 100) : 0;
      if (next === studioWideAngle) return;
      studioWideAngle = next;
      if (canUseStudioCamera()) updateCamera();
    },
    turnStudioCamera(direction) {
      if (canUseStudioCamera() && (direction === -1 || direction === 1) && cameraControls.turn(direction * Math.PI / 4)) updateCamera();
    },
    setPreviewWideAngle(value) {
      if (previewWideAngle === value) return;
      previewWideAngle = value;
      if (view === "front" && previewLens) {
        setRoomFrontLens(previewCamera, previewLens, previewCamera.aspect, value);
        render();
      }
    },
    setOutdoorLight(light) {
      outdoorLight = light;
      horizon.update(light);
      if (room) {
        updateRoomLighting();
        render();
      }
    },
    setGeneralLighting(enabled) {
      if (generalLighting === enabled) return;
      generalLighting = enabled;
      if (room) {
        updateRoomLighting();
        render();
      }
    },
    setActivityExhibit(exhibit) {
      const next = exhibit === undefined ? undefined : { status: exhibit.status, records: exhibit.status === "ready" ? exhibit.records : [] };
      const key = JSON.stringify(next);
      if (key === activityExhibitKey) return;
      activityExhibit = next;
      activityExhibitKey = key;
      if (room && !templateFrame) updateScene(room, selectedId, view, zoom, floorView, cameraReset, flight?.job);
    },
    setSpeech(messages) { speechMessages = messages; rebuildSpeech(); render(); },
    setGreetingMembers(memberIds = []) { greetingMembers = memberIds; rebuildGreetings(); renderer.shadowMap.needsUpdate = true; render(); },
    requestVisitPointerLock: walkthrough.requestVisitPointerLock,
    setWalkInputBlocked: walkthrough.setInputBlocked,
    chooseWalkInteraction: walkthrough.chooseInteraction,
    command: (action) => { if (callbacks.canInteract?.() !== false) walkthrough.command(action); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      cancelAnimationFrame(templateFrame);
      cancelFlightPreparation();
      window.clearTimeout(settleTimer);
      window.clearTimeout(signTimer);
      signObserver?.disconnect();
      reduceMotion?.removeEventListener?.("change", onSignMotionChange);
      walkthrough.dispose();
      clearWater();
      cameraControls.reset();
      observer.disconnect();
      container.removeEventListener("keydown", onPreviewKeyDown);
      container.removeEventListener("keyup", onPreviewKeyUp);
      container.removeEventListener("blur", stopPreviewMovement);
      window.removeEventListener("blur", stopPreviewMovement);
      document.removeEventListener("visibilitychange", stopPreviewMovement);
      document.removeEventListener("visibilitychange", onSignVisibilityChange);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", endDrag);
      renderer.domElement.removeEventListener("pointercancel", endDrag);
      renderer.domElement.removeEventListener("lostpointercapture", endDrag);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      rendering.dispose();
      horizon.dispose();
      skyOrb.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  };
}

export function createFurnitureThumbnails() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(180, 140);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9e9cbb, 2.6));
  const light = new THREE.DirectionalLight(0xfff0df, 3);
  light.position.set(-4, 8, 5);
  scene.add(light);
  const camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.4, -1.4, 0.1, 30);
  const images = {};
  try {
    CATALOG.forEach(({ kind }) => {
      const object = createFurniture(kind);
      scene.add(object);
      const bounds = new THREE.Box3().setFromObject(object);
      const center = bounds.getCenter(new THREE.Vector3());
      camera.position.copy(center).add(new THREE.Vector3(4, 3.2, 5));
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const projected = new THREE.Box2();
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        projected.expandByPoint(new THREE.Vector2(point.x, point.y));
      }
      const size = projected.getSize(new THREE.Vector2());
      const halfHeight = Math.max(size.y, size.x / (180 / 140)) * 0.57;
      camera.left = -halfHeight * 180 / 140; camera.right = -camera.left;
      camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      images[kind] = renderer.domElement.toDataURL("image/png");
      scene.remove(object);
      disposeObject(object);
    });
  } finally { renderer.dispose(); renderer.forceContextLoss(); }
  return images;
}
