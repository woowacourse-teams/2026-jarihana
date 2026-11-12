import * as THREE from "three";
import { createWalkingCharacters } from "../../../public/sparring-arena/src/walking-characters.js";
import { drawClubhouseAvatar, placeAvatarProp } from "./clubhouseAvatar.js";
import { getRoomLayout } from "./roomLayout.js";
import { animateMascot, createMascot, createWalkProp, disposeObject, poseMascotGrip, walkPropBaseOffset } from "./roomModels.js";
import { createCupLift, cupLiftAmount, isCup } from "./cupLift.js";
import { fitSeatedAvatar } from "./seatedAvatar.js";

export function thrownItemPosition(item, now) {
  if (item.location !== "THROWN" || !item.velocity || item.startedAt === null) return item.position;
  const elapsed = Math.max(0, Math.min(3, (now - item.startedAt) / 1000));
  return { x: item.position.x + item.velocity.x * elapsed,
    y: Math.max(0.08, item.position.y + item.velocity.y * elapsed - 9 * elapsed * elapsed),
    z: item.position.z + item.velocity.z * elapsed };
}

function nameLabel(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 80;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = "500 36px sans-serif"; context.textAlign = "center";
  context.lineWidth = 7; context.strokeStyle = "rgba(255,255,255,0.9)"; context.fillStyle = "#343440";
  context.strokeText(name, 256, 50, 490); context.fillText(name, 256, 50, 490);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.position.y = 1.85; sprite.scale.set(2.1, 0.33, 1);
  return sprite;
}

