"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Player from "@vimeo/player";
import type { VideoSource } from "@/lib/course-logic";
import { markLessonComplete, markLessonIncomplete } from "@/app/actions/player";
import { Icon } from "@/components/site/Icon";
import { QuestionsPanel, type QuestionItem } from "@/components/player/QuestionsPanel";
import { NotesPanel, type NoteItem } from "@/components/player/NotesPanel";
import { SuggestionsPanel } from "@/components/player/SuggestionsPanel";
import type { SuggestionItem } from "@/lib/suggestions";

type Props = {
  courseId: number;
  lesson: { id: number; title: string; description: string; video: VideoSource };
  done: boolean;
  preview: boolean;
  nextUrl: string | null;
  nextLocked?: boolean;
  prevUrl: string | null;
  questions: QuestionItem[];
  userName: string;
  notes?: NoteItem[];
  suggestions?: SuggestionItem[];
  startAt?: number | null;
};

/**
 * Video sahnesi: HTML5 dosya videoları için özel kontroller (ileri sarma kapalı, %90'da otomatik tamamlama,
 * kaldığı yerden devam). YouTube/Vimeo için iframe + "Tamamlandı" butonu (embed API'siz).
 */
export function VideoStage({ courseId, lesson, done, preview, nextUrl, nextLocked = false, prevUrl, questions, userName, notes = [], suggestions = [], startAt = null }: Props) {
  const timeRef = useRef(0);
  const [lockWarn, setLockWarn] = useState(false);
  const router = useRouter();
  const [isDone, setIsDone] = useState(done);
  const [tab, setTab] = useState<"notlar" | "sorular" | "oneri">("notlar");
  const [countdown, setCountdown] = useState<number | null>(null);
  const posKey = `fabo_pos_${courseId}_${lesson.id}`;

  const complete = useCallback(async () => {
    if (isDone || preview) return;
    setIsDone(true);
    await markLessonComplete(courseId, lesson.id);
    router.refresh();
  }, [isDone, preview, courseId, lesson.id, router]);

  // force: video bitince ders tamamlandığı için kilit kalkar, sayaç yine de başlar
  const startCountdown = useCallback((force = false) => {
    if (!nextUrl || (nextLocked && !force)) return;
    setCountdown(3);
  }, [nextUrl, nextLocked]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) { router.push(nextUrl!); return; }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, nextUrl, router]);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-[#0c1a2e]">
        {lesson.video.type === "file" ? (
          <FileVideo key={`${lesson.id}-${startAt ?? ""}`} src={lesson.video.url} posKey={posKey} unlocked={isDone || preview} timeRef={timeRef} startAt={startAt} onComplete={complete} onEnded={async () => { await complete(); startCountdown(true); }} />
        ) : lesson.video.type === "vimeo" ? (
          <VimeoVideo key={`${lesson.id}-${startAt ?? ""}`} videoId={lesson.video.id} posKey={posKey} unlocked={isDone || preview} timeRef={timeRef} startAt={startAt} onComplete={complete} onEnded={async () => { await complete(); startCountdown(true); }} />
        ) : lesson.video.type === "none" ? (
          <div className="flex aspect-video items-center justify-center text-[#fff]/60">Video eklenmemiş</div>
        ) : (
          <iframe src={lesson.video.embed} className="aspect-video w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={lesson.title} />
        )}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-navy-900/70">
            <div className="rounded-2xl bg-white p-6 text-center">
              <p className="text-sm text-muted">Sıradaki içeriğe geçiliyor</p>
              <p className="my-2 text-5xl font-bold text-navy-800">{countdown}</p>
              <button onClick={() => setCountdown(null)} className="btn-secondary btn-sm">İptal</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-navy-800">{lesson.title}</h1>
        <div className="flex gap-2">
          {prevUrl && <Link href={prevUrl} className="btn-secondary btn-sm"><Icon name="arrowLeft" className="size-4" /> Önceki</Link>}
          {nextUrl && !nextLocked && !isDone && lesson.video.type === "file" ? (
            <span className="relative">
              {lockWarn && <span className="absolute -top-10 right-0 whitespace-nowrap rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#0b1220] shadow-lg">Henüz sonraki dersin kilidi açık değil<span className="absolute right-4 top-full border-4 border-transparent border-t-amber-400" /></span>}
              <button onClick={() => { setLockWarn(true); setTimeout(() => setLockWarn(false), 2200); }} className="btn-primary btn-sm opacity-70">Sonraki <Icon name="lock" className="size-4" /></button>
            </span>
          ) : nextUrl && !nextLocked ? (
            <Link href={nextUrl} className="btn-primary btn-sm">Sonraki <Icon name="arrowRight" className="size-4" /></Link>
          ) : nextUrl ? (
            <span className="relative">
              {lockWarn && <span className="absolute -top-10 right-0 whitespace-nowrap rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#0b1220] shadow-lg">Henüz sonraki dersin kilidi açık değil<span className="absolute right-4 top-full border-4 border-transparent border-t-amber-400" /></span>}
              <button onClick={() => { setLockWarn(true); setTimeout(() => setLockWarn(false), 2200); }} className="btn-primary btn-sm opacity-70">Sonraki <Icon name="lock" className="size-4" /></button>
            </span>
          ) : (
            <button disabled className="btn-primary btn-sm">Sonraki</button>
          )}
        </div>
      </div>

      <div className="card p-0">
        <div className="flex border-b border-line">
          {(["notlar", "sorular", "oneri"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-5 py-3 text-sm font-semibold ${tab === t ? "border-b-2 border-navy-800 text-navy-800" : "text-muted"}`}>
              {t === "notlar"
                ? `Notlar${notes.length ? ` (${notes.length})` : ""}`
                : t === "sorular"
                  ? questions.length ? `Yazışmalar (${questions.length})` : "Eğitmenine yaz"
                  : `Öneriler${suggestions.length ? ` (${suggestions.length})` : ""}`}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === "notlar" ? (
            <div className="space-y-4">
              <NotesPanel courseId={courseId} lessonId={lesson.id} lessonTitle={lesson.title} notes={notes} getTime={() => timeRef.current} description={lesson.description || undefined} canTimestamp={lesson.video.type === "file" || lesson.video.type === "vimeo"} />
              <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ${isDone ? "bg-emerald-50" : "bg-surface"}`}>
                <p className="text-sm">
                  {isDone ? <span className="font-semibold text-emerald-700">✓ Bu ders tamamlandı</span> : lesson.video.type === "file" || lesson.video.type === "vimeo" ? <span className="text-muted">Ders, video sonuna kadar izlenince otomatik tamamlanır.</span> : <span className="text-muted">Videoyu izledikten sonra tamamlandı olarak işaretle.</span>}
                </p>
                {preview ? (
                  <span className="text-xs text-muted">Önizleme</span>
                ) : lesson.video.type !== "file" && lesson.video.type !== "vimeo" && !isDone ? (
                  <button onClick={async () => { await complete(); startCountdown(); }} className="btn-primary btn-sm"><Icon name="check" className="size-4" /> Tamamlandı olarak işaretle</button>
                ) : null}
              </div>
            </div>
          ) : tab === "sorular" ? (
            <QuestionsPanel courseId={courseId} lessonId={lesson.id} lessonTitle={lesson.title} items={questions} userName={userName} />
          ) : (
            <SuggestionsPanel courseId={courseId} items={suggestions} preview={preview} />
          )}
        </div>
      </div>
    </div>
  );
}

