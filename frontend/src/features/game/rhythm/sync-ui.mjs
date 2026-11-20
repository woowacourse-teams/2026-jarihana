import { CalibrationRun, SYNC_CONFIG } from "./calibration.mjs";
import { CalibrationMetronome } from "./audio.mjs";

const signed = (value) => (value > 0 ? "+" : "") + value + "ms";

export class SyncCalibrationUI {
  constructor({ document, createContext, beforeOpen, getOffset, applyOffset, signal }) {
    this.document = document;
    this.createContext = createContext;
    this.beforeOpen = beforeOpen;
    this.getOffset = getOffset;
    this.applyOffset = applyOffset;
    this.$ = (id) => document.getElementById(id);
    this.dialog = this.$("sync-dialog");
    this.generation = 0;
    this.audio = null;
    this.starting = false;
    this.result = null;
    const listen = (element, type, handler) => element.addEventListener(type, handler, { signal });
    listen(this.$("sync-open"), "click", () => this.open());
    listen(this.$("sync-start"), "click", () =>
      this.audio || this.starting
        ? this.cancel("측정을 중단했어요. 다시 시작할 수 있어요.")
        : this.start()
    );
    listen(this.$("sync-close"), "click", () => this.close());
    listen(this.dialog, "cancel", (event) => {
      event.preventDefault();
      this.close();
    });
    listen(this.dialog, "close", () => this.cancel());
    listen(this.$("sync-apply"), "click", () => this.apply());
    listen(this.$("sync-tap"), "pointerdown", (event) => {
      if (event.button > 0) return;
      event.preventDefault();
      this.$("sync-tap").focus({ preventScroll: true });
      this.tap(event.timeStamp);
    });
    listen(this.$("sync-tap"), "click", (event) => {
      if (event.detail === 0) this.tap(event.timeStamp);
    });
    listen(this.$("sync-volume"), "input", () => {
      const volume = Number(this.$("sync-volume").value);
      this.$("sync-volume-value").textContent = volume + "%";
      if (this.audio) {
        this.audio.master.gain.value = volume / 100;
        if (volume === 0)
          this.cancel("소리가 꺼져 측정을 중단했어요. 진단 음량을 올린 뒤 다시 시작해요.");
      }
    });
  }

  get isOpen() {
    return this.dialog.open;
  }
  get isMeasuring() {
    return Boolean(this.audio || this.starting);
  }

  async open() {
    if (this.isOpen) return;
    if (!(await this.beforeOpen()) || this.isOpen) return;
    this.cancel();
    this.$("sync-result").hidden = true;
    this.$("sync-progress").value = 0;
    this.$("sync-count").textContent = "0 / 20";
    this.$("sync-current").textContent = signed(this.getOffset());
    this.$("sync-status").textContent =
      `${SYNC_CONFIG.bpm} BPM 클릭음을 ${SYNC_CONFIG.warmup}박 들은 뒤, ${SYNC_CONFIG.beats}박에 맞춰 눌러요.`;
    this.dialog.showModal();
    this.$("sync-start").focus();
  }

  close() {
    this.cancel();
    this.dialog.close();
    this.$("sync-open").focus({ preventScroll: true });
  }

  cancel(message) {
    this.generation++;
    this.audio?.stop();
    this.audio = null;
    this.starting = false;
    this.result = null;
    this.run = null;
    this.lastFrame = undefined;
    this.$("sync-tap").disabled = true;
    this.$("sync-apply").disabled = true;
    this.$("sync-start").textContent = "측정 시작";
    if (message) {
      this.$("sync-status").textContent = message;
      this.$("sync-result").hidden = true;
    }
  }

  async start() {
    const volume = Number(this.$("sync-volume").value);
    if (volume <= 0) {
      this.$("sync-status").textContent = "진단 음량을 올린 뒤 시작해요.";
      return;
    }
    this.cancel();
    this.$("sync-result").hidden = true;
    this.$("sync-progress").value = 0;
    this.$("sync-count").textContent = "0 / 20";
    const generation = this.generation;
    this.starting = true;
    this.$("sync-start").textContent = "측정 중단";
    this.$("sync-status").textContent = "클릭음을 준비하고 있어요.";
    try {
      const audio = new CalibrationMetronome(this.createContext());
      this.audio = audio;
      const started = await audio.start(SYNC_CONFIG, volume);
      if (!started || generation !== this.generation) return;
      this.starting = false;
      this.run = new CalibrationRun();
      this.$("sync-tap").disabled = false;
      this.$("sync-tap").focus({ preventScroll: true });
      this.$("sync-status").textContent = "준비 4박, 먼저 클릭음을 들어요.";
    } catch {
      if (generation === this.generation)
        this.cancel("진단 소리를 재생하지 못했어요. 다시 시작해요.");
    }
  }

