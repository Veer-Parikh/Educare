import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Canvas } from "@react-three/fiber";
import { AnimatePresence } from "motion/react";
import * as THREE from "three";
import { CircleQuestionMark, House, MonitorX, Pause, Play, Tag } from "lucide-react";
import { api } from "@/lib/api";
import { useCelebrate, burst } from "@/lib/rewards";
import { Button } from "@/components/ui/button";
import { SpaceScene } from "./space/Scene";
import { BODIES, BY_ID, PLANETS, START_ANGLE, localGuide } from "./space/planets";
import { GuideBar, IconBtn, InfoPanel, IntroScreen, MissionBanner, MissionComplete, PlanetStrip, ProgressMenu, QuizPanel, TitleChip, passScore } from "./space/Panels";

const LOG_KEY = "educare.space.log";

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

/** Per-device exploration log (a convenience, not progress that must persist). */
function loadLog() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY));
    return raw && typeof raw === "object" ? { explored: raw.explored ?? {}, missions: raw.missions ?? 0 } : { explored: {}, missions: 0 };
  } catch {
    return { explored: {}, missions: 0 };
  }
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

function NoWebGL() {
  return (
    <div className="grid h-[calc(100dvh-4rem)] place-items-center bg-[#05060a] px-6 text-center text-white">
      <div className="max-w-sm">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/10">
          <MonitorX className="size-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">3D isn't available on this device</h1>
        <p className="mt-2 text-sm text-white/60">Space Explorer needs WebGL. Try a recent version of Chrome, Edge, Firefox or Safari, or turn on hardware acceleration.</p>
        <Button asChild className="mt-6">
          <Link to="/app">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}

export default function SpacePage() {
  const [webgl] = useState(hasWebGL);
  const celebrate = useCelebrate();
  const desktop = useIsDesktop();

  // Shared mutable scene state (read every frame, never triggers renders).
  const positions = useRef(
    Object.fromEntries(
      BODIES.map((b) => [
        b.id,
        b.id === "sun" ? new THREE.Vector3() : new THREE.Vector3(Math.cos(START_ANGLE[b.id]) * b.orbitRadius, 0, -Math.sin(START_ANGLE[b.id]) * b.orbitRadius),
      ]),
    ),
  );
  const hoverRef = useRef(null);
  const labelRefs = useRef({});

  const [cursor, setCursor] = useState("");
  const [screen, setScreen] = useState("intro"); // intro | playing | complete
  const [started, setStarted] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [panel, setPanel] = useState(null); // info | quiz
  const [round, setRound] = useState(0);
  const [missionId, setMissionId] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [log, setLog] = useState(loadLog);
  const [labelsOn, setLabelsOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [homeNonce, setHomeNonce] = useState(0);
  const [progressOpen, setProgressOpen] = useState(false);
  const [guide, setGuide] = useState({ text: localGuide("intro"), loading: false, ai: false });
  const guideReq = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(log));
    } catch {
      /* ignore */
    }
  }, [log]);

  const askGuide = useCallback(async (kind, target) => {
    const id = ++guideReq.current;
    setGuide((g) => ({ ...g, loading: true }));
    try {
      const { text } = await api.post("/play/guide", { kind, target });
      if (id === guideReq.current) setGuide({ text, loading: false, ai: true });
    } catch {
      if (id === guideReq.current) setGuide({ text: localGuide(kind, target), loading: false, ai: false });
    }
  }, []);

  const select = useCallback(
    (id) => {
      setSelectedId(id);
      setPanel("info");
      setProgressOpen(false);
      setScreen("playing");
      setStarted(true);
      askGuide("planet", BY_ID[id].name);
    },
    [askGuide],
  );

  const closePanel = useCallback(() => {
    setPanel(null);
    setSelectedId(null);
    setHomeNonce((n) => n + 1);
  }, []);

  const explore = () => {
    setScreen("playing");
    setStarted(true);
    if (!started) askGuide("intro");
  };

  const startMission = () => {
    const pool = PLANETS.filter((p) => p.id !== missionId);
    const fresh = pool.filter((p) => !log.explored[p.id]);
    const target = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length ? fresh : pool).length)];
    setMissionId(target.id);
    setScreen("playing");
    setStarted(true);
    setPanel(null);
    setSelectedId(null);
    setHomeNonce((n) => n + 1);
    askGuide("mission", target.name);
  };

  const finishQuiz = async (score, total) => {
    const body = BY_ID[selectedId];
    setLog((l) => {
      const prev = l.explored[body.id];
      return { ...l, explored: { ...l.explored, [body.id]: !prev || score > prev.score ? { score, total } : prev } };
    });
    if (score === total) burst(0.8);
    api
      .post("/activity/game", { game: "space", score, total })
      .then(({ reward }) => celebrate(reward, "Space Explorer"))
      .catch(() => {});

    if (missionId === body.id && score >= passScore(total)) {
      setMissionId(null);
      setLog((l) => ({ ...l, missions: l.missions + 1 }));
      setLastResult({ body, score, total });
      // Let the quiz result register before the celebration screen.
      setTimeout(() => {
        setPanel(null);
        setScreen("complete");
        burst(1.3);
      }, 900);
      askGuide("complete", body.name);
    }
  };

  // Esc closes the topmost layer.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (progressOpen) setProgressOpen(false);
      else if (panel === "quiz") setPanel("info");
      else if (panel) closePanel();
      else if (screen === "intro" && started) setScreen("playing");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, screen, started, progressOpen, closePanel]);

  // Keep the focused body visible beside the side panel / above the bottom sheet.
  const shift = useMemo(() => (panel ? (desktop ? { x: 208, y: 0 } : { x: 0, y: 0.24 }) : { x: 0, y: 0 }), [panel, desktop]);

  if (!webgl) return <NoWebGL />;

  const body = selectedId ? BY_ID[selectedId] : null;
  const exploredCount = PLANETS.filter((p) => log.explored[p.id]).length;
  const mission = missionId ? BY_ID[missionId] : null;

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full select-none overflow-hidden bg-[#05060a] text-white" style={{ cursor: cursor || undefined }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 36, 80], fov: 50, near: 0.1, far: 1200 }} gl={{ antialias: true, powerPreference: "high-performance" }} onPointerMissed={() => panel && closePanel()}>
        <Suspense fallback={null}>
          <SpaceScene
            selectedId={selectedId}
            onSelect={select}
            hoverRef={hoverRef}
            setCursor={setCursor}
            positions={positions}
            paused={paused}
            labelRefs={labelRefs}
            labelsOn={labelsOn}
            missionId={missionId}
            homeNonce={homeNonce}
            autoRotate={screen === "intro"}
            shift={shift}
          />
        </Suspense>
      </Canvas>

      {/* Name labels, positioned every frame by the scene. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {BODIES.map((b) => (
          <span
            key={b.id}
            ref={(el) => {
              labelRefs.current[b.id] = el;
            }}
            className="absolute left-0 top-0 whitespace-nowrap rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity duration-200"
          >
            {b.name}
            {missionId === b.id ? " · target" : ""}
          </span>
        ))}
      </div>

      {/* Top HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <div className="hidden sm:block">
            <TitleChip />
          </div>
          {mission ? <MissionBanner body={mission} onLocate={() => select(mission.id)} onAbandon={() => setMissionId(null)} /> : null}
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
          <ProgressMenu explored={log.explored} missions={log.missions} open={progressOpen} onOpenChange={setProgressOpen} onSelect={select} />
          <IconBtn label={labelsOn ? "Hide labels" : "Show labels"} pressed={labelsOn} onClick={() => setLabelsOn((v) => !v)}>
            <Tag />
          </IconBtn>
          <IconBtn label={paused ? "Resume orbits" : "Pause orbits"} pressed={paused} onClick={() => setPaused((v) => !v)}>
            {paused ? <Play /> : <Pause />}
          </IconBtn>
          <IconBtn label="Overview" onClick={closePanel} className="hidden sm:inline-flex">
            <House />
          </IconBtn>
          <IconBtn label="How to play" onClick={() => setScreen("intro")}>
            <CircleQuestionMark />
          </IconBtn>
        </div>
      </div>

      {/* Bottom HUD (hidden behind the mobile bottom sheet) */}
      {screen === "playing" && (desktop || !panel) ? (
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-start gap-2 p-3 ${panel ? "md:pr-104" : ""}`}>
          <GuideBar {...guide} onMore={body ? () => askGuide("planet", body.name) : undefined} />
          <PlanetStrip selectedId={selectedId} explored={log.explored} missionId={missionId} onSelect={select} />
        </div>
      ) : null}

      <AnimatePresence>
        {panel === "info" && body ? (
          <InfoPanel
            key={`info-${body.id}`}
            body={body}
            best={log.explored[body.id]}
            isTarget={missionId === body.id}
            guide={{ ...guide, onMore: () => askGuide("planet", body.name) }}
            onQuiz={() => {
              setRound((r) => r + 1);
              setPanel("quiz");
            }}
            onClose={closePanel}
          />
        ) : null}
        {panel === "quiz" && body ? (
          <QuizPanel
            key={`quiz-${body.id}-${round}`}
            body={body}
            round={round}
            isTarget={missionId === body.id}
            onBack={() => setPanel("info")}
            onClose={closePanel}
            onFinish={finishQuiz}
            onRetake={() => setRound((r) => r + 1)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {screen === "intro" ? <IntroScreen key="intro" exploredCount={exploredCount} started={started} onExplore={explore} onMission={startMission} onClose={() => setScreen("playing")} /> : null}
        {screen === "complete" && lastResult ? (
          <MissionComplete
            key="complete"
            body={lastResult.body}
            result={lastResult}
            guide={guide}
            exploredCount={exploredCount}
            onMission={startMission}
            onExplore={() => {
              setScreen("playing");
              closePanel();
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