function fmt(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function FileVideo({ src, posKey, unlocked, onComplete, onEnded, timeRef, startAt }: { src: string; posKey: string; unlocked: boolean; onComplete: () => void; onEnded: () => void; timeRef: React.MutableRefObject<number>; startAt: number | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const watchedMax = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [d, setD] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [maxT, setMaxT] = useState(0); // izlenen en ileri nokta (sarı alan)
  const [warn, setWarn] = useState(false);
  const completedRef = useRef(false);
  const metaDone = useRef(false);
  // Callback'ler ref'te tutulur; böylece her render'da effect yeniden kurulup video takılmaz
  const cbs = useRef({ onComplete, onEnded });
  cbs.current = { onComplete, onEnded };

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Ders tamamlanınca (unlocked) tüm çubuk serbest kalsın
    if (unlocked && v.duration) { watchedMax.current = v.duration; setMaxT(v.duration); }
    const onMeta = () => {
      if (metaDone.current) return;
      metaDone.current = true;
      setD(v.duration);
      try {
        const p = parseFloat(localStorage.getItem(posKey) ?? "0");
        if (p > 5 && p < v.duration - 5) { v.currentTime = p; watchedMax.current = p; setMaxT(p); }
      } catch {}
      if (unlocked) { watchedMax.current = v.duration; setMaxT(v.duration); }
      // Nottan gelindiyse o saniyeye git (izlenmiş bölge içinde kalır)
      if (startAt != null && startAt >= 0 && startAt < v.duration) {
        const target = unlocked ? startAt : Math.min(startAt, watchedMax.current);
        v.currentTime = target;
      }
    };
    const onTime = () => {
      setT(v.currentTime);
      timeRef.current = v.currentTime;
      if (v.currentTime > watchedMax.current) { watchedMax.current = v.currentTime; setMaxT(v.currentTime); }
      try { localStorage.setItem(posKey, String(v.currentTime)); } catch {}
      if (!completedRef.current && v.duration && v.currentTime / v.duration >= 0.98) { completedRef.current = true; cbs.current.onComplete(); }
    };
    const onSeeking = () => {
      if (!unlocked && v.currentTime > watchedMax.current + 0.5) v.currentTime = watchedMax.current;
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { completedRef.current = true; cbs.current.onEnded(); };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeking", onSeeking);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnd);
    if (v.readyState >= 1) onMeta();
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeking", onSeeking);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnd);
    };
  }, [posKey, unlocked, timeRef, startAt]);

  const v = () => ref.current!;
  const seekTo = (s: number) => {
    if (!unlocked && s > watchedMax.current + 0.5) {
      setWarn(true);
      setTimeout(() => setWarn(false), 2200);
    }
    v().currentTime = unlocked ? s : Math.min(s, watchedMax.current);
  };
  const barClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - r.left) / r.width) * (d || 0));
  };

  return (
    <div ref={wrap} className="group relative">
      <video ref={ref} src={src} className="aspect-video w-full" playsInline onClick={() => (playing ? v().pause() : v().play().catch(() => {}))} controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} />
      {!playing && (
        <button onClick={() => v().play().catch(() => {})} className="absolute inset-0 flex items-center justify-center" aria-label="Oynat">
          <span className="flex size-20 items-center justify-center rounded-full bg-[#fff]/20 text-[#fff] backdrop-blur"><Icon name="play" className="size-10" /></span>
        </button>
      )}
      {!unlocked && <span className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-[#fff]">İleri sarma kapalı</span>}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-[#fff]">
        <div className="relative">
          {warn && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#0b1220] shadow-lg">
              İzlemediğiniz yerleri ileri saramazsınız!
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-amber-400" />
            </div>
          )}
          <div onClick={barClick} className="group/bar relative h-1.5 w-full cursor-pointer rounded-full bg-[#fff]/25" role="slider" aria-valuemin={0} aria-valuemax={d || 0} aria-valuenow={t}>
            {/* izlenen (sarı) */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-amber-400/80" style={{ width: `${d ? Math.min(100, (maxT / d) * 100) : 0}%` }} />
            {/* mevcut konum (mavi) */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-sky-400" style={{ width: `${d ? (t / d) * 100 : 0}%` }} />
            <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fff] shadow" style={{ left: `${d ? (t / d) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <button onClick={() => (playing ? v().pause() : v().play().catch(() => {}))} className="rounded p-1 hover:bg-[#fff]/20"><Icon name={playing ? "pause" : "play"} className="size-5" /></button>
          <button onClick={() => seekTo(Math.max(0, t - 10))} className="rounded px-1.5 py-1 hover:bg-[#fff]/20">−10s</button>
          <button onClick={() => seekTo(t + 10)} className="rounded px-1.5 py-1 hover:bg-[#fff]/20">+10s</button>
          <span className="tabular-nums">{fmt(t)} / {fmt(d)}</span>
          <div className="ml-auto flex items-center gap-1">
            {[1, 1.5, 2].map((r) => (
              <button key={r} onClick={() => { v().playbackRate = r; setRate(r); }} className={`rounded px-1.5 py-0.5 ${rate === r ? "bg-sky-400 text-navy-900" : "hover:bg-[#fff]/20"}`}>{r}x</button>
            ))}
            <button onClick={() => { v().muted = !muted; setMuted(!muted); }} className="rounded p-1 hover:bg-[#fff]/20"><Icon name="volume" className={`size-5 ${muted ? "opacity-40" : ""}`} /></button>
            <button onClick={() => wrap.current?.requestFullscreen?.()} className="rounded p-1 hover:bg-[#fff]/20"><Icon name="expand" className="size-5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Vimeo oynatıcı: dosya videolarındaki kurallar Vimeo Player SDK ile uygulanır.
 * - Durdur/oynat, ses, tam ekran, hız → Vimeo'nun kendi kontrolleri.
 * - İleri sarma kapalı (izlenen en ileri noktadan öteye atlayınca geri alınır); geri sarma serbest.
 * - Not alırken anlık video saniyesi (timeRef) güncel tutulur.
 * - Kaldığı yerden devam (localStorage) ve nottan gelince ilgili saniyeye gitme.
 * - %98'e ulaşınca veya video bitince otomatik tamamlanır; bitince sonraki içeriğe geçiş sayacı başlar.
 * unlocked (ders tamamlandı ya da önizleme) durumunda tüm çubuk serbesttir.
 */
function VimeoVideo({ videoId, posKey, unlocked, onComplete, onEnded, timeRef, startAt }: { videoId: string; posKey: string; unlocked: boolean; onComplete: () => void; onEnded: () => void; timeRef: React.MutableRefObject<number>; startAt: number | null }) {
  const holder = useRef<HTMLDivElement>(null);
  const watchedMax = useRef(0);
  const durationRef = useRef(0);
  const completedRef = useRef(false);
  const endedRef = useRef(false);
  const [warn, setWarn] = useState(false);
  const cbs = useRef({ onComplete, onEnded });
  cbs.current = { onComplete, onEnded };

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    // StrictMode / yeniden mount'ta kalan iframe'leri temizle ki tek ve kontrol edilebilir bir player olsun
    el.replaceChildren();
    watchedMax.current = 0;
    durationRef.current = 0;
    completedRef.current = false;
    endedRef.current = false;

    const player = new Player(el, {
      id: Number(videoId),
      title: false,
      byline: false,
      portrait: false,
      keyboard: false, // ok tuşlarıyla ileri sarmayı engelle
      pip: false,
      playsinline: true,
    });
    let disposed = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    let seeking = false;

    const flashWarn = () => { setWarn(true); setTimeout(() => setWarn(false), 2000); };
    const seekBack = (t: number) => {
      seeking = true;
      player.setCurrentTime(t).catch(() => {}).then(() => { seeking = false; });
    };

    // Tek doğruluk kaynağı: mevcut saniyeyi işle — ileri sarmayı engelle, notlar için timeRef'i güncelle,
    // %95'te tamamla, sona gelince sonraki içeriğe geç. Hem yoklama hem timeupdate buraya besler.
    const track = (cur: number) => {
      if (disposed || seeking || !Number.isFinite(cur)) return;
      if (!unlocked && cur > watchedMax.current + 1.5) {
        seekBack(watchedMax.current);
        flashWarn();
        return;
      }
      timeRef.current = cur;
      if (cur > watchedMax.current) watchedMax.current = cur;
      try { localStorage.setItem(posKey, String(cur)); } catch {}
      const dur = durationRef.current;
      if (dur > 0) {
        if (!completedRef.current && cur / dur >= 0.95) { completedRef.current = true; cbs.current.onComplete(); }
        if (!endedRef.current && cur >= dur - 1.2) { endedRef.current = true; completedRef.current = true; cbs.current.onEnded(); }
      }
    };

    player.ready().then(async () => {
      if (disposed) return;
      try {
        const d = await player.getDuration();
        durationRef.current = d || 0;
        if (unlocked) {
          watchedMax.current = d;
          if (startAt != null && startAt >= 0 && startAt < d) await player.setCurrentTime(startAt).catch(() => {});
        } else {
          let resume = 0;
          try { resume = parseFloat(localStorage.getItem(posKey) ?? "0"); } catch {}
          const target = startAt != null && startAt >= 0 ? startAt : resume;
          if (target > 5 && target < d - 5) { watchedMax.current = target; await player.setCurrentTime(target).catch(() => {}); }
        }
      } catch {}
      // Yoklama: SDK olayları tetiklenmese bile zaman takibi ve ileri sarma engeli garanti çalışsın
      poll = setInterval(async () => {
        if (disposed || seeking) return;
        try {
          if (durationRef.current === 0) { const d = await player.getDuration(); if (d) durationRef.current = d; }
          track(await player.getCurrentTime());
        } catch {}
      }, 350);
    });

    player.on("timeupdate", (data: { seconds: number }) => track(data.seconds));
    player.on("ended", () => {
      if (endedRef.current) return;
      endedRef.current = true; completedRef.current = true;
      cbs.current.onEnded();
    });

    return () => {
      disposed = true;
      if (poll) clearInterval(poll);
      player.destroy().catch(() => {});
    };
  }, [videoId, posKey, unlocked, timeRef, startAt]);

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black [&>div]:size-full [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:size-full">
      <div ref={holder} className="size-full" />
      {!unlocked && <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-[#fff]">İleri sarma kapalı</span>}
      {warn && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#0b1220] shadow-lg">
          İzlemediğiniz yerleri ileri saramazsınız!
        </div>
      )}
    </div>
  );
}
