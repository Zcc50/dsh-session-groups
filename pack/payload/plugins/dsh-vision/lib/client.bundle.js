// dsh-vision — 浏览器端 bundle（手写 __ModuleLoader__ 格式，无需构建）
// 提供：conversation.input.left 的「📷 识图」按钮（点击选图 / 拖拽）+ 捕获阶段粘贴拦截
// 图片字节经 fetch POST /api/vision-paste 落盘，路径写入输入框 draft。
window.__ModuleLoader__.load({
	id: "dsh-vision",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		function base64FromBytes(bytes) {
			const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
			let out = "";
			let i = 0;
			for (; i + 3 <= bytes.length; i += 3) {
				const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
				out += CH[(n >> 18) & 63] + CH[(n >> 12) & 63] + CH[(n >> 6) & 63] + CH[n & 63];
			}
			const rem = bytes.length - i;
			if (rem === 1) {
				const n = bytes[i] << 16;
				out += CH[(n >> 18) & 63] + CH[(n >> 12) & 63] + "==";
			} else if (rem === 2) {
				const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
				out += CH[(n >> 18) & 63] + CH[(n >> 12) & 63] + CH[(n >> 6) & 63] + "=";
			}
			return out;
		}

		function saveImage(file, actions, draft) {
			if (!file || !actions) return;
			if (!/^image\//.test(file.type)) {
				console.log("[dsh-vision] 非图片文件：" + file.type);
				return;
			}
			file.arrayBuffer().then((buf) => {
				const payload = {
					name: file.name || "pasted.png",
					base64: base64FromBytes(new Uint8Array(buf)),
				};
				return fetch("/api/vision-paste", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
			}).then((res) => res.json()).then((result) => {
				if (result && result.path) {
					const prefix = draft && draft.trim() ? draft + "\n" : "";
					actions.setDraft(prefix + "请识别这张图片：" + result.path);
				} else {
					console.error("[dsh-vision] 保存失败：" + JSON.stringify(result));
				}
			}).catch((e) => {
				console.error("[dsh-vision] 保存失败：" + String((e && e.message) || e));
			});
		}

		const plugin = {
			name: "dsh-vision",
			inject: ["slots"],
			apply(ctx) {
				injectMarkerStyles();
				const slots = ctx.get("slots");
				if (slots === undefined) return;
				let latestActions = null;
				let latestDraft = "";

				// 全局粘贴拦截：捕获阶段先于输入框自身处理，把剪贴板图片改道落盘
				ctx.effect(() => {
					const onPaste = (e) => {
						const items = (e.clipboardData && e.clipboardData.items)
							? Array.prototype.slice.call(e.clipboardData.items)
							: [];
						const imgItem = items.find((it) => it.kind === "file" && /^image\//.test(it.type));
						const file = imgItem
							? imgItem.getAsFile()
							: ((e.clipboardData && e.clipboardData.files && e.clipboardData.files[0]) || null);
						if (!file || !/^image\//.test(file.type)) return;
						e.preventDefault();
						e.stopPropagation();
						saveImage(file, latestActions, latestDraft);
					};
					document.addEventListener("paste", onPaste, true);
					return () => document.removeEventListener("paste", onPaste, true);
				});

				/** 变色动画样式（复刻工作区美化插件 SessionMarker 的 exit / enter 两段式）。 */
				function injectMarkerStyles() {
					if (typeof document === "undefined" || document.querySelector("style[data-dsh-vision-marker]")) return;
					const style = document.createElement("style");
					style.setAttribute("data-dsh-vision-marker", "1");
					style.textContent = [
						".dsh-vision-marker-enter{animation:dsh-vision-spin 1s ease-out}",
						".dsh-vision-marker-exit{animation:dsh-vision-spin-out 1s ease-in}",
						".dsh-vision-marker-sweep{stroke-dasharray:var(--dsh-vision-arc,19) var(--dsh-vision-arc,19);animation:dsh-vision-fill 1s ease-out}",
						".dsh-vision-marker-exit-sweep{stroke-dasharray:var(--dsh-vision-arc,19) var(--dsh-vision-arc,19);animation:dsh-vision-fill-out 1s ease-in}",
						"@keyframes dsh-vision-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}",
						"@keyframes dsh-vision-spin-out{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}",
						"@keyframes dsh-vision-fill{from{stroke-dasharray:0 var(--dsh-vision-arc,19)}}",
						"@keyframes dsh-vision-fill-out{from{stroke-dasharray:var(--dsh-vision-arc,19) var(--dsh-vision-arc,19)}to{stroke-dasharray:0 var(--dsh-vision-arc,19)}}",
						"@media (prefers-reduced-motion:reduce){.dsh-vision-marker-enter,.dsh-vision-marker-exit,.dsh-vision-marker-sweep,.dsh-vision-marker-exit-sweep{animation:none}}",
					].join("\n");
					document.head.appendChild(style);
				}

				/**
				 * 会话行首的双层环（复刻工作区美化插件 SessionMarker 的环部分，去掉箭头）。
				 * 外环 r7/stroke2.5、内弧 r4/stroke1.25、四个端点小圆点；默认 muted + accent 双色。
				 * hover 变色沿用原动画：旧色弧收缩旋转 1s → 新色弧扫入旋转 1s。
				 */
				function SessionMarkerIcon(props) {
					const hovered = props.hovered === true;
					const RED = "#d93025";
					const stateKey = hovered ? "red" : "default";
					const firstRender = react.useRef(true);
					const prevState = react.useRef(stateKey);
					const timers = react.useRef({ out: 0, in: 0 });
					const [anim, setAnim] = react.useState({ phase: "idle", color: stateKey });
					react.useEffect(() => {
						if (firstRender.current) {
							firstRender.current = false;
							prevState.current = stateKey;
							return undefined;
						}
						if (prevState.current === stateKey) return undefined;
						const previous = prevState.current;
						prevState.current = stateKey;
						window.clearTimeout(timers.current.out);
						window.clearTimeout(timers.current.in);
						setAnim({ phase: "exit", color: previous });
						timers.current.out = window.setTimeout(() => {
							setAnim({ phase: "enter", color: stateKey });
							timers.current.in = window.setTimeout(() => {
								setAnim({ phase: "idle", color: stateKey });
							}, 1000);
						}, 1000);
						return undefined;
					}, [stateKey]);
					react.useEffect(() => () => {
						window.clearTimeout(timers.current.out);
						window.clearTimeout(timers.current.in);
					}, []);

					const phase = anim.phase;
					const isRed = anim.color === "red";
					const muted = isRed ? RED : "var(--dsw-alias-label-tertiary,#a39d92)";
					const accent = isRed ? RED : "var(--dsw-alias-brand-primary,#d97757)";
					const dotCx = 13, dotCy = 15, outerR = 7, innerR = 4;
					const outerSpan = 78, innerSpan = 63;
					const p = (value) => value.toFixed(2);
					const polar = (r, deg) => {
						const a = (deg * Math.PI) / 180;
						return [dotCx + r * Math.cos(a), dotCy + r * Math.sin(a)];
					};
					const arcPath = (r, startDeg, endDeg) => {
						const [x1, y1] = polar(r, startDeg);
						const [x2, y2] = polar(r, endDeg);
						return "M" + p(x1) + " " + p(y1) + "A" + r + " " + r + " 0 0 1 " + p(x2) + " " + p(y2);
					};
					const dots = [];
					[315 - innerSpan, 315 + innerSpan, 135 - innerSpan, 135 + innerSpan].forEach((deg, i) => {
						const [x, y] = polar(innerR, deg);
						dots.push(react.createElement("circle", {
							key: "dot" + i, cx: p(x), cy: p(y), r: 0.7,
							fill: "none", stroke: i < 2 ? muted : accent, strokeWidth: 0.45,
						}));
					});
					const outerArcLen = (2 * Math.PI * outerR * outerSpan * 2) / 360;
					const innerArcLen = (2 * Math.PI * innerR * innerSpan * 2) / 360;
					const spinClass = phase === "exit"
						? "dsh-vision-marker-exit"
						: (phase === "enter" ? "dsh-vision-marker-enter" : undefined);
					const sweepClass = phase === "exit"
						? "dsh-vision-marker-exit-sweep"
						: (phase === "enter" ? "dsh-vision-marker-sweep" : undefined);
					const sweepStyle = (len) => (phase === "idle" ? undefined : { "--dsh-vision-arc": len.toFixed(2) + "px" });
					return react.createElement("svg", {
						width: 20, height: 20, viewBox: "4.75 6.75 16.5 16.5",
						"aria-hidden": "true", style: { display: "block", flex: "0 0 auto" },
					}, [
						react.createElement("g", {
							key: "ring-" + phase + "-" + anim.color,
							className: spinClass,
							style: { transformOrigin: "13px 15px" },
						}, [
							react.createElement("path", { key: "outerMuted", d: arcPath(outerR, 225 - outerSpan, 225 + outerSpan), fill: "none", stroke: muted, strokeWidth: 2.5, strokeLinecap: "butt", className: sweepClass, style: sweepStyle(outerArcLen) }),
							react.createElement("path", { key: "outerAccent", d: arcPath(outerR, 45 - outerSpan, 45 + outerSpan), fill: "none", stroke: accent, strokeWidth: 2.5, strokeLinecap: "butt", className: sweepClass, style: sweepStyle(outerArcLen) }),
							react.createElement("path", { key: "innerMuted", d: arcPath(innerR, 315 - innerSpan, 315 + innerSpan), fill: "none", stroke: muted, strokeWidth: 1.25, strokeLinecap: "round", className: sweepClass, style: sweepStyle(innerArcLen) }),
							react.createElement("path", { key: "innerAccent", d: arcPath(innerR, 135 - innerSpan, 135 + innerSpan), fill: "none", stroke: accent, strokeWidth: 1.25, strokeLinecap: "round", className: sweepClass, style: sweepStyle(innerArcLen) }),
							...dots,
						]),
					]);
				}

				function VisionPasteButton(props) {
					latestActions = props.inputActions;
					const input = props.input;
					latestDraft = (input && (input.text ?? input.draft ?? input.value)) || "";
					const inputRef = react.useRef ? react.useRef(null) : { current: null };
					const [hovered, setHovered] = react.useState(false);
					return react.createElement("div", {
						style: { display: "inline-flex", alignItems: "center", gap: 4, marginRight: 6 },
						title: "选择或拖入图片（也可直接 Cmd/Ctrl+V 粘贴截图），自动落盘并填入路径",
						onDragOver: (e) => { e.preventDefault(); },
						onDrop: (e) => {
							e.preventDefault();
							if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
								saveImage(e.dataTransfer.files[0], latestActions, latestDraft);
							}
						},
					}, [
						react.createElement("button", {
							key: "btn",
							style: {
								cursor: "pointer", border: "1px solid #ccc", borderRadius: 6,
								background: "#fff", padding: "2px 8px", fontSize: 13,
								color: "#1B4B82", lineHeight: "20px",
								display: "inline-flex", alignItems: "center", gap: 5,
							},
							onMouseEnter: () => setHovered(true),
							onMouseLeave: () => setHovered(false),
							onClick: () => { if (inputRef.current) inputRef.current.click(); },
						}, [
							react.createElement(SessionMarkerIcon, { key: "icon", hovered: hovered }),
							react.createElement("span", { key: "label" }, "识图"),
						]),
						react.createElement("input", {
							key: "file",
							ref: inputRef,
							type: "file",
							accept: "image/*",
							style: { display: "none" },
							onChange: (e) => {
								const f = e.target.files && e.target.files[0];
								if (f) saveImage(f, latestActions, latestDraft);
								e.target.value = "";
							},
						}),
					]);
				}

				slots.inject("conversation.input.left", () => slots.register(
					{ name: "conversation.input.left", id: "dsh-vision-paste-button", order: 10 },
					(props) => react.createElement(VisionPasteButton, props),
				));
			},
		};

		exports.default = plugin;
		return exports;
	}
});
