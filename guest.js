const E = (t, p = {}, ...k) => {
    const e = document.createElement(t);
    return Object.assign(e, p), e.append(...k), e;
}, B = (t, f, c = "") => E("button", {
    textContent: t,
    onclick: f,
    className: c
}), uid = () => Math.random().toString(36).slice(2, 9), ls = {
    g(k, d) {
        try {
            return JSON.parse(localStorage.getItem(k)) ?? d;
        } catch {
            return d;
        }
    },
    s(k, v) {
        try {
            localStorage.setItem(k, JSON.stringify(v));
        } catch {}
    }
};

let boardThemeScope = "guest", activeShareToken = null, cleanup = () => {};

const applyTheme = () => {
    document.documentElement.dataset.theme = "beige";
}, eventUrl = async url => url, getBoardRuntime = async () => null, syncStates = new Map, main = () => document.querySelector("#main"), go = async fn => {
    cleanup(), cleanup = () => {}, main().replaceChildren(), await fn(main());
}, shareURL = token => "https://myspace-5d573-default-rtdb.firebaseio.com/shares/" + encodeURIComponent(token), shareRead = async (token, part) => {
    const runtime = await getBoardRuntime();
    if (runtime && "meta" === part) return runtime.shareMeta(token);
    if (runtime && "board" === part) return (await (await runtime.shared(token)).read()).value;
    const response = await fetch(shareURL(token) + "/" + part + ".json", {
        cache: "no-store",
        signal: AbortSignal.timeout(8e3)
    });
    if (!response.ok) throw Object.assign(new Error("Ссылка недоступна (Firebase HTTP " + response.status + ")"), {
        status: response.status
    });
    return response.json();
}, shareWrite = async (token, part, value, method = "PUT", expectedEtag = null) => {
    const runtime = await getBoardRuntime();
    if (runtime && "board" === part && "PUT" === method) return (await runtime.shared(token)).write(value);
    const response = await fetch(shareURL(token) + "/" + part + ".json", {
        method: method,
        headers: expectedEtag ? {
            "if-match": expectedEtag
        } : {},
        body: null === value ? null : JSON.stringify(value),
        signal: AbortSignal.timeout(8e3)
    });
    if (!response.ok) throw Object.assign(new Error("Firebase не разрешил операцию " + part + " (HTTP " + response.status + ")"), {
        status: response.status
    });
    return {
        source: "firebase"
    };
};

let localDbPromise = null;

function localDB() {
    return "indexedDB" in window ? localDbPromise || (localDbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open("aspace-local-v1", 3);
        req.onupgradeneeded = () => {
            const db = req.result;
            db.objectStoreNames.contains("docs") || db.createObjectStore("docs", {
                keyPath: "key"
            }), db.objectStoreNames.contains("pending") || db.createObjectStore("pending", {
                keyPath: "key"
            }), db.objectStoreNames.contains("assets") || db.createObjectStore("assets", {
                keyPath: "key"
            }), db.objectStoreNames.contains("assetPending") || db.createObjectStore("assetPending", {
                keyPath: "key"
            }), db.objectStoreNames.contains("shareCache") || db.createObjectStore("shareCache", {
                keyPath: "key"
            }), db.objectStoreNames.contains("guestDrafts") || db.createObjectStore("guestDrafts", {
                keyPath: "key"
            }), db.objectStoreNames.contains("shareOps") || db.createObjectStore("shareOps", {
                keyPath: "key"
            });
        }, req.onsuccess = () => resolve(req.result), req.onerror = () => reject(req.error || new Error("Не удалось открыть локальную базу"));
    }), localDbPromise) : Promise.reject(new Error("IndexedDB недоступна"));
}

async function localPut(store, value) {
    const db = await localDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value), tx.oncomplete = () => resolve(!0), tx.onabort = tx.onerror = () => reject(tx.error || new Error("Local transaction failed"));
    });
}

const room0 = {
    async join(name, customPath, onData = () => {}) {
        const me = uid() + uid(), handlers = {}, dead = [], base = "https://myspace-5d573-default-rtdb.firebaseio.com" + (customPath || "/rooms/" + encodeURIComponent(name)), preflight = await fetch(base + ".json?shallow=true", {
            cache: "no-store",
            signal: AbortSignal.timeout(6e3)
        });
        if (!preflight.ok) throw new Error("Нет доступа к каналу видеозвонка (Firebase HTTP " + preflight.status + "). Проверь права гостевого доступа.");
        const baseline = await preflight.json(), seen = new Set(Object.keys(baseline || {}));
        let closed = !1, es = null, gc = null, pollTimer = null, polling = !1, hideRegistered = !1, renewTimer = null;
        function receive(key, value) {
            value ? value.t && !seen.has(key) && (seen.add(key), deliver(value)) : seen.delete(key);
        }
        async function poll() {
            if (!closed && !polling) {
                polling = !0;
                try {
                    const response = await fetch(base + ".json?orderBy=%22%24key%22&limitToLast=128", {
                        cache: "no-store",
                        signal: AbortSignal.timeout(6e3)
                    });
                    if (!response.ok) return;
                    const values = await response.json() || {};
                    if (closed) return;
                    for (const key of Object.keys(values).sort()) receive(key, values[key]);
                } catch {} finally {
                    polling = !1;
                }
            }
        }
        function startPolling() {
            closed || pollTimer || (pollTimer = setInterval(poll, 1500), poll());
        }
        function stopPolling() {
            clearInterval(pollTimer), pollTimer = null;
        }
        const flush = () => {
            if (!dead.length) return;
            const keys = dead.splice(0), data = {};
            keys.forEach(key => data[key] = null), fetch(base + ".json", {
                method: "PATCH",
                body: JSON.stringify(data),
                keepalive: !0
            }).then(response => {
                if (!response.ok) throw new Error("HTTP " + response.status);
            }).catch(() => {
                closed || dead.unshift(...keys);
            });
        }, onPageHide = event => {
            event.persisted || api.close();
        }, deliver = value => {
            value && value.s && value.s !== me && value.t && (handlers[value.t] || []).forEach(listener => {
                let data = null;
                try {
                    data = JSON.parse(value.d);
                } catch {}
                try {
                    listener({
                        data: data,
                        isMe: !1
                    });
                } catch (error) {
                    console.warn("Aspace signaling listener:", error);
                }
            });
        }, api = {
            id: me,
            emit: (type, data) => {
                const body = JSON.stringify({
                    t: type,
                    d: JSON.stringify(data),
                    s: me
                });
                return fetch(base + ".json", {
                    method: "POST",
                    body: body,
                    keepalive: (new TextEncoder).encode(body).byteLength <= 6e4
                }).then(async response => {
                    if (!response.ok) return console.warn("Aspace signal rejected", type, response.status), 
                    !1;
                    const result = await response.json();
                    return !!result?.name && (closed ? fetch(base + ".json", {
                        method: "PATCH",
                        body: JSON.stringify({
                            [result.name]: null
                        }),
                        keepalive: !0
                    }).catch(() => {}) : dead.push(result.name), !0);
                }).catch(error => (console.warn("Aspace signal failed", type, error), !1));
            },
            on: (type, listener) => ((handlers[type] = handlers[type] || []).push(listener), 
            () => {
                handlers[type] = handlers[type].filter(fn => fn !== listener);
            }),
            close: () => {
                closed || (closed = !0, hideRegistered && removeEventListener("pagehide", onPageHide), 
                es?.close(), stopPolling(), gc && clearInterval(gc), renewTimer && clearInterval(renewTimer), 
                flush());
            }
        };
        try {
            es = new EventSource(await eventUrl(base + ".json"));
            const bindStream = stream => {
                stream.addEventListener("put", event => {
                    try {
                        onData(event.data);
                    } catch {}
                    try {
                        const message = JSON.parse(event.data);
                        if ("/" === message.path) {
                            const values = message.data || {};
                            for (const key of Object.keys(values).sort()) receive(key, values[key]);
                            for (const key of seen) key in values || seen.delete(key);
                        } else 2 === message.path.split("/").length && receive(message.path.slice(1), message.data);
                    } catch (error) {
                        console.warn("Aspace signal parse:", error);
                    }
                }), stream.addEventListener("patch", event => {
                    try {
                        const message = JSON.parse(event.data);
                        if ("/" === message.path) for (const [key, value] of Object.entries(message.data || {})) receive(key, value);
                    } catch (error) {
                        console.warn("Aspace signal patch:", error);
                    }
                }), stream.addEventListener("error", startPolling), stream.addEventListener("open", stopPolling);
            };
            bindStream(es), await new Promise(resolve => {
                const timer = setTimeout(() => {
                    startPolling(), resolve();
                }, 2500), success = () => {
                    clearTimeout(timer), es.removeEventListener("error", failure), resolve();
                }, failure = () => {
                    es.readyState === EventSource.CLOSED && (clearTimeout(timer), es.removeEventListener("open", success), 
                    startPolling(), resolve());
                };
                es.addEventListener("open", success, {
                    once: !0
                }), es.addEventListener("error", failure, {
                    once: !0
                });
            });
            const renewStream = async () => {
                if (closed) return;
                const previous = es;
                try {
                    const next = new EventSource(await eventUrl(base + ".json"));
                    es = next, bindStream(next), next.addEventListener("open", () => {
                        closed ? next.close() : (previous?.close(), stopPolling());
                    }, {
                        once: !0
                    }), next.addEventListener("error", () => {
                        next.readyState === EventSource.CLOSED && (es === next && (es = previous), next.close(), 
                        startPolling());
                    }, {
                        once: !0
                    });
                } catch {
                    startPolling();
                }
            };
            renewTimer = setInterval(() => {
                renewStream();
            }, 27e5);
            const probe = await fetch(base + ".json", {
                method: "POST",
                body: JSON.stringify({
                    t: "ready",
                    d: "{}",
                    s: me
                }),
                signal: AbortSignal.timeout(6e3)
            });
            if (!probe.ok) throw new Error("Нет права отправлять сигналы (Firebase HTTP " + probe.status + ").");
            const ping = await probe.json();
            if (!ping?.name) throw new Error("Сервер сигналинга не принял тестовое сообщение");
            return dead.push(ping.name), gc = setInterval(flush, 1e4), flush(), addEventListener("pagehide", onPageHide), 
            hideRegistered = !0, api;
        } catch (error) {
            throw api.close(), error;
        }
    }
}, copyLink = async u => {
    try {
        await navigator.clipboard.writeText(u), say2("Ссылка скопирована");
    } catch {
        prompt("Скопируйте ссылку:", u);
    }
}, say2 = t => {
    const e = E("div", {
        className: "toast",
        textContent: t
    });
    e.style.display = "block", document.body.append(e), setTimeout(() => e.remove(), 1800);
};

addEventListener("hashchange", () => location.reload());

let ICE = [ {
    urls: [ "stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:global.stun.twilio.com:3478" ]
} ];

const ICE_READY = (async () => {
    const c = window.CFG || {};
    try {
        if (c.turn && c.turn.length && ICE.push(...c.turn), c.metered && c.metered.app && c.metered.key) {
            const j = await (await fetch(`https://${c.metered.app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(c.metered.key)}`)).json();
            Array.isArray(j) && ICE.push(...j);
        }
    } catch (e) {
        console.warn("TURN credentials unavailable", e);
    }
    return ICE;
})();

function compactCallControls(vbar, mic, cam, nz, cams, mics, speakers, fullscreen, leave) {
    const settings = E("details", {
        className: "call-settings"
    }, E("summary", {
        title: "Настройки звонка",
        ariaLabel: "Настройки звонка",
        textContent: "⚙"
    }), E("div", {
        className: "call-settings-panel"
    }, nz, E("label", {}, "Камера", cams), E("label", {}, "Микрофон", mics), E("label", {}, "Динамик", speakers)));
    fullscreen.title = "На весь экран", fullscreen.setAttribute("aria-label", fullscreen.title), 
    leave.textContent = "End call", leave.classList.add("end-call"), leave.title = "End call", 
    leave.setAttribute("aria-label", leave.title);
    for (const b of [ mic, cam ]) b.setAttribute("aria-label", b.title);
    fullscreen.textContent = "⛶";
    const panel = settings.querySelector(".call-settings-panel");
    for (const zoom of vbar.querySelectorAll(":scope > input[type=range]")) panel.append(E("label", {}, "Приближение камеры", zoom));
    vbar.append(mic, cam, settings, fullscreen, leave);
}

function Call(r, box) {
    const identity = function() {
        const key = "aspace-call-identity", previous = ls.g(key, null), identity = {
            participant: previous?.participant || uid() + uid(),
            entered: Math.max(Date.now(), (previous?.entered || 0) + 1)
        };
        return ls.s(key, identity), identity;
    }(), participants = new Map, send = (type, data) => r.emit(type, {
        ...data,
        ...identity
    }), iceQueue = {}, me = uid(), pcs = {}, tiles = {}, offs = [];
    let st = null, helloTimer = null;
    const reconnectTimers = new Map, tile = (id, s, l) => {
        let w = tiles[id];
        if (!w) {
            const v = E("video", {
                autoplay: !0,
                playsInline: !0,
                muted: "me" === id
            });
            w = E("div", {
                className: "tile"
            }, v, E("span", {
                textContent: l
            })), w.v = v, box.append(w), tiles[id] = w;
        }
        w.v.srcObject = s;
        const resume = () => {
            w.v.srcObject !== s && (w.v.srcObject = s);
            const p = w.v.play();
            p?.catch && p.catch(() => {});
        };
        for (const track of s.getVideoTracks()) track.addEventListener("unmute", resume);
    }, resumeVideo = () => {
        if ("visible" === document.visibilityState) for (const w of Object.values(tiles)) if (w.v?.srcObject) {
            const p = w.v.play();
            p?.catch && p.catch(() => {});
        }
    };
    document.addEventListener("visibilitychange", resumeVideo), window.addEventListener("pageshow", resumeVideo);
    const drop = id => {
        clearTimeout(reconnectTimers.get(id)), reconnectTimers.delete(id);
        const pc = pcs[id];
        delete pcs[id], pc && (pc.ontrack = null, pc.onicecandidate = null, pc.oniceconnectionstatechange = null, 
        pc.close()), delete iceQueue[id], tiles[id]?.remove(), delete tiles[id];
    };
    function acceptParticipant(message) {
        if (!message.participant || !Number.isSafeInteger(message.entered)) return !0;
        if (message.participant === identity.participant) return !1;
        const previous = participants.get(message.participant);
        if (previous?.from === message.from) return !0;
        if (previous) {
            if (message.entered < previous.entered || message.entered === previous.entered && message.from < previous.from) return !1;
            drop(previous.from);
        }
        return participants.set(message.participant, {
            from: message.from,
            entered: message.entered
        }), !0;
    }
    async function attachMedia(pc) {
        for (const tr of pc.getTransceivers()) {
            tr.direction = "sendrecv";
            const track = st?.getTracks().find(track => track.kind === tr.receiver.track.kind);
            track && await tr.sender.replaceTrack(track);
        }
    }
    const mk = async (id, init) => {
        const pc = new RTCPeerConnection({
            iceServers: ICE
        });
        pcs[id] = pc, pc.onicecandidate = e => e.candidate && send("sig", {
            to: id,
            from: me,
            k: "ice",
            d: e.candidate
        });
        const remoteStream = new MediaStream;
        if (pc.ontrack = e => {
            pcs[id] === pc && (remoteStream.getTrackById(e.track.id) || remoteStream.addTrack(e.track), 
            tile(id, remoteStream, "Участник"));
        }, pc.oniceconnectionstatechange = () => {
            if (clearTimeout(reconnectTimers.get(id)), reconnectTimers.delete(id), !init || ![ "failed", "disconnected" ].includes(pc.iceConnectionState)) return;
            const retry = async () => {
                if (reconnectTimers.delete(id), pcs[id] === pc && [ "failed", "disconnected" ].includes(pc.iceConnectionState)) {
                    try {
                        if ("stable" !== pc.signalingState) return void reconnectTimers.set(id, setTimeout(retry, 3e3));
                        const o = await pc.createOffer({
                            iceRestart: !0
                        });
                        await pc.setLocalDescription(o), await send("sig", {
                            to: id,
                            from: me,
                            k: "offer",
                            d: o
                        });
                    } catch (error) {
                        console.warn("Call reconnection pending");
                    }
                    pcs[id] === pc && [ "failed", "disconnected" ].includes(pc.iceConnectionState) && reconnectTimers.set(id, setTimeout(retry, 8e3));
                }
            };
            reconnectTimers.set(id, setTimeout(retry, "failed" === pc.iceConnectionState ? 1e3 : 4e3));
        }, init) {
            pc.addTransceiver("audio", {
                direction: "sendrecv"
            }), pc.addTransceiver("video", {
                direction: "sendrecv"
            }), await attachMedia(pc);
            const o = await pc.createOffer();
            await pc.setLocalDescription(o), send("sig", {
                to: id,
                from: me,
                k: "offer",
                d: o
            });
        }
        return pc;
    };
    offs.push(r.on("hello", m => {
        const x = m.data;
        st && x?.from && x.from !== me && (!x.to || x.to === me) && acceptParticipant(x) && (x.to || send("hello", {
            from: me,
            to: x.from
        }), pcs[x.from] || mk(x.from, me < x.from).catch(error => console.warn("Call negotiation failed", error)));
    })), offs.push(r.on("bye", m => m.data && drop(m.data.from)));
    const flushIce = async id => {
        const pc = pcs[id], q = iceQueue[id] || [];
        if (pc?.remoteDescription) {
            delete iceQueue[id];
            for (const c of q) try {
                await pc.addIceCandidate(c);
            } catch (e) {
                console.warn("ICE candidate rejected", e);
            }
        }
    };
    return offs.push(r.on("sig", async m => {
        const x = m.data;
        if (st && x?.from && x.to === me && acceptParticipant(x)) try {
            if ("offer" === x.k) {
                const pc = pcs[x.from] || await mk(x.from, !1);
                await pc.setRemoteDescription(x.d), await attachMedia(pc), await flushIce(x.from);
                const a = await pc.createAnswer();
                await pc.setLocalDescription(a), send("sig", {
                    to: x.from,
                    from: me,
                    k: "answer",
                    d: a
                });
            } else if ("answer" === x.k) {
                const pc = pcs[x.from];
                pc && (await pc.setRemoteDescription(x.d), await flushIce(x.from));
            } else if ("ice" === x.k) {
                const pc = pcs[x.from];
                pc?.remoteDescription ? await pc.addIceCandidate(x.d) : (iceQueue[x.from] = iceQueue[x.from] || []).push(x.d);
            }
        } catch (e) {
            console.error("WebRTC signaling error", x.k, e);
        }
    })), {
        async start() {
            await ICE_READY, ICE.some(x => (Array.isArray(x.urls) ? x.urls : [ x.urls ]).some(u => String(u || "").startsWith("turn:") || String(u || "").startsWith("turns:"))) || console.warn("TURN is not configured; VPN/restricted networks may block direct WebRTC"), 
            st = new MediaStream, tile("me", st, "Вы"), send("hello", {
                from: me
            }), helloTimer = setInterval(() => {
                Object.values(pcs).some(pc => "connected" === pc.connectionState) || send("hello", {
                    from: me
                });
            }, 5e3);
        },
        async mic() {
            let ns, t = st?.getAudioTracks()[0];
            if (t) return t.enabled = !t.enabled, !t.enabled;
            if (!st) throw new Error("Сначала подключитесь к видеозвонку.");
            if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Микрофон доступен только на HTTPS или localhost.");
            try {
                ns = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: !0,
                        noiseSuppression: !0,
                        autoGainControl: !0
                    },
                    video: !1
                });
            } catch (error) {
                throw new Error({
                    NotAllowedError: "Браузер не разрешил доступ к микрофону. Нажмите на значок замка рядом с адресом сайта и разрешите микрофон.",
                    NotFoundError: "Микрофон не найден. Подключите микрофон или выберите другое устройство.",
                    NotReadableError: "Микрофон занят другой программой. Закройте другие приложения, использующие микрофон."
                }[error?.name] || "Не удалось включить микрофон: " + (error?.message || error?.name || "неизвестная ошибка"));
            }
            if (t = ns.getAudioTracks()[0], !t) throw ns.getTracks().forEach(x => x.stop()), 
            new Error("Браузер не предоставил аудиодорожку микрофона.");
            st.addTrack(t);
            try {
                for (const pc of Object.values(pcs)) {
                    const transceiver = pc.getTransceivers().find(x => "audio" === x.receiver?.track?.kind);
                    transceiver && await transceiver.sender.replaceTrack(t);
                }
            } catch (error) {
                throw st.removeTrack(t), t.stop(), new Error("Микрофон разрешён, но не удалось передать звук собеседнику. Переподключитесь к звонку.");
            }
            return !0;
        },
        async cam() {
            let ns, t = st?.getVideoTracks()[0];
            if (t) return t.enabled = !t.enabled, t.enabled;
            if (!st) throw new Error("Сначала подключитесь к видеозвонку.");
            if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Камера доступна только на HTTPS или localhost.");
            try {
                ns = await navigator.mediaDevices.getUserMedia({
                    video: !0,
                    audio: !1
                });
            } catch (error) {
                throw new Error({
                    NotAllowedError: "Браузер запретил доступ к камере. Нажмите на значок настройки сайта рядом с адресом и разрешите камеру.",
                    NotFoundError: "Камера не найдена.",
                    NotReadableError: "Камера занята другой программой."
                }[error?.name] || "Не удалось включить камеру: " + (error?.message || error?.name));
            }
            if (t = ns.getVideoTracks()[0], !t) throw new Error("Браузер не предоставил видеопоток.");
            st.addTrack(t);
            try {
                for (const pc of Object.values(pcs)) {
                    const tr = pc.getTransceivers().find(x => "video" === x.receiver?.track?.kind);
                    tr && await tr.sender.replaceTrack(t);
                }
            } catch (error) {
                throw st.removeTrack(t), t.stop(), new Error("Не удалось подключить камеру к звонку.");
            }
            return tiles.me && (tiles.me.v.srcObject = st), !0;
        },
        devices: async () => await navigator.mediaDevices.enumerateDevices(),
        async cameras() {
            return (await this.devices()).filter(d => "videoinput" === d.kind);
        },
        async microphone(id) {
            if (!st) return;
            const nt = (await navigator.mediaDevices.getUserMedia({
                video: !1,
                audio: {
                    deviceId: {
                        exact: id
                    },
                    echoCancellation: !0,
                    noiseSuppression: !0,
                    autoGainControl: !0
                }
            })).getAudioTracks()[0], ot = st.getAudioTracks()[0];
            for (const pc of Object.values(pcs)) {
                const tr = pc.getTransceivers().find(x => "audio" === x.receiver?.track?.kind);
                tr && await tr.sender.replaceTrack(nt);
            }
            return ot && (st.removeTrack(ot), ot.stop()), st.addTrack(nt), nt;
        },
        async speaker(id) {
            for (const w of Object.values(tiles)) "function" == typeof w.v.setSinkId && await w.v.setSinkId(id);
        },
        async camera(id) {
            if (!st) return;
            const nt = (await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: {
                        exact: id
                    }
                },
                audio: !1
            })).getVideoTracks()[0], ot = st.getVideoTracks()[0];
            for (const pc of Object.values(pcs)) {
                const tr = pc.getTransceivers().find(x => "video" === x.receiver?.track?.kind);
                tr && await tr.sender.replaceTrack(nt);
            }
            return ot && (st.removeTrack(ot), ot.stop()), st.addTrack(nt), tiles.me.v.srcObject = st, 
            nt.getCapabilities ? nt.getCapabilities() : {};
        },
        zoomCaps() {
            const t = st?.getVideoTracks()[0], c = t?.getCapabilities?.();
            return c?.zoom || null;
        },
        async zoom(value) {
            const t = st?.getVideoTracks()[0];
            if (!t || !t.getCapabilities) return null;
            const c = t.getCapabilities();
            return c.zoom ? (await t.applyConstraints({
                advanced: [ {
                    zoom: Math.max(c.zoom.min, Math.min(c.zoom.max, value))
                } ]
            }), c.zoom) : null;
        },
        async noise(on) {
            await (st?.getAudioTracks()[0]?.applyConstraints({
                noiseSuppression: on,
                echoCancellation: !0,
                autoGainControl: !0
            }));
        },
        stop() {
            clearInterval(helloTimer), document.removeEventListener("visibilitychange", resumeVideo), 
            window.removeEventListener("pageshow", resumeVideo), send("bye", {
                from: me
            }), Object.keys(pcs).forEach(drop), st?.getTracks().forEach(t => t.stop()), tiles.me?.remove(), 
            offs.forEach(o => o && o()), st = null;
        }
    };
}

