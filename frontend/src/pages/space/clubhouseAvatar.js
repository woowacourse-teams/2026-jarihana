import { MathUtils } from "three";

const WALK_AVATAR_SCALE = 0.82;
const CARRY_POSE = { rightArm: -0.18, rightElbow: -1.10, rightSpread: -0.18, rightGrip: 0.65 };
const BOOK_POSE = { ...CARRY_POSE, leftArm: -0.18, leftElbow: -1.10, leftSpread: 0.18, leftGrip: 0.65 };
// Keep the prop center 0.12 in front of the mouth; the taller cup needs a lower hand.
const EAT_POSE = { rightArm: -1.68052, rightElbow: -0.51371, rightSpread: -0.46025 };
const DRINK_POSE = { rightArm: -1.19627, rightElbow: -0.87650, rightSpread: -0.55297 };

export function drawClubhouseAvatar(characters, index, appearance, position, scale, yaw,
  { seated, locomotion, stride, held, lift, consume = 0, greeting, time }) {
  const running = locomotion === "running";
  const jumping = locomotion === "jumping";
  const consumePose = held === "cookie" ? EAT_POSE : DRINK_POSE;
  const showAppearance = held && appearance.handheld !== "none" ? { ...appearance, handheld: "none" } : appearance;
  return characters.draw(index, { appearance: showAppearance }, position, scale * WALK_AVATAR_SCALE, {
    seated: Number(seated),
    stride: jumping ? 0 : stride,
    stepLift: running ? 0.10 : 0,
    forwardLean: running ? 0.12 : 0,
    leftKick: jumping ? 0.23 : 0,
    rightKick: jumping ? 0.43 : 0,
    ...(greeting && { leftArm: -0.9, leftElbow: -1.35, leftSpread: -0.60 + Math.sin(time / 140) * 0.28 }),
    ...(held === "book" ? BOOK_POSE : held ? CARRY_POSE : {}),
    ...(lift > 0 && {
      rightArm: MathUtils.lerp(CARRY_POSE.rightArm, -0.94, lift),
      rightElbow: MathUtils.lerp(CARRY_POSE.rightElbow, -1.90, lift),
      rightSpread: MathUtils.lerp(CARRY_POSE.rightSpread, -0.45, lift),
      ...(consume > 0 && {
        rightArm: MathUtils.lerp(MathUtils.lerp(CARRY_POSE.rightArm, -0.94, lift), consumePose.rightArm, consume),
        rightElbow: MathUtils.lerp(MathUtils.lerp(CARRY_POSE.rightElbow, -1.90, lift), consumePose.rightElbow, consume),
        rightSpread: MathUtils.lerp(MathUtils.lerp(CARRY_POSE.rightSpread, -0.45, lift), consumePose.rightSpread, consume),
      }),
    }),
  }, yaw);
}

export function placeAvatarProp(prop, hands, held, scale) {
  prop.position.copy(hands.rightHand);
  if (held === "book") prop.position.lerp(hands.leftHand, 0.5);
  prop.position.y += 0.04 * scale;
  prop.parent.worldToLocal(prop.position);
}