  handleKey(event) {
    const tag = event.target?.tagName;
    if (
      ["INPUT", "SELECT", "TEXTAREA"].includes(tag) ||
      (tag === "BUTTON" && event.target !== this.$("sync-tap"))
    )
      return;
    const key = event.code || event.key;
    if (
      ![
        "Space",
        " ",
        "Enter",
        "ArrowLeft",
        "ArrowDown",
        "ArrowRight",
        "ArrowUp",
        "KeyA",
        "KeyS",
        "KeyD",
        "KeyW"
      ].includes(key) &&
      !["a", "s", "d", "w"].includes(event.key?.toLowerCase())
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat && !event.isComposing) this.tap(event.timeStamp);
  }

  tap(stamp) {
    if (!this.audio || this.starting || !this.run) return;
    this.run.tap(this.audio.timeAt(stamp));
    const count = this.run.samples.size;
    this.$("sync-progress").value = count;
    this.$("sync-count").textContent = count + " / 20";
  }

  tick(stamp) {
    if (!this.audio || this.starting) return;
    if (this.lastFrame !== undefined && stamp - this.lastFrame > 750) {
      this.lastFrame = stamp;
      this.cancel("화면이 잠시 멈춰 측정을 중단했어요. 다시 측정해요.");
      return;
    }
    this.lastFrame = stamp;
    if (this.audio.context.state !== "running") {
      this.cancel("소리 재생이 중단됐어요. 다시 측정해요.");
      return;
    }
    const time = this.audio.timeAt();
    if (time >= this.run.endAt) {
      this.complete();
      return;
    }
    if (time >= this.run.measureStart - SYNC_CONFIG.window) {
      const message = "측정 중, 화면 대신 클릭음에 맞춰 일정하게 눌러요.";
      if (this.$("sync-status").textContent !== message)
        this.$("sync-status").textContent = message;
    }
  }

  complete() {
    this.result = this.run.result();
    this.audio.stop();
    this.audio = null;
    this.$("sync-tap").disabled = true;
    this.$("sync-start").textContent = "다시 측정";
    this.$("sync-result").hidden = false;
    const result = this.result;
    this.$("sync-samples").textContent = result.used + " / " + result.total;
    this.$("sync-recommendation").textContent = result.reliable
      ? signed(result.offset)
      : "재측정 필요";
    this.$("sync-spread").textContent =
      result.spread === undefined ? "측정 부족" : result.spread + "ms";
    this.$("sync-apply").disabled = !result.reliable;
    this.$("sync-status").textContent = result.reliable
      ? "측정이 끝났어요. 추천값을 적용한 뒤 게임에서 확인해요."
      : result.reason === "few"
        ? "입력이 부족해요. 준비 4박 뒤에 한 박마다 한 번씩 눌러 다시 측정해요."
        : result.reason === "range"
          ? "측정값 " +
            signed(result.offset) +
            "는 보정 범위 ±150ms 밖이에요. 클릭음에 맞춰 다시 측정하거나 연결 기기를 확인해요."
          : "입력 간 차이나 중복 입력이 커요. 한 박에 한 번씩 눌러 다시 측정해요.";
    this.$("sync-start").focus();
  }

  apply() {
    if (!this.result?.reliable) return;
    const value = this.result.offset;
    const saved = this.applyOffset(value);
    this.$("sync-current").textContent = signed(value);
    this.$("sync-status").textContent = saved
      ? signed(value) + " 적용 완료. 이 브라우저에 저장했어요."
      : signed(value) + " 적용 완료. 새로고침하면 다시 맞춰야 해요.";
    this.$("sync-apply").disabled = true;
    this.$("sync-close").focus({ preventScroll: true });
  }
}