export function createRemotePlayers(scene, render, getRoom = () => null, prepareAvatarMaterial = () => {}) {
  const layer = new THREE.Group();
  layer.name = "room-realtime-participants";
  scene.add(layer);
  const players = new Map();
  const objects = new Map();
  let characters;
  let avatarCapacity = 0;
  let drawnAvatars = 0;
  let store;
  let speechMessages = [];
  let makeSpeech;
  let frame = 0;
  let animateUntil = 0;
  let disposed = false;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  function remove(map, id) { const entry = map.get(id); if (entry) disposeObject(entry.model); map.delete(id); }
  function refresh() {
    if (!store) return;
    const state = store.getState();
    const visiblePlayers = state.participants.filter((actor) => actor.memberId !== state.selfId);
    const ids = new Set(visiblePlayers.map((actor) => actor.memberId));
    for (const id of players.keys()) if (!ids.has(id)) remove(players, id);
    const itemMap = new Map(state.items.map((item) => [item.id, item]));
    for (const actor of visiblePlayers) {
      const held = itemMap.get(actor.heldItemId)?.kind ?? null;
      const greeting = actor.emote?.expiresAt > store.serverNow();
      const heldRemaining = itemMap.get(actor.heldItemId)?.remaining ?? 1;
      const speech = speechMessages.find((message) => String(message.memberId) === actor.memberId);
      const personalized = Boolean(actor.avatarAppearance);
      const appearance = JSON.stringify([actor.avatarColor, actor.avatarAppearance, actor.displayName, Boolean(actor.seat), held, !personalized && greeting, speech]);
      if (players.get(actor.memberId)?.appearance === appearance) continue;
      const previous = players.get(actor.memberId);
      const cupLift = previous?.held === held && previous.seated === Boolean(actor.seat) ? previous.cupLift : createCupLift();
      if (!previous) cupLiftAmount(cupLift, Boolean(actor.seat && actor.pose === "drinking" && isCup(held)), performance.now(), true);
      remove(players, actor.memberId);
      const model = personalized ? new THREE.Group()
        : createMascot({ color: actor.avatarColor, pose: actor.seat ? "seated" : greeting ? "greeting" : "standing", held });
      if (!personalized) model.traverse((object) => prepareAvatarMaterial(object.material));
      model.name = `remote-player-${actor.memberId}`;
      const label = nameLabel(actor.displayName);
      if (label) model.add(label);
      if (speech && makeSpeech) model.add(makeSpeech(speech));
      const prop = held ? createWalkProp(held, actor.avatarColor) : null;
      if (prop) {
        const grip = prop.getObjectByName("first-person-grip");
        if (grip) grip.visible = false;
        prop.name = "shared-held-prop";
        if (held === "cookie") prop.scale.setScalar(Math.max(0.2, Math.sqrt(heldRemaining)));
        const liquid = prop.getObjectByName("cup-liquid");
        if (liquid) liquid.position.y = 0.04 + heldRemaining * 0.112;
        (personalized ? model : model.getObjectByName("mascot-held-anchor")).add(prop);
      }
      layer.add(model); players.set(actor.memberId, { model, appearance, prop, held, seated: Boolean(actor.seat), cupLift });
    }
    const avatarCount = visiblePlayers.filter((actor) => actor.avatarAppearance).length;
    if (avatarCount > avatarCapacity) {
      characters?.dispose();
      avatarCapacity = Math.max(4, avatarCount, avatarCapacity * 2);
      characters = createWalkingCharacters(layer, avatarCapacity, { lightweight: true });
      for (const mesh of characters.pickMeshes) prepareAvatarMaterial(mesh.material);
      drawnAvatars = 0;
    }
    const visibleItems = state.items.filter((item) => ["WORLD", "SURFACE", "THROWN"].includes(item.location));
    const itemIds = new Set(visibleItems.map((item) => item.id));
    for (const id of objects.keys()) if (!itemIds.has(id)) remove(objects, id);
    for (const item of visibleItems) {
      if (objects.get(item.id)?.kind === item.kind) continue;
      remove(objects, item.id);
      const model = createWalkProp(item.kind, "#536bd6");
      model.name = `shared-item-${item.id}`;
      const grip = model.getObjectByName("first-person-grip");
      if (grip) grip.visible = false;
      layer.add(model); objects.set(item.id, { model, kind: item.kind });
    }
    animateUntil = performance.now() + 250;
    if (!frame) frame = requestAnimationFrame(animate);
  }
  function animate(time) {
    frame = 0;
    if (disposed || !store) return;
    const state = store.getState();
    const serverNow = store.serverNow();
    const room = getRoom();
    const itemById = new Map(state.items.map((item) => [item.id, item]));
    let active = time < animateUntil;
    let avatarIndex = 0;
    for (const actor of state.participants) {
      const entry = players.get(actor.memberId);
      if (!entry) continue;
      const sampled = store.interpolate(actor.memberId) ?? actor;
      const furniture = actor.seat && room?.items.find((asset) => asset.id === actor.seat.assetId);
      const fit = actor.seat ? fitSeatedAvatar(furniture, actor.seat) : null;
      const position = fit?.position ?? sampled.position;
      entry.model.position.set(position.x, position.y, position.z);
      entry.model.scale.setScalar(fit?.scale ?? 1);
      entry.model.rotation.y = Math.PI - (actor.seat?.yaw ?? sampled.yaw);
      const locomotion = actor.seat ? "idle" : sampled.locomotion;
      const greeting = actor.emote?.expiresAt > serverNow;
      const raised = Boolean(actor.seat && actor.pose === "drinking" && isCup(entry.held));
      const amount = cupLiftAmount(entry.cupLift, raised, time, reduceMotion?.matches);
      if (actor.avatarAppearance) {
        const moving = locomotion === "walking" || locomotion === "running";
        const phase = serverNow * (locomotion === "running" ? 0.009 : 0.006);
        const hands = drawClubhouseAvatar(characters, avatarIndex++, actor.avatarAppearance,
          entry.model.position, entry.model.scale.x, entry.model.rotation.y, {
            seated: Boolean(actor.seat), locomotion, stride: moving ? Math.sin(phase) : 0,
            held: entry.held, lift: amount, greeting, time: serverNow,
          });
        if (entry.prop) placeAvatarProp(entry.prop, hands, entry.held, entry.model.scale.x);
      } else {
        animateMascot(entry.model, locomotion, serverNow);
        if (entry.prop) poseMascotGrip(entry.model, entry.held, Boolean(actor.seat), amount);
      }
      if (entry.prop) {
        const remaining = itemById.get(actor.heldItemId)?.remaining ?? 1;
        if (entry.held === "cookie") entry.prop.scale.setScalar(Math.max(0.2, Math.sqrt(remaining)));
        const liquid = entry.prop.getObjectByName("cup-liquid");
        if (liquid) liquid.position.y = 0.04 + remaining * 0.112;
        active ||= time < entry.cupLift.until;
      }
      if (greeting) {
        const hand = entry.model.getObjectByName("greeting-hand");
        if (hand) hand.rotation.z = 0.21 + Math.sin(serverNow / 140) * 0.35;
        active = true;
      } else if (actor.emote && entry.model.getObjectByName("greeting-hand")) refresh();
    }
    for (let index = avatarIndex; index < drawnAvatars; index++) characters.hide(index);
    drawnAvatars = avatarIndex;
    for (const item of state.items) {
      const entry = objects.get(item.id);
      if (!entry) continue;
      const position = thrownItemPosition(item, serverNow);
      const furniture = item.location === "SURFACE" ? room?.items.find((asset) => asset.id === item.assetId) : null;
      const fit = furniture ? Math.min(1, furniture.scaleX ?? 1, furniture.scaleY ?? 1, furniture.scaleZ ?? 1) : 1;
      const size = fit * (item.kind === "cookie" ? Math.max(0.2, Math.sqrt(item.remaining)) : 1);
      const baseOffset = item.location === "THROWN" ? 0 : walkPropBaseOffset(item.kind) * size;
      entry.model.position.set(position.x, position.y + baseOffset, position.z);
      entry.model.rotation.y = (furniture?.rotation ?? 0) * Math.PI / 2;
      entry.model.scale.setScalar(size);
      const liquid = entry.model.getObjectByName("cup-liquid");
      if (liquid) liquid.position.y = 0.04 + item.remaining * 0.112;
      active ||= item.location === "THROWN";
    }
    render();
    if (active && !frame) frame = requestAnimationFrame(animate);
  }
  return {
    setSpeech(messages, factory) { speechMessages = messages; makeSpeech = factory; refresh(); },
    setVisible(value) { layer.visible = value; },
    setStore(next) {
      store = next;
      if (!store) {
        for (const id of players.keys()) remove(players, id);
        for (const id of objects.keys()) remove(objects, id);
        for (let index = 0; index < drawnAvatars; index++) characters.hide(index);
        drawnAvatars = 0;
      }
      refresh();
    },
    refresh,
    targets() {
      if (!store) return [];
      const room = getRoom();
      const mezzanine = room ? getRoomLayout(room).mezzanine?.height : undefined;
      return store.getState().items.filter((item) => ["WORLD", "SURFACE"].includes(item.location)).map((item) => {
        const furniture = item.location === "SURFACE" ? room?.items.find((asset) => asset.id === item.assetId) : null;
        return ({
        id: `shared-${item.id}`, itemId: item.id, x: item.position.x, z: item.position.z,
        floor: (furniture ? furniture.level === 1 : item.position.y >= mezzanine - 0.2) ? mezzanine ?? 0 : 0,
        minY: item.position.y - 0.1, maxY: item.position.y + 0.35,
        width: 0.45, depth: 0.45, label: "물건 집기", action: "space_item_pick_up", sharedItem: true
        });
      });
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      characters?.dispose();
      disposeObject(layer);
      players.clear();
      objects.clear();
    }
  };
}