function devicePicker(call, kind, title) {
    const supported = "audiooutput" !== kind || "function" == typeof HTMLMediaElement.prototype.setSinkId, select = E("select", {
        title: "audiooutput" !== kind || supported ? title : "Выбор динамика не поддерживается этим браузером",
        "aria-label": title,
        className: "device-select",
        disabled: !supported
    }), refresh = async () => {
        const items = (await call.devices()).filter(d => d.kind === kind), old = select.value;
        select.replaceChildren(E("option", {
            value: "",
            textContent: title
        })), items.forEach((d, i) => select.append(E("option", {
            value: d.deviceId,
            textContent: d.label || title + " " + (i + 1)
        }))), items.some(d => d.deviceId === old) && (select.value = old);
    };
    return refresh(), navigator.mediaDevices?.addEventListener && navigator.mediaDevices.addEventListener("devicechange", refresh), 
    select.addEventListener("change", async () => {
        if (select.value) try {
            "videoinput" === kind ? await call.camera(select.value) : "audioinput" === kind ? await call.microphone(select.value) : await call.speaker(select.value);
        } catch (e) {
            alert("Не удалось переключить устройство: " + e.message);
        }
    }), select;
}

let persistentCallSession = null;

const boardCallDestinations = [ {
    id: "aspace",
    label: "Видеозвонок Aspace"
}, {
    id: "telemost",
    label: "Яндекс Телемост",
    field: "telemostUrl",
    hosts: [ "telemost.yandex.ru", "telemost.360.yandex.ru", "telemost.yandex.com", "telemost.360.yandex.com" ]
}, {
    id: "salute",
    label: "Салют Джаз",
    field: "jazzUrl",
    hosts: [ "salutejazz.ru", "jazz.sberbank.ru" ]
} ];

function boardInvitationUrl(raw, service) {
    try {
        const url = new URL(raw);
        return "https:" !== url.protocol || !service.hosts.includes(url.hostname) || url.username || url.password || url.port ? "" : ("telemostUrl" === service.field ? /^\/j\/[^/]+\/?$/.test(url.pathname) : /^\/(?:calls\/)?(?:sber-)?[a-z0-9]{6,}\/?$/i.test(url.pathname) && !/\/(?:meetings|history|conference|profile|settings|calendar)\/?$/i.test(url.pathname)) ? url.href : "";
    } catch {
        return "";
    }
}

const loadScript = src => new Promise((ok, no) => {
    document.head.append(E("script", {
        src: src,
        onload: ok,
        onerror: no
    }));
}), PDFCDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";

let pdfP = null;

const upload = async d => {
    const blob = "string" == typeof d && d.startsWith("data:") ? (data => {
        const m = String(data).match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
        if (!m) throw new Error("Неверный формат файла");
        const raw = m[3], bin = m[2] ? atob(raw) : decodeURIComponent(raw), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([ bytes ], {
            type: m[1] || "application/octet-stream"
        });
    })(d) : d;
    if (blob.size > 6291456) throw new Error("Изображение слишком большое для бесплатного хранения.");
    const data = await (blob => new Promise((resolve, reject) => {
        const r = new FileReader;
        r.onload = () => resolve(r.result), r.onerror = () => reject(new Error("Не удалось прочитать файл")), 
        r.readAsDataURL(blob);
    }))(blob), id = uid() + uid(), key = "img:" + id, token = activeShareToken;
    try {
        await localPut("assets", {
            key: key,
            value: data,
            updatedAt: Date.now()
        });
    } catch (e) {
        console.warn("Не удалось сохранить изображение локально:", e);
    }
    return imgCache[key] = Promise.resolve(data), token && await shareWrite(token, "assets/" + id, data), 
    key;
}, imgCache = {}, imgSrc = u => {
    if (!u || !u.startsWith("img:")) return Promise.resolve(u);
    if (imgCache[u]) return imgCache[u];
    const task = (async () => {
        try {
            const local = await async function(store, key) {
                const db = await localDB();
                return new Promise((resolve, reject) => {
                    const q = db.transaction("assets", "readonly").objectStore("assets").get(key);
                    q.onsuccess = () => resolve(q.result || null), q.onerror = () => reject(q.error);
                });
            }(0, u);
            if (local?.value) return local.value;
        } catch {}
        const path = activeShareToken ? shareURL(activeShareToken) + "/assets/" + u.slice(4) + ".json" : "https://myspace-5d573-default-rtdb.firebaseio.com/img/" + u.slice(4) + ".json", r = await fetch(path);
        if (!r.ok) throw new Error("Файл недоступен");
        const value = await r.json();
        try {
            await localPut("assets", {
                key: u,
                value: value,
                updatedAt: Date.now()
            });
        } catch {}
        return value;
    })();
    return imgCache[u] = task, task.then(() => {
        imgCache[u] === task && delete imgCache[u];
    }, () => {
        imgCache[u] === task && delete imgCache[u];
    }), task;
}, shrink = (f, max = 1100) => new Promise((ok, no) => {
    const im = new Image;
    im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height)), c = E("canvas", {
            width: im.width * k | 0,
            height: im.height * k | 0
        });
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height), ok({
            u: c.toDataURL("image/png" === f.type ? "image/png" : "image/jpeg", .7),
            w: c.width,
            h: c.height
        });
    }, im.onerror = no, im.src = URL.createObjectURL(f);
}), ICONS = {
    layers: '<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
    select: '<path d="M5 3l13 7-5.5 1.8L10 18z"/>',
    hand: '<path d="M8 12V6.5a1.5 1.5 0 013 0V11m0-.5V4.5a1.5 1.5 0 013 0V11m0-4.5a1.5 1.5 0 013 0v7a6.5 6.5 0 01-6.5 6.5h-1A6 6 0 017 17l-2.7-4.3a1.4 1.4 0 012.3-1.5L8 13"/>',
    pen: '<path d="M4 20l1-4L16 5a2.1 2.1 0 013 3L8 19z"/><path d="M14 7l3 3"/>',
    marker: '<path d="M13 5l6 6-7 7-6-6z"/><path d="M4 21h7M9 9l6 6"/>',
    eraser: '<path d="M4 16l9-9a2 2 0 013 0l3 3a2 2 0 010 3l-6 6H8z"/><path d="M12 20h8"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    note: '<path d="M5 4h14v10l-5 6H5z"/><path d="M14 20v-6h5"/>',
    shape: '<rect x="3" y="3" width="10" height="10" rx="3"/><circle cx="15.5" cy="15.5" r="5.5"/>',
    line: '<path d="M5 19L19 5M10 5h9v9"/>',
    frame: '<path d="M8 3v18M16 3v18M3 8h18M3 16h18"/>',
    sym: '<path d="M12 3l2 5.5L19.5 10 14 12l-2 5.5L10 12 4.5 10 10 8.5z"/><path d="M19 16v4M17 18h4"/>',
    img: '<rect x="3" y="4" width="18" height="16" rx="4"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
    pdf: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 14h6M9 17h4"/>',
    link: '<path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-2 2M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l2-2"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
    video: '<rect x="3" y="6" width="12" height="12" rx="3"/><path d="M15 10l6-3v10l-6-3z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 8v5l3 2"/>',
    vote: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-7"/>',
    comment: '<path d="M20 11a8 8 0 01-11 8l-6 2 2-6A8 8 0 1120 11zM9 11h6M12 8v6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    split: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 018 0v3M12 14v3"/>',
    unlock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 017-2M12 14v3"/>',
    back: '<path d="M19 12H5m7 7-7-7 7-7"/>',
    align: '<path d="M4 5h16M4 12h10M4 19h16M18 9l3 3-3 3"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'
}, ic = n => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    return s.setAttribute("viewBox", "0 0 24 24"), s.setAttribute("class", "ic"), s.innerHTML = ICONS[n], 
    s;
}, FONTS = [ "Roboto", "Open Sans", "Montserrat", "Raleway", "Oswald", "PT Sans", "PT Serif", "Merriweather", "Playfair Display", "Lobster", "Pacifico", "Caveat", "Marck Script", "Comfortaa", "Neucha" ], SYMS = {
    "Звёзды": "★ ☆ ✦ ✧ ✪ ✩ ✯ ✰ ✶ ✷ ✸ ✹ ✺ ❂ ✡ ⭐ 🌟 ✨ 💫",
    "Сердца": "♥ ♡ ❤ ❣ ❥ ❦ ❧ ☙ 💖 💗 💓 💕 💞 💝 🤍 💙 💚 💛 🧡 💜",
    "Скобки": "( ) [ ] { } ⟨ ⟩ ⟪ ⟫ 「 」 『 』 【 】 〔 〕 《 》 〈 〉 ‹ › « » ❨ ❩ ❪ ❫ ❬ ❭ ❮ ❯ ❰ ❱ ❲ ❳ ❴ ❵",
    "Кавычки": "« » „ “ ” ‘ ’ ‚ ‛ ‟ \" ' ‹ › 〝 〞 ❝ ❞ ❛ ❜",
    "Знаки": "— – ‑ … • · ‣ ◦ ○ ● ◆ ◇ ■ □ ▪ ▫ ▲ △ ▼ ▽ ◀ ▶ ¶ § † ‡ © ® ™ № ° ′ ″ ‰ ¡ ¿ ※ ‼ ⁇ ⁈ ⁉",
    "Стрелки": "← → ↑ ↓ ↔ ↕ ↖ ↗ ↘ ↙ ⇐ ⇒ ⇑ ⇓ ⇔ ➔ ➜ ➝ ➞ ➤ ➢ ↩ ↪ ⟲ ⟳ ↻ ↺",
    "Математика": "± × ÷ = ≠ ≈ ≡ ≤ ≥ < > ∞ √ ∛ ∑ ∏ ∫ ∂ ∆ ∇ π Ω μ α β γ δ θ λ σ φ ψ ² ³ ⁿ ½ ⅓ ¼ ¾ ∈ ∉ ⊂ ⊃ ∪ ∩ ∅ ∀ ∃ ∴ ∵",
    "Валюты": "$ € £ ¥ ₽ ₴ ₸ ₹ ₿ ¢ ₩ ₪ ₺",
    "Галочки": "✓ ✔ ✗ ✘ ✕ ✖ ☑ ☒ ☐ ✅ ❌ ❎ ⚠ ❗ ❓ ❕ ❔",
    "Природа": "❀ ❁ ❃ ❄ ❅ ❆ ✿ ✾ ❋ ✻ ✼ ☘ 🌸 🌼 🌷 🌹 🌿 🍀 ☀ ☁ ☂ ☃ ☾ ☽ ⚡ 🔥 💧",
    "Разное": "♪ ♫ ♬ ♩ ♭ ♮ ♯ ☎ ✉ ✂ ✈ ✎ ✏ ✒ ☺ ☻ ☹ ♔ ♕ ♚ ♛ ☮ ☯ ☸ ♻ ☠ ⚑ ⚐ ⌚ ⌛ ⏰",
    "Эмодзи": "😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😍 🥰 😎 🤔 😢 😭 😡 👍 👎 👏 🙏 💪 🎉 🎓 📚 📌 📎 💡 🎯 🏆"
}, SHAPES = [ "rr", "rect", "pill", "oval", "diamond", "triangle", "star", "hex" ], FILLK = [ "note", ...SHAPES ], PLACE = [ "note", "txt", "frame", ...SHAPES ], SHL = {
    rr: "Скруглённый",
    rect: "Прямоугольник",
    pill: "Таблетка",
    oval: "Овал",
    diamond: "Ромб",
    triangle: "Треугольник",
    star: "Звезда",
    hex: "Шестиугольник"
}, INK = [ "#1f1f2b", "#800020", "#4f86b3", "#f2c94c" ], FILLS = [ "#1f1f2b", "#800020", "#4f86b3", "#f2c94c" ], SIZES = {
    aud: [ 380, 100 ],
    vid: [ 460, 285 ],
    embed: [ 460, 285 ],
    note: [ 180, 140 ],
    rr: [ 220, 130 ],
    rect: [ 200, 130 ],
    pill: [ 240, 84 ],
    oval: [ 210, 140 ],
    diamond: [ 190, 170 ],
    triangle: [ 190, 170 ],
    star: [ 180, 170 ],
    hex: [ 210, 170 ],
    txt: [ 260, 60 ],
    frame: [ 640, 420 ],
    emo: [ 64, 64 ]
};

function externalMedia(raw) {
    let u;
    try {
        u = new URL(String(raw).trim());
    } catch {
        return null;
    }
    if ("https:" !== u.protocol || u.username || u.password) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, ""), videoId = /^[A-Za-z0-9_-]{11}$/;
    let id = null;
    if (("youtube.com" === host || "m.youtube.com" === host) && (id = "/watch" === u.pathname ? u.searchParams.get("v") : u.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1], 
    id && videoId.test(id))) return {
        kind: "embed",
        url: "https://www.youtube-nocookie.com/embed/" + id,
        host: "YouTube"
    };
    if ("drive.google.com" === host || "disk.yandex.ru" === host || "disk.yandex.com" === host || "yadi.sk" === host || "disk.360.yandex.ru" === host) {
        const file = "drive.google.com" === host && (u.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1] || u.searchParams.get("id"));
        return {
            kind: "embed",
            host: "drive.google.com" === host ? "Google Диск" : "Яндекс Диск",
            url: file && /^[\w-]+$/.test(file) ? "https://drive.google.com/file/d/" + file + "/preview" + (u.searchParams.has("resourcekey") ? "?resourcekey=" + encodeURIComponent(u.searchParams.get("resourcekey")) : "") : null,
            original: u.href
        };
    }
    if ("youtu.be" === host && (id = u.pathname.slice(1), videoId.test(id))) return {
        kind: "embed",
        url: "https://www.youtube-nocookie.com/embed/" + id,
        host: "YouTube"
    };
    if ("vimeo.com" === host || "player.vimeo.com" === host) {
        const match = u.pathname.match(/\/(?:video\/)?(\d{5,15})(?:\/|$)/);
        if (match) return {
            kind: "embed",
            url: "https://player.vimeo.com/video/" + match[1],
            host: "Vimeo"
        };
    }
    return ("soundcloud.com" === host || "m.soundcloud.com" === host) && u.pathname.split("/").filter(Boolean).length >= 2 ? {
        kind: "embed",
        url: "https://w.soundcloud.com/player/?url=" + encodeURIComponent(u.origin + u.pathname),
        host: "SoundCloud",
        audio: !0
    } : [ "images.unsplash.com", "i.imgur.com", "images.pexels.com", "upload.wikimedia.org", "cdn.pixabay.com" ].includes(host) || /\.(?:png|jpe?g|webp|gif|avif)(?:$)/i.test(u.pathname) ? {
        kind: "img",
        url: u.href,
        host: "Изображение"
    } : /\.(?:mp3|ogg|wav|m4a)(?:$)/i.test(u.pathname) ? {
        kind: "aud",
        url: u.href,
        host: "Аудио"
    } : /\.(?:mp4|webm|mov)(?:$)/i.test(u.pathname) ? {
        kind: "vid",
        url: u.href,
        host: "Видео"
    } : null;
}

