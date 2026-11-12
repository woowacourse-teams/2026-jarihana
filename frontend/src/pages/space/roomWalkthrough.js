import * as THREE from "three";
import { readAvatarAppearance } from "../../../public/sparring-arena/src/avatar-appearance.js";
import { createWalkingCharacters } from "../../../public/sparring-arena/src/walking-characters.js";
import { getRoomLayout, PLAYER, roomZoneAt } from "./roomLayout";
import { isWalkablePosition, moveWalker } from "./roomNavigation";
import { animateMascot, createMascot, createWalkProp, disposeObject, poseMascotGrip } from "./roomModels";
import { drawClubhouseAvatar, placeAvatarProp } from "./clubhouseAvatar.js";
import { createCupLift, cupLiftAmount, isCup } from "./cupLift.js";
import { fitSeatedAvatar } from "./seatedAvatar.js";
import { aimedInteraction, nearestSeat, SEATED_CHOICES } from "./walkInteractions";
import { availableSeat, portableDefinition, sharedInteractionTarget } from "./roomCapabilities.js";

const WALK_VIEWS = new Set(["firstPerson", "thirdPerson"]);
const SPRINT_KEYS = new Set(["ShiftLeft", "ShiftRight"]);
const JUMP_SPEED = 4.5;
const GRAVITY = 18;
const WALK_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
const MOVEMENT_KEYS = new Set([...WALK_KEYS, "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export function createWalkthrough(scene, container, { getRoom, getObstacles, render, onPosition, getInteractionTargets, onInteractionChange, onInteract, onPointerLockChange, onCapture, prepareAvatarMaterial = () => {} }) {
  const camera = new THREE.PerspectiveCamera(62, 1, 0.08, 120);
  const keys = new Set();
  const sprintKeys = new Set();
  const cameraRay = new THREE.Raycaster();
  const sight = new THREE.Ray();
  const pointerNdc = new THREE.Vector2();
  let position = { ...PLAYER.spawn };
  let yaw = 0;
  let pitch = 0;
  let view = "perspective";
  let avatar;
  let avatarColor;
  let mascotKey;
  let customAvatar;
  let playerAppearance;
  let sharedAppearance;
  const avatarOrigin = new THREE.Vector3();
  let walkPhase = 0;
  let stride = 0;
  let prop;
  let firstPersonGrip;
  let held = null;
  let targetOutline;
  let approaching = null;
  let seated = null;
  let nearby = null;
  let menu = null;
  let furniture;
  let feedback = "";
  let feedbackTimer;
  let pointer;
  let pointerLocked = false;
  let hoverLook = false;
  let wantsPointerLock = false;
  let pointerUnlockTimer;
  let resumeLookOnFocus = false;
  let lockingForVisit = false;
  let lookDuringFlight = false;
  let controlsEnabled = true;
  let inputBlocked = false;
  let playMode = false;
  let hasWalkPose = false;
  let visiting = false;
  let jumpHeight = 0;
  let jumpVelocity = 0;
  let frame = 0;
  let lastTime = 0;
  let stepUntil = 0;
  let walkStep;
  let lastZone;
  let lastTemplate;
  let disposed = false;
  let realtime = null;
  let applyingServer = false;
  let actionPending = false;
  let heldItemId = null;
  let serverEmote = null;
  let appliedRevision = null;
  let appliedEpoch = null;
  let lastLocomotion = "idle";
  let sharedPose = "relaxed";
  const cupLift = createCupLift();
  let cupLiftMoving = false;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  const active = () => WALK_VIEWS.has(view);
  const acceptsInput = () => active() && controlsEnabled && !inputBlocked;
  const hasMotion = () => jumpVelocity !== 0 || jumpHeight > 0 || keys.size > 0 || stepUntil > 0 || Boolean(walkStep || approaching) ||
    cupLiftMoving || Boolean(serverEmote && realtime && serverEmote.expiresAt > realtime.store.serverNow());
  function stop() {
    const airborne = jumpHeight > 0;
    const wasMoving = keys.size > 0 || stepUntil > 0 || Boolean(walkStep);
    keys.clear();
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    stepUntil = 0;
    walkStep = undefined;
    const capture = container.querySelector("canvas");
    const pointerId = pointer?.id;
    pointer = null;
    if (pointerId !== undefined && capture?.hasPointerCapture(pointerId)) capture.releasePointerCapture(pointerId);
    jumpHeight = 0;
    jumpVelocity = 0;
    sprintKeys.clear();
    const wasApproaching = Boolean(approaching);
    approaching = null;
    const wasStriding = Boolean(stride);
    stride = 0;
    if (airborne || wasApproaching || wasStriding || wasMoving || realtime) syncCamera();
  }

  function releasePointerLock() {
    window.clearTimeout(pointerUnlockTimer);
    wantsPointerLock = false;
    lockingForVisit = false;
    if (hoverLook) {
      hoverLook = false;
      onPointerLockChange?.("free");
    }
    if (document.pointerLockElement === container) document.exitPointerLock();
  }

  function pauseWalk() {
    resumeLookOnFocus = false;
    releasePointerLock();
    stop();
  }

  function suspendWalk() {
    resumeLookOnFocus ||= wantsPointerLock;
    releasePointerLock();
    stop();
  }

  function resumeWalkLook() {
    if (!resumeLookOnFocus || !acceptsInput() || document.hidden || !document.hasFocus() ||
      document.pointerLockElement === container || menu) return;
    lockPointer();
  }

  function onCanvasBlur(event) {
    if (!event.relatedTarget && (document.hidden || !document.hasFocus())) suspendWalk();
    else pauseWalk();
  }

  function handlePointerLockChange() {
    const locked = document.pointerLockElement === container;
    if (locked && !wantsPointerLock) {
      document.exitPointerLock();
      return;
    }
    if (locked === pointerLocked) return;
    pointerLocked = locked;
    if (locked) hoverLook = false;
    if (!locked && wantsPointerLock) {
      if (document.hidden || !document.hasFocus()) suspendWalk();
      else {
        stop();
        // Chrome can report a tab switch's unlock before blur or visibilitychange.
        pointerUnlockTimer = window.setTimeout(pauseWalk, 120);
      }
    }
    onPointerLockChange?.(locked ? "locked" : "free");
    if (!locked) resumeWalkLook();
  }

  function handlePointerLockError() {
    if (wantsPointerLock && document.pointerLockElement !== container) {
      wantsPointerLock = false;
      enableHoverLook();
    }
  }

  function enableHoverLook() {
    // Some browsers and embedded views deny pointer capture; still accept mouse motion over the canvas.
    hoverLook = true;
    onPointerLockChange?.("hover");
  }

  function lockPointer(forVisit = false) {
    if (inputBlocked || wantsPointerLock || menu || approaching) return;
    resumeLookOnFocus = false;
    container.focus({ preventScroll: true });
    lockingForVisit = forVisit;
    if (!container.requestPointerLock) {
      if (forVisit) enableHoverLook();
      return;
    }
    wantsPointerLock = true;
    try {
      container.requestPointerLock()?.then(() => {
        if (disposed || !wantsPointerLock) releasePointerLock();
      }).catch(handlePointerLockError);
    } catch {
      handlePointerLockError();
    }
  }

  function spawn() {
    const room = getRoom();
    const front = getRoomLayout(room).building.maxZ;
    const legal = (candidate) => isWalkablePosition(candidate, room);
    const arrival = visiting && [12, 14, 10, 8, 6]
      .map((offset) => ({ x: PLAYER.spawn.x, z: front + offset })).find(legal);
    const alternative = () => [2, 4, 6, 8, 10, 12].flatMap((offset) =>
      [0, -2, 2, -4, 4].map((x) => ({ x: PLAYER.spawn.x + x, z: front + offset }))).find(legal);
    position = arrival || (!legal(PLAYER.spawn) && alternative()) || { ...PLAYER.spawn };
    yaw = 0;
    pitch = arrival ? 0.21 : 0;
  }

  function sharedPoseChoices() {
    if (!realtime) return SEATED_CHOICES;
    return [{ id: "relaxed", label: "편히 앉기", action: "space_seat_relax" },
      ...(held === "book" ? [{ id: "reading", label: "책 읽기", action: "space_seat_read" }] : []),
      ...(["cup", "coffee", "latte", "tea"].includes(held) ? [{ id: "drinking", label: "컵 들기", action: "space_seat_hold_cup" }] : [])];
  }

  function publishInteraction() {
    const poseChoices = sharedPoseChoices();
    onInteractionChange?.({ target: nearby, menu, poseChoices: seated ? poseChoices : null, held,
      throwable: Boolean(realtime && portableDefinition(held)?.throwable),
      consumable: Boolean(realtime && portableDefinition(held)?.consumable),
      camera: Boolean(realtime && portableDefinition(held)?.camera), shared: Boolean(realtime), pending: actionPending, feedback });
  }

  function sharedCommand(command) {
    if (!realtime || actionPending) return;
    actionPending = true;
    publishInteraction();
    const authority = realtime;
    authority.connection.command(command).catch((error) => {
      if (!disposed && realtime === authority) showFeedback(error.message || "동작을 완료하지 못했어요.");
    }).finally(() => { actionPending = false; if (!disposed) publishInteraction(); });
  }

  function heldAction(action) {
    if (!realtime || !heldItemId) return;
    if (action === "CAPTURE") { onCapture?.(); return; }
    const forward = { x: Math.sin(yaw), z: -Math.cos(yaw) };
    const payload = { action, itemId: heldItemId };
    if (action === "DROP") payload.position = { x: position.x + forward.x * 0.7, y: position.y || 0, z: position.z + forward.z * 0.7 };
    if (action === "THROW") payload.velocity = { x: forward.x * 5, y: 3, z: forward.z * 5 };
    sharedCommand(payload);
  }

  function showFeedback(message) {
    window.clearTimeout(feedbackTimer);
    feedback = message;
    publishInteraction();
    feedbackTimer = window.setTimeout(() => {
      feedback = "";
      publishInteraction();
    }, 2400);
  }

  function setHeld(kind) {
    if (held === kind) return;
    if (prop) disposeObject(prop);
    held = kind;
    prop = kind ? createWalkProp(kind, avatarColor) : null;
    firstPersonGrip = prop?.getObjectByName("first-person-grip");
    if (prop) scene.add(prop);
  }

  function putAway() {
    if (!held) return;
    if (realtime) { heldAction("DROP"); return; }
    setHeld(null);
    syncCamera();
    showFeedback("손에 든 소품을 내려놓았어요.");
  }

  function stand() {
    if (!seated) return;
    position = seated.approach;
    seated = null;
    sharedPose = "relaxed";
  }

  function interactionInView() {
    if (!acceptsInput() || jumpHeight || approaching) return null;
    if (seated) return seatedTarget;
    if (!getInteractionTargets) return null;
    sight.origin.copy(camera.position);
    camera.getWorldDirection(sight.direction);
    const targets = getInteractionTargets();
    return aimedInteraction(realtime ? targets.map((target) => sharedInteractionTarget(target, realtime.store.getState())).filter(Boolean) : targets.filter((target) => !target.sharedOnly), position, sight, getRoom());
  }

  function interactionAtPointer(event) {
    if (!playMode || !acceptsInput() || !getInteractionTargets || jumpHeight || approaching || seated) return null;
    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    pointerNdc.set((event.clientX - left) / width * 2 - 1, 1 - (event.clientY - top) / height * 2);
    cameraRay.setFromCamera(pointerNdc, camera);
    const targets = getInteractionTargets();
    return aimedInteraction(realtime ? targets.map((target) => sharedInteractionTarget(target, realtime.store.getState())).filter(Boolean) : targets.filter((target) => !target.sharedOnly), position, cameraRay.ray, getRoom());
  }

  function interact(target = interactionInView()) {
    if (menu) {
      closeInteraction();
      return;
    }
    if (seated) {
      if (realtime) { sharedCommand({ action: "STAND" }); return; }
      stand();
      syncCamera();
      return;
    }
    if (!target) return;
    if (realtime && target.sharedItem) { sharedCommand({ action: "PICKUP", itemId: target.itemId }); return; }
    if (target.seat) {
      if (realtime) {
        const slot = availableSeat(target, position, realtime.store.getState());
        if (slot === undefined) { showFeedback("빈자리가 없어요."); return; }
        sharedCommand({ action: "SIT", assetId: target.id, slot });
        return;
      }
      const seat = nearestSeat(target, position, getRoom());
      if (!seat) {
        showFeedback("이쪽에서 닿을 수 있는 빈자리가 없어요.");
        return;
      }
      stop();
      approaching = { ...seat, item: target.item };
      syncCamera();
      frame = requestAnimationFrame(tick);
    } else if (target.choices?.length) {
      stop();
      menu = { target, choices: target.choices };
      syncCamera();
      publishInteraction();
    } else if (target.feature) {
      if (target.feature !== "light") pauseWalk();
      onInteract?.(target);
    } else if (realtime && target.hint) showFeedback(target.hint);
  }

  function closeInteraction() {
    menu = null;
    syncCamera();
    publishInteraction();
  }

  function chooseInteraction(selection) {
    const choices = seated ? sharedPoseChoices() : menu?.choices;
    const choice = typeof selection === "number" ? choices?.[selection] : choices?.find(({ id }) => id === selection);
    if (!acceptsInput() || !choice) return;
    const { id } = choice;
    const target = menu?.target;
    menu = null;
    if (realtime) {
      if (seated) sharedCommand({ action: "POSE", pose: id });
      else if (choice.command?.action === "CAPTURE") onCapture?.();
      else if (choice.command) sharedCommand(choice.command);
      syncCamera(); publishInteraction();
      return;
    }
    if (seated) {
      if (id === "empty") setHeld(null);
      else if (id !== "cup" || !held || held === "book" || held === "cookie") setHeld(id);
      sharedPose = id === "cup" ? "drinking" : "relaxed";
    } else if (target.carry) {
      setHeld(id);
      showFeedback(choice.label + " 준비했어요.");
    } else {
      const message = onInteract?.(target, choice);
      if (message) showFeedback(message);
    }
    syncCamera();
    publishInteraction();
    if (hasMotion() && !frame) frame = requestAnimationFrame(tick);
  }

  function jump() {
    if (jumpHeight || jumpVelocity) return;
    if (realtime && seated) { sharedCommand({ action: "STAND" }); return; }
    stand();
    jumpVelocity = JUMP_SPEED;
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function highlightInteraction(target) {
    if (!playMode || view !== "thirdPerson" || menu || !Number.isFinite(target?.minY)) {
      if (targetOutline) targetOutline.visible = false;
      return;
    }
    if (!targetOutline) {
      const box = new THREE.BoxGeometry(1, 1, 1);
      targetOutline = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({
        color: "#fff4cf", opacity: 0.65, transparent: true, depthWrite: false, toneMapped: false
      }));
      targetOutline.name = "walk-interaction-highlight";
      box.dispose();
      scene.add(targetOutline);
    }
    if (targetOutline.visible && targetOutline.userData.target === target) return;
    targetOutline.userData.target = target;
    targetOutline.position.set(target.x, (target.minY + target.maxY) / 2, target.z);
    targetOutline.scale.set(target.width + 0.08, target.maxY - target.minY + 0.08, target.depth + 0.08);
    targetOutline.visible = true;
  }

  function disposeAvatar() {
    customAvatar?.dispose();
    customAvatar = undefined;
    if (avatar) disposeObject(avatar);
    avatar = undefined;
  }

  function syncCamera(moving = false) {
    if (!active() || disposed) return;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
    const floorHeight = position.y || 0;
    const translating = [...keys].some((key) => WALK_KEYS.has(key) || key === "ArrowUp" || key === "ArrowDown") || Boolean(approaching || walkStep) || stepUntil > 0;
    const locomotion = jumpHeight ? "jumping" : translating ? sprintKeys.size ? "running" : "walking" : "idle";
    const fit = seated ? fitSeatedAvatar(seated.item, seated) : null;
    const location = fit?.position ?? position;
    const now = performance.now();
    const time = realtime?.store.serverNow() ?? now;
    const greeting = serverEmote?.expiresAt > time;
    const appearance = sharedAppearance === undefined ? playerAppearance : sharedAppearance;
    const nextMascotKey = appearance ? null : [avatarColor, Boolean(seated), held, greeting].join(":");
    if (!avatar || mascotKey !== nextMascotKey) {
      disposeAvatar();
      avatar = appearance ? new THREE.Group() : createMascot({ color: avatarColor, pose: seated ? "seated" : greeting ? "greeting" : "standing", held });
      if (appearance) avatar.name = "player-avatar";
      else avatar.traverse((object) => prepareAvatarMaterial(object.material));
      mascotKey = nextMascotKey;
      scene.add(avatar);
    }
    avatar.position.set(location.x, (location.y || 0) + jumpHeight, location.z);
    avatar.scale.setScalar(fit?.scale ?? 1);
    avatar.rotation.y = Math.PI - (seated?.yaw ?? yaw);
    if (!appearance) {
      animateMascot(avatar, seated ? "idle" : locomotion, time);
      const hand = avatar.getObjectByName("greeting-hand");
      if (hand) hand.rotation.z = 0.21 + Math.sin(time / 140) * 0.35;
    }
    avatar.visible = view === "thirdPerson";
    const eye = new THREE.Vector3(location.x, (location.y || 0) + jumpHeight + (fit ? 1.16 * fit.scale : PLAYER.eyeHeight), location.z);
    if (view === "firstPerson") {
      camera.position.copy(eye);
      camera.lookAt(eye.clone().add(new THREE.Vector3(forward.x * Math.cos(pitch), Math.sin(pitch), forward.z * Math.cos(pitch))));
    } else {
      const desired = eye.clone().addScaledVector(forward, (seated ? 3.1 : -4.3) * Math.cos(pitch));
      if (seated) desired.addScaledVector(new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)), 1.75);
      desired.y += (seated ? 0.8 : 1.5) - Math.sin(pitch) * 3;
      desired.y = Math.max(floorHeight + 0.65, desired.y);
      const direction = desired.clone().sub(eye).normalize();
      let distance = eye.distanceTo(desired);
      // Labels and other sprites are UI, not physical camera obstacles.
      const meshes = [];
      for (const root of getObstacles()) root.traverseVisible((object) => {
        if (object.isMesh && !object.userData.walkCameraPassThrough) meshes.push(object);
      });
      // A small camera volume keeps the near plane away from door jambs and corners.
      for (const [x, y, z] of [[0, 0, 0], [0.22, 0, 0], [-0.22, 0, 0], [0, 0.18, 0], [0, 0, 0.22], [0, 0, -0.22]]) {
        cameraRay.set(eye.clone().add(new THREE.Vector3(x, y, z)), direction);
        cameraRay.far = distance;
        const hit = cameraRay.intersectObjects(meshes, false).find((entry) => {
          if (!entry.object.isMesh) return false;
          for (let object = entry.object; object; object = object.parent) if (!object.visible) return false;
          return true;
        });
        if (hit) distance = Math.min(distance, Math.max(0.12, hit.distance - 0.24));
      }
      camera.position.copy(eye).addScaledVector(direction, distance);
      if (seated) camera.lookAt(eye.x, eye.y - 0.35, eye.z);
      else camera.lookAt(eye.clone().addScaledVector(forward, 0.5));
      avatar.visible = distance > 0.8;
    }
    camera.updateMatrixWorld();
    const lift = cupLiftAmount(cupLift, Boolean(seated && sharedPose === "drinking" && isCup(held)), now, reduceMotion?.matches);
    cupLiftMoving = now < cupLift.until;
    let hands;
    if (appearance && avatar.visible) {
      if (!customAvatar) {
        customAvatar = createWalkingCharacters(avatar, 1);
        for (const mesh of customAvatar.pickMeshes) prepareAvatarMaterial(mesh.material);
      }
      hands = drawClubhouseAvatar(customAvatar, 0, appearance, avatarOrigin, 1, 0, {
        seated: Boolean(seated), locomotion, stride, held, lift, greeting, time,
      });
    }
    if (prop) {
      firstPersonGrip.visible = view === "firstPerson";
      prop.visible = true;
      if (view === "firstPerson") {
        const book = held === "book";
        prop.position.set(book ? 0 : 0.27 - 0.13 * lift, -0.23 + 0.16 * lift, -0.68 + 0.17 * lift)
          .applyQuaternion(camera.quaternion).add(camera.position);
        prop.quaternion.copy(camera.quaternion);
        if (book) prop.rotateX(0.42);
        if (lift) prop.rotateZ(0.18 * lift);
      } else {
        prop.visible = avatar.visible;
        if (hands) {
          placeAvatarProp(prop, hands, held, avatar.scale.x);
          prop.quaternion.copy(avatar.quaternion);
        } else if (!appearance) {
          const grip = poseMascotGrip(avatar, held, Boolean(seated), lift);
          grip.getWorldPosition(prop.position);
          grip.getWorldQuaternion(prop.quaternion);
        }
      }
      const size = (held === "cookie" ? Math.max(0.2, Math.sqrt(prop.userData.remaining ?? 1)) : 1);
      prop.scale.setScalar(size * (view === "firstPerson" ? 1 : avatar.scale.x));
      firstPersonGrip.scale.setScalar(1 / size);
    }
    const next = interactionInView();
    highlightInteraction(next);
    if (next !== nearby) {
      nearby = next;
      publishInteraction();
    }
    const zone = roomZoneAt(position.x, position.z, getRoom(), floorHeight);
    if (zone !== lastZone) { lastZone = zone; onPosition?.({ ...position, zone }); }
    if (realtime && !applyingServer && !seated) {
      realtime.connection.move({ x: position.x, y: floorHeight + jumpHeight, z: position.z, yaw, locomotion }, lastLocomotion !== locomotion && locomotion === "idle");
      lastLocomotion = locomotion;
    }
    render(moving);
  }

  const seatedTarget = { id: "current-seat", label: "일어서기", action: "space_seat_stand" };

  function move(forward, sideways, distance) {
    if (realtime && seated) { sharedCommand({ action: "STAND" }); return; }
    stand();
    const length = Math.hypot(forward, sideways) || 1;
    position = moveWalker(position, {
      x: (Math.sin(yaw) * forward + Math.cos(yaw) * sideways) * distance / length,
      z: (-Math.cos(yaw) * forward + Math.sin(yaw) * sideways) * distance / length
    }, getRoom());
  }

  function tick(time) {
    frame = 0;
    if (!acceptsInput() || !hasMotion() || disposed) return;
    if (time >= stepUntil) stepUntil = 0;
    const elapsed = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = time;
    const { x: beforeX, z: beforeZ } = position;
    const has = (code) => Number(keys.has(code));
    if (approaching) {
      const { approach } = approaching;
      const dx = approach.x - position.x, dz = approach.z - position.z;
      const remaining = Math.hypot(dx, dz);
      if (remaining < 0.025) {
        seated = approaching;
        approaching = null;
        position = approach;
        yaw = seated.yaw;
        pitch = -0.1;
      } else {
        yaw = Math.atan2(dx, -dz);
        const step = Math.min(1, PLAYER.speed * elapsed / remaining);
        const next = moveWalker(position, { x: dx * step, z: dz * step }, getRoom());
        if (Math.hypot(next.x - position.x, next.z - position.z) < 0.001) approaching = null;
        position = next;
      }
    }
    yaw += (has("ArrowRight") - has("ArrowLeft")) * elapsed * 1.7;
    const forward = has("KeyW") + has("ArrowUp") - has("KeyS") - has("ArrowDown");
    const sideways = has("KeyD") - has("KeyA");
    if (forward || sideways) {
      walkStep = undefined;
      move(forward, sideways, PLAYER.speed * elapsed * (sprintKeys.size ? 1.7 : 1));
    } else if (walkStep) {
      const distance = Math.min(walkStep.remaining, PLAYER.speed * elapsed);
      move(...walkStep.direction, distance);
      walkStep.remaining -= distance;
      if (walkStep.remaining <= 0 || (position.x === beforeX && position.z === beforeZ)) walkStep = undefined;
    }
    if (jumpVelocity || jumpHeight) {
      jumpHeight = Math.max(0, jumpHeight + jumpVelocity * elapsed - GRAVITY * elapsed ** 2 / 2);
      jumpVelocity = jumpHeight ? jumpVelocity - GRAVITY * elapsed : 0;
    }
    const distance = Math.hypot(position.x - beforeX, position.z - beforeZ);
    walkPhase += distance * 5 / PLAYER.speed;
    stride = distance > 0.001 ? Math.sin(walkPhase) : 0;
    syncCamera(keys.size > 0 || Boolean(approaching || walkStep) || jumpHeight > 0);
    if (hasMotion()) frame = requestAnimationFrame(tick);
    else lastTime = 0;
  }

  function onKeyDown(event) {
    if (!acceptsInput() || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target !== container && event.target !== container.querySelector("canvas")) return;
    if (event.key === "Escape") {
      if (menu) closeInteraction();
      pauseWalk();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) lockPointer();
      return;
    }
    if (event.code === "KeyE") {
      event.preventDefault();
      if (!event.repeat) interact();
      return;
    }
    if (event.code === "KeyR" && held) {
      event.preventDefault();
      if (!event.repeat) putAway();
      return;
    }
    if (realtime && event.code === "KeyG" && held) {
      event.preventDefault(); if (!event.repeat && portableDefinition(held)?.throwable) heldAction("THROW"); return;
    }
    if (realtime && event.code === "KeyH") {
      event.preventDefault(); if (!event.repeat) sharedCommand({ action: "EMOTE", kind: "wave" }); return;
    }
    if ((menu || seated) && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      if (!event.repeat) chooseInteraction(Number(event.key) - 1);
      return;
    }
    if (menu || approaching) return;
    if (SPRINT_KEYS.has(event.code)) { sprintKeys.add(event.code); return; }
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) jump();
    } else if (MOVEMENT_KEYS.has(event.code)) {
      startMoving(event);
    }
  }

  function startMoving(event) {
    event.preventDefault();
    if (event.repeat && !keys.has(event.code)) return;
    keys.add(event.code);
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function isPlayHudTarget(target) {
    if (target === document.body) return true;
    return Boolean(target.closest?.("button") && !target.closest("[contenteditable], [role='textbox']") &&
      container.closest(".space-studio")?.contains(target));
  }

  function onPlayHudKeyDown(event) {
    if (!playMode || !acceptsInput() || menu || approaching || event.defaultPrevented ||
      event.altKey || event.ctrlKey || event.metaKey || !isPlayHudTarget(event.target)) return;
    // Keep native button shortcuts and focus traversal available after a panel returns focus to the HUD.
    if (SPRINT_KEYS.has(event.code)) sprintKeys.add(event.code);
    if (WALK_KEYS.has(event.code)) startMoving(event);
  }

  function onFocusIn(event) {
    if (playMode && (keys.size || sprintKeys.size) && !container.contains(event.target) && !isPlayHudTarget(event.target)) stop();
  }
  function onKeyUp(event) {
    const wasPressed = sprintKeys.has(event.code) || keys.has(event.code);
    sprintKeys.delete(event.code);
    keys.delete(event.code);
    if (!hasMotion()) { cancelAnimationFrame(frame); frame = 0; lastTime = 0; stride = 0; if (wasPressed) syncCamera(); }
  }
  function look(dx, dy) {
    if (!dx && !dy) return;
    if (approaching) return;
    yaw += dx * 0.005;
    pitch = Math.max(-0.7, Math.min(1.1, pitch - dy * 0.004));
    syncCamera(true);
  }
  function onMouseLook(event) {
    if (!acceptsInput() && !(lookDuringFlight && lockingForVisit && !inputBlocked)) return;
    const locked = wantsPointerLock && document.pointerLockElement === container;
    const hovering = hoverLook && !pointer && event.target instanceof Node && container.contains(event.target);
    if (locked || hovering) look(event.movementX || 0, event.movementY || 0);
  }
  function visibility() {
    if (document.hidden) suspendWalk();
    else resumeWalkLook();
  }
  container.addEventListener("keydown", onKeyDown);
  container.addEventListener("keyup", onKeyUp);
  container.addEventListener("blur", onCanvasBlur);
  window.addEventListener("blur", suspendWalk);
  window.addEventListener("focus", resumeWalkLook);
  document.addEventListener("keydown", onPlayHudKeyDown);
  document.addEventListener("keyup", onKeyUp);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("pointerlockchange", handlePointerLockChange);
  document.addEventListener("pointerlockerror", handlePointerLockError);
  document.addEventListener("mousemove", onMouseLook);
  document.addEventListener("visibilitychange", visibility);
  onPointerLockChange?.(container.requestPointerLock ? "free" : "drag");

  return {
    camera, active,
    isMoving: hasMotion,
    setRealtime(value) {
      if (realtime && !value) { stand(); setHeld(null); heldItemId = null; serverEmote = null; sharedPose = "relaxed"; appliedEpoch = null; }
      if (realtime !== value) sharedAppearance = undefined;
      realtime = value;
    },
    applyRealtimeState(state) {
      const actor = state.participants.find((entry) => entry.memberId === state.selfId);
      if (!actor || !realtime) return;
      applyingServer = true;
      const reset = state.type === "ROOM_SNAPSHOT" || appliedEpoch !== state.roomEpoch || appliedRevision !== state.layoutRevision ||
        actor.seat?.assetId !== seated?.item?.id || actor.seat?.slot !== seated?.slot;
      const distance = Math.hypot(actor.position.x - position.x, actor.position.z - position.z);
      if (reset || (state.type === "MOVEMENT_FRAME" && distance > 1.25)) {
        approaching = null;
        walkStep = undefined;
        seated = actor.seat ? { ...actor.seat, item: getRoom()?.items.find((item) => item.id === actor.seat.assetId) } : null;
        position = { ...(actor.seat?.approach ?? actor.position) };
        yaw = actor.yaw;
        if (actor.locomotion !== "jumping") { jumpHeight = 0; jumpVelocity = 0; }
      }
      appliedRevision = state.layoutRevision; appliedEpoch = state.roomEpoch;
      heldItemId = actor.heldItemId;
      const sharedItem = state.items.find((item) => item.id === heldItemId);
      setHeld(sharedItem?.kind ?? null);
      if (prop) {
        prop.userData.remaining = sharedItem.remaining;
        const liquid = prop.getObjectByName("cup-liquid");
        if (liquid) liquid.position.y = 0.04 + sharedItem.remaining * 0.112;
      }
      sharedPose = actor.pose;
      if (reset) cupLiftAmount(cupLift, Boolean(seated && sharedPose === "drinking" && isCup(held)), performance.now(), true);
      serverEmote = actor.emote;
      avatarColor = actor.avatarColor;
      sharedAppearance = actor.avatarAppearance;
      if (menu) menu = { target: menu.target, choices: sharedInteractionTarget(menu.target, state)?.choices ?? [] };
      syncCamera(); publishInteraction();
      applyingServer = false;
      if (hasMotion() && !frame) frame = requestAnimationFrame(tick);
    },
    requestVisitPointerLock() {
      if (view === "front" && controlsEnabled) lockPointer(true);
    },
    setPlayerAppearance(value) {
      playerAppearance = readAvatarAppearance(value);
      if (active()) syncCamera();
    },
    setInputBlocked(blocked) {
      if (inputBlocked === blocked) return;
      inputBlocked = blocked;
      if (blocked) {
        pauseWalk();
        if (menu) { closeInteraction(); return; }
      }
      if (active()) syncCamera();
    },
    update(nextView, color, interactive = true, { preservePose = false, playing = false, allowFlightLook = false } = {}) {
      const wasActive = active();
      const enteringFromWeb = view === "front" && nextView === "firstPerson";
      const keepPose = preservePose && nextView !== "front" && hasWalkPose;
      if (nextView !== view || !interactive) {
        // The visit click authorizes the lock before the camera flight disables controls.
        if (lockingForVisit && (nextView === "front" || nextView === "firstPerson")) stop();
        else pauseWalk();
      }
      if (nextView === "firstPerson" && interactive) lockingForVisit = false;
      if (enteringFromWeb) visiting = true;
      else if (!WALK_VIEWS.has(nextView) && !keepPose) visiting = false;
      controlsEnabled = interactive;
      lookDuringFlight = allowFlightLook;
      playMode = playing;
      view = nextView;
      const room = getRoom();
      const template = `${room.template}:${room.version}`;
      if (!active() || !interactive || room.items !== furniture || enteringFromWeb) {
        const hadInteraction = menu || nearby || feedback || held;
        if (enteringFromWeb || (!keepPose && (!active() || room.items !== furniture))) { stand(); setHeld(null); }
        else if (seated && !room.items.includes(seated.item)) stand();
        if (hadInteraction) {
          menu = null;
          nearby = null;
          feedback = "";
          window.clearTimeout(feedbackTimer);
          publishInteraction();
        }
        if (room.items !== furniture && approaching) stop();
      }
      furniture = room.items;
      if (enteringFromWeb || (lastTemplate !== template && !keepPose)) {
        spawn();
        lastZone = undefined;
      }
      lastTemplate = template;
      avatarColor = color;
      if (!active()) {
        hasWalkPose = keepPose;
        if (avatar) avatar.visible = false;
        if (prop) prop.visible = false;
        highlightInteraction(null);
        return;
      }
      if (!isWalkablePosition(position, room)) { stand(); spawn(); }
      hasWalkPose = true;
      if (!wasActive) lastZone = undefined;
      syncCamera();
    },
    resize(width, height) { camera.aspect = width / height; camera.updateProjectionMatrix(); if (active()) syncCamera(); },
    chooseInteraction,
    command(action) {
      if (!acceptsInput()) return;
      if (action === "interact") { interact(); return; }
      if (action === "putAway") { putAway(); return; }
      if (action === "throw") { heldAction("THROW"); return; }
      if (action === "consume") { heldAction("CONSUME"); return; }
      if (action === "capture") { onCapture?.(); return; }
      if (action === "greet") { sharedCommand({ action: "EMOTE", kind: "wave" }); return; }
      if (action === "cancelInteraction") { closeInteraction(); return; }
      if (menu || approaching) return;
      if (action === "lockPointer") { lockPointer(); return; }
      if (action === "jump") { jump(); return; }
      const steps = { forward: [1, 0], backward: [-1, 0], left: [0, -1], right: [0, 1] };
      if (steps[action]) {
        if (realtime && !seated) {
          walkStep = { direction: steps[action], remaining: 0.8 };
          if (!frame) frame = requestAnimationFrame(tick);
          return;
        }
        const previous = position;
        move(...steps[action], 0.8);
        if (previous.x !== position.x || previous.z !== position.z) {
          stepUntil = performance.now() + 280;
          if (!frame) frame = requestAnimationFrame(tick);
        }
      }
      if (action === "turnLeft") yaw -= Math.PI / 9;
      if (action === "turnRight") yaw += Math.PI / 9;
      if (action === "lookUp") pitch = Math.min(1.1, pitch + 0.18);
      if (action === "lookDown") pitch = Math.max(-0.7, pitch - 0.18);
      if (action === "reset") { stop(); stand(); spawn(); }
      syncCamera(action !== "reset");
    },
    onDown(event) {
      if (!active()) return false;
      if (realtime && acceptsInput() && event.button === 0 && held && !menu && !approaching &&
        (pointerLocked || hoverLook)) {
        if (portableDefinition(held)?.consumable) { heldAction("CONSUME"); return true; }
        if (portableDefinition(held)?.camera) { onCapture?.(); return true; }
      }
      if (!acceptsInput() || menu || approaching || pointerLocked) return true;
      container.focus({ preventScroll: true });
      const target = event.button === 0 ? interactionAtPointer(event) : null;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, targetId: target?.id };
      event.currentTarget.setPointerCapture(event.pointerId);
      if (event.pointerType === "mouse" && !target) lockPointer();
      return true;
    },
    onMove(event) {
      if (!active()) return false;
      if (acceptsInput() && !pointerLocked && pointer?.id === event.pointerId) {
        const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
        if (pointer.targetId && Math.hypot(dx, dy) < 5) return true;
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        look(dx, dy);
      }
      return true;
    },
    onUp(event) {
      if (!active()) return false;
      const targetId = pointer?.id === event.pointerId ? pointer.targetId : null;
      if (pointer?.id === event.pointerId) pointer = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (targetId && event.type === "pointerup") {
        const target = interactionAtPointer(event);
        if (target?.id === targetId) interact(target);
      }
      return true;
    },
    dispose() {
      disposed = true;
      window.clearTimeout(feedbackTimer);
      pauseWalk();
      setHeld(null);
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("keyup", onKeyUp);
      container.removeEventListener("blur", onCanvasBlur);
      window.removeEventListener("blur", suspendWalk);
      window.removeEventListener("focus", resumeWalkLook);
      document.removeEventListener("keydown", onPlayHudKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
      document.removeEventListener("pointerlockerror", handlePointerLockError);
      document.removeEventListener("mousemove", onMouseLook);
      document.removeEventListener("visibilitychange", visibility);
      disposeAvatar();
      if (targetOutline) disposeObject(targetOutline);
    }
  };
}