async function openBoard(m, id, guest, shareToken = null, listedBoard = null) {
    boardThemeScope = "guest", applyTheme();
    const loading = E("div", {
        className: "gate"
    }, E("div", {
        className: "box",
        role: "status"
    }, E("h2", {
        textContent: "Загружаю доску…"
    })));
    m.append(loading);
    let shareMeta = null, d0 = null, boardShareToken = shareToken, boardTransport = null, localGuestDraft = null;
    const storeBoardView = async value => {};
    try {
        if (shareToken && (shareMeta = await shareRead(shareToken, "meta"), id = shareMeta.boardId, 
        guest = "editor" !== shareMeta.role, boardTransport = await (async () => null)(), 
        d0 = boardTransport ? (await boardTransport.read()).value : await shareRead(shareToken, "board"), 
        localGuestDraft = boardTransport ? await boardTransport.pending() : null), !d0) throw Error("По этому адресу нет сохранённой доски.");
    } catch (error) {
        if (!loading.isConnected) return;
        const message = shareToken && [ 401, 403, 404 ].includes(error.status) ? "Доступ по этой ссылке закрыт." : "Не удалось загрузить доску.";
        return void loading.replaceChildren(E("div", {
            className: "box"
        }, E("h2", {
            textContent: message
        }), E("p", {
            className: "mut",
            textContent: error.message
        }), B("Повторить", () => go(view => openBoard(view, id, guest, shareToken)))));
    }
    if (!loading.isConnected) return;
    loading.remove(), activeShareToken = boardShareToken;
    const boardRoute = shareToken ? "#s-" + shareToken : "#b-" + id + "-" + (guest ? "view" : "edit");
    history.replaceState(null, "", location.pathname + location.search + boardRoute);
    const cloneBoard = value => JSON.parse(JSON.stringify(value));
    localGuestDraft?.value && !guest && (d0 = cloneBoard(localGuestDraft.value));
    const d = d0, W = 8192, H = 6144;
    let tm, tool = "select", color = INK[0], width = 4, eraserWidth = 32, strokes = d.strokes || [], bg = d.bg || "dots", cur = null, sel = null, selectedItems = [], got = !1, sent = 0, lastT = 0, pan = null, vw = null, call = null, callRoom = null, z = 1, items = d.items || (d.notes || []).map(n => ({
        id: uid(),
        k: "note",
        x: n.x,
        y: n.y,
        t: n.t,
        c: n.c,
        w: 170,
        h: 110
    }));
    const els = {}, pend = {}, undo = [], redo = [], cvM = E("canvas", {
        width: W,
        height: H,
        className: "cm"
    }), ink = E("canvas", {
        width: W,
        height: H,
        className: "ink"
    }), cv = E("div", {
        className: "board-input"
    }), ctx = ink.getContext("2d"), ctxM = cvM.getContext("2d"), guideLayer = E("div", {
        className: "snap-guides"
    }), wrap = E("div", {
        className: "wrap " + bg
    }, cvM, ink, cv, guideLayer), sizer = E("div", {
        className: "sizer"
    }, wrap), sc = E("div", {
        className: "bscroll " + bg
    }, sizer), toast = E("div", {
        className: "toast"
    });
    wrap.style.width = W + "px", wrap.style.height = H + "px";
    let roomWarning = "", cloudPollTimer = null;
    const r = function() {
        let channel = null, closed = !1;
        const handlers = [];
        return {
            get id() {
                return channel?.id || null;
            },
            emit: (type, data) => channel?.emit(type, data) ?? Promise.resolve(!1),
            on(type, listener) {
                if (channel) return channel.on(type, listener);
                const entry = {
                    type: type,
                    listener: listener,
                    remove: null
                };
                return handlers.push(entry), () => {
                    entry.remove?.();
                    const i = handlers.indexOf(entry);
                    i >= 0 && handlers.splice(i, 1);
                };
            },
            attach(next) {
                if (closed) return next.close(), !1;
                channel = next;
                for (const entry of handlers) entry.remove = channel.on(entry.type, entry.listener);
                return !0;
            },
            close() {
                closed = !0, channel?.close(), handlers.length = 0;
            }
        };
    }(), say = t => {
        if (/конфликт|разные правки/i.test(t)) return syncIndicator.textContent = t, void (toast.style.display = "none");
        toast.textContent = t, toast.style.display = t ? "block" : "none";
    };
    let myName = ls.g("aspace-name", "");
    myName || (myName = prompt("Как показывать твоё имя другим участникам?", "Участник") || "Участник", 
    ls.s("aspace-name", myName));
    const peers = {}, peerSelect = E("select", {
        title: "Участники доски"
    });
    let followId = null, applyingRemote = !1, viewTimer = null, presenceTimer = null, remoteTimer = null;
    const myViewport = () => ({
        cx: (sc.scrollLeft + sc.clientWidth / 2) / z,
        cy: (sc.scrollTop + sc.clientHeight / 2) / z,
        z: z
    }), queueViewport = () => {
        applyingRemote || (clearTimeout(viewTimer), viewTimer = setTimeout(() => r.emit("vp", {
            id: r.id,
            name: myName,
            v: myViewport()
        }), 110));
    }, applyViewport = v => {
        if (!v) return;
        const nz = Math.min(2.5, Math.max(.25, Number(v.z) || 1)), cx = Number.isFinite(Number(v.cx)) ? Number(v.cx) : ((Number(v.x) || 0) + sc.clientWidth / 2) / (Number(v.z) || 1), cy = Number.isFinite(Number(v.cy)) ? Number(v.cy) : ((Number(v.y) || 0) + sc.clientHeight / 2) / (Number(v.z) || 1);
        applyingRemote = !0, clearTimeout(remoteTimer), z = nz, applyZ(), sc.scrollLeft = Math.max(0, cx * z - sc.clientWidth / 2), 
        sc.scrollTop = Math.max(0, cy * z - sc.clientHeight / 2), remoteTimer = setTimeout(() => {
            applyingRemote = !1;
        }, 250);
    }, refreshPeers = () => {
        const selected = peerSelect.value, now = Date.now();
        Object.keys(peers).forEach(k => {
            now - peers[k].at > 3e4 && delete peers[k];
        });
        const active = Object.values(peers).filter(p => p.id !== r.id);
        peerSelect.replaceChildren(E("option", {
            value: "",
            textContent: active.length ? "Выбери участника…" : "Пока никого нет"
        }), ...active.map(p => E("option", {
            value: p.id,
            textContent: p.name || "Участник"
        }))), active.some(p => p.id === selected) && (peerSelect.value = selected), followId && !peers[followId] && (followId = null);
    };
    r.on("presence", m => {
        const p = m.data;
        p && p.id && p.id !== r.id && (peers[p.id] = {
            ...peers[p.id] || {},
            ...p,
            at: Date.now()
        }, refreshPeers());
    }), r.on("vp", m => {
        const p = m.data;
        p && p.id && p.id !== r.id && (peers[p.id] = {
            ...peers[p.id] || {},
            ...p,
            at: Date.now()
        }, followId === p.id && applyViewport(p.v), refreshPeers());
    }), r.on("bring", m => {
        const p = m.data;
        p && p.to === r.id && (applyViewport(p.v), r.emit("bringack", {
            to: p.from,
            name: myName
        }), say((p.name || "Участник") + " переместил тебя к себе"));
    }), r.on("bringack", m => {
        const p = m.data;
        p && p.to === r.id && say((p.name || "Участник") + " перемещён к тебе");
    }), r.on("followme", m => {
        const p = m.data;
        p && p.to === r.id && (followId = p.from, applyViewport(p.v), r.emit("followack", {
            to: p.from,
            name: myName
        }), say("Следуешь за " + (p.name || "участником")));
    }), r.on("followack", m => {
        const p = m.data;
        p && p.to === r.id && say((p.name || "Участник") + " теперь следует за тобой");
    });
    const announce = () => r.emit("presence", {
        id: r.id,
        name: myName,
        at: Date.now()
    });
    announce(), presenceTimer = setInterval(() => {
        announce(), refreshPeers();
    }, 8e3);
    let shareSyncChain = Promise.resolve(), shareRecoveryTimer = null, disposed = !1, editEpoch = 0, savedEpoch = 0, unsyncedShareDraft = Boolean(localGuestDraft), displayedBase = cloneBoard(localGuestDraft ? localGuestDraft.base ?? null : d0);
    const snapshot = () => ({
        name: d.name,
        strokes: cloneBoard(strokes),
        items: cloneBoard(items),
        bg: bg,
        announcement: d.announcement || null,
        siteUrl: d.siteUrl || "",
        ...d.entryCall ? {
            entryCall: d.entryCall
        } : {},
        ...d.jazzUrl ? {
            jazzUrl: d.jazzUrl
        } : {},
        ...d.telemostUrl ? {
            telemostUrl: d.telemostUrl
        } : {},
        upd: Date.now()
    });
    let locallyDismissedAnnouncement = "";
    const announcementBox = E("aside", {
        className: "board-announcement",
        hidden: !0,
        role: "status"
    });
    function renderAnnouncement() {
        const note = d.announcement;
        note && note.text && locallyDismissedAnnouncement !== note.id ? (announcementBox.replaceChildren(E("div", {
            className: "announcement-heading"
        }, E("strong", {
            textContent: "Объявление от Анны"
        }), B("×", () => {
            locallyDismissedAnnouncement = note.id, announcementBox.hidden = !0;
        }, "announcement-close")), E("div", {
            className: "announcement-message",
            textContent: note.text
        })), announcementBox.hidden = !1) : announcementBox.hidden = !0;
    }
    const applySnapshot = value => {
        if (!value || disposed) return;
        const known = new Map(items.map(item => [ item.id, item ])), incoming = new Set((value.items || []).map(item => item.id));
        for (const old of items) incoming.has(old.id) || rmEl(old);
        items = (value.items || []).map(next => {
            const old = known.get(next.id);
            if (old) return JSON.stringify(old) !== JSON.stringify(next) && (Object.assign(old, next), 
            old.arrows = next.arrows, upsert(old)), old;
            const item = cloneBoard(next);
            return upsert(item), item;
        }), strokes = cloneBoard(value.strokes || []), bg = value.bg || "dots", d.name = value.name || d.name, 
        d.entryCall = value.entryCall || "", d.announcement = value.announcement && "string" == typeof value.announcement.text ? value.announcement : null, 
        renderAnnouncement(), d.jazzUrl = value.jazzUrl || "", d.telemostUrl = value.telemostUrl || "", 
        refreshMeetings();
        const siteChanged = (d.siteUrl || "") !== (value.siteUrl || "");
        d.siteUrl = value.siteUrl || "", sc.className = "bscroll " + bg, wrap.className = "wrap " + bg, 
        redraw(), fit(), siteChanged && renderSite(), selectedItems.length && selectMany(selectedItems);
    }, queueSharedDraft = data => {
        const epoch = editEpoch, base = cloneBoard(displayedBase);
        return shareSyncChain = shareSyncChain.then(() => (async (data, epoch = editEpoch, base = displayedBase) => {
            if (!disposed && !guest) try {
                const result = boardTransport ? await boardTransport.write(data, {
                    base: base
                }) : boardShareToken ? await shareWrite(boardShareToken, "board", data) : {
                    pending: !await save("boards/" + id, data),
                    value: data
                };
                if (disposed) return;
                if (result.value || (result.value = data), result.pending || result.conflict || storeBoardView(result.value), 
                unsyncedShareDraft = Boolean(result.pending || result.conflict), result.value && !result.conflict) {
                    if (editEpoch === epoch) applySnapshot(result.value), savedEpoch = epoch; else {
                        const {mergeBoard: mergeBoard} = await (import("./cloudflare/merge-board.js")), merged = mergeBoard(data, snapshot(), result.value);
                        if (!merged.ok) return say("Есть конфликт изменений. Твоя версия сохранена на устройстве."), 
                        void (unsyncedShareDraft = !0);
                        applySnapshot(merged.value);
                    }
                    displayedBase = cloneBoard(result.value);
                }
                result.conflict ? say("Конфликт сохранения: обе версии сохранены. Скачай JSON-копию из меню доски.") : result.pending ? say("Изменения сохранены в резерве; ожидаем восстановления Firebase.") : say(roomWarning ? "Доска сохранена. Канал видеосвязи пока недоступен." : "");
            } catch (error) {
                unsyncedShareDraft = !0, say("Черновик сохранён на устройстве: " + error.message);
            }
        })(data, epoch, base)).catch(error => say("Ошибка сохранения: " + error.message)), 
        shareSyncChain;
    };
    let recoveryQueued = !1;
    const retrySharedDraft = () => {
        disposed || guest || !1 === navigator.onLine || !recoveryQueued && unsyncedShareDraft && (recoveryQueued = !0, 
        queueSharedDraft(snapshot()).finally(() => {
            recoveryQueued = !1;
        }));
    };
    window.addEventListener("online", retrySharedDraft);
    const persist = (remote = !1) => {
        guest || disposed || remote || (editEpoch++, clearTimeout(tm), tm = setTimeout(() => {
            queueSharedDraft(snapshot());
        }, 350));
    }, persistNow = () => {
        if (persist(), guest || disposed) return;
        clearTimeout(tm);
        const state = snapshot();
        queueSharedDraft(state);
    }, push = n => {
        persist(), pend[n.id] || (pend[n.id] = setTimeout(() => {
            delete pend[n.id], r.emit("i", {
                n: n
            });
        }, 45));
    }, eraseAt = (x, y) => {
        const radius = eraserWidth / 2, dist = (px, py, ax, ay, bx, by) => {
            const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
            return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        }, removed = strokes.filter(st => {
            if (st.e) return !1;
            for (let i = 0; i < st.p.length; i += 2) if (0 === i) {
                if (Math.hypot(x - st.p[i], y - st.p[i + 1]) <= radius + st.w / 2) return !0;
            } else if (dist(x, y, st.p[i - 2], st.p[i - 1], st.p[i], st.p[i + 1]) <= radius + st.w / 2) return !0;
            return !1;
        });
        if (removed.length) {
            const ids = new Set(removed.map(st => st.id));
            strokes = strokes.filter(st => !ids.has(st.id)), redraw(), removed.forEach(st => r.emit("ds", {
                id: st.id
            })), rec({
                t: "er",
                strokes: removed
            }), persist();
        }
    }, seg = (s, a) => {
        if (s.e) return;
        const c = s.m ? ctxM : ctx;
        if (((c, s, a) => {
            if (c.globalCompositeOperation = "source-over", c.strokeStyle = c.fillStyle = s.c, 
            c.lineWidth = s.w, c.lineCap = c.lineJoin = "round", c.beginPath(), c.moveTo(s.p[a], s.p[a + 1]), 
            s.p.length <= a + 2) c.lineTo(s.p[a] + .1, s.p[a + 1]); else {
                let i = a + 2;
                for (;i < s.p.length - 2; i += 2) {
                    const mx = (s.p[i] + s.p[i + 2]) / 2, my = (s.p[i + 1] + s.p[i + 3]) / 2;
                    c.quadraticCurveTo(s.p[i], s.p[i + 1], mx, my);
                }
                c.lineTo(s.p[s.p.length - 2], s.p[s.p.length - 1]);
            }
            c.stroke();
        })(c, s, a), s.ar && s.p.length >= 4) {
            const n = s.p.length, x2 = s.p[n - 2], y2 = s.p[n - 1], an = Math.atan2(y2 - s.p[n - 3], x2 - s.p[n - 4]), l = 12 + 3 * s.w;
            c.beginPath(), c.moveTo(x2 - l * Math.cos(an - .45), y2 - l * Math.sin(an - .45)), 
            c.lineTo(x2, y2), c.lineTo(x2 - l * Math.cos(an + .45), y2 - l * Math.sin(an + .45)), 
            c.stroke();
        }
    }, redraw = () => {
        ctx.clearRect(0, 0, W, H), ctxM.clearRect(0, 0, W, H), strokes.forEach(s => seg(s, 0));
    }, svgNode = (tag, attrs = {}) => {
        const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
        return node;
    }, wires = svgNode("svg", {
        class: "board-wires",
        "aria-hidden": "true"
    });
    wrap.append(wires);
    let formatFrame = 0, wireFrame = 0, wireSource = null, wireMode = null, wireDrag = null, wirePreview = null;
    function drawWires() {
        if (disposed) return;
        wireFrame = 0;
        const nodes = new Map(items.map(n => [ n.id, n ])), drawing = document.createDocumentFragment();
        for (const a of items) for (const link of a.arrows || []) {
            const b = nodes.get(link.to);
            if (!b) continue;
            const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
            if (len < 1) continue;
            const bend = Number(link.bend) || 0, cx = (ax + bx) / 2 - dy / len * bend, cy = (ay + by) / 2 + dx / len * bend, edge = (n, x, y) => {
                const nx = n.x + n.w / 2, ny = n.y + n.h / 2, rx = (x - nx) / (n.w / 2), ry = (y - ny) / (n.h / 2), poly = {
                    triangle: [ [ 0, -1 ], [ 1, 1 ], [ -1, 1 ] ],
                    hex: [ [ -.5, -1 ], [ .5, -1 ], [ 1, 0 ], [ .5, 1 ], [ -.5, 1 ], [ -1, 0 ] ],
                    star: [ [ 0, -1 ], [ .22, -.3 ], [ .96, -.3 ], [ .36, .14 ], [ .58, .82 ], [ 0, .4 ], [ -.58, .82 ], [ -.36, .14 ], [ -.96, -.3 ], [ -.22, -.3 ] ]
                }[n.k];
                if (poly) for (let i = 0; i < poly.length; i++) {
                    const [px, py] = poly[i], [qx, qy] = poly[(i + 1) % poly.length], ex = qx - px, ey = qy - py, det = rx * ey - ry * ex;
                    if (Math.abs(det) < 1e-9) continue;
                    const t = (px * ey - py * ex) / det, u = (px * ry - py * rx) / det;
                    if (t >= 0 && u >= 0 && u <= 1) return [ nx + t * (x - nx), ny + t * (y - ny) ];
                }
                const k = "oval" === n.k ? Math.hypot(rx, ry) : "diamond" === n.k ? Math.abs(rx) + Math.abs(ry) : Math.max(Math.abs(rx), Math.abs(ry));
                return [ nx + (x - nx) / (k || 1), ny + (y - ny) / (k || 1) ];
            }, [x, y] = edge(a, cx, cy), [tx, ty] = edge(b, cx, cy), angle = Math.atan2(ty - cy, tx - cx), color = /^#[0-9a-f]{6}$/i.test(link.color) ? link.color : "#71384f";
            drawing.append(svgNode("path", {
                d: "M " + x + " " + y + " Q " + cx + " " + cy + " " + tx + " " + ty,
                fill: "none",
                stroke: color,
                "stroke-width": 3
            }), svgNode("path", {
                d: "M 0 0 L -13 -6 L -13 6 Z",
                fill: color,
                transform: "translate(" + tx + " " + ty + ") rotate(" + 180 * angle / Math.PI + ")"
            }));
        }
        wires.replaceChildren(drawing), wireDrag && wirePreview && wires.append(wirePreview);
    }
    function queueWires() {
        wireFrame || (wireFrame = requestAnimationFrame(drawWires));
    }
    const geom = (el, n) => {
        el.style.left = n.x + "px", el.style.top = n.y + "px", el.style.width = n.w + "px", 
        el.style.height = n.h + "px", el.style.setProperty("z-index", String(n.layer ?? ("frame" === n.k ? 2 : 3)), "important"), 
        queueWires(), queueFormatPosition();
    }, applyZ = () => {
        wrap.style.transform = `scale(${z})`, sizer.style.width = W * z + "px", sizer.style.height = parseFloat(wrap.style.height) * z + "px", 
        zl.textContent = Math.round(100 * z) + "%", queueFormatPosition();
    }, fit = () => {
        wrap.style.height = Math.max(H, ...items.map(i => i.y + i.h + 120)) + "px", applyZ();
    }, setZ = nz => {
        nz = Math.min(2.5, Math.max(.25, nz));
        const cx = (sc.scrollLeft + sc.clientWidth / 2) / z, cy = (sc.scrollTop + sc.clientHeight / 2) / z;
        z = nz, applyZ(), sc.scrollLeft = cx * z - sc.clientWidth / 2, sc.scrollTop = cy * z - sc.clientHeight / 2, 
        queueViewport();
    }, rmEl = n => {
        queueWires(), els[n.id]?.remove(), delete els[n.id], selectedItems.includes(n) && selectMany(selectedItems.filter(q => q !== n));
    }, delItem = (n, keep) => {
        guest || n.locked || (items = items.filter(x => x !== n), rmEl(n), r.emit("d", {
            id: n.id
        }), persist(), keep || rec({
            t: "d",
            n: n
        }));
    }, dup = n => {
        if (guest || n.locked) return;
        const c = {
            ...n,
            arrows: [],
            group: null,
            id: uid(),
            x: n.x + 24,
            y: n.y + 24
        };
        items.push(c), upsert(c), r.emit("i", {
            n: c
        }), persist(), rec({
            t: "i",
            n: c
        }), select(c);
    };
    function fitNoteText(el, n) {
        if ("note" !== n.k || n.poll || Number.isFinite(n.timerDurationMs) || n.deadline || !el._t) return;
        const text = el._t, box = text.parentElement, style = getComputedStyle(box), height = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        if (height <= 0 || !text.clientWidth) return;
        let low = 0, high = Math.max(1, (n.fs || 16) * Math.min(n.w / 180, n.h / 140));
        const fits = size => (text.style.fontSize = size + "px", text.scrollHeight <= height && text.scrollWidth <= text.clientWidth);
        if (!fits(high)) {
            for (;high - low > .25; ) {
                const size = (low + high) / 2;
                fits(size) ? low = size : high = size;
            }
            text.style.fontSize = Math.max(.25, low) + "px";
        }
    }
    const mediaObserver = "function" == typeof IntersectionObserver ? new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target;
            mediaObserver.unobserve(el);
            const source = el.dataset.aspaceMediaSource;
            source && imgSrc(source).then(value => {
                el.isConnected && value && ("IMG" === el.tagName ? (el.src = value, el.decode?.().catch(() => {})) : (el.src = value, 
                el.load?.()));
            }).catch(() => {
                el.dataset.aspaceMediaFailed = "1", "IMG" === el.tagName && (el.alt = "Изображение временно недоступно");
            });
        }
    }, {
        root: sc,
        rootMargin: "700px 0px",
        threshold: .01
    }) : null, loadBoardMedia = (el, url) => {
        el.dataset.aspaceMediaSource = url, mediaObserver ? mediaObserver.observe(el) : imgSrc(url).then(value => {
            el.isConnected && value && (el.src = value, el.load?.());
        }).catch(() => {
            el.dataset.aspaceMediaFailed = "1";
        });
    }, retryFailedBoardMedia = () => {
        sc.querySelectorAll('[data-aspace-media-failed="1"]').forEach(el => {
            el.removeAttribute("data-aspace-media-failed"), loadBoardMedia(el, el.dataset.aspaceMediaSource);
        });
    };
    window.addEventListener("online", retryFailedBoardMedia);
    const upsert = n => {
        let el = els[n.id];
        if (!el) {
            el = E("div", {
                className: "it " + n.k + (FILLK.includes(n.k) ? " fill" : "")
            }), els[n.id] = el, el.dataset.itemId = n.id;
            const bgl = E("div", {
                className: "bgl k-" + n.k
            });
            el._bg = bgl, el.append(bgl);
            let hd = el;
            if ("img" === n.k) {
                const im = E("img", {
                    draggable: !1,
                    loading: "lazy",
                    decoding: "async",
                    fetchPriority: "low",
                    alt: "Изображение на доске"
                });
                bgl.append(im), loadBoardMedia(im, n.u);
            } else if ("embed" === n.k) {
                const src = externalMedia(n.u);
                if ("embed" === src?.kind && src.url) {
                    const frame = E("iframe", {
                        src: src.url,
                        title: src.host + " — внешний плеер",
                        loading: "lazy",
                        referrerPolicy: "no-referrer",
                        allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
                        allowFullscreen: !0,
                        style: "width:100%;height:100%;border:0;border-radius:10px"
                    });
                    bgl.append(frame), hd = E("i"), el.append(hd);
                } else bgl.textContent = src?.host || "Недопустимая ссылка на плеер", hd = E("i"), 
                el.append(hd);
            } else if ("aud" === n.k || "vid" === n.k) {
                const media = E("aud" === n.k ? "audio" : "video", {
                    controls: !0,
                    preload: "none",
                    style: "width:100%;height:100%;object-fit:contain"
                });
                "vid" === n.k && (media.playsInline = !0), bgl.append(media), el._media = media, 
                loadBoardMedia(media, n.u), hd = E("i"), el.append(hd);
            } else if ("emo" === n.k) bgl.textContent = n.t; else {
                hd = E("i");
                const t = E("div", {
                    className: "t",
                    contentEditable: !0,
                    onfocus: () => {
                        guest || n.locked || (el._historyBefore = cloneBoard(n));
                    },
                    oninput: () => {
                        guest || n.locked || (n.t = t.innerText, fitNoteText(el, n), push(n));
                    },
                    onblur: () => {
                        if (!guest && !n.locked && el._historyBefore) {
                            const before = [ {
                                id: n.id,
                                state: el._historyBefore
                            } ], after = itemStates([ n ]);
                            JSON.stringify(before) !== JSON.stringify(after) && rec({
                                t: "u",
                                before: before,
                                after: after
                            }), el._historyBefore = null, persistNow();
                        }
                    }
                });
                el._t = t, el.ondblclick = e => {
                    guest || n.locked || e.target.closest("button,.g") || n.poll || n.timerDurationMs || t.focus();
                }, el.append(hd, "frame" === n.k ? E("div", {
                    className: "fl"
                }, t) : E("div", {
                    className: "tw"
                }, t));
            }
            if ("embed" === n.k && "embed" === externalMedia(n.u)?.kind && el.append(E("a", {
                className: "media-open",
                href: n.u,
                target: "_blank",
                rel: "noopener noreferrer",
                textContent: "Открыть ↗"
            })), el._media || bgl.querySelector("iframe")) {
                const interact = B("▶ Плеер", () => {
                    const active = el.classList.toggle("media-active");
                    interact.textContent = active ? "↔ Перемещать" : "▶ Плеер";
                }, "media-interact");
                el.append(interact);
            }
            const g = E("div", {
                className: "g"
            }), sb = E("div", {
                className: "sb"
            }, E("button", {
                textContent: "⧉",
                title: "Дублировать",
                onclick: () => dup(n)
            }), E("button", {
                textContent: "✕",
                title: "Удалить",
                onclick: () => delItem(n)
            }));
            g.onpointerdown = e => {
                if (guest || n.locked) return;
                e.stopPropagation(), e.preventDefault(), g.setPointerCapture(e.pointerId);
                const before = itemStates([ n ]), sx = e.clientX, sy = e.clientY, w0 = n.w, h0 = n.h, fs0 = n.fs || 40, legacySymbol = "txt" === n.k && Object.values(SYMS).some(group => group.split(" ").includes(n.t));
                g.onpointermove = ev => {
                    if (guest || n.locked) return;
                    const timer = Number.isFinite(n.timerDurationMs) || !!n.deadline;
                    n.w = Math.max(timer ? 100 : 40, w0 + (ev.clientX - sx) / z), n.h = "img" === n.k || "emo" === n.k ? n.w * h0 / w0 : Math.max(timer ? 60 : 30, h0 + (ev.clientY - sy) / z), 
                    legacySymbol && (n.fs = Math.max(8, Math.round(fs0 * Math.max(n.w / w0, n.h / h0)))), 
                    upsert(n), push(n);
                }, g.onpointerup = () => {
                    g.onpointermove = g.onpointerup = null, fit();
                    const after = itemStates([ n ]);
                    JSON.stringify(before) !== JSON.stringify(after) && rec({
                        t: "u",
                        before: before,
                        after: after
                    });
                };
            };
            for (const side of [ "left", "right" ]) {
                const grip = E("div", {
                    className: "g side-grip " + side,
                    title: "Растянуть"
                });
                grip.onpointerdown = e => {
                    if (guest || n.locked || e.button) return;
                    e.stopPropagation(), e.preventDefault(), grip.setPointerCapture(e.pointerId);
                    const before = itemStates([ n ]), x = n.x, w = n.w, start = e.clientX;
                    grip.onpointermove = ev => {
                        const delta = (ev.clientX - start) / z;
                        n.w = Math.max(Number.isFinite(n.timerDurationMs) || n.deadline ? 100 : 40, "left" === side ? Math.min(w + x, w - delta) : w + delta), 
                        "left" === side && (n.x = x + w - n.w), upsert(n), push(n);
                    }, grip.onpointerup = grip.onpointercancel = () => {
                        grip.onpointermove = null, fit();
                        const after = itemStates([ n ]);
                        JSON.stringify(before) !== JSON.stringify(after) && rec({
                            t: "u",
                            before: before,
                            after: after
                        });
                    };
                }, el.append(grip);
            }
            el.append(g, sb);
            {
                const ports = E("div", {
                    className: "wire-ports"
                });
                for (const side of [ "top", "right", "bottom", "left" ]) ports.append(E("button", {
                    type: "button",
                    className: "wire-port " + side,
                    title: "Потяни для прямой стрелки; Shift + перетаскивание — гибкая стрелка"
                }));
                el.append(ports);
            }
            el.addEventListener("pointerdown", e => {
                guest || e.button || (e.shiftKey ? selectMany(selectedItems.includes(n) ? selectedItems.filter(q => q !== n) : [ ...selectedItems, n ]) : selectedItems.includes(n) && !e.target.closest(".g,.sb,.t") || select(n));
            }, !0), el.dataset.symbolObject = String("emo" === n.k || "txt" === n.k && Object.values(SYMS).some(group => group.split(" ").includes(n.t))), 
            ((h, el, n) => {
                h.addEventListener("pointerdown", e => {
                    if (guest || n.locked || e.shiftKey || 0 !== e.button || e.target.closest(".g,.sb,.wire-port,.timer-controls,.session-widget,a,button,video,audio,iframe")) return;
                    if (e.target.closest(".t") === document.activeElement) return;
                    e.preventDefault(), e.stopPropagation(), h.setPointerCapture(e.pointerId);
                    const rect = wrap.getBoundingClientRect(), ox = (e.clientX - rect.left) / z - n.x, oy = (e.clientY - rect.top) / z - n.y, group = selectedItems.filter(q => q !== n && !q.locked).map(q => ({
                        q: q,
                        dx: q.x - n.x,
                        dy: q.y - n.y
                    })), before = itemStates([ n, ...group.map(o => o.q) ]);
                    let moved = !1, lastPreview = 0;
                    h.onpointermove = ev => {
                        if (n.locked || guest) return;
                        const r = wrap.getBoundingClientRect(), p = ((n, x, y) => {
                            const threshold = 9 / z, others = items.filter(q => q !== n);
                            let gx = null, gy = null, dx = threshold + 1, dy = threshold + 1;
                            const ax = [ x, x + n.w / 2, x + n.w ], ay = [ y, y + n.h / 2, y + n.h ];
                            if (others.forEach(q => {
                                [ q.x, q.x + q.w / 2, q.x + q.w ].forEach(v => ax.forEach(a => {
                                    const d = Math.abs(v - a);
                                    d < dx && (dx = d, gx = v);
                                })), [ q.y, q.y + q.h / 2, q.y + q.h ].forEach(v => ay.forEach(a => {
                                    const d = Math.abs(v - a);
                                    d < dy && (dy = d, gy = v);
                                }));
                            }), dx > threshold && (gx = null), dy > threshold && (gy = null), null !== gx) {
                                const candidates = [ x, x + n.w / 2, x + n.w ], nearest = candidates.reduce((best, v) => Math.abs(v - gx) < Math.abs(best - gx) ? v : best, candidates[0]);
                                x += gx - nearest;
                            }
                            if (null !== gy) {
                                const candidates = [ y, y + n.h / 2, y + n.h ], nearest = candidates.reduce((best, v) => Math.abs(v - gy) < Math.abs(best - gy) ? v : best, candidates[0]);
                                y += gy - nearest;
                            }
                            return guideLayer.replaceChildren(), null !== gx && guideLayer.append(E("div", {
                                className: "snap-guide v",
                                style: `left:${gx}px`
                            })), null !== gy && guideLayer.append(E("div", {
                                className: "snap-guide h",
                                style: `top:${gy}px`
                            })), {
                                x: Math.max(0, x),
                                y: Math.max(0, y)
                            };
                        })(n, (ev.clientX - r.left) / z - ox, (ev.clientY - r.top) / z - oy);
                        (Math.abs(p.x - n.x) > .5 || Math.abs(p.y - n.y) > .5) && (moved = !0), n.x = Math.max(p.x, ...group.map(o => -o.dx)), 
                        n.y = Math.max(p.y, ...group.map(o => -o.dy)), geom(el, n);
                        for (const {q: q, dx: dx, dy: dy} of group) !q.locked && els[q.id] && (q.x = n.x + dx, 
                        q.y = n.y + dy, geom(els[q.id], q));
                        moved && Date.now() - lastPreview > 120 && (lastPreview = Date.now(), r.emit("move", {
                            points: [ n, ...group.map(o => o.q) ].map(({id: id, x: x, y: y}) => ({
                                id: id,
                                x: x,
                                y: y
                            }))
                        }));
                    };
                    const finish = () => {
                        if (h.onpointermove = h.onpointerup = h.onpointercancel = null, guideLayer.replaceChildren(), 
                        fit(), moved) {
                            r.emit("i", {
                                n: n
                            });
                            for (const {q: q} of group) r.emit("i", {
                                n: q
                            });
                            const after = itemStates([ n, ...group.map(o => o.q) ]);
                            rec({
                                t: "u",
                                before: before,
                                after: after
                            }), persistNow();
                        }
                    };
                    h.onpointerup = finish, h.onpointercancel = finish;
                }, {
                    capture: !0
                });
            })(el, el, n), wrap.insertBefore(el, "frame" === n.k ? cv.nextSibling : null);
        }
        if (geom(el, n), "emo" === n.k && (el._bg.textContent = n.t, el._bg.style.fontSize = .8 * Math.min(n.w, n.h) + "px", 
        el._bg.style.color = n.c || "#1f1f2b"), el.classList.toggle("locked", !!n.locked), 
        el._t && (el._t.contentEditable = String(!guest && !n.locked), ((t, n) => {
            const s = t.style;
            s.fontFamily = `'${n.f || "Open Sans"}',sans-serif`, s.fontSize = (n.fs || 16) + "px", 
            s.fontWeight = n.b ? 700 : 400, s.fontStyle = n.i ? "italic" : "normal", s.textDecoration = n.ul ? "underline" : "none", 
            s.color = n.col || "#3a3a46";
        })(el._t, n), document.activeElement !== el._t && (el._t.textContent = n.t || "")), 
        fitNoteText(el, n), FILLK.includes(n.k) && (el._bg.style.background = n.c), el.classList.toggle("retro-timer", Number.isFinite(n.timerDurationMs) || !!n.deadline), 
        n.deadline || Number.isFinite(n.timerDurationMs)) {
            if (!el._clock) {
                el._clock = E("div", {
                    className: "timer-value",
                    contentEditable: !1,
                    role: "timer",
                    ariaLabel: "Таймер"
                });
                const dial = E("div", {
                    className: "timer-dial",
                    ariaHidden: "true"
                });
                for (const [label, position] of [ [ "XII", "north" ], [ "III", "east" ], [ "VI", "south" ], [ "IX", "west" ] ]) dial.append(E("span", {
                    className: "clock-numeral " + position,
                    textContent: label
                }));
                el._hand = E("span", {
                    className: "timer-hand"
                }), dial.append(el._hand, E("span", {
                    className: "timer-pin"
                })), el._readout = E("span", {
                    className: "timer-readout"
                }), el._timerStatus = E("span", {
                    className: "timer-caption"
                });
                const startTimer = B("▶ Пуск", () => {
                    if (guest || n.locked) return;
                    const left = Math.max(0, Number(n.timerRemainingMs ?? (n.deadline ? n.deadline - Date.now() : n.timerDurationMs || 0)));
                    left && (n.timerRemainingMs = left, n.deadline = Date.now() + left, n.timerRunning = !0, 
                    updateTimerClock(n, el), push(n), persistNow());
                }), pauseTimer = B("Ⅱ Пауза", () => {
                    guest || n.locked || !n.deadline || (n.timerRemainingMs = Math.max(0, n.deadline - Date.now()), 
                    n.deadline = null, n.timerRunning = !1, updateTimerClock(n, el), push(n), persistNow());
                }), stopTimer = B("■ Стоп", () => {
                    guest || n.locked || (n.timerRemainingMs = Number(n.timerDurationMs) || 0, n.deadline = null, 
                    n.timerRunning = !1, updateTimerClock(n, el), push(n), persistNow());
                });
                el._timerControls = E("div", {
                    className: "timer-controls"
                }, startTimer, pauseTimer, stopTimer), el._timerControls.onpointerdown = e => e.stopPropagation(), 
                el._clock.append(dial, el._readout, el._timerStatus, el._timerControls), el.append(el._clock);
            }
            updateTimerClock(n, el);
        }
        n.poll && (el._poll || (el._poll = E("div", {
            className: "session-widget",
            contentEditable: !1
        }), el._poll.onpointerdown = e => e.stopPropagation()), el._poll.replaceChildren(...n.poll.options.map((label, i) => B(label + " · " + Object.values(n.poll.ballots || {}).filter(v => v === i).length, () => {
            guest || n.locked || (n.poll.ballots = {
                ...n.poll.ballots,
                [pollVoter]: i
            }, push(n), upsert(n));
        }))), el.querySelector(".t")?.append(el._poll)), fit();
    }, pollVoter = localStorage.getItem("aspace-voter") || uid();
    localStorage.setItem("aspace-voter", pollVoter);
    const renderAll = () => {
        queueWires(), Object.values(els).forEach(e => e.remove());
        for (const k in els) delete els[k];
        items.forEach(upsert), fit();
    }, center = () => [ (sc.scrollLeft + sc.clientWidth / 2) / z, (sc.scrollTop + sc.clientHeight / 2) / z ], add = (k, x, y, extra = {}) => {
        const D = SIZES[k], n = {
            id: uid(),
            k: k,
            x: Math.max(0, x - D[0] / 2 | 0),
            y: Math.max(0, y - D[1] / 2 | 0),
            w: D[0],
            h: D[1],
            t: "",
            f: "Open Sans",
            fs: "txt" === k ? 22 : "frame" === k ? 14 : 16,
            c: "note" === k ? FILLS[2] : FILLS[0],
            ...extra
        };
        return "frame" === k && (n.t = "Рамка"), items.push(n), upsert(n), r.emit("i", {
            n: n
        }), persist(), rec({
            t: "i",
            n: n
        }), select(n), !els[n.id]._t || "frame" === k || n.poll || n.deadline || els[n.id]._t.focus(), 
        n;
    }, rec = o => {
        undo.push(o), redo.length = 0;
    }, itemStates = nodes => nodes.map(n => ({
        id: n.id,
        state: cloneBoard(n)
    })), restoreItemStates = states => {
        for (const entry of states || []) {
            const n = items.find(x => x.id === entry.id);
            n && (Object.assign(n, cloneBoard(entry.state)), upsert(n), r.emit("i", {
                n: n
            }));
        }
        persistNow();
    }, sendStroke = s => r.emit("sp", {
        id: s.id,
        c: s.c,
        w: s.w,
        e: s.e,
        m: s.m,
        ar: s.ar,
        a: 0,
        p: s.p
    }), doUndo = () => {
        const o = undo.pop();
        o && ("i" !== o.t && "d" !== o.t || !o.n.locked ? (redo.push(o), "s" === o.t ? (strokes = strokes.filter(s => s !== o.s), 
        redraw(), r.emit("ds", {
            id: o.s.id
        })) : "i" === o.t ? delItem(o.n, 1) : "u" === o.t ? restoreItemStates(o.before) : "er" === o.t ? (strokes.push(...o.strokes), 
        redraw(), o.strokes.forEach(sendStroke), persistNow()) : (items.push(o.n), upsert(o.n), 
        r.emit("i", {
            n: o.n
        })), persist()) : undo.push(o));
    }, doRedo = () => {
        const o = redo.pop();
        if (o) if ("d" !== o.t && "i" !== o.t || !o.n.locked) {
            if (undo.push(o), "s" === o.t) strokes.push(o.s), redraw(), sendStroke(o.s); else if ("i" === o.t) items.push(o.n), 
            upsert(o.n), r.emit("i", {
                n: o.n
            }); else if ("u" === o.t) restoreItemStates(o.after); else if ("er" === o.t) {
                const ids = new Set(o.strokes.map(st => st.id));
                strokes = strokes.filter(st => !ids.has(st.id)), redraw(), o.strokes.forEach(st => r.emit("ds", {
                    id: st.id
                })), persistNow();
            } else delItem(o.n, 1);
            persist();
        } else redo.push(o);
    }, pt = e => {
        const b = cv.getBoundingClientRect();
        return [ Math.round((e.clientX - b.left) / z), Math.round((e.clientY - b.top) / z) ];
    }, flush = () => {
        if (!cur) return;
        const a = cur.ln ? 0 : Math.max(0, sent - 2);
        r.emit("sp", {
            id: cur.id,
            c: cur.c,
            w: cur.w,
            e: cur.e,
            m: cur.m,
            ar: cur.ar,
            a: a,
            p: cur.p.slice(a)
        }), sent = cur.p.length, lastT = Date.now();
    }, selectionBox = E("div", {
        className: "selection-box",
        hidden: !0
    });
    wrap.append(selectionBox);
    let marquee = null;
    function endMarquee() {
        marquee = null, selectionBox.hidden = !0;
    }
    function updateMarquee(x, y) {
        const left = Math.min(marquee.x, x), top = Math.min(marquee.y, y), right = Math.max(marquee.x, x), bottom = Math.max(marquee.y, y);
        Object.assign(selectionBox.style, {
            left: left + "px",
            top: top + "px",
            width: right - left + "px",
            height: bottom - top + "px"
        });
        const hits = items.filter(n => n.x <= right && n.x + n.w >= left && n.y <= bottom && n.y + n.h >= top);
        selectMany([ ...marquee.base, ...hits ]);
    }
    cv.onpointerdown = e => {
        if (guest) return;
        if ("touch" === e.pointerType && !e.isPrimary) return pan = null, cur = null, void endMarquee();
        e.shiftKey && "select" === tool || select(null), hidePops();
        const [x, y] = pt(e);
        if (cv.setPointerCapture(e.pointerId), "select" === tool) return marquee = {
            x: x,
            y: y,
            base: [ ...selectedItems ]
        }, selectionBox.hidden = !1, void updateMarquee(x, y);
        if ("hand" === tool) return pan = {
            x: e.clientX,
            y: e.clientY,
            l: sc.scrollLeft,
            t: sc.scrollTop
        }, void (cv.style.cursor = "grabbing");
        if (PLACE.includes(tool)) return add(tool, x, y), void setTool("select");
        if ("line" === tool || "arrow" === tool) return cur = {
            id: uid(),
            c: color,
            w: width,
            ar: "arrow" === tool ? 1 : 0,
            ln: 1,
            e: 0,
            m: 0,
            p: [ x, y, x, y ]
        }, strokes.push(cur), redraw(), void flush();
        const er = "eraser" === tool, mk = "marker" === tool;
        cur = {
            id: uid(),
            c: er ? "#000" : color,
            w: er ? eraserWidth : mk ? 20 : width,
            e: er ? 1 : 0,
            m: mk ? 1 : 0,
            p: [ x, y ]
        }, er ? (cur.erase = !0, eraseAt(x, y)) : (strokes.push(cur), seg(cur, 0), sent = 0, 
        flush());
    }, cv.onpointercancel = () => {
        endMarquee(), pan = null, cur && (cur.erase || (flush(), rec({
            t: "s",
            s: cur
        })), cur = null, persistNow());
    }, cv.onpointermove = e => {
        if (marquee) return void updateMarquee(...pt(e));
        if (pan) return sc.scrollLeft = pan.l - (e.clientX - pan.x), void (sc.scrollTop = pan.t - (e.clientY - pan.y));
        if (!cur) return;
        const [x, y] = pt(e);
        if (cur.erase) eraseAt(x, y), cur.p.push(x, y); else if (cur.ln) cur.p = [ cur.p[0], cur.p[1], x, y ], 
        redraw(); else {
            const n = cur.p.length, px = cur.p[n - 2], py = cur.p[n - 1];
            cur.p.push(Math.round(.8 * x + .2 * px), Math.round(.8 * y + .2 * py)), seg(cur, n - 2);
        }
        Date.now() - lastT > 55 && !cur.erase && flush();
    }, cv.onpointerup = e => marquee ? (updateMarquee(...pt(e)), void endMarquee()) : pan ? (pan = null, 
    void setTool(tool)) : void (cur && (cur.erase || (flush(), rec({
        t: "s",
        s: cur
    })), cur = null, persistNow())), sc.addEventListener("scroll", queueViewport, {
        passive: !0
    });
    let mousePan = null;
    sc.addEventListener("contextmenu", e => e.preventDefault()), sc.addEventListener("auxclick", e => {
        1 === e.button && e.preventDefault();
    }), sc.addEventListener("pointerdown", e => {
        "mouse" !== e.pointerType || 1 !== e.button && 2 !== e.button || (e.preventDefault(), 
        e.stopPropagation(), mousePan = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            l: sc.scrollLeft,
            t: sc.scrollTop
        }, sc.setPointerCapture(e.pointerId), sc.style.cursor = "grabbing");
    }, !0), sc.addEventListener("pointermove", e => {
        mousePan && e.pointerId === mousePan.id && (e.preventDefault(), sc.scrollLeft = mousePan.l - (e.clientX - mousePan.x), 
        sc.scrollTop = mousePan.t - (e.clientY - mousePan.y), queueViewport());
    }, !0);
    const endMousePan = e => {
        mousePan && e.pointerId === mousePan.id && (mousePan = null, sc.style.cursor = "", 
        sc.hasPointerCapture(e.pointerId) && sc.releasePointerCapture(e.pointerId), queueViewport());
    };
    sc.addEventListener("pointerup", endMousePan, !0), sc.addEventListener("pointercancel", endMousePan, !0), 
    sc.addEventListener("wheel", e => {
        e.preventDefault();
        const factor = Math.exp(.0015 * -e.deltaY), b = sc.getBoundingClientRect(), px = (e.clientX - b.left + sc.scrollLeft) / z, py = (e.clientY - b.top + sc.scrollTop) / z, nz = Math.min(2.5, Math.max(.25, z * factor));
        z = nz, applyZ(), sc.scrollLeft = px * z - (e.clientX - b.left), sc.scrollTop = py * z - (e.clientY - b.top), 
        queueViewport();
    }, {
        passive: !1
    });
    let pinch = null;
    sc.addEventListener("touchstart", e => {
        if (2 === e.touches.length) {
            endMarquee(), e.preventDefault();
            const a = e.touches[0], b = e.touches[1], r0 = sc.getBoundingClientRect();
            pinch = {
                dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
                z: z,
                x: (a.clientX + b.clientX) / 2 - r0.left + sc.scrollLeft,
                y: (a.clientY + b.clientY) / 2 - r0.top + sc.scrollTop
            };
        }
    }, {
        passive: !1
    }), sc.addEventListener("touchmove", e => {
        if (!pinch || 2 !== e.touches.length) return;
        e.preventDefault();
        const a = e.touches[0], b = e.touches[1], dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), nz = Math.min(2.5, Math.max(.25, pinch.z * dist / pinch.dist)), x = pinch.x / pinch.z, y = pinch.y / pinch.z;
        z = nz, applyZ(), sc.scrollLeft = x * z - (a.clientX + b.clientX) / 2 + sc.getBoundingClientRect().left, 
        sc.scrollTop = y * z - (a.clientY + b.clientY) / 2 + sc.getBoundingClientRect().top;
    }, {
        passive: !1
    }), sc.addEventListener("touchend", e => {
        e.touches.length < 2 && (pinch = null, queueViewport());
    }), r.on("boardstate", x => {
        const state = x.data?.state;
        state && !disposed && (guest || !unsyncedShareDraft && editEpoch === savedEpoch) && applySnapshot(state);
    }), r.on("sp", x => {
        const o = x.data;
        if (!o) return;
        let s = strokes.find(q => q.id === o.id);
        const had = !!s;
        s || (s = {
            id: o.id,
            c: o.c,
            w: o.w,
            e: o.e,
            m: o.m,
            ar: o.ar,
            ln: void 0 !== o.ar && 0 === o.a,
            p: []
        }, strokes.push(s)), s.p = s.p.slice(0, o.a).concat(o.p), had && 0 === o.a ? redraw() : seg(s, o.a), 
        persist(!0);
    }), r.on("move", event => {
        if (Array.isArray(event.data?.points)) for (const point of event.data.points) {
            const item = items.find(n => n.id === point.id);
            item && !item.locked && els[item.id] && Number.isFinite(point.x) && Number.isFinite(point.y) && geom(els[item.id], {
                ...item,
                x: point.x,
                y: point.y
            });
        }
    }), r.on("ds", x => {
        strokes = strokes.filter(q => q.id !== x.data.id), redraw(), persist(!0);
    }), r.on("i", x => {
        const o = x.data && x.data.n;
        if (!o) return;
        let n = items.find(q => q.id === o.id);
        n ? Object.assign(n, o) : (n = o, items.push(n)), upsert(n), selectedItems.includes(n) && selectMany(selectedItems), 
        persist(!0);
    }), r.on("d", x => {
        const n = items.find(q => q.id === x.data.id);
        n && (items = items.filter(q => q !== n), rmEl(n), persist(!0));
    }), r.on("clr", () => {
        strokes = [], items = [], redraw(), renderAll(), persist(!0);
    }), r.on("bg", x => {
        bg = x.data.bg, wrap.className = "wrap " + bg, sc.className = "bscroll " + bg, persist(!0);
    }), r.on("site", x => {
        x.data && (d.siteUrl = x.data.url || "", renderSite(), persist(!0));
    }), r.on("req", x => {}), r.on("state", x => {
        got || !x.data || unsyncedShareDraft || (got = !0, strokes = x.data.strokes || [], 
        items = x.data.items || [], bg = x.data.bg || bg, d.siteUrl = x.data.siteUrl || d.siteUrl || "", 
        wrap.className = "wrap " + bg, sc.className = "bscroll " + bg, renderSite(), redraw(), 
        renderAll());
    });
    const addImg = (u, w, h, x, y) => {
        const dw = Math.min(w, 460), n = {
            id: uid(),
            k: "img",
            u: u,
            x: x,
            y: y,
            w: dw,
            h: h * dw / w
        };
        items.push(n), upsert(n), r.emit("i", {
            n: n
        }), rec({
            t: "i",
            n: n
        });
    }, xml = t => String(t ?? "").replace(/[&<>\"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;"
    }[c])), makeSvg = async () => {
        let maxX = Math.max(1200, ...items.map(n => n.x + n.w + 40)), maxY = Math.max(900, ...items.map(n => n.y + n.h + 40));
        for (const stroke of strokes) for (let i = 0; i < stroke.p.length; i += 2) maxX = Math.max(maxX, stroke.p[i] + (Number(stroke.w) || 4) + 32), 
        maxY = Math.max(maxY, stroke.p[i + 1] + (Number(stroke.w) || 4) + 32);
        let out = [ `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}">`, `<rect width="100%" height="100%" fill="${"dots" === bg ? "#fffef9" : "#ffffff"}"/>` ];
        const exportedInk = [];
        for (const st of strokes) {
            let p = "";
            for (let i = 0; i < st.p.length; i += 2) p += (i ? "L" : "M") + st.p[i] + " " + st.p[i + 1] + " ";
            exportedInk.push(`<path d="${p}" fill="none" stroke="${st.e ? "#fff" : xml(st.c)}" stroke-width="${st.w}" stroke-linecap="round" stroke-linejoin="round"/>`);
        }
        for (const n of [ ...items ].sort((a, b) => (a.layer ?? ("frame" === a.k ? 2 : 3)) - (b.layer ?? ("frame" === b.k ? 2 : 3)))) {
            if ("embed" === n.k) {
                out.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="#f6f1fa" stroke="#a98cac"/><text x="${n.x + 12}" y="${n.y + 30}" font-size="16" fill="#715385">${xml(n.t || "Внешний плеер")}</text>`);
                continue;
            }
            if ("img" === n.k) {
                const src = await imgSrc(n.u);
                out.push(`<image href="${xml(src)}" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" preserveAspectRatio="none"/>`);
                continue;
            }
            if ("emo" === n.k) {
                out.push(`<text x="${n.x + n.w / 2}" y="${n.y + .82 * n.h}" text-anchor="middle" font-size="${.8 * n.w}">${xml(n.t)}</text>`);
                continue;
            }
            if ("txt" === n.k || "note" === n.k || "frame" === n.k) {
                const fill = "note" === n.k ? xml(n.c || "#f6e7b8") : "none";
                out.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${"note" === n.k ? 8 : 4}" fill="${fill}" stroke="${"frame" === n.k ? "#7f9bbd" : "none"}"/>`), 
                out.push(`<text x="${n.x + 12}" y="${n.y + Math.max(22, (n.fs || 16) + 8)}" font-family="${xml(n.f || "Arial")}" font-size="${n.fs || 16}" fill="${xml(n.col || "#3a3a46")}">${xml(n.t).split(/\\n/).map((v, i) => `<tspan x="${n.x + 12}" dy="${i ? 1.25 * (n.fs || 16) : 0}">${v}</tspan>`).join("")}</text>`);
                continue;
            }
            const fill = xml(n.c || "#B7D1EA"), stroke = "#7f9bbd";
            "oval" === n.k ? out.push(`<ellipse cx="${n.x + n.w / 2}" cy="${n.y + n.h / 2}" rx="${n.w / 2}" ry="${n.h / 2}" fill="${fill}" stroke="${stroke}"/>`) : out.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${"pill" === n.k ? 50 : "rr" === n.k ? 22 : 3}" fill="${fill}" stroke="${stroke}"/>`);
        }
        return drawWires(), out.push(wires.innerHTML, ...exportedInk, "</svg>"), new Blob([ out.join("") ], {
            type: "image/svg+xml;charset=utf-8"
        });
    }, fi = E("input", {
        type: "file",
        accept: "image/*",
        multiple: !0,
        hidden: !0,
        onchange: async () => {
            const [cx, cy] = center();
            let y = cy - 150;
            try {
                for (const f of fi.files) {
                    say("Загрузка картинки…");
                    const s = await shrink(f);
                    addImg(await upload(s.u), s.w, s.h, cx - 200, y), y += 40;
                }
                persist();
            } catch {
                alert("Не удалось загрузить картинку. Проверьте config.js и правила базы (см. инструкцию).");
            }
            say(""), fi.value = "";
        }
    }), fp = E("input", {
        type: "file",
        accept: "application/pdf",
        hidden: !0,
        onchange: async () => {
            const f = fp.files[0];
            if (f) {
                try {
                    const lib = await (pdfP || (pdfP = loadScript("vendor/pdf.min.js").then(() => "vendor/pdf.worker.min.js", () => loadScript(PDFCDN + "pdf.min.js").then(() => PDFCDN + "pdf.worker.min.js")).then(w => (pdfjsLib.GlobalWorkerOptions.workerSrc = w, 
                    pdfjsLib)))), doc = await lib.getDocument({
                        data: await f.arrayBuffer()
                    }).promise, n = Math.min(doc.numPages, 40), [cx, cy] = center(), x0 = Math.max(20, cx - 420);
                    let x = x0, y = Math.max(20, cy - 250), rh = 0;
                    for (let i = 1; i <= n; i++) {
                        say(`PDF: страница ${i} из ${n}`);
                        const pg = await doc.getPage(i), v0 = pg.getViewport({
                            scale: 1
                        }), v = pg.getViewport({
                            scale: 800 / v0.width
                        }), c = E("canvas", {
                            width: 0 | v.width,
                            height: 0 | v.height
                        });
                        await pg.render({
                            canvasContext: c.getContext("2d"),
                            viewport: v
                        }).promise;
                        const u = await upload(c.toDataURL("image/jpeg", .7)), dw = 420, dh = dw * v.height / v.width;
                        x + dw > 8172 && (x = x0, y += rh + 20, rh = 0);
                        const nn = {
                            id: uid(),
                            k: "img",
                            u: u,
                            x: x,
                            y: y,
                            w: dw,
                            h: dh
                        };
                        items.push(nn), upsert(nn), r.emit("i", {
                            n: nn
                        }), x += dw + 20, rh = Math.max(rh, dh);
                    }
                    persist();
                } catch {
                    alert("Не удалось прочитать PDF. См. раздел «Возможные ошибки» в инструкции.");
                }
                say(""), fp.value = "";
            }
        }
    }), fm = E("input", {
        type: "file",
        accept: "audio/*,video/*",
        multiple: !0,
        hidden: !0,
        onchange: async () => {
            const [cx, cy] = center();
            let y = cy - 120;
            try {
                for (const f of fm.files) {
                    if (f.size > 6291456) {
                        alert("Файл «" + f.name + "» больше 6 МиБ. Добавь большой файл внешней ссылкой.");
                        continue;
                    }
                    say("Загружаю " + f.name + "…");
                    const u = await upload(f), k = f.type.startsWith("audio/") ? "aud" : "vid", n = {
                        id: uid(),
                        k: k,
                        u: u,
                        x: Math.max(0, cx - 180),
                        y: y,
                        w: 360,
                        h: "aud" === k ? 90 : 220,
                        t: f.name
                    };
                    items.push(n), upsert(n), r.emit("i", {
                        n: n
                    }), rec({
                        t: "i",
                        n: n
                    }), y += "aud" === k ? 110 : 240;
                }
                persist();
            } catch (e) {
                alert("Не удалось загрузить медиафайл: " + e.message);
            }
            say(""), fm.value = "";
        }
    }), root = E("div", {
        className: "bfull" + (guest ? " readonly" : "")
    }, sc, toast, fi, fp, fm), sitePanel = E("section", {
        className: "site-panel"
    });
    let lastSite = d.siteUrl || "";
    const splitButton = E("button", {
        className: "tbtn split-toggle",
        title: "Раздельный экран",
        ariaLabel: "Раздельный экран",
        onclick: () => {
            if (d.siteUrl) return void applySiteUrl("");
            const raw = prompt("Ссылка для совместного просмотра", lastSite);
            null !== raw && applySiteUrl(raw);
        }
    }, ic("split")), applySiteUrl = raw => {
        let url = "";
        if (raw.trim()) try {
            const u = new URL(raw.trim());
            if (![ "http:", "https:" ].includes(u.protocol)) throw new Error;
            url = u.href;
        } catch {
            return void alert("Нужна полная ссылка, начинающаяся с https:// или http://");
        }
        d.siteUrl = url, renderSite(), persist(), r.emit("site", {
            url: url
        });
    }, renderSite = () => {
        const url = d.siteUrl || "";
        if (url && (lastSite = url), splitButton.setAttribute("aria-pressed", String(!!url)), 
        splitButton.title = url ? "Закрыть раздельный экран" : "Раздельный экран", root.classList.toggle("with-site", !!url), 
        sitePanel.style.display = url ? "flex" : "none", sitePanel.replaceChildren(), !url) return;
        const head = E("div", {
            className: "site-head"
        });
        head.append(E("b", {
            textContent: "Совместный просмотр"
        }));
        const field = E("input", {
            className: "site-url",
            type: "url",
            value: url,
            readOnly: !0,
            placeholder: "Ссылка на Yonote",
            ariaLabel: "Ссылка на Yonote"
        });
        head.append(field), head.append(B("Копировать ссылку", () => copyLink(url)), B("↗ Открыть отдельно", () => window.open(url, "_blank", "noopener,noreferrer")));
        let frameUrl = url;
        try {
            const embedded = new URL(url, location.href);
            embedded.origin === location.origin && (embedded.searchParams.set("theme", "beige"), 
            frameUrl = embedded.href);
        } catch {}
        const frame = E("iframe", {
            className: "site-frame",
            src: frameUrl,
            title: "Совместный сайт",
            referrerPolicy: "no-referrer",
            allow: "fullscreen; clipboard-read; clipboard-write"
        }), note = E("div", {
            className: "mut",
            style: "padding:5px 10px;border-top:1px solid var(--line)",
            textContent: "Если сайт запрещает встраивание, используй «Открыть отдельно». Разделение экрана и ссылка синхронизируются с учеником."
        });
        sitePanel.append(head, frame, note);
    };
    renderSite(), root.append(sitePanel);
    const tb = (icon, lb, fn, t) => {
        const b = E("button", {
            className: "tbtn",
            title: lb,
            "aria-label": lb,
            onclick: fn
        }, ic(icon));
        return t && (b.dataset.t = t), b;
    }, sep = () => E("span", {
        className: "sep"
    }), tbar = E("div", {
        className: "bar tbar"
    }), pops = [], mkpop = () => {
        const p = E("div", {
            className: "bar pop"
        });
        return p.onmousedown = e => {
            [ "SELECT", "INPUT" ].includes(e.target.tagName) || e.preventDefault();
        }, pops.push(p), root.append(p), p;
    }, hidePops = () => pops.forEach(p => p.style.display = "none"), showPop = p => {
        const was = "block" === p.style.display;
        hidePops(), p.style.display = was ? "none" : "block";
    }, setTool = t => {
        tool = t, wrap.dataset.tool = t, tbar.querySelectorAll("[data-t]").forEach(x => {
            const k = x.dataset.t;
            x.classList.toggle("on", k === t || "shape" === k && SHAPES.includes(t) || "line" === k && "arrow" === t), 
            x.setAttribute("aria-pressed", String(x.classList.contains("on")));
        }), cv.style.cursor = "select" === t ? "default" : "hand" === t ? "grab" : "pen" === t || "marker" === t || "eraser" === t || "line" === t || "arrow" === t ? "crosshair" : "copy";
    }, shp = mkpop(), shg = E("div", {
        className: "shgrid"
    });
    shp.append(shg), SHAPES.forEach(k => shg.append(E("button", {
        title: SHL[k],
        onclick: () => {
            hidePops(), setTool(k);
        }
    }, E("span", {
        className: "sp k-" + k + " " + k
    }))));
    const lnp = mkpop(), startWire = mode => {
        setTool("select"), wireMode = mode, wireSource = null, hidePops(), say("straight" === mode ? "Потяни от одной фигуры к другой — прямая стрелка." : "Потяни от одной фигуры к другой — гибкая стрелка.");
    };
    lnp.append(E("div", {
        className: "row"
    }, B("Линия", () => {
        hidePops(), setTool("line");
    }), B("Стрелка на рисунке", () => {
        hidePops(), setTool("arrow");
    }))), lnp.append(E("div", {
        className: "row"
    }, B("Прямая стрелка между фигурами", () => startWire("straight")), B("Гибкая стрелка между фигурами", () => startWire("curved"))));
    const clp = mkpop(), cw = E("div", {
        className: "cgrid"
    }), wr = E("input", {
        type: "range",
        min: 2,
        max: 24,
        value: width,
        oninput: () => {
            width = +wr.value;
        }
    }), cdot = E("button", {
        className: "cdot",
        title: "Цвет и толщина",
        onclick: () => showPop(clp)
    });
    cdot.style.background = color;
    const storedPens = ls.g("aspace-pen-palette", []), penColors = new Set([ ...INK, ...Array.isArray(storedPens) ? storedPens.filter(c => /^#[0-9a-f]{6}$/i.test(c) && !INK.includes(c.toLowerCase())) : [] ].map(c => c.toLowerCase()));
    function drawPenPalette() {
        cw.replaceChildren(...Array.from(penColors, c => {
            const holder = E("span", {
                className: "palette-swatch"
            }), swatch = B("", () => penColor(c), "sw");
            if (swatch.style.background = c, swatch.title = c, swatch.ariaLabel = "Цвет " + c, 
            holder.append(swatch), !INK.includes(c)) {
                const remove = B("×", () => {
                    penColors.delete(c), ls.s("aspace-pen-palette", [ ...penColors ]), drawPenPalette();
                }, "sw-remove");
                remove.title = "Удалить цвет", holder.append(remove);
            }
            return holder;
        }));
    }
    drawPenPalette();
    const keepPen = B("＋ Добавить цвет", () => {
        const c = penSpectrum.value.toLowerCase();
        penColor(c), penColors.add(c), ls.s("aspace-pen-palette", [ ...penColors ]), drawPenPalette();
    });
    function penColor(value) {
        color = value, cdot.style.background = value, penSpectrum.value = value, [ "pen", "marker", "line", "arrow" ].includes(tool) || setTool("pen");
    }
    const penSpectrum = E("input", {
        type: "color",
        value: color,
        title: "Спектр карандаша",
        oninput: e => penColor(e.target.value)
    }), penEye = B("Пипетка", async () => {
        if (!window.EyeDropper) return hidePops(), say("Нажми на рисунок или фигуру, чтобы взять цвет."), 
        void wrap.addEventListener("pointerdown", e => {
            e.preventDefault(), e.stopImmediatePropagation();
            const shape = items.find(n => n.id === e.target.closest(".it")?.dataset.itemId);
            if (shape?.c && /^#[0-9a-f]{6}$/i.test(shape.c)) return penColor(shape.c), void say("");
            const [x, y] = pt(e);
            for (const surface of [ ctx, ctxM ]) {
                const [red, green, blue, alpha] = surface.getImageData(x, y, 1, 1).data;
                if (alpha) return penColor("#" + [ red, green, blue ].map(v => v.toString(16).padStart(2, "0")).join("")), 
                void say("");
            }
            say("В этой точке нет штриха или заливки.");
        }, {
            capture: !0,
            once: !0
        });
        try {
            penColor((await (new EyeDropper).open()).sRGBHex);
        } catch (err) {
            "AbortError" !== err.name && say("Пипетка недоступна");
        }
    });
    clp.append(cw, E("div", {
        className: "row"
    }, E("span", {
        className: "mut",
        textContent: "Любой цвет"
    }), penSpectrum, penEye, keepPen), E("div", {
        className: "row",
        style: "margin-top:10px"
    }, E("span", {
        className: "mut",
        textContent: "Толщина карандаша"
    }), wr));
    const erp = mkpop(), erw = E("input", {
        type: "range",
        min: 4,
        max: 120,
        step: 1,
        value: eraserWidth,
        oninput: () => {
            eraserWidth = +erw.value, erSize.textContent = eraserWidth + " px";
        }
    }), erSize = E("span", {
        className: "mut",
        textContent: eraserWidth + " px"
    });
    erp.append(E("div", {
        className: "row"
    }, E("b", {
        textContent: "Размер ластика"
    }), erSize), erw, E("div", {
        className: "mut",
        textContent: "Можно менять от 4 до 120 пикселей."
    }));
    const sym = mkpop(), tabs = E("div", {
        className: "row"
    }), grid = E("div", {
        className: "symgrid"
    });
    sym.append(tabs, grid);
    const showSyms = k => {
        grid.replaceChildren(...SYMS[k].split(" ").filter(Boolean).map(symbol => B(symbol, () => {
            if ("txt" === sel?.k && els[sel.id]?._t === document.activeElement) return document.execCommand("insertText", !1, symbol), 
            void hidePops();
            const [x, y] = center();
            add("emo", x, y, {
                t: symbol
            }), hidePops();
        }))), [ ...tabs.children ].forEach(b => b.classList.toggle("on", b.textContent === k));
    };
    Object.keys(SYMS).forEach(k => tabs.append(B(k, () => showSyms(k)))), showSyms("Звёзды"), 
    tbar.append(tb("select", "Выбрать", () => setTool("select"), "select"), tb("hand", "Рука", () => setTool("hand"), "hand"), sep(), tb("pen", "Карандаш и палитра", () => {
        setTool("pen"), showPop(clp);
    }, "pen"), tb("marker", "Маркер", () => setTool("marker"), "marker"), tb("eraser", "Ластик · размер", () => {
        setTool("eraser"), showPop(erp);
    }, "eraser"), cdot, sep(), tb("text", "Текст", () => setTool("txt"), "txt"), tb("note", "Стикер", () => setTool("note"), "note"), tb("shape", "Фигуры", () => showPop(shp), "shape"), tb("line", "Линии и стрелки", () => showPop(lnp), "line"), tb("frame", "Рамка", () => setTool("frame"), "frame"), tb("sym", "Символы и эмодзи", () => showPop(sym)), sep(), tb("img", "Картинка", () => fi.click()), tb("pdf", "PDF → картинки", () => fp.click()), tb("video", "Аудио / видео", () => fm.click()), tb("link", "Медиа по ссылке: YouTube, Vimeo, SoundCloud, фото", () => {
        const raw = prompt("Вставь ссылку на Google Диск, Яндекс Диск, YouTube, Vimeo, SoundCloud, изображение или прямую ссылку MP3/MP4 (https://):", "");
        if (null === raw) return;
        const resource = externalMedia(raw);
        if (!resource) return void alert("Ссылка не поддерживается. Для видео: YouTube/Vimeo, для аудио: SoundCloud или прямая MP3, для фото: HTTPS-ссылка на картинку.");
        const [cx, cy] = center();
        "img" === resource.kind ? addImg(resource.url, 640, 400, Math.max(0, cx - 210), Math.max(0, cy - 140)) : add(resource.kind, cx, cy, {
            u: "embed" === resource.kind ? raw : resource.url,
            t: resource.host,
            w: resource.audio ? 440 : 460,
            h: resource.audio ? 175 : 280
        }) && persist(), persist(), say("Добавлено по ссылке, без загрузки в наши базы");
    }));
    const fbar = E("div", {
        className: "bar fbar",
        ariaLabel: "Настройки выбранного элемента"
    }), fontSec = E("div", {
        className: "row nw"
    }), fillSec = E("div", {
        className: "row nw"
    }), fsel = E("select", {
        onchange: () => fmt("f", fsel.value)
    }, ...FONTS.map(f => {
        const o = E("option", {
            value: f,
            textContent: f
        });
        return o.style.fontFamily = `'${f}'`, o;
    })), ssel = E("select", {
        onchange: () => fmt("fs", +ssel.value)
    }, ...[ 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80 ].map(x => E("option", {
        value: x,
        textContent: x
    }))), bB = B("B", () => fmt("b", !sel?.b)), bI = B("I", () => fmt("i", !sel?.i)), bU = B("U", () => fmt("ul", !sel?.ul));
    bB.style.fontWeight = 700, bI.style.fontStyle = "italic", bU.style.textDecoration = "underline", 
    fontSec.append(fsel, ssel, bB, bI, bU);
    const defaultTextPalette = [ ...INK ];
    let textPalette = ls.g("aspace-text-palette", defaultTextPalette);
    Array.isArray(textPalette) || (textPalette = [ ...defaultTextPalette ]), textPalette = [ ...new Set([ ...defaultTextPalette, ...textPalette.filter(c => /^#[0-9a-f]{6}$/i.test(c) && !defaultTextPalette.includes(c.toLowerCase())) ]) ];
    const drawTextPalette = () => {
        fontSec.querySelectorAll("[data-text-color]").forEach(x => x.remove()), textPalette.forEach(c => {
            const holder = E("span", {
                className: "palette-swatch",
                "data-text-color": "1"
            }), sw = E("button", {
                className: "sw",
                title: "Цвет текста " + c,
                onclick: () => fmt("col", c)
            });
            if (holder.dataset.textColor = "1", sw.style.background = c, sw.style.borderColor = "#fff", 
            holder.append(sw), !defaultTextPalette.includes(c)) {
                const rm = B("×", () => {
                    textPalette = textPalette.filter(x => x !== c), ls.s("aspace-text-palette", textPalette), 
                    drawTextPalette();
                }, "sw-remove");
                rm.title = "Удалить цвет", holder.append(rm);
            }
            fontSec.append(holder);
        });
    }, customColor = E("input", {
        type: "color",
        value: "#49372f",
        title: "Выбрать собственный цвет текста",
        style: "width:30px;height:30px;padding:2px;border:0;border-radius:50%;cursor:pointer;flex:none"
    });
    customColor.onchange = () => fmt("col", customColor.value.toLowerCase());
    const addTextColor = B("＋", () => {
        const c = customColor.value.toLowerCase();
        textPalette.includes(c) || (textPalette.push(c), ls.s("aspace-text-palette", textPalette), 
        drawTextPalette()), fmt("col", c);
    }), textEye = B("◉", async () => {
        if (window.EyeDropper) try {
            const c = (await (new EyeDropper).open()).sRGBHex.toLowerCase();
            customColor.value = c, textPalette.includes(c) || (textPalette.push(c), ls.s("aspace-text-palette", textPalette), 
            drawTextPalette()), fmt("col", c);
        } catch (e) {
            "AbortError" !== e.name && alert(e.message);
        } else alert("Пипетка недоступна в этом браузере.");
    });
    fontSec.append(customColor, addTextColor, textEye), drawTextPalette();
    const defaultShapePalette = [ ...FILLS ];
    let shapePalette = ls.g("aspace-shape-palette", defaultShapePalette);
    Array.isArray(shapePalette) || (shapePalette = [ ...defaultShapePalette ]), shapePalette = [ ...new Set([ ...defaultShapePalette, ...shapePalette.filter(c => /^#[0-9a-f]{6}$/i.test(c) && !defaultShapePalette.includes(c.toLowerCase())) ]) ];
    const shapeSwatches = E("div", {
        className: "row nw",
        style: "gap:3px;align-items:center"
    }), drawShapes = () => {
        shapeSwatches.replaceChildren(...shapePalette.map(c => {
            const holder = E("span", {
                className: "palette-swatch"
            }), s = E("button", {
                className: "sw",
                title: "Цвет фигуры " + c,
                onclick: () => fmt("c", c)
            });
            if (s.style.background = c, holder.append(s), !defaultShapePalette.includes(c)) {
                const rm = B("×", () => {
                    shapePalette = shapePalette.filter(x => x !== c), ls.s("aspace-shape-palette", shapePalette), 
                    drawShapes();
                }, "sw-remove");
                rm.title = "Удалить цвет", holder.append(rm);
            }
            return holder;
        }));
    };
    drawShapes(), fillSec.append(shapeSwatches);
    const shapeColor = E("input", {
        type: "color",
        value: "#b7d1ea",
        title: "Спектр: любой цвет фигуры",
        style: "width:34px;height:34px;padding:2px;border:0;border-radius:50%;cursor:pointer;flex:none"
    });
    shapeColor.oninput = () => fmt("c", shapeColor.value);
    const keepColor = B("＋ Цвет", () => {
        const v = shapeColor.value.toLowerCase();
        shapePalette.includes(v) || (shapePalette.push(v), ls.s("aspace-shape-palette", shapePalette), 
        drawShapes()), fmt("c", v);
    }), eyeShape = B("◉ Пипетка", async () => {
        if (window.EyeDropper) try {
            const v = (await (new EyeDropper).open()).sRGBHex.toLowerCase();
            shapeColor.value = v, fmt("c", v), shapePalette.includes(v) || (shapePalette.push(v), 
            ls.s("aspace-shape-palette", shapePalette), drawShapes());
        } catch (e) {
            "AbortError" !== e.name && alert(e.message);
        } else alert("Пипетка недоступна в этом браузере. Используй цветовой спектр.");
    });
    fillSec.append(shapeColor, keepColor, eyeShape), fbar.onmousedown = e => {
        [ "SELECT", "INPUT" ].includes(e.target.tagName) || e.preventDefault();
    };
    const fmt = (k, v) => {
        !sel || sel.locked || guest || (sel[k] = v, upsert(sel), push(sel), syncBar());
    }, wireTools = E("div", {
        className: "row nw"
    });
    function wireControls(n) {
        if (wireTools.replaceChildren(), n && !n.locked && !guest) {
            wireTools.append(B("Стрелка →", () => {
                wireSource = n, say("Выбери фигуру, к которой ведёт стрелка. Esc — отмена.");
            }));
            for (const link of n.arrows || []) {
                if (!items.some(q => q.id === link.to)) continue;
                const save = () => {
                    guest || n.locked || (queueWires(), push(n));
                };
                wireTools.append(E("input", {
                    type: "color",
                    value: link.color,
                    title: "Цвет стрелки",
                    oninput: e => {
                        link.color = e.target.value, save();
                    }
                }), E("input", {
                    type: "range",
                    min: -280,
                    max: 280,
                    value: link.bend || 0,
                    title: "Изгиб стрелки",
                    oninput: e => {
                        link.bend = Number(e.target.value), save();
                    }
                }), B("×", () => {
                    n.arrows = n.arrows.filter(q => q !== link), save(), wireControls(n);
                }));
            }
        }
    }
    const wirePoint = e => {
        const r = wrap.getBoundingClientRect();
        return [ (e.clientX - r.left) / z, (e.clientY - r.top) / z ];
    };
    wrap.addEventListener("pointerdown", e => {
        if (guest) return;
        const port = e.target.closest(".wire-port"), source = items.find(n => n.id === e.target.closest(".it")?.dataset.itemId);
        if (port) {
            if (!source || source.locked) return;
            wireSource = null, wireMode = e.shiftKey ? "curved" : "straight";
        }
        if (!wireMode || !source || source.locked) return;
        e.preventDefault(), e.stopPropagation();
        const [x, y] = wirePoint(e), side = port ? [ ...port.classList ].find(k => [ "top", "right", "bottom", "left" ].includes(k)) : null, sx = "top" === side ? source.x + source.w / 2 : "right" === side ? source.x + source.w : "bottom" === side ? source.x + source.w / 2 : "left" === side ? source.x : source.x + source.w / 2, sy = "top" === side ? source.y : "right" === side ? source.y + source.h / 2 : "bottom" === side ? source.y + source.h : source.y + source.h / 2;
        wireDrag = {
            source: source,
            pointerId: e.pointerId,
            x: x,
            y: y,
            startX: sx,
            startY: sy
        }, wrap.setPointerCapture(e.pointerId), wirePreview = svgNode("path", {
            fill: "none",
            stroke: "#71384f",
            "stroke-width": 3,
            "stroke-dasharray": "7 5",
            "pointer-events": "none"
        }), wires.append(wirePreview);
    }, !0), wrap.addEventListener("pointermove", e => {
        if (!wireDrag || e.pointerId !== wireDrag.pointerId) return;
        const [x, y] = wirePoint(e), ax = (wireDrag.source, wireDrag.startX), ay = wireDrag.startY, bend = "curved" === wireMode ? 100 : 0, dx = x - ax, dy = y - ay, len = Math.hypot(dx, dy) || 1, cx = (ax + x) / 2 - dy / len * bend, cy = (ay + y) / 2 + dx / len * bend;
        wirePreview?.setAttribute("d", "M " + ax + " " + ay + " Q " + cx + " " + cy + " " + x + " " + y);
    }, !0), wrap.addEventListener("pointerup", e => {
        if (!wireDrag || e.pointerId !== wireDrag.pointerId) return;
        const targetEl = document.elementFromPoint(e.clientX, e.clientY), target = items.find(n => n.id === targetEl?.closest?.(".it")?.dataset.itemId), source = wireDrag.source;
        target && target !== source && !target.locked ? ((source.arrows ||= []).push({
            to: target.id,
            color: "#71384f",
            bend: "curved" === wireMode ? 100 : 0
        }), queueWires(), push(source), select(source), say("Стрелка добавлена.")) : say("Стрелка не создана: отпусти её на другой фигуре."), 
        wirePreview?.remove(), wirePreview = null, wireDrag = null, wireMode = null;
    }, !0), wrap.addEventListener("pointercancel", () => {
        wireDrag && (wirePreview?.remove(), wirePreview = null, wireDrag = null, wireMode = null);
    }, !0), wrap.addEventListener("pointerdown", e => {
        if (!wireSource || guest) return;
        if (wireSource.locked) return void (wireSource = null);
        e.stopPropagation(), e.preventDefault();
        const target = items.find(n => n.id === e.target.closest(".it")?.dataset.itemId);
        if (!target || target === wireSource) return;
        const source = wireSource;
        wireSource = null, (source.arrows ||= []).push({
            to: target.id,
            color: "#71384f",
            bend: 0
        }), queueWires(), push(source), select(source), say("");
    }, !0);
    const syncBar = () => {
        sel && (wireControls(sel), fsel.value = sel.f || "Open Sans", ssel.value = sel.fs || 16, 
        /^#[0-9a-f]{6}$/i.test(sel.c || "") && (objectColor.value = sel.c), bB.classList.toggle("on", !!sel.b), 
        bI.classList.toggle("on", !!sel.i), bU.classList.toggle("on", !!sel.ul));
    }, lockButton = B("Заблокировать", () => {
        if (guest || !selectedItems.length) return;
        const locked = !selectedItems.every(n => n.locked);
        for (const n of selectedItems) n.locked = locked, upsert(n), push(n);
        selectMany(selectedItems);
    });
    let formatTab = null;
    const formatBody = E("div", {
        className: "format-body",
        hidden: !0
    }, fontSec, fillSec, wireTools), formatTabs = {};
    for (const [key, label, title] of [ [ "text", "Aa", "Текст и шрифт" ], [ "fill", "Цвет", "Заливка" ], [ "links", "↗", "Связи и стрелки" ] ]) formatTabs[key] = E("button", {
        textContent: label,
        title: title,
        ariaLabel: title,
        ariaExpanded: "false",
        onclick: () => {
            return formatTab = formatTab === (tab = key) ? null : tab, updateFormatSections(), 
            void queueFormatPosition();
            var tab;
        }
    });
    let copiedBoardItems = [];
    const copySelected = () => !(guest || !selectedItems.length || (copiedBoardItems = selectedItems.map(n => cloneBoard(n)), 
    say("Скопировано объектов: " + copiedBoardItems.length), 0));
    let pasteOffset = 0;
    const pasteCopied = () => {
        if (guest || !copiedBoardItems.length) return !1;
        const idMap = new Map(copiedBoardItems.map(n => [ n.id, uid() ])), groupMap = new Map, pasted = copiedBoardItems.map(source => {
            const n = cloneBoard(source), oldId = n.id;
            return n.id = idMap.get(oldId), n.x = Math.max(0, (Number(n.x) || 0) + 24 * ++pasteOffset), 
            n.y = Math.max(0, (Number(n.y) || 0) + 24 * pasteOffset), n.locked = !1, n.group && (groupMap.has(n.group) || groupMap.set(n.group, uid()), 
            n.group = groupMap.get(n.group)), n.arrows = (n.arrows || []).filter(a => idMap.has(a.to)).map(a => ({
                ...a,
                to: idMap.get(a.to)
            })), n;
        });
        for (const n of pasted) items.push(n), upsert(n), r.emit("i", {
            n: n
        }), rec({
            t: "i",
            n: n
        });
        return fit(), selectMany(pasted), persistNow(), say("Вставлено объектов: " + pasted.length), 
        !0;
    }, copyButton = E("button", {
        textContent: "⧉",
        title: "Копировать (Ctrl+C)",
        ariaLabel: "Копировать",
        onclick: copySelected
    }), pasteButton = E("button", {
        textContent: "▣",
        title: "Вставить (Ctrl+V)",
        ariaLabel: "Вставить",
        onclick: pasteCopied
    }), duplicateSelected = E("button", {
        textContent: "⧉",
        title: "Дублировать",
        ariaLabel: "Дублировать",
        onclick: () => {
            for (const n of [ ...selectedItems ]) dup(n);
        }
    }), deleteSelected = E("button", {
        textContent: "×",
        title: "Удалить",
        ariaLabel: "Удалить",
        onclick: () => {
            for (const n of [ ...selectedItems ]) delItem(n);
        }
    }), objectColor = E("input", {
        type: "color",
        value: "#800020",
        title: "Изменить цвет стикера, фигуры или символа",
        ariaLabel: "Изменить цвет объекта",
        className: "object-color-picker",
        oninput: e => fmt("c", e.target.value.toLowerCase())
    }), objectColorLabel = E("label", {
        className: "object-color-control",
        title: "Цвет объекта"
    }, E("span", {
        textContent: "Цвет"
    }), objectColor), arrange = E("select", {
        title: "Слои и группы",
        ariaLabel: "Слои и группы"
    });
    for (const [key, label] of [ [ "", "Слои и группы" ], [ "front", "На передний план" ], [ "back", "На задний план" ], [ "group", "Объединить в группу" ], [ "ungroup", "Разгруппировать" ] ]) arrange.append(E("option", {
        value: key,
        textContent: label
    }));
    function updateFormatSections() {
        const editable = 1 === selectedItems.length && !sel?.locked, allowed = {
            text: editable && !sel.deadline && (FILLK.includes(sel.k) || "txt" === sel.k),
            fill: editable && !sel.deadline && (FILLK.includes(sel.k) || "emo" === sel.k),
            links: editable
        };
        allowed[formatTab] || (formatTab = null), objectColorLabel.hidden = !(editable && (FILLK.includes(sel.k) || "emo" === sel.k));
        for (const [key, section] of [ [ "text", fontSec ], [ "fill", fillSec ], [ "links", wireTools ] ]) formatTabs[key].hidden = !allowed[key], 
        formatTabs[key].classList.toggle("on", formatTab === key), formatTabs[key].setAttribute("aria-expanded", String(formatTab === key)), 
        section.style.display = formatTab === key ? "flex" : "none";
        formatBody.hidden = !formatTab;
    }
    function queueFormatPosition() {
        formatFrame || (formatFrame = requestAnimationFrame(positionFormatBar));
    }
    function positionFormatBar() {
        if (formatFrame = 0, disposed || !sel || guest || !fbar.isConnected) return;
        const bounds = els[sel.id]?.getBoundingClientRect();
        if (!bounds) return;
        const topEdge = topDock.getBoundingClientRect().bottom + 8, bottomEdge = bottomDock.getBoundingClientRect().top - 8, offscreen = bounds.right < 0 || bounds.left > window.innerWidth || bounds.bottom < topEdge || bounds.top > window.innerHeight - 70;
        if (fbar.style.visibility = offscreen ? "hidden" : "visible", offscreen) return;
        const width = fbar.offsetWidth, height = fbar.offsetHeight;
        let left = bounds.left + (bounds.width - width) / 2, top = bounds.top - height - 12;
        top < topEdge && (bounds.bottom + 12 + height < bottomEdge ? top = bounds.bottom + 12 : (left = bounds.right + 12, 
        top = bounds.top, left + width > window.innerWidth - 8 && (left = bounds.left - width - 12))), 
        fbar.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, left)) + "px", 
        fbar.style.top = Math.max(topEdge, Math.min(Math.max(topEdge, bottomEdge - height), top)) + "px";
    }
    arrange.onchange = () => {
        const action = arrange.value;
        if (arrange.value = "", !action || guest || selectedItems.some(n => n.locked)) return;
        if ("group" === action && selectedItems.length < 2) return void say("Выдели несколько объектов с Shift или рамкой.");
        const group = "group" === action ? uid() : null;
        if ("front" === action || "back" === action) {
            const ordered = [ ...items ].sort((a, b) => (a.layer ?? ("frame" === a.k ? 2 : 3)) - (b.layer ?? ("frame" === b.k ? 2 : 3))), moved = ordered.filter(n => selectedItems.includes(n)), others = ordered.filter(n => !selectedItems.includes(n));
            ("front" === action ? [ ...others, ...moved ] : [ ...moved, ...others ]).forEach((n, i) => {
                n.layer !== i + 2 && (n.layer = i + 2, geom(els[n.id], n), push(n));
            });
        } else for (const n of selectedItems) n.group = group, push(n);
    }, fbar.append(E("div", {
        className: "format-main"
    }, E("label", {
        className: "layer-picker",
        title: "Слои и группы"
    }, ic("layers"), arrange), lockButton, formatTabs.text, formatTabs.fill, objectColorLabel, formatTabs.links, copyButton, pasteButton, duplicateSelected, deleteSelected), formatBody), 
    sc.addEventListener("scroll", queueFormatPosition, {
        passive: !0
    }), window.addEventListener("resize", queueFormatPosition);
    const formatObserver = new ResizeObserver(queueFormatPosition);
    function selectMany(group) {
        const groups = new Set(group.map(n => n.group).filter(Boolean)), next = new Set([ ...group, ...items.filter(n => groups.has(n.group)) ]);
        for (const n of selectedItems) next.has(n) || els[n.id]?.classList.remove("sel");
        const previous = sel;
        selectedItems = [ ...next ], sel = selectedItems.at(-1) || null, previous !== sel && (formatTab = null);
        for (const n of selectedItems) els[n.id]?.classList.add("sel");
        fbar.style.display = sel && !guest ? "flex" : "none", sel && (lockButton.replaceChildren(ic(selectedItems.every(n => n.locked) ? "unlock" : "lock")), 
        lockButton.title = selectedItems.every(n => n.locked) ? "Разблокировать" : "Заблокировать", 
        lockButton.setAttribute("aria-label", lockButton.title), duplicateSelected.disabled = deleteSelected.disabled = selectedItems.some(n => n.locked), 
        updateFormatSections(), syncBar(), queueFormatPosition());
    }
    formatObserver.observe(fbar);
    const select = n => selectMany(n?.group ? items.filter(q => q.group === n.group) : n ? [ n ] : []);
    function updateTimerClock(n, el) {
        const running = !!n.deadline;
        let remaining = running ? Math.max(0, n.deadline - Date.now()) : Math.max(0, Number(n.timerRemainingMs ?? n.timerDurationMs ?? 0));
        running && 0 === remaining && (n.timerRemainingMs = 0, n.deadline = null, n.timerRunning = !1, 
        push(n), persistNow());
        const seconds = Math.ceil(remaining / 1e3);
        if (el._readout.textContent = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0"), 
        el._timerStatus.textContent = seconds ? running ? "Идёт" : remaining === Number(n.timerDurationMs) ? "Готов" : "На паузе" : "Время вышло", 
        el._hand.style.transform = "rotate(" + seconds % 60 * 6 + "deg)", el.classList.toggle("timer-expired", 0 === seconds), 
        el._timerControls) {
            const [start, pause, stop] = el._timerControls.children;
            start.disabled = running || 0 === seconds, pause.disabled = !running, stop.disabled = remaining === Number(n.timerDurationMs) && !running;
        }
    }
    tbar.append(sep(), tb("vote", "Голосование", function() {
        const question = prompt("Вопрос для голосования");
        if (!question?.trim()) return;
        const raw = prompt("Варианты ответа (каждый с новой строки)", "Да\nНет");
        if (null === raw) return;
        const options = raw.split("\n").map(x => x.trim()).filter(Boolean).slice(0, 8);
        if (options.length < 2) return say("Нужно минимум два варианта.");
        add("note", ...center(), {
            t: question.trim(),
            c: "#eef2ff",
            w: 280,
            h: 260,
            poll: {
                options: options,
                ballots: {}
            }
        });
    }), tb("timer", "Таймер", function() {
        const raw = prompt("Таймер: сколько минут?", "5");
        if (null === raw) return;
        const minutes = Number(raw.replace(",", "."));
        if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) return say("Введи время от 0 до 1440 минут.");
        const durationMs = 6e4 * minutes;
        add("note", ...center(), {
            t: "Таймер",
            c: "#eef2ff",
            timerDurationMs: durationMs,
            timerRemainingMs: durationMs,
            timerRunning: !1,
            deadline: null,
            w: 220,
            h: 220
        });
    }));
    const sessionTicker = setInterval(() => {
        for (const n of items) (n.deadline || Number.isFinite(n.timerDurationMs)) && els[n.id]?._clock && updateTimerClock(n, els[n.id]);
    }, 500), hist = E("div", {
        className: "bar hist"
    }, tb("undo", "Отменить (Ctrl+Z)", doUndo), tb("redo", "Повторить (Ctrl+Y)", doRedo)), zl = E("span", {
        className: "zl",
        textContent: "100%"
    }), zoom = E("div", {
        className: "bar zoom"
    }, B("−", () => setZ(z / 1.2)), zl, B("+", () => setZ(1.2 * z)), B("100%", () => setZ(1))), openVideo = (autoJoin = !1) => {
        if (persistentCallSession) return persistentCallSession.window.classList.remove("min"), 
        void (persistentCallSession.window.style.display = "");
        if (vw) return void vw.classList.remove("min");
        const grid = E("div", {
            className: "vgrid"
        }), vbar = E("div", {
            className: "vbar"
        }), hd = E("div", {
            className: "vh"
        }, E("span", {
            textContent: "Видеозвонок"
        }));
        vw = E("div", {
            className: "vwin"
        }, hd, grid, vbar);
        const close = () => {
            call && call.stop(), call = null, callRoom?.close(), callRoom = null, document.fullscreenElement && document.exitFullscreen(), 
            vw.remove(), vw = null;
        }, fs = () => document.fullscreenElement ? document.exitFullscreen() : vw.requestFullscreen();
        hd.append(E("span", {
            className: "row"
        }, E("button", {
            textContent: "−",
            title: "Свернуть / развернуть видео",
            ariaLabel: "Свернуть / развернуть видео",
            onclick: () => vw.classList.toggle("min")
        }), B("End call", close, "end-call")));
        const thisWindow = vw, go = B("Включить камеру и войти", async () => {
            go.disabled = !0, go.textContent = "Подключаю канал звонка…";
            try {
                const callPath = activeShareToken ? "/shares/" + encodeURIComponent(activeShareToken) + "/room/call" : "/rooms/" + encodeURIComponent("b-" + id) + "/call", channel = await room0.join("call-" + id, callPath);
                if (disposed || vw !== thisWindow) return void channel.close();
                callRoom = channel;
                const session = Call(channel, grid);
                if (call = session, await session.start(), disposed || vw !== thisWindow) return session.stop(), 
                void channel.close();
            } catch (e) {
                if (disposed || vw !== thisWindow) return;
                return alert(e.message), call && call.stop(), call = null, callRoom?.close(), callRoom = null, 
                go.disabled = !1, void (go.textContent = "Включить камеру и войти");
            }
            go.remove();
            let ns = !0;
            const mic = E("button", {
                title: "Микрофон",
                onclick: async () => {
                    try {
                        mic.classList.toggle("off", !await call.mic());
                    } catch (e) {
                        alert(e.message);
                    }
                }
            }, ic("mic")), cam = E("button", {
                title: "Камера",
                onclick: async () => {
                    try {
                        cam.classList.toggle("off", !await call.cam());
                    } catch (e) {
                        alert(e.message);
                    }
                }
            }, ic("video")), nz = B("Шумодав", async () => {
                ns = !ns, await call.noise(ns), nz.classList.toggle("on", ns);
            });
            nz.classList.add("on");
            const cams = devicePicker(call, "videoinput", "Камера"), mics = devicePicker(call, "audioinput", "Микрофон"), speakers = devicePicker(call, "audiooutput", "Динамик"), zc = call.zoomCaps();
            zc && vbar.append(E("input", {
                type: "range",
                min: zc.min,
                max: zc.max,
                step: zc.step || .1,
                value: zc.min,
                title: "Приблизить / отдалить камеру",
                oninput: e => call.zoom(+e.target.value)
            })), compactCallControls(vbar, mic, cam, nz, cams, mics, speakers, B("⛶", fs), B("Выйти", close));
        });
        grid.append(go), hd.style.touchAction = "none", hd.onpointerdown = e => {
            if (e.target.closest("button,summary,select")) return;
            hd.setPointerCapture(e.pointerId);
            const b = vw.getBoundingClientRect(), ox = e.clientX - b.left, oy = e.clientY - b.top;
            hd.onpointermove = ev => {
                vw.style.right = "auto", vw.style.left = Math.max(0, ev.clientX - ox) + "px", vw.style.top = Math.max(0, ev.clientY - oy) + "px";
            }, hd.onpointerup = () => {
                hd.onpointermove = hd.onpointerup = null;
            };
        }, root.append(vw), !0 === autoJoin && go.click();
    }, chat = E("details", {
        className: "board-chat"
    }), chatTab = E("summary", {
        textContent: "Чат"
    }), chatLog = E("div", {
        className: "chat-log",
        role: "log",
        ariaLabel: "Сообщения урока"
    }), chatStatus = E("small", {
        role: "status",
        textContent: "Подключаю чат…"
    }), chatInput = E("input", {
        type: "text",
        maxLength: 1e3,
        placeholder: "Сообщение",
        ariaLabel: "Сообщение",
        disabled: !0
    }), chatSend = E("button", {
        type: "submit",
        textContent: "Отправить",
        disabled: !0
    }), chatForm = E("form", {
        className: "chat-form"
    }, chatInput, chatSend);
    chat.append(chatTab, E("div", {
        className: "chat-panel"
    }, chatLog, chatStatus, chatForm));
    const chatIds = new Set;
    let unreadChat = 0;
    function showChat(message, mine) {
        if (!message || "string" != typeof message.id || message.id.length > 100 || chatIds.has(message.id) || "string" != typeof message.text || !message.text.trim() || message.text.length > 1e3) return;
        chatIds.add(message.id);
        const row = E("div", {
            className: mine ? "chat-line own" : "chat-line"
        }, E("b", {
            textContent: mine ? "Вы" : String(message.name || "Участник").slice(0, 60)
        }), E("span", {
            textContent: message.text
        })), atEnd = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 32;
        chatLog.append(row), chatLog.children.length > 200 && (chatLog.firstElementChild.remove(), 
        chatIds.delete(chatIds.values().next().value)), (atEnd || mine) && (chatLog.scrollTop = chatLog.scrollHeight), 
        mine || chat.open || (chatTab.textContent = "Чат · " + ++unreadChat);
    }
    chat.ontoggle = () => {
        chat.open && (unreadChat = 0, chatTab.textContent = "Чат", chatLog.scrollTop = chatLog.scrollHeight, 
        chatInput.focus());
    }, chat.open = !0, r.on("chat", event => showChat(event.data, !1)), chatForm.onsubmit = async event => {
        event.preventDefault();
        const text = chatInput.value.trim();
        if (!text || chatSend.disabled) return;
        const message = {
            id: crypto.randomUUID(),
            name: myName,
            text: text
        };
        chatSend.disabled = !0;
        try {
            if (!await r.emit("chat", message)) throw Error();
            showChat(message, !0), chatInput.value.trim() === text && (chatInput.value = ""), 
            chatStatus.textContent = "Отправлено";
        } catch {
            chatStatus.textContent = "Не отправлено. Попробуй ещё раз.";
        } finally {
            chatSend.disabled = !1;
        }
    };
    const meetingServices = [ {
        name: "SaluteJazz",
        field: "jazzUrl",
        hosts: [ "salutejazz.ru", "jazz.sberbank.ru" ]
    }, {
        name: "Телемост",
        field: "telemostUrl",
        hosts: [ "telemost.yandex.ru", "telemost.360.yandex.ru", "telemost.yandex.com", "telemost.360.yandex.com" ]
    } ], meetingUrl = boardInvitationUrl;
    for (const service of meetingServices) service.section = E("section"), service.join = B("Войти в " + service.name, () => launchMeeting(service), "mbtn");
    function launchMeeting(service, invitation) {
        let url = meetingUrl(invitation || publicMeetingUrl(service) || d[service.field], service);
        if (!url) return;
        const width = Math.min(480, Math.max(320, window.innerWidth - 24)), height = Math.min(620, Math.max(420, window.innerHeight - 80)), left = Math.max(0, Math.round(window.screenX + window.outerWidth - width)), top = Math.max(0, Math.round(window.screenY)), popup = window.open("about:blank", "_blank", "popup=yes,resizable=yes,scrollbars=yes,width=" + width + ",height=" + height + ",left=" + left + ",top=" + top);
        if (popup) {
            entryPrompt?.remove(), entryPrompt = null;
            try {
                popup.opener = null, popup.location.replace(url);
            } catch (error) {
                try {
                    popup.close();
                } catch {}
                return void showCallInvitation(service, url);
            }
            vtop.open = !1;
        } else showCallInvitation(service, url);
    }
    let entryPrompt = null;
    function showCallInvitation(service, url) {
        entryPrompt?.remove(), entryPrompt = E("div", {
            className: "board-entry-call",
            role: "dialog",
            ariaLabel: "Звонок этой доски"
        }, E("strong", {
            textContent: "Не удалось открыть отдельное окно звонка."
        }), E("p", {
            textContent: "Можно разрешить всплывающие окна для Aspace и повторить попытку. Если браузер или телефон не поддерживает отдельное окно, открой звонок в новой вкладке."
        }), B("Повторить открытие отдельного окна", () => launchMeeting(service, url), "mbtn"), E("a", {
            className: "mbtn",
            href: url,
            target: "_blank",
            rel: "noopener noreferrer",
            textContent: "Открыть звонок в отдельной вкладке"
        }), B("Остаться на доске", () => {
            entryPrompt?.remove(), entryPrompt = null;
        })), root.append(entryPrompt);
    }
    const defaultCall = E("select", {
        ariaLabel: "Звонок при входе ученика",
        onchange: () => {
            const selected = defaultCall.value, service = meetingServices.find(service => service.field === selected);
            !service || meetingUrl(d[service.field], service) || function(service) {
                const raw = prompt("Вставь ссылку на встречу (" + service.name + "). Чтобы убрать кнопку с доски, оставь поле пустым.", d[service.field] || "");
                if (null === raw) return;
                const url = meetingUrl(raw.trim(), service);
                return raw.trim() && !url ? (say("Вставь прямую ссылку-приглашение (" + service.name + ")."), 
                "") : (d[service.field] = url, url && !d.entryCall && (d.entryCall = service.field), 
                refreshMeetings(), persist(), say(url ? "Ссылка на встречу добавлена." : "Ссылка на встречу убрана."), 
                url);
            }(service) ? (d.entryCall = selected, refreshMeetings(), persist()) : refreshMeetings();
        }
    });
    function entryService() {
        const ready = meetingServices.filter(service => meetingUrl(d[service.field], service));
        return "aspace" === d.entryCall ? null : ready.find(service => service.field === d.entryCall) || ready[0];
    }
    function refreshMeetings() {
        defaultCall.replaceChildren(E("option", {
            value: "aspace",
            textContent: "Aspace"
        }), ...meetingServices.map(service => E("option", {
            value: service.field,
            textContent: service.name + (meetingUrl(d[service.field], service) ? "" : " — добавить ссылку")
        }))), defaultCall.value = entryService()?.field || "aspace";
        for (const service of meetingServices) {
            const url = meetingUrl(d[service.field], service);
            service.section.hidden = !url, service.join.style.display = url ? "inline-flex" : "none";
        }
        updateEmptyVideo();
    }
    const videoOptions = E("div", {
        className: "video-options"
    }), vtop = E("details", {
        className: "vtop board-video"
    }, E("summary", {
        className: "tbtn",
        title: "Видео",
        ariaLabel: "Видео"
    }, ic("video"), "Видео"), videoOptions);
    function publicMeetingUrl(service) {
        const settings = boardCallDestinations.find(item => item.id === shareMeta?.destination);
        return settings?.field === service.field ? meetingUrl(shareMeta.destinationUrl, service) : "";
    }
    videoOptions.append(B("Видеозвонок Aspace", () => {
        vtop.open = !1, openVideo();
    }, "board-call"));
    for (const service of meetingServices) service.section.append(E("b", {
        textContent: service.name
    }), service.join), videoOptions.append(service.section);
    const emptyVideo = E("span", {
        textContent: "Ссылок на встречи пока нет."
    });
    function updateEmptyVideo() {
        emptyVideo.hidden = !root.classList.contains("readonly") || meetingServices.some(service => !!meetingUrl(d[service.field], service));
    }
    videoOptions.append(emptyVideo), vtop.ontoggle = updateEmptyVideo, refreshMeetings(), 
    vtop.querySelector("summary").addEventListener("click", event => {
        if (event.preventDefault(), shareMeta?.destination) {
            const service = meetingServices.find(item => publicMeetingUrl(item));
            return void (service ? launchMeeting(service, publicMeetingUrl(service)) : "aspace" === shareMeta.destination ? openVideo(!0) : say("Ссылка на видеозвонок недоступна. Попроси владельца проверить настройки."));
        }
        const service = entryService();
        service ? launchMeeting(service) : openVideo(!0);
    });
    const mp = E("div", {
        className: "mp"
    }), menuAction = (container, t, fn) => {
        const button = B(t, () => {
            mp.classList.remove("open"), mb.setAttribute("aria-expanded", "false"), fn();
        });
        return container.append(button), button;
    }, mi = (t, fn) => menuAction(mp, t, fn), saveOptions = E("div", {
        className: "menu-suboptions"
    }), saveMenu = E("details", {
        className: "menu-group"
    }, E("summary", {
        textContent: "Сохранить как"
    }), saveOptions), saveFormat = (t, fn) => menuAction(saveOptions, t, fn), followPanel = E("div", {
        className: "card",
        style: "padding:10px;gap:6px"
    }, E("b", {
        textContent: "Участники · навигация"
    }), peerSelect, B("⇢ Подтянуть к себе", () => {
        const id0 = peerSelect.value;
        if (!id0 || !peers[id0]) return say("Участник не найден. Обнови список и выбери его снова.");
        r.emit("bring", {
            to: id0,
            from: r.id,
            name: myName,
            v: myViewport()
        }), say("Отправляю участнику текущую область доски…");
    }), B("◎ Следовать за ним", () => {
        const id0 = peerSelect.value, p = peers[id0];
        return id0 && p ? p.v ? (followId = id0, applyViewport(p.v), void say("Следуешь за " + (p.name || "участником"))) : say("Жду, пока участник передаст своё положение на доске…") : say("Участник не найден. Обнови список и выбери его снова.");
    }), B("↪ Прикрепить ко мне", () => {
        const id0 = peerSelect.value;
        if (!id0 || !peers[id0]) return say("Участник не найден. Обнови список и выбери его снова.");
        r.emit("followme", {
            to: id0,
            from: r.id,
            name: myName,
            v: myViewport()
        }), say("Отправляю запрос: участник будет следовать за тобой");
    }), B("× Остановить следование", () => {
        followId = null, say("Следование остановлено");
    })), mb = E("button", {
        className: "mbtn",
        ariaLabel: "Меню доски",
        ariaExpanded: "false",
        onclick: () => {
            mp.classList.toggle("open"), mb.setAttribute("aria-expanded", String(mp.classList.contains("open")));
        }
    }, ic("menu"), E("span", {
        textContent: d.name
    })), centerBoard = B("Центр доски", () => {
        sc.scrollLeft = Math.max(0, (W * z - sc.clientWidth) / 2), sc.scrollTop = Math.max(0, (parseFloat(wrap.style.height) * z - sc.clientHeight) / 2), 
        queueViewport();
    }, "mbtn center-board"), menu = E("div", {
        className: "menu"
    }, mb, centerBoard, mp), participants = E("details", {
        className: "board-participants"
    }, E("summary", {
        textContent: "Участники"
    }), followPanel), boardActions = E("div", {
        className: "board-actions"
    }, participants, vtop, chat);
    for (const panel of [ participants, vtop, chat ]) panel.addEventListener("toggle", () => {
        if (panel.open) for (const other of [ participants, vtop, chat ]) other !== panel && (other.open = !1);
    });
    refreshPeers();
    let hideCursors = !1, lastCursorSent = 0;
    const cursorNodes = new Map, cursorLayer = E("div", {
        style: "position:absolute;inset:0;pointer-events:none;z-index:15"
    });
    wrap.append(cursorLayer), sc.addEventListener("pointermove", e => {
        if (Date.now() - lastCursorSent < 80) return;
        lastCursorSent = Date.now();
        const rect = wrap.getBoundingClientRect();
        r.emit("cursor", {
            id: r.id,
            name: myName,
            x: (e.clientX - rect.left) / z,
            y: (e.clientY - rect.top) / z
        });
    }), r.on("cursor", event => {
        const p = event.data;
        if (!p || p.id === r.id || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        let node = cursorNodes.get(p.id);
        node || (node = E("span", {
            className: "remote-pointer"
        }), cursorNodes.set(p.id, node), cursorLayer.append(node)), node.textContent = "↖ " + (p.name || "Участник"), 
        node.style.left = p.x + "px", node.style.top = p.y + "px", clearTimeout(node._expiry), 
        node._expiry = setTimeout(() => {
            node.remove(), cursorNodes.delete(p.id);
        }, 5e3);
    }), mp.append(saveMenu), mi("Скрыть / показать курсоры участников", () => {
        hideCursors = !hideCursors, cursorLayer.hidden = hideCursors;
    }), mi("Вписать объекты в экран", () => {
        if (!items.length && !strokes.length) return say("На доске пока нет объектов.");
        const points = items.flatMap(n => [ [ n.x, n.y ], [ n.x + n.w, n.y + n.h ] ]).concat(strokes.flatMap(s => Array.from({
            length: Math.floor((s.p || []).length / 2)
        }, (_, i) => [ s.p[2 * i], s.p[2 * i + 1] ]))), xs = points.map(p => p[0]).filter(Number.isFinite), ys = points.map(p => p[1]).filter(Number.isFinite);
        if (!xs.length || !ys.length) return;
        const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
        setZ(Math.min((sc.clientWidth - 160) / Math.max(1, right - left), (sc.clientHeight - 180) / Math.max(1, bottom - top), 2)), 
        sc.scrollLeft = Math.max(0, left * z - 90), sc.scrollTop = Math.max(0, top * z - 90), 
        queueViewport();
    }), boardTransport && saveFormat("Все версии · JSON", async () => {
        try {
            const versions = await boardTransport.inspect(), url = URL.createObjectURL(new Blob([ JSON.stringify(versions, null, 2) ], {
                type: "application/json"
            }));
            E("a", {
                href: url,
                download: (d.name || "board") + ".versions.json"
            }).click(), setTimeout(() => URL.revokeObjectURL(url), 3e4);
        } catch (error) {
            alert(error.message);
        }
    }), boardTransport && !guest && mi("Разобрать конфликт сохранения", async () => {
        try {
            const versions = await boardTransport.inspect(), describeVersion = value => value ? (value.items || []).length + " объектов, " + (value.strokes || []).length + " штрихов; " + (Number.isFinite(Number(value.upd)) ? new Date(Number(value.upd)).toLocaleString("ru-RU") : "дата неизвестна") : "недоступна", choice = prompt("Выбери общую версию доски. Она заменит другие версии после проверки, что они не изменились. Сначала сохрани все версии через «Сохранить как → Все версии · JSON».\n\n1 — моя локальная версия: " + describeVersion(versions.draft) + "\n2 — Firebase: " + describeVersion(versions.primary?.value) + "\n3 — резерв Cloudflare: " + describeVersion(versions.reserve?.value), "");
            if (![ "1", "2", "3" ].includes(choice)) return;
            const result = await boardTransport.resolve({
                1: "local",
                2: "primary",
                3: "reserve"
            }[choice], versions);
            applySnapshot(result.value), displayedBase = cloneBoard(result.value), unsyncedShareDraft = !1, 
            savedEpoch = editEpoch, say("Конфликт разрешён, версия сохранена.");
        } catch (error) {
            say("Версии сохранены. " + error.message);
        }
    }), saveFormat("JSON · копия доски", () => {
        const blob = new Blob([ JSON.stringify(snapshot(), null, 2) ], {
            type: "application/json"
        }), url = URL.createObjectURL(blob);
        E("a", {
            href: url,
            download: (d.name || "board") + ".aspace.json"
        }).click(), setTimeout(() => URL.revokeObjectURL(url), 3e4);
    }), saveFormat("SVG · векторное изображение", async () => {
        const blob = await makeSvg(), url = URL.createObjectURL(blob);
        E("a", {
            href: url,
            download: (d.name || "board") + ".svg"
        }).click(), setTimeout(() => URL.revokeObjectURL(url), 3e4);
    }), saveFormat("PNG · изображение", async () => {
        const blob = await makeSvg(), url = URL.createObjectURL(blob), im = new Image;
        try {
            await new Promise((ok, no) => {
                im.onload = ok, im.onerror = no, im.src = url;
            });
            const c = E("canvas", {
                width: im.naturalWidth,
                height: im.naturalHeight
            });
            c.getContext("2d").drawImage(im, 0, 0), E("a", {
                href: c.toDataURL("image/png"),
                download: (d.name || "board") + ".png"
            }).click();
        } catch (e) {
            alert("Не удалось создать PNG: " + e.message);
        } finally {
            URL.revokeObjectURL(url);
        }
    }), saveFormat("PDF · печать", async () => {
        const w = window.open("about:blank", "_blank");
        if (w) try {
            const blob = await makeSvg(), url = URL.createObjectURL(blob);
            w.document.open(), w.document.write("<!doctype html><html><head><title>" + xml(d.name || "Доска") + '</title><style>html,body{margin:0}img{width:100%;height:auto;display:block}@page{margin:10mm}</style></head><body><img src="' + url + '" onload="setTimeout(()=>window.print(),300)"></body></html>'), 
            w.document.close();
        } catch (e) {
            w.close(), alert("Не удалось подготовить PDF: " + e.message);
        } else alert("Разрешите всплывающие окна для экспорта PDF");
    }), saveFormat("CSV · текст", () => {
        const csv = "\ufeff" + [ [ "type", "text", "x", "y", "width", "height" ], ...items.filter(n => n.t).map(n => [ n.k, n.t, n.x, n.y, n.w, n.h ]) ].map(r => r.map(v => '"' + String(v ?? "").replace(/\"/g, '""') + '"').join(";")).join("\r\n");
        E("a", {
            href: URL.createObjectURL(new Blob([ csv ], {
                type: "text/csv;charset=utf-8"
            })),
            download: (d.name || "board") + ".csv"
        }).click();
    });
    const topDock = E("div", {
        className: "board-top-dock"
    }, menu, boardActions), bottomDock = E("div", {
        className: "board-bottom-dock"
    }, E("div", {
        className: "board-navigation"
    }, hist, zoom), tbar);
    root.append(topDock, bottomDock, fbar, announcementBox);
    for (const panel of [ participants, vtop, chat ]) panel.addEventListener("toggle", () => {
        panel.open && (mp.classList.remove("open"), mb.setAttribute("aria-expanded", "false"));
    });
    mb.addEventListener("click", () => {
        if (mp.classList.contains("open")) for (const panel of [ participants, vtop, chat ]) panel.open = !1;
    }), renderAnnouncement(), m.append(root);
    const key = e => {
        const t = e.target;
        if (t.isContentEditable || t.closest(".board-access-dialog") || [ "INPUT", "SELECT", "TEXTAREA" ].includes(t.tagName)) return;
        const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
        if (mod && "c" === key && selectedItems.length) copySelected() && e.preventDefault(); else if (mod && "v" === key && copiedBoardItems.length) pasteCopied() && e.preventDefault(); else if (mod && "z" === key) e.preventDefault(), 
        e.shiftKey ? doRedo() : doUndo(); else if (mod && "y" === key) e.preventDefault(), 
        doRedo(); else if ("Delete" !== e.key && "Backspace" !== e.key || !sel) "Escape" === e.key && (mp.classList.remove("open"), 
        mb.setAttribute("aria-expanded", "false"), saveMenu.open = !1, wireSource = null, 
        wireMode = null, wireDrag = null, wirePreview?.remove(), wirePreview = null, say(""), 
        vtop.open = !1, select(null), hidePops(), setTool("select")); else {
            e.preventDefault();
            for (const n of [ ...selectedItems ]) delItem(n);
        }
    };
    document.addEventListener("keydown", key), setTool("select"), fbar.style.display = "none", 
    redraw(), renderAll();
    let polling = !1, pollFailures = 0, pollStopped = !1, lastShareMetaCheck = Date.now();
    const basePollDelay = guest ? 7e3 : 12e3;
    let pollDelay = basePollDelay;
    const pollBoard = async () => {
        if (disposed || pollStopped || polling) return;
        if ("hidden" === document.visibilityState) return clearTimeout(cloudPollTimer), 
        void (cloudPollTimer = setTimeout(() => {
            pollBoard();
        }, 15e3));
        polling = !0;
        const epoch = editEpoch;
        try {
            if (boardShareToken && Date.now() - lastShareMetaCheck >= 3e4) {
                const meta = await shareRead(boardShareToken, "meta");
                shareMeta = meta, lastShareMetaCheck = Date.now(), guest = "editor" !== meta.role, 
                root.classList.toggle("readonly", guest);
            }
            if (!guest && editEpoch !== savedEpoch) return;
            const result = boardTransport ? await boardTransport.read() : boardShareToken ? {
                value: await shareRead(boardShareToken, "board")
            } : null;
            if (!result) return;
            pollFailures = 0, pollDelay = basePollDelay, disposed || !result.value || result.conflict || result.pending || storeBoardView(result.value), 
            !disposed && editEpoch === epoch && result.value && (result.conflict || JSON.stringify(displayedBase) === JSON.stringify(result.value) || (applySnapshot(result.value), 
            displayedBase = cloneBoard(result.value)), unsyncedShareDraft = Boolean(result.pending), 
            result.conflict && say("Firebase и резерв содержат разные правки. Обе версии сохранены."));
        } catch (error) {
            if (boardShareToken && [ 401, 403, 404 ].includes(error.status)) {
                let metaCheckSucceeded = !1, accessMeta = null;
                try {
                    accessMeta = await shareRead(boardShareToken, "meta"), metaCheckSucceeded = !0;
                } catch {}
                !metaCheckSucceeded || accessMeta && accessMeta.boardId === id ? disposed || (pollFailures++, 
                pollDelay = Math.min(basePollDelay * Math.pow(1.7, Math.min(pollFailures, 4)), 3e4), 
                say("Связь временно потеряна. Доска остаётся открытой; повторяем подключение…")) : (pollStopped = !0, 
                guest = !0, clearTimeout(cloudPollTimer), r.close(), call?.stop(), callRoom?.close(), 
                root.replaceChildren(E("div", {
                    className: "gate"
                }, E("div", {
                    className: "box"
                }, E("h2", {
                    textContent: "Доступ к доске закрыт"
                })))));
            } else disposed || (pollFailures++, pollDelay = Math.min(basePollDelay * Math.pow(1.7, Math.min(pollFailures, 4)), 3e4), 
            say("Доска сохранена на устройстве. Повторяем подключение…"));
        } finally {
            polling = !1, disposed || pollStopped || (clearTimeout(cloudPollTimer), cloudPollTimer = setTimeout(() => {
                pollBoard();
            }, pollDelay));
        }
    }, onBoardVisibility = () => {
        "visible" !== document.visibilityState || disposed || pollStopped || (clearTimeout(cloudPollTimer), 
        pollBoard());
    }, onBoardOnline = () => {
        retryFailedBoardMedia(), disposed || pollStopped || (clearTimeout(cloudPollTimer), 
        pollBoard());
    };
    document.addEventListener("visibilitychange", onBoardVisibility), window.addEventListener("online", onBoardOnline), 
    pollBoard(), shareRecoveryTimer = setInterval(retrySharedDraft, 3e3);
    const onSyncStatus = event => {
        event.detail.key !== "boards/" + id || disposed || (syncIndicator.textContent = "conflict" === event.detail.phase ? "⚠ Конфликт — копии сохранены" : {
            firebase: "Firebase",
            cloudflare: "Резерв Cloudflare",
            local: "На устройстве"
        }[event.detail.source] || "Сохранение…");
    }, syncIndicator = E("span", {
        className: "sync-indicator",
        ariaLive: "polite",
        textContent: "Сохранение подключено"
    });
    root.append(syncIndicator), window.addEventListener("aspace-sync-status", onSyncStatus), 
    syncStates.has("boards/" + id) && onSyncStatus({
        detail: syncStates.get("boards/" + id)
    }), localGuestDraft && setTimeout(retrySharedDraft, 500);
    let roomRetry = null, roomAttempts = 0;
    !function connectBoardRoom() {
        disposed || room0.join("b-" + id, boardShareToken ? "/shares/" + encodeURIComponent(boardShareToken) + "/room" : null, void 0).then(channel => {
            r.attach(channel) && (roomWarning = "", chatStatus.textContent = "Чат текущего урока", 
            chatInput.disabled = chatSend.disabled = !1, announce(), r.emit("req", {
                from: r.id
            }), queueViewport());
        }).catch(error => {
            disposed || (roomWarning = String(error.message || error), chatStatus.textContent = "Чат пока недоступен.", 
            say("Восстанавливаем связь с участниками…"), roomRetry = setTimeout(connectBoardRoom, Math.min(3e4, 3e3 * ++roomAttempts)));
        });
    }(), localGuestDraft?.pending && setTimeout(() => say("Восстановлен несинхронизированный черновик этой доски"), 1800), 
    cleanup = () => {
        if (!guest && editEpoch !== savedEpoch) {
            const data = snapshot();
            boardTransport?.write(data, {
                base: displayedBase
            });
        }
        formatObserver.disconnect(), mediaObserver?.disconnect(), window.removeEventListener("online", retryFailedBoardMedia), 
        document.removeEventListener("visibilitychange", onBoardVisibility), window.removeEventListener("online", onBoardOnline), 
        cancelAnimationFrame(formatFrame), window.removeEventListener("resize", queueFormatPosition), 
        clearInterval(sessionTicker);
        for (const node of cursorNodes.values()) clearTimeout(node._expiry);
        disposed = !0, cancelAnimationFrame(wireFrame), document.removeEventListener("keydown", key), 
        window.removeEventListener("aspace-sync-status", onSyncStatus), call && call.stop(), 
        call = null, callRoom?.close(), callRoom = null, clearInterval(presenceTimer), clearTimeout(viewTimer), 
        clearTimeout(roomRetry), r.close && r.close(), clearTimeout(tm), clearInterval(shareRecoveryTimer), 
        clearTimeout(cloudPollTimer), window.removeEventListener("online", retrySharedDraft), 
        document.fullscreenElement && document.exitFullscreen(), activeShareToken = null;
    };
}

(async function() {
    applyTheme();
    const board = location.hash.match(/^#s-([a-f0-9]{48})$/), call = location.hash.match(/^#c-([a-zA-Z0-9_-]{1,120})$/);
    if (board) return go(host => openBoard(host, null, !0, board[1]));
    if (call) try {
        if (!await shareRead(call[1], "meta")) throw Error();
        return go(host => async function(m, id) {
            let externalTarget = "";
            try {
                const routeResponse = await fetch("https://myspace-5d573-default-rtdb.firebaseio.com/shares/" + encodeURIComponent(id) + "/meta.json", {
                    cache: "no-store"
                }), route = routeResponse.ok ? await routeResponse.json() : null;
                if (route?.destination && "aspace" !== route.destination && route.destinationUrl) {
                    const target = new URL(route.destinationUrl), allowed = "telemost" === route.destination ? [ "telemost.yandex.ru", "telemost.360.yandex.ru", "telemost.yandex.com", "telemost.360.yandex.com" ].includes(target.hostname) && /^\/j\/[^/]+\/?$/.test(target.pathname) : "salute" === route.destination && [ "salutejazz.ru", "jazz.sberbank.ru" ].includes(target.hostname) && /^\/(?:calls\/)?(?:sber-)?[a-z0-9]{6,}\/?$/i.test(target.pathname);
                    "https:" !== target.protocol || !allowed || target.username || target.password || target.port || (externalTarget = target.href);
                }
            } catch (error) {
                console.warn("Не удалось прочитать маршрут постоянной ссылки:", error);
            }
            const bar = E("div", {
                className: "tb"
            }), url = ((kind, id) => location.origin + location.pathname + "#c-" + id)(0, id);
            let call = null, callRoom = null, vw = null;
            const close = () => {
                call && (call.stop(), call = null), callRoom && (callRoom.close(), callRoom = null), 
                document.fullscreenElement && vw && document.exitFullscreen().catch(() => {}), vw?.remove(), 
                vw = null, persistentCallSession?.id === id && (persistentCallSession = null);
            }, join = B("Открыть видеозвонок", () => {
                if (externalTarget) {
                    const width = Math.min(480, Math.max(320, window.innerWidth - 24)), height = Math.min(620, Math.max(420, window.innerHeight - 80)), left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2)), top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
                    return void (window.open(externalTarget, "aspace-room-call", "popup=yes,width=" + width + ",height=" + height + ",left=" + left + ",top=" + top + ",resizable=yes") || window.open(externalTarget, "_blank", "noopener") || alert("Браузер заблокировал окно и новую вкладку. Разреши всплывающие окна для Aspace и повтори попытку."));
                }
                if (persistentCallSession) return persistentCallSession.window.classList.remove("min"), 
                void (persistentCallSession.window.style.display = "");
                if (vw) return void vw.classList.remove("min");
                const grid = E("div", {
                    className: "vgrid"
                }), vbar = E("div", {
                    className: "vbar"
                }), hd = E("div", {
                    className: "vh"
                }, E("span", {
                    textContent: "Видеозвонок"
                }));
                vw = E("div", {
                    className: "vwin home-call-window"
                }, hd, grid, vbar);
                const fs = () => document.fullscreenElement ? document.exitFullscreen() : vw.requestFullscreen();
                hd.append(E("span", {
                    className: "row"
                }, E("button", {
                    textContent: "−",
                    title: "Свернуть / развернуть видео",
                    ariaLabel: "Свернуть / развернуть видео",
                    onclick: () => vw.classList.toggle("min")
                }), B("End call", () => {
                    close(), join.disabled = !1, join.textContent = "Открыть видеозвонок";
                }, "end-call")));
                const enterCall = B("Включить камеру и войти", async () => {
                    enterCall.disabled = !0, enterCall.textContent = "Подключаю канал звонка…";
                    try {
                        callRoom = await room0.join("call-" + id, "/shares/" + encodeURIComponent(id) + "/room/call"), 
                        call = Call(callRoom, grid), await call.start(), persistentCallSession = {
                            id: id,
                            call: call,
                            room: callRoom,
                            window: vw
                        }, cleanup = () => {}, callRoom.on("boardnav", msg => {
                            const data = msg.data || {};
                            data.token && /^[a-f0-9]{48}$/.test(data.token) && /^[a-z0-9_-]{1,120}$/i.test(data.boardId || "") && persistentCallSession?.id === id && go(mm => openBoard(mm, null, !0, data.token)).catch(error => say2("Не удалось открыть доску: " + error.message));
                        });
                    } catch (e) {
                        return alert(e.message), call?.stop(), call = null, callRoom?.close(), callRoom = null, 
                        enterCall.disabled = !1, void (enterCall.textContent = "Повторить подключение");
                    }
                    enterCall.remove();
                    let ns = !0;
                    const mic = E("button", {
                        title: "Микрофон",
                        onclick: async () => {
                            try {
                                mic.classList.toggle("off", !await call.mic());
                            } catch (e) {
                                alert(e.message);
                            }
                        }
                    }, ic("mic")), cam = E("button", {
                        title: "Камера",
                        onclick: async () => {
                            try {
                                cam.classList.toggle("off", !await call.cam());
                            } catch (e) {
                                alert(e.message);
                            }
                        }
                    }, ic("video")), nz = B("Шумодав", async () => {
                        ns = !ns, await call.noise(ns), nz.classList.toggle("on", ns);
                    });
                    nz.classList.add("on");
                    const cams = devicePicker(call, "videoinput", "Камера"), mics = devicePicker(call, "audioinput", "Микрофон"), speakers = devicePicker(call, "audiooutput", "Динамик"), zc = call.zoomCaps();
                    zc && vbar.append(E("input", {
                        type: "range",
                        min: zc.min,
                        max: zc.max,
                        step: zc.step || .1,
                        value: zc.min,
                        title: "Приблизить / отдалить камеру",
                        oninput: e => call.zoom(+e.target.value)
                    })), compactCallControls(vbar, mic, cam, nz, cams, mics, speakers, B("⛶", fs), B("Выйти", () => {
                        close(), join.disabled = !1, join.textContent = "Открыть видеозвонок";
                    }));
                });
                grid.append(enterCall), hd.style.touchAction = "none", hd.onpointerdown = e => {
                    if (e.target.closest("button")) return;
                    hd.setPointerCapture(e.pointerId);
                    const b = vw.getBoundingClientRect(), ox = e.clientX - b.left, oy = e.clientY - b.top;
                    vw.style.transform = "none", vw.style.right = "auto", vw.style.left = b.left + "px", 
                    vw.style.top = b.top + "px", hd.onpointermove = ev => {
                        vw.style.left = Math.max(0, Math.min(innerWidth - vw.offsetWidth, ev.clientX - ox)) + "px", 
                        vw.style.top = Math.max(0, Math.min(innerHeight - 48, ev.clientY - oy)) + "px";
                    }, hd.onpointerup = () => {
                        hd.onpointermove = hd.onpointerup = null;
                    };
                }, document.body.append(vw);
            }), copyCallLink = B("🔗 Скопировать ссылку", () => {
                copyLink(url), say2("Ссылка на видеозвонок скопирована");
            }), idle = [ E("b", {
                textContent: "Видеозвонок"
            }), join, copyCallLink ];
            bar.append(...idle), m.append(bar, E("div", {
                className: "mut",
                textContent: "Ссылка для ученика: " + url
            }), E("div", {
                className: "mut",
                textContent: "Окно видеозвонка открывается по центру, его можно перемещать, сворачивать и разворачивать на весь экран."
            })), cleanup = () => {
                persistentCallSession && persistentCallSession.id === id || close();
            };
        }(host, call[1]));
    } catch {
        main().textContent = "Ссылка на звонок недоступна.";
    }
})().catch(() => {
    main().textContent = "Не удалось подключиться. Открой ссылку ещё раз.";
});